/**
 * One INDstocks candle snapshot per universe + timeframe + bar bucket.
 * Every login / every PC reads this same map so Opportunity ranks the same names.
 */
import {
  ensureInstrumentMap,
  fetchIndstocksCandles,
  fetchIndstocksCandlesMany,
  resolveScripCodeCandidates,
} from './indstocksClient.mjs';
import { resolveServerUniverse } from './universeLists.mjs';

const BAR_MS = {
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '1D': 86_400_000,
};

const SNAP_BARS = {
  '5m': 120,
  '15m': 80,
  '1h': 80,
  '1D': 80,
};

/** @type {Map<string, object>} */
const cache = new Map();
/** @type {Map<string, Promise<object>>} */
const inflight = new Map();
/** @type {Map<string, { at: number, error: string }>} */
const lastFail = new Map();

function normTf(timeframe) {
  const tf = String(timeframe || '5m');
  return BAR_MS[tf] ? tf : '5m';
}

function uniqueSorted(symbols) {
  return [...new Set((symbols || []).map((s) => String(s || '').toUpperCase()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function snapshotCacheKey(universe, timeframe, now = Date.now()) {
  const tf = normTf(timeframe);
  const u = String(universe || 'F&O');
  return `${u}|${tf}|${Math.floor(now / BAR_MS[tf])}`;
}

function slimCandles(symbol, candles) {
  return (candles || []).map((c) => ({
    symbol,
    timestamp: Number(c.timestamp) || Number(c.time) || Number(c.ts) || 0,
    open: Number(c.open) || 0,
    high: Number(c.high) || 0,
    low: Number(c.low) || 0,
    close: Number(c.close) || 0,
    volume: Number(c.volume) || 0,
  }));
}

async function fillCandles(accessToken, symbols, timeframe, bars, key) {
  await ensureInstrumentMap(accessToken);
  /** @type {Record<string, object[]>} */
  const result = {};
  /** @type {{ symbol: string, scrip: string }[]} */
  const need = [];
  for (const symbol of symbols) {
    const scrip = resolveScripCodeCandidates(symbol)[0];
    if (!scrip) {
      result[symbol] = [];
      continue;
    }
    need.push({ symbol, scrip });
  }
  progress.set(key, { loaded: Object.keys(result).length, total: symbols.length });

  const CHUNK = 45;
  for (let i = 0; i < need.length; i += CHUNK) {
    const slice = need.slice(i, i + CHUNK);
    const scrips = [...new Set(slice.map((n) => n.scrip))];
    const byScrip = await fetchIndstocksCandlesMany(accessToken, scrips, timeframe, bars);
    for (const { symbol, scrip } of slice) {
      let candles = byScrip.get(scrip) || [];
      if (candles.length < 20) {
        const alts = resolveScripCodeCandidates(symbol)
          .filter((c) => c !== scrip)
          .slice(0, 2);
        for (const alt of alts) {
          try {
            const chunk = await fetchIndstocksCandles(accessToken, alt, timeframe, bars);
            if (chunk.length > candles.length) candles = chunk;
            if (candles.length >= 20) break;
          } catch {
            /* next alt */
          }
        }
      }
      result[symbol] = slimCandles(symbol, candles);
    }
    progress.set(key, { loaded: Object.keys(result).length, total: symbols.length });
  }

  for (const symbol of symbols) {
    if (!result[symbol]) result[symbol] = [];
  }
  return result;
}

async function buildSnapshot(accessToken, universe, timeframe, key) {
  const symbols = uniqueSorted(resolveServerUniverse(universe));
  const bars = SNAP_BARS[timeframe] || 120;
  progress.set(key, { loaded: 0, total: symbols.length });
  const candlesBySymbol = await fillCandles(accessToken, symbols, timeframe, bars, key);
  return {
    ready: true,
    universe,
    timeframe,
    bars,
    symbols,
    candlesBySymbol,
    builtAt: Date.now(),
    source: 'shared-indstocks',
    cacheKey: key,
  };
}

export function peekOpportunitySnapshot(accessToken, universe, timeframe) {
  const tf = normTf(timeframe);
  const u = String(universe || 'F&O');
  const key = snapshotCacheKey(u, tf);
  const hit = cache.get(key);
  if (hit) {
    return { ready: true, ...hit };
  }
  const fail = lastFail.get(key);
  if (fail && Date.now() - fail.at < 20_000 && !inflight.has(key)) {
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
  if (!inflight.has(key) && accessToken) {
    lastFail.delete(key);
    const job = buildSnapshot(accessToken, u, tf, key)
      .then((payload) => {
        cache.set(key, payload);
        for (const k of [...cache.keys()]) {
          if (k !== key && k.startsWith(`${u}|${tf}|`)) cache.delete(k);
        }
        return payload;
      })
      .finally(() => {
        inflight.delete(key);
        progress.delete(key);
      });
    inflight.set(key, job);
    job.catch((err) => {
      const message = err instanceof Error ? err.message : 'Shared board failed';
      console.warn('[opportunity-snapshot] build failed', message);
      lastFail.set(key, { at: Date.now(), error: message });
      cache.delete(key);
    });
  }
  const prog = progress.get(key) || { loaded: 0, total: 0 };
  return {
    ready: false,
    building: inflight.has(key),
    universe: u,
    timeframe: tf,
    symbolsLoaded: prog.loaded,
    symbolsTotal: prog.total,
    cacheKey: key,
    source: 'shared-indstocks',
  };
}
