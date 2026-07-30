/**
 * TradingView invite access requests (manual grant by admin).
 * Persists to Supabase app_settings when configured (survives Render redeploys).
 * Falls back to local JSON for file-only / local-dev mode.
 */
import { randomBytes } from 'crypto';
import { getAdminClient, storeError } from './supabaseAdmin.mjs';
import { readJsonFile, writeJsonFile } from './jsonStore.mjs';

const FILE = 'app-tv-access-requests.json';
const SETTINGS_KEY = 'tv_access_requests';

function readFileRows() {
  const raw = readJsonFile(FILE, { requests: [] });
  return Array.isArray(raw?.requests) ? raw.requests : [];
}

function writeFileRows(requests) {
  writeJsonFile(FILE, { requests });
}

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tradingViewId: row.trading_view_id,
    indicatorId: row.indicator_id,
    indicatorTitle: row.indicator_title ?? null,
    userId: row.user_id ?? null,
    name: row.name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    status: row.status,
    adminNote: row.admin_note ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at,
  };
}

async function loadRows() {
  const db = getAdminClient();
  if (!db) return readFileRows();

  const { data, error } = await db.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  if (error) throw storeError(error);

  const cloud = Array.isArray(data?.value?.requests) ? data.value.requests : [];
  const local = readFileRows();

  // One-time rescue: if cloud is empty but the disk still has rows, promote them.
  if (!cloud.length && local.length) {
    await saveRows(local);
    return local;
  }
  return cloud;
}

async function saveRows(requests) {
  const db = getAdminClient();
  if (!db) {
    writeFileRows(requests);
    return;
  }

  const { error } = await db.from('app_settings').upsert(
    {
      key: SETTINGS_KEY,
      value: { requests },
      updated_at: new Date().toISOString(),
      updated_by: null,
    },
    { onConflict: 'key' },
  );
  if (error) throw storeError(error);

  // Best-effort local mirror (ignored on ephemeral Render disks).
  try {
    writeFileRows(requests);
  } catch {
    /* ignore */
  }
}

export async function createTvAccessRequest({
  tradingViewId,
  indicatorId,
  indicatorTitle,
  user,
}) {
  const rows = await loadRows();
  const userId = user?.id ?? null;
  const indId = String(indicatorId || '').trim();
  const tvId = String(tradingViewId || '').trim().replace(/^@/, '');

  if (userId && indId) {
    const existing = rows
      .filter((r) => r.user_id === userId && r.indicator_id === indId)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const latest = existing[0];
    if (latest?.status === 'granted') {
      return fromRow({ ...latest, trading_view_id: tvId || latest.trading_view_id });
    }
    if (latest?.status === 'pending') {
      const patched = {
        ...latest,
        trading_view_id: tvId || latest.trading_view_id,
        name: user?.name ?? latest.name,
        email: user?.email ?? latest.email,
        phone: user?.phone ?? latest.phone,
        indicator_title: String(indicatorTitle || '').trim() || latest.indicator_title,
      };
      await saveRows(rows.map((r) => (r.id === latest.id ? patched : r)));
      return fromRow(patched);
    }
  }

  const id = `tvreq_${randomBytes(9).toString('hex')}`;
  const createdAt = new Date().toISOString();
  const row = {
    id,
    trading_view_id: tvId,
    indicator_id: indId,
    indicator_title: String(indicatorTitle || '').trim() || null,
    user_id: userId,
    name: user?.name ?? null,
    email: user?.email ?? null,
    phone: user?.phone ?? null,
    status: 'pending',
    admin_note: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: createdAt,
  };

  await saveRows([row, ...rows]);
  return fromRow(row);
}

export async function listTvAccessRequests({ status = 'pending', limit = 100 } = {}) {
  const rows = (await loadRows())
    .filter((row) => (status === 'all' ? true : row.status === status))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limit);
  return rows.map((row) => fromRow(row));
}

export async function getLatestTvAccessForUserIndicator(userId, indicatorId) {
  if (!userId || !indicatorId) return null;
  const row = (await loadRows())
    .filter((r) => r.user_id === userId && r.indicator_id === indicatorId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return row ? fromRow(row) : null;
}

/** Indicator IDs this user was granted invite unlock for. */
export async function listGrantedIndicatorIdsForUser(userId) {
  if (!userId) return new Set();
  const ids = new Set();
  for (const row of await loadRows()) {
    if (row.user_id === userId && row.status === 'granted') ids.add(row.indicator_id);
  }
  return ids;
}

/** Indicator IDs where user has any TV request (pending / granted / dismissed). */
export async function listRequestedIndicatorIdsForUser(userId) {
  if (!userId) return new Set();
  const ids = new Set();
  for (const row of await loadRows()) {
    if (row.user_id === userId) ids.add(row.indicator_id);
  }
  return ids;
}

/** Latest TV access status per indicator for a user. */
export async function mapLatestTvAccessStatusByIndicator(userId) {
  const map = new Map();
  if (!userId) return map;
  const rows = (await loadRows())
    .filter((r) => r.user_id === userId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const row of rows) {
    if (!map.has(row.indicator_id)) map.set(row.indicator_id, row.status);
  }
  return map;
}

/** Granted TV access rows for a member (newest first). */
export async function listGrantedTvAccessForUser(userId, { limit = 20 } = {}) {
  if (!userId) return [];
  return (await loadRows())
    .filter((r) => r.user_id === userId && r.status === 'granted')
    .sort(
      (a, b) =>
        Date.parse(b.reviewed_at || b.created_at) - Date.parse(a.reviewed_at || a.created_at),
    )
    .slice(0, limit)
    .map((row) => fromRow(row));
}

export async function reviewTvAccessRequest(id, { status, adminNote = '', reviewedBy }) {
  if (!['granted', 'dismissed'].includes(status)) {
    throw Object.assign(new Error('Invalid status'), { status: 400 });
  }
  const rows = await loadRows();
  const row = rows.find((r) => r.id === id);
  if (!row) throw Object.assign(new Error('Request not found'), { status: 404 });

  const patch = {
    status,
    admin_note: String(adminNote || '').slice(0, 500) || null,
    reviewed_by: reviewedBy ?? null,
    reviewed_at: new Date().toISOString(),
  };
  const next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
  await saveRows(next);
  return { ok: true, request: fromRow({ ...row, ...patch }) };
}

export async function reviewAllPendingTvAccessRequests({ status = 'granted', reviewedBy } = {}) {
  if (!['granted', 'dismissed'].includes(status)) {
    throw Object.assign(new Error('Invalid status'), { status: 400 });
  }
  const rows = await loadRows();
  const now = new Date().toISOString();
  let count = 0;
  const next = rows.map((r) => {
    if (r.status !== 'pending') return r;
    count += 1;
    return {
      ...r,
      status,
      reviewed_by: reviewedBy ?? null,
      reviewed_at: now,
    };
  });
  if (count) await saveRows(next);
  return { ok: true, updated: count };
}

export async function deleteTvAccessRequest(id) {
  const rows = await loadRows();
  const row = rows.find((r) => r.id === id);
  if (!row) throw Object.assign(new Error('Request not found'), { status: 404 });
  await saveRows(rows.filter((r) => r.id !== id));
  return { ok: true, id };
}

export async function pendingTvAccessRequestCount() {
  return (await loadRows()).filter((row) => row.status === 'pending').length;
}

export async function latestPendingTvAccessRequest() {
  const row =
    (await loadRows())
      .filter((r) => r.status === 'pending')
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;
  return row ? fromRow(row) : null;
}
