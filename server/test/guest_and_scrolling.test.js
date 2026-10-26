import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const PORT = 3062;
const BASE = `http://localhost:${PORT}`;

test('Guest Sending, Name Validation, Optional Accounts & PIN Enforcement', async () => {
  const r = Math.floor(100000 + Math.random() * 900000);
  const recipientUsername = `recipient_${r}`;
  const registeredSender = `pinned_sender_${r}`;

  const srv = spawn('node', [fileURLToPath(new URL('../index.js', import.meta.url))], {
    env: { ...process.env, PORT, STORAGE_DIR: `/tmp/documay-guest-test-${r}` },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await once(srv.stdout, 'data');

  try {
    // 1. Register permanent recipient with 4-digit PIN '1234'
    const regRec = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: recipientUsername,
        password: 'password123',
        pin: '1234',
        confirmPin: '1234',
        displayName: 'Amir Khan',
      }),
    });
    const recData = await regRec.json();
    assert.equal(regRec.status, 200);
    assert.equal(recData.ok, true);

    // 2. Register a sender who configured Send PIN protection '5678'
    const regSender = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: registeredSender,
        password: 'password123',
        pin: '5678',
        confirmPin: '5678',
        displayName: 'Registered Sender',
      }),
    });
    const senderData = await regSender.json();
    assert.equal(regSender.status, 200);
    const senderToken = senderData.user.token;

    // STEP 1: SCAN THE RECIPIENT'S PERMANENT QR & RESOLVE PROFILE
    // Querying non-existent recipient should return 404, not fabricated data
    const nonExistent = await fetch(`${BASE}/api/user/fake_non_existent_user_999`);
    const nonExData = await nonExistent.json();
    assert.equal(nonExistent.status, 404);
    assert.equal(nonExData.ok, false);

    // Querying registered recipient succeeds
    const resolveRec = await fetch(`${BASE}/api/user/${recipientUsername}`);
    const resData = await resolveRec.json();
    assert.equal(resolveRec.status, 200);
    assert.equal(resData.ok, true);
    assert.equal(resData.user.username, recipientUsername);
    assert.equal(resData.user.displayName, 'Amir Khan');

    // Connect recipient socket to receive real-time drop notifications
    const recipientSocket = io(BASE, { transports: ['websocket'] });
    await once(recipientSocket, 'connect');
    const recEmit = (ev, p = {}) => new Promise((res) => recipientSocket.emit(ev, p, res));
    await recEmit('session:start', { name: 'Amir Khan', username: recipientUsername, token: recData.user.token });

    // Connect a Guest socket (no username, no token)
    const guestSocket = io(BASE, { transports: ['websocket'] });
    await once(guestSocket, 'connect');
    const guestEmit = (ev, p = {}) => new Promise((res) => guestSocket.emit(ev, p, res));

    // STEP 2: SENDER NAME VALIDATION (Required, trimmed, 1-24 chars, no email/password/PIN required)
    // 2a. Reject empty name
    const emptyNameRes = await guestEmit('drop:offer', {
      toUsername: recipientUsername,
      name: 'receipt.pdf',
      size: 2048,
      senderName: '',
    });
    assert.equal(emptyNameRes.ok, false);
    assert.match(emptyNameRes.error, /sender name/i);

    // 2b. Reject whitespace-only name
    const wsNameRes = await guestEmit('drop:offer', {
      toUsername: recipientUsername,
      name: 'receipt.pdf',
      size: 2048,
      senderName: '     ',
    });
    assert.equal(wsNameRes.ok, false);
    assert.match(wsNameRes.error, /sender name/i);

    // 2c. Reject name exceeding 24 characters
    const longNameRes = await guestEmit('drop:offer', {
      toUsername: recipientUsername,
      name: 'receipt.pdf',
      size: 2048,
      senderName: 'This sender name is definitely way too long for twenty four chars',
    });
    assert.equal(longNameRes.ok, false);
    assert.match(longNameRes.error, /24 characters/i);

    // STEP 3 & 4: GUEST SENDS FILE WITHOUT ACCOUNT OR PIN
    let receivedNotification = null;
    recipientSocket.on('drop:received', (d) => {
      receivedNotification = d;
    });

    const guestOffer = await guestEmit('drop:offer', {
      toUsername: recipientUsername,
      name: 'contract.pdf',
      size: 1024,
      senderName: '  Rahul Sharma  ', // Leading and trailing whitespace should be trimmed
    });
    assert.equal(guestOffer.ok, true, `Guest offer failed: ${guestOffer.error}`);
    assert.ok(guestOffer.id);

    // Guest streams chunks without needing an account
    const chunkData = new Uint8Array(1024).fill(77);
    const chunkRes = await guestEmit('file:chunk', {
      id: guestOffer.id,
      offset: 0,
      data: chunkData,
    });
    assert.equal(chunkRes.ok, true);

    const compRes = await guestEmit('file:complete', { id: guestOffer.id });
    assert.equal(compRes.ok, true);

    // Verify recipient received real-time drop notification with guest sender name
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(receivedNotification);
    assert.equal(receivedNotification.name, 'contract.pdf');
    assert.equal(receivedNotification.senderName, 'Rahul Sharma');
    assert.ok(receivedNotification.key);

    // Protected download test: downloading with valid key returns 200
    const dlRes = await fetch(`${BASE}/api/files/${guestOffer.id}?key=${receivedNotification.key}`);
    assert.equal(dlRes.status, 200);
    const dlBytes = await dlRes.arrayBuffer();
    assert.equal(dlBytes.byteLength, 1024);

    // PRIORITY 4: REGISTERED USERS WITH CONFIGURED PIN CANNOT BYPASS PIN
    const regSocket = io(BASE, { transports: ['websocket'] });
    await once(regSocket, 'connect');
    const regSocketEmit = (ev, p = {}) => new Promise((res) => regSocket.emit(ev, p, res));
    await regSocketEmit('session:start', { name: 'Registered Sender', username: registeredSender, token: senderToken });

    // Trying to send without PIN must be rejected
    const regBypass = await regSocketEmit('drop:offer', {
      toUsername: recipientUsername,
      name: 'document.pdf',
      size: 1024,
      senderName: 'Registered Sender',
    });
    assert.equal(regBypass.ok, false);
    assert.match(regBypass.error, /Send PIN/i);

    // Correct PIN verification unlocks authorized token
    const authPin = await regSocketEmit('auth:verify_send_pin', {
      username: registeredSender,
      token: senderToken,
      pin: '5678',
      recipient: recipientUsername,
      fileCount: 1,
    });
    assert.equal(authPin.ok, true);
    assert.ok(authPin.sendAuthToken);

    // Send with valid token succeeds
    const regAuthOffer = await regSocketEmit('drop:offer', {
      toUsername: recipientUsername,
      name: 'document.pdf',
      size: 1024,
      senderName: 'Registered Sender',
      sendAuthToken: authPin.sendAuthToken,
    });
    assert.equal(regAuthOffer.ok, true);

    // Cleanup sockets
    recipientSocket.close();
    guestSocket.close();
    regSocket.close();

    console.log('  ✓ Guest sending without account or PIN passed!');
    console.log('  ✓ Sender name trimmed, validated (1-24 chars), whitespace rejected!');
    console.log('  ✓ Recipient profile resolved via QR lookup, fake accounts rejected!');
    console.log('  ✓ Registered user 4-digit PIN protection strictly enforced without bypass!');
  } finally {
    srv.kill('SIGKILL');
  }
});
