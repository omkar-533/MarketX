import { fetchBhavFnoSnapshot } from './nseBhavFno.mjs';
import { nseGetJson } from './nseSession.mjs';

const INDEX_SYMBOLS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']);

function fmtNseDate(d) {
  const dt = new Date(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const mon = dt.toLocaleString('en-GB', { month: 'short' });
  const year = dt.getFullYear();
  return `${day}-${mon}-${year}`;
}

function parseDdMmmYyyy(s) {
  const m = String(s).match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return null;
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const mon = months[m[2]];
  if (mon == null) return null;
  return new Date(Number(m[3]), mon, Number(m[1])).toISOString().split('T')[0];
}

function instrumentType(symbol) {
  return INDEX_SYMBOLS.has(symbol) ? 'FUTIDX' : 'FUTSTK';
}

/** NSE historical F&O price volume (foCPV — may 503; bhavcopy fallback below) */
async function fetchFoCpv(symbol, fromDate, toDate) {
  const year = new Date(fromDate).getFullYear();
  const from = fmtNseDate(fromDate);
  const to = fmtNseDate(toDate);
  const inst = instrumentType(symbol);
  const paths = [
    `/api/historical/foCPV?from=${from}&to=${to}&instrumentType=${inst}&symbol=${encodeURIComponent(symbol)}&csv=true`,
    `/api/historicalOR/foCPV?&symbol=${encodeURIComponent(symbol)}&instrumentType=${inst}&from=${from}&to=${to}&year=${year}`,
  ];
  let lastErr;
  for (const path of paths) {
    try {
      return await nseGetJson(path, 'https://www.nseindia.com/report-detail/fo_eq_security');
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('NSE foCPV unavailable');
}

function normalizeFoRows(payload, symbol) {
  const rows = payload?.data ?? payload?.records ?? payload ?? [];
  if (!Array.isArray(rows)) return [];

  const parsed = rows
    .map((r) => {
      const date =
        parseDdMmmYyyy(r.DATE ?? r.date ?? r.tradeDate ?? r.TIMESTAMP) ??
        (r.date ? String(r.date).slice(0, 10) : null);
      if (!date) return null;

      const oi = Number(r.OPEN_INT ?? r.openInterest ?? r.oi ?? r.OI ?? 0);
      const volume = Number(r.CONTRACTS_TRADED ?? r.tradedQuantity ?? r.volume ?? r.VOLUME ?? 0);
      const close = Number(r.CLOSE ?? r.close ?? r.SETTLE_PR ?? r.ltp ?? 0);
      const open = Number(r.OPEN ?? r.open ?? close);
      const high = Number(r.HIGH ?? r.high ?? close);
      const low = Number(r.LOW ?? r.low ?? close);

      return {
        date,
        symbol,
        totalOi: Math.max(0, Math.floor(oi)),
        volume: Math.max(0, Math.floor(volume)),
        futClose: close || undefined,
        futOpen: open || undefined,
        futHigh: high || undefined,
        futLow: low || undefined,
      };
    })
    .filter(Boolean);

  const byDate = new Map();
  parsed.forEach((r) => {
    const prev = byDate.get(r.date);
    if (!prev) {
      byDate.set(r.date, { ...r });
      return;
    }
    prev.totalOi += r.totalOi;
    prev.volume += r.volume;
    byDate.set(r.date, prev);
  });

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const cache = new Map();

export async function fetchNseFnoHistory(symbol, fromDate, toDate) {
  const sym = String(symbol).trim().toUpperCase();
  const from = fromDate || '2023-01-01';
  const to = toDate || new Date().toISOString().split('T')[0];
  const key = `fno:${sym}:${from}:${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 120_000) return hit.data;

  try {
    const raw = await fetchFoCpv(sym, from, to);
    const rows = normalizeFoRows(raw, sym);
    if (rows.length) {
      const data = {
        symbol: sym,
        from,
        to,
        rows,
        source: 'nse',
        fetchedAt: new Date().toISOString(),
      };
      cache.set(key, { at: Date.now(), data });
      return data;
    }
  } catch {
    /* bhav fallback */
  }

  const bhav = await fetchBhavFnoSnapshot(sym);
  if (bhav) {
    const row = {
      date: bhav.date,
      symbol: sym,
      totalOi: bhav.totalOi,
      volume: bhav.volume,
      futClose: bhav.futClose,
      oiChange: bhav.oiChange,
    };
    const data = {
      symbol: sym,
      from,
      to,
      rows: [row],
      source: 'nse-bhav',
      fetchedAt: new Date().toISOString(),
    };
    cache.set(key, { at: Date.now(), data });
    return data;
  }

  const data = {
    symbol: sym,
    from,
    to,
    rows: [],
    source: 'none',
    error: 'NSE live API unavailable — no bhavcopy',
    fetchedAt: new Date().toISOString(),
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}
