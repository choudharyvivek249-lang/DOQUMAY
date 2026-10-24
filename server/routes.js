import crypto from 'node:crypto';
import fs from 'node:fs';
import { Router } from 'express';
import { getUser, loginUser, registerUser, verifyToken } from './accounts.js';
import { IMAGE_EXT } from './config.js';
import { onlineAccounts, transfers } from './state.js';
import { filePath } from './storage.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true }));

// Auth: Register with just unique username and password
router.post('/auth/register', async (req, res) => {
  const { username, password } = req.body || {};
  const result = await registerUser(username, password);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// Auth: Log in with username and password
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const result = await loginUser(username, password);
  if (!result.ok) return res.status(401).json(result);
  res.json(result);
});

// User info: look up a permanent profile by username
router.get('/user/:username', (req, res) => {
  const u = getUser(req.params.username);
  if (!u) return res.status(404).json({ ok: false, error: 'User not found.' });
  const key = u.username.toLowerCase();
  const isOnline = onlineAccounts.has(key) && onlineAccounts.get(key).size > 0;
  res.json({ ok: true, user: { ...u, isOnline } });
});

// Pending drops for an authenticated user
router.get('/drops', (req, res) => {
  const username = String(req.headers['x-auth-user'] || '');
  const token = String(req.headers['x-auth-token'] || '');
  if (!verifyToken(username, token)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  }

  const key = username.toLowerCase();
  const now = Date.now();
  const list = [];
  for (const t of transfers.values()) {
    if (t.isDrop && t.toUsername === key && t.status === 'ready' && t.expiresAt > now) {
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
  res.json({ ok: true, drops: list });
});

// Download / preview. Needs the per-file key that only the two people in the room received.
router.get('/files/:id', (req, res) => {
  const t = transfers.get(req.params.id);
  const key = String(req.query.key || '');
  const valid = t && t.status === 'ready' && key.length === t.key.length
    && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(t.key));
  if (!valid) return res.status(404).json({ error: 'This file is gone. Files are deleted 10 minutes after they are sent.' });

  const inline = req.query.inline === '1' && IMAGE_EXT.has(t.ext);
  res.set({
    'Content-Type': t.mime, // from our allow-list, never from the uploader
    'Content-Length': String(t.size),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(t.name)}`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(filePath(t.id)).on('error', () => res.destroy()).pipe(res);
});

export default router;
