/**
 * Searchable Terminal symbol catalog — NSE/BSE equities, F&O, indices,
 * forex, crypto, commodities, and options/futures underlyings.
 */

import nseEquityData from '../data/nseEquity.json';
import bseEquityData from '../data/bseEquity.json';
import { FNO_INDICES, FNO_STOCKS_ALL, FNO_UNIVERSE, getFnoInstrument } from '../data/fnoUniverse';
import { toTradingViewSymbol } from '../utils/tradingViewSymbols';

export type TerminalSymbolCategory =
  | 'all'
  | 'stocks'
  | 'futures'
  | 'forex'
  | 'crypto'
  | 'indices'
  | 'options'
  | 'bonds'
  | 'economy';

export type TerminalSymbolHit = {
  tvSymbol: string;
  label: string;
  name: string;
  /** Fine filter for tabs */
  group: TerminalSymbolCategory | 'commodity' | 'stock' | 'index' | 'fx';
  /** Shown in the Type column */
  typeLabel: string;
  /** Shown in the Exchange column */
  exchange: string;
  isFno?: boolean;
};

type EquityRow = { s: string; n: string; e: 'NSE' | 'BSE' };

const NSE_EQUITY = nseEquityData as EquityRow[];
const BSE_EQUITY = bseEquityData as EquityRow[];

const GLOBAL_HITS: TerminalSymbolHit[] = [
  /* Metals / commodities */
  { tvSymbol: 'OANDA:XAUUSD', label: 'XAUUSD', name: 'Gold / U.S. Dollar', group: 'forex', typeLabel: 'commodity cfd', exchange: 'OANDA' },
  { tvSymbol: 'OANDA:XAGUSD', label: 'XAGUSD', name: 'Silver / U.S. Dollar', group: 'forex', typeLabel: 'commodity cfd', exchange: 'OANDA' },
  { tvSymbol: 'TVC:USOIL', label: 'USOIL', name: 'Crude Oil WTI', group: 'forex', typeLabel: 'commodity', exchange: 'TVC' },
  { tvSymbol: 'TVC:UKOIL', label: 'UKOIL', name: 'Brent Crude Oil', group: 'forex', typeLabel: 'commodity', exchange: 'TVC' },
  { tvSymbol: 'TVC:PLATINUM', label: 'XPTUSD', name: 'Platinum', group: 'forex', typeLabel: 'commodity', exchange: 'TVC' },
  { tvSymbol: 'TVC:COPPER', label: 'COPPER', name: 'Copper', group: 'forex', typeLabel: 'commodity', exchange: 'TVC' },
  { tvSymbol: 'MCX:GOLD', label: 'GOLD', name: 'Gold MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },
  { tvSymbol: 'MCX:GOLDM', label: 'GOLDM', name: 'Gold Mini MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },
  { tvSymbol: 'MCX:SILVER', label: 'SILVER', name: 'Silver MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },
  { tvSymbol: 'MCX:SILVERM', label: 'SILVERM', name: 'Silver Mini MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },
  { tvSymbol: 'MCX:CRUDEOIL', label: 'CRUDEOIL', name: 'Crude Oil MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },
  { tvSymbol: 'MCX:CRUDEOILM', label: 'CRUDEOILM', name: 'Crude Oil Mini MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },
  { tvSymbol: 'MCX:NATURALGAS', label: 'NATURALGAS', name: 'Natural Gas MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },
  { tvSymbol: 'MCX:COPPER', label: 'COPPER', name: 'Copper MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },
  { tvSymbol: 'MCX:ZINC', label: 'ZINC', name: 'Zinc MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },
  { tvSymbol: 'MCX:ALUMINIUM', label: 'ALUMINIUM', name: 'Aluminium MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },
  { tvSymbol: 'MCX:NICKEL', label: 'NICKEL', name: 'Nickel MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },
  { tvSymbol: 'MCX:LEAD', label: 'LEAD', name: 'Lead MCX', group: 'commodity', typeLabel: 'commodity', exchange: 'MCX' },

  /* Forex */
  { tvSymbol: 'FX_IDC:EURUSD', label: 'EURUSD', name: 'Euro / U.S. Dollar', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:GBPUSD', label: 'GBPUSD', name: 'British Pound / U.S. Dollar', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:USDJPY', label: 'USDJPY', name: 'U.S. Dollar / Yen', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:USDCHF', label: 'USDCHF', name: 'U.S. Dollar / Swiss Franc', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:AUDUSD', label: 'AUDUSD', name: 'Australian Dollar / U.S. Dollar', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:USDCAD', label: 'USDCAD', name: 'U.S. Dollar / Canadian Dollar', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:NZDUSD', label: 'NZDUSD', name: 'New Zealand Dollar / U.S. Dollar', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:EURGBP', label: 'EURGBP', name: 'Euro / Pound', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:EURJPY', label: 'EURJPY', name: 'Euro / Yen', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:GBPJPY', label: 'GBPJPY', name: 'Pound / Yen', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:USDINR', label: 'USDINR', name: 'U.S. Dollar / Indian Rupee', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:EURINR', label: 'EURINR', name: 'Euro / Indian Rupee', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:GBPINR', label: 'GBPINR', name: 'Pound / Indian Rupee', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },
  { tvSymbol: 'FX_IDC:JPYINR', label: 'JPYINR', name: 'Yen / Indian Rupee', group: 'forex', typeLabel: 'forex', exchange: 'FX_IDC' },

  /* Crypto */
  { tvSymbol: 'BINANCE:BTCUSDT', label: 'BTCUSDT', name: 'Bitcoin / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BINANCE:ETHUSDT', label: 'ETHUSDT', name: 'Ethereum / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BINANCE:SOLUSDT', label: 'SOLUSDT', name: 'Solana / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BINANCE:BNBUSDT', label: 'BNBUSDT', name: 'BNB / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BINANCE:XRPUSDT', label: 'XRPUSDT', name: 'XRP / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BINANCE:DOGEUSDT', label: 'DOGEUSDT', name: 'Dogecoin / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BINANCE:ADAUSDT', label: 'ADAUSDT', name: 'Cardano / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BINANCE:AVAXUSDT', label: 'AVAXUSDT', name: 'Avalanche / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BINANCE:DOTUSDT', label: 'DOTUSDT', name: 'Polkadot / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BINANCE:MATICUSDT', label: 'MATICUSDT', name: 'Polygon / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BINANCE:LINKUSDT', label: 'LINKUSDT', name: 'Chainlink / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BINANCE:LTCUSDT', label: 'LTCUSDT', name: 'Litecoin / Tether', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BINANCE' },
  { tvSymbol: 'BITSTAMP:BTCUSD', label: 'BTCUSD', name: 'Bitcoin / U.S. Dollar', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BITSTAMP' },
  { tvSymbol: 'BITSTAMP:ETHUSD', label: 'ETHUSD', name: 'Ethereum / U.S. Dollar', group: 'crypto', typeLabel: 'spot crypto', exchange: 'BITSTAMP' },

  /* Global indices */
  { tvSymbol: 'TVC:SPX', label: 'SPX', name: 'S&P 500', group: 'indices', typeLabel: 'index', exchange: 'TVC' },
  { tvSymbol: 'TVC:NDX', label: 'NDX', name: 'Nasdaq 100', group: 'indices', typeLabel: 'index', exchange: 'TVC' },
  { tvSymbol: 'TVC:DJI', label: 'DJI', name: 'Dow Jones Industrial Average', group: 'indices', typeLabel: 'index', exchange: 'TVC' },
  { tvSymbol: 'TVC:DXY', label: 'DXY', name: 'U.S. Dollar Index', group: 'indices', typeLabel: 'index', exchange: 'TVC' },
  { tvSymbol: 'TVC:VIX', label: 'VIX', name: 'CBOE Volatility Index', group: 'indices', typeLabel: 'index', exchange: 'TVC' },
  { tvSymbol: 'FOREXCOM:UK100', label: 'UK100', name: 'FTSE 100', group: 'indices', typeLabel: 'index', exchange: 'FOREXCOM' },
  { tvSymbol: 'FOREXCOM:GER40', label: 'GER40', name: 'DAX 40', group: 'indices', typeLabel: 'index', exchange: 'FOREXCOM' },
  { tvSymbol: 'FOREXCOM:JPN225', label: 'JPN225', name: 'Nikkei 225', group: 'indices', typeLabel: 'index', exchange: 'FOREXCOM' },
];

/** Synthetic option / future search rows for F&O underlyings (chart opens the underlying). */
function fnoDerivativeHits(): TerminalSymbolHit[] {
  const out: TerminalSymbolHit[] = [];
  for (const inst of FNO_UNIVERSE) {
    const tv = toTradingViewSymbol(inst.symbol, inst.type);
    const exchange = inst.type === 'index' && (inst.symbol === 'SENSEX' || inst.symbol === 'BANKEX') ? 'BSE' : 'NSE';
    out.push({
      tvSymbol: tv,
      label: `${inst.symbol}1!`,
      name: `${inst.name} Continuous Futures`,
      group: 'futures',
      typeLabel: 'futures',
      exchange,
      isFno: true,
    });
    out.push({
      tvSymbol: tv,
      label: `${inst.symbol} OPT`,
      name: `${inst.name} Options · CE / PE`,
      group: 'options',
      typeLabel: 'options',
      exchange,
      isFno: true,
    });
  }
  return out;
}

let cached: TerminalSymbolHit[] | null = null;

export function terminalSymbolCatalog(): TerminalSymbolHit[] {
  if (cached) return cached;

  const out: TerminalSymbolHit[] = [];
  const seen = new Set<string>();

  const push = (hit: TerminalSymbolHit, dedupeKey?: string) => {
    const key = dedupeKey ?? `${hit.group}:${hit.tvSymbol}:${hit.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(hit);
  };

  // Global + commodities first so empty browse feels world-class
  for (const g of GLOBAL_HITS) push(g, `g:${g.tvSymbol}`);

  // Indian indices
  for (const inst of FNO_INDICES) {
    const tv = toTradingViewSymbol(inst.symbol, 'index');
    push({
      tvSymbol: tv,
      label: inst.symbol,
      name: inst.name.includes('Index') ? inst.name : `${inst.name} Index`,
      group: 'indices',
      typeLabel: 'index',
      exchange: tv.startsWith('BSE:') ? 'BSE' : 'NSE',
      isFno: true,
    }, `idx:${tv}`);
  }

  // F&O cash underlyings (stocks)
  for (const inst of FNO_STOCKS_ALL) {
    const tv = toTradingViewSymbol(inst.symbol, 'stock');
    push({
      tvSymbol: tv,
      label: inst.symbol,
      name: inst.name,
      group: 'stocks',
      typeLabel: 'stock · F&O',
      exchange: 'NSE',
      isFno: true,
    }, `eq:${tv}`);
  }

  // Futures + Options derivative catalogue rows
  for (const hit of fnoDerivativeHits()) {
    push(hit);
  }

  // Full NSE cash equities
  for (const row of NSE_EQUITY) {
    const tv = `NSE:${row.s}`;
    const fno = getFnoInstrument(row.s);
    if (fno?.type === 'index') continue;
    push({
      tvSymbol: tv,
      label: row.s,
      name: row.n,
      group: 'stocks',
      typeLabel: fno ? 'stock · F&O' : 'stock',
      exchange: 'NSE',
      isFno: Boolean(fno),
    }, `eq:${tv}`);
  }

  // Full BSE cash equities
  for (const row of BSE_EQUITY) {
    const tv = `BSE:${row.s}`;
    push({
      tvSymbol: tv,
      label: row.s,
      name: row.n,
      group: 'stocks',
      typeLabel: 'stock',
      exchange: 'BSE',
      isFno: false,
    }, `eq:${tv}`);
  }

  cached = out;
  return out;
}

function categoryMatch(hit: TerminalSymbolHit, category: TerminalSymbolCategory): boolean {
  if (category === 'all') return true;
  if (category === 'stocks') return hit.group === 'stocks' || hit.group === 'stock';
  if (category === 'indices') return hit.group === 'indices' || hit.group === 'index';
  if (category === 'forex') return hit.group === 'forex' || hit.group === 'fx' || hit.group === 'commodity';
  if (category === 'crypto') return hit.group === 'crypto';
  if (category === 'futures') return hit.group === 'futures' || hit.exchange === 'MCX' || hit.group === 'commodity';
  if (category === 'options') return hit.group === 'options';
  if (category === 'bonds' || category === 'economy') return false;
  return true;
}

export function searchTerminalSymbols(
  query: string,
  limit = 40,
  category: TerminalSymbolCategory = 'all',
): TerminalSymbolHit[] {
  const q = query.trim().toUpperCase().replace(/\s+/g, '');
  const qLoose = query.trim().toUpperCase();
  const all = terminalSymbolCatalog().filter((h) => categoryMatch(h, category));

  if (!q) {
    // Prefer popular globals + indices when browsing empty
    const preferred = all.filter(
      (h) =>
        h.group === 'forex' ||
        h.group === 'crypto' ||
        h.group === 'indices' ||
        h.group === 'index' ||
        h.isFno,
    );
    const rest = all.filter((h) => !preferred.includes(h));
    return [...preferred, ...rest].slice(0, limit);
  }

  const scored = all
    .map((hit) => {
      const label = hit.label.toUpperCase().replace(/\s+/g, '');
      const name = hit.name.toUpperCase();
      const tv = hit.tvSymbol.toUpperCase();
      let score = 0;
      if (label === q || hit.label.toUpperCase() === qLoose) score = 100;
      else if (label.startsWith(q)) score = 88;
      else if (label.includes(q)) score = 62;
      else if (tv.includes(q)) score = 48;
      else if (name.includes(qLoose) || name.includes(q)) score = 28;
      else if (hit.exchange.toUpperCase().includes(q)) score = 12;
      else return null;
      // Boost exact F&O / popular names
      if (hit.isFno) score += 4;
      if (hit.group === 'indices' || hit.group === 'index') score += 3;
      return { hit, score };
    })
    .filter((x): x is { hit: TerminalSymbolHit; score: number } => Boolean(x))
    .sort((a, b) => b.score - a.score || a.hit.label.localeCompare(b.hit.label));

  return scored.slice(0, limit).map((x) => x.hit);
}

export function terminalCategoryCounts(): Record<TerminalSymbolCategory, number> {
  const all = terminalSymbolCatalog();
  const counts: Record<TerminalSymbolCategory, number> = {
    all: all.length,
    stocks: 0,
    futures: 0,
    forex: 0,
    crypto: 0,
    indices: 0,
    options: 0,
    bonds: 0,
    economy: 0,
  };
  for (const h of all) {
    if (h.group === 'stocks' || h.group === 'stock') counts.stocks += 1;
    else if (h.group === 'futures' || h.exchange === 'MCX' || h.group === 'commodity') counts.futures += 1;
    else if (h.group === 'forex' || h.group === 'fx') counts.forex += 1;
    else if (h.group === 'crypto') counts.crypto += 1;
    else if (h.group === 'indices' || h.group === 'index') counts.indices += 1;
    else if (h.group === 'options') counts.options += 1;
  }
  return counts;
}
