import { fetchOhlc } from './fyersProvider.mjs';
import { fetchFyersFnoOiBatch } from './fyersFnoOi.mjs';
import { isFyersConfigured } from './fyersSession.mjs';

const cache = new Map();

function rangeForDates(fromDate, toDate) {
  const from = new Date(fromDate).getTime();
  const to = new Date(toDate).getTime();
  const days = Math.ceil((to - from) / 86400000);
  if (days > 365 * 2) return '1y';
  if (days > 180) return '6mo';
  return '3mo';
}

/** Historical F&O context from Fyers daily candles + latest OI snapshot */
export async function fetchFyersFnoHistory(symbol, fromDate, toDate) {
  if (!isFyersConfigured()) {
    throw new Error('Fyers API not connected');
  }

  const sym = String(symbol).trim().toUpperCase();
  const from = fromDate || '2023-01-01';
  const to = toDate || new Date().toISOString().split('T')[0];
  const key = `fyers-fno:${sym}:${from}:${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 120_000) return hit.data;

  const range = rangeForDates(from, to);
  const ohlc = await fetchOhlc(sym, '1d', range);

  let latestOi = 0;
  let latestOiChg = 0;
  try {
    const batch = await fetchFyersFnoOiBatch([sym]);
    const snap = batch?.snapshots?.find((s) => s.symbol === sym);
    latestOi = snap?.totalOi ?? 0;
    latestOiChg = snap?.oiChange ?? 0;
  } catch {
    /* OI optional */
  }

  const rows = (ohlc.bars ?? [])
    .map((b) => {
      const date = new Date(b.time * 1000).toISOString().split('T')[0];
      if (date < from || date > to) return null;
      return {
        date,
        symbol: sym,
        totalOi: 0,
        volume: b.volume,
        futClose: b.close,
        futOpen: b.open,
        futHigh: b.high,
        futLow: b.low,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length && latestOi > 0) {
    rows[rows.length - 1].totalOi = latestOi;
    rows[rows.length - 1].oiChange = latestOiChg;
  }

  const data = {
    symbol: sym,
    from,
    to,
    rows,
    source: 'fyers',
    note: 'Daily candles from Fyers; historical OI only on latest bar (from option chain)',
    fetchedAt: new Date().toISOString(),
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}
