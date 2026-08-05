import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getAdminClient, isUniqueViolation, storeError } from './supabaseAdmin.mjs';

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
 *  phone?: string | null,
 *  phoneVerified?: boolean,
 *  accessStatus?: 'trial' | 'granted' | 'locked' | 'blocked',
 *  accessExpiresAt?: string | null,
 *  planId?: string | null,
 *  firstLoginAt?: string | null,
 *  lastLoginAt?: string | null,
 *  loginCount?: number,
 *  adminSeenAt?: string | null,
 * }} AppUserRecord
 */

const TABLE = 'app_users';

export function isCloudUserStore() {
  return Boolean(getAdminClient());
}

/** False when supabase/app_access.sql has not been applied yet. */
export async function hasAccessSchema() {
  const db = getAdminClient();
  if (!db) return true;
  const { error } = await db.from(TABLE).select('access_status').limit(1);
  return !error;
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

/* ────────────────────────── phone numbers ────────────────────────── */

/**
 * Indian mobile numbers, stored in E.164 so the same user cannot sign up twice
 * with "9876543210", "+919876543210" and "09876543210".
 */
export function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10 || !/^[6-9]/.test(local)) return '';
  return `+91${local}`;
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
    phone: row.phone ?? null,
    phoneVerified: row.phone_verified === true,
    accessStatus: row.access_status || 'trial',
    accessExpiresAt: row.access_expires_at ?? null,
    planId: row.plan_id ?? null,
    firstLoginAt: row.first_login_at ?? null,
    lastLoginAt: row.last_login_at ?? null,
    loginCount: Number(row.login_count || 0),
    adminSeenAt: row.admin_seen_at ?? null,
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
    phone: record.phone ?? null,
    phone_verified: record.phoneVerified === true,
    access_status: record.accessStatus || 'trial',
    access_expires_at: record.accessExpiresAt ?? null,
    plan_id: record.planId ?? null,
    first_login_at: record.firstLoginAt ?? null,
    last_login_at: record.lastLoginAt ?? null,
    login_count: Number(record.loginCount || 0),
    admin_seen_at: record.adminSeenAt ?? null,
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
    phone: record.phone ?? null,
    phoneVerified: record.phoneVerified === true,
    accessStatus: record.accessStatus || 'trial',
    accessExpiresAt: record.accessExpiresAt ?? null,
    planId: record.planId ?? null,
    firstLoginAt: record.firstLoginAt ?? null,
    lastLoginAt: record.lastLoginAt ?? null,
    loginCount: Number(record.loginCount || 0),
    adminSeenAt: record.adminSeenAt ?? null,
    createdBy: record.createdBy ?? null,
  };
}

/* ────────────────────────── queries ────────────────────────── */

export async function listAppUsers() {
  const db = getAdminClient();
  if (!db) return readStore().users.map(publicUser);

  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw storeError(error);
  return (data || []).map((row) => publicUser(fromRow(row)));
}

export async function findAppUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  const db = getAdminClient();
  if (!db) {
    return readStore().users.find((u) => u.email === normalized) ?? null;
  }

  const { data, error } = await db.from(TABLE).select('*').eq('email', normalized).maybeSingle();
  if (error) throw storeError(error);
  return fromRow(data);
}

export async function findAppUserByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const db = getAdminClient();
  if (!db) {
    return readStore().users.find((u) => u.phone === normalized) ?? null;
  }

  const { data, error } = await db.from(TABLE).select('*').eq('phone', normalized).maybeSingle();
  if (error) throw storeError(error);
  return fromRow(data);
}

export async function findAppUserById(id) {
  if (!id) return null;

  const db = getAdminClient();
  if (!db) {
    return readStore().users.find((u) => u.id === id) ?? null;
  }

  const { data, error } = await db.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw storeError(error);
  return fromRow(data);
}

/** Login identifier can be an email or an Indian mobile number. */
export async function findAppUserByIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) return findAppUserByEmail(raw);
  return findAppUserByPhone(raw);
}

export async function createAppUser({
  email,
  password,
  passwordHash,
  name,
  plan = 'free',
  role = 'user',
  createdBy = 'admin',
  trialDays = 0,
  phone = '',
  phoneVerified = false,
  planId = null,
  accessStatus,
  accessDays,
}) {
  const pwd = String(password || '');
  const normalizedPhone = phone ? normalizePhone(phone) : '';
  let normalized = String(email || '').trim().toLowerCase();

  // Admin invite: mobile is enough — synthesize a stable email placeholder when omitted.
  if ((!normalized || !normalized.includes('@')) && normalizedPhone) {
    normalized = `${normalizedPhone}@phone.wolftrade.local`;
  }

  const displayName =
    String(name || '').trim() ||
    (normalizedPhone ? normalizedPhone.slice(-10) : normalized.split('@')[0]) ||
    'User';

  if (!normalizedPhone && (!normalized || !normalized.includes('@'))) {
    throw Object.assign(new Error('Valid mobile number or email required'), { status: 400 });
  }
  if (!normalized || !normalized.includes('@')) {
    throw Object.assign(new Error('Valid email or mobile number required'), { status: 400 });
  }
  if (phone && !normalizedPhone) {
    throw Object.assign(new Error('Enter a valid 10-digit Indian mobile number'), { status: 400 });
  }
  if (!passwordHash && pwd.length < 6) {
    throw Object.assign(new Error('Password must be at least 6 characters'), { status: 400 });
  }

  const now = Date.now();
  const days = accessDays ?? trialDays;
  const expiresAt = days > 0 ? new Date(now + days * 24 * 60 * 60 * 1000).toISOString() : null;

  const record = {
    id: `usr_${createHash('sha256').update(`${normalizedPhone || normalized}-${now}`).digest('hex').slice(0, 16)}`,
    email: normalized,
    name: displayName,
    passwordHash: passwordHash || hashPassword(pwd),
    role: role === 'admin' ? 'admin' : 'user',
    plan: plan === 'premium' || plan === 'pro' ? plan : 'free',
    active: true,
    createdAt: new Date(now).toISOString(),
    createdBy,
    trialEndsAt: trialDays > 0 ? expiresAt : null,
    phone: normalizedPhone || null,
    phoneVerified: Boolean(phoneVerified),
    accessStatus: accessStatus || (trialDays > 0 ? 'trial' : 'granted'),
    accessExpiresAt: expiresAt,
    planId,
    firstLoginAt: null,
    lastLoginAt: null,
    loginCount: 0,
    adminSeenAt: null,
  };

  const db = getAdminClient();
  if (!db) {
    const store = readStore();
    if (store.users.some((u) => u.email === normalized)) {
      throw Object.assign(new Error('User with this email already exists'), { status: 409 });
    }
    if (normalizedPhone && store.users.some((u) => u.phone === normalizedPhone)) {
      throw Object.assign(new Error('This mobile number is already registered'), { status: 409 });
    }
    store.users.unshift(record);
    writeStore(store);
    return publicUser(record);
  }

  const { data, error } = await db.from(TABLE).insert(toRow(record)).select().single();
  if (error) {
    if (isUniqueViolation(error)) {
      const clash = /phone/i.test(error.message || '')
        ? 'This mobile number is already registered'
        : 'User with this email already exists';
      throw Object.assign(new Error(clash), { status: 409 });
    }
    throw storeError(error);
  }
  return publicUser(fromRow(data));
}

/** Shared update path so every mutation goes through one place. */
async function patchUser(id, rowPatch, recordPatch) {
  const db = getAdminClient();
  if (!db) {
    const store = readStore();
    const idx = store.users.findIndex((u) => u.id === id);
    if (idx < 0) throw Object.assign(new Error('User not found'), { status: 404 });
    store.users[idx] = { ...store.users[idx], ...(recordPatch || {}) };
    writeStore(store);
    return publicUser(store.users[idx]);
  }

  const { data, error } = await db
    .from(TABLE)
    .update(rowPatch)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw storeError(error);
  if (!data) throw Object.assign(new Error('User not found'), { status: 404 });
  return publicUser(fromRow(data));
}

export async function setAppUserActive(id, active) {
  return patchUser(id, { active: Boolean(active) }, { active: Boolean(active) });
}

/** Promote / demote desk access (user ↔ admin). */
export async function setAppUserRole(id, role) {
  const next = role === 'admin' ? 'admin' : 'user';
  return patchUser(id, { role: next }, { role: next });
}

/** Admin grant / revoke. `days` of 0 (or null) means lifetime access. */
export async function setUserAccess(id, { status = 'granted', days = null, planId = null } = {}) {
  const expiresAt =
    days && Number(days) > 0
      ? new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000).toISOString()
      : null;

  return patchUser(
    id,
    {
      access_status: status,
      access_expires_at: expiresAt,
      ...(planId ? { plan_id: planId } : {}),
    },
    {
      accessStatus: status,
      accessExpiresAt: expiresAt,
      ...(planId ? { planId } : {}),
    },
  );
}

/** Used by the OTP password reset — the plain password never leaves this call. */
export async function setUserPassword(id, password) {
  const pwd = String(password || '');
  if (pwd.length < 6) {
    throw Object.assign(new Error('Password must be at least 6 characters'), { status: 400 });
  }
  const passwordHash = hashPassword(pwd);
  return patchUser(id, { password_hash: passwordHash }, { passwordHash });
}

export async function setPhoneVerified(id, verified = true) {
  return patchUser(id, { phone_verified: Boolean(verified) }, { phoneVerified: Boolean(verified) });
}

export async function setUserPhone(id, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw Object.assign(new Error('Enter a valid 10-digit Indian mobile number'), { status: 400 });
  }
  const clash = await findAppUserByPhone(normalized);
  if (clash && clash.id !== id) {
    throw Object.assign(new Error('This mobile number is already registered'), { status: 409 });
  }
  return patchUser(
    id,
    { phone: normalized, phone_verified: true },
    { phone: normalized, phoneVerified: true },
  );
}

/** Called on every successful login so the admin can see who is coming in. */
export async function recordLogin(id) {
  const nowIso = new Date().toISOString();
  const current = await findAppUserById(id);
  if (!current) return null;

  return patchUser(
    id,
    {
      first_login_at: current.firstLoginAt || nowIso,
      last_login_at: nowIso,
      login_count: Number(current.loginCount || 0) + 1,
    },
    {
      firstLoginAt: current.firstLoginAt || nowIso,
      lastLoginAt: nowIso,
      loginCount: Number(current.loginCount || 0) + 1,
    },
  );
}

/** Clears the "NEW" badge in the admin panel. */
export async function markUsersSeen(ids) {
  const nowIso = new Date().toISOString();
  const db = getAdminClient();

  if (!db) {
    const store = readStore();
    store.users = store.users.map((u) =>
      !ids?.length || ids.includes(u.id) ? { ...u, adminSeenAt: u.adminSeenAt || nowIso } : u,
    );
    writeStore(store);
    return { ok: true };
  }

  let query = db.from(TABLE).update({ admin_seen_at: nowIso }).is('admin_seen_at', null);
  if (ids?.length) query = query.in('id', ids);
  const { error } = await query;
  if (error) throw storeError(error);
  return { ok: true };
}

export async function deleteAppUser(id) {
  const db = getAdminClient();
  if (!db) {
    const store = readStore();
    const next = store.users.filter((u) => u.id !== id);
    if (next.length === store.users.length) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }
    writeStore({ users: next });
    return { ok: true };
  }

  const { data, error } = await db.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw storeError(error);
  if (!data?.length) throw Object.assign(new Error('User not found'), { status: 404 });
  return { ok: true };
}

export async function authenticateAppUser(identifier, password) {
  const user = await findAppUserByIdentifier(identifier);
  if (!user || user.active === false) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return publicUser(user);
}

/**
 * One-time lift of any logins created before the cloud store existed. The file is
 * retired afterwards so later boots cannot resurrect accounts deleted in Supabase.
 */
export async function migrateFileUsersToCloud() {
  const db = getAdminClient();
  if (!db || !existsSync(storePath)) return { migrated: 0 };

  const local = readStore().users;
  if (!local.length) return { migrated: 0 };

  const { data, error } = await db.from(TABLE).select('email');
  if (error) throw storeError(error);

  const known = new Set((data || []).map((row) => row.email));
  const pending = local.filter((u) => !known.has(u.email)).map(toRow);

  if (pending.length) {
    const { error: insertError } = await db.from(TABLE).insert(pending);
    if (insertError) throw storeError(insertError);
  }

  renameSync(storePath, resolve(dataDir, 'app-users.migrated.json'));
  return { migrated: pending.length };
}
