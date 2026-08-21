/**
 * Opportunity outcome log — what actually happened after each listed signal.
 *
 * Forward moves are read from the same candles the scanners scored, so a card's
 * track record is measured, never modelled. A horizon whose bar has not printed
 * yet stays pending: it is not a win, not a loss, and not counted.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readSetting, writeSetting } from '../auth/appSettingsStore.mjs';
import { istCalendarDay, nseBoardDay } from './opportunityDayBoard.mjs';

const SETTINGS_KEY = 'opportunity_outcomes_v1';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const filePath = resolve(root, 'data', 'opportunity-outcomes-v1.json');

const BAR_MS = {
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '1D': 86_400_000,
};

/** Intraday horizons measured from the bar the signal printed on. */
export const HORIZONS = [
  ['h15', 15 * 60_000],
  ['h30', 30 * 60_000],
];

/** Trading days of history a card's record is built from. */
export const KEEP_DAYS = 20;

/** Supabase does not need a write every tick; disk keeps the fresh copy. */
const REMOTE_WRITE_MS = 5 * 60_000;

function emptyBucket() {
  return { n: 0, wins: 0, sum: 0 };
}

function emptyScanner() {
  const out = { signals: 0, eod: emptyBucket() };
  for (const [key] of HORIZONS) out[key] = emptyBucket();
  return out;
}

function readAll() {
  try {
    if (!existsSync(filePath)) return { days: {} };
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    return raw && typeof raw === 'object' && raw.days ? raw : { days: {} };
  } catch {
    return { days: {} };
  }
}

function writeAll(data) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.warn('[opportunity-outcomes] disk skip', err?.message || err);
  }
}

export function trimDays(days, keep = KEEP_DAYS, now = Date.now()) {
  const today = nseBoardDay(now);
  const keys = Object.keys(days || {})
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today)
    .sort()
    .slice(-keep);
  const out = {};
  for (const k of keys) out[k] = days[k];
  return out;
}

function tsOf(candle) {
  const raw = Number(candle?.timestamp ?? candle?.ts ?? candle?.time);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1e12 ? raw : raw * 1000;
}

function stampIndex(candles) {
  const map = new Map();
  for (let i = 0; i < candles.length; i += 1) {
    const ms = tsOf(candles[i]);
    if (ms) map.set(ms, i);
  }
  return map;
}

/**
 * Whether the feed stamps a bar with its close instead of its open.
 * Decided once from the first session bar — guessing per hit picks the next
 * bar on an open-stamped series and reads the entry one bar late.
 * Returns null when the day's bars are absent and it cannot be told.
 */
export function seriesStampsCloses(candles, tfMs, day) {
  const session = Date.parse(`${day}T09:15:00+05:30`);
  if (!Number.isFinite(session) || !tfMs) return null;
  for (const candle of candles) {
    const ms = tsOf(candle);
    if (!ms || ms < session) continue;
    if (Math.abs(ms - session) <= 2_000) return false;
    if (Math.abs(ms - (session + tfMs)) <= 2_000) return true;
    return null;
  }
  return null;
}

function closeOf(candle) {
  const c = Number(candle?.close);
  return Number.isFinite(c) && c > 0 ? c : 0;
}

/** Bar the signal printed on, or -1 when that candle is not in the series. */
export function entryIndexFor(index, detectedAt, tfMs, closeStamped) {
  if (closeStamped === true) return index.get(detectedAt) ?? -1;
  if (closeStamped === false) return index.get(detectedAt - tfMs) ?? -1;
  return index.get(detectedAt - tfMs) ?? index.get(detectedAt) ?? -1;
}

export function movePct(entry, future, direction) {
  if (!(entry > 0) || !(future > 0)) return null;
  const raw = ((future - entry) / entry) * 100;
  return direction === 'bearish' ? -raw : raw;
}

function addMove(bucket, move) {
  bucket.n += 1;
  bucket.sum += move;
  if (move > 0) bucket.wins += 1;
}

/** Last candle of `day` — only trustworthy once that session has closed. */
function eodIndex(candles, day) {
  const close = Date.parse(`${day}T15:30:00+05:30`);
  if (!Number.isFinite(close)) return -1;
  let found = -1;
  for (let i = 0; i < candles.length; i += 1) {
    const ms = tsOf(candles[i]);
    if (!ms) continue;
    if (ms > close) break;
    if (istCalendarDay(ms) === day) found = i;
  }
  return found;
}

/**
 * Recomputed in full from the day's board every tick, so replaying a tick can
 * never double count a signal.
 */
export function buildDayOutcomes(cards, candlesBySymbol, timeframe, day, now = Date.now()) {
  const tfMs = BAR_MS[String(timeframe)] || 0;
  const byScanner = {};
  if (!tfMs) return byScanner;
  const sessionClosed = now >= Date.parse(`${day}T15:30:00+05:30`);

  // One symbol carries many hits across cards — index its series once.
  const seriesCache = new Map();
  const readSeries = (symbol, fallbackKey) => {
    if (seriesCache.has(symbol)) return seriesCache.get(symbol);
    const candles = candlesBySymbol?.[symbol] || candlesBySymbol?.[fallbackKey];
    const entry = Array.isArray(candles) && candles.length
      ? {
          candles,
          index: stampIndex(candles),
          closeStamped: seriesStampsCloses(candles, tfMs, day),
          eod: sessionClosed ? eodIndex(candles, day) : -1,
        }
      : null;
    seriesCache.set(symbol, entry);
    return entry;
  };

  for (const card of cards || []) {
    const id = String(card?.scannerId || '');
    if (!id) continue;
    const agg = byScanner[id] || emptyScanner();
    byScanner[id] = agg;

    for (const hit of card.hits || []) {
      const direction = hit?.direction;
      if (direction !== 'bullish' && direction !== 'bearish') continue;
      const symbol = String(hit?.symbol || '').toUpperCase();
      const detectedAt = Number(hit?.detectedAt);
      if (!symbol || !Number.isFinite(detectedAt) || detectedAt <= 0) continue;

      const series = readSeries(symbol, hit.symbol);
      if (!series) continue;
      const { candles, index, closeStamped, eod } = series;
      const at = entryIndexFor(index, detectedAt, tfMs, closeStamped);
      if (at < 0) continue;
      const entry = closeOf(candles[at]);
      if (!entry) continue;

      agg.signals += 1;

      for (const [key, ms] of HORIZONS) {
        if (ms % tfMs !== 0) continue;
        const ahead = at + ms / tfMs;
        if (ahead >= candles.length) continue;
        const move = movePct(entry, closeOf(candles[ahead]), direction);
        if (move != null) addMove(agg[key], move);
      }

      if (eod > at) {
        const move = movePct(entry, closeOf(candles[eod]), direction);
        if (move != null) addMove(agg.eod, move);
      }
    }
  }
  return byScanner;
}

let loaded = null;
let lastRemoteWrite = 0;

async function ensureLoaded() {
  if (loaded) return loaded;
  const file = readAll();
  let remote = { days: {} };
  try {
    const stored = await readSetting(SETTINGS_KEY);
    if (stored && typeof stored === 'object' && stored.days) remote = stored;
  } catch (err) {
    console.warn('[opportunity-outcomes] supabase read skip', err?.message || err);
  }
  const fileN = Object.keys(file.days || {}).length;
  const remoteN = Object.keys(remote.days || {}).length;
  loaded = { days: trimDays(remoteN >= fileN ? remote.days : file.days) };
  return loaded;
}

export async function recordOpportunityOutcomes({
  universe,
  timeframe,
  cards,
  candlesBySymbol,
  now = Date.now(),
}) {
  const store = await ensureLoaded();
  const day = nseBoardDay(now);
  const slot = `${String(universe || 'F&O')}|${String(timeframe || '5m')}`;
  const byScanner = buildDayOutcomes(cards, candlesBySymbol, timeframe, day, now);
  if (!Object.keys(byScanner).length) return null;

  store.days[day] = { ...(store.days[day] || {}), [slot]: byScanner };
  store.days = trimDays(store.days, KEEP_DAYS, now);
  writeAll(store);

  if (now - lastRemoteWrite >= REMOTE_WRITE_MS) {
    lastRemoteWrite = now;
    try {
      await writeSetting(SETTINGS_KEY, store);
    } catch (err) {
      console.warn('[opportunity-outcomes] supabase write skip', err?.message || err);
    }
  }
  return byScanner;
}

function summarise(bucket) {
  const n = Number(bucket?.n) || 0;
  if (!n) return { samples: 0, winRate: null, avgMove: null };
  return {
    samples: n,
    winRate: Math.round((Number(bucket.wins) / n) * 1000) / 10,
    avgMove: Math.round((Number(bucket.sum) / n) * 100) / 100,
  };
}

/** Per-scanner record over the recent trading days. Empty until signals resolve. */
export async function peekOpportunityStats(universe, timeframe, days = KEEP_DAYS) {
  const store = await ensureLoaded();
  const slot = `${String(universe || 'F&O')}|${String(timeframe || '5m')}`;
  const wanted = Object.keys(store.days).sort().slice(-Math.max(1, days));
  const totals = {};
  for (const day of wanted) {
    const row = store.days[day]?.[slot];
    if (!row) continue;
    for (const [id, agg] of Object.entries(row)) {
      const t = totals[id] || emptyScanner();
      totals[id] = t;
      t.signals += Number(agg.signals) || 0;
      for (const key of ['eod', ...HORIZONS.map(([k]) => k)]) {
        const b = agg[key];
        if (!b) continue;
        t[key].n += Number(b.n) || 0;
        t[key].wins += Number(b.wins) || 0;
        t[key].sum += Number(b.sum) || 0;
      }
    }
  }

  const scanners = {};
  for (const [id, agg] of Object.entries(totals)) {
    scanners[id] = {
      signals: agg.signals,
      h15: summarise(agg.h15),
      h30: summarise(agg.h30),
      eod: summarise(agg.eod),
    };
  }
  return { universe: String(universe || 'F&O'), timeframe: String(timeframe || '5m'), days: wanted.length, scanners };
}
