import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const PORT = 3060;
const BASE = `http://localhost:${PORT}`;

test('E2E Complete Workflow: PIN setup, Send PIN authorization, direct bypass blocking, rate-limit & WhatsApp handoff', async () => {
  const srv = spawn('node', [fileURLToPath(new URL('../index.js', import.meta.url))], {
    env: { ...process.env, PORT, FILE_TTL_MS: 2000, SWEEP_CRON: '*/1 * * * * *', STORAGE_DIR: '/tmp/documay-e2e-test' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await once(srv.stdout, 'data');

  const emit = (s, ev, p = {}) => new Promise((resolve) => s.emit(ev, p, resolve));
  const wait = (s, ev) => new Promise((resolve) => s.once(ev, resolve));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    const id = Math.floor(100000 + Math.random() * 900000);
    const receiverUsername = `rec_${id}`;
    const senderUsername = `snd_${id}`;

    // ----------------------------------------------------
    // 1. First-time account setup and PIN confirmation
    // ----------------------------------------------------
    // Mismatch confirmation fails
    const mismatchReg = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: receiverUsername,
        password: 'password123',
        pin: '0427',
        confirmPin: '0999',
      }),
    });
    const mismatchData = await mismatchReg.json();
    assert.equal(mismatchReg.status, 400);
    assert.match(mismatchData.error, /confirmation does not match/i);

    // Valid registration with leading-zero PIN '0427'
    const receiverReg = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: receiverUsername,
        password: 'password123',
        pin: '0427',
        confirmPin: '0427',
        displayName: 'Receiver Rahul',
      }),
    });
    const recData = await receiverReg.json();
    assert.equal(receiverReg.status, 200);
    assert.ok(recData.user.token);
    // Plaintext PIN is NEVER returned in response!
    assert.equal(recData.user.pin, undefined);
    assert.equal(recData.user.pinHash, undefined);

    // Register sender with leading-zero PIN '0101'
    const senderReg = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: senderUsername,
        password: 'password456',
        pin: '0101',
        confirmPin: '0101',
        displayName: 'Sender Priya',
      }),
    });
    const senderData = await senderReg.json();
    assert.equal(senderReg.status, 200);
    const senderToken = senderData.user.token;
    assert.equal(senderData.user.pin, undefined);

    // ----------------------------------------------------
    // 2. Repeated login without unexpected PIN resets
    // ----------------------------------------------------
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: senderUsername, password: 'password456' }),
    });
    const loginData = await loginRes.json();
    assert.equal(loginRes.status, 200);
    const refreshedToken = loginData.user.token;
    assert.equal(loginData.user.pin, undefined);

    // Verify existing PIN '0101' was preserved and works with refreshed token
    const checkPreserved = await fetch(`${BASE}/api/auth/verify-send-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-user': senderUsername,
        'x-auth-token': refreshedToken,
      },
      body: JSON.stringify({
        pin: '0101',
        recipient: receiverUsername,
        fileCount: 1,
      }),
    });
    const presData = await checkPreserved.json();
    assert.equal(checkPreserved.status, 200);
    assert.ok(presData.sendAuthToken);

    // ----------------------------------------------------
    // 3. Four-digit PIN acceptance, including leading zero
    // ----------------------------------------------------
    // '0101' accepted above; also test wrong PIN rejection
    const wrongPinRes = await fetch(`${BASE}/api/auth/verify-send-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-user': senderUsername,
        'x-auth-token': refreshedToken,
      },
      body: JSON.stringify({
        pin: '9999', // Incorrect PIN
        recipient: receiverUsername,
        fileCount: 1,
      }),
    });
    const wrongData = await wrongPinRes.json();
    assert.equal(wrongPinRes.status, 401);
    assert.match(wrongData.error, /incorrect 4-digit Send PIN/i);

    // ----------------------------------------------------
    // 4. Rate limiting blocks repeated guessing
    // ----------------------------------------------------
    for (let attempt = 1; attempt <= 4; attempt++) {
      await fetch(`${BASE}/api/auth/verify-send-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-user': senderUsername,
          'x-auth-token': refreshedToken,
        },
        body: JSON.stringify({
          pin: '0000',
          recipient: receiverUsername,
          fileCount: 1,
        }),
      });
    }
    // 5th failed attempt triggers lockout (429 status)
    const lockoutRes = await fetch(`${BASE}/api/auth/verify-send-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-user': senderUsername,
        'x-auth-token': refreshedToken,
      },
      body: JSON.stringify({
        pin: '0000',
        recipient: receiverUsername,
        fileCount: 1,
      }),
    });
    assert.equal(lockoutRes.status, 429);
    const lockoutData = await lockoutRes.json();
    assert.equal(lockoutData.locked, true);
    assert.match(lockoutData.error, /locked/i);

    // Recover PIN with account password to reset abuse tracker
    const recoverRes = await fetch(`${BASE}/api/auth/recover-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: senderUsername,
        password: 'password456',
        newPin: '0427', // New leading-zero PIN
        confirmNewPin: '0427',
      }),
    });
    assert.equal(recoverRes.status, 200);

    // ----------------------------------------------------
    // 5. Direct Socket.IO calls cannot bypass PIN verification
    // ----------------------------------------------------
    const socket = io(BASE, { transports: ['websocket'] });
    await once(socket, 'connect');
    await emit(socket, 'session:start', { name: 'Priya', username: senderUsername, token: refreshedToken });

    // Calling drop:offer directly without sendAuthToken fails
    const directBypass = await emit(socket, 'drop:offer', {
      toUsername: receiverUsername,
      name: 'secret.pdf',
      size: 512,
      senderName: 'Priya',
    });
    assert.equal(directBypass.ok, false);
    assert.match(directBypass.error, /Send PIN/i);

    // Calling drop:offer with an invalid or expired token fails
    const invalidTokenBypass = await emit(socket, 'drop:offer', {
      toUsername: receiverUsername,
      name: 'secret.pdf',
      size: 512,
      senderName: 'Priya',
      sendAuthToken: 'unauthorized-token-12345',
    });
    assert.equal(invalidTokenBypass.ok, false);
    assert.match(invalidTokenBypass.error, /Send PIN/i);

    // ----------------------------------------------------
    // 6. Correct PIN authorizes send & every new send operation requires authorization
    // ----------------------------------------------------
    // Request authorization for exactly 1 file
    const authSuccess = await fetch(`${BASE}/api/auth/verify-send-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-user': senderUsername,
        'x-auth-token': refreshedToken,
      },
      body: JSON.stringify({
        pin: '0427',
        recipient: receiverUsername,
        fileCount: 1,
      }),
    });
    const authData = await authSuccess.json();
    assert.equal(authSuccess.status, 200);
    assert.ok(authData.sendAuthToken);

    // Authorized drop upload succeeds
    const offerRes = await emit(socket, 'drop:offer', {
      toUsername: receiverUsername,
      name: 'financial_report.pdf',
      size: 1024,
      senderName: 'Priya',
      sendAuthToken: authData.sendAuthToken,
    });
    assert.equal(offerRes.ok, true);
    assert.ok(offerRes.id);

    // Second file send attempt with the SAME token is rejected (single-use enforcement)
    const replayRes = await emit(socket, 'drop:offer', {
      toUsername: receiverUsername,
      name: 'second_unauthorized.pdf',
      size: 1024,
      senderName: 'Priya',
      sendAuthToken: authData.sendAuthToken,
    });
    assert.equal(replayRes.ok, false);
    assert.match(replayRes.error, /consumed|Send PIN/i);

    // ----------------------------------------------------
    // 7. Complete file upload & WhatsApp handoff link verification
    // ----------------------------------------------------
    const fileBytes = crypto.randomBytes(1024);
    const chunkRes = await emit(socket, 'file:chunk', { id: offerRes.id, offset: 0, data: fileBytes });
    assert.equal(chunkRes.ok, true);
    const completeRes = await emit(socket, 'file:complete', { id: offerRes.id });
    assert.equal(completeRes.ok, true);

    // Fetch drops as receiver to get the per-file download key
    const receiverDropsRes = await fetch(`${BASE}/api/drops`, {
      headers: {
        'x-auth-user': receiverUsername,
        'x-auth-token': recData.user.token,
      },
    });
    const dropListData = await receiverDropsRes.json();
    assert.equal(dropListData.ok, true);
    const dropItem = dropListData.drops.find((d) => d.id === offerRes.id);
    assert.ok(dropItem);
    assert.ok(dropItem.key);

    // WhatsApp protected download link format:
    const waDownloadUrl = `${BASE}/api/files/${dropItem.id}?key=${dropItem.key}`;
    const dlTest = await fetch(waDownloadUrl);
    assert.equal(dlTest.status, 200);
    assert.equal(dlTest.headers.get('content-type'), 'application/pdf');

    // Wrong key returns 404 (protected link)
    const badKeyTest = await fetch(`${BASE}/api/files/${dropItem.id}?key=wrong_key`);
    assert.equal(badKeyTest.status, 404);

    // ----------------------------------------------------
    // 8. Automatic deletion after TTL
    // ----------------------------------------------------
    await sleep(2600); // Wait for TTL (2000ms in test) and 1-second sweep
    const expiredDl = await fetch(waDownloadUrl);
    assert.equal(expiredDl.status, 404); // File is gone!

    socket.disconnect();
    console.log('  ✓ E2E Complete Workflow passed with all 8 core requirements verified!');
  } catch (err) {
    console.error('E2E workflow failed at step:', err);
    throw err;
  } finally {
    srv.kill();
  }
});
