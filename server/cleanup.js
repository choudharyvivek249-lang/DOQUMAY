import cron from 'node-cron';
import fs from 'node:fs/promises';
import { CANCEL_RECORD_TTL_MS, FILE_TTL_MS, SESSION_TTL_MS, STORAGE_DIR, SWEEP_CRON } from './config.js';
import { qrTokens, rooms, transfers, users } from './state.js';
import { removeFile, filePath } from './storage.js';
import { emitUpdate } from './socketHandlers.js';

/**
 * Central cleanup: deletes expired files, dead QR tokens, stale sessions,
 * orphaned temp files, and cancelled transfer records.
 * This is the SINGLE place all temporary data expiration is enforced.
 */
export async function sweep(io) {
  const now = Date.now();

  // 1. Expire temporary QR tokens
  for (const [token, q] of qrTokens) {
    if (q.expiresAt <= now) qrTokens.delete(token);
  }

  // 2. Expire transfers — files, metadata, download keys
  for (const t of [...transfers.values()]) {
    if (t.expiresAt > now) continue;
    await removeFile(t);
    if (t.status === 'ready' || t.status === 'offered' || t.status === 'accepted' || t.status === 'uploading') {
      t.status = 'expired';
      if (io) emitUpdate(io, t); // tells phones the file is gone
    }
    transfers.delete(t.id);
  }

  // 3. Expire guest user sessions (non-account in-memory users)
  for (const [socketId, user] of users) {
    if (!user.username && user.createdAt && (now - user.createdAt > SESSION_TTL_MS)) {
      // Only remove if socket is actually disconnected
      const socket = io?.sockets?.sockets?.get(socketId);
      if (!socket || !socket.connected) {
        users.delete(socketId);
      }
    }
  }

  // 4. Orphaned files: anything on disk that no transfer owns and is older than FILE_TTL_MS
  try {
    for (const name of await fs.readdir(STORAGE_DIR)) {
      if (transfers.has(name)) continue;
      const st = await fs.stat(filePath(name)).catch(() => null);
      if (st && now - st.mtimeMs > FILE_TTL_MS) {
        await fs.rm(filePath(name), { force: true });
      }
    }
  } catch { /* storage dir missing – nothing to do */ }
}

/**
 * Startup cleanup: runs immediately when the server boots.
 * Wipes any expired data left from previous crashes.
 */
export async function startupCleanup() {
  console.log('[Cleanup] Running startup cleanup…');
  await sweep(null);
  console.log('[Cleanup] Startup cleanup complete.');
}

export function startCleanup(io) {
  return cron.schedule(SWEEP_CRON, () => sweep(io).catch((e) => console.error('[cleanup]', e)));
}
