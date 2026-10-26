import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const PORT = 3070;
const BASE = `http://localhost:${PORT}`;

test('QR Lookup & Persistence: normalizes handles, resolves recipients, survives restarts, and separates temporary tokens', async () => {
  const startServer = () => {
    return spawn('node', [fileURLToPath(new URL('../index.js', import.meta.url))], {
      env: { ...process.env, PORT, FILE_TTL_MS: 3000, SWEEP_CRON: '*/1 * * * * *', STORAGE_DIR: '/tmp/documay-qr-test' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  };

  let srv = startServer();
  await once(srv.stdout, 'data');

  const emit = (s, ev, p = {}) => new Promise((resolve) => s.emit(ev, p, resolve));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    const id = Math.floor(100000 + Math.random() * 900000);
    const receiverUsername = `standee_${id}`;
    const senderUsername = `sender_${id}`;

    // ----------------------------------------------------
    // 1. Register a persistent user account with 4-digit PIN
    // ----------------------------------------------------
    const regRes = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: receiverUsername,
        password: 'password123',
        pin: '0427',
        confirmPin: '0427',
        displayName: 'Dr. Rahul Sharma',
      }),
    });
    const regData = await regRes.json();
    assert.equal(regRes.status, 200);
    assert.equal(regData.user.username, receiverUsername.toLowerCase());

    // Register sender too
    const sReg = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: senderUsername,
        password: 'password456',
        pin: '1234',
        confirmPin: '1234',
        displayName: 'Priya Verma',
      }),
    });
    const sData = await sReg.json();
    assert.equal(sReg.status, 200);
    const senderToken = sData.user.token;

    // ----------------------------------------------------
    // 2. Lookup recipient with various handles, casing, and URL encoding
    // ----------------------------------------------------
    // Exact username
    const resExact = await fetch(`${BASE}/api/user/${receiverUsername}`);
    const dataExact = await resExact.json();
    assert.equal(resExact.status, 200);
    assert.equal(dataExact.ok, true);
    assert.equal(dataExact.user.username, receiverUsername.toLowerCase());
    assert.equal(dataExact.user.displayName, 'Dr. Rahul Sharma');

    // With leading '@' e.g. /api/user/@standee_xxx
    const resAt = await fetch(`${BASE}/api/user/@${receiverUsername}`);
    const dataAt = await resAt.json();
    assert.equal(resAt.status, 200);
    assert.equal(dataAt.ok, true);
    assert.equal(dataAt.user.username, receiverUsername.toLowerCase());

    // URL encoded '%40' e.g. /api/user/%40standee_xxx
    const resEncoded = await fetch(`${BASE}/api/user/%40${receiverUsername}`);
    const dataEncoded = await resEncoded.json();
    assert.equal(resEncoded.status, 200);
    assert.equal(dataEncoded.ok, true);
    assert.equal(dataEncoded.user.username, receiverUsername.toLowerCase());

    // Uppercase e.g. /api/user/STANDEE_XXX
    const resUpper = await fetch(`${BASE}/api/user/${receiverUsername.toUpperCase()}`);
    const dataUpper = await resUpper.json();
    assert.equal(resUpper.status, 200);
    assert.equal(dataUpper.ok, true);
    assert.equal(dataUpper.user.username, receiverUsername.toLowerCase());

    // ----------------------------------------------------
    // 3. Unknown recipient returns proper 404
    // ----------------------------------------------------
    const resNotFound = await fetch(`${BASE}/api/user/nonexistent_unknown_user_9999`);
    const dataNotFound = await resNotFound.json();
    assert.equal(resNotFound.status, 404);
    assert.equal(dataNotFound.ok, false);
    assert.match(dataNotFound.error, /User not found/i);

    // ----------------------------------------------------
    // 4. Malformed/empty identifier returns 400
    // ----------------------------------------------------
    const resInvalid = await fetch(`${BASE}/api/user/%20%20%20`);
    const dataInvalid = await resInvalid.json();
    assert.equal(resInvalid.status, 400);
    assert.equal(dataInvalid.ok, false);
    assert.match(dataInvalid.error, /Invalid recipient/i);

    // ----------------------------------------------------
    // 5. Socket.IO qr:scan handling for permanent QR
    // ----------------------------------------------------
    const socket = io(BASE, { transports: ['websocket'] });
    await once(socket, 'connect');
    await emit(socket, 'session:start', { name: 'Priya', username: senderUsername, token: senderToken });

    // Scan with '@' handle
    const scanWithAt = await emit(socket, 'qr:scan', { username: `@${receiverUsername}` });
    assert.equal(scanWithAt.ok, false);
    assert.equal(scanWithAt.offline, true); // receiver not online on socket
    assert.equal(scanWithAt.user.username, receiverUsername.toLowerCase());

    // Scan non-existent username
    const scanUnknown = await emit(socket, 'qr:scan', { username: 'nobody_here_999' });
    assert.equal(scanUnknown.ok, false);
    assert.match(scanUnknown.error, /does not exist/i);

    // Cannot scan your own permanent QR
    const scanOwn = await emit(socket, 'qr:scan', { username: senderUsername });
    assert.equal(scanOwn.ok, false);
    assert.match(scanOwn.error, /own permanent QR/i);

    socket.close();

    // ----------------------------------------------------
    // 6. Test Data Persistence across Server Restart!
    // ----------------------------------------------------
    // Kill the running server process
    srv.kill('SIGTERM');
    await sleep(600);

    // Restart the server on the same port
    srv = startServer();
    await once(srv.stdout, 'data');

    // Lookup recipient again after restart -> MUST BE FOUND!
    const resAfterRestart = await fetch(`${BASE}/api/user/${receiverUsername}`);
    const dataAfterRestart = await resAfterRestart.json();
    assert.equal(resAfterRestart.status, 200, 'User profile must survive server restarts');
    assert.equal(dataAfterRestart.ok, true);
    assert.equal(dataAfterRestart.user.username, receiverUsername.toLowerCase());
    assert.equal(dataAfterRestart.user.displayName, 'Dr. Rahul Sharma');

    // Sender logs in with preserved password after restart
    const loginAfterRestart = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: senderUsername, password: 'password456' }),
    });
    const loginData = await loginAfterRestart.json();
    assert.equal(loginAfterRestart.status, 200);
    const refreshedToken = loginData.user.token;

    // Sender sends file to persistent standee recipient with 4-digit PIN verification
    const pinRes = await fetch(`${BASE}/api/auth/verify-send-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-user': senderUsername,
        'x-auth-token': refreshedToken,
      },
      body: JSON.stringify({
        pin: '1234',
        recipient: receiverUsername,
        fileCount: 1,
      }),
    });
    const pinData = await pinRes.json();
    assert.equal(pinRes.status, 200);
    assert.ok(pinData.sendAuthToken);

    const senderSocket = io(BASE, { transports: ['websocket'] });
    await once(senderSocket, 'connect');
    await emit(senderSocket, 'session:start', { name: 'Priya', username: senderUsername, token: refreshedToken });

    const dropRes = await emit(senderSocket, 'drop:offer', {
      toUsername: receiverUsername,
      name: 'prescription.pdf',
      size: 2048,
      senderName: 'Priya',
      sendAuthToken: pinData.sendAuthToken,
    });
    assert.equal(dropRes.ok, true);
    assert.ok(dropRes.id);

    senderSocket.close();
    console.log('  ✓ QR Lookup & Persistence test suite passed with 100% assertions satisfied!');
  } finally {
    srv.kill('SIGKILL');
  }
});
