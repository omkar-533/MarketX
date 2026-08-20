/**
 * One INDstocks candle snapshot per universe + timeframe + bar bucket.
 * Every login / every PC reads this same map so Opportunity ranks the same names.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  ensureInstrumentMap,
  fetchIndstocksCandles,
  fetchIndstocksCandlesMany,
  lastCompletedNseSessionEndMs,
  nsePriorCompletedSessionEndMs,
  resolveScripCodeCandidates,
} from './indstocksClient.mjs';
import { resolveServerUniverse } from './universeLists.mjs';
import { dropExpiredOpportunityBoards } from './opportunityDayBoard.mjs';

const BAR_MS = {
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '1D': 86_400_000,
};

const SNAP_BARS = {
  '5m': 130,
  '15m': 80,
  '1h': 80,
  '1D': 80,
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const filePath = resolve(root, 'data', 'opportunity-snapshots.json');

/** @type {Map<string, object>} */
const cache = new Map();
/** @type {Map<string, Promise<object>>} */
const inflight = new Map();
/** @type {Map<string, { at: number, error: string }>} */
const lastFail = new Map();
/** @type {Map<string, { loaded: number, total: number }>} */
const progress = new Map();

function normTf(timeframe) {
  const tf = String(timeframe || '5m');
  return BAR_MS[tf] ? tf : '5m';
}

function uniqueSorted(symbols) {
  return [...new Set((symbols || []).map((s) => String(s || '').toUpperCase()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function readDisk() {
  try {
    if (!existsSync(filePath)) return {};
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeDisk(key, payload) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const all = readDisk();
    all[key] = payload;
    writeFileSync(filePath, JSON.stringify(all), 'utf8');
  } catch (err) {
    console.warn('[opportunity-snapshot] disk skip', err?.message || err);
  }
}

function hydrateDisk(key) {
  const row = readDisk()[key];
  if (!row || !row.ready || !row.candlesBySymbol) return null;
  cache.set(key, row);
  return row;
}

function hydrateAllDisk() {
  const all = readDisk();
  for (const [k, v] of Object.entries(all)) {
    if (v?.ready && v?.candlesBySymbol) cache.set(k, v);
  }
}

/** Last ready map for this universe+tf — used while the new NSE bar is still building. */
export function pickStaleSnapshot(universe, timeframe, exactKey) {
  hydrateAllDisk();
  const exact = cache.get(exactKey);
  if (exact?.ready && exact.candlesBySymbol) return exact;
  const tf = normTf(timeframe);
  const p = `${String(universe || 'F&O')}|${tf}|`;
  let bestBucket = -1;
  let best = null;
  for (const [k, v] of cache.entries()) {
    if (!k.startsWith(p) || !v?.ready || !v.candlesBySymbol) continue;
    const bucket = Number(k.slice(p.length)) || 0;
    if (bucket >= bestBucket) {
      bestBucket = bucket;
      best = v;
    }
  }
  return best;
}

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const refreshTimers = new Map();
/** @type {string} */
let lastAccessToken = '';

function istCalendarDay(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

export function nseCashSessionIsOpen(now = Date.now()) {
  const ymd = istCalendarDay(now);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date(now));
  if (wd === 'Sat' || wd === 'Sun') return false;
  const open = Date.parse(`${ymd}T09:15:00+05:30`);
  const close = Date.parse(`${ymd}T15:30:00+05:30`);
  return Number.isFinite(open) && Number.isFinite(close) && now >= open && now < close;
}

function nseSessionOpenMs(now) {
  const ymd = istCalendarDay(lastCompletedNseSessionEndMs(now));
  const open = Date.parse(`${ymd}T09:15:00+05:30`);
  return Number.isFinite(open) ? open : 0;
}

function nseTodaySessionOpenMs(now) {
  const open = Date.parse(`${istCalendarDay(now)}T09:15:00+05:30`);
  return Number.isFinite(open) ? open : 0;
}

function snapshotJobId(universe, timeframe) {
  return `${String(universe || 'F&O')}|${normTf(timeframe)}`;
}

/** Close time of the last finished NSE bar — same board for every login in that bar. */
export function nseLastClosedBarCloseMs(timeframe, now = Date.now()) {
  const tf = normTf(timeframe);
  const dur = BAR_MS[tf] || BAR_MS['5m'];
  const priorClose = nsePriorCompletedSessionEndMs(now);
  if (tf === '1D') {
    return nseCashSessionIsOpen(now) ? priorClose : lastCompletedNseSessionEndMs(now) || priorClose || 0;
  }
  const sessionEnd = lastCompletedNseSessionEndMs(now);
  const start = nseSessionOpenMs(now);
  if (!(start > 0)) return priorClose || 0;
  const cap = Math.min(now, sessionEnd || now);
  if (cap < start) return priorClose || 0;
  const closed = Math.floor((cap - start) / dur);
  if (closed <= 0) return priorClose || 0;
  const close = start + closed * dur;
  return close > now + 2_000 ? close - dur : close;
}

export function msUntilNextNseBar(timeframe, now = Date.now()) {
  const tf = normTf(timeframe);
  const dur = BAR_MS[tf] || BAR_MS['5m'];
  if (!nseCashSessionIsOpen(now)) {
    const ymd = istCalendarDay(lastCompletedNseSessionEndMs(now));
    const p = new Date(`${ymd}T12:00:00+05:30`);
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(p);
    const skip = wd === 'Fri' ? 3 : 1;
    const nx = Date.parse(`${ymd}T09:15:00+05:30`) + skip * 86_400_000 + dur;
    const wait = (Number.isFinite(nx) ? nx : now + dur) - now + 4_000;
    return Math.max(60_000, wait);
  }
  const todayOpen = nseTodaySessionOpenMs(now);
  const todayClose = Date.parse(`${istCalendarDay(now)}T15:30:00+05:30`);
  const last = nseLastClosedBarCloseMs(tf, now);
  let next = todayOpen > 0 ? todayOpen + dur : now + dur;
  if (last >= todayOpen) next = last + dur;
  if (Number.isFinite(todayClose) && next > todayClose + 2_000) {
    const ymd = istCalendarDay(now);
    const p = new Date(`${ymd}T12:00:00+05:30`);
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(p);
    const skip = wd === 'Fri' ? 3 : 1;
    const nx = Date.parse(`${ymd}T09:15:00+05:30`) + skip * 86_400_000 + dur;
    next = Number.isFinite(nx) ? nx : now + dur;
  }
  return Math.max(8_000, next - now + 4_000);
}

export function snapshotCacheKey(universe, timeframe, now = Date.now()) {
  const tf = normTf(timeframe);
  const u = String(universe || 'F&O');
  const bucket = nseLastClosedBarCloseMs(tf, now) || nsePriorCompletedSessionEndMs(now);
  return `${u}|${tf}|${bucket}`;
}

function candleTimeMs(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return 0;
  return x > 1e12 ? x : x * 1000;
}

function slimCandles(symbol, candles) {
  return (candles || []).map((c) => ({
    symbol,
    timestamp: candleTimeMs(c.timestamp) || candleTimeMs(c.time) || candleTimeMs(c.ts),
    open: Number(c.open) || 0,
    high: Number(c.high) || 0,
    low: Number(c.low) || 0,
    close: Number(c.close) || 0,
    volume: Number(c.volume) || 0,
  }));
}

async function fillCandles(accessToken, symbols, timeframe, bars, progressId) {
  await ensureInstrumentMap(accessToken);
  /** @type {Record<string, object[]>} */
  const result = {};
  /** @type {{ symbol: string, scrip: string }[]} */
  const need = [];
  // Stale-data guard: a series whose last bar is days behind the latest session is
  // useless for a momentum board (wrong instrument / broken history) — drop it.
  const staleFloor =
    lastCompletedNseSessionEndMs(Date.now()) -
    (timeframe === '1D' ? 12 : 4) * 86_400_000;
  const isStale = (rows) => {
    if (!rows.length) return false;
    const lastT = Number(rows[rows.length - 1]?.timestamp) || 0;
    return lastT > 0 && lastT < staleFloor;
  };
  for (const symbol of symbols) {
    const scrip = resolveScripCodeCandidates(symbol)[0];
    if (!scrip) {
      result[symbol] = [];
      continue;
    }
    need.push({ symbol, scrip });
  }
  progress.set(progressId, { loaded: Object.keys(result).length, total: symbols.length });

  const CHUNK = 45;
  for (let i = 0; i < need.length; i += CHUNK) {
    const slice = need.slice(i, i + CHUNK);
    const scrips = [...new Set(slice.map((n) => n.scrip))];
    const byScrip = await fetchIndstocksCandlesMany(accessToken, scrips, timeframe, bars);
    for (const { symbol, scrip } of slice) {
      let candles = byScrip.get(scrip) || [];
      if (isStale(candles)) candles = [];
      if (candles.length < 20) {
        const alts = resolveScripCodeCandidates(symbol)
          .filter((c) => c !== scrip)
          .slice(0, 2);
        for (const alt of alts) {
          try {
            const chunk = await fetchIndstocksCandles(accessToken, alt, timeframe, bars);
            if (!isStale(chunk) && chunk.length > candles.length) candles = chunk;
            if (candles.length >= 20) break;
          } catch {
            /* next alt */
          }
        }
      }
      if (isStale(candles)) candles = [];
      result[symbol] = slimCandles(symbol, candles);
    }
    progress.set(progressId, { loaded: Object.keys(result).length, total: symbols.length });
  }

  for (const symbol of symbols) {
    if (!result[symbol]) result[symbol] = [];
  }
  return result;
}

function armAutoFetch(universe, timeframe, accessToken) {
  if (!accessToken) return;
  lastAccessToken = accessToken;
  const tf = normTf(timeframe);
  const u = String(universe || 'F&O');
  const id = `${u}|${tf}`;
  if (refreshTimers.has(id)) return;
  const wait = msUntilNextNseBar(tf);
  const timer = setTimeout(() => {
    refreshTimers.delete(id);
    const token = lastAccessToken;
    if (!token) return;
    dropExpiredOpportunityBoards();
    peekOpportunitySnapshot(token, u, tf);
  }, wait);
  refreshTimers.set(id, timer);
}

async function buildSnapshot(accessToken, universe, timeframe, key, jobId) {
  const symbols = uniqueSorted(resolveServerUniverse(universe));
  const bars = SNAP_BARS[timeframe] || 120;
  progress.set(jobId, { loaded: 0, total: symbols.length });
  const candlesBySymbol = await fillCandles(accessToken, symbols, timeframe, bars, jobId);
  const barClose = nseLastClosedBarCloseMs(timeframe);
  const asOf = barClose || Date.now();
  return {
    ready: true,
    universe,
    timeframe,
    bars,
    symbols,
    candlesBySymbol,
    builtAt: asOf,
    asOf,
    source: 'shared-indstocks',
    cacheKey: key,
  };
}

export function peekOpportunitySnapshot(accessToken, universe, timeframe, opts = {}) {
  dropExpiredOpportunityBoards();
  const tf = normTf(timeframe);
  const u = String(universe || 'F&O');
  const key = snapshotCacheKey(u, tf);
  const jobId = snapshotJobId(u, tf);
  if (accessToken) lastAccessToken = accessToken;
  const hit = pickStaleSnapshot(u, tf, key);
  const sessionOpen = nseCashSessionIsOpen();
  const force = Boolean(opts.force) && sessionOpen;
  const builtAt = Number(hit?.builtAt || hit?.asOf || 0);
  const staleMs = builtAt > 0 ? Date.now() - builtAt : Number.POSITIVE_INFINITY;
  const serveHot =
    hit?.ready &&
    hit.candlesBySymbol &&
    (!sessionOpen || hit.cacheKey === key) &&
    !(force && staleMs > 50_000 && !inflight.has(jobId));
  if (serveHot) {
    if (sessionOpen) armAutoFetch(u, tf, accessToken || lastAccessToken);
    return { ready: true, ...hit, frozen: !sessionOpen };
  }
  const fail = lastFail.get(jobId);
  if (fail && !hit && Date.now() - fail.at < 20_000 && !inflight.has(jobId)) {
    return {
      ready: false,
      building: false,
      error: fail.error,
      universe: u,
      timeframe: tf,
      cacheKey: key,
      source: 'shared-indstocks',
    };
  }
  if (!inflight.has(jobId) && accessToken) {
    lastFail.delete(jobId);
    const job = buildSnapshot(accessToken, u, tf, key, jobId)
      .then((payload) => {
        cache.set(key, payload);
        writeDisk(key, payload);
        for (const k of [...cache.keys()]) {
          if (k !== key && k.startsWith(`${u}|${tf}|`)) cache.delete(k);
        }
        armAutoFetch(u, tf, accessToken);
        return payload;
      })
      .finally(() => {
        inflight.delete(jobId);
        progress.delete(jobId);
      });
    inflight.set(jobId, job);
    job.catch((err) => {
      const message = err instanceof Error ? err.message : 'Shared board failed';
      console.warn('[opportunity-snapshot] build failed', message);
      lastFail.set(jobId, { at: Date.now(), error: message });
    });
  }
  if (hit?.ready && hit.candlesBySymbol) {
    armAutoFetch(u, tf, accessToken || lastAccessToken);
    return { ready: true, ...hit, building: inflight.has(jobId), serving: 'previous-bar' };
  }
  const prog = progress.get(jobId) || { loaded: 0, total: 0 };
  return {
    ready: false,
    building: inflight.has(jobId),
    universe: u,
    timeframe: tf,
    symbolsLoaded: prog.loaded,
    symbolsTotal: prog.total,
    cacheKey: key,
    source: 'shared-indstocks',
  };
}

/** Wait for the shared INDstocks candle map. Never logs the token. */
export async function awaitOpportunitySnapshot(
  accessToken,
  universe,
  timeframe,
  { force = false, timeoutMs = 180_000 } = {},
) {
  const tf = normTf(timeframe);
  const u = String(universe || 'F&O');
  const key = snapshotCacheKey(u, tf);
  const jobId = snapshotJobId(u, tf);
  peekOpportunitySnapshot(accessToken, u, tf, { force });
  const job = inflight.get(jobId);
  if (job) {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Opportunity snapshot timed out')), timeoutMs);
    });
    return Promise.race([job, timeout]);
  }
  const hit = pickStaleSnapshot(u, tf, key);
  if (hit?.ready && hit.candlesBySymbol) return hit;
  throw new Error('Opportunity snapshot unavailable');
}
