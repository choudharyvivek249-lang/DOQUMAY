import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  changePin,
  consumeSendAuthorization,
  getUser,
  loginUser,
  recoverPinWithPassword,
  registerUser,
  validatePin,
  verifySendPin,
} from '../accounts.js';

test('Send PIN: strict 4-digit numeric validation & leading zeroes', () => {
  // Valid 4-digit PINs including leading zeroes
  assert.equal(validatePin('0427'), null);
  assert.equal(validatePin('0000'), null);
  assert.equal(validatePin('0001'), null);
  assert.equal(validatePin('9999'), null);
  assert.equal(validatePin('1234'), null);

  // Invalid PINs
  assert.match(validatePin(''), /4 numeric digits/i);
  assert.match(validatePin('123'), /4 numeric digits/i);
  assert.match(validatePin('12345'), /4 numeric digits/i);
  assert.match(validatePin('123456'), /4 numeric digits/i);
  assert.match(validatePin('abcd'), /4 numeric digits/i);
  assert.match(validatePin('042a'), /4 numeric digits/i);
  assert.match(validatePin(null), /4-digit Send PIN is required/i);
});

test('Send PIN: first-time setup, confirmation, and security guarantees', async () => {
  // 1. PIN confirmation mismatch fails
  const mismatch = await registerUser('mismatch_user', 'pass123', '0427', '0428');
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error, /confirmation does not match/i);

  // 2. Successful registration with leading-zero PIN '0427'
  const reg = await registerUser('lead_zero_user', 'pass123', '0427', '0427', 'Lead Zero User');
  assert.equal(reg.ok, true);
  assert.equal(reg.user.username, 'lead_zero_user');
  assert.ok(reg.user.token);

  // 3. Plaintext PIN must NEVER be returned in response!
  assert.equal(reg.user.pin, undefined);
  assert.equal(reg.user.pinHash, undefined);
  assert.equal(reg.user.hash, undefined);
  assert.equal(reg.user.salt, undefined);

  // 4. Public profile check: no sensitive credential leaks
  const pub = getUser('lead_zero_user');
  assert.equal(pub.username, 'lead_zero_user');
  assert.equal(pub.displayName, 'Lead Zero User');
  assert.equal(pub.pin, undefined);
  assert.equal(pub.pinHash, undefined);
  assert.equal(pub.hash, undefined);
  assert.equal(pub.salt, undefined);

  // 5. Subsequent login preserves existing PIN; never silently resets or replaces it
  const login = await loginUser('lead_zero_user', 'pass123');
  assert.equal(login.ok, true);
  assert.equal(login.user.pin, undefined); // no plaintext PIN

  // Verify PIN is still '0427' and was preserved
  const verifyPreserved = await verifySendPin('lead_zero_user', login.user.token, '0427', {
    recipient: 'bob_receiver',
    fileCount: 1,
  });
  assert.equal(verifyPreserved.ok, true);
  assert.ok(verifyPreserved.sendAuthToken);
});

test('Send PIN: rate limiting, progressive delays, and lockout', async () => {
  const reg = await registerUser('rate_limit_user', 'pass123', '7890', '7890');
  assert.equal(reg.ok, true);
  const token = reg.user.token;

  // Attempts 1 to 4: Incorrect PINs decrement attemptsLeft
  for (let i = 1; i <= 4; i++) {
    const res = await verifySendPin('rate_limit_user', token, '0000', {
      recipient: 'bob',
      fileCount: 1,
      ip: '127.0.0.99',
    });
    assert.equal(res.ok, false);
    assert.equal(res.locked, false || undefined);
    assert.match(res.error, /incorrect 4-digit Send PIN/i);
  }

  // 5th attempt: triggers 5-minute lockout
  const fifthAttempt = await verifySendPin('rate_limit_user', token, '0000', {
    recipient: 'bob',
    fileCount: 1,
    ip: '127.0.0.99',
  });
  assert.equal(fifthAttempt.ok, false);
  assert.equal(fifthAttempt.locked, true);
  assert.match(fifthAttempt.error, /locked/i);

  // Subsequent attempt while locked out is immediately rejected even with correct PIN
  const lockedAttempt = await verifySendPin('rate_limit_user', token, '7890', {
    recipient: 'bob',
    fileCount: 1,
    ip: '127.0.0.99',
  });
  assert.equal(lockedAttempt.ok, false);
  assert.equal(lockedAttempt.locked, true);
  assert.match(lockedAttempt.error, /locked/i);
});

test('Send Authorization: single-use binding, recipient check, and batch consumption', async () => {
  const senderReg = await registerUser('batch_sender', 'pass123', '1357', '1357');
  assert.equal(senderReg.ok, true);

  // Authorize batch of 2 files to recipient 'alice'
  const authRes = await verifySendPin('batch_sender', senderReg.user.token, '1357', {
    recipient: 'alice',
    fileCount: 2,
    batchId: 'batch-test-123',
  });
  assert.equal(authRes.ok, true);
  const sendToken = authRes.sendAuthToken;
  assert.ok(sendToken);

  // 1. Consume file 1 of 2 for 'alice': should succeed
  const consume1 = consumeSendAuthorization(sendToken, {
    username: 'batch_sender',
    recipient: 'alice',
  });
  assert.equal(consume1.ok, true);

  // 2. Consume for wrong recipient 'mallory': should fail
  const wrongRecipient = consumeSendAuthorization(sendToken, {
    username: 'batch_sender',
    recipient: 'mallory',
  });
  assert.equal(wrongRecipient.ok, false);
  assert.match(wrongRecipient.error, /recipient mismatch/i);

  // 3. Consume for wrong sender 'mallory': should fail
  const wrongSender = consumeSendAuthorization(sendToken, {
    username: 'mallory',
    recipient: 'alice',
  });
  assert.equal(wrongSender.ok, false);
  assert.match(wrongSender.error, /user mismatch/i);

  // 4. Consume file 2 of 2 for 'alice': should succeed and exhaust the token
  const consume2 = consumeSendAuthorization(sendToken, {
    username: 'batch_sender',
    recipient: 'alice',
  });
  assert.equal(consume2.ok, true);

  // 5. Attempting to reuse the exhausted authorization token fails!
  const reuseAttempt = consumeSendAuthorization(sendToken, {
    username: 'batch_sender',
    recipient: 'alice',
  });
  assert.equal(reuseAttempt.ok, false);
  assert.match(reuseAttempt.error, /not found or already consumed/i);
});

test('Send PIN: authenticated change and password recovery flows', async () => {
  const reg = await registerUser('pin_change_user', 'mysecretpass', '1111', '1111');
  assert.equal(reg.ok, true);
  const token = reg.user.token;

  // Change PIN with wrong current credential fails
  const badChange = await changePin('pin_change_user', token, 'wrongpass', '2222', '2222');
  assert.equal(badChange.ok, false);
  assert.match(badChange.error, /incorrect/i);

  // Change PIN with correct current PIN succeeds
  const goodChange = await changePin('pin_change_user', token, '1111', '2222', '2222');
  assert.equal(goodChange.ok, true);

  // Old PIN no longer works
  const oldPinCheck = await verifySendPin('pin_change_user', token, '1111', { recipient: 'anyone' });
  assert.equal(oldPinCheck.ok, false);

  // New PIN works
  const newPinCheck = await verifySendPin('pin_change_user', token, '2222', { recipient: 'anyone' });
  assert.equal(newPinCheck.ok, true);

  // Recover PIN using account password
  const recover = await recoverPinWithPassword('pin_change_user', 'mysecretpass', '0427', '0427');
  assert.equal(recover.ok, true);

  // Recovered PIN (0427) works
  const recoveredCheck = await verifySendPin('pin_change_user', token, '0427', { recipient: 'anyone' });
  assert.equal(recoveredCheck.ok, true);
});
