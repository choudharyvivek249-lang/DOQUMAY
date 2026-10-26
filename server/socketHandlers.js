import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { consumeSendAuthorization, getUser, normalizeUsername, verifySendPin, verifyToken } from './accounts.js';


import {
  ALLOWED_TYPES, CHUNK_MAX_BYTES, FILE_TTL_MS, MAX_ACTIVE_PER_USER, MAX_FILE_BYTES, MAX_STORE_BYTES, QR_TTL_MS,
} from './config.js';
import { IN_FLIGHT, onlineAccounts, qrTokens, rooms, storedBytes, transfers, users } from './state.js';
import { filePath, removeFile } from './storage.js';

const reply = (ack, body) => { if (typeof ack === 'function') ack(body); };
const cleanName = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const cleanFile = (s) => cleanName(path.basename(String(s ?? '').replace(/\\/g, '/')), 120);
const fail = (ack, error) => reply(ack, { ok: false, error });

/** Sends the current state of a transfer to participants. */
export function emitUpdate(io, t) {
  if (t.isDrop) {
    // Notify sender of progress / completion
    io.to(t.senderId).emit('transfer:update', {
      id: t.id,
      status: t.status,
      received: t.received,
      size: t.size,
      ttlMs: Math.max(0, t.expiresAt - Date.now()),
      key: t.status === 'ready' ? t.key : undefined,
    });
    // If ready, notify recipient online socket(s)
    if (t.status === 'ready') {
      const recipientSockets = onlineAccounts.get(t.toUsername);
      if (recipientSockets) {
        for (const sockId of recipientSockets) {
          io.to(sockId).emit('drop:received', {
            id: t.id,
            name: t.name,
            size: t.size,
            mime: t.mime,
            senderName: t.senderName,
            ts: t.createdAt,
            expiresAt: t.expiresAt,
            key: t.key,
          });
        }
      }
    }
    return;
  }

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
      if (!t) return null;
      if (t.isDrop) {
        if (side === 'senderId' && t.senderId === socket.id) return t;
        if (side === 'receiverId' && me()?.username === t.toUsername) return t;
        return null;
      }
      return t && t[side] === socket.id && me()?.roomId === t.roomId ? t : null;
    };

    /* ---------- session ---------- */
    on('session:start', ({ name, username, token }, ack) => {
      const clean = cleanName(name, 24);
      if (!clean) return fail(ack, 'Please enter a display name.');

      let verifiedUsername = null;
      if (username && token && verifyToken(username, token)) {
        verifiedUsername = username.toLowerCase();
        if (!onlineAccounts.has(verifiedUsername)) {
          onlineAccounts.set(verifiedUsername, new Set());
        }
        onlineAccounts.get(verifiedUsername).add(socket.id);
      }

      users.set(socket.id, {
        id: socket.id,
        name: clean,
        username: verifiedUsername,
        token: verifiedUsername ? token : null,
        roomId: me()?.roomId ?? null,
        scans: [],
      });
      reply(ack, { ok: true, me: { id: socket.id, name: clean, username: verifiedUsername } });
    }, { needsUser: false });

    /* ---------- Send PIN Verification & Authorization ---------- */
    on('auth:verify_send_pin', async ({ username, token, pin, recipient, fileCount, batchId }, ack) => {
      const user = me();
      const effectiveUser = username || user?.username;
      const effectiveToken = token || user?.token;

      if (!effectiveUser || !effectiveToken) {
        return fail(ack, 'Please log in to your DoquMay account before sending.');
      }
      const ip = socket.handshake.address || '';
      const res = await verifySendPin(effectiveUser, effectiveToken, pin, { recipient, fileCount, batchId, ip });
      if (!res.ok) {
        return reply(ack, res);
      }
      reply(ack, res);
    }, { needsUser: false });

    /* ---------- QR identity ---------- */
    on('qr:create', (_p, ack) => {
      for (const [token, q] of qrTokens) if (q.ownerId === socket.id) qrTokens.delete(token);
      const token = crypto.randomBytes(18).toString('base64url');
      qrTokens.set(token, { ownerId: socket.id, expiresAt: Date.now() + QR_TTL_MS });
      reply(ack, { ok: true, token, ttlMs: QR_TTL_MS });
    });

    on('qr:scan', ({ token, username }, ack) => {
      const user = me();
      const now = Date.now();
      user.scans = user.scans.filter((ts) => now - ts < 60_000);
      if (user.scans.length >= 10) return fail(ack, 'Too many attempts. Wait a minute and try again.');
      user.scans.push(now);

      // Handle permanent QR code (@username)
      if (username) {
        const clean = normalizeUsername(username);
        if (!clean) return fail(ack, 'Invalid recipient username.');
        const target = getUser(clean);
        if (!target) return fail(ack, 'That permanent QR account does not exist.');
        const targetKey = target.username.toLowerCase();
        if (user.username === targetKey) return fail(ack, 'That is your own permanent QR code.');


        const targetSockets = onlineAccounts.get(targetKey);
        const targetSocketId = targetSockets ? [...targetSockets][0] : null;
        const owner = targetSocketId ? users.get(targetSocketId) : null;

        if (!owner) {
          return reply(ack, {
            ok: false,
            offline: true,
            user: { username: target.username, displayName: target.displayName },
            error: `${target.displayName} is currently offline. You can drop files to their 24/7 Drop-box!`,
          });
        }

        leaveRoom(io, user);
        leaveRoom(io, owner);

        const pin = String(Math.floor(1000 + Math.random() * 9000));
        const room = {
          id: crypto.randomUUID(),
          members: [user.id, owner.id],
          hostId: owner.id,
          pin,
          verified: false,
        };
        rooms.set(room.id, room);
        user.roomId = owner.roomId = room.id;
        io.sockets.sockets.get(user.id)?.join(room.id);
        io.sockets.sockets.get(owner.id)?.join(room.id);

        io.to(user.id).emit('room:ready', {
          roomId: room.id,
          role: 'scanner',
          peer: { id: owner.id, name: owner.name },
          pin: null,
          isHost: false,
          verified: false,
        });
        io.to(owner.id).emit('room:ready', {
          roomId: room.id,
          role: 'owner',
          peer: { id: user.id, name: user.name },
          pin,
          isHost: true,
          verified: false,
        });
        return reply(ack, { ok: true });
      }

      // Handle standard 1-time token QR
      const q = qrTokens.get(String(token));
      if (!q || q.expiresAt <= now) return fail(ack, 'This QR code has expired. Ask them to tap Refresh QR.');
      const owner = users.get(q.ownerId);
      if (!owner) return fail(ack, 'That person is no longer online.');
      if (owner.id === user.id) return fail(ack, 'That’s your own QR code. Scan someone else’s.');

      qrTokens.delete(String(token)); // one scan per QR
      leaveRoom(io, user);
      leaveRoom(io, owner);

      const pin = String(Math.floor(1000 + Math.random() * 9000));
      const room = {
        id: crypto.randomUUID(),
        members: [user.id, owner.id],
        hostId: owner.id,
        pin,
        verified: false,
      };
      rooms.set(room.id, room);
      user.roomId = owner.roomId = room.id;
      io.sockets.sockets.get(user.id)?.join(room.id);
      io.sockets.sockets.get(owner.id)?.join(room.id);

      io.to(user.id).emit('room:ready', {
        roomId: room.id,
        role: 'scanner',
        peer: { id: owner.id, name: owner.name },
        pin: null,
        isHost: false,
        verified: false,
      });
      io.to(owner.id).emit('room:ready', {
        roomId: room.id,
        role: 'owner',
        peer: { id: user.id, name: user.name },
        pin,
        isHost: true,
        verified: false,
      });
      reply(ack, { ok: true });
    });

    on('room:verify_pin', ({ pin }, ack) => {
      const user = me();
      const room = rooms.get(user?.roomId);
      if (!room) return fail(ack, 'Not in a transfer room.');
      if (room.verified) return reply(ack, { ok: true, verified: true });
      if (String(pin || '').trim() !== String(room.pin).trim()) {
        return fail(ack, 'Incorrect 4-digit PIN. Please check the code on the other device.');
      }
      room.verified = true;
      io.to(room.id).emit('room:verified', { roomId: room.id, verified: true });
      reply(ack, { ok: true, verified: true });
    });

    on('room:authorize_host', (_p, ack) => {
      const user = me();
      const room = rooms.get(user?.roomId);
      if (!room) return fail(ack, 'Not in a transfer room.');
      if (room.hostId !== user.id) return fail(ack, 'Only the host device can authorize.');
      room.verified = true;
      io.to(room.id).emit('room:verified', { roomId: room.id, verified: true });
      reply(ack, { ok: true, verified: true });
    });

    on('room:leave', () => leaveRoom(io, me()));

    /* ---------- permanent drop-box transfers ---------- */
    on('drop:offer', async ({ toUsername, name, size, senderName, sendAuthToken, pin }, ack) => {
      const user = me();
      if (!toUsername) return fail(ack, 'Recipient username is required.');
      const targetUser = getUser(toUsername);
      if (!targetUser) return fail(ack, 'That user account does not exist.');

      // Mandatory 4-digit Send PIN verification on server
      let authorized = false;
      if (sendAuthToken) {
        const authRes = consumeSendAuthorization(sendAuthToken, {
          username: user?.username,
          recipient: targetUser.username,
        });
        if (!authRes.ok) {
          return fail(ack, authRes.error || 'Invalid or expired 4-digit Send PIN authorization.');
        }
        authorized = true;
      } else if (pin && user?.username && user?.token) {
        const ip = socket.handshake.address || '';
        const pinRes = await verifySendPin(user.username, user.token, pin, {
          recipient: targetUser.username,
          fileCount: 1,
          ip,
        });
        if (!pinRes.ok) {
          return fail(ack, pinRes.error || 'Incorrect 4-digit Send PIN.');
        }
        authorized = true;
      }

      if (!authorized) {
        return fail(ack, 'Authorization required: Please verify your 4-digit Send PIN before sending files.');
      }

      const fileName = cleanFile(name);
      const ext = fileName.split('.').pop().toLowerCase();
      if (!fileName.includes('.') || !ALLOWED_TYPES[ext]) {
        return fail(ack, 'Only photos (PNG, JPG, WEBP), PDF, Word, Excel and PowerPoint files are allowed.');
      }
      if (!Number.isInteger(size) || size <= 0) return fail(ack, 'That file looks empty.');
      if (size > MAX_FILE_BYTES) return fail(ack, 'Files can be up to 100 MB.');
      if (storedBytes() + size > MAX_STORE_BYTES) return fail(ack, 'The server is busy right now. Try again in a few minutes.');

      const t = {
        id: crypto.randomUUID(),
        isDrop: true,
        toUsername: targetUser.username.toLowerCase(),
        senderName: cleanName(senderName || user?.name || 'Someone', 24),
        senderId: socket.id,
        name: fileName,
        size,
        ext,
        mime: ALLOWED_TYPES[ext],
        status: 'accepted', // Auto-accepted for drop-box uploads!
        received: 0,
        key: crypto.randomBytes(16).toString('hex'),
        createdAt: Date.now(),
        expiresAt: Date.now() + FILE_TTL_MS,
        handle: null,
        busy: false,
      };
      transfers.set(t.id, t);
      reply(ack, { ok: true, id: t.id, ts: t.createdAt });
    }, { needsUser: false });

    on('account:get_drops', (_p, ack) => {
      const user = me();
      if (!user?.username) return fail(ack, 'You must be logged in.');
      const now = Date.now();
      const list = [];
      for (const t of transfers.values()) {
        if (t.isDrop && t.toUsername === user.username && t.status === 'ready' && t.expiresAt > now) {
          list.push({
            id: t.id,
            name: t.name,
            size: t.size,
            mime: t.mime,
            senderName: t.senderName,
            ts: t.createdAt,
            expiresAt: t.expiresAt,
            key: t.key,
          });
        }
      }
      reply(ack, { ok: true, drops: list });
    });

    on('account:dismiss_drop', async ({ id }, ack) => {
      const user = me();
      if (!user?.username) return fail(ack, 'You must be logged in.');
      const t = transfers.get(String(id));
      if (t && t.isDrop && t.toUsername === user.username) {
        await removeFile(t);
        transfers.delete(t.id);
      }
      reply(ack, { ok: true });
    });

    /* ---------- file transfer (1-to-1 rooms) ---------- */
    on('file:offer', async ({ name, size, sendAuthToken, pin }, ack) => {
      const user = me();
      const room = rooms.get(user.roomId);
      if (!room) return fail(ack, 'Connect with someone first by scanning a QR code.');
      const receiverId = room.members.find((id) => id !== user.id);
      if (!receiverId || !users.has(receiverId)) return fail(ack, 'The other person is no longer connected.');
      const receiverUser = users.get(receiverId);

      // Verify PIN authorization
      let authorized = false;
      if (sendAuthToken) {
        const authRes = consumeSendAuthorization(sendAuthToken, {
          username: user.username,
          recipient: receiverUser?.username || receiverUser?.name,
        });
        if (!authRes.ok) {
          return fail(ack, authRes.error || 'Invalid or expired 4-digit Send PIN authorization.');
        }
        authorized = true;
      } else if (pin && user.username && user.token) {
        const ip = socket.handshake.address || '';
        const pinRes = await verifySendPin(user.username, user.token, pin, {
          recipient: receiverUser?.username || receiverUser?.name,
          fileCount: 1,
          ip,
        });
        if (!pinRes.ok) {
          return fail(ack, pinRes.error || 'Incorrect 4-digit Send PIN.');
        }
        authorized = true;
      } else if (room.verified) {
        // Fallback for room-level PIN handshake
        authorized = true;
      }

      if (!authorized) {
        return fail(ack, 'Please verify the 4-digit security PIN before sharing files.');
      }

      const fileName = cleanFile(name);
      const ext = fileName.split('.').pop().toLowerCase();
      if (!fileName.includes('.') || !ALLOWED_TYPES[ext]) {
        return fail(ack, 'Only photos (PNG, JPG, WEBP), PDF, Word, Excel and PowerPoint files are allowed.');
      }
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
    }, { needsUser: false });

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
    }, { needsUser: false });

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
    }, { needsUser: false });

    /* ---------- disconnect ---------- */
    socket.on('disconnect', () => {
      const user = me();
      for (const [token, q] of qrTokens) if (q.ownerId === socket.id) qrTokens.delete(token);
      if (user) {
        if (user.username && onlineAccounts.has(user.username)) {
          const set = onlineAccounts.get(user.username);
          set.delete(socket.id);
          if (set.size === 0) onlineAccounts.delete(user.username);
        }
        leaveRoom(io, user);
      }
      users.delete(socket.id);
    });
  });
}
