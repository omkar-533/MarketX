import { getFyersClient, isFyersConfigured } from './fyersSession.mjs';
import { toFyersSymbol } from './fyersSymbolMap.mjs';

const cache = new Map();
const expiryMetaCache = new Map();
const CACHE_MS = 90_000;
const EXPIRY_META_MS = 5 * 60_000;
const STALE_MAX_MS = 10 * 60_000;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isRateLimitError(err) {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /429|rate.?limit|1015|too many/i.test(msg);
}

function getStale(key, maxAgeMs = STALE_MAX_MS) {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > maxAgeMs) return null;
  return hit.data;
}

/** Fyers date "d-m-yyyy" → "02 Jun 2026" */
function expiryLabelFromFyers(dateStr) {
  const m = String(dateStr).match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (!m) return String(dateStr || '').trim();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[Number(m[2]) - 1] ?? m[2];
  return `${String(m[1]).padStart(2, '0')} ${mon} ${m[3]}`;
}

/** Fyers date → YYYY-MM-DD for API `expiry` param */
function expiryIsoFromFyers(dateStr) {
  const m = String(dateStr).match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (!m) return '';
  const dd = String(m[1]).padStart(2, '0');
  const mm = String(m[2]).padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

function parseExpiryData(expiryData) {
  if (!Array.isArray(expiryData)) return [];
  return expiryData
    .map((e) => {
      const dateRaw = e.date ?? e.expiry_date ?? '';
      const timestamp = String(e.expiry ?? e.timestamp ?? '').trim();
      const label = expiryLabelFromFyers(dateRaw);
      const iso = expiryIsoFromFyers(dateRaw);
      return { label, iso, timestamp, dateRaw };
    })
    .filter((e) => e.label && e.timestamp);
}

function pickExpiryEntry(entries, requested) {
  if (!entries.length) return null;
  if (!requested) return entries[0];

  const req = String(requested).trim();
  const reqLower = req.toLowerCase();

  const exact = entries.find((e) => e.label.toLowerCase() === reqLower);
  if (exact) return exact;

  if (/^\d{4}-\d{2}-\d{2}$/.test(req)) {
    const isoHit = entries.find((e) => e.iso === req);
    if (isoHit) return isoHit;
  }

  const reqTime = new Date(req).getTime();
  if (!Number.isNaN(reqTime)) {
    const byDate = entries.find((e) => {
      const t = new Date(e.label).getTime();
      return !Number.isNaN(t) && Math.abs(t - reqTime) < 43200000;
    });
    if (byDate) return byDate;
  }

  const partial = entries.find((e) => {
    const lab = e.label.toLowerCase();
    return lab.includes(reqLower) || reqLower.includes(lab.slice(0, 9));
  });
  return partial ?? null;
}

function normalizeFyersChain(payload, symbol, selectedEntry) {
  const data = payload?.data ?? {};
  const optionsChain = Array.isArray(data.optionsChain) ? data.optionsChain : [];
  const expiryData = Array.isArray(data.expiryData) ? data.expiryData : [];
  const entries = parseExpiryData(expiryData);
  const active = selectedEntry ?? entries[0] ?? null;

  const underlying = optionsChain.find((r) => r.strike_price === -1 || !r.option_type);
  const spot = num(underlying?.ltp ?? underlying?.fp ?? 0);

  const byStrike = new Map();

  for (const leg of optionsChain) {
    const strike = num(leg.strike_price);
    if (strike <= 0) continue;
    const side = String(leg.option_type || '').toUpperCase();
    if (side !== 'CE' && side !== 'PE') continue;

    let row = byStrike.get(strike);
    if (!row) {
      row = {
        strike,
        ceLtp: 0,
        ceOi: 0,
        ceOiChg: 0,
        ceVolume: 0,
        ceIv: 0,
        ceBid: 0,
        ceAsk: 0,
        peLtp: 0,
        peOi: 0,
        peOiChg: 0,
        peVolume: 0,
        peIv: 0,
        peBid: 0,
        peAsk: 0,
      };
      byStrike.set(strike, row);
    }

    const oi = Math.floor(num(leg.oi));
    const oiChg = Math.floor(num(leg.oich ?? leg.oi - leg.prev_oi));
    const ltp = num(leg.ltp);
    const iv = num(leg.greeks?.iv ?? leg.iv);
    const bid = num(leg.bid);
    const ask = num(leg.ask);
    const vol = Math.floor(num(leg.volume));

    if (side === 'CE') {
      row.ceLtp = ltp;
      row.ceOi = oi;
      row.ceOiChg = oiChg;
      row.ceVolume = vol;
      row.ceIv = iv;
      row.ceBid = bid;
      row.ceAsk = ask;
    } else {
      row.peLtp = ltp;
      row.peOi = oi;
      row.peOiChg = oiChg;
      row.peVolume = vol;
      row.peIv = iv;
      row.peBid = bid;
      row.peAsk = ask;
    }
  }

  const rows = [...byStrike.values()]
    .sort((a, b) => a.strike - b.strike)
    .map((r) => ({
      strike: r.strike,
      ceLtp: r.ceLtp,
      ceOi: r.ceOi,
      ceOiChg: r.ceOiChg,
      ceVolume: r.ceVolume,
      ceIv: r.ceIv,
      ceBid: r.ceBid || r.ceLtp,
      ceAsk: r.ceAsk || r.ceLtp,
      peLtp: r.peLtp,
      peOi: r.peOi,
      peOiChg: r.peOiChg,
      peVolume: r.peVolume,
      peIv: r.peIv,
      peBid: r.peBid || r.peLtp,
      peAsk: r.peAsk || r.peLtp,
      pcr: r.peOi / Math.max(r.ceOi, 1),
    }));

  const expiries = entries.map((e) => e.label);

  return {
    symbol,
    spot,
    expiry: active?.label ?? expiries[0] ?? '',
    expiryIso: active?.iso ?? '',
    expiryTimestamp: active?.timestamp ?? '',
    expiries,
    rows,
    totalCeOi: Math.floor(num(data.callOi)),
    totalPeOi: Math.floor(num(data.putOi)),
    source: 'fyers',
    fetchedAt: new Date().toISOString(),
  };
}

async function loadExpiryEntries(fyers, fyersSym, baseReq) {
  const metaKey = `exp-meta:${fyersSym}`;
  const hit = expiryMetaCache.get(metaKey);
  if (hit && Date.now() - hit.at < EXPIRY_META_MS) return hit.entries;

  const raw = await fyers.getOptionChain({ ...baseReq, strikecount: '5', greeks: 0 });
  if (raw?.s !== 'ok') {
    throw new Error(raw?.message || 'Fyers expiry list failed');
  }
  const entries = parseExpiryData(raw?.data?.expiryData ?? []);
  expiryMetaCache.set(metaKey, { at: Date.now(), entries });
  return entries;
}

function buildChainRequest(fyersSym, strikecount, entry) {
  const req = {
    symbol: fyersSym,
    strikecount: String(Math.min(100, Math.max(10, strikecount))),
    greeks: 1,
  };
  if (!entry) return req;
  // Fyers options-chain-v3: use `timestamp` from expiryData (epoch string).
  // Sending `expiry` as YYYY-MM-DD returns "Please provide valid inputs".
  if (entry.timestamp) req.timestamp = String(entry.timestamp);
  return req;
}

/** Fyers Data API — options-chain-v3 (expiries + full chain for selected expiry) */
export async function fetchFyersOptionChain(symbol, expiry, strikecount = 100) {
  if (!isFyersConfigured()) {
    throw new Error('Fyers not connected');
  }

  const sym = String(symbol || '').trim().toUpperCase();
  const fyersSym = toFyersSymbol(sym);
  if (!fyersSym) throw new Error(`Unknown symbol for Fyers: ${sym}`);

  const key = `fyers-oc:${fyersSym}:${expiry || 'default'}:${strikecount}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const stale = getStale(key);
  const fyers = getFyersClient();
  const baseReq = { symbol: fyersSym };

  try {
    let entries = expiryMetaCache.get(`exp-meta:${fyersSym}`)?.entries ?? [];
    if (!entries.length) {
      entries = await loadExpiryEntries(fyers, fyersSym, baseReq);
    }

    let selected = null;
    if (expiry) {
      selected = pickExpiryEntry(entries, expiry);
      if (!selected) {
        throw new Error(
          `Fyers expiry not found: ${expiry}. Available: ${entries.slice(0, 4).map((e) => e.label).join(', ')}…`,
        );
      }
    } else {
      selected = entries[0] ?? null;
    }

    let req = buildChainRequest(fyersSym, strikecount, selected);
    let raw = await fyers.getOptionChain(req);
    if (raw?.s !== 'ok' && selected?.timestamp) {
      // Fallback: default chain without timestamp if specific expiry rejected
      req = buildChainRequest(fyersSym, strikecount, null);
      raw = await fyers.getOptionChain(req);
    }
    if (raw?.s !== 'ok') {
      const msg = raw?.message || 'Fyers option chain failed';
      if (isRateLimitError({ message: msg }) && stale) {
        return { ...stale, source: 'fyers-cached', stale: true };
      }
      throw new Error(msg);
    }

    if (!entries.length) entries = parseExpiryData(raw?.data?.expiryData ?? []);
    if (!selected) selected = entries[0] ?? null;

    const data = normalizeFyersChain(raw, sym, selected);
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (isRateLimitError(err) && stale) {
      console.warn('[Fyers] option chain rate limit — serving cache for', sym);
      return { ...stale, source: 'fyers-cached', stale: true };
    }
    throw err;
  }
}

export function isFyersOptionChainAvailable() {
  return isFyersConfigured();
}
