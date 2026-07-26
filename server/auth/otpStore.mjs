import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { getAdminClient, storeError } from './supabaseAdmin.mjs';
import { readJsonFile, writeJsonFile } from './jsonStore.mjs';

const TABLE = 'app_otp_codes';
const FILE = 'app-otp-codes.json';

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** Per number, per hour — stops SMS bill abuse from a single form. */
const MAX_SENDS_PER_HOUR = 5;
const RESEND_COOLDOWN_MS = 45 * 1000;

function secret() {
  return (
    process.env.APP_AUTH_JWT_SECRET || process.env.JWT_SECRET || 'wolf-trade-otp-pepper-change-me'
  );
}

function hashCode(phone, code) {
  return createHash('sha256').update(`${phone}:${code}:${secret()}`).digest('hex');
}

function sameHash(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function generateOtpCode() {
  return String(randomInt(100000, 1000000));
}

/* ────────────────────────── file fallback ────────────────────────── */

function readFileRows() {
  const raw = readJsonFile(FILE, { codes: [] });
  return Array.isArray(raw?.codes) ? raw.codes : [];
}

function writeFileRows(codes) {
  // Keep the file small: drop anything long past its usefulness.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  writeJsonFile(FILE, {
    codes: codes.filter((c) => Date.parse(c.created_at || 0) > cutoff),
  });
}

/* ────────────────────────── queries ────────────────────────── */

async function recentRowsForPhone(phone, sinceIso) {
  const db = getAdminClient();
  if (!db) {
    return readFileRows().filter(
      (row) => row.phone === phone && Date.parse(row.created_at) >= Date.parse(sinceIso),
    );
  }

  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('phone', phone)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false });
  if (error) throw storeError(error);
  return data || [];
}

async function latestOpenRow(phone, purpose) {
  const db = getAdminClient();
  if (!db) {
    return (
      readFileRows()
        .filter((row) => row.phone === phone && row.purpose === purpose && !row.consumed_at)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null
    );
  }

  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('phone', phone)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw storeError(error);
  return data?.[0] ?? null;
}

async function insertRow(row) {
  const db = getAdminClient();
  if (!db) {
    writeFileRows([row, ...readFileRows()]);
    return row;
  }

  const { error } = await db.from(TABLE).insert(row);
  if (error) throw storeError(error);
  return row;
}

async function patchRow(id, patch) {
  const db = getAdminClient();
  if (!db) {
    writeFileRows(readFileRows().map((row) => (row.id === id ? { ...row, ...patch } : row)));
    return;
  }

  const { error } = await db.from(TABLE).update(patch).eq('id', id);
  if (error) throw storeError(error);
}

/* ────────────────────────── public API ────────────────────────── */

/**
 * Creates a code for `phone` and stores only its hash. `payload` carries the
 * pending signup so no account exists until the number is proven.
 */
export async function issueOtp(phone, purpose, payload) {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await recentRowsForPhone(phone, hourAgo);

  if (recent.length >= MAX_SENDS_PER_HOUR) {
    throw Object.assign(new Error('Too many OTP requests. Try again after an hour.'), {
      status: 429,
    });
  }

  const newest = recent[0];
  if (newest && Date.now() - Date.parse(newest.created_at) < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil(
      (RESEND_COOLDOWN_MS - (Date.now() - Date.parse(newest.created_at))) / 1000,
    );
    throw Object.assign(new Error(`Please wait ${wait}s before requesting another OTP.`), {
      status: 429,
      retryAfter: wait,
    });
  }

  const code = generateOtpCode();
  const nowIso = new Date().toISOString();
  await insertRow({
    id: `otp_${randomBytes(9).toString('hex')}`,
    phone,
    code_hash: hashCode(phone, code),
    purpose,
    payload: payload ?? null,
    attempts: 0,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    consumed_at: null,
    created_at: nowIso,
  });

  return { code, expiresInSec: Math.floor(TTL_MS / 1000) };
}

/**
 * Verifies and consumes the newest open code for the number.
 * @returns the stored payload so callers can finish the pending action.
 */
export async function consumeOtp(phone, purpose, code) {
  const row = await latestOpenRow(phone, purpose);
  if (!row) {
    throw Object.assign(new Error('No pending OTP. Please request a new code.'), { status: 400 });
  }
  if (Date.parse(row.expires_at) <= Date.now()) {
    throw Object.assign(new Error('This OTP has expired. Please request a new code.'), {
      status: 400,
    });
  }
  if (Number(row.attempts || 0) >= MAX_ATTEMPTS) {
    throw Object.assign(new Error('Too many wrong attempts. Please request a new code.'), {
      status: 429,
    });
  }

  if (!sameHash(row.code_hash, hashCode(phone, String(code || '').trim()))) {
    await patchRow(row.id, { attempts: Number(row.attempts || 0) + 1 });
    const left = MAX_ATTEMPTS - (Number(row.attempts || 0) + 1);
    throw Object.assign(
      new Error(left > 0 ? `Incorrect OTP. ${left} attempt(s) left.` : 'Incorrect OTP.'),
      { status: 400 },
    );
  }

  await patchRow(row.id, { consumed_at: new Date().toISOString() });
  return row.payload ?? null;
}

/** Pending signup data for a resend, so the user does not refill the form. */
export async function pendingOtpPayload(phone, purpose) {
  const row = await latestOpenRow(phone, purpose);
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return row.payload ?? null;
  return row.payload ?? null;
}
