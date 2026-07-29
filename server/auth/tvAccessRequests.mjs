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
  const id = `tvreq_${randomBytes(9).toString('hex')}`;
  const createdAt = new Date().toISOString();
  const row = {
    id,
    trading_view_id: String(tradingViewId || '').trim(),
    indicator_id: String(indicatorId || '').trim(),
    indicator_title: String(indicatorTitle || '').trim() || null,
    user_id: user?.id ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    phone: user?.phone ?? null,
    status: 'pending',
    admin_note: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: createdAt,
  };

  const rows = await loadRows();
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

async function findRequest(id) {
  return (await loadRows()).find((row) => row.id === id) ?? null;
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
