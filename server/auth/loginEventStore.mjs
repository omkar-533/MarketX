/**
 * Timestamped login events for the admin desk.
 * Never stores passwords or broker tokens.
 */
import { randomUUID } from 'crypto';
import { getAdminClient } from './supabaseAdmin.mjs';
import { readJsonFile, writeJsonFile } from './jsonStore.mjs';

const TABLE = 'app_login_events';
const FILE = 'app-login-events.json';
const FILE_CAP = 5_000;
const SELECT_FULL = 'id, user_id, logged_in_at, login_n, last_seen_at, duration_ms, ended_at';
const SELECT_BASIC = 'id, user_id, logged_in_at, login_n';
const SELECT_MIN = 'id, user_id, logged_in_at';

/** Missed heartbeats beyond this gap are idle — do not count as time in the app. */
export const SESSION_IDLE_MS = 90_000;

function missingTable(error) {
  return String(error?.message || '').includes('does not exist');
}

function readFileEvents() {
  const raw = readJsonFile(FILE, { events: [] });
  return Array.isArray(raw?.events) ? raw.events : [];
}

function writeFileEvents(events) {
  writeJsonFile(FILE, { events: events.slice(0, FILE_CAP) });
}

function newerIso(a, b) {
  const ta = Date.parse(a || 0);
  const tb = Date.parse(b || 0);
  if (Number.isFinite(tb) && (!Number.isFinite(ta) || tb > ta)) return b || null;
  if (Number.isFinite(ta)) return a || null;
  return a || b || null;
}

function mergeFileDurations(rows) {
  const file = new Map(readFileEvents().map((e) => [e.id, mapEvent(e)]));
  return (rows || []).map((row) => {
    const local = file.get(row.id);
    if (!local) return row;
    return {
      ...row,
      loginN: row.loginN || local.loginN,
      durationMs: Math.max(Number(row.durationMs) || 0, Number(local.durationMs) || 0),
      lastSeenAt: newerIso(row.lastSeenAt, local.lastSeenAt),
      endedAt: row.endedAt || local.endedAt || null,
    };
  });
}

function mapEvent(row) {
  if (!row) return null;
  if (row.userId) {
    return {
      id: row.id,
      userId: row.userId,
      loggedInAt: row.loggedInAt,
      loginN: Number(row.loginN) > 0 ? Number(row.loginN) : null,
      lastSeenAt: row.lastSeenAt || null,
      durationMs: Math.max(0, Number(row.durationMs) || 0),
      endedAt: row.endedAt || null,
    };
  }
  return {
    id: row.id,
    userId: row.user_id,
    loggedInAt: row.logged_in_at,
    loginN: Number(row.login_n) > 0 ? Number(row.login_n) : null,
    lastSeenAt: row.last_seen_at || null,
    durationMs: Math.max(0, Number(row.duration_ms) || 0),
    endedAt: row.ended_at || null,
  };
}

export function accumulateSessionMs({
  durationMs = 0,
  lastSeenAt = null,
  loggedInAt = null,
  now = Date.now(),
} = {}) {
  const prev = Math.max(0, Number(durationMs) || 0);
  const last = Date.parse(lastSeenAt || loggedInAt || 0);
  if (!Number.isFinite(last) || last <= 0) {
    return { durationMs: prev, addedMs: 0, lastSeenAt: new Date(now).toISOString() };
  }
  const gap = now - last;
  const added = gap > 0 && gap <= SESSION_IDLE_MS ? gap : 0;
  return {
    durationMs: prev + added,
    addedMs: added,
    lastSeenAt: new Date(now).toISOString(),
  };
}

export function spentMsNow(row, now = Date.now()) {
  const base = Math.max(0, Number(row?.durationMs) || 0);
  if (row?.endedAt) return base;
  const last = Date.parse(row?.lastSeenAt || 0);
  if (!Number.isFinite(last) || last <= 0) return base;
  const gap = now - last;
  if (gap > 0 && gap <= SESSION_IDLE_MS) return base + gap;
  return base;
}

export function isSessionLive(row, now = Date.now()) {
  if (!row || row.endedAt) return false;
  const last = Date.parse(row.lastSeenAt || 0);
  return Number.isFinite(last) && last > 0 && now - last <= SESSION_IDLE_MS;
}

export async function appendLoginEvent(userId, at = new Date().toISOString(), loginN = null) {
  const id = String(userId || '').trim();
  if (!id) return null;
  const loggedInAt = at || new Date().toISOString();
  const n = Number(loginN);
  const row = {
    id: randomUUID(),
    userId: id,
    loggedInAt,
    loginN: Number.isFinite(n) && n > 0 ? Math.round(n) : null,
    lastSeenAt: loggedInAt,
    durationMs: 0,
    endedAt: null,
  };

  const file = readFileEvents();
  writeFileEvents([row, ...file]);

  const db = getAdminClient();
  if (!db) return row;
  const full = {
    id: row.id,
    user_id: row.userId,
    logged_in_at: row.loggedInAt,
    last_seen_at: row.lastSeenAt,
    duration_ms: 0,
  };
  if (row.loginN) full.login_n = row.loginN;
  const { error } = await db.from(TABLE).insert(full);
  if (error && !missingTable(error)) {
    const retry = await db.from(TABLE).insert({
      id: row.id,
      user_id: row.userId,
      logged_in_at: row.loggedInAt,
    });
    if (retry.error && !missingTable(retry.error)) {
      console.warn('[login-events] persist skipped', retry.error.message);
    }
  }
  return row;
}

async function queryEvents(db, select, { cap, userId }) {
  let query = db.from(TABLE).select(select).order('logged_in_at', { ascending: false }).limit(cap);
  if (userId) query = query.eq('user_id', userId);
  return query;
}

export async function listLoginEvents({ limit = 400, userId } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 400, 1), 1_000);
  const db = getAdminClient();
  if (db) {
    for (const select of [SELECT_FULL, SELECT_BASIC, SELECT_MIN]) {
      const { data, error } = await queryEvents(db, select, { cap, userId });
      if (!error) {
        const rows = mergeFileDurations((data || []).map(mapEvent));
        if (rows.length || !userId) return rows;
        break;
      }
      if (missingTable(error)) break;
      if (select === SELECT_MIN) console.warn('[login-events] list skipped', error.message);
    }
  }
  let events = readFileEvents().map(mapEvent);
  if (userId) events = events.filter((e) => e.userId === userId);
  return events.slice(0, cap);
}

async function findEvent(id, userId) {
  if (id) {
    const fileHit = readFileEvents().map(mapEvent).find((e) => e.id === id);
    const db = getAdminClient();
    if (db) {
      for (const select of [SELECT_FULL, SELECT_BASIC, SELECT_MIN]) {
        const { data, error } = await db.from(TABLE).select(select).eq('id', id).maybeSingle();
        if (!error && data) return mapEvent(data);
        if (error && missingTable(error)) break;
        if (error && select === SELECT_MIN) break;
      }
    }
    if (fileHit && (!userId || fileHit.userId === userId)) return fileHit;
  }
  const latest = await listLoginEvents({ userId, limit: 1 });
  return latest[0] || null;
}

function patchFileEvent(id, patch) {
  const file = readFileEvents();
  const idx = file.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  file[idx] = { ...file[idx], ...patch };
  writeFileEvents(file);
  return mapEvent(file[idx]);
}

export async function touchLoginSession(userId, { eventId = null, end = false, now = Date.now() } = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const event = await findEvent(eventId, uid);
  if (!event || event.userId !== uid) return null;
  if (event.endedAt && !end) return event;

  const next = accumulateSessionMs({
    durationMs: event.durationMs,
    lastSeenAt: event.lastSeenAt,
    loggedInAt: event.loggedInAt,
    now,
  });
  const patch = {
    lastSeenAt: next.lastSeenAt,
    durationMs: next.durationMs,
    endedAt: end ? next.lastSeenAt : event.endedAt || null,
  };
  const local = patchFileEvent(event.id, patch) || { ...event, ...patch };

  const db = getAdminClient();
  if (!db) return local;
  const payload = {
    last_seen_at: patch.lastSeenAt,
    duration_ms: patch.durationMs,
  };
  if (end) payload.ended_at = patch.endedAt;
  const { error } = await db.from(TABLE).update(payload).eq('id', event.id);
  if (error && !missingTable(error) && !/last_seen_at|duration_ms|ended_at/.test(String(error.message || ''))) {
    console.warn('[login-events] touch skipped', error.message);
  }
  return local;
}

/** Fill 1st / 2nd / 3rd when older rows have no login_n. */
export function stampLoginNumbers(events, totalsByUser) {
  const groups = new Map();
  for (const row of events || []) {
    const list = groups.get(row.userId) || [];
    list.push(row);
    groups.set(row.userId, list);
  }
  for (const [uid, list] of groups) {
    const sorted = [...list].sort(
      (a, b) => Date.parse(a.loggedInAt || 0) - Date.parse(b.loggedInAt || 0),
    );
    const total = Math.max(Number(totalsByUser?.get(uid) || 0), sorted.length);
    const start = total - sorted.length + 1;
    sorted.forEach((row, i) => {
      if (!(Number(row.loginN) > 0)) row.loginN = start + i;
      row.timesLoggedIn = total;
    });
  }
  return events || [];
}

export function timeSpentByUser(events, now = Date.now()) {
  const totals = new Map();
  for (const row of events || []) {
    const ms = spentMsNow(row, now);
    totals.set(row.userId, (totals.get(row.userId) || 0) + ms);
  }
  return totals;
}
