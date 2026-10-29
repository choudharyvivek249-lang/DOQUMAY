import crypto from 'node:crypto';
import {
  closeDb,
  dbCreateUser,
  dbGetAllUsers,
  dbGetUserById,
  dbGetUserByUsername,
  dbUpdateUser,
  initDb,
  readLocalFileRecords,
  saveLocalFileRecords,
} from './db.js';

// In-memory cache for ultra-fast lookups (synchronized with persistent database)
const accounts = new Map(); // lowercase normalized username -> account object

/**
 * Robust username normalization used everywhere in frontend and backend.
 * Handles strings, URL decoding, leading '@', leading paths (/receive/, /to/),
 * whitespace trimming, and lowercasing.
 */
export function normalizeUsername(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let clean = raw.trim();
  try {
    clean = decodeURIComponent(clean);
  } catch { /* use raw */ }
  // Strip leading path segments like /receive/ or /to/ and all leading @ symbols
  clean = clean.replace(/^(?:\/?(?:receive|to|u)\/)?@*/i, '').replace(/\/+$/, '').trim().toLowerCase();
  return clean;
}

/**
 * Loads all persistent accounts from the persistent database into in-memory cache.
 * Never drops, clears, or resets existing database records.
 */
export async function loadAccounts() {
  await initDb();
  accounts.clear();

  try {
    const list = await dbGetAllUsers();
    if (Array.isArray(list)) {
      for (const u of list) {
        if (u && u.username) {
          const key = normalizeUsername(u.username);
          if (!u.id) u.id = crypto.randomUUID();
          accounts.set(key, u);
        }
      }
    }
    console.log(`[Accounts] Loaded ${accounts.size} persistent account(s) into cache.`);
  } catch (err) {
    console.error('[Accounts] Failed to load accounts from database:', err.message);
    // If database threw an error in production, do not silently swallow it
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
  }
}

/**
 * Backward-compatible saveAccounts function
 */
export async function saveAccounts() {
  const list = [...accounts.values()];
  await saveLocalFileRecords(list);
}

export function validateUsername(username) {
  if (typeof username !== 'string') return 'Username is required.';
  const clean = normalizeUsername(username);
  if (!clean) return 'Username is required.';
  if (clean.length < 3) return 'Username must be at least 3 characters.';
  if (clean.length > 20) return 'Username must be 20 characters or fewer.';
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) return 'Username can only contain letters, numbers, hyphens, and underscores.';
  return null;
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string' || password.length < 4) {
    return 'Password must be at least 4 characters.';
  }
  return null;
}

/**
 * Register a persistent user account.
 * Persists to database with stable internal ID. No PIN required.
 */
export async function registerUser(username, password, displayName) {
  const userErr = validateUsername(username);
  if (userErr) return { ok: false, error: userErr };

  const passErr = validatePassword(password);
  if (passErr) return { ok: false, error: passErr };

  const cleanUser = normalizeUsername(username);
  const key = cleanUser;

  // Check uniqueness in cache and persistent database
  if (accounts.has(key)) {
    return { ok: false, error: 'That username is already taken. Please choose another.' };
  }
  const existingInDb = await dbGetUserByUsername(key);
  if (existingInDb) {
    accounts.set(key, existingInDb);
    return { ok: false, error: 'That username is already taken. Please choose another.' };
  }

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const token = crypto.randomBytes(24).toString('base64url');
  const name = (displayName && String(displayName).trim()) || cleanUser;
  const now = Date.now();

  const user = {
    id,
    username: cleanUser,
    displayName: name,
    salt,
    hash,
    token,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await dbCreateUser(user);
    accounts.set(key, user);
  } catch (err) {
    if (err.code === 'UNIQUE_VIOLATION' || err.message?.includes('already taken')) {
      return { ok: false, error: 'That username is already taken. Please choose another.' };
    }
    throw err;
  }

  return {
    ok: true,
    user: { id, username: cleanUser, displayName: name, token },
  };
}

/**
 * Log in to an existing persistent account using username and password.
 */
export async function loginUser(username, password) {
  if (!username || !password) return { ok: false, error: 'Please enter your username and password.' };
  const key = normalizeUsername(username);
  let user = accounts.get(key);
  if (!user) {
    user = await dbGetUserByUsername(key);
    if (user) accounts.set(key, user);
  }
  if (!user) return { ok: false, error: 'Invalid username or password.' };

  const testHash = crypto.scryptSync(password, user.salt, 64).toString('hex');
  const match = crypto.timingSafeEqual(Buffer.from(testHash), Buffer.from(user.hash));
  if (!match) return { ok: false, error: 'Invalid username or password.' };

  // Refresh auth token on login
  user.token = crypto.randomBytes(24).toString('base64url');
  user.updatedAt = Date.now();
  await dbUpdateUser(user.username, { token: user.token });
  accounts.set(key, user);

  return {
    ok: true,
    user: { id: user.id, username: user.username, displayName: user.displayName, token: user.token },
  };
}

export function verifyToken(username, token) {
  if (!username || !token) return false;
  const key = normalizeUsername(username);
  const user = accounts.get(key);
  return Boolean(user && user.token === token);
}

/**
 * Fast synchronous lookup of a public profile from memory cache.
 * Excludes sensitive hashes (hash, salt).
 */
export function getUser(username) {
  const key = normalizeUsername(username);
  if (!key) return null;
  const user = accounts.get(key);
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

/**
 * Asynchronous user resolution: checks cache first, queries persistent database if missing.
 * Propagates database errors so callers can distinguish a database outage from a genuine 404.
 */
export async function resolveUser(username) {
  const key = normalizeUsername(username);
  if (!key) return null;
  let user = accounts.get(key);
  if (!user) {
    user = await dbGetUserByUsername(key);
    if (user) accounts.set(key, user);
  }
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}

export function countAccounts() {
  return accounts.size;
}
