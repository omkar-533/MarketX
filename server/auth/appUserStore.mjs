import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

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
 * }} AppUserRecord
 */

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
  };
}

export function listAppUsers() {
  return readStore().users.map(publicUser);
}

export function findAppUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return readStore().users.find((u) => u.email === normalized) ?? null;
}

export function createAppUser({ email, password, name, plan = 'free', role = 'user', createdBy = 'admin' }) {
  const normalized = String(email || '').trim().toLowerCase();
  const pwd = String(password || '');
  const displayName = String(name || '').trim() || normalized.split('@')[0] || 'User';

  if (!normalized || !normalized.includes('@')) {
    throw Object.assign(new Error('Valid email required'), { status: 400 });
  }
  if (pwd.length < 6) {
    throw Object.assign(new Error('Password must be at least 6 characters'), { status: 400 });
  }

  const store = readStore();
  if (store.users.some((u) => u.email === normalized)) {
    throw Object.assign(new Error('User with this email already exists'), { status: 409 });
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
  };

  store.users.unshift(record);
  writeStore(store);
  return publicUser(record);
}

export function setAppUserActive(id, active) {
  const store = readStore();
  const idx = store.users.findIndex((u) => u.id === id);
  if (idx < 0) throw Object.assign(new Error('User not found'), { status: 404 });
  store.users[idx].active = Boolean(active);
  writeStore(store);
  return publicUser(store.users[idx]);
}

export function deleteAppUser(id) {
  const store = readStore();
  const next = store.users.filter((u) => u.id !== id);
  if (next.length === store.users.length) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }
  writeStore({ users: next });
  return { ok: true };
}

export function authenticateAppUser(email, password) {
  const user = findAppUserByEmail(email);
  if (!user || user.active === false) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return publicUser(user);
}
