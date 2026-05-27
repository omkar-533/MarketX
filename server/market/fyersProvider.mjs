import { fromFyersSymbol, toFyersSymbol } from './fyersSymbolMap.mjs';
import { getFyersClient, isFyersConfigured } from './fyersSession.mjs';
import { getTickQuotes, isFyersSocketActive, getFyersWsStatus } from './fyersSocket.mjs';
import { overlayWsPrice, setQuoteMeta } from './quoteMeta.mjs';

const cache = new Map();
const CACHE_MS = 8_000;
const CHUNK = 45;

const INTERVAL_MAP = {
  '1m': { resolution: '1', days: 1 },
  '5m': { resolution: '5', days: 5 },
  '15m': { resolution: '15', days: 15 },
  '1h': { resolution: '60', days: 60 },
  '1d': { resolution: 'D', days: 365 },
  '1w': { resolution: 'W', days: 365 },
};

let ohlcRateLimitedUntil = 0;

function round(n) {
  return Math.round(n * 100) / 100;
}

function parseFyersQuote(item, appSymbol) {
  const v = item?.v || item?.value || item;
  const price = Number(v?.lp ?? v?.ltp ?? 0);
  const prevClose = Number(v?.prev_close_price ?? v?.prev_close ?? 0);
  const change = Number(v?.ch ?? (prevClose ? price - prevClose : 0));
  const changePercent = Number(
    v?.chp ?? (prevClose ? (change / prevClose) * 100 : 0),
  );
  const quote = {
    symbol: appSymbol,
    price: round(price),
    change: round(change),
    changePercent: round(changePercent),
    open: round(Number(v?.open_price ?? v?.open ?? price)),
    high: round(Number(v?.high_price ?? v?.high ?? price)),
    low: round(Number(v?.low_price ?? v?.low ?? price)),
    prevClose: round(prevClose || price),
    volume: Math.floor(Number(v?.volume ?? v?.vol ?? 0)),
    source: 'fyers',
    lastUpdated: new Date().toISOString(),
  };
  setQuoteMeta(quote);
  return quote;
}

async function fyersGetQuotes(fyersSymbols) {
  const fyers = getFyersClient();
  const res = await fyers.getQuotes(fyersSymbols);
  if (res?.s !== 'ok' && res?.code !== 200) {
    throw new Error(res?.message || 'Fyers quotes failed');
  }
  return Array.isArray(res?.d) ? res.d : [];
}

export async function fetchQuotes(symbols) {
  if (!isFyersConfigured()) {
    throw new Error('Fyers API not connected');
  }

  const unique = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  const cacheKey = unique.sort().join(',');
  const hit = cache.get(`q:${cacheKey}`);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const errors = [];
  const wsTicks = getTickQuotes(unique);
  const quoteMap = new Map();

  const now = Date.now();
  const needRest = [];
  if (isFyersSocketActive()) {
    for (const sym of unique) {
      const hit = wsTicks.get(sym);
      if (hit?.data?.price && now - (hit.at ?? 0) < 30_000) {
        quoteMap.set(sym, hit.data);
      } else {
        needRest.push(sym);
      }
    }
    if (needRest.length === 0) {
      const quotes = [...quoteMap.values()].map((q) => {
        const { at, ...rest } = q;
        return rest;
      });
      const data = {
        quotes,
        errors: [],
        source: 'fyers-ws',
        fetchedAt: new Date().toISOString(),
      };
      cache.set(`q:${cacheKey}`, { at: Date.now(), data });
      return data;
    }
  } else {
    needRest.push(...unique);
  }

  const symToFyers = new Map();
  for (const sym of needRest) {
    const f = toFyersSymbol(sym);
    if (f) symToFyers.set(sym, f);
    else errors.push({ symbol: sym, error: 'Unknown Fyers symbol' });
  }

  const fyersList = [...new Set(symToFyers.values())];
  for (let i = 0; i < fyersList.length; i += CHUNK) {
    const chunk = fyersList.slice(i, i + CHUNK);
    try {
      const rows = await fyersGetQuotes(chunk);
      for (const row of rows) {
        const app = fromFyersSymbol(row?.n || row?.symbol, unique);
        if (!app || row?.s === 'error') continue;
        quoteMap.set(app, parseFyersQuote(row, app));
      }
    } catch (err) {
      for (const f of chunk) {
        const app = fromFyersSymbol(f, unique);
        if (app) errors.push({ symbol: app, error: err instanceof Error ? err.message : 'fetch failed' });
      }
    }
  }

  for (const sym of unique) {
    let q = quoteMap.get(sym);
    const tick = wsTicks.get(sym);
    if (q && tick?.data?.price) {
      q = overlayWsPrice(sym, tick.data.price, tick.data.lastUpdated) ?? q;
    } else if (!q && tick?.data) {
      q = tick.data;
    }
    if (q) quoteMap.set(sym, q);
  }

  const quotes = [...quoteMap.values()].map((q) => {
    const { at, ...rest } = q;
    return rest;
  });

  const data = {
    quotes,
    errors,
    source: 'fyers',
    fetchedAt: new Date().toISOString(),
  };
  cache.set(`q:${cacheKey}`, { at: Date.now(), data });
  return data;
}

export async function fetchOhlc(symbol, timeframe = '15m', rangeOverride) {
  if (!isFyersConfigured()) throw new Error('Fyers API not connected');
  if (Date.now() < ohlcRateLimitedUntil) {
    throw new Error('Fyers rate limited — retry shortly');
  }

  const sym = String(symbol).trim().toUpperCase();
  const fyersSym = toFyersSymbol(sym);
  if (!fyersSym) throw new Error(`Unknown symbol ${sym}`);

  const cfg = INTERVAL_MAP[timeframe] || INTERVAL_MAP['15m'];
  const cacheKey = `ohlc:${sym}:${timeframe}:${rangeOverride || ''}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS * 4) return hit.data;

  const to = Math.floor(Date.now() / 1000);
  let days = rangeOverride === '1y' ? 365 : rangeOverride === '6mo' ? 180 : rangeOverride === '3mo' ? 90 : cfg.days;
  if (cfg.resolution === 'D' || cfg.resolution === 'W') days = Math.min(days, 365);
  const from = to - days * 86400;

  const fyers = getFyersClient();
  const res = await fyers.getHistory({
    symbol: fyersSym,
    resolution: cfg.resolution,
    date_format: '0',
    range_from: String(from),
    range_to: String(to),
    cont_flag: '1',
  });

  if (res?.s !== 'ok') {
    const msg = res?.message || 'Fyers history failed';
    if (String(msg).includes('limit') || res?.code === 429) {
      ohlcRateLimitedUntil = Date.now() + 60_000;
    }
    throw new Error(msg);
  }

  const bars = (res.candles || []).map((c) => ({
    time: Number(c[0]),
    open: round(c[1]),
    high: round(c[2]),
    low: round(c[3]),
    close: round(c[4]),
    volume: Math.floor(Number(c[5] ?? 0)),
  }));

  const data = {
    symbol: sym,
    timeframe,
    bars,
    source: 'fyers',
    fetchedAt: new Date().toISOString(),
  };
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export function getMarketHealth() {
  const ws = getFyersWsStatus();
  return {
    provider: 'fyers',
    configured: isFyersConfigured(),
    websocket: isFyersSocketActive(),
    wsStatus: ws.status,
    wsLastError: ws.lastError,
    cacheEntries: cache.size,
    cacheTtlSec: CACHE_MS / 1000,
  };
}
