import { fromTvSymbol, toTvSymbol } from './symbolMap.mjs';
import {
  getTickQuotes,
  getTvWsStatus,
  isTvSocketActive,
  subscribeTvSymbols,
} from './tvWsManager.mjs';
import { fetchTvOhlcBars } from './ohlcFetch.mjs';
import { setQuoteMeta } from '../quoteMeta.mjs';

const cache = new Map();
const CACHE_MS = 3_000;
const OHLC_CACHE_MS = 30_000;

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

function lookupTick(sym) {
  const tv = toTvSymbol(sym);
  const keys = new Set([sym]);
  if (tv) {
    keys.add(tv);
    const asRequested = fromTvSymbol(tv, [sym]);
    const asDefault = fromTvSymbol(tv, []);
    if (asRequested) keys.add(asRequested);
    if (asDefault) keys.add(asDefault);
  }
  for (const key of keys) {
    const hit = getTickQuotes([key]).get(key);
    if (hit?.data?.price) return hit;
  }
  return null;
}

async function quoteFromOhlcFallback(sym) {
  try {
    const { bars } = await fetchTvOhlcBars(sym, '15m');
    const last = bars?.[bars.length - 1];
    if (!last?.close) return null;
    const prev = bars.length > 1 ? bars[bars.length - 2].close : last.open;
    const price = round(last.close);
    const prevClose = round(prev || last.open || price);
    const change = round(price - prevClose);
    const changePercent = prevClose ? round((change / prevClose) * 100) : 0;
    return {
      symbol: sym,
      price,
      change,
      changePercent,
      open: round(last.open || price),
      high: round(last.high || price),
      low: round(last.low || price),
      prevClose,
      volume: Math.floor(Number(last.volume) || 0),
      bid: 0,
      ask: 0,
      bidQty: 0,
      askQty: 0,
      oi: 0,
      oiChange: 0,
      source: 'tradingview-ohlc',
      lastUpdated: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * @param {string[]} symbols
 * @param {{ fast?: boolean }} [opts] fast=true → short wait, limited OHLC (for Wolf AI chat latency)
 */
export async function fetchQuotes(symbols, opts = {}) {
  const fast = Boolean(opts.fast);
  const unique = [
    ...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean)),
  ];
  subscribeTvSymbols(unique);

  const cacheKey = `q:${fast ? 'f:' : ''}${unique.slice().sort().join(',')}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  // Wait for first ticks — keep Wolf AI chat under browser timeout.
  const waitMs = fast
    ? isTvSocketActive()
      ? 1200
      : 2200
    : isTvSocketActive()
      ? 4500
      : 7000;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const ready = unique.every((sym) => Boolean(lookupTick(sym)?.data?.price));
    if (ready) break;
    await new Promise((r) => setTimeout(r, fast ? 200 : 350));
  }

  const errors = [];
  const quoteMap = new Map();
  const missing = [];

  for (const sym of unique) {
    if (!toTvSymbol(sym)) {
      errors.push({ symbol: sym, error: 'Unknown TradingView symbol' });
      continue;
    }
    const tick = lookupTick(sym);
    if (tick?.data?.price) {
      const { at: _at, ...rest } = tick.data;
      const quote = { ...rest, source: 'tradingview', symbol: sym };
      setQuoteMeta(quote);
      quoteMap.set(sym, quote);
    } else {
      missing.push(sym);
    }
  }

  // Market closed / quiet session: last WS print may be gone after restart — use OHLC.
  // Fast path: at most 2 OHLC fallbacks so /api/chat stays under ~client timeout.
  if (missing.length) {
    const ohlcLimit = fast ? 2 : 12;
    const settled = await Promise.all(
      missing.slice(0, ohlcLimit).map(async (sym) => [sym, await quoteFromOhlcFallback(sym)]),
    );
    for (const [sym, quote] of settled) {
      if (quote?.price) {
        setQuoteMeta(quote);
        quoteMap.set(sym, quote);
      } else {
        errors.push({ symbol: sym, error: 'Waiting for TradingView tick' });
      }
    }
    for (const sym of missing.slice(ohlcLimit)) {
      errors.push({ symbol: sym, error: 'Waiting for TradingView tick' });
    }
  }

  const quotes = [...quoteMap.values()];
  const data = {
    quotes,
    errors: quotes.length ? errors.filter((e) => !quoteMap.has(e.symbol)) : errors,
    source: 'tradingview',
    fetchedAt: new Date().toISOString(),
  };

  if (quotes.length) cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export async function fetchOhlc(symbol, timeframe = '15m', rangeOverride) {
  const sym = String(symbol).trim().toUpperCase();
  if (!toTvSymbol(sym)) throw new Error(`Unknown symbol ${sym}`);

  const cacheKey = `ohlc:${sym}:${timeframe}:${rangeOverride || ''}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < OHLC_CACHE_MS) return hit.data;

  const { bars } = await fetchTvOhlcBars(sym, timeframe, rangeOverride);
  const data = {
    symbol: sym,
    timeframe,
    bars,
    source: 'tradingview',
    fetchedAt: new Date().toISOString(),
  };
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export function getMarketHealth() {
  const ws = getTvWsStatus();
  return {
    provider: 'tradingview',
    configured: true,
    websocket: isTvSocketActive(),
    wsStatus: ws.status,
    wsLastError: ws.lastError,
    cacheEntries: cache.size,
    cacheTtlSec: CACHE_MS / 1000,
  };
}
