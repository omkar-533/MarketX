import { fetchFyersOptionChain, isFyersOptionChainAvailable } from './fyersOptionChain.mjs';
import { isNseFnoMarketOpen } from './marketHours.mjs';

const cache = new Map();
const CACHE_MS = 60_000;
const CONCURRENCY = 2;

function round(n, d = 2) {
  return Math.round(n * 10 ** d) / 10 ** d;
}

/** Aggregate OI from Fyers option chain (current expiry) */
export function fnoOiFromChain(chain) {
  const ceOi = chain.totalCeOi ?? 0;
  const peOi = chain.totalPeOi ?? 0;
  const totalOi = ceOi + peOi;
  let oiChange = 0;
  for (const row of chain.rows ?? []) {
    oiChange += (row.ceOiChg ?? 0) + (row.peOiChg ?? 0);
  }
  const prevOi = Math.max(1, totalOi - oiChange);
  const oiChangePct = round((oiChange / prevOi) * 100);
  return {
    symbol: chain.symbol,
    totalOi: Math.floor(totalOi),
    oiChange: Math.floor(oiChange),
    oiChangePct,
    callOi: Math.floor(ceOi),
    putOi: Math.floor(peOi),
    pcr: round(peOi / Math.max(ceOi, 1)),
    source: 'fyers',
    fetchedAt: chain.fetchedAt ?? new Date().toISOString(),
  };
}

export async function fetchFyersFnoOi(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) throw new Error('symbol required');
  if (!isFyersOptionChainAvailable()) throw new Error('Fyers not connected');

  const key = `fno-oi:${sym}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const chain = await fetchFyersOptionChain(sym, undefined, 20);
  let snap = fnoOiFromChain(chain);
  if (!isNseFnoMarketOpen()) {
    snap = { ...snap, oiChange: 0, oiChangePct: 0 };
  }
  cache.set(key, { at: Date.now(), data: snap });
  return snap;
}

/** Batch Fyers OI for screener — throttled concurrency */
export async function fetchFyersFnoOiBatch(symbols, opts = {}) {
  const max = Math.min(40, Number(opts.max) || 35);
  const unique = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  const stale = unique.filter((sym) => {
    const hit = cache.get(`fno-oi:${sym}`);
    return !hit || Date.now() - hit.at >= CACHE_MS;
  });
  const queue = (stale.length ? stale : unique).slice(0, max);

  const snapshots = [];
  const errors = [];

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const sym = queue.shift();
      if (!sym) break;
      try {
        snapshots.push(await fetchFyersFnoOi(sym));
      } catch (err) {
        errors.push({
          symbol: sym,
          error: err instanceof Error ? err.message : 'FNO OI failed',
        });
      }
    }
  });
  await Promise.all(workers);

  for (const sym of unique) {
    const hit = cache.get(`fno-oi:${sym}`);
    if (hit?.data && !snapshots.find((s) => s.symbol === sym)) {
      snapshots.push(hit.data);
    }
  }

  return {
    snapshots,
    errors,
    source: 'fyers',
    fetchedAt: new Date().toISOString(),
  };
}
