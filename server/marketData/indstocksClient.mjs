/**
 * INDstocks (INDMoney) — READ-ONLY market-data client.
 * Official docs: https://api-docs.indstocks.com/
 *
 * NEVER call /order, /order/modify, /order/cancel, or smart-order endpoints.
 * Tokens must never be logged or returned to clients.
 */
import { resolveServerUniverse } from './universeLists.mjs';
import { rebuildInstrumentUniverses, resolveUniverseSymbols } from './instrumentUniverse.mjs';

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

/** Fallback scrip codes from official examples / common underliers + NSE index tokens. */
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
  // Indices — REST uses NIDX_/BIDX_. Prefer Instruments API (source=index).
  // INDstocks docs example uses NIDX_40000001 for NIFTY (NOT classic NSE 26000).
  NIFTY: 'NIDX_40000001',
  NIFTY50: 'NIDX_40000001',
  BANKNIFTY: 'NIDX_26009',
  FINNIFTY: 'NIDX_26037',
  MIDCPNIFTY: 'NIDX_26074',
  INDIAVIX: 'NIDX_26017',
  SENSEX: 'BIDX_1',
};

/** Extra historical candidates when primary scrip returns empty candles. */
const INDEX_SCRIP_ALTERNATES = {
  NIFTY: ['NIDX_40000001', 'NIDX_26000', 'NSE_26000'],
  NIFTY50: ['NIDX_40000001', 'NIDX_26000', 'NSE_26000'],
  BANKNIFTY: ['NIDX_26009', 'NSE_26009'],
  FINNIFTY: ['NIDX_26037', 'NSE_26037'],
  MIDCPNIFTY: ['NIDX_26074', 'NSE_26074'],
  INDIAVIX: ['NIDX_26017', 'NSE_26017'],
  SENSEX: ['BIDX_1', 'BSE_1'],
};

const instrumentCache = {
  at: 0,
  bySymbol: /** @type {Map<string, string>} */ (new Map()),
};

/** SYMBOL → option expiry timestamps (ms) from FNO instrument master. */
const optionExpiryMsBySymbol = new Map();

const OPTION_CHAIN_INDEX = new Set([
  'NIFTY',
  'NIFTY50',
  'BANKNIFTY',
  'FINNIFTY',
  'MIDCPNIFTY',
  'SENSEX',
  'BANKEX',
  'INDIAVIX',
]);

const INSTRUMENT_MAP_TTL_MS = 6 * 60 * 60 * 1000;
let mapRefreshInflight = null;

/** Cold instances / skipped connect refresh: load instrument master before resolving scrips. */
export async function ensureInstrumentMap(accessToken, { force = false } = {}) {
  const fresh =
    !force &&
    instrumentCache.bySymbol.size > 100 &&
    Date.now() - instrumentCache.at < INSTRUMENT_MAP_TTL_MS;
  if (fresh) return instrumentCache.bySymbol.size;
  if (mapRefreshInflight) return mapRefreshInflight;
  mapRefreshInflight = refreshIndstocksInstrumentMap(accessToken)
    .catch((e) => {
      console.warn('[indstocks] instrument map refresh failed', e?.message || e);
      return instrumentCache.bySymbol.size;
    })
    .finally(() => {
      mapRefreshInflight = null;
    });
  return mapRefreshInflight;
}

function authHeaders(accessToken) {
  return {
    Authorization: String(accessToken || '').trim(),
    Accept: 'application/json',
  };
}

const IND_MAX_INFLIGHT = 12;
let indInflight = 0;
const indWaiters = [];

function acquireIndSlot() {
  if (indInflight < IND_MAX_INFLIGHT) {
    indInflight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    indWaiters.push(resolve);
  });
}

function releaseIndSlot() {
  const next = indWaiters.shift();
  if (next) next();
  else indInflight = Math.max(0, indInflight - 1);
}

async function indFetch(path, accessToken, { searchParams, accept } = {}) {
  await acquireIndSlot();
  try {
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
  } finally {
    releaseIndSlot();
  }
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

function istCalendarDay(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function istWeekday(ms) {
  const w = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(new Date(ms));
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[w] ?? new Date(ms).getUTCDay();
}

function istSessionCloseMs(ymd) {
  return Date.parse(`${ymd}T15:30:00+05:30`);
}

function shiftIstYmd(ymd, days) {
  const t = Date.parse(`${ymd}T12:00:00+05:30`) + days * 86_400_000;
  return istCalendarDay(t);
}

/**
 * Last completed NSE cash session close (15:30 IST).
 * After hours / weekend INDstocks historical often returns empty when end_time is "now".
 * During an open session this returns `now` so live candle fetches can include the forming bar.
 */
export function lastCompletedNseSessionEndMs(now = Date.now()) {
  let ymd = istCalendarDay(now);
  const wd = istWeekday(now);
  const closeToday = istSessionCloseMs(ymd);
  const openToday = Date.parse(`${ymd}T09:15:00+05:30`);

  if (wd === 0) ymd = shiftIstYmd(ymd, -2);
  else if (wd === 6) ymd = shiftIstYmd(ymd, -1);
  else if (now >= closeToday) return closeToday;
  else if (now >= openToday) return now;
  else ymd = shiftIstYmd(ymd, wd === 1 ? -3 : -1);

  const close = istSessionCloseMs(ymd);
  return Number.isFinite(close) ? close : now;
}

/**
 * End of the last FULLY finished cash session (always a 15:30 IST close).
 * Never returns `now` while today's first bars are still forming.
 */
export function nsePriorCompletedSessionEndMs(now = Date.now()) {
  let ymd = istCalendarDay(now);
  const wd = istWeekday(now);
  const closeToday = istSessionCloseMs(ymd);

  if (wd === 0) ymd = shiftIstYmd(ymd, -2);
  else if (wd === 6) ymd = shiftIstYmd(ymd, -1);
  else if (now >= closeToday) return closeToday;
  else ymd = shiftIstYmd(ymd, wd === 1 ? -3 : -1);

  const close = istSessionCloseMs(ymd);
  return Number.isFinite(close) ? close : now;
}

function historicalEndMs(interval, requestedEnd) {
  const now = Number.isFinite(requestedEnd) && requestedEnd > 0 ? requestedEnd : Date.now();
  if (interval === '1day' || interval === '1week' || interval === '1month') return now;
  const sessionEnd = lastCompletedNseSessionEndMs(now);
  // Exclusive end must sit after the 15:30 bar so that candle is included.
  return Math.min(now, sessionEnd + 60_000);
}

function parseIndstocksQuote(scripCode, data) {
  if (!data || typeof data !== 'object') return null;
  const lastPrice = Number(data.live_price ?? data.ltp ?? data.last_price ?? data.close ?? 0);
  if (!(lastPrice > 0)) return null;
  const prevClose = Number(data.prev_close ?? data.previous_close ?? data.close_price ?? 0);
  const changePercentRaw = Number(data.day_change_percentage ?? data.change_percent ?? data.pChange ?? 0);
  const changeAbs = Number(data.day_change ?? data.change ?? 0);
  const changePercent =
    Number.isFinite(changePercentRaw) && changePercentRaw !== 0
      ? changePercentRaw
      : prevClose > 0
        ? ((lastPrice - prevClose) / prevClose) * 100
        : 0;
  return {
    symbol: scripCode,
    exchange: String(scripCode).split('_')[0] || 'NSE',
    instrumentToken: scripCode,
    timestamp: Date.now(),
    lastPrice,
    price: lastPrice,
    changePercent,
    change: Number.isFinite(changeAbs) && changeAbs !== 0 ? changeAbs : prevClose > 0 ? lastPrice - prevClose : 0,
    volume: data.volume != null ? Number(data.volume) : undefined,
    dayOpen: data.open != null ? Number(data.open) : undefined,
    dayHigh: data.high != null ? Number(data.high) : undefined,
    dayLow: data.low != null ? Number(data.low) : undefined,
    previousClose: prevClose > 0 ? prevClose : undefined,
    bid: data.bid != null ? Number(data.bid) : undefined,
    ask: data.ask != null ? Number(data.ask) : undefined,
  };
}

export async function fetchIndstocksQuote(accessToken, scripCode) {
  const { json } = await indFetch('/market/quotes/full', accessToken, {
    searchParams: { 'scrip-codes': scripCode },
  });
  const data = json?.data?.[scripCode] || json?.data?.[Object.keys(json?.data || {})[0]];
  const row = parseIndstocksQuote(scripCode, data);
  if (!row) throw new Error('Quote unavailable for symbol');
  return row;
}

/** Batch LTP from INDstocks. Missing scrips are omitted — never invented. */
export async function fetchIndstocksQuotesMany(accessToken, scripCodes) {
  const unique = [...new Set((scripCodes || []).map((s) => String(s || '').trim()).filter(Boolean))];
  const out = new Map();
  const CHUNK = 20;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    try {
      const { json } = await indFetch('/market/quotes/full', accessToken, {
        searchParams: { 'scrip-codes': chunk.join(',') },
      });
      const data = json?.data && typeof json.data === 'object' ? json.data : {};
      for (const code of chunk) {
        const row = parseIndstocksQuote(code, data[code]);
        if (row) out.set(code, row);
      }
    } catch {
      /* fall through to per-scrip */
    }
    const missing = chunk.filter((c) => !out.has(c));
    if (!missing.length) continue;
    await Promise.all(
      missing.map(async (code) => {
        try {
          const q = await fetchIndstocksQuote(accessToken, code);
          if (q?.price > 0) out.set(code, q);
        } catch {
          /* skip — never invent LTP */
        }
      }),
    );
  }
  return out;
}

export async function fetchIndstocksCandles(accessToken, scripCode, wolfTf, bars = 80, opts = {}) {
  const interval = wolfTfToIndInterval(wolfTf);
  if (!interval) throw new Error(`Unsupported timeframe: ${wolfTf}`);
  const maxSpan = MAX_SPAN_MS[interval] || 7 * 86_400_000;
  // Daily: aim for multi-year; intraday: fill requested depth within chunk budget.
  const hardCap = interval === '1day' ? 3200 : 2500;
  const wantBars = Math.max(20, Math.min(hardCap, Number(bars) || 120));
  // Session-clamped window usually fills a scan/chart in 1 call. Extra chunks only if empty.
  const maxChunks = wantBars <= 180 ? 2 : Math.min(6, MAX_HISTORY_CHUNKS[interval] || 6);
  const beforeMs = Number(opts.beforeMs);
  let end = historicalEndMs(interval, Number.isFinite(beforeMs) && beforeMs > 0 ? beforeMs : Date.now());

  /** @type {Map<number, Record<string, unknown>>} */
  const byTs = new Map();
  let emptyStreak = 0;

  for (let chunk = 0; chunk < maxChunks && byTs.size < wantBars; chunk++) {
    const useStart = end - maxSpan + 60_000;
    if (useStart >= end) break;

    let json = null;
    try {
      const fetched = await indFetch(`/market/historical/${interval}`, accessToken, {
        searchParams: {
          'scrip-codes': scripCode,
          start_time: String(Math.floor(useStart)),
          // Docs: end_time is exclusive.
          end_time: String(Math.floor(end)),
        },
      });
      json = fetched.json;
    } catch (e) {
      // DataException / 429 after close — step the window back instead of aborting the chart.
      emptyStreak += 1;
      if (byTs.size === 0 && emptyStreak >= 6) break;
      if (e?.status === 429) {
        await new Promise((r) => setTimeout(r, 400));
      }
      end = Math.max(0, useStart - 1000);
      continue;
    }
    const block = json?.data?.[scripCode] || json?.data?.[Object.keys(json?.data || {})[0]];
    const raw = Array.isArray(block?.candles) ? block.candles : [];
    // Empty recent window (weekend / holiday) must NOT abort history — step further back.
    if (!raw.length) {
      emptyStreak += 1;
      if (byTs.size === 0 && emptyStreak >= 6) break;
      end = Math.max(0, useStart - 1000);
      continue;
    }

    let oldestMs = end;
    let added = 0;
    for (const c of raw) {
      const timestamp = indCandleTimeMs(c);
      if (!(timestamp > 0)) continue;
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

    if (!added) {
      emptyStreak += 1;
      if (byTs.size === 0 && emptyStreak >= 6) break;
      end = Math.max(0, useStart - 1000);
      continue;
    }
    emptyStreak = 0;
    // Step further back; keep a 1-bar overlap so edges don't leave gaps.
    end = Math.max(0, oldestMs - 1000);
  }

  const deduped = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
  if (deduped.length <= wantBars) return deduped;
  return deduped.slice(-wantBars);
}

function indCandleTimeMs(c) {
  if (c == null) return 0;
  if (Array.isArray(c)) return indCandleTimeMs(c[0]);
  if (typeof c === 'number' || typeof c === 'string') {
    const n = Number(c);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n > 1e12 ? n : n * 1000;
  }
  const raw = c.ts ?? c.time ?? c.timestamp ?? c.t;
  return indCandleTimeMs(raw);
}

function rowsFromIndCandles(raw, scripCode, wolfTf, wantBars) {
  const byTs = new Map();
  for (const c of raw || []) {
    const timestamp = indCandleTimeMs(c);
    if (!(timestamp > 0)) continue;
    const open = Number(c.o);
    const high = Number(c.h);
    const low = Number(c.l);
    const close = Number(c.c);
    if (!(open > 0 && high > 0 && close > 0)) continue;
    byTs.set(timestamp, {
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
    });
  }
  const deduped = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
  return deduped.length > wantBars ? deduped.slice(-wantBars) : deduped;
}

/** One INDstocks historical call per scrip group — Opportunity / Radar scan path. */
export async function fetchIndstocksCandlesMany(accessToken, scripCodes, wolfTf, bars = 80) {
  const interval = wolfTfToIndInterval(wolfTf);
  if (!interval) throw new Error(`Unsupported timeframe: ${wolfTf}`);
  const unique = [...new Set((scripCodes || []).map((c) => String(c || '').trim()).filter(Boolean))];
  /** @type {Map<string, object[]>} */
  const out = new Map();
  if (!unique.length) return out;

  const wantBars = Math.max(20, Math.min(500, Number(bars) || 80));
  const maxSpan = MAX_SPAN_MS[interval] || 7 * 86_400_000;
  const end = historicalEndMs(interval, Date.now());
  const useStart = end - maxSpan + 60_000;
  const GROUP = 15;
  const groups = [];
  for (let i = 0; i < unique.length; i += GROUP) groups.push(unique.slice(i, i + GROUP));

  const pullGroup = async (group) => {
    try {
      const { json } = await indFetch(`/market/historical/${interval}`, accessToken, {
        searchParams: {
          'scrip-codes': group.join(','),
          start_time: String(Math.floor(useStart)),
          end_time: String(Math.floor(end)),
        },
      });
      const data = json?.data && typeof json.data === 'object' ? json.data : {};
      await Promise.all(
        group.map(async (code) => {
          const mine = data[code] || data[Object.keys(data).find((k) => k === code) || ''];
          const raw = Array.isArray(mine?.candles) ? mine.candles : Array.isArray(mine) ? mine : [];
          let rows = rowsFromIndCandles(raw, code, wolfTf, wantBars);
          if (!rows.length) {
            try {
              rows = await fetchIndstocksCandles(accessToken, code, wolfTf, bars);
            } catch {
              /* keep whatever batch returned */
            }
          }
          out.set(code, rows);
        }),
      );
    } catch {
      await Promise.all(
        group.map(async (code) => {
          try {
            out.set(code, await fetchIndstocksCandles(accessToken, code, wolfTf, bars));
          } catch {
            out.set(code, []);
          }
        }),
      );
    }
  };

  const WAVE = 3;
  for (let i = 0; i < groups.length; i += WAVE) {
    await Promise.all(groups.slice(i, i + WAVE).map(pullGroup));
  }
  return out;
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

function parseExpiryMs(raw) {
  const s = String(raw || '').trim();
  if (!s) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

const MONTH_IDX = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

/** FNO expiry → ms. Accepts ISO, 20-AUG-2026, 20/08/2026, epoch. */
export function parseOptionExpiryMs(raw) {
  const s = String(raw || '').trim();
  if (!s) return 0;
  const iso = Date.parse(s);
  if (Number.isFinite(iso)) return iso;
  const dmy = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const year = Number(dmy[3]);
    const monRaw = dmy[2].toUpperCase();
    const month = MONTH_IDX[monRaw] ?? Number(monRaw) - 1;
    if (day >= 1 && year >= 2020 && month >= 0 && month <= 11) {
      const t = Date.parse(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+05:30`);
      if (Number.isFinite(t)) return t;
    }
  }
  if (/^\d{8}$/.test(s)) {
    const t = Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00+05:30`);
    return Number.isFinite(t) ? t : 0;
  }
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    return n > 1e12 ? n : n * 1000;
  }
  return 0;
}

/** Last Thursday of this IST month, or next month if that Thursday is already behind. */
export function nseMonthlyExpiryYmd(now = Date.now()) {
  const today = istCalendarDay(now);
  const [y0, m0] = today.split('-').map((n) => Number(n));
  for (const shift of [0, 1]) {
    const m = m0 + shift;
    const year = m > 12 ? y0 + 1 : y0;
    const month = m > 12 ? m - 12 : m;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = lastDay; d >= 1; d -= 1) {
      const ymd = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const t = Date.parse(`${ymd}T12:00:00+05:30`);
      const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date(t));
      if (wd === 'Thu' && ymd >= today) return ymd;
      if (wd === 'Thu') break;
    }
  }
  return nextNseWeeklyExpiryYmd(now);
}

/** Next NSE weekly expiry (Thursday IST), including today if it is Thursday. */
export function nextNseWeeklyExpiryYmd(now = Date.now()) {
  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
  for (let i = 0; i <= 10; i += 1) {
    const t = now + i * 86_400_000;
    if (wdFmt.format(new Date(t)) === 'Thu') return dayFmt.format(new Date(t));
  }
  return null;
}

/** Refresh equity + index + F&O instrument map and classified universes. */
function rememberOptionExpiry(row) {
  const opt = String(row.OPTION_TYPE || '').toUpperCase();
  const inst = String(row.INSTRUMENT_NAME || row.SEM_EXCH_INSTRUMENT_TYPE || '').toUpperCase();
  const tsym = String(row.TRADING_SYMBOL || '').toUpperCase();
  const isOpt = opt === 'CE' || opt === 'PE' || /OPT/.test(inst) || /\d+CE$|\d+PE$/.test(tsym);
  if (!isOpt) return;
  const name = normalizeIndSymbolKey(row.SYMBOL_NAME);
  if (!name || name.length > 20) return;
  const ms = parseOptionExpiryMs(row.EXPIRY_DATE);
  if (!(ms > 0)) return;
  const list = optionExpiryMsBySymbol.get(name) || [];
  if (!list.includes(ms)) list.push(ms);
  optionExpiryMsBySymbol.set(name, list);
}

export async function refreshIndstocksInstrumentMap(accessToken) {
  const map = new Map();
  optionExpiryMsBySymbol.clear();
  /** @type {{ equity: object[], index: object[], fno: object[] }} */
  const packs = { equity: [], index: [], fno: [] };
  /** Front-month MCX futures: SYMBOL_NAME → { exp, scrip } */
  const mcxFront = new Map();

  const ingest = (rows, source) => {
    packs[source] = rows;
    for (const row of rows) {
      if (source === 'fno') rememberOptionExpiry(row);
      const sid = row.SECURITY_ID;
      if (!sid) continue;
      const exch = (row.EXCH || 'NSE').toUpperCase();
      let scrip;
      if (source === 'index') {
        if (exch === 'BSE' || exch === 'BIDX') scrip = `BIDX_${sid}`;
        else scrip = `NIDX_${sid}`;
      } else if (source === 'fno' || source === 'commodity') {
        if (exch === 'MCX' || exch === 'MCDX') scrip = `MCX_${sid}`;
        else if (exch === 'NCDEX') scrip = `NCDEX_${sid}`;
        else {
          const seg = exch === 'BSE' || exch === 'BFO' ? 'BFO' : 'NFO';
          scrip = `${seg}_${sid}`;
        }
      } else {
        scrip = `${exch}_${sid}`;
      }
      const names = [row.SYMBOL_NAME, row.TRADING_SYMBOL, row.CUSTOM_SYMBOL]
        .flatMap((s) => {
          const n = String(s || '')
            .toUpperCase()
            .replace(/-EQ$/, '')
            .replace(/\s+/g, '')
            .trim();
          if (!n) return [];
          const keys = [n];
          if (n.includes('&')) keys.push(n.replace(/&/g, ''));
          return keys;
        });
      for (const n of names) {
        // Prefer equity SCRIP for underlying names; don't overwrite NSE_ with NFO_
        if (!map.has(n)) map.set(n, scrip);
        else if (source === 'index') {
          map.set(n, scrip);
        } else if (source === 'equity' && String(map.get(n) || '').startsWith('NFO_')) {
          map.set(n, scrip);
        } else if (source === 'equity' && String(map.get(n) || '').startsWith('BFO_')) {
          map.set(n, scrip);
        } else if (String(scrip).startsWith('MCX_') && !String(map.get(n) || '').startsWith('MCX_')) {
          map.set(n, scrip);
        }
      }

      if (String(scrip).startsWith('MCX_')) {
        const opt = String(row.OPTION_TYPE || '').toUpperCase();
        const inst = String(row.INSTRUMENT_NAME || row.SEM_EXCH_INSTRUMENT_TYPE || '').toUpperCase();
        const tsym = String(row.TRADING_SYMBOL || '').toUpperCase();
        const isOpt = opt === 'CE' || opt === 'PE' || /OPT/.test(inst) || /\d+CE$|\d+PE$/.test(tsym);
        if (!isOpt) {
          const base = String(row.SYMBOL_NAME || '')
            .toUpperCase()
            .replace(/\s+/g, '')
            .trim();
          if (base && base.length <= 20 && !/\d{2}[A-Z]{3}/.test(base)) {
            const exp = parseExpiryMs(row.EXPIRY_DATE);
            const floor = Date.now() - 2 * 86_400_000;
            if (exp >= floor) {
              const prev = mcxFront.get(base);
              if (!prev || exp < prev.exp) mcxFront.set(base, { exp, scrip });
            }
          }
        }
      }
    }
  };

  for (const source of ['equity', 'index', 'fno', 'commodity']) {
    try {
      const { text } = await indFetch('/market/instruments', accessToken, {
        searchParams: { source },
        accept: 'text/csv,*/*',
      });
      ingest(parseCsv(text), source === 'commodity' ? 'fno' : source);
    } catch (e) {
      if (source !== 'commodity') {
        console.warn(`[indstocks] instruments source=${source} failed`, e?.message || e);
      }
    }
  }

  for (const [name, row] of mcxFront) {
    map.set(name, row.scrip);
    map.set(`MCX:${name}`, row.scrip);
  }

  // Seed fallbacks only when instrument master omitted the symbol.
  // Never overwrite index-master IDs with classic NSE tokens (26000) — INDstocks
  // often uses NIDX_40000001-style SECURITY_IDs for indices.
  for (const [sym, scrip] of Object.entries(FALLBACK_SCRIP_BY_SYMBOL)) {
    if (!map.has(sym)) map.set(sym, scrip);
  }
  if (map.has('NIFTY') && !map.has('NIFTY50')) {
    map.set('NIFTY50', map.get('NIFTY'));
  }
  // If equity CSV poisoned NIFTY with NSE_*, replace with index fallback.
  for (const sym of Object.keys(INDEX_SCRIP_ALTERNATES)) {
    const cur = String(map.get(sym) || '');
    if (cur.startsWith('NSE_') || cur.startsWith('BSE_') || cur.startsWith('NFO_')) {
      map.set(sym, FALLBACK_SCRIP_BY_SYMBOL[sym] || INDEX_SCRIP_ALTERNATES[sym][0]);
    }
  }
  // Classic NSE index tokens (26000) often return empty /market/historical for INDMoney.
  for (const sym of ['NIFTY', 'NIFTY50']) {
    const cur = String(map.get(sym) || '');
    if (cur === 'NIDX_26000' || cur === 'NSE_26000') {
      map.set(sym, 'NIDX_40000001');
    }
  }

  instrumentCache.at = Date.now();
  instrumentCache.bySymbol = map;

  const stats = rebuildInstrumentUniverses(packs);
  console.log('[indstocks] instrument universes', stats);

  return map.size;
}

export function normalizeIndSymbolKey(symbol) {
  return String(symbol || '')
    .toUpperCase()
    .replace(/^NSE:/, '')
    .replace(/^BSE:/, '')
    .replace(/^NIDX:/, '')
    .replace(/^BIDX:/, '')
    .replace(/^MCX:/, '')
    .replace(/^NCDEX:/, '')
    .replace(/-EQ$/, '')
    .replace(/\s+/g, '')
    .trim();
}

export function resolveScripCode(symbol, exchange = 'NSE') {
  const key = normalizeIndSymbolKey(symbol);
  if (!key) return null;
  const wantMcx = /^MCX:/i.test(String(symbol || '')) || String(exchange || '').toUpperCase() === 'MCX';
  const mcxHit = instrumentCache.bySymbol.get(`MCX:${key}`);
  if (wantMcx && mcxHit) return mcxHit;
  if (instrumentCache.bySymbol.has(key)) {
    const hit = instrumentCache.bySymbol.get(key);
    // Never serve classic NSE NIFTY token — historical candles come back empty.
    if ((key === 'NIFTY' || key === 'NIFTY50') && (hit === 'NIDX_26000' || hit === 'NSE_26000')) {
      return 'NIDX_40000001';
    }
    return hit;
  }
  if (FALLBACK_SCRIP_BY_SYMBOL[key]) return FALLBACK_SCRIP_BY_SYMBOL[key];
  // Alias: "NIFTY 50" already stripped spaces → NIFTY50
  if (key === 'NIFTY50' && FALLBACK_SCRIP_BY_SYMBOL.NIFTY) return FALLBACK_SCRIP_BY_SYMBOL.NIFTY;
  if (/^[A-Z]+_\d+$/.test(key)) return key;
  return null;
}

/**
 * Prefer NIDX/BIDX for indices, but also try NSE_/BSE_ — some historical
 * endpoints accept either depending on account / instrument master revision.
 */
export function resolveScripCodeCandidates(symbol) {
  const key = normalizeIndSymbolKey(symbol);
  const primary = resolveScripCode(symbol);
  const out = [];
  // Documented INDMoney index IDs first (NIFTY → NIDX_40000001). Classic NSE
  // tokens like NIDX_26000 often return empty historical candles.
  const alts = INDEX_SCRIP_ALTERNATES[key] || (key === 'NIFTY50' ? INDEX_SCRIP_ALTERNATES.NIFTY : null);
  if (alts) {
    for (const a of alts) {
      if (!out.includes(a)) out.push(a);
    }
  }
  if (primary && !out.includes(primary)) out.push(primary);
  const forced = FALLBACK_SCRIP_BY_SYMBOL[key];
  if (forced && !out.includes(forced)) out.push(forced);
  if (!out.length) return [];
  // Segment swaps only for indices — NSE_2885 → NIDX_2885 is a wasted historical call.
  if (INDEX_SCRIP_ALTERNATES[key] || key === 'NIFTY50') {
    for (const code of [...out]) {
      const m = String(code).match(/^(NIDX|BIDX|NSE|BSE)_(\d+)$/i);
      if (!m) continue;
      const seg = m[1].toUpperCase();
      const id = m[2];
      if (seg === 'NIDX') out.push(`NSE_${id}`);
      if (seg === 'NSE') out.push(`NIDX_${id}`);
      if (seg === 'BIDX') out.push(`BSE_${id}`);
      if (seg === 'BSE') out.push(`BIDX_${id}`);
    }
  }
  return [...new Set(out)];
}

export function listUniverseSymbols(universe) {
  // Prefer live instrument-master derived sets when available (falls back to static catalog).
  return resolveUniverseSymbols(universe);
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

/** Nearest option expiry YYYY-MM-DD from the FNO master. Null if unknown. */
export function getNearestOptionExpiryYmd(symbol, now = Date.now()) {
  const key = normalizeIndSymbolKey(symbol);
  const aliases = key === 'NIFTY50' ? ['NIFTY50', 'NIFTY'] : [key];
  let list = [];
  for (const alias of aliases) {
    const got = optionExpiryMsBySymbol.get(alias);
    if (got?.length) {
      list = got;
      break;
    }
  }
  if (!list.length) return nextNseWeeklyExpiryYmd(now);
  const today = istCalendarDay(now);
  const todayMs = Date.parse(`${today}T00:00:00+05:30`);
  const future = list.filter((ms) => ms >= todayMs).sort((a, b) => a - b);
  const pick = future[0];
  return pick ? istCalendarDay(pick) : nextNseWeeklyExpiryYmd(now);
}

/** Equity/index SECURITY_ID for GET /market/option-chain. Never an NFO contract. */
export function optionChainUnderlying(symbol) {
  const key = normalizeIndSymbolKey(symbol);
  if (!key) return null;
  const scrip = resolveScripCode(key);
  if (!scrip) return null;
  const m = String(scrip).match(/^(NSE|BSE|NIDX|BIDX|NFO|BFO)_(\d+)$/i);
  if (!m) return null;
  const seg = m[1].toUpperCase();
  const id = m[2];
  if (seg === 'NFO' || seg === 'BFO') return null;
  const isIndex = OPTION_CHAIN_INDEX.has(key) || seg === 'NIDX' || seg === 'BIDX';
  return {
    exchange: seg === 'BSE' || seg === 'BIDX' ? 'BSE' : 'NSE',
    segment: isIndex ? 'INDEX' : 'EQUITY',
    underlyingScrip: id,
  };
}

/** Live option chain for one underlying + expiry. Never logs the token. */
export async function fetchIndstocksOptionChain(accessToken, params) {
  const exchange = String(params?.exchange || 'NSE').toUpperCase();
  const segment = String(params?.segment || 'EQUITY').toUpperCase();
  const underlyingScrip = String(params?.underlyingScrip || '').trim();
  const expiry = String(params?.expiry || '').trim();
  const strikeCount = Math.max(3, Math.min(15, Number(params?.strikeCount) || 8));
  if (!underlyingScrip || !expiry) return null;
  const { json } = await indFetch('/market/option-chain', accessToken, {
    searchParams: {
      exchange,
      segment,
      'underlying-scrip': underlyingScrip,
      expiry,
      strike_count: strikeCount,
    },
  });
  return json && typeof json === 'object' ? json : null;
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
