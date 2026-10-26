import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const ACCOUNTS_BACKUP_FILE = path.join(DATA_DIR, 'accounts.bak.json');
const SEED_ACCOUNTS_FILE = path.join(__dirname, 'data', 'accounts.seed.json');

// Server-side pepper for low-entropy 4-digit PIN protection
const PIN_PEPPER = process.env.PIN_PEPPER || 'doqumay-send-pin-pepper-secret-2026';

// In-memory cache for fast lookups
const accounts = new Map(); // lowercase normalized username -> account object

// Send Authorizations map: sendAuthToken -> { id, username, recipient, fileCount, filesUsed, expiresAt, batchId }
const sendAuthorizations = new Map();

// Abuse tracker for 4-digit PIN verification rate limiting:
// trackerKey -> { attempts: number, lockedUntil: number, lastAttempt: number }
const pinAbuseTracker = new Map();

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  } catch { /* already exists */ }
}

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

export async function loadAccounts() {
  await ensureDataDir();
  let loaded = false;

  // 1. Try reading primary accounts.json
  try {
    if (fsSync.existsSync(ACCOUNTS_FILE)) {
      const raw = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        accounts.clear();
        for (const u of list) {
          if (u && u.username) {
            accounts.set(normalizeUsername(u.username), u);
          }
        }
        loaded = true;
      }
    }
  } catch (err) {
    console.error('Error loading primary accounts.json:', err.message);
  }

  // 2. Fallback to backup if primary was corrupt or missing
  if (!loaded || accounts.size === 0) {
    try {
      if (fsSync.existsSync(ACCOUNTS_BACKUP_FILE)) {
        const raw = await fs.readFile(ACCOUNTS_BACKUP_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          for (const u of list) {
            if (u && u.username) accounts.set(normalizeUsername(u.username), u);
          }
          loaded = true;
          // Restore primary from backup
          await saveAccounts();
        }
      }
    } catch { /* ignore */ }
  }

  // 3. Fallback to seed file if brand-new container instance
  if (!loaded || accounts.size === 0) {
    try {
      if (fsSync.existsSync(SEED_ACCOUNTS_FILE)) {
        const raw = await fs.readFile(SEED_ACCOUNTS_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const u of list) {
            if (u && u.username) accounts.set(normalizeUsername(u.username), u);
          }
          await saveAccounts();
        }
      }
    } catch { /* ignore */ }
  }
}

/**
 * Atomically saves accounts to disk using a temp file and rename,
 * ensuring no partial writes or corruption upon sudden process exit.
 */
export async function saveAccounts() {
  await ensureDataDir();
  const list = [...accounts.values()];
  const json = JSON.stringify(list, null, 2);
  const tmp = path.join(DATA_DIR, `.accounts.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await fs.writeFile(tmp, json, 'utf-8');
    await fs.rename(tmp, ACCOUNTS_FILE);
    // Write secondary backup asynchronously
    fs.writeFile(ACCOUNTS_BACKUP_FILE, json, 'utf-8').catch(() => {});
  } catch (err) {
    console.error('Failed to save accounts atomically:', err.message);
    try { await fs.writeFile(ACCOUNTS_FILE, json, 'utf-8'); } catch {}
  }
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
    saveAccounts().catch(() => {});
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
    // Reset attempts if last attempt was more than 15 minutes ago
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
 * Register a persistent user account with a mandatory 4-digit Send PIN.
 * Plaintext PIN is never saved or returned in responses.
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
  if (accounts.has(key) || getUser(key)) {
    return { ok: false, error: 'That username is already taken. Please choose another.' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const pinHash = hashPin(cleanPin, salt);
  const token = crypto.randomBytes(24).toString('base64url');
  const name = (displayName && String(displayName).trim()) || cleanUser;

  const user = {
    username: cleanUser,
    displayName: name,
    salt,
    hash,
    pinHash,
    token,
    createdAt: Date.now(),
  };

  accounts.set(key, user);
  await saveAccounts();

  // NEVER return plaintext PIN in API response!
  return {
    ok: true,
    user: { username: cleanUser, displayName: name, token },
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
    getUser(key);
    user = accounts.get(key);
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
  await saveAccounts();

  // NEVER return plaintext PIN! Existing pinHash is safely preserved.
  return {
    ok: true,
    user: { username: user.username, displayName: user.displayName, token: user.token },
  };
}

export function verifyToken(username, token) {
  if (!username || !token) return false;
  const key = normalizeUsername(username);
  let user = accounts.get(key);
  if (!user) {
    getUser(key);
    user = accounts.get(key);
  }
  return Boolean(user && user.token === token);
}

/**
 * Looks up a permanent recipient profile by username or handle.
 * Normalizes case, removes leading '@', URL-decodes, and falls back to disk
 * if the user record is not currently in memory.
 */
export function getUser(username) {
  const key = normalizeUsername(username);
  if (!key) return null;
  let user = accounts.get(key);
  if (!user) {
    // Disk fallback to ensure lookup works reliably after server restarts
    try {
      if (fsSync.existsSync(ACCOUNTS_FILE)) {
        const raw = fsSync.readFileSync(ACCOUNTS_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const u of list) {
            if (u && u.username) {
              const k = normalizeUsername(u.username);
              accounts.set(k, u);
              if (k === key) user = u;
            }
          }
        }
      }
    } catch { /* best effort */ }
  }
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
    getUser(key);
    user = accounts.get(key);
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

  const pinErr = validatePin(pin);
  if (pinErr) {
    return { ok: false, error: pinErr };
  }

  // Progressive delay for repeated attempts (anti-online guessing)
  const tracker = pinAbuseTracker.get(key);
  if (tracker && tracker.attempts >= 3) {
    await new Promise((r) => setTimeout(r, 1500));
  }

  const isMatch = verifyPinHash(pin, user);
  if (!isMatch) {
    const failure = recordPinFailure(username, ip);
    if (failure.locked) {
      return {
        ok: false,
        error: 'Too many incorrect attempts. Account locked for 5 minutes.',
        locked: true,
        remainingSeconds: 300,
      };
    }
    return {
      ok: false,
      error: `Incorrect 4-digit Send PIN. ${failure.attemptsLeft} attempt${failure.attemptsLeft === 1 ? '' : 's'} remaining before temporary lockout.`,
      attemptsLeft: failure.attemptsLeft,
    };
  }

  // Correct PIN! Clear abuse counters
  resetPinAbuse(username, ip);

  // Issue single-use, short-lived send authorization
  const count = Math.max(1, parseInt(fileCount, 10) || 1);
  const cleanRecipient = String(recipient || '').trim().toLowerCase().replace(/^@/, '');
  const sendAuthToken = crypto.randomBytes(24).toString('base64url');

  const authRecord = {
    token: sendAuthToken,
    username: key,
    recipient: cleanRecipient,
    fileCount: count,
    filesUsed: 0,
    batchId: batchId || crypto.randomUUID(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5-minute TTL
  };

  sendAuthorizations.set(sendAuthToken, authRecord);

  // Clean old authorizations
  const now = Date.now();
  for (const [tok, rec] of sendAuthorizations.entries()) {
    if (rec.expiresAt <= now) sendAuthorizations.delete(tok);
  }

  return {
    ok: true,
    sendAuthToken,
    expiresAt: authRecord.expiresAt,
    authorizedCount: count,
  };
}

/**
 * Validates and consumes a Send Authorization Token for an outgoing file operation.
 * Binds the authorization to the correct user and recipient.
 */
export function consumeSendAuthorization(token, { username, recipient } = {}) {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'Send authorization token is required. Please verify your 4-digit Send PIN.' };
  }

  const auth = sendAuthorizations.get(token);
  if (!auth) {
    return { ok: false, error: 'Send authorization not found or already consumed. Please verify your 4-digit Send PIN.' };
  }

  const now = Date.now();
  if (auth.expiresAt <= now) {
    sendAuthorizations.delete(token);
    return { ok: false, error: 'Send authorization has expired. Please verify your 4-digit Send PIN.' };
  }

  if (username) {
    const cleanUser = normalizeUsername(username);
    if (auth.username && auth.username !== cleanUser) {
      return { ok: false, error: 'Send authorization user mismatch: belongs to a different user account.' };
    }
  }

  if (recipient) {
    const cleanRecipient = normalizeUsername(recipient);
    if (auth.recipient && auth.recipient !== cleanRecipient) {
      return { ok: false, error: 'Send authorization recipient mismatch: not valid for this recipient.' };
    }
  }

  auth.filesUsed += 1;
  // If all authorized files in the batch have been consumed, revoke the token
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
    getUser(key);
    user = accounts.get(key);
  }
  if (!user) return { ok: false, error: 'User not found.' };

  // Validate current credential (can be account password or current PIN)
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
  resetPinAbuse(username);
  await saveAccounts();

  return { ok: true, message: 'Your 4-digit Send PIN has been updated successfully.' };
}

/** Password-authenticated PIN recovery (forgot PIN) */
export async function recoverPinWithPassword(username, password, newPin, confirmNewPin) {
  if (!username || !password) return { ok: false, error: 'Username and password are required.' };
  const key = normalizeUsername(username);
  let user = accounts.get(key);
  if (!user) {
    getUser(key);
    user = accounts.get(key);
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
  resetPinAbuse(username);
  await saveAccounts();

  return { ok: true, message: 'Your 4-digit Send PIN has been recovered and reset successfully.' };
}

