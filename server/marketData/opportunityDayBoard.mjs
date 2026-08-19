/**
 * Shared Opportunity day log — one IST-day board for every login.
 * Morning prints stay. Later reprints append. Market close does not wipe.
 */
import { lastCompletedNseSessionEndMs } from './indstocksClient.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readSetting, writeSetting } from '../auth/appSettingsStore.mjs';

const SCANNER_META = [
  ['wolf_prime', 'WOLF PRIME', 'Same name hits 2+ keepers on this bar — conviction overlay, not a new setup.'],
  ['compression_break', 'COMPRESSION BREAK', 'Prior range/ATR coiled, then a volume close left that box.'],
  ['breakout_radar', 'BREAKOUT RADAR', 'Close beyond the prior 20-bar high or low, with volume, not a late chase.'],
  ['liquidity_hunt', 'LIQUIDITY HUNT', 'Stop-hunt wick through a swing, then close back — sweep plus reclaim only.'],
  ['momentum_surge', 'MOMENTUM SURGE', 'Unusual volume plus an ATR-sized move in the same direction as RSI.'],
  ['trend_rider', 'TREND RIDER', 'EMA 21/50 stacked, RSI with the trend, and a pullback hold — not a chase.'],
];

const SCANNER_IDS = new Set(SCANNER_META.map((s) => s[0]));
const SETTINGS_KEY = 'opportunity_day_board_v13';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const filePath = resolve(root, 'data', 'opportunity-day-board-v13.json');

export function istCalendarDay(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

export function nseBoardDay(now = Date.now()) {
  const end = lastCompletedNseSessionEndMs(now);
  return istCalendarDay(end > 0 ? end : now);
}

export function boardSlot(universe, timeframe, now = Date.now()) {
  const tf = String(timeframe || '5m');
  const u = String(universe || 'F&O');
  return `${nseBoardDay(now)}|${u}|${tf}`;
}

export function msUntilNextSessionOpen(now = Date.now()) {
  const ymd = istCalendarDay(now);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date(now));
  const open = Date.parse(`${ymd}T09:15:00+05:30`);
  if (wd !== 'Sat' && wd !== 'Sun' && now < open) return Math.max(5_000, open - now);
  const skip = wd === 'Fri' ? 3 : wd === 'Sat' ? 2 : 1;
  const nx = Date.parse(`${ymd}T09:15:00+05:30`) + skip * 86_400_000;
  return Math.max(5_000, (Number.isFinite(nx) ? nx : now + 86_400_000) - now);
}

export function retainBoardsForDay(all, day) {
  const boards = {};
  for (const [k, v] of Object.entries(all?.boards || {})) {
    if (String(k).startsWith(`${day}|`)) boards[k] = v;
  }
  return { day, boards };
}

/** @type {ReturnType<typeof setTimeout> | null} */
let rolloverTimer = null;

export function dropExpiredOpportunityBoards(now = Date.now()) {
  const day = nseBoardDay(now);
  let dropped = false;
  for (const k of [...mem.keys()]) {
    if (!String(k).startsWith(`${day}|`)) {
      mem.delete(k);
      dropped = true;
    }
  }
  if (dropped) writeAll({ day, boards: Object.fromEntries(mem) });
  armDayRollover(now);
  return day;
}

export function armDayRollover(now = Date.now()) {
  if (rolloverTimer) return;
  const wait = msUntilNextSessionOpen(now);
  rolloverTimer = setTimeout(() => {
    rolloverTimer = null;
    dropExpiredOpportunityBoards();
  }, wait);
}

function emptyHits() {
  /** @type {Record<string, object[]>} */
  const hits = {};
  for (const [id] of SCANNER_META) hits[id] = [];
  return hits;
}

function readAll() {
  try {
    if (!existsSync(filePath)) return { day: '', boards: {} };
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    return raw && typeof raw === 'object' ? raw : { day: '', boards: {} };
  } catch {
    return { day: '', boards: {} };
  }
}

function writeAll(data) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.warn('[opportunity-day-board] disk skip', err?.message || err);
  }
}

function listingOk(ms, day) {
  const t = Number(ms);
  if (!Number.isFinite(t) || t <= 0) return false;
  if (t > Date.now() + 2_000) return false;
  if (istCalendarDay(t) !== day) return false;
  const open = Date.parse(`${day}T09:15:00+05:30`);
  const close = Date.parse(`${day}T15:30:00+05:30`);
  return t >= open - 2_000 && t <= close + 2_000;
}

function slimHit(raw, day) {
  if (!raw || typeof raw !== 'object') return null;
  const scannerId = String(raw.scannerId || '');
  const symbol = String(raw.symbol || '').toUpperCase();
  const detectedAt = Number(raw.detectedAt);
  if (!SCANNER_IDS.has(scannerId) || !symbol || !listingOk(detectedAt, day)) return null;
  const score = Number(raw.score);
  if (!Number.isFinite(score) || score < 50 || score > 100) return null;
  return {
    id: `opp-${scannerId}-${symbol}-${raw.timeframe || '5m'}-${detectedAt}`,
    scannerId,
    symbol,
    exchange: raw.exchange === 'BSE' ? 'BSE' : 'NSE',
    price: Number(raw.price) || 0,
    changePercent: Number(raw.changePercent) || 0,
    timeframe: String(raw.timeframe || '5m'),
    direction: raw.direction === 'bearish' ? 'bearish' : raw.direction === 'neutral' ? 'neutral' : 'bullish',
    status: String(raw.status || 'WATCH'),
    score: Math.round(score),
    breakdown: raw.breakdown && typeof raw.breakdown === 'object' ? raw.breakdown : {},
    stateLabel: String(raw.stateLabel || ''),
    why: String(raw.why || '').slice(0, 280),
    keyLevel: raw.keyLevel == null ? null : Number(raw.keyLevel),
    trigger: raw.trigger == null ? null : Number(raw.trigger),
    invalidation: String(raw.invalidation || '').slice(0, 160),
    confirmationNeeded: String(raw.confirmationNeeded || '').slice(0, 160),
    evidence: Array.isArray(raw.evidence) ? raw.evidence.slice(0, 8) : [],
    detectedAt,
    dataMode: 'LIVE',
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
  };
}

export function mergeScannerHits(prev, incoming, day) {
  const byKey = new Map();
  for (const h of prev || []) {
    if (!listingOk(h.detectedAt, day)) continue;
    byKey.set(`${h.symbol}|${h.detectedAt}`, h);
  }
  for (const raw of incoming || []) {
    const h = slimHit(raw, day);
    if (!h) continue;
    const k = `${h.symbol}|${h.detectedAt}`;
    const old = byKey.get(k);
    byKey.set(k, old ? { ...h, detectedAt: old.detectedAt, id: old.id } : h);
  }
  const all = [...byKey.values()];
  const groups = new Map();
  for (const h of all) {
    const g = groups.get(h.symbol) || [];
    g.push(h);
    groups.set(h.symbol, g);
  }
  const ranked = [...groups.entries()].sort((a, b) => {
    const ta = Math.max(...a[1].map((h) => h.detectedAt));
    const tb = Math.max(...b[1].map((h) => h.detectedAt));
    return tb - ta || a[0].localeCompare(b[0]);
  });
  return ranked.flatMap(([, g]) =>
    [...g]
      .sort((a, b) => a.detectedAt - b.detectedAt || a.symbol.localeCompare(b.symbol))
      .filter((h, i, arr) => i === 0 || h.detectedAt !== arr[i - 1].detectedAt)
      .slice(0, 4),
  );
}

function toCards(hitsByScanner) {
  return SCANNER_META.map(([id, title, tagline]) => {
    const hits = hitsByScanner[id] || [];
    return {
      scannerId: id,
      title,
      tagline,
      status: hits.length ? 'ready' : 'idle',
      hits,
      updatedAt: Date.now(),
    };
  });
}

function hitCount(hitsByScanner) {
  return Object.values(hitsByScanner || {}).reduce((n, h) => n + (h?.length || 0), 0);
}

/** @type {Map<string, object>} */
const mem = new Map();
let durableReady = false;
/** @type {Promise<void> | null} */
let durableWait = null;

function hydrate(slot) {
  if (mem.has(slot)) return mem.get(slot);
  const all = readAll();
  const row = all.boards?.[slot];
  if (row?.hitsByScanner) {
    mem.set(slot, row);
    return row;
  }
  return null;
}

function snapshotBoards(day) {
  return retainBoardsForDay({ boards: Object.fromEntries(mem) }, day);
}

async function ensureDurable(now = Date.now()) {
  if (durableReady) {
    dropExpiredOpportunityBoards(now);
    return;
  }
  if (!durableWait) {
    durableWait = (async () => {
      const day = nseBoardDay(now);
      const file = retainBoardsForDay(readAll(), day);
      let remote = { day, boards: {} };
      try {
        const stored = await readSetting(SETTINGS_KEY);
        if (stored && typeof stored === 'object') remote = retainBoardsForDay(stored, day);
      } catch (err) {
        console.warn('[opportunity-day-board] supabase read skip', err?.message || err);
      }
      const fileN = Object.keys(file.boards || {}).length;
      const remoteN = Object.keys(remote.boards || {}).length;
      const next = remoteN >= fileN ? remote : file;
      mem.clear();
      for (const [k, v] of Object.entries(next.boards || {})) mem.set(k, v);
      writeAll({ day, boards: Object.fromEntries(mem) });
      durableReady = true;
      armDayRollover(now);
      if (remoteN < fileN && fileN > 0) {
        try {
          await writeSetting(SETTINGS_KEY, { day, boards: Object.fromEntries(mem) });
        } catch {
          /* next merge retries */
        }
      }
    })().finally(() => {
      durableWait = null;
    });
  }
  await durableWait;
}

async function persistDurable(now = Date.now()) {
  const payload = snapshotBoards(nseBoardDay(now));
  writeAll(payload);
  try {
    await writeSetting(SETTINGS_KEY, payload);
  } catch (err) {
    console.warn('[opportunity-day-board] supabase write skip', err?.message || err);
  }
}

function peekSync(universe, timeframe, now = Date.now()) {
  const day = dropExpiredOpportunityBoards(now);
  const tf = String(timeframe || '5m');
  const u = String(universe || 'F&O');
  const slot = `${day}|${u}|${tf}`;
  const row = hydrate(slot);
  if (!row) {
    return {
      ready: false,
      day,
      universe: u,
      timeframe: tf,
      cacheKey: slot,
      cards: toCards(emptyHits()),
      hits: 0,
      source: 'shared-day-board',
    };
  }
  return {
    ready: hitCount(row.hitsByScanner) > 0,
    day,
    universe: u,
    timeframe: tf,
    cacheKey: row.cacheKey || slot,
    updatedAt: row.updatedAt || 0,
    asOf: row.asOf || row.updatedAt || 0,
    cards: toCards(row.hitsByScanner),
    hits: hitCount(row.hitsByScanner),
    source: 'shared-day-board',
  };
}

export async function persistOpportunityDayBoard(now = Date.now()) {
  await ensureDurable(now);
  await persistDurable(now);
  return peekSync('F&O', '5m', now);
}

export async function peekOpportunityDayBoard(universe, timeframe, now = Date.now()) {
  await ensureDurable(now);
  return peekSync(universe, timeframe, now);
}

export async function mergeOpportunityDayBoard(universe, timeframe, incomingCards, cacheKey, now = Date.now()) {
  await ensureDurable(now);
  const day = dropExpiredOpportunityBoards(now);
  const tf = String(timeframe || '5m');
  const u = String(universe || 'F&O');
  const slot = `${day}|${u}|${tf}`;
  const next = emptyHits();
  const inBy = new Map((incomingCards || []).map((c) => [c.scannerId, c]));
  for (const [id] of SCANNER_META) {
    next[id] = mergeScannerHits([], inBy.get(id)?.hits || [], day);
  }
  const row = {
    day,
    universe: u,
    timeframe: tf,
    cacheKey: cacheKey || slot,
    updatedAt: Date.now(),
    asOf: Date.now(),
    hitsByScanner: next,
  };
  mem.set(slot, row);
  await persistDurable(now);
  return peekSync(u, tf, now);
}
