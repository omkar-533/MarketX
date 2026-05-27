import { nseGetJson } from './nseSession.mjs';

const INDEX_SYMBOLS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX']);

const cache = new Map();
const CACHE_MS = 45_000;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickExpiry(expiryDates, requested) {
  if (!expiryDates?.length) return null;
  if (!requested) return expiryDates[0];
  const req = String(requested).trim().toLowerCase();
  const hit = expiryDates.find((e) => String(e).toLowerCase().includes(req.slice(0, 6)));
  return hit ?? expiryDates[0];
}

function normalizeLeg(leg) {
  if (!leg) return null;
  const oi = Math.floor(num(leg.openInterest ?? leg.oi));
  const oiChg = Math.floor(num(leg.changeinOpenInterest ?? leg.changeInOpenInterest ?? leg.oiChange));
  const ltp = num(leg.lastPrice ?? leg.ltp);
  const iv = num(leg.impliedVolatility ?? leg.iv);
  const bid = num(leg.bidprice ?? leg.bidPrice ?? leg.bid);
  const ask = num(leg.askPrice ?? leg.askprice ?? leg.ask);
  const vol = Math.floor(num(leg.totalTradedVolume ?? leg.volume));
  return { oi, oiChg, ltp, iv, bid, ask, vol };
}

function normalizePayload(payload, symbol, expiryLabel) {
  const records = payload?.records ?? payload?.data?.records ?? payload;
  const expiryDates = records?.expiryDates ?? records?.expiryDate ?? [];
  const expiry = pickExpiry(
    Array.isArray(expiryDates) ? expiryDates : [],
    expiryLabel,
  );
  const spot = num(records?.underlyingValue ?? records?.spotPrice ?? payload?.underlyingValue);
  const data = records?.data ?? records?.options ?? [];
  if (!Array.isArray(data) || !data.length) {
    return { symbol, spot, expiry, rows: [], source: 'nse', error: 'No chain rows' };
  }

  const rows = data
    .map((row) => {
      const strike = num(row.strikePrice ?? row.STRIKE_PR ?? row.strike);
      if (!strike) return null;
      const ce = normalizeLeg(row.CE ?? row.ce);
      const pe = normalizeLeg(row.PE ?? row.pe);
      if (!ce && !pe) return null;
      const ceOi = ce?.oi ?? 0;
      const peOi = pe?.oi ?? 0;
      const ceLtp = ce?.ltp ?? 0;
      const peLtp = pe?.ltp ?? 0;
      const ceIv = ce?.iv ?? 0;
      const peIv = pe?.iv ?? 0;
      return {
        strike,
        ceLtp,
        ceOi,
        ceOiChg: ce?.oiChg ?? 0,
        ceVolume: ce?.vol ?? 0,
        ceIv,
        ceBid: ce?.bid ?? ceLtp,
        ceAsk: ce?.ask ?? ceLtp,
        peLtp,
        peOi,
        peOiChg: pe?.oiChg ?? 0,
        peVolume: pe?.vol ?? 0,
        peIv,
        peBid: pe?.bid ?? peLtp,
        peAsk: pe?.ask ?? peLtp,
        pcr: peOi / Math.max(ceOi, 1),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.strike - b.strike);

  return {
    symbol,
    spot,
    expiry: expiry ?? expiryDates[0] ?? '',
    expiries: Array.isArray(expiryDates) ? expiryDates : [],
    rows,
    source: 'nse',
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchNseOptionChain(symbol, expiry) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) throw new Error('symbol required');

  const key = `oc:${sym}:${expiry || ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const isIndex = INDEX_SYMBOLS.has(sym);
  const path = isIndex
    ? `/api/option-chain-indices?symbol=${encodeURIComponent(sym)}`
    : `/api/option-chain-equities?symbol=${encodeURIComponent(sym)}`;
  const referer = isIndex
    ? 'https://www.nseindia.com/option-chain'
    : 'https://www.nseindia.com/get-quotes/derivatives?symbol=' + sym;

  const raw = await nseGetJson(path, referer);
  const data = normalizePayload(raw, sym, expiry);
  cache.set(key, { at: Date.now(), data });
  return data;
}
