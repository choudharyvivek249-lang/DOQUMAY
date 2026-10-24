import cron from 'node-cron';
import fs from 'node:fs/promises';
import { FILE_TTL_MS, STORAGE_DIR, SWEEP_CRON } from './config.js';
import { qrTokens, transfers } from './state.js';
import { removeFile, filePath } from './storage.js';
import { emitUpdate } from './socketHandlers.js';

/** Deletes expired files, dead QR tokens and orphaned temp files. */
export async function sweep(io) {
  const now = Date.now();

  for (const [token, q] of qrTokens) if (q.expiresAt <= now) qrTokens.delete(token);

  for (const t of [...transfers.values()]) {
    if (t.expiresAt > now) continue;
    await removeFile(t);
    if (t.status === 'ready' || t.status === 'offered' || t.status === 'accepted' || t.status === 'uploading') {
      t.status = 'expired';
      emitUpdate(io, t); // tells both phones the file is gone
    }
    transfers.delete(t.id);
  }

  // Orphans (e.g. left behind by a crash): anything on disk that no transfer owns and is older than the TTL
  try {
    for (const name of await fs.readdir(STORAGE_DIR)) {
      if (transfers.has(name)) continue;
      const st = await fs.stat(filePath(name)).catch(() => null);
      if (st && now - st.mtimeMs > FILE_TTL_MS) await fs.rm(filePath(name), { force: true });
    }
  } catch { /* storage dir missing – nothing to do */ }
}

export function startCleanup(io) {
  return cron.schedule(SWEEP_CRON, () => sweep(io).catch((e) => console.error('[cleanup]', e)));
}
