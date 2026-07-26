import { randomBytes } from 'crypto';
import { getAdminClient, storeError } from './supabaseAdmin.mjs';
import { readJsonFile, writeJsonFile } from './jsonStore.mjs';
import { setUserAccess } from './appUserStore.mjs';

const TABLE = 'app_access_requests';
const FILE = 'app-access-requests.json';
const BUCKET = 'access-proofs';
const MAX_BYTES = 4 * 1024 * 1024;
const SIGNED_URL_TTL = 60 * 60;

let bucketReady = false;

async function ensureBucket(db) {
  if (bucketReady) return;
  const { error } = await db.storage.createBucket(BUCKET, { public: false });
  // "already exists" is the happy path on every boot after the first.
  if (error && !/exists/i.test(error.message || '')) throw storeError(error);
  bucketReady = true;
}

function decodeDataUrl(dataUrl) {
  const match = /^data:(image\/(png|jpe?g|webp));base64,([\s\S]+)$/i.exec(String(dataUrl || ''));
  if (!match) {
    throw Object.assign(new Error('Upload a PNG, JPG or WebP screenshot'), { status: 400 });
  }
  const buffer = Buffer.from(match[3], 'base64');
  if (!buffer.length) {
    throw Object.assign(new Error('Screenshot looks empty'), { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    throw Object.assign(new Error('Screenshot is too large (max 4 MB)'), { status: 413 });
  }
  return { buffer, mime: match[1], ext: match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2] };
}

/* ────────────────────────── file fallback ────────────────────────── */

function readRows() {
  const raw = readJsonFile(FILE, { requests: [] });
  return Array.isArray(raw?.requests) ? raw.requests : [];
}

function writeRows(requests) {
  writeJsonFile(FILE, { requests });
}

/* ────────────────────────── mapping ────────────────────────── */

function fromRow(row, signedUrl = null) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    note: row.note ?? null,
    status: row.status,
    adminNote: row.admin_note ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at,
    screenshotUrl: signedUrl || row.screenshot_data || null,
  };
}

async function signScreenshot(db, row) {
  if (!row?.screenshot_path) return null;
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(row.screenshot_path, SIGNED_URL_TTL);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/* ────────────────────────── public API ────────────────────────── */

/** A user can only have one open request; an earlier one is superseded. */
async function supersedeOpenRequests(userId) {
  const db = getAdminClient();
  if (!db) {
    writeRows(
      readRows().map((row) =>
        row.user_id === userId && row.status === 'pending' ? { ...row, status: 'superseded' } : row,
      ),
    );
    return;
  }

  const { error } = await db
    .from(TABLE)
    .update({ status: 'superseded' })
    .eq('user_id', userId)
    .eq('status', 'pending');
  if (error) throw storeError(error);
}

export async function createAccessRequest({ user, note = '', screenshot }) {
  const { buffer, mime, ext } = decodeDataUrl(screenshot);
  const id = `req_${randomBytes(9).toString('hex')}`;
  const createdAt = new Date().toISOString();

  await supersedeOpenRequests(user.id);

  const base = {
    id,
    user_id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    phone: user.phone ?? null,
    note: String(note || '').slice(0, 500),
    status: 'pending',
    admin_note: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: createdAt,
  };

  const db = getAdminClient();
  if (!db) {
    const row = { ...base, screenshot_path: null, screenshot_data: screenshot };
    writeRows([row, ...readRows()]);
    return fromRow(row);
  }

  await ensureBucket(db);
  const path = `${user.id}/${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) throw storeError(uploadError);

  const row = { ...base, screenshot_path: path, screenshot_data: null };
  const { error } = await db.from(TABLE).insert(row);
  if (error) throw storeError(error);
  return fromRow(row, await signScreenshot(db, row));
}

export async function latestRequestForUser(userId) {
  const db = getAdminClient();
  if (!db) {
    const row =
      readRows()
        .filter((r) => r.user_id === userId)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;
    return row ? fromRow(row) : null;
  }

  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw storeError(error);
  const row = data?.[0];
  return row ? fromRow(row, await signScreenshot(db, row)) : null;
}

export async function listAccessRequests({ status = 'pending', limit = 100 } = {}) {
  const db = getAdminClient();
  if (!db) {
    const rows = readRows()
      .filter((row) => (status === 'all' ? true : row.status === status))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
    return rows.map((row) => fromRow(row));
  }

  let query = db
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw storeError(error);
  return Promise.all((data || []).map(async (row) => fromRow(row, await signScreenshot(db, row))));
}

async function findRequest(id) {
  const db = getAdminClient();
  if (!db) return readRows().find((row) => row.id === id) ?? null;

  const { data, error } = await db.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw storeError(error);
  return data ?? null;
}

async function patchRequest(id, patch) {
  const db = getAdminClient();
  if (!db) {
    writeRows(readRows().map((row) => (row.id === id ? { ...row, ...patch } : row)));
    return;
  }

  const { error } = await db.from(TABLE).update(patch).eq('id', id);
  if (error) throw storeError(error);
}

/**
 * Approving also grants the account access (days of 0 = lifetime); rejecting
 * leaves the account as it was, so an expired trial stays locked.
 */
export async function reviewAccessRequest(id, { approve, days = 30, adminNote = '', reviewedBy }) {
  const row = await findRequest(id);
  if (!row) throw Object.assign(new Error('Request not found'), { status: 404 });

  await patchRequest(id, {
    status: approve ? 'approved' : 'rejected',
    admin_note: String(adminNote || '').slice(0, 500) || null,
    reviewed_by: reviewedBy ?? null,
    reviewed_at: new Date().toISOString(),
  });

  let user = null;
  if (approve) {
    user = await setUserAccess(row.user_id, {
      status: 'granted',
      days: Number(days) > 0 ? Number(days) : null,
    });
  }

  return { ok: true, user };
}

export async function pendingAccessRequestCount() {
  const db = getAdminClient();
  if (!db) return readRows().filter((row) => row.status === 'pending').length;

  const { count, error } = await db
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw storeError(error);
  return count || 0;
}
