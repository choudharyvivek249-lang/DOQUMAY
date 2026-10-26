import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countAccounts, getUser, loginUser, registerUser } from '../accounts.js';

test('accounts: registration, unique usernames, and login', async () => {
  const r = Math.random().toString(36).slice(2, 7);
  const alice = `alice_${r}`;
  const bob = `bob_${r}`;
  const pinUser = `pin_user_${r}`;

  // 1. Valid registration
  const reg1 = await registerUser(alice, 'secret123');
  assert.equal(reg1.ok, true);
  assert.equal(reg1.user.username, alice);

  // 2. Duplicate username rejection (case-insensitive)
  const regDup = await registerUser(alice.toUpperCase(), 'anotherpass');
  assert.equal(regDup.ok, false);
  assert.match(regDup.error, /already taken/i);

  // 3. Short password rejection
  const regShort = await registerUser(bob, '12');
  assert.equal(regShort.ok, false);

  // 4. Invalid username characters
  const regChars = await registerUser(`${bob} test!`, 'secret123');
  assert.equal(regChars.ok, false);

  // 5. Successful login
  const loginSuccess = await loginUser(alice, 'secret123');
  assert.equal(loginSuccess.ok, true);
  assert.ok(loginSuccess.user.token);

  // 6. Failed login (wrong password)
  const loginWrong = await loginUser(alice, 'wrongpassword');
  assert.equal(loginWrong.ok, false);

  // 7. Non-existent user login
  const loginNonExistent = await loginUser(`ghost_${r}`, 'anypassword');
  assert.equal(loginNonExistent.ok, false);

  // 8. 4-digit PIN registration and verification
  const regPin = await registerUser(pinUser, 'secret123', '4321');
  assert.equal(regPin.ok, true);
  assert.equal(regPin.user.pin, undefined); // Never return plaintext PIN!

  const loginPinWrong = await loginUser(pinUser, 'secret123', '9999');
  assert.equal(loginPinWrong.ok, false);
  assert.match(loginPinWrong.error, /incorrect 4-digit/i);

  const loginPinCorrect = await loginUser(pinUser, 'secret123', '4321');
  assert.equal(loginPinCorrect.ok, true);
  assert.equal(loginPinCorrect.user.pin, undefined); // Never return plaintext PIN!

  // 9. Public user lookup
  const pub = getUser(alice);
  assert.equal(pub.username, alice);
  assert.equal(pub.salt, undefined); // salt must not be exposed
  assert.equal(pub.hash, undefined); // hash must not be exposed

  console.log('  ✓ accounts, uniqueness, password, and 4-digit PIN validation passed');
});

