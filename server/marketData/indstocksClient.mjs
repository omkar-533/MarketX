/**
 * INDstocks (INDMoney) — READ-ONLY market-data client.
 * Official docs: https://api-docs.indstocks.com/
 *
 * NEVER call /order, /order/modify, /order/cancel, or smart-order endpoints.
 * Tokens must never be logged or returned to clients.
 */
import { resolveServerUniverse } from './universeLists.mjs';

const BASE = 'https://api.indstocks.com';

const TF_MAP = {
  '1m': '1minute',
  '3m': '3minute',
  '5m': '5minute',
  '15m': '15minute',
  '30m': '30minute',
  '1h': '60minute',
  '4h': '240minute',
  '1D': '1day',
};

const MAX_SPAN_MS = {
  '1minute': 7 * 86_400_000,
  '3minute': 7 * 86_400_000,
  '5minute': 7 * 86_400_000,
  '15minute': 7 * 86_400_000,
  '30minute': 7 * 86_400_000,
  '60minute': 14 * 86_400_000,
  '240minute': 14 * 86_400_000,
  '1day': 365 * 86_400_000,
};

/** Max windowed requests when stitching history (INDstocks caps range per call). */
const MAX_HISTORY_CHUNKS = {
  '1minute': 14,
  '3minute': 14,
  '5minute': 14,
  '15minute': 14,
  '30minute': 14,
  '60minute': 16,
  '240minute': 16,
  // FAQ: 10+ years available; each 1day call ≤ 1 year.
  '1day': 12,
};

/** Fallback scrip codes from official examples / common equity underliers. */
export const FALLBACK_SCRIP_BY_SYMBOL = {
  RELIANCE: 'NSE_2885',
  TCS: 'NSE_11536',
  HDFCBANK: 'NSE_1333',
  INFY: 'NSE_1594',
  ICICIBANK: 'NSE_4963',
  SBIN: 'NSE_3045',
  AXISBANK: 'NSE_5900',
  BAJFINANCE: 'NSE_317',
  KOTAKBANK: 'NSE_1922',
  LT: 'NSE_11483',
  MARUTI: 'NSE_10999',
  WIPRO: 'NSE_3787',
  ONGC: 'NSE_2475',
  NTPC: 'NSE_11630',
  POWERGRID: 'NSE_14977',
  ADANIENT: 'NSE_25',
  HINDALCO: 'NSE_1363',
  JSWSTEEL: 'NSE_11723',
  ITC: 'NSE_1660',
  TATAMOTORS: 'NSE_3456',
};

const instrumentCache = {
  at: 0,
  bySymbol: /** @type {Map<string, string>} */ (new Map()),
};

function authHeaders(accessToken) {
  return {
    Authorization: String(accessToken || '').trim(),
    Accept: 'application/json',
  };
}

async function indFetch(path, accessToken, { searchParams, accept } = {}) {
  const url = new URL(path.startsWith('http') ? path : `${BASE}${path}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...authHeaders(accessToken),
      ...(accept ? { Accept: accept } : {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg =
      (json && (json.message || json.error || json.msg)) ||
      `INDstocks HTTP ${res.status}`;
    const err = new Error(String(msg));
    err.status = res.status;
    throw err;
  }
  return { json, text, status: res.status };
}

/** Validate token without exposing it. Uses profile only. */
export async function validateIndstocksToken(accessToken) {
  const { json } = await indFetch('/user/profile', accessToken);
  return {
    ok: true,
    // Avoid storing PII beyond what's needed — profile may contain name/email
    hasProfile: Boolean(json),
  };
}

export function wolfTfToIndInterval(tf) {
  return TF_MAP[tf] || null;
}

export async function fetchIndstocksQuote(accessToken, scripCode) {
  const { json } = await indFetch('/market/quotes/full', accessToken, {
    searchParams: { 'scrip-codes': scripCode },
  });
  const data = json?.data?.[scripCode] || json?.data?.[Object.keys(json?.data || {})[0]];
  if (!data) throw new Error('Quote unavailable for symbol');
  const lastPrice = Number(data.live_price ?? data.ltp ?? data.last_price ?? 0);
  const changePercent = Number(data.day_change_percentage ?? data.change_percent ?? 0);
  return {
    symbol: scripCode,
    exchange: String(scripCode).split('_')[0] || 'NSE',
    instrumentToken: scripCode,
    timestamp: Date.now(),
    lastPrice,
    price: lastPrice,
    changePercent,
    volume: data.volume != null ? Number(data.volume) : undefined,
    dayOpen: data.open != null ? Number(data.open) : undefined,
    dayHigh: data.high != null ? Number(data.high) : undefined,
    dayLow: data.low != null ? Number(data.low) : undefined,
    previousClose: data.prev_close != null ? Number(data.prev_close) : undefined,
    bid: data.bid != null ? Number(data.bid) : undefined,
    ask: data.ask != null ? Number(data.ask) : undefined,
  };
}

export async function fetchIndstocksCandles(accessToken, scripCode, wolfTf, bars = 80, opts = {}) {
  const interval = wolfTfToIndInterval(wolfTf);
  if (!interval) throw new Error(`Unsupported timeframe: ${wolfTf}`);
  const maxSpan = MAX_SPAN_MS[interval] || 7 * 86_400_000;
  const maxChunks = MAX_HISTORY_CHUNKS[interval] || 4;
  // Daily: aim for multi-year; intraday: fill requested depth within chunk budget.
  const hardCap = interval === '1day' ? 3200 : 2500;
  const wantBars = Math.max(80, Math.min(hardCap, Number(bars) || 120));
  const beforeMs = Number(opts.beforeMs);
  let end = Number.isFinite(beforeMs) && beforeMs > 0 ? beforeMs : Date.now();

  /** @type {Array<Record<string, unknown>>} */
  const byTs = new Map();

  for (let chunk = 0; chunk < maxChunks && byTs.size < wantBars; chunk++) {
    const useStart = end - maxSpan + 60_000;
    if (useStart >= end) break;

    const { json } = await indFetch(`/market/historical/${interval}`, accessToken, {
      searchParams: {
        'scrip-codes': scripCode,
        start_time: String(Math.floor(useStart)),
        // Docs: end_time is exclusive.
        end_time: String(Math.floor(end)),
      },
    });
    const block = json?.data?.[scripCode] || json?.data?.[Object.keys(json?.data || {})[0]];
    const raw = Array.isArray(block?.candles) ? block.candles : [];
    if (!raw.length) break;

    let oldestMs = end;
    let added = 0;
    for (const c of raw) {
      const tsSec = Number(c.ts);
      const timestamp = tsSec > 1e12 ? tsSec : tsSec * 1000;
      if (!Number.isFinite(timestamp)) continue;
      const open = Number(c.o);
      const high = Number(c.h);
      const low = Number(c.l);
      const close = Number(c.c);
      if (!(open > 0 && high > 0 && close > 0)) continue;
      const row = {
        symbol: scripCode,
        exchange: String(scripCode).split('_')[0] || 'NSE',
        instrumentToken: scripCode,
        timeframe: wolfTf,
        timestamp,
        open,
        high,
        low,
        close,
        volume: Number(c.v || 0),
      };
      if (!byTs.has(timestamp)) {
        byTs.set(timestamp, row);
        added += 1;
      } else {
        byTs.set(timestamp, row);
      }
      if (timestamp < oldestMs) oldestMs = timestamp;
    }

    if (!added) break;
    // Step further back; keep a 1-bar overlap so edges don't leave gaps.
    end = Math.max(0, oldestMs - 1000);
    if (oldestMs <= useStart + 60_000) {
      // Provider returned the earliest it has for this window — continue to next year/span.
    }
  }

  const deduped = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
  if (deduped.length <= wantBars) return deduped;
  return deduped.slice(-wantBars);
}

function parseCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    // Naive CSV split — instrument master typically has no embedded commas in critical cols
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = String(cols[i] || '')
        .trim()
        .replace(/^"|"$/g, '');
    });
    return row;
  });
}

/** Refresh equity instrument map (TRADING_SYMBOL / SYMBOL_NAME → EXCH_SECURITY_ID). */
export async function refreshIndstocksInstrumentMap(accessToken) {
  const { text } = await indFetch('/market/instruments', accessToken, {
    searchParams: { source: 'equity' },
    accept: 'text/csv,*/*',
  });
  const rows = parseCsv(text);
  const map = new Map();
  for (const row of rows) {
    const exch = (row.EXCH || 'NSE').toUpperCase();
    const sid = row.SECURITY_ID;
    if (!sid) continue;
    const scrip = `${exch}_${sid}`;
    const names = [row.SYMBOL_NAME, row.TRADING_SYMBOL, row.CUSTOM_SYMBOL]
      .map((s) => String(s || '').toUpperCase().replace(/-EQ$/, '').trim())
      .filter(Boolean);
    for (const n of names) {
      if (!map.has(n)) map.set(n, scrip);
    }
  }
  // seed fallbacks
  for (const [sym, scrip] of Object.entries(FALLBACK_SCRIP_BY_SYMBOL)) {
    if (!map.has(sym)) map.set(sym, scrip);
  }
  instrumentCache.at = Date.now();
  instrumentCache.bySymbol = map;
  return map.size;
}

export function resolveScripCode(symbol, exchange = 'NSE') {
  const key = String(symbol || '')
    .toUpperCase()
    .replace(/^NSE:/, '')
    .replace(/-EQ$/, '')
    .trim();
  if (instrumentCache.bySymbol.has(key)) return instrumentCache.bySymbol.get(key);
  if (FALLBACK_SCRIP_BY_SYMBOL[key]) return FALLBACK_SCRIP_BY_SYMBOL[key];
  if (/^[A-Z]+_\d+$/.test(key)) return key;
  // last resort: not found
  return null;
}

export function listUniverseSymbols(universe) {
  const wanted = resolveServerUniverse(universe);
  // Prefer full catalog size for honesty. LIVE candle fetch resolves scrips via
  // instrument map + FALLBACK; unresolved symbols are marked unavailable in scanner.
  return wanted;
}

/** Symbols we can actually resolve to a scrip right now (after instrument map refresh). */
export function listScannableUniverseSymbols(universe) {
  const wanted = listUniverseSymbols(universe);
  const ok = wanted.filter((s) => Boolean(resolveScripCode(s)));
  // If instrument map empty / refresh failed, fall back to FALLBACK keys ∩ universe
  if (!ok.length) {
    return wanted.filter((s) => Boolean(FALLBACK_SCRIP_BY_SYMBOL[s]));
  }
  return ok;
}

export const INDSTOCKS_CAPABILITIES = {
  historicalCandles: true,
  liveQuotes: true,
  bidAsk: true,
  marketDepth: false,
  instrumentList: true,
  marketStatus: false,
  orderExecution: false,
};

export const INDSTOCKS_PERMISSION_NOTE =
  'INDstocks tokens can authorize trading on their platform. WOLF only calls market-data endpoints (/market/*, /user/profile) and never places, modifies, or cancels orders.';
