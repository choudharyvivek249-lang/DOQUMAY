import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const PORT = 3088;
const BASE = `http://localhost:${PORT}`;

test('Durable Persistence & Permanent QR Architecture', async () => {
  const startServer = (extraEnv = {}) => {
    return spawn('node', [fileURLToPath(new URL('../index.js', import.meta.url))], {
      env: {
        ...process.env,
        PORT,
        FILE_TTL_MS: 3000,
        SWEEP_CRON: '*/1 * * * * *',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitForReady = async () => {
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`${BASE}/api/health`);
        if (r.ok) return;
      } catch {}
      await sleep(100);
    }
    throw new Error('Server failed to start in time');
  };

  let srv = startServer();
  await waitForReady();

  const emit = (s, ev, p = {}) => new Promise((resolve) => s.emit(ev, p, resolve));

  try {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const testUser = `user_${randomSuffix}`;
    const testPass = 'SecurePass_123';
    const testPin = '0815'; // 4-digit PIN with leading zero

    // ----------------------------------------------------------------------
    // 1. Health check reports database connectivity status
    // ----------------------------------------------------------------------
    const healthRes = await fetch(`${BASE}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.equal(healthData.ok, true);
    assert.ok(healthData.database);
    assert.equal(healthData.database.connected, true);

    // ----------------------------------------------------------------------
    // 2. Register user & verify stable internal ID and 4-digit PIN
    // ----------------------------------------------------------------------
    const regRes = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUser,
        password: testPass,
        pin: testPin,
        confirmPin: testPin,
        displayName: 'Durable Recipient',
      }),
    });
    const regData = await regRes.json();
    assert.equal(regRes.status, 200);
    assert.equal(regData.ok, true);
    assert.ok(regData.user.id, 'User must have a persistent internal UUID ID');
    const stableId = regData.user.id;
    const userToken = regData.user.token;

    // ----------------------------------------------------------------------
    // 3. Prevent duplicate username registration
    // ----------------------------------------------------------------------
    const dupRes = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: testUser.toUpperCase(), // duplicate despite casing
        password: 'differentPassword',
        pin: '9999',
        confirmPin: '9999',
        displayName: 'Duplicate Attempt',
      }),
    });
    const dupData = await dupRes.json();
    assert.equal(dupRes.status, 400);
    assert.equal(dupData.ok, false);
    assert.match(dupData.error, /already taken/i);

    // ----------------------------------------------------------------------
    // 4. Offline user resolves correctly via /api/user/:username
    // ----------------------------------------------------------------------
    const offlineRes = await fetch(`${BASE}/api/user/${testUser}`);
    const offlineData = await offlineRes.json();
    assert.equal(offlineRes.status, 200);
    assert.equal(offlineData.ok, true);
    assert.equal(offlineData.user.id, stableId, 'Must return same stable internal ID');
    assert.equal(offlineData.user.username, testUser.toLowerCase());
    assert.equal(offlineData.user.isOnline, false, 'Offline user must resolve with isOnline: false');

    // ----------------------------------------------------------------------
    // 5. Unknown username returns a genuine 404 (does NOT fabricate users)
    // ----------------------------------------------------------------------
    const notFoundRes = await fetch(`${BASE}/api/user/genuine_nonexistent_user_404`);
    assert.equal(notFoundRes.status, 404);
    const notFoundData = await notFoundRes.json();
    assert.equal(notFoundData.ok, false);
    assert.match(notFoundData.error, /User not found/i);

    // ----------------------------------------------------------------------
    // 6. Connect temporary WebSocket session & confirm isOnline becomes true
    // ----------------------------------------------------------------------
    const userSocket = io(BASE, { transports: ['websocket'] });
    await once(userSocket, 'connect');
    await emit(userSocket, 'session:start', { name: 'Durable Recipient', username: testUser, token: userToken });

    const onlineRes = await fetch(`${BASE}/api/user/${testUser}`);
    const onlineData = await onlineRes.json();
    assert.equal(onlineRes.status, 200);
    assert.equal(onlineData.user.isOnline, true, 'Online user must resolve with isOnline: true');

    // ----------------------------------------------------------------------
    // 7. Temporary session disconnects -> permanent URL stays completely valid!
    // ----------------------------------------------------------------------
    userSocket.close();
    await sleep(200);

    const afterDisconnectRes = await fetch(`${BASE}/api/user/${testUser}`);
    const afterDisconnectData = await afterDisconnectRes.json();
    assert.equal(afterDisconnectRes.status, 200);
    assert.equal(afterDisconnectData.ok, true);
    assert.equal(afterDisconnectData.user.id, stableId);
    assert.equal(afterDisconnectData.user.isOnline, false);

    // ----------------------------------------------------------------------
    // 8. Simulate deployment / server restart -> Data must be durable!
    // ----------------------------------------------------------------------
    srv.kill('SIGTERM');
    await sleep(600);

    srv = startServer();
    await waitForReady();

    // User lookup after restart
    const resAfterDeploy = await fetch(`${BASE}/api/user/${testUser}`);
    const dataAfterDeploy = await resAfterDeploy.json();
    assert.equal(resAfterDeploy.status, 200, 'User profile must survive application redeployment');
    assert.equal(dataAfterDeploy.ok, true);
    assert.equal(dataAfterDeploy.user.id, stableId, 'Internal UUID ID must remain identical across restarts');
    assert.equal(dataAfterDeploy.user.username, testUser.toLowerCase());
    assert.equal(dataAfterDeploy.user.displayName, 'Durable Recipient');

    // Sender logins and verifies 4-digit PIN is intact
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUser, password: testPass }),
    });
    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.equal(loginData.user.id, stableId);

    const pinVerifyRes = await fetch(`${BASE}/api/auth/verify-send-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-user': testUser,
        'x-auth-token': loginData.user.token,
      },
      body: JSON.stringify({
        pin: testPin, // '0815'
        fileCount: 1,
      }),
    });
    assert.equal(pinVerifyRes.status, 200);
    const pinVerifyData = await pinVerifyRes.json();
    assert.equal(pinVerifyData.ok, true);
    assert.ok(pinVerifyData.sendAuthToken);

    // ----------------------------------------------------------------------
    // 9. Guest file send to offline permanent recipient
    // ----------------------------------------------------------------------
    const guestSocket = io(BASE, { transports: ['websocket'] });
    await once(guestSocket, 'connect');
    await emit(guestSocket, 'session:start', { name: 'Dr. Jane Smith' });

    const dropOfferRes = await emit(guestSocket, 'drop:offer', {
      toUsername: testUser,
      name: 'medical_report.pdf',
      size: 4096,
      senderName: 'Dr. Jane Smith',
    });
    assert.equal(dropOfferRes.ok, true, 'Guest must be able to drop files to offline recipient standee');
    assert.ok(dropOfferRes.id);

    guestSocket.close();
    console.log('  ✓ Durable Persistence & Permanent QR test suite passed with 100% assertions satisfied!');
  } finally {
    srv.kill('SIGKILL');
  }
});
