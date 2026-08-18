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

export async function appendLoginEvent(userId, at = new Date().toISOString()) {
  const id = String(userId || '').trim();
  if (!id) return null;
  const loggedInAt = at || new Date().toISOString();
  const row = { id: randomUUID(), userId: id, loggedInAt };

  const file = readFileEvents();
  writeFileEvents([row, ...file]);

  const db = getAdminClient();
  if (!db) return row;
  const { error } = await db.from(TABLE).insert({
    id: row.id,
    user_id: row.userId,
    logged_in_at: row.loggedInAt,
  });
  if (error && !missingTable(error)) {
    console.warn('[login-events] persist skipped', error.message);
  }
  return row;
}

export async function listLoginEvents({ limit = 400, userId } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 400, 1), 1_000);
  const db = getAdminClient();
  if (db) {
    let query = db
      .from(TABLE)
      .select('id, user_id, logged_in_at')
      .order('logged_in_at', { ascending: false })
      .limit(cap);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (!error) {
      const rows = (data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        loggedInAt: row.logged_in_at,
      }));
      if (rows.length || !userId) return rows;
    } else if (!missingTable(error)) {
      console.warn('[login-events] list skipped', error.message);
    }
  }
  let events = readFileEvents();
  if (userId) events = events.filter((e) => e.userId === userId);
  return events.slice(0, cap);
}
