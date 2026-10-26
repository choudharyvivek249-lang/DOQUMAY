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

// Server-side pepper for low-entropy 4-digit PIN protection
const PIN_PEPPER = process.env.PIN_PEPPER || 'doqumay-send-pin-pepper-secret-2026';

// In-memory cache for ultra-fast lookups (synchronized with persistent database)
const accounts = new Map(); // lowercase normalized username -> account object

// Send Authorizations map: sendAuthToken -> { id, username, recipient, fileCount, filesUsed, expiresAt, batchId }
const sendAuthorizations = new Map();

// Abuse tracker for 4-digit PIN verification rate limiting:
// trackerKey -> { attempts: number, lockedUntil: number, lastAttempt: number }
const pinAbuseTracker = new Map();

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
 * Validates a personal 4-digit numeric Send PIN.
 * Accurately accepts PINs with leading zeroes such as "0427".
 */
export function validatePin(pin) {
  if (pin === undefined || pin === null) return '4-digit Send PIN is required.';
  const s = String(pin).trim();
  if (!/^\d{4}$/.test(s)) {
    return 'Send PIN must contain exactly 4 numeric digits (0–9).';
  }
  return null;
}

/** Hashes a 4-digit PIN with salt and server-side pepper */
export function hashPin(pin, salt) {
  const clean = String(pin).trim();
  return crypto.scryptSync(clean + PIN_PEPPER, salt, 32).toString('hex');
}

/** Verifies a 4-digit PIN against stored hash, supporting backward-compatible unpeppered upgrade */
export function verifyPinHash(pin, user) {
  if (!user || !user.pinHash || !user.salt) return false;
  const clean = String(pin).trim();

  // Try peppered hash
  const testHash = hashPin(clean, user.salt);
  if (crypto.timingSafeEqual(Buffer.from(testHash), Buffer.from(user.pinHash))) {
    return true;
  }

  // Fallback to legacy unpeppered hash for existing test accounts
  const legacyHash = crypto.scryptSync(clean, user.salt, 32).toString('hex');
  if (crypto.timingSafeEqual(Buffer.from(legacyHash), Buffer.from(user.pinHash))) {
    // Automatically upgrade to peppered hash
    user.pinHash = testHash;
    dbUpdateUser(user.username, { pinHash: testHash }).catch(() => {});
    return true;
  }

  return false;
}

/** Rate limiting check for 4-digit PIN */
function checkPinLockout(username, ip = '') {
  const now = Date.now();
  const keys = [username.toLowerCase(), `${username.toLowerCase()}:${ip}`];

  for (const k of keys) {
    const entry = pinAbuseTracker.get(k);
    if (entry && entry.lockedUntil > now) {
      const remainingSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
      return {
        locked: true,
        remainingSeconds,
        error: `Too many incorrect PIN attempts. Account locked for ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}.`,
      };
    }
  }
  return { locked: false };
}

function recordPinFailure(username, ip = '') {
  const now = Date.now();
  const keys = [username.toLowerCase(), `${username.toLowerCase()}:${ip}`];

  let maxAttempts = 0;
  for (const k of keys) {
    const entry = pinAbuseTracker.get(k) || { attempts: 0, lockedUntil: 0, lastAttempt: now };
    if (now - entry.lastAttempt > 15 * 60 * 1000) {
      entry.attempts = 0;
    }
    entry.attempts += 1;
    entry.lastAttempt = now;

    if (entry.attempts >= 5) {
      entry.lockedUntil = now + 5 * 60 * 1000; // 5 minute lockout
    }
    pinAbuseTracker.set(k, entry);
    if (entry.attempts > maxAttempts) maxAttempts = entry.attempts;
  }

  const attemptsLeft = Math.max(0, 5 - maxAttempts);
  return {
    attempts: maxAttempts,
    attemptsLeft,
    locked: maxAttempts >= 5,
    lockSeconds: maxAttempts >= 5 ? 300 : 0,
  };
}

function resetPinAbuse(username, ip = '') {
  const userKey = username.toLowerCase();
  pinAbuseTracker.delete(userKey);
  for (const k of pinAbuseTracker.keys()) {
    if (k.startsWith(`${userKey}:`)) {
      pinAbuseTracker.delete(k);
    }
  }
}

/**
 * Register a persistent user account with a 4-digit Send PIN.
 * Persists to database with stable internal ID. Plaintext PIN is never stored or returned.
 */
export async function registerUser(username, password, pin = '1234', confirmPin, displayName) {
  const userErr = validateUsername(username);
  if (userErr) return { ok: false, error: userErr };

  const passErr = validatePassword(password);
  if (passErr) return { ok: false, error: passErr };

  const effectivePin = (pin === undefined || pin === null) ? '1234' : pin;
  const pinErr = validatePin(effectivePin);
  if (pinErr) return { ok: false, error: pinErr };

  const cleanPin = String(effectivePin).trim();
  if (confirmPin !== undefined && confirmPin !== null) {
    const cleanConfirm = String(confirmPin).trim();
    if (cleanPin !== cleanConfirm) {
      return { ok: false, error: 'Send PIN confirmation does not match.' };
    }
  }

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
  const pinHash = hashPin(cleanPin, salt);
  const token = crypto.randomBytes(24).toString('base64url');
  const name = (displayName && String(displayName).trim()) || cleanUser;
  const now = Date.now();

  const user = {
    id,
    username: cleanUser,
    displayName: name,
    salt,
    hash,
    pinHash,
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

  // NEVER return plaintext PIN in API response!
  return {
    ok: true,
    user: { id, username: cleanUser, displayName: name, token },
  };
}

/**
 * Log in to an existing persistent account.
 * Preserves the existing 4-digit PIN. Never silently replaces or resets it!
 */
export async function loginUser(username, password, pin) {
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

  if (pin) {
    const pinMatch = verifyPinHash(pin, user);
    if (!pinMatch) {
      return { ok: false, error: 'Incorrect 4-digit Security PIN.' };
    }
  }

  // Refresh auth token on login
  user.token = crypto.randomBytes(24).toString('base64url');
  user.updatedAt = Date.now();
  await dbUpdateUser(user.username, { token: user.token });
  accounts.set(key, user);

  // NEVER return plaintext PIN! Existing pinHash is safely preserved.
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
 * Excludes sensitive hashes (hash, salt, pinHash).
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

export function hasSendPinConfigured(username) {
  if (!username) return false;
  const key = normalizeUsername(username);
  const user = accounts.get(key);
  return Boolean(user && user.pinHash);
}

export function countAccounts() {
  return accounts.size;
}

/**
 * Verifies a sender's 4-digit Send PIN on the server, enforcing rate limits and lockouts.
 * Upon successful verification, generates a short-lived, single-use Send Authorization Token.
 */
export async function verifySendPin(username, token, pin, { recipient, fileCount = 1, batchId = '', ip = '' } = {}) {
  if (!username) return { ok: false, error: 'Sender username is required.' };
  if (!verifyToken(username, token)) {
    return { ok: false, error: 'Unauthorized. Please log in to your DoquMay account.' };
  }

  const key = normalizeUsername(username);
  let user = accounts.get(key);
  if (!user) {
    user = await dbGetUserByUsername(key);
    if (user) accounts.set(key, user);
  }
  if (!user) return { ok: false, error: 'User account not found.' };

  // Check rate limit & lockout
  const lockout = checkPinLockout(username, ip);
  if (lockout.locked) {
    return {
      ok: false,
      error: lockout.error,
      locked: true,
      remainingSeconds: lockout.remainingSeconds,
    };
  }

  // Validate PIN format
  const pinErr = validatePin(pin);
  if (pinErr) {
    const failInfo = recordPinFailure(username, ip);
    return {
      ok: false,
      error: pinErr,
      attempts: failInfo.attempts,
      attemptsLeft: failInfo.attemptsLeft,
      locked: failInfo.locked,
      remainingSeconds: failInfo.lockSeconds,
    };
  }

  // Verify PIN against stored hash
  const isMatch = verifyPinHash(pin, user);
  if (!isMatch) {
    const failInfo = recordPinFailure(username, ip);
    let msg = 'Incorrect 4-digit Send PIN.';
    if (failInfo.locked) {
      msg = `Too many incorrect attempts. Account locked for ${failInfo.lockSeconds} seconds.`;
    } else if (failInfo.attemptsLeft <= 2) {
      msg = `Incorrect 4-digit Send PIN. ${failInfo.attemptsLeft} attempt${failInfo.attemptsLeft === 1 ? '' : 's'} remaining.`;
    }
    return {
      ok: false,
      error: msg,
      attempts: failInfo.attempts,
      attemptsLeft: failInfo.attemptsLeft,
      locked: failInfo.locked ? true : undefined,
      remainingSeconds: failInfo.lockSeconds,
    };
  }

  // Successful verification! Reset failed attempts
  resetPinAbuse(username, ip);

  // Generate single-use Send Authorization Token
  const sendAuthToken = crypto.randomBytes(24).toString('base64url');
  const cleanRecipient = recipient ? normalizeUsername(recipient) : null;
  const count = Math.max(1, parseInt(fileCount, 10) || 1);
  const now = Date.now();

  const authRecord = {
    id: crypto.randomUUID(),
    token: sendAuthToken,
    username: user.username,
    recipient: cleanRecipient,
    fileCount: count,
    filesUsed: 0,
    batchId: batchId || `batch-${now}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    expiresAt: now + 5 * 60 * 1000, // Valid for 5 minutes
  };

  sendAuthorizations.set(sendAuthToken, authRecord);

  return {
    ok: true,
    sendAuthToken,
    expiresInSeconds: 300,
    batchId: authRecord.batchId,
  };
}

/**
 * Consumes a single-use send authorization token on the server.
 */
export function consumeSendAuthorization(token, { username, recipient } = {}) {
  if (!token) {
    return { ok: false, error: 'Send authorization token required.' };
  }

  const auth = sendAuthorizations.get(token);
  if (!auth) {
    return { ok: false, error: 'Send PIN authorization token not found or already consumed.' };
  }

  const now = Date.now();
  if (now > auth.expiresAt) {
    sendAuthorizations.delete(token);
    return { ok: false, error: 'Send authorization token has expired. Please verify your PIN again.' };
  }

  if (username && auth.username !== normalizeUsername(username)) {
    return { ok: false, error: 'Send authorization user mismatch.' };
  }

  if (recipient) {
    const cleanRecipient = normalizeUsername(recipient);
    if (auth.recipient && auth.recipient !== cleanRecipient) {
      return { ok: false, error: 'Send authorization recipient mismatch: not valid for this recipient.' };
    }
  }

  auth.filesUsed += 1;
  if (auth.filesUsed >= auth.fileCount) {
    sendAuthorizations.delete(token);
  }

  return { ok: true, batchId: auth.batchId };
}

/** Authenticated PIN change */
export async function changePin(username, token, currentCredential, newPin, confirmNewPin) {
  if (!verifyToken(username, token)) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const key = normalizeUsername(username);
  let user = accounts.get(key);
  if (!user) {
    user = await dbGetUserByUsername(key);
    if (user) accounts.set(key, user);
  }
  if (!user) return { ok: false, error: 'User not found.' };

  const cred = String(currentCredential || '').trim();
  const isPinMatch = /^\d{4}$/.test(cred) && verifyPinHash(cred, user);
  const testHash = crypto.scryptSync(cred, user.salt, 64).toString('hex');
  const isPasswordMatch = crypto.timingSafeEqual(Buffer.from(testHash), Buffer.from(user.hash));

  if (!isPinMatch && !isPasswordMatch) {
    return { ok: false, error: 'Current password or PIN is incorrect.' };
  }

  const pinErr = validatePin(newPin);
  if (pinErr) return { ok: false, error: pinErr };

  const cleanNew = String(newPin).trim();
  if (confirmNewPin !== undefined && confirmNewPin !== null) {
    if (cleanNew !== String(confirmNewPin).trim()) {
      return { ok: false, error: 'New PIN confirmation does not match.' };
    }
  }

  user.pinHash = hashPin(cleanNew, user.salt);
  user.updatedAt = Date.now();
  resetPinAbuse(username);
  await dbUpdateUser(user.username, { pinHash: user.pinHash });
  accounts.set(key, user);

  return { ok: true, message: 'Your 4-digit Send PIN has been updated successfully.' };
}

/** Password-authenticated PIN recovery (forgot PIN) */
export async function recoverPinWithPassword(username, password, newPin, confirmNewPin) {
  if (!username || !password) return { ok: false, error: 'Username and password are required.' };
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

  const pinErr = validatePin(newPin);
  if (pinErr) return { ok: false, error: pinErr };

  const cleanNew = String(newPin).trim();
  if (confirmNewPin !== undefined && confirmNewPin !== null) {
    if (cleanNew !== String(confirmNewPin).trim()) {
      return { ok: false, error: 'New PIN confirmation does not match.' };
    }
  }

  user.pinHash = hashPin(cleanNew, user.salt);
  user.updatedAt = Date.now();
  resetPinAbuse(username);
  await dbUpdateUser(user.username, { pinHash: user.pinHash });
  accounts.set(key, user);

  return { ok: true, message: 'Your 4-digit Send PIN has been recovered and reset successfully.' };
}
