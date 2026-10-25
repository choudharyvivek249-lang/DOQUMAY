import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

// In-memory cache for fast lookups
const accounts = new Map(); // lowercase username -> account object

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  } catch { /* already exists */ }
}

export async function loadAccounts() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
    const list = JSON.parse(raw);
    accounts.clear();
    for (const u of list) {
      if (u && u.username) {
        accounts.set(u.username.toLowerCase(), u);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Error loading accounts:', err);
    accounts.clear();
  }
}

export async function saveAccounts() {
  await ensureDataDir();
  const list = [...accounts.values()];
  await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

export function validateUsername(username) {
  if (typeof username !== 'string') return 'Username is required.';
  const clean = username.trim();
  if (clean.length < 3) return 'Username must be at least 3 characters.';
  if (clean.length > 20) return 'Username must be 20 characters or fewer.';
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) return 'Username can only contain letters, numbers, hyphens, and underscores.';
  return null;
}

export async function registerUser(username, password, pin) {
  const err = validateUsername(username);
  if (err) return { ok: false, error: err };
  if (!password || typeof password !== 'string' || password.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters.' };
  }

  const cleanPin = typeof pin === 'string' ? pin.trim() : '';
  if (cleanPin && !/^\d{4}$/.test(cleanPin)) {
    return { ok: false, error: 'PIN must be exactly 4 numeric digits.' };
  }
  const effectivePin = cleanPin || '1234';

  const clean = username.trim();
  const key = clean.toLowerCase();
  if (accounts.has(key)) {
    return { ok: false, error: 'That username is already taken. Please choose another.' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const pinHash = crypto.scryptSync(effectivePin, salt, 32).toString('hex');
  const token = crypto.randomBytes(24).toString('base64url');

  const user = {
    username: clean,
    displayName: clean,
    salt,
    hash,
    pinHash,
    token,
    createdAt: Date.now(),
  };

  accounts.set(key, user);
  await saveAccounts();

  return {
    ok: true,
    user: { username: clean, displayName: clean, token, pin: effectivePin },
  };
}

export async function loginUser(username, password, pin) {
  if (!username || !password) return { ok: false, error: 'Please enter your username and password.' };
  const key = username.trim().toLowerCase();
  const user = accounts.get(key);
  if (!user) return { ok: false, error: 'Invalid username or password.' };

  const testHash = crypto.scryptSync(password, user.salt, 64).toString('hex');
  const match = crypto.timingSafeEqual(Buffer.from(testHash), Buffer.from(user.hash));
  if (!match) return { ok: false, error: 'Invalid username or password.' };

  const cleanPin = typeof pin === 'string' ? pin.trim() : '';
  if (user.pinHash && cleanPin) {
    if (!/^\d{4}$/.test(cleanPin)) {
      return { ok: false, error: 'PIN must be exactly 4 numeric digits.' };
    }
    const testPinHash = crypto.scryptSync(cleanPin, user.salt, 32).toString('hex');
    const pinMatch = crypto.timingSafeEqual(Buffer.from(testPinHash), Buffer.from(user.pinHash));
    if (!pinMatch) {
      return { ok: false, error: 'Incorrect 4-digit Security PIN.' };
    }
  } else if (/^\d{4}$/.test(cleanPin)) {
    user.pinHash = crypto.scryptSync(cleanPin, user.salt, 32).toString('hex');
  }

  // Refresh token on login
  user.token = crypto.randomBytes(24).toString('base64url');
  await saveAccounts();

  return {
    ok: true,
    user: { username: user.username, displayName: user.displayName, token: user.token, pin: cleanPin || '1234' },
  };
}

export function verifyToken(username, token) {
  if (!username || !token) return false;
  const user = accounts.get(username.trim().toLowerCase());
  return Boolean(user && user.token === token);
}

export function getUser(username) {
  if (!username) return null;
  const user = accounts.get(username.trim().toLowerCase());
  if (!user) return null;
  return {
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

export function countAccounts() {
  return accounts.size;
}
