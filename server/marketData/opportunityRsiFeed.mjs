/**
 * Multi-timeframe RSI feed for the BOOSTERS scanner.
 *
 * The board snapshot only carries 5m candles, so 30m and 2h RSI need their own
 * pulls. INDstocks has no 2-hour interval — 2h bars are folded from 60m bars in
 * NSE session order (09:15-11:15, 11:15-13:15, 13:15-15:15, 15:15-15:30).
 *
 * Values are Wilder RSI, which is what Chartink/TradingView report. The shared
 * TechnicalEngine `rsi()` is a simple-average variant used by other scanners and
 * is deliberately left alone.
 *
 * Only RSI points travel to the browser — never the extra candle history.
 */
import {
  ensureInstrumentMap,
  fetchIndstocksCandlesMany,
  lastCompletedNseSessionEndMs,
  resolveScripCodeCandidates,
} from './indstocksClient.mjs';
import { resolveServerUniverse } from './universeLists.mjs';

const RSI_PERIOD = 14;
/** Two stitched windows per timeframe — one INDstocks span is too short for Wilder to settle. */
const HISTORY_WINDOWS = 2;
/** 30m RSI only moves on a 30m close, so the pull is reused across 5m snapshots. */
const FEED_BUCKET_MS = 30 * 60_000;
/** Points older than this cannot pair with the 130-bar 5m snapshot. */
const KEEP_SESSIONS = 3;

/** @type {Map<string, { key: string, builtAt: number, bySymbol: Record<string, object> }>} */
const cache = new Map();
/** @type {Map<string, Promise<object>>} */
const inflight = new Map();

function istDay(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function barTimeMs(c) {
  const x = Number(c?.timestamp ?? c?.time ?? c?.ts);
  if (!Number.isFinite(x) || x <= 0) return 0;
  return x > 1e12 ? x : x * 1000;
}

/** Ascending, de-duplicated {timestamp, close} rows. */
export function normalizeBars(candles) {
  const byTs = new Map();
  for (const c of candles || []) {
    const t = barTimeMs(c);
    const close = Number(c?.close);
    if (!(t > 0) || !(close > 0)) continue;
    byTs.set(t, close);
  }
  return [...byTs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, close]) => ({ timestamp, close }));
}

/** 60m bars → 2h bars, restarting the pair count every session. */
export function foldTwoHour(bars) {
  const byDay = new Map();
  for (const b of bars) {
    const day = istDay(b.timestamp);
    const list = byDay.get(day) || [];
    list.push(b);
    byDay.set(day, list);
  }
  const out = [];
  for (const day of [...byDay.keys()].sort()) {
    const list = byDay.get(day);
    for (let i = 0; i < list.length; i += 2) {
      // A trailing odd bar is the 15:15-15:30 stub — Chartink prints it too.
      out.push(list[Math.min(i + 1, list.length - 1)]);
    }
  }
  return out;
}

function rsiFrom(avgGain, avgLoss) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Wilder RSI at every bar — [[barCloseMs, rsi], ...] ascending. */
export function wilderRsiSeries(bars, period = RSI_PERIOD) {
  if (!Array.isArray(bars) || bars.length <= period) return [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const d = bars[i].close - bars[i - 1].close;
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  const out = [[bars[period].timestamp, rsiFrom(avgGain, avgLoss)]];
  for (let i = period + 1; i < bars.length; i += 1) {
    const d = bars[i].close - bars[i - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out.push([bars[i].timestamp, rsiFrom(avgGain, avgLoss)]);
  }
  return out;
}

function trimSeries(series, keepFromMs) {
  const rounded = series
    .filter(([t]) => t >= keepFromMs)
    .map(([t, v]) => [t, Math.round(v * 100) / 100]);
  // Always keep one earlier point so an early-session 5m bar still resolves.
  if (rounded.length || !series.length) return rounded;
  const [t, v] = series[series.length - 1];
  return [[t, Math.round(v * 100) / 100]];
}

export function keepFromMs(now = Date.now()) {
  return lastCompletedNseSessionEndMs(now) - KEEP_SESSIONS * 86_400_000;
}

/** 5m RSI rides the snapshot candles that were already fetched — no extra pull. */
export function rsiSeriesFromCandles(candles, cutFromMs) {
  return trimSeries(wilderRsiSeries(normalizeBars(candles)), cutFromMs);
}

function feedKey(universe, now = Date.now()) {
  return `${universe}|${Math.floor(now / FEED_BUCKET_MS)}`;
}

/** Stitch older windows so Wilder RSI has room to converge. */
async function pullSeries(accessToken, scrips, timeframe, bars) {
  const merged = new Map();
  let end = Date.now();
  for (let w = 0; w < HISTORY_WINDOWS; w += 1) {
    const byScrip = await fetchIndstocksCandlesMany(accessToken, scrips, timeframe, bars, {
      endMs: end,
    });
    let oldest = end;
    for (const [scrip, rows] of byScrip) {
      const list = merged.get(scrip) || [];
      for (const row of rows || []) {
        const t = barTimeMs(row);
        if (t > 0 && t < oldest) oldest = t;
        list.push(row);
      }
      merged.set(scrip, list);
    }
    if (!(oldest < end)) break;
    end = oldest - 60_000;
  }
  return merged;
}

async function buildFeed(accessToken, universe) {
  await ensureInstrumentMap(accessToken);
  const symbols = resolveServerUniverse(universe);
  /** @type {Map<string, string>} */
  const scripBySymbol = new Map();
  for (const symbol of symbols) {
    const scrip = resolveScripCodeCandidates(symbol)[0];
    if (scrip) scripBySymbol.set(symbol, scrip);
  }
  const scrips = [...new Set(scripBySymbol.values())];
  const cut = keepFromMs();

  const CHUNK = 45;
  /** @type {Map<string, object[]>} */
  const m30 = new Map();
  /** @type {Map<string, object[]>} */
  const h1 = new Map();
  for (let i = 0; i < scrips.length; i += CHUNK) {
    const slice = scrips.slice(i, i + CHUNK);
    for (const [scrip, rows] of await pullSeries(accessToken, slice, '30m', 250)) {
      m30.set(scrip, rows);
    }
    for (const [scrip, rows] of await pullSeries(accessToken, slice, '1h', 250)) {
      h1.set(scrip, rows);
    }
  }

  /** @type {Record<string, { m30: number[][], h2: number[][] }>} */
  const bySymbol = {};
  for (const [symbol, scrip] of scripBySymbol) {
    const bars30 = normalizeBars(m30.get(scrip));
    const bars1h = normalizeBars(h1.get(scrip));
    const s30 = trimSeries(wilderRsiSeries(bars30), cut);
    const s2h = trimSeries(wilderRsiSeries(foldTwoHour(bars1h)), cut);
    if (!s30.length || !s2h.length) continue;
    bySymbol[symbol] = { m30: s30, h2: s2h };
  }
  return { builtAt: Date.now(), bySymbol };
}

/**
 * Cached 30m + 2h RSI per symbol. Returns an empty map on failure so a broken
 * higher-timeframe pull only silences BOOSTERS, never the whole board.
 */
export async function peekOpportunityRsiFeed(accessToken, universe) {
  const u = String(universe || 'F&O');
  const key = feedKey(u);
  const hit = cache.get(u);
  if (hit && hit.key === key) return hit.bySymbol;
  if (inflight.has(key)) return inflight.get(key);

  const run = (async () => {
    try {
      const built = await buildFeed(accessToken, u);
      cache.set(u, { key, builtAt: built.builtAt, bySymbol: built.bySymbol });
      return built.bySymbol;
    } catch (err) {
      console.warn('[opportunity-rsi] higher timeframe pull failed', err?.message || err);
      return hit?.bySymbol || {};
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}
