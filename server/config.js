import os from 'node:os';
import path from 'node:path';

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export const PORT = num(process.env.PORT, 3001);
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || true; // set to your site in production

// Product rules (env overrides exist only so the automated test can run in seconds)
export const QR_TTL_MS = num(process.env.QR_TTL_MS, 120 * 1000);            // QR code lives exactly 2 minutes
export const FILE_TTL_MS = num(process.env.FILE_TTL_MS, 10 * 60 * 1000);    // files are deleted 10 minutes after upload
export const SWEEP_CRON = process.env.SWEEP_CRON || '*/10 * * * * *';       // cleanup runs every 10 seconds
export const MAX_FILE_BYTES = 100 * 1024 * 1024;                            // 100 MB per file

// Abuse limits
export const CHUNK_MAX_BYTES = 1024 * 1024;
export const MAX_STORE_BYTES = 1024 * 1024 * 1024; // 1 GB of temp files across all rooms
export const MAX_ACTIVE_PER_USER = 10;

export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(os.tmpdir(), 'documay-files');

const OOXML = 'application/vnd.openxmlformats-officedocument';
export const ALLOWED_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: `${OOXML}.wordprocessingml.document`,
  xls: 'application/vnd.ms-excel',
  xlsx: `${OOXML}.spreadsheetml.sheet`,
  ppt: 'application/vnd.ms-powerpoint',
  pptx: `${OOXML}.presentationml.presentation`,
};
export const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp']);
