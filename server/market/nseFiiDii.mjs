import { nseGetJson } from './nseSession.mjs';

const cache = { rows: [], at: 0 };
const CACHE_MS = 5 * 60_000;

function parseCr(v) {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function parseNseDate(s) {
  const m = String(s).match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return String(s).slice(0, 10);
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const mon = months[m[2]];
  if (mon == null) return String(s).slice(0, 10);
  return new Date(Number(m[3]), mon, Number(m[1])).toISOString().split('T')[0];
}

/** NSE FII/DII participant flows (cash, futures, options) */
export async function fetchNseFiiDii(days = 30) {
  if (cache.rows.length && Date.now() - cache.at < CACHE_MS) {
    return { rows: cache.rows.slice(-days), source: 'nse', fetchedAt: new Date().toISOString() };
  }

  const raw = await nseGetJson('/api/fiidiiTradeReact', 'https://www.nseindia.com/all-reports');
  const list = Array.isArray(raw) ? raw : raw?.data ?? [];

  const byDate = new Map();

  for (const row of list) {
    const date = parseNseDate(row.date ?? row.tradeDate ?? '');
    if (!date) continue;
    const cat = String(row.category ?? row.type ?? '').toUpperCase();
    const buy = parseCr(row.buyValue ?? row.buyAmt ?? row.buy);
    const sell = parseCr(row.sellValue ?? row.sellAmt ?? row.sell);
    const net = parseCr(row.netValue ?? row.netAmt ?? row.net ?? buy - sell);

    let entry = byDate.get(date);
    if (!entry) {
      entry = {
        date,
        fiiCashBuy: 0,
        fiiCashSell: 0,
        fiiCashNet: 0,
        fiiFuturesBuy: 0,
        fiiFuturesSell: 0,
        fiiFuturesNet: 0,
        fiiOptionsBuy: 0,
        fiiOptionsSell: 0,
        fiiOptionsNet: 0,
        diiCashBuy: 0,
        diiCashSell: 0,
        diiCashNet: 0,
      };
      byDate.set(date, entry);
    }

    if (cat.includes('FII') || cat.includes('FPI')) {
      if (cat.includes('FUTURE')) {
        entry.fiiFuturesBuy += buy;
        entry.fiiFuturesSell += sell;
        entry.fiiFuturesNet += net;
      } else if (cat.includes('OPTION')) {
        entry.fiiOptionsBuy += buy;
        entry.fiiOptionsSell += sell;
        entry.fiiOptionsNet += net;
      } else {
        entry.fiiCashBuy += buy;
        entry.fiiCashSell += sell;
        entry.fiiCashNet += net;
      }
    } else if (cat.includes('DII')) {
      entry.diiCashBuy += buy;
      entry.diiCashSell += sell;
      entry.diiCashNet += net;
    }
  }

  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  cache.rows = rows;
  cache.at = Date.now();

  return {
    rows: rows.slice(-days),
    source: 'nse',
    fetchedAt: new Date().toISOString(),
  };
}
