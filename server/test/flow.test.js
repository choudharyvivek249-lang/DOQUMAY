// End-to-end test of the server: pairing, consent, chunked transfer, download, rejection, expiry.
// Runs the real server on port 3055 with short timers (QR 2s, files 5s).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const PORT = 3055, BASE = `http://localhost:${PORT}`;
const srv = spawn('node', [fileURLToPath(new URL('../index.js', import.meta.url))], {
  env: { ...process.env, PORT, QR_TTL_MS: 2000, FILE_TTL_MS: 5000, SWEEP_CRON: '*/1 * * * * *', STORAGE_DIR: '/tmp/documay-test' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await once(srv.stdout, 'data');

const emit = (s, ev, p = {}) => new Promise((r) => s.emit(ev, p, r));
const wait = (s, ev) => new Promise((r) => s.once(ev, r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const connect = async (name) => { const s = io(BASE, { transports: ['websocket'] }); await once(s, 'connect'); await emit(s, 'session:start', { name }); return s; };
let passed = 0; const ok = (m) => { passed++; console.log('  ✓', m); };

try {
  const rahul = await connect('Rahul Sharma'), priya = await connect('Priya');

  // --- QR + pairing
  const { token, ttlMs } = await emit(rahul, 'qr:create');
  assert.equal(ttlMs, 2000); ok('QR created with server-side TTL');
  assert.equal((await emit(rahul, 'qr:scan', { token })).ok, false); ok('cannot scan your own QR');
  const readyP = wait(rahul, 'room:ready'), readyP2 = wait(priya, 'room:ready');
  assert.equal((await emit(priya, 'qr:scan', { token })).ok, true);
  const [r1, r2] = await Promise.all([readyP, readyP2]);
  assert.equal(r2.peer.name, 'Rahul Sharma'); assert.equal(r1.peer.name, 'Priya'); ok('1-to-1 room created, both sides told who they are paired with');
  assert.equal((await emit(priya, 'qr:scan', { token })).ok, false); ok('a QR works only once');

  // --- expired QR
  const t2 = (await emit(rahul, 'qr:create')).token; await sleep(2200);
  const exp = await emit(priya, 'qr:scan', { token: t2 });
  assert.equal(exp.ok, false); assert.match(exp.error, /expired/); ok('QR expires after its TTL');

  // --- rules & 4-digit PIN security
  assert.equal((await emit(priya, 'file:offer', { name: 'Report.pdf', size: 100 })).ok, false); ok('rejects file before 4-digit PIN verified');
  assert.equal((await emit(priya, 'room:verify_pin', { pin: '0000' })).ok, false); ok('rejects wrong 4-digit PIN');
  assert.equal((await emit(priya, 'room:verify_pin', { pin: r1.pin })).ok, true); ok('accepts correct 4-digit PIN and unlocks transfer');

  assert.equal((await emit(priya, 'file:offer', { name: 'virus.exe', size: 10 })).ok, false); ok('rejects .exe');
  assert.equal((await emit(priya, 'file:offer', { name: 'big.pdf', size: 100 * 1024 * 1024 + 1 })).ok, false); ok('rejects > 100 MB');

  // --- consent + chunked transfer + download
  const payload = crypto.randomBytes(1_300_000); // 3 chunks of 512 KB
  const incomingP = wait(rahul, 'file:incoming');
  const offer = await emit(priya, 'file:offer', { name: 'Report Q3.pdf', size: payload.length });
  assert.ok(offer.ok); const inc = await incomingP;
  assert.equal(inc.from.name, 'Priya'); assert.equal(inc.name, 'Report Q3.pdf'); ok('receiver is asked for consent');
  const bad = await emit(priya, 'file:chunk', { id: offer.id, offset: 0, data: payload.subarray(0, 10) });
  assert.equal(bad.ok, false); ok('no chunks before Accept');
  const updates = []; rahul.on('transfer:update', (u) => updates.push(u));
  assert.ok((await emit(rahul, 'file:accept', { id: offer.id })).ok);
  let off = 0; const CH = 512 * 1024;
  while (off < payload.length) { const part = payload.subarray(off, off + CH); assert.ok((await emit(priya, 'file:chunk', { id: offer.id, offset: off, data: part })).ok); off += part.length; }
  assert.equal((await emit(priya, 'file:chunk', { id: offer.id, offset: 0, data: payload.subarray(0, 5) })).ok, false); ok('out-of-order chunk refused');
  assert.ok((await emit(priya, 'file:complete', { id: offer.id })).ok);
  await sleep(100);
  const done = updates.at(-1); assert.equal(done.status, 'ready'); assert.ok(done.key);
  assert.ok(updates.some((u) => u.status === 'uploading' && u.received > 0 && u.received < payload.length)); ok('receiver sees live progress, then "ready"');
  const dl = await fetch(`${BASE}/api/files/${offer.id}?key=${done.key}`);
  assert.equal(dl.status, 200); assert.match(dl.headers.get('content-disposition'), /attachment; filename\*=UTF-8''Report%20Q3\.pdf/);
  assert.ok(Buffer.from(await dl.arrayBuffer()).equals(payload)); ok('downloaded bytes are identical');
  assert.equal((await fetch(`${BASE}/api/files/${offer.id}?key=wrong`)).status, 404); ok('wrong key → 404');

  // --- reject
  const rejP = wait(priya, 'transfer:update');
  const o2 = await emit(priya, 'file:offer', { name: 'a.png', size: 5 });
  await emit(rahul, 'file:reject', { id: o2.id });
  assert.equal((await rejP).status, 'rejected'); ok('Reject notifies the sender');

  // --- auto-delete after TTL
  const gone = wait(rahul, 'transfer:update');
  await sleep(5500);
  const g = await gone;
  assert.equal((await fetch(`${BASE}/api/files/${offer.id}?key=${done.key}`)).status, 404); ok('file deleted from server after the TTL');

  // --- leaving
  const left = wait(rahul, 'peer:left'); priya.close(); await left; ok('peer:left fires when the other phone disconnects');
  rahul.close();
  console.log(`\n${passed} checks passed`);
} catch (e) { console.error('\nFAILED:', e); process.exitCode = 1; }
finally { srv.kill(); }
