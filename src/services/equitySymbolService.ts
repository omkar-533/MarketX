import nseEquityData from '../data/nseEquity.json';
import bseEquityData from '../data/bseEquity.json';
import { getFnoInstrument } from '../data/fnoUniverse';
import { fetchMarketQuotes } from './marketApiService';
import { getPaperEquityLiveQuote } from './paperTradingLiveService';
import { getMarketConnectionState } from './marketConnection';
import { getFnoLiveQuotes, getLiveQuote, type LiveSymbolQuote } from './symbolLiveService';

export type ExchangeId = 'NSE' | 'BSE';
export type SymbolTab = 'all' | 'index' | 'nse' | 'bse' | 'fno';

export interface EquityListEntry {
  s: string;
  n: string;
  e: ExchangeId;
}

export interface JournalSymbolSelection {
  symbol: string;
  name: string;
  exchange: ExchangeId | 'INDEX' | 'FNO';
  type: 'index' | 'stock';
  price: number;
  change: number;
  changePercent: number;
  lotSize: number;
  sector: string;
  isFno: boolean;
  volume?: number;
}

const NSE_EQUITY = nseEquityData as EquityListEntry[];
const BSE_EQUITY = bseEquityData as EquityListEntry[];

const nseBySymbol = new Map(NSE_EQUITY.map((e) => [e.s, e]));
const bseBySymbol = new Map(BSE_EQUITY.map((e) => [e.s, e]));

const equityQuoteCache = new Map<string, JournalSymbolSelection>();

function fnoQuoteToSelection(q: LiveSymbolQuote): JournalSymbolSelection {
  return {
    symbol: q.symbol,
    name: q.name,
    exchange: q.type === 'index' ? 'INDEX' : 'FNO',
    type: q.type,
    price: q.price,
    change: q.change,
    changePercent: q.changePercent,
    lotSize: q.lotSize,
    sector: q.sector,
    isFno: q.type === 'stock',
    volume: q.volume,
  };
}

function quoteDtoToSelection(
  symbol: string,
  name: string,
  exchange: ExchangeId,
  q: {
    price: number;
    change: number;
    changePercent: number;
    volume: number;
  },
): JournalSymbolSelection {
  const fno = getFnoInstrument(symbol);
  return {
    symbol,
    name,
    exchange,
    type: 'stock',
    price: q.price,
    change: q.change,
    changePercent: q.changePercent,
    lotSize: fno?.lotSize ?? 1,
    sector: fno?.sector ?? 'Equity',
    isFno: Boolean(fno),
    volume: q.volume,
  };
}

function staticListing(entry?: EquityListEntry): JournalSymbolSelection | null {
  if (!entry) return null;
  return {
    symbol: entry.s,
    name: entry.n,
    exchange: entry.e,
    type: 'stock',
    price: 0,
    change: 0,
    changePercent: 0,
    lotSize: getFnoInstrument(entry.s)?.lotSize ?? 1,
    sector: getFnoInstrument(entry.s)?.sector ?? 'Equity',
    isFno: Boolean(getFnoInstrument(entry.s)),
  };
}

export function refreshMarketSymbols(): void {
  void getFnoLiveQuotes();
}

export async function refreshEquityQuotes(symbols: string[]): Promise<void> {
  if (!getMarketConnectionState().serverOk || !symbols.length) return;
  const res = await fetchMarketQuotes(symbols.slice(0, 40));
  for (const q of res?.quotes ?? []) {
    const entry = nseBySymbol.get(q.symbol) ?? bseBySymbol.get(q.symbol);
    equityQuoteCache.set(
      q.symbol,
      quoteDtoToSelection(q.symbol, entry?.n ?? q.symbol, entry?.e ?? 'NSE', q),
    );
  }
}

export function getJournalSymbolSelection(
  symbol: string,
  exchange?: ExchangeId | 'INDEX' | 'FNO',
): JournalSymbolSelection | null {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  const live = getLiveQuote(sym);
  if (live) return fnoQuoteToSelection(live);

  const cached = equityQuoteCache.get(sym);
  if (cached?.price) return cached;

  const eqLive = getPaperEquityLiveQuote(sym);
  if (eqLive) {
    const entry = nseBySymbol.get(sym) ?? bseBySymbol.get(sym);
    return {
      symbol: sym,
      name: entry?.n ?? sym,
      exchange: entry?.e ?? (exchange === 'BSE' ? 'BSE' : 'NSE'),
      type: 'stock',
      price: eqLive.price,
      change: eqLive.change,
      changePercent: eqLive.changePercent,
      lotSize: getFnoInstrument(sym)?.lotSize ?? 1,
      sector: getFnoInstrument(sym)?.sector ?? 'Equity',
      isFno: Boolean(getFnoInstrument(sym)),
      volume: eqLive.volume,
    };
  }

  const nseEntry = nseBySymbol.get(sym);
  if (nseEntry) return staticListing(nseEntry);
  const bseEntry = bseBySymbol.get(sym);
  if (bseEntry) return staticListing(bseEntry);

  return null;
}

export function searchJournalSymbols(
  query: string,
  tab: SymbolTab = 'all',
  limit = 80,
): JournalSymbolSelection[] {
  const q = query.trim().toLowerCase();
  const fnoQuotes = getFnoLiveQuotes();
  const results: JournalSymbolSelection[] = [];
  const seen = new Set<string>();

  const push = (item: JournalSymbolSelection) => {
    const key = `${item.exchange}:${item.symbol}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  const matches = (symbol: string, name: string) =>
    symbol.toLowerCase().includes(q) || name.toLowerCase().includes(q);

  if (!q) {
    if (tab === 'index' || tab === 'all') {
      for (const quote of fnoQuotes) {
        if (quote.type !== 'index') continue;
        push(fnoQuoteToSelection(quote));
      }
    }
    if (tab === 'fno' || tab === 'all') {
      for (const quote of fnoQuotes) {
        if (quote.type !== 'stock') continue;
        push(fnoQuoteToSelection(quote));
        if (results.length >= limit) return results;
      }
    }
    return results;
  }

  if (tab === 'all' || tab === 'index' || tab === 'fno') {
    for (const quote of fnoQuotes) {
      if (tab === 'index' && quote.type !== 'index') continue;
      if (tab === 'fno' && quote.type !== 'stock') continue;
      if (!matches(quote.symbol, quote.name)) continue;
      push(fnoQuoteToSelection(quote));
      if (results.length >= limit) return results;
    }
  }

  if (tab === 'all' || tab === 'nse') {
    for (const entry of NSE_EQUITY) {
      if (!matches(entry.s, entry.n)) continue;
      const live = getLiveQuote(entry.s) ?? equityQuoteCache.get(entry.s);
      if (live && 'dataSource' in live) push(fnoQuoteToSelection(live as LiveSymbolQuote));
      else if (live) push(live as JournalSymbolSelection);
      else {
        const row = staticListing(entry);
        if (row) push(row);
      }
      if (results.length >= limit) return results;
    }
  }

  if (tab === 'all' || tab === 'bse') {
    for (const entry of BSE_EQUITY) {
      if (!matches(entry.s, entry.n)) continue;
      const cached = equityQuoteCache.get(entry.s);
      if (cached?.price) push(cached);
      else {
        const row = staticListing(entry);
        if (row) push(row);
      }
      if (results.length >= limit) return results;
    }
  }

  return results;
}

export function getUniverseCounts() {
  return {
    nse: NSE_EQUITY.length,
    bse: BSE_EQUITY.length,
    fno: getFnoLiveQuotes().filter((x) => x.type === 'stock').length,
    indices: getFnoLiveQuotes().filter((x) => x.type === 'index').length,
    total: NSE_EQUITY.length + BSE_EQUITY.length,
  };
}

export { NSE_EQUITY, BSE_EQUITY };
