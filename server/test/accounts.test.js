import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countAccounts, getUser, loginUser, registerUser } from '../accounts.js';

test('accounts: registration, unique usernames, and login', async () => {
  const initialCount = countAccounts();

  // 1. Valid registration
  const reg1 = await registerUser('alice_test', 'secret123');
  assert.equal(reg1.ok, true);
  assert.equal(reg1.user.username, 'alice_test');

  // 2. Duplicate username rejection (case-insensitive)
  const regDup = await registerUser('ALICE_TEST', 'anotherpass');
  assert.equal(regDup.ok, false);
  assert.match(regDup.error, /already taken/i);

  // 3. Short password rejection
  const regShort = await registerUser('bob_test', '12');
  assert.equal(regShort.ok, false);

  // 4. Invalid username characters
  const regChars = await registerUser('bob test!', 'secret123');
  assert.equal(regChars.ok, false);

  // 5. Successful login
  const loginSuccess = await loginUser('alice_test', 'secret123');
  assert.equal(loginSuccess.ok, true);
  assert.ok(loginSuccess.user.token);

  // 6. Failed login (wrong password)
  const loginWrong = await loginUser('alice_test', 'wrongpassword');
  assert.equal(loginWrong.ok, false);

  // 7. Non-existent user login
  const loginNonExistent = await loginUser('ghost_user_123', 'anypassword');
  assert.equal(loginNonExistent.ok, false);

  // 8. 4-digit PIN registration and verification
  const regPin = await registerUser('pin_user_test', 'secret123', '4321');
  assert.equal(regPin.ok, true);
  assert.equal(regPin.user.pin, '4321');

  const loginPinWrong = await loginUser('pin_user_test', 'secret123', '9999');
  assert.equal(loginPinWrong.ok, false);
  assert.match(loginPinWrong.error, /incorrect 4-digit/i);

  const loginPinCorrect = await loginUser('pin_user_test', 'secret123', '4321');
  assert.equal(loginPinCorrect.ok, true);
  assert.equal(loginPinCorrect.user.pin, '4321');

  // 9. Public user lookup
  const pub = getUser('alice_test');
  assert.equal(pub.username, 'alice_test');
  assert.equal(pub.salt, undefined); // salt must not be exposed
  assert.equal(pub.hash, undefined); // hash must not be exposed

  console.log('  ✓ accounts, uniqueness, password, and 4-digit PIN validation passed');
});
