import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const PORT = 3058;
const BASE = `http://localhost:${PORT}`;

test('PIN-Free Complete Workflow: Guests & Registered senders, Consent, Security & Deletion', async () => {
  const r = Math.floor(100000 + Math.random() * 900000);
  const recipientUser = `rec_${r}`;
  const registeredSender = `snd_${r}`;

  const srv = spawn('node', [fileURLToPath(new URL('../index.js', import.meta.url))], {
    env: { ...process.env, PORT, FILE_TTL_MS: 3000, SWEEP_CRON: '*/1 * * * * *', STORAGE_DIR: `/tmp/documay-pinfree-test-${r}` },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await once(srv.stdout, 'data');

  const emit = (s, ev, p = {}) => new Promise((resolve) => s.emit(ev, p, resolve));
  const wait = (s, ev) => new Promise((resolve) => s.once(ev, resolve));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    // 1. Account registration works cleanly without any PIN requirement
    const regRecipient = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: recipientUser,
        password: 'password123',
        displayName: 'Recipient Alex',
      }),
    });
    const recData = await regRecipient.json();
    assert.equal(regRecipient.status, 200);
    assert.equal(recData.ok, true);
    assert.ok(recData.user.token);
    assert.equal(recData.user.pin, undefined);
    assert.equal(recData.user.pinHash, undefined);

    const regSender = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: registeredSender,
        password: 'password456',
        displayName: 'Registered Sam',
      }),
    });
    const sndData = await regSender.json();
    assert.equal(regSender.status, 200);
    assert.equal(sndData.ok, true);
    assert.ok(sndData.user.token);
    assert.equal(sndData.user.pin, undefined);
    assert.equal(sndData.user.pinHash, undefined);

    // 2. Login works with username & password only (no PIN)
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: registeredSender, password: 'password456' }),
    });
    const loginData = await loginRes.json();
    assert.equal(loginRes.status, 200);
    assert.equal(loginData.ok, true);
    assert.ok(loginData.user.token);
    assert.equal(loginData.user.pin, undefined);

    // 3. Permanent QR code identity resolution
    const resolveRes = await fetch(`${BASE}/api/user/${recipientUser}`);
    const resolveData = await resolveRes.json();
    assert.equal(resolveRes.status, 200);
    assert.equal(resolveData.ok, true);
    assert.equal(resolveData.user.username, recipientUser.toLowerCase());
    assert.equal(resolveData.user.displayName, 'Recipient Alex');

    // 4. Connect recipient socket
    const recSocket = io(BASE, { transports: ['websocket'] });
    await once(recSocket, 'connect');
    await emit(recSocket, 'session:start', {
      name: 'Recipient Alex',
      username: recipientUser,
      token: recData.user.token,
    });

    // 5. Connect guest sender socket (no account, no PIN)
    const guestSocket = io(BASE, { transports: ['websocket'] });
    await once(guestSocket, 'connect');
    await emit(guestSocket, 'session:start', { name: 'Guest Sender' });

    let receivedNotification = null;
    recSocket.on('drop:received', (d) => { receivedNotification = d; });

    // 6. Guest sends file to drop-box without account or PIN
    const guestOffer = await emit(guestSocket, 'drop:offer', {
      toUsername: recipientUser,
      name: 'guest_report.pdf',
      size: 2048,
      senderName: 'Guest Sender',
    });
    assert.equal(guestOffer.ok, true, `Guest send should succeed: ${guestOffer.error}`);
    assert.ok(guestOffer.id);

    const guestPayload = crypto.randomBytes(2048);
    assert.ok((await emit(guestSocket, 'file:chunk', { id: guestOffer.id, offset: 0, data: guestPayload })).ok);
    assert.ok((await emit(guestSocket, 'file:complete', { id: guestOffer.id })).ok);

    await sleep(100);
    assert.ok(receivedNotification);
    assert.equal(receivedNotification.name, 'guest_report.pdf');
    assert.equal(receivedNotification.senderName, 'Guest Sender');
    assert.ok(receivedNotification.key);

    // Download guest file with valid key
    const dlGuest = await fetch(`${BASE}/api/files/${guestOffer.id}?key=${receivedNotification.key}`);
    assert.equal(dlGuest.status, 200);
    assert.ok(Buffer.from(await dlGuest.arrayBuffer()).equals(guestPayload));

    // 7. Registered user sends file to drop-box without PIN
    const regSocket = io(BASE, { transports: ['websocket'] });
    await once(regSocket, 'connect');
    await emit(regSocket, 'session:start', {
      name: 'Registered Sam',
      username: registeredSender,
      token: loginData.user.token,
    });

    const regOffer = await emit(regSocket, 'drop:offer', {
      toUsername: recipientUser,
      name: 'contract.pdf',
      size: 1024,
      senderName: 'Registered Sam',
    });
    assert.equal(regOffer.ok, true, `Registered user send should succeed without PIN: ${regOffer.error}`);
    assert.ok(regOffer.id);

    const regPayload = crypto.randomBytes(1024);
    assert.ok((await emit(regSocket, 'file:chunk', { id: regOffer.id, offset: 0, data: regPayload })).ok);
    assert.ok((await emit(regSocket, 'file:complete', { id: regOffer.id })).ok);

    // 8. 1-to-1 Room pairing without PIN handshake
    const { token: qrToken } = await emit(recSocket, 'qr:create');
    const scannerReadyP = wait(guestSocket, 'room:ready');
    const hostReadyP = wait(recSocket, 'room:ready');
    assert.ok((await emit(guestSocket, 'qr:scan', { token: qrToken })).ok);

    const [scannerReady, hostReady] = await Promise.all([scannerReadyP, hostReadyP]);
    assert.equal(scannerReady.verified, true);
    assert.equal(hostReady.verified, true);

    // 9. 1-to-1 Room transfer: file offer directly without PIN, receiver consent enforced
    const incomingP = wait(recSocket, 'file:incoming');
    const roomOffer = await emit(guestSocket, 'file:offer', { name: 'photo.png', size: 512 });
    assert.equal(roomOffer.ok, true);
    const inc = await incomingP;
    assert.equal(inc.name, 'photo.png');

    // Chunks blocked before accept
    assert.equal((await emit(guestSocket, 'file:chunk', { id: roomOffer.id, offset: 0, data: new Uint8Array(10) })).ok, false);

    // Accept consent unlocks chunks
    assert.ok((await emit(recSocket, 'file:accept', { id: roomOffer.id })).ok);
    assert.ok((await emit(guestSocket, 'file:chunk', { id: roomOffer.id, offset: 0, data: new Uint8Array(512) })).ok);
    assert.ok((await emit(guestSocket, 'file:complete', { id: roomOffer.id })).ok);

    // 10. Non-PIN security rules still strictly enforced:
    // File type validation (.exe blocked)
    const exeOffer = await emit(guestSocket, 'drop:offer', {
      toUsername: recipientUser,
      name: 'malware.exe',
      size: 500,
      senderName: 'Guest',
    });
    assert.equal(exeOffer.ok, false);
    assert.match(exeOffer.error, /photos.*pdf.*allowed/i);

    // File size validation (> 100MB blocked)
    const bigOffer = await emit(guestSocket, 'drop:offer', {
      toUsername: recipientUser,
      name: 'huge.pdf',
      size: 101 * 1024 * 1024,
      senderName: 'Guest',
    });
    assert.equal(bigOffer.ok, false);
    assert.match(bigOffer.error, /100 MB/i);

    // Download key security (random key required, wrong key -> 404)
    const wrongKeyRes = await fetch(`${BASE}/api/files/${guestOffer.id}?key=wrong_key_123`);
    assert.equal(wrongKeyRes.status, 404);

    // Cleanup
    recSocket.close();
    guestSocket.close();
    regSocket.close();

    console.log('  ✓ PIN-Free workflow test passed with all requirements verified!');
  } finally {
    srv.kill('SIGKILL');
  }
});
