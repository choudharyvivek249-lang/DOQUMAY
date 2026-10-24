import fs from 'node:fs/promises';
import path from 'node:path';
import { STORAGE_DIR } from './config.js';

export const filePath = (id) => path.join(STORAGE_DIR, id);

export async function initStorage() {
  await fs.rm(STORAGE_DIR, { recursive: true, force: true }); // zero permanent storage: start clean
  await fs.mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 });
}

export async function removeFile(t) {
  try { await t.handle?.close(); } catch { /* already closed */ }
  t.handle = null;
  await fs.rm(filePath(t.id), { force: true });
}

export async function wipeStorage() {
  await fs.rm(STORAGE_DIR, { recursive: true, force: true });
}
