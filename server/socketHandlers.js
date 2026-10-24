import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ALLOWED_TYPES, CHUNK_MAX_BYTES, FILE_TTL_MS, MAX_ACTIVE_PER_USER, MAX_FILE_BYTES, MAX_STORE_BYTES, QR_TTL_MS,
} from './config.js';
import { IN_FLIGHT, qrTokens, rooms, storedBytes, transfers, users } from './state.js';
import { filePath, removeFile } from './storage.js';

const reply = (ack, body) => { if (typeof ack === 'function') ack(body); };
const cleanName = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const cleanFile = (s) => cleanName(path.basename(String(s ?? '').replace(/\\/g, '/')), 120);
const fail = (ack, error) => reply(ack, { ok: false, error });

/** Sends the current state of a transfer to both people in the room. */
export function emitUpdate(io, t) {
  io.to(t.senderId).to(t.receiverId).emit('transfer:update', {
    id: t.id,
    status: t.status,
    received: t.received,
    size: t.size,
    ttlMs: Math.max(0, t.expiresAt - Date.now()),
    key: t.status === 'ready' ? t.key : undefined, // download key only ever goes to the two room members
  });
}

async function finish(io, t, status) {
  t.status = status;
  t.expiresAt = Date.now() + 60_000; // keep the tiny record around for a minute so late events resolve
  await removeFile(t);
  emitUpdate(io, t);
}

function leaveRoom(io, user) {
  const room = rooms.get(user.roomId);
  user.roomId = null;
  if (!room) return;
  rooms.delete(room.id);
  for (const id of room.members) {
    const u = users.get(id);
    if (u) u.roomId = null;
    io.sockets.sockets.get(id)?.leave(room.id);
  }
  // Unfinished transfers die with the room; finished files stay downloadable until their 10 minutes are up.
  for (const t of transfers.values()) {
    if (t.roomId === room.id && IN_FLIGHT.has(t.status)) finish(io, t, 'cancelled').catch(() => {});
  }
  const other = room.members.find((id) => id !== user.id);
  if (other) io.to(other).emit('peer:left', { roomId: room.id });
}

export function registerHandlers(io) {
  io.on('connection', (socket) => {
    const me = () => users.get(socket.id);

    const on = (event, fn, { needsUser = true } = {}) => {
      socket.on(event, async (payload, ack) => {
        if (typeof payload === 'function') { ack = payload; payload = {}; }
        try {
          if (needsUser && !me()) return fail(ack, 'Enter your name first.');
          await fn(payload ?? {}, ack);
        } catch (err) {
          console.error(`[${event}]`, err);
          fail(ack, 'Something went wrong. Please try again.');
        }
      });
    };

    const owned = (id, side) => {
      const t = transfers.get(String(id));
      return t && t[side] === socket.id && me()?.roomId === t.roomId ? t : null;
    };

    /* ---------- session ---------- */
    on('session:start', ({ name }, ack) => {
      const clean = cleanName(name, 24);
      if (!clean) return fail(ack, 'Please enter a display name.');
      users.set(socket.id, { id: socket.id, name: clean, roomId: me()?.roomId ?? null, scans: [] });
      reply(ack, { ok: true, me: { id: socket.id, name: clean } });
    }, { needsUser: false });

    /* ---------- QR identity ---------- */
    on('qr:create', (_p, ack) => {
      for (const [token, q] of qrTokens) if (q.ownerId === socket.id) qrTokens.delete(token);
      const token = crypto.randomBytes(18).toString('base64url');
      qrTokens.set(token, { ownerId: socket.id, expiresAt: Date.now() + QR_TTL_MS });
      reply(ack, { ok: true, token, ttlMs: QR_TTL_MS });
    });

    on('qr:scan', ({ token }, ack) => {
      const user = me();
      const now = Date.now();
      user.scans = user.scans.filter((ts) => now - ts < 60_000);
      if (user.scans.length >= 10) return fail(ack, 'Too many attempts. Wait a minute and try again.');
      user.scans.push(now);

      const q = qrTokens.get(String(token));
      if (!q || q.expiresAt <= now) return fail(ack, 'This QR code has expired. Ask them to tap Refresh QR.');
      const owner = users.get(q.ownerId);
      if (!owner) return fail(ack, 'That person is no longer online.');
      if (owner.id === user.id) return fail(ack, 'That’s your own QR code. Scan someone else’s.');

      qrTokens.delete(String(token)); // one scan per QR
      leaveRoom(io, user);
      leaveRoom(io, owner);

      const room = { id: crypto.randomUUID(), members: [user.id, owner.id] };
      rooms.set(room.id, room);
      user.roomId = owner.roomId = room.id;
      io.sockets.sockets.get(user.id)?.join(room.id);
      io.sockets.sockets.get(owner.id)?.join(room.id);

      io.to(user.id).emit('room:ready', { roomId: room.id, role: 'scanner', peer: { id: owner.id, name: owner.name } });
      io.to(owner.id).emit('room:ready', { roomId: room.id, role: 'owner', peer: { id: user.id, name: user.name } });
      reply(ack, { ok: true });
    });

    on('room:leave', () => leaveRoom(io, me()));

    /* ---------- file transfer ---------- */
    on('file:offer', async ({ name, size }, ack) => {
      const user = me();
      const room = rooms.get(user.roomId);
      if (!room) return fail(ack, 'Connect with someone first by scanning a QR code.');
      const receiverId = room.members.find((id) => id !== user.id);
      if (!receiverId || !users.has(receiverId)) return fail(ack, 'The other person is no longer connected.');

      const fileName = cleanFile(name);
      const ext = fileName.split('.').pop().toLowerCase();
      if (!fileName.includes('.') || !ALLOWED_TYPES[ext]) return fail(ack, 'Only photos (PNG, JPG, WEBP), PDF, Word, Excel and PowerPoint files are allowed.');
      if (!Number.isInteger(size) || size <= 0) return fail(ack, 'That file looks empty.');
      if (size > MAX_FILE_BYTES) return fail(ack, 'Files can be up to 100 MB.');
      if (storedBytes() + size > MAX_STORE_BYTES) return fail(ack, 'The server is busy right now. Try again in a few minutes.');
      const active = [...transfers.values()].filter((t) => t.senderId === user.id && IN_FLIGHT.has(t.status)).length;
      if (active >= MAX_ACTIVE_PER_USER) return fail(ack, 'Too many files waiting. Let some finish first.');

      const t = {
        id: crypto.randomUUID(), roomId: room.id, senderId: user.id, receiverId,
        name: fileName, size, ext, mime: ALLOWED_TYPES[ext],
        status: 'offered', received: 0, key: crypto.randomBytes(16).toString('hex'),
        createdAt: Date.now(), expiresAt: Date.now() + FILE_TTL_MS, handle: null, busy: false,
      };
      transfers.set(t.id, t);
      io.to(receiverId).emit('file:incoming', { id: t.id, name: t.name, size: t.size, ts: t.createdAt, from: { id: user.id, name: user.name } });
      reply(ack, { ok: true, id: t.id, ts: t.createdAt });
    });

    on('file:accept', ({ id }, ack) => {
      const t = owned(id, 'receiverId');
      if (!t || t.status !== 'offered') return fail(ack, 'This request is no longer available.');
      t.status = 'accepted';
      emitUpdate(io, t); // the sender's phone starts streaming when it sees "accepted"
      reply(ack, { ok: true });
    });

    on('file:reject', async ({ id }, ack) => {
      const t = owned(id, 'receiverId');
      if (!t || t.status !== 'offered') return fail(ack, 'This request is no longer available.');
      await finish(io, t, 'rejected');
      reply(ack, { ok: true });
    });

    on('file:cancel', async ({ id }, ack) => {
      const t = owned(id, 'senderId') || owned(id, 'receiverId');
      if (!t || !IN_FLIGHT.has(t.status)) return fail(ack, 'Nothing to cancel.');
      await finish(io, t, 'cancelled');
      reply(ack, { ok: true });
    });

    on('file:chunk', async ({ id, offset, data }, ack) => {
      const t = owned(id, 'senderId');
      if (!t || (t.status !== 'accepted' && t.status !== 'uploading')) return fail(ack, 'This transfer is not active.');
      if (t.busy) return fail(ack, 'Chunks arrived out of order.');
      if (!(data instanceof Uint8Array) || data.length === 0 || data.length > CHUNK_MAX_BYTES) return fail(ack, 'Bad chunk.');
      if (offset !== t.received || t.received + data.length > t.size) return fail(ack, 'Chunk does not match the declared file size.');

      t.busy = true;
      try {
        t.handle ??= await fs.open(filePath(t.id), 'w', 0o600);
        await t.handle.write(data, 0, data.length, offset);
        t.received += data.length;
        t.status = 'uploading';
      } finally {
        t.busy = false;
      }
      emitUpdate(io, t);
      reply(ack, { ok: true, received: t.received });
    });

    on('file:complete', async ({ id }, ack) => {
      const t = owned(id, 'senderId');
      if (!t || t.status !== 'uploading') return fail(ack, 'This transfer is not active.');
      if (t.received !== t.size) return fail(ack, 'The file is incomplete.');
      await t.handle.close();
      t.handle = null;
      t.status = 'ready';
      t.expiresAt = Date.now() + FILE_TTL_MS; // the 10-minute clock starts when the file lands
      emitUpdate(io, t);
      reply(ack, { ok: true });
    });

    /* ---------- disconnect ---------- */
    socket.on('disconnect', () => {
      const user = me();
      for (const [token, q] of qrTokens) if (q.ownerId === socket.id) qrTokens.delete(token);
      if (user) leaveRoom(io, user);
      users.delete(socket.id);
    });
  });
}
