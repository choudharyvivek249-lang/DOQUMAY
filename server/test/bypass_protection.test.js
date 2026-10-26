import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const PORT = 3058;
const BASE = `http://localhost:${PORT}`;

test('Bypass Protection: direct Socket.IO and API calls cannot bypass 4-digit Send PIN', async () => {
  const r = Math.floor(100000 + Math.random() * 900000);
  const receiverUser = `c_${r}`;
  const senderUser = `e_${r}`;

  const srv = spawn('node', [fileURLToPath(new URL('../index.js', import.meta.url))], {
    env: { ...process.env, PORT, STORAGE_DIR: '/tmp/documay-bypass-test' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await once(srv.stdout, 'data');

  try {
    // 1. Register receiver and sender
    const regReceiver = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: receiverUser, password: 'password123', pin: '0427', confirmPin: '0427' }),
    });
    const recData = await regReceiver.json();
    assert.equal(regReceiver.status, 200, recData.error);

    const regSender = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: senderUser, password: 'password123', pin: '8888', confirmPin: '8888' }),
    });
    const senderData = await regSender.json();
    assert.equal(regSender.status, 200, senderData.error);
    const senderToken = senderData.user.token;

    const socket = io(BASE, { transports: ['websocket'] });
    await once(socket, 'connect');

    const emit = (ev, p = {}) => new Promise((resolve) => socket.emit(ev, p, resolve));
    await emit('session:start', { name: 'Eve', username: senderUser, token: senderToken });

    // 2. Direct drop:offer WITHOUT any sendAuthToken or PIN -> MUST BE REJECTED
    const bypassNoAuth = await emit('drop:offer', {
      toUsername: receiverUser,
      name: 'invoice.pdf',
      size: 1024,
      senderName: 'Eve',
    });
    assert.equal(bypassNoAuth.ok, false);
    assert.match(bypassNoAuth.error, /Send PIN/i);

    // 3. Direct drop:offer with FAKE / RANDOM sendAuthToken -> MUST BE REJECTED
    const bypassFakeToken = await emit('drop:offer', {
      toUsername: receiverUser,
      name: 'invoice.pdf',
      size: 1024,
      senderName: 'Eve',
      sendAuthToken: 'fake-token-abc-1234567890',
    });
    assert.equal(bypassFakeToken.ok, false);
    assert.match(bypassFakeToken.error, /Send PIN/i);

    // 4. Direct drop:offer with WRONG PIN -> MUST BE REJECTED
    const bypassWrongPin = await emit('drop:offer', {
      toUsername: receiverUser,
      name: 'invoice.pdf',
      size: 1024,
      senderName: 'Eve',
      pin: '0000', // wrong PIN
    });
    assert.equal(bypassWrongPin.ok, false);
    assert.match(bypassWrongPin.error, /incorrect/i);

    // 5. Legitimate flow: verify 4-digit PIN '8888' on server to receive authorized token
    const verifyPinRes = await emit('auth:verify_send_pin', {
      username: senderUser,
      token: senderToken,
      pin: '8888',
      recipient: receiverUser,
      fileCount: 1,
    });
    assert.equal(verifyPinRes.ok, true);
    assert.ok(verifyPinRes.sendAuthToken);

    // 6. Authorized send using valid token -> SUCCEEDS
    const legitOffer = await emit('drop:offer', {
      toUsername: receiverUser,
      name: 'invoice.pdf',
      size: 1024,
      senderName: 'Eve',
      sendAuthToken: verifyPinRes.sendAuthToken,
    });
    assert.equal(legitOffer.ok, true);
    assert.ok(legitOffer.id);

    // 7. Token is single-use: second attempt with SAME token MUST FAIL
    const replayAttempt = await emit('drop:offer', {
      toUsername: receiverUser,
      name: 'another.pdf',
      size: 1024,
      senderName: 'Eve',
      sendAuthToken: verifyPinRes.sendAuthToken,
    });
    assert.equal(replayAttempt.ok, false);
    assert.match(replayAttempt.error, /consumed|Send PIN/i);

    socket.disconnect();
  } catch (err) {
    console.error('Bypass test failed at step:', err);
    throw err;
  } finally {
    srv.kill();
  }
});
