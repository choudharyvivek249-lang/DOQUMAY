export const MAX_BYTES = 100 * 1024 * 1024;

// Allowed types → the "kind" used for the badge colour
export const TYPES = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image',
  pdf: 'pdf', doc: 'word', docx: 'word', xls: 'excel', xlsx: 'excel', ppt: 'slides', pptx: 'slides',
};
export const ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(',');

export const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');
export const kindOf = (name) => TYPES[extOf(name)] || 'file';

export function validateFile(file) {
  if (!TYPES[extOf(file.name)]) return 'Only photos (PNG, JPG, WEBP), PDF, Word, Excel and PowerPoint files can be sent.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_BYTES) return 'Files can be up to 100 MB.';
  return null;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Accepts the full link (…/?join=TOKEN), "documay:TOKEN" or the bare token. */
export function parseToken(text) {
  const raw = String(text || '').trim();
  try {
    const t = new URL(raw).searchParams.get('join');
    if (t) return t;
  } catch { /* not a URL */ }
  const m = raw.match(/^(?:documay:)?([A-Za-z0-9_-]{16,64})$/);
  return m ? m[1] : null;
}
