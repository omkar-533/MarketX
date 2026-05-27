import { getStocks, type StockData } from '../data/marketData';
import { FNO_STOCKS_ALL } from '../data/fnoUniverse';
import type { ScanSegment } from '../types/screener';

/** Nifty 50 constituents (official subset used in app) */
export const NIFTY50_SYMBOLS = new Set([
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'BHARTIARTL', 'SBIN', 'ITC', 'HINDUNILVR', 'KOTAKBANK',
  'AXISBANK', 'LT', 'BAJFINANCE', 'ASIANPAINT', 'MARUTI', 'TATAMOTORS', 'SUNPHARMA', 'ADANIENT', 'WIPRO', 'NTPC',
  'ONGC', 'POWERGRID', 'TITAN', 'ULTRACEMCO', 'NESTLEIND', 'HCLTECH', 'TECHM', 'TATASTEEL', 'JSWSTEEL', 'HINDALCO',
  'COALINDIA', 'BPCL', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP', 'BAJAJFINSV', 'BAJAJ-AUTO', 'EICHERMOT',
  'HEROMOTOCO', 'M&M', 'INDUSINDBK', 'ADANIPORTS', 'GRASIM', 'TRENT', 'DMART',
]);

const BANK_SYMBOLS = new Set([
  'HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK', 'PNB', 'BANKBARODA', 'CANBK', 'FEDERALBNK',
  'IDFCFIRSTB', 'AUBANK',
]);

/** NSE F&O liquid names ≈ scannable universe */
export const FNO_SYMBOLS = new Set(FNO_STOCKS_ALL.filter((i) => i.type === 'stock').map((i) => i.symbol));

export const SCAN_SEGMENTS: { id: ScanSegment; label: string; hint: string }[] = [
  { id: 'all', label: 'All F&O stocks', hint: 'Full NSE F&O equity universe (~100+ names)' },
  { id: 'nifty50', label: 'Nifty 50', hint: 'Nifty 50 index constituents' },
  { id: 'nifty500', label: 'Nifty 500', hint: 'Broader liquid F&O universe' },
  { id: 'banknifty', label: 'Bank Nifty', hint: 'Banking sector index stocks' },
  { id: 'midcap', label: 'Midcap', hint: 'Mid-cap by market cap' },
  { id: 'smallcap', label: 'Smallcap', hint: 'Small-cap by market cap' },
  { id: 'fno', label: 'F&O stocks', hint: 'Futures & options eligible' },
  { id: 'watchlist', label: 'My watchlist', hint: 'Only symbols in your watchlist' },
];

export function getSegmentFlags(symbol: string, sector: string, marketCap: number) {
  const inNifty50 = NIFTY50_SYMBOLS.has(symbol);
  const inNifty500 = FNO_SYMBOLS.has(symbol) || inNifty50;
  const inBankNifty = BANK_SYMBOLS.has(symbol) || sector.toLowerCase().includes('bank');
  const isFno = FNO_SYMBOLS.has(symbol);
  const isMidcap = !inNifty50 && marketCap >= 200_000 && marketCap < 1_000_000;
  const isSmallcap = marketCap > 0 && marketCap < 200_000;

  return { inNifty50, inNifty500, inBankNifty, isFno, isMidcap, isSmallcap };
}

export function symbolMatchesSegment(
  symbol: string,
  sector: string,
  segment: ScanSegment,
  watchlist: string[],
  marketCap = 0,
): boolean {
  if (segment === 'all') return true;
  if (segment === 'watchlist') return watchlist.includes(symbol);
  const f = getSegmentFlags(symbol, sector, marketCap);
  switch (segment) {
    case 'nifty50':
      return f.inNifty50;
    case 'nifty500':
      return f.inNifty500;
    case 'banknifty':
      return f.inBankNifty;
    case 'fno':
      return f.isFno;
    case 'midcap':
      return f.isMidcap;
    case 'smallcap':
      return f.isSmallcap;
    default:
      return true;
  }
}

/** Real F&O universe — no fake symbol clones */
export function loadScreenerBaseStocks(): StockData[] {
  const bySymbol = new Map<string, StockData>();
  const liveStocks = getStocks();

  for (const inst of FNO_STOCKS_ALL) {
    if (inst.type !== 'stock') continue;
    const live = liveStocks.find((s) => s.symbol === inst.symbol);
    const base = live;
    const template = base ?? {
      symbol: inst.symbol,
      name: inst.name,
      price: inst.basePrice,
      change: 0,
      changePercent: 0,
      volume: 500_000,
      marketCap: 300_000,
      sector: inst.sector,
      pe: 20,
      high: inst.basePrice * 1.01,
      low: inst.basePrice * 0.99,
      open: inst.basePrice,
      prevClose: inst.basePrice,
      delivery: 35,
      vwap: inst.basePrice,
      rsi: 50,
    };
    bySymbol.set(inst.symbol, { ...template, name: inst.name, sector: inst.sector });
  }

  for (const s of liveStocks) {
    if (!bySymbol.has(s.symbol)) bySymbol.set(s.symbol, s);
  }

  return Array.from(bySymbol.values());
}

export function loadExpandedStocks(): StockData[] {
  return loadScreenerBaseStocks();
}
