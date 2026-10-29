import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const PORT = 3060;
const BASE = `http://localhost:${PORT}`;

test('E2E Complete Workflow: Registration, QR resolution, Guest & Registered Sending, WhatsApp handoff & Expiry', async () => {
  const srv = spawn('node', [fileURLToPath(new URL('../index.js', import.meta.url))], {
    env: { ...process.env, PORT, FILE_TTL_MS: 2000, SWEEP_CRON: '*/1 * * * * *', STORAGE_DIR: '/tmp/documay-e2e-test' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await once(srv.stdout, 'data');

  const emit = (s, ev, p = {}) => new Promise((resolve) => s.emit(ev, p, resolve));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    const id = Math.floor(100000 + Math.random() * 900000);
    const receiverUsername = `rec_${id}`;
    const senderUsername = `snd_${id}`;

    // ----------------------------------------------------
    // 1. Account setup without PIN requirement
    // ----------------------------------------------------
    const receiverReg = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: receiverUsername,
        password: 'password123',
        displayName: 'Receiver Rahul',
      }),
    });
    const recData = await receiverReg.json();
    assert.equal(receiverReg.status, 200);
    assert.ok(recData.user.token);
    assert.equal(recData.user.pin, undefined);
    assert.equal(recData.user.pinHash, undefined);

    const senderReg = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: senderUsername,
        password: 'password456',
        displayName: 'Sender Priya',
      }),
    });
    const senderData = await senderReg.json();
    assert.equal(senderReg.status, 200);
    const senderToken = senderData.user.token;
    assert.equal(senderData.user.pin, undefined);

    // ----------------------------------------------------
    // 2. Login without PIN
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

    // ----------------------------------------------------
    // 3. Permanent QR identity resolution
    // ----------------------------------------------------
    const qrLookup = await fetch(`${BASE}/api/user/${receiverUsername}`);
    const qrData = await qrLookup.json();
    assert.equal(qrLookup.status, 200);
    assert.equal(qrData.user.username, receiverUsername.toLowerCase());

    // ----------------------------------------------------
    // 4. Send files directly without PIN verification
    // ----------------------------------------------------
    const socket = io(BASE, { transports: ['websocket'] });
    await once(socket, 'connect');
    await emit(socket, 'session:start', { name: 'Priya', username: senderUsername, token: refreshedToken });

    // Send drop directly
    const offerRes = await emit(socket, 'drop:offer', {
      toUsername: receiverUsername,
      name: 'financial_report.pdf',
      size: 1024,
      senderName: 'Priya',
    });
    assert.equal(offerRes.ok, true, `Send file should succeed without PIN: ${offerRes.error}`);
    assert.ok(offerRes.id);

    // ----------------------------------------------------
    // 5. Complete file upload & WhatsApp handoff link verification
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
    // 6. Automatic deletion after TTL
    // ----------------------------------------------------
    await sleep(4000); // Wait for TTL (2000ms in test) and 1-second sweep
    const expiredDl = await fetch(waDownloadUrl);
    assert.equal(expiredDl.status, 404); // File is gone!

    socket.disconnect();
    console.log('  ✓ E2E Complete Workflow passed with all core requirements verified without PIN!');
  } catch (err) {
    console.error('E2E workflow failed at step:', err);
    throw err;
  } finally {
    srv.kill();
  }
});
