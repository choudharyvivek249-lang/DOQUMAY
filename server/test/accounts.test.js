import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countAccounts, getUser, loginUser, registerUser } from '../accounts.js';

test('accounts: registration, unique usernames, and login', async () => {
  const r = Math.random().toString(36).slice(2, 7);
  const alice = `alice_${r}`;
  const bob = `bob_${r}`;

  // 1. Valid registration
  const reg1 = await registerUser(alice, 'secret123');
  assert.equal(reg1.ok, true);
  assert.equal(reg1.user.username, alice);
  assert.ok(reg1.user.token);

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

  // 8. Public user lookup (no sensitive hashes exposed)
  const pub = getUser(alice);
  assert.equal(pub.username, alice);
  assert.equal(pub.salt, undefined); // salt must not be exposed
  assert.equal(pub.hash, undefined); // hash must not be exposed

  console.log('  ✓ accounts, uniqueness, and password validation passed (PIN-free)');
});
