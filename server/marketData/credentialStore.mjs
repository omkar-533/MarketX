/**
 * BrokerCredentialService — encrypted at-rest credential shell.
 * Never stores passwords / OTP / TOTP secrets.
 * Never returns raw tokens to API clients.
 *
 * Memory first (fast path). Supabase when configured so Render restarts
 * and user/session key switches still see the same LIVE connection.
 */
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { encryptPineSource, decryptPineSource } from '../auth/pineCrypto.mjs';
import { getAdminClient } from '../auth/supabaseAdmin.mjs';

const TABLE = 'market_data_connections';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const filePath = resolve(root, 'data', 'market-data-connections.json');
const DB_TIMEOUT_MS = 2_500;

/** @typedef {{
 *  id: string,
 *  userKey: string,
 *  provider: string,
 *  status: 'DISCONNECTED'|'CONNECTING'|'CONNECTED'|'EXPIRED'|'ERROR',
 *  encryptedCredential: string,
 *  expiresAt: number|null,
 *  capabilities: object,
 *  mode: 'DEMO'|'LIVE',
 *  permissionNote?: string|null,
 *  createdAt: number,
 *  updatedAt: number,
 * }} MarketDataConnectionRecord */

/** @type {Map<string, MarketDataConnectionRecord>} */
const byUser = new Map();

function now() {
  return Date.now();
}

function markExpired(record) {
  if (record?.expiresAt && record.expiresAt < now()) {
    record.status = 'EXPIRED';
  }
  return record;
}

function fromRow(row) {
  if (!row) return null;
  const caps = row.capabilities && typeof row.capabilities === 'object' ? row.capabilities : {};
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : null;
  return markExpired({
    id: row.id,
    userKey: row.user_id,
    provider: row.provider,
    status: row.status || 'DISCONNECTED',
    encryptedCredential: row.encrypted_credential || '',
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    capabilities: { ...caps, orderExecution: false },
    mode: row.mode === 'LIVE' ? 'LIVE' : 'DEMO',
    permissionNote: caps.permissionNote || null,
    createdAt: row.created_at ? Date.parse(row.created_at) || now() : now(),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) || now() : now(),
  });
}

function toRow(record) {
  return {
    id: record.id,
    user_id: record.userKey,
    provider: record.provider,
    status: record.status,
    encrypted_credential: record.encryptedCredential,
    expires_at: record.expiresAt ? new Date(record.expiresAt).toISOString() : null,
    capabilities: {
      ...record.capabilities,
      orderExecution: false,
      permissionNote: record.permissionNote || null,
    },
    mode: record.mode,
    created_at: new Date(record.createdAt).toISOString(),
    updated_at: new Date(record.updatedAt).toISOString(),
  };
}

function readFileStore() {
  try {
    if (!existsSync(filePath)) return {};
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeFileStore(map) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(map), 'utf8');
  } catch (err) {
    console.warn('[market-data] file persist skipped', err?.message || err);
  }
}

function persistFileRecord(record) {
  if (!record?.userKey) return;
  const map = readFileStore();
  map[record.userKey] = toRow(record);
  writeFileStore(map);
}

function loadFileRecord(userKey) {
  const row = readFileStore()[userKey];
  return row ? fromRow(row) : null;
}

function deleteFileRecord(userKey) {
  const map = readFileStore();
  if (!map[userKey]) return;
  delete map[userKey];
  writeFileStore(map);
}

async function persistRecord(record) {
  if (!record) return;
  persistFileRecord(record);
  const db = getAdminClient();
  if (!db) return;
  const run = db.from(TABLE).upsert(toRow(record), { onConflict: 'user_id,provider' });
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ error: { message: `timeout after ${DB_TIMEOUT_MS}ms` } }), DB_TIMEOUT_MS),
  );
  const { error } = await Promise.race([run, timeout]);
  if (error) console.warn('[market-data] persist skipped', error.message);
}

async function loadRowsForKey(userKey) {
  const rows = [];
  const fileRow = loadFileRecord(userKey);
  if (fileRow) rows.push(fileRow);
  const db = getAdminClient();
  if (!db || !userKey) return rows;
  const run = db
    .from(TABLE)
    .select('*')
    .eq('user_id', userKey)
    .order('updated_at', { ascending: false })
    .limit(4);
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ data: null, error: { message: `timeout after ${DB_TIMEOUT_MS}ms` } }), DB_TIMEOUT_MS),
  );
  const { data, error } = await Promise.race([run, timeout]);
  if (error) {
    if (
      !String(error.message || '').includes('does not exist') &&
      !String(error.message || '').includes('timeout after')
    ) {
      console.warn('[market-data] hydrate skipped', error.message);
    }
    return rows;
  }
  return [...rows, ...(data || []).map(fromRow).filter(Boolean)];
}

async function deleteRowsForKey(userKey) {
  deleteFileRecord(userKey);
  const db = getAdminClient();
  if (!db || !userKey) return;
  const run = db.from(TABLE).delete().eq('user_id', userKey);
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ error: { message: `timeout after ${DB_TIMEOUT_MS}ms` } }), DB_TIMEOUT_MS),
  );
  const { error } = await Promise.race([run, timeout]);
  if (error && !String(error.message || '').includes('does not exist')) {
    console.warn('[market-data] delete skipped', error.message);
  }
}

function cacheRecord(record) {
  if (!record?.userKey) return record;
  byUser.set(record.userKey, record);
  return record;
}

export function storeCredential({
  userKey,
  provider,
  credentialPayload,
  expiresAt = null,
  capabilities = {},
  mode = 'DEMO',
  status = 'CONNECTED',
  permissionNote = null,
}) {
  const encryptedCredential = encryptPineSource(
    typeof credentialPayload === 'string'
      ? credentialPayload
      : JSON.stringify(credentialPayload ?? { kind: 'demo' }),
  );
  const existing = byUser.get(userKey);
  const record = {
    id: existing?.id || randomUUID(),
    userKey,
    provider,
    status,
    encryptedCredential,
    expiresAt,
    capabilities: {
      ...capabilities,
      orderExecution: false,
    },
    mode,
    permissionNote,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };
  cacheRecord(record);
  return publicView(record);
}

export async function persistStoredCredential(userKey) {
  const record = byUser.get(userKey);
  if (record) await persistRecord(record);
}

export function getCredential(userKey) {
  const record = byUser.get(userKey);
  if (!record) return null;
  markExpired(record);
  byUser.set(userKey, record);
  return record;
}

/** Memory first, then Supabase. Checks every identity key (user + session). */
export async function resolveCredential(keys) {
  const list = [...new Set((keys || []).map((k) => String(k || '').trim()).filter(Boolean))];
  for (const key of list) {
    const mem = getCredential(key);
    if (mem && mem.status === 'CONNECTED') return { key, record: mem };
  }
  for (const key of list) {
    const rows = await loadRowsForKey(key);
    for (const row of rows) cacheRecord(row);
    const mem = getCredential(key);
    if (mem && (mem.status === 'CONNECTED' || mem.status === 'EXPIRED')) {
      return { key, record: mem };
    }
  }
  for (const key of list) {
    const mem = getCredential(key);
    if (mem) return { key, record: mem };
  }
  return { key: list[0] || '', record: null };
}

/**
 * Internal only — unique LIVE INDstocks tokens for the backend board job.
 * Never expose this list over HTTP.
 */
export async function listLiveIndstocksAccessTokens() {
  const seenTok = new Set();
  const out = [];

  const take = (record) => {
    if (!record) return;
    markExpired(record);
    if (record.status !== 'CONNECTED') return;
    if (record.mode !== 'LIVE') return;
    if (record.provider !== 'indstocks') return;
    cacheRecord(record);
    const cred = readDecryptedCredential(record.userKey);
    const accessToken = String(cred?.accessToken || '').trim();
    if (accessToken.length < 12 || seenTok.has(accessToken)) return;
    seenTok.add(accessToken);
    out.push({ userKey: record.userKey, accessToken });
  };

  for (const rec of byUser.values()) take(rec);
  for (const row of Object.values(readFileStore())) take(fromRow(row));

  const db = getAdminClient();
  if (db) {
    const run = db
      .from(TABLE)
      .select('*')
      .eq('provider', 'indstocks')
      .eq('status', 'CONNECTED')
      .eq('mode', 'LIVE')
      .order('updated_at', { ascending: false })
      .limit(50);
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: `timeout after ${DB_TIMEOUT_MS}ms` } }), DB_TIMEOUT_MS),
    );
    const { data, error } = await Promise.race([run, timeout]);
    if (error && !String(error.message || '').includes('does not exist')) {
      console.warn('[market-data] live-token list skipped', error.message);
    }
    for (const row of data || []) take(fromRow(row));
  }
  return out;
}

/**
 * Copy a live connection onto another identity key.
 * Never deletes the source — logout still hits the session cookie copy;
 * the next login still hits user:{id} until the broker token dies.
 */
export async function mirrorCredential(fromKey, toKey) {
  if (!fromKey || !toKey || fromKey === toKey) return getCredential(toKey);
  const source = getCredential(fromKey);
  if (!source) return getCredential(toKey);
  const destExisting = getCredential(toKey);
  const clone = {
    ...source,
    capabilities: { ...(source.capabilities || {}) },
    id: destExisting?.id || randomUUID(),
    userKey: toKey,
    createdAt: destExisting?.createdAt || source.createdAt,
    updatedAt: now(),
  };
  cacheRecord(clone);
  await persistRecord(clone);
  return clone;
}

/** Kept name — copies, never moves/deletes the source key. */
export async function adoptCredential(fromKey, toKey) {
  return mirrorCredential(fromKey, toKey);
}

/** Write the same encrypted credential onto every identity (user + browser session). */
export async function storeCredentialOnKeys(keys, spec) {
  const list = [...new Set((keys || []).map((k) => String(k || '').trim()).filter(Boolean))];
  let view = null;
  for (const userKey of list) {
    view = storeCredential({ ...spec, userKey });
  }
  await Promise.all(list.map((k) => persistStoredCredential(k)));
  return view;
}

export async function expireCredentialPersist(userKey) {
  if (!userKey) return;
  let record = getCredential(userKey);
  if (!record) {
    const rows = await loadRowsForKey(userKey);
    for (const row of rows) cacheRecord(row);
    record = getCredential(userKey);
  }
  if (!record) return;
  record.status = 'EXPIRED';
  record.updatedAt = now();
  cacheRecord(record);
  await persistRecord(record);
}

/** Internal only — never call from HTTP handlers that serialize to clients. */
export function readDecryptedCredential(userKey) {
  const record = getCredential(userKey);
  if (!record?.encryptedCredential) return null;
  const plain = decryptPineSource(record.encryptedCredential);
  try {
    return JSON.parse(plain);
  } catch {
    return { raw: '[opaque]' };
  }
}

export function isCredentialValid(userKey) {
  const record = getCredential(userKey);
  if (!record) return false;
  if (record.status !== 'CONNECTED') return false;
  if (record.expiresAt && record.expiresAt < now()) return false;
  return true;
}

export function refreshCredential(userKey) {
  const record = getCredential(userKey);
  if (!record) return null;
  record.updatedAt = now();
  record.status = 'CONNECTED';
  byUser.set(userKey, record);
  void persistRecord(record);
  return publicView(record);
}

export function deleteCredential(userKey) {
  byUser.delete(userKey);
  void deleteRowsForKey(userKey);
  return true;
}

export async function deleteCredentialPersist(userKey) {
  byUser.delete(userKey);
  await deleteRowsForKey(userKey);
  return true;
}

export function publicView(record) {
  if (!record) {
    return {
      status: 'DISCONNECTED',
      providerId: null,
      providerName: null,
      mode: null,
      historical: false,
      liveQuotes: false,
      orderAccess: 'NOT ENABLED',
      message: 'MARKET DATA DISCONNECTED',
    };
  }
  const historical = Boolean(record.capabilities?.historicalCandles);
  const liveQuotes = Boolean(record.capabilities?.liveQuotes);
  const connected = record.status === 'CONNECTED';
  return {
    status: record.status,
    providerId: record.provider,
    providerName:
      record.provider === 'mock-demo'
        ? 'Demo Market Data'
        : record.provider === 'indstocks'
          ? 'INDstocks (INDMoney)'
          : record.provider,
    mode: record.mode,
    historical,
    liveQuotes,
    orderAccess: 'NOT ENABLED',
    permissionNote: record.permissionNote || null,
    message: connected
      ? record.mode === 'DEMO'
        ? 'DEMO MARKET DATA'
        : 'MARKET DATA CONNECTED'
      : record.status === 'EXPIRED'
        ? 'Market data connection expired. Reconnect your broker.'
        : 'MARKET DATA DISCONNECTED',
  };
}
