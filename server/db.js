import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const ACCOUNTS_BACKUP_FILE = path.join(DATA_DIR, 'accounts.bak.json');
const SEED_ACCOUNTS_FILE = path.join(__dirname, 'data', 'accounts.seed.json');

export class DatabaseError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

let pool = null;
let dbConnected = false;
let dbError = null;

export function getDbConfig() {
  const url = process.env.DATABASE_URL;
  if (!url) return { isConfigured: false, provider: 'local_file' };
  return {
    isConfigured: true,
    provider: 'postgresql',
    isProduction: process.env.NODE_ENV === 'production',
  };
}

export function getDbHealth() {
  const config = getDbConfig();
  if (config.isConfigured) {
    return {
      ok: dbConnected,
      provider: 'postgresql',
      connected: dbConnected,
      error: dbError ? 'Database connection failure' : null,
    };
  }
  return {
    ok: true,
    provider: 'local_file',
    connected: true,
    warning: process.env.NODE_ENV === 'production'
      ? 'CRITICAL: Running in production without DATABASE_URL. Ephemeral filesystem will not persist user identities across redeployments.'
      : null,
  };
}

function sanitizeDbUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '[malformed database url]';
  }
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    salt: row.salt,
    hash: row.password_hash,
    pinHash: row.pin_hash,
    token: row.token,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  } catch { /* already exists */ }
}

/**
 * Initializes the database connection and runs idempotent migrations.
 * In production, connects to PostgreSQL via DATABASE_URL.
 * In development without DATABASE_URL, initializes durable local file storage.
 */
export async function initDb() {
  const config = getDbConfig();

  if (config.isConfigured) {
    console.log(`[Database] Initializing PostgreSQL connection: ${sanitizeDbUrl(process.env.DATABASE_URL)}`);
    const isLocalhost = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');

    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('[Database] Unexpected PostgreSQL pool error:', err.message);
      dbConnected = false;
      dbError = err.message;
    });

    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        dbConnected = true;
        dbError = null;
        console.log('[Database] ✓ PostgreSQL connection established successfully.');

        // Idempotent schema migration: Never drop or reset existing tables!
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(64) PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            salt VARCHAR(64) NOT NULL,
            password_hash VARCHAR(128) NOT NULL,
            pin_hash VARCHAR(128),
            token VARCHAR(64) NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
          );
          CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
        `);
        try {
          await client.query('ALTER TABLE users ALTER COLUMN pin_hash DROP NOT NULL;');
        } catch { /* column already nullable or table just created */ }
        console.log('[Database] ✓ PostgreSQL schema verified.');

        // Auto-migrate local seed / existing records if database table is completely empty
        const countRes = await client.query('SELECT COUNT(*) AS total FROM users');
        const count = parseInt(countRes.rows[0]?.total || '0', 10);
        if (count === 0) {
          console.log('[Database] PostgreSQL users table is empty. Checking for existing local records to migrate…');
          const localUsers = await readLocalFileRecords();
          if (localUsers.length > 0) {
            console.log(`[Database] Migrating ${localUsers.length} existing record(s) into PostgreSQL…`);
            for (const u of localUsers) {
              const uid = u.id || crypto.randomUUID();
              await client.query(`
                INSERT INTO users (id, username, display_name, salt, password_hash, pin_hash, token, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (username) DO NOTHING
              `, [
                uid,
                u.username.toLowerCase(),
                u.displayName || u.username,
                u.salt,
                u.hash,
                u.pinHash,
                u.token,
                u.createdAt || Date.now(),
                Date.now(),
              ]);
            }
            console.log('[Database] ✓ Migration of existing user records complete.');
          }
        }
      } finally {
        client.release();
      }
    } catch (err) {
      dbConnected = false;
      dbError = err.message;
      console.error('[Database] ❌ Failed to connect to PostgreSQL database:', err.message);
      if (process.env.NODE_ENV === 'production') {
        throw new DatabaseError(`Could not connect to production PostgreSQL database: ${err.message}`, err);
      }
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Database] ⚠️ WARNING: DATABASE_URL is not set in production!');
      console.warn('[Database] ⚠️ User records in container filesystem will be lost upon next redeployment.');
      console.warn('[Database] ⚠️ Please configure a persistent PostgreSQL database on Render.');
    } else {
      console.log('[Database] Using durable local file storage in DATA_DIR.');
    }
    await ensureDataDir();
  }
}

/**
 * Reads local fallback file records from accounts.json, accounts.bak.json, or accounts.seed.json
 */
export async function readLocalFileRecords() {
  await ensureDataDir();
  // 1. Primary accounts.json
  try {
    if (fsSync.existsSync(ACCOUNTS_FILE)) {
      const raw = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch {}

  // 2. Backup accounts.bak.json
  try {
    if (fsSync.existsSync(ACCOUNTS_BACKUP_FILE)) {
      const raw = await fs.readFile(ACCOUNTS_BACKUP_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch {}

  // 3. accounts.seed.json
  try {
    if (fsSync.existsSync(SEED_ACCOUNTS_FILE)) {
      const raw = await fs.readFile(SEED_ACCOUNTS_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch {}

  return [];
}

/**
 * Saves all records atomically to local file storage
 */
export async function saveLocalFileRecords(userList) {
  await ensureDataDir();
  const json = JSON.stringify(userList, null, 2);
  const tmp = path.join(DATA_DIR, `.accounts.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await fs.writeFile(tmp, json, 'utf-8');
    await fs.rename(tmp, ACCOUNTS_FILE);
    fs.writeFile(ACCOUNTS_BACKUP_FILE, json, 'utf-8').catch(() => {});
  } catch (err) {
    console.error('[Database] Failed to save local accounts file atomically:', err.message);
    try { await fs.writeFile(ACCOUNTS_FILE, json, 'utf-8'); } catch {}
  }
}

/**
 * Loads all persistent user records
 */
export async function dbGetAllUsers() {
  const config = getDbConfig();
  if (config.isConfigured) {
    if (!pool || !dbConnected) {
      throw new DatabaseError(`Database connection unavailable: ${dbError || 'Not connected'}`);
    }
    try {
      const res = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
      return res.rows.map(rowToUser);
    } catch (err) {
      dbConnected = false;
      dbError = err.message;
      throw new DatabaseError(`Failed to query users from PostgreSQL: ${err.message}`, err);
    }
  }

  // Local fallback
  return readLocalFileRecords();
}

/**
 * Finds a single user by normalized username from persistent storage
 */
export async function dbGetUserByUsername(username) {
  if (!username) return null;
  const clean = String(username).trim().toLowerCase();
  const config = getDbConfig();

  if (config.isConfigured) {
    if (!pool || !dbConnected) {
      throw new DatabaseError(`Database connection unavailable: ${dbError || 'Not connected'}`);
    }
    try {
      const res = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [clean]);
      return res.rows.length > 0 ? rowToUser(res.rows[0]) : null;
    } catch (err) {
      dbConnected = false;
      dbError = err.message;
      throw new DatabaseError(`Database query failed for username "${clean}": ${err.message}`, err);
    }
  }

  // Local fallback
  const list = await readLocalFileRecords();
  const found = list.find((u) => u && String(u.username).trim().toLowerCase() === clean);
  return found || null;
}

/**
 * Finds a single user by stable internal ID
 */
export async function dbGetUserById(id) {
  if (!id) return null;
  const config = getDbConfig();

  if (config.isConfigured) {
    if (!pool || !dbConnected) {
      throw new DatabaseError(`Database connection unavailable: ${dbError || 'Not connected'}`);
    }
    try {
      const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return res.rows.length > 0 ? rowToUser(res.rows[0]) : null;
    } catch (err) {
      dbConnected = false;
      dbError = err.message;
      throw new DatabaseError(`Database query failed for user ID "${id}": ${err.message}`, err);
    }
  }

  const list = await readLocalFileRecords();
  return list.find((u) => u && u.id === id) || null;
}

/**
 * Persists a new registered user to the persistent database.
 * Enforces username uniqueness and assigns a stable internal ID.
 */
export async function dbCreateUser(user) {
  const config = getDbConfig();
  const id = user.id || crypto.randomUUID();
  const now = Date.now();
  const fullUser = {
    ...user,
    id,
    createdAt: user.createdAt || now,
    updatedAt: user.updatedAt || now,
  };

  if (config.isConfigured) {
    if (!pool || !dbConnected) {
      throw new DatabaseError(`Database connection unavailable: ${dbError || 'Not connected'}`);
    }
    try {
      await pool.query(`
        INSERT INTO users (id, username, display_name, salt, password_hash, pin_hash, token, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        fullUser.id,
        fullUser.username.toLowerCase(),
        fullUser.displayName || fullUser.username,
        fullUser.salt,
        fullUser.hash,
        fullUser.pinHash || null,
        fullUser.token,
        fullUser.createdAt,
        fullUser.updatedAt,
      ]);
      return fullUser;
    } catch (err) {
      // Check for PostgreSQL unique constraint violation (code 23505)
      if (err.code === '23505') {
        const conflictErr = new Error('That username is already taken. Please choose another.');
        conflictErr.code = 'UNIQUE_VIOLATION';
        throw conflictErr;
      }
      dbConnected = false;
      dbError = err.message;
      throw new DatabaseError(`Failed to create user in database: ${err.message}`, err);
    }
  }

  // Local fallback: enforce uniqueness and write atomically
  const list = await readLocalFileRecords();
  const cleanKey = fullUser.username.toLowerCase();
  if (list.some((u) => u && String(u.username).trim().toLowerCase() === cleanKey)) {
    const conflictErr = new Error('That username is already taken. Please choose another.');
    conflictErr.code = 'UNIQUE_VIOLATION';
    throw conflictErr;
  }
  list.push(fullUser);
  await saveLocalFileRecords(list);
  return fullUser;
}

/**
 * Updates an existing user's persistent record (token, pin_hash, password_hash, display_name)
 */
export async function dbUpdateUser(username, updates) {
  if (!username) return null;
  const clean = String(username).trim().toLowerCase();
  const config = getDbConfig();
  const now = Date.now();

  if (config.isConfigured) {
    if (!pool || !dbConnected) {
      throw new DatabaseError(`Database connection unavailable: ${dbError || 'Not connected'}`);
    }
    try {
      const fields = [];
      const values = [];
      let idx = 1;

      if (updates.token !== undefined) {
        fields.push(`token = $${idx++}`);
        values.push(updates.token);
      }
      if (updates.pinHash !== undefined) {
        fields.push(`pin_hash = $${idx++}`);
        values.push(updates.pinHash);
      }
      if (updates.hash !== undefined) {
        fields.push(`password_hash = $${idx++}`);
        values.push(updates.hash);
      }
      if (updates.displayName !== undefined) {
        fields.push(`display_name = $${idx++}`);
        values.push(updates.displayName);
      }
      fields.push(`updated_at = $${idx++}`);
      values.push(now);

      values.push(clean);
      const query = `UPDATE users SET ${fields.join(', ')} WHERE LOWER(username) = LOWER($${idx}) RETURNING *`;
      const res = await pool.query(query, values);
      return res.rows.length > 0 ? rowToUser(res.rows[0]) : null;
    } catch (err) {
      dbConnected = false;
      dbError = err.message;
      throw new DatabaseError(`Failed to update user "${clean}": ${err.message}`, err);
    }
  }

  // Local fallback
  const list = await readLocalFileRecords();
  const user = list.find((u) => u && String(u.username).trim().toLowerCase() === clean);
  if (!user) return null;
  if (updates.token !== undefined) user.token = updates.token;
  if (updates.pinHash !== undefined) user.pinHash = updates.pinHash;
  if (updates.hash !== undefined) user.hash = updates.hash;
  if (updates.displayName !== undefined) user.displayName = updates.displayName;
  user.updatedAt = now;
  await saveLocalFileRecords(list);
  return user;
}

/**
 * Closes database pool (for clean shutdown and test tear-downs)
 */
export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    dbConnected = false;
  }
}
