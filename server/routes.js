import crypto from 'node:crypto';
import fs from 'node:fs';
import { Router } from 'express';
import { IMAGE_EXT } from './config.js';
import { transfers } from './state.js';
import { filePath } from './storage.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true }));

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
