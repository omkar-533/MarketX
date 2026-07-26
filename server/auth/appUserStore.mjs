import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = resolve(root, 'data');
const storePath = resolve(dataDir, 'app-users.json');

/**
 * @typedef {{
 *  id: string,
 *  email: string,
 *  name: string,
 *  passwordHash: string,
 *  role: 'user' | 'admin',
 *  plan: 'free' | 'pro' | 'premium',
 *  active: boolean,
 *  createdAt: string,
 *  createdBy: string,
 *  trialEndsAt?: string | null,
 * }} AppUserRecord
 */

const TABLE = 'app_users';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

/**
 * Accounts live in Supabase so they survive restarts. Without a service-role key
 * (local dev) we fall back to the JSON file store.
 */
const supabase =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export function isCloudUserStore() {
  return Boolean(supabase);
}

/* ────────────────────────── file fallback ────────────────────────── */

function ensureStore() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(storePath)) {
    writeFileSync(storePath, JSON.stringify({ users: [] }, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = JSON.parse(readFileSync(storePath, 'utf8'));
    return { users: Array.isArray(raw?.users) ? raw.users : [] };
  } catch {
    return { users: [] };
  }
}

function writeStore(store) {
  ensureStore();
  writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
}

/* ────────────────────────── passwords ────────────────────────── */

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, passwordHash) {
  const [salt, hash] = String(passwordHash || '').split(':');
  if (!salt || !hash) return false;
  const next = scryptSync(String(password), salt, 64);
  const prev = Buffer.from(hash, 'hex');
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

/* ────────────────────────── row mapping ────────────────────────── */

/** Supabase row (snake_case) → internal record (camelCase) */
function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    role: row.role,
    plan: row.plan,
    active: row.active !== false,
    createdAt: row.created_at,
    createdBy: row.created_by,
    trialEndsAt: row.trial_ends_at ?? null,
  };
}

function toRow(record) {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    password_hash: record.passwordHash,
    role: record.role,
    plan: record.plan,
    active: record.active !== false,
    created_at: record.createdAt,
    created_by: record.createdBy,
    trial_ends_at: record.trialEndsAt ?? null,
  };
}

export function publicUser(record) {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role,
    plan: record.plan,
    active: record.active !== false,
    verified: true,
    createdAt: record.createdAt,
    trialEndsAt: record.trialEndsAt ?? null,
  };
}

function storeError(error) {
  return Object.assign(new Error(error?.message || 'User store unavailable'), { status: 503 });
}

/* ────────────────────────── queries ────────────────────────── */

export async function listAppUsers() {
  if (!supabase) return readStore().users.map(publicUser);

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw storeError(error);
  return (data || []).map((row) => publicUser(fromRow(row)));
}

export async function findAppUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  if (!supabase) {
    return readStore().users.find((u) => u.email === normalized) ?? null;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('email', normalized)
    .maybeSingle();
  if (error) throw storeError(error);
  return fromRow(data);
}

export async function createAppUser({
  email,
  password,
  name,
  plan = 'free',
  role = 'user',
  createdBy = 'admin',
  trialDays = 0,
}) {
  const normalized = String(email || '').trim().toLowerCase();
  const pwd = String(password || '');
  const displayName = String(name || '').trim() || normalized.split('@')[0] || 'User';

  if (!normalized || !normalized.includes('@')) {
    throw Object.assign(new Error('Valid email required'), { status: 400 });
  }
  if (pwd.length < 6) {
    throw Object.assign(new Error('Password must be at least 6 characters'), { status: 400 });
  }

  const record = {
    id: `usr_${createHash('sha256').update(`${normalized}-${Date.now()}`).digest('hex').slice(0, 16)}`,
    email: normalized,
    name: displayName,
    passwordHash: hashPassword(pwd),
    role: role === 'admin' ? 'admin' : 'user',
    plan: plan === 'premium' || plan === 'pro' ? plan : 'free',
    active: true,
    createdAt: new Date().toISOString(),
    createdBy,
    trialEndsAt:
      trialDays > 0 ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString() : null,
  };

  if (!supabase) {
    const store = readStore();
    if (store.users.some((u) => u.email === normalized)) {
      throw Object.assign(new Error('User with this email already exists'), { status: 409 });
    }
    store.users.unshift(record);
    writeStore(store);
    return publicUser(record);
  }

  const { data, error } = await supabase.from(TABLE).insert(toRow(record)).select().single();
  if (error) {
    // 23505 = unique_violation on the email index
    if (error.code === '23505') {
      throw Object.assign(new Error('User with this email already exists'), { status: 409 });
    }
    throw storeError(error);
  }
  return publicUser(fromRow(data));
}

export async function setAppUserActive(id, active) {
  if (!supabase) {
    const store = readStore();
    const idx = store.users.findIndex((u) => u.id === id);
    if (idx < 0) throw Object.assign(new Error('User not found'), { status: 404 });
    store.users[idx].active = Boolean(active);
    writeStore(store);
    return publicUser(store.users[idx]);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ active: Boolean(active) })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw storeError(error);
  if (!data) throw Object.assign(new Error('User not found'), { status: 404 });
  return publicUser(fromRow(data));
}

export async function deleteAppUser(id) {
  if (!supabase) {
    const store = readStore();
    const next = store.users.filter((u) => u.id !== id);
    if (next.length === store.users.length) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }
    writeStore({ users: next });
    return { ok: true };
  }

  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw storeError(error);
  if (!data?.length) throw Object.assign(new Error('User not found'), { status: 404 });
  return { ok: true };
}

export async function authenticateAppUser(email, password) {
  const user = await findAppUserByEmail(email);
  if (!user || user.active === false) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return publicUser(user);
}

/**
 * One-time lift of any logins created before the cloud store existed. Runs on boot
 * and skips emails that are already in Supabase.
 */
export async function migrateFileUsersToCloud() {
  if (!supabase || !existsSync(storePath)) return { migrated: 0 };

  const local = readStore().users;
  if (!local.length) return { migrated: 0 };

  const { data, error } = await supabase.from(TABLE).select('email');
  if (error) throw storeError(error);

  const known = new Set((data || []).map((row) => row.email));
  const pending = local.filter((u) => !known.has(u.email)).map(toRow);
  if (!pending.length) return { migrated: 0 };

  const { error: insertError } = await supabase.from(TABLE).insert(pending);
  if (insertError) throw storeError(insertError);
  return { migrated: pending.length };
}
