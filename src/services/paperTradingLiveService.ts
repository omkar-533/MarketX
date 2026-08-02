import type { MarketItem } from './paperTradingEngine';
import { tickGlobalPaperQuote } from './paperTradingGlobalQuotes';
import { getJournalSymbolSelection } from './equitySymbolService';
import { fetchMarketHealth, fetchMarketQuotes, type MarketQuoteDto } from './marketApiService';
import { subscribeLiveSymbols } from './marketTickStream';
import { getMarketConnectionState } from './marketConnection';
import { serverOfflineMessage } from '../constants/brandLabels';
import { applyStreamQuotes, getLiveQuote } from './symbolLiveService';

export type PaperFeedMode = 'live' | 'offline' | 'loading';

export interface PaperQuoteFeedStatus {
  mode: PaperFeedMode;
  liveSymbolCount: number;
  serverOk: boolean;
  message: string;
  updatedAt: string;
}

const equityQuoteCache = new Map<string, MarketQuoteDto>();
const registeredSymbols = new Set<string>();

/** Symbols that TradingView can price live (not local sim). */
const TV_GLOBAL_SYMBOLS = new Set(['BTC', 'ETH', 'BITCOIN', 'ETHEREUM', 'BTCUSDT', 'ETHUSDT']);

export function isPaperTradingLiveMode(): boolean {
  return import.meta.env.VITE_PAPER_TRADING_LIVE !== 'false';
}

export function registerPaperTradingSymbols(symbols: string[]): void {
  for (const s of symbols) {
    const sym = s.trim().toUpperCase();
    if (sym) registeredSymbols.add(sym);
  }
}

export function getPaperEquityLiveQuote(symbol: string): MarketQuoteDto | null {
  return equityQuoteCache.get(symbol.trim().toUpperCase()) ?? null;
}

function selectionToMarketItem(
  sel: NonNullable<ReturnType<typeof getJournalSymbolSelection>>,
  item: MarketItem,
): MarketItem {
  return {
    ...item,
    symbol: sel.symbol,
    name: sel.name,
    price: sel.price,
    change: sel.change,
    changePercent: sel.changePercent,
    open: sel.price,
    high: sel.price,
    low: sel.price,
    volume: sel.volume ?? 0,
    type: sel.type === 'index' ? 'INDEX' : 'STOCK',
    exchange: sel.exchange === 'INDEX' || sel.exchange === 'FNO' ? 'NSE' : sel.exchange,
    isFno: sel.isFno,
    lotSize: sel.lotSize,
  };
}

function cacheQuote(q: MarketQuoteDto): void {
  const sym = q.symbol.trim().toUpperCase();
  equityQuoteCache.set(sym, { ...q, symbol: sym });
}

export function applyLiveQuoteToMarketItem(item: MarketItem): MarketItem {
  const sym = item.symbol.trim().toUpperCase();

  // Crypto/forex: prefer live TV tape when available (BTC/ETH), else local sim tick.
  if (item.assetMarket === 'crypto' || item.assetMarket === 'forex') {
    const live = getLiveQuote(sym) || getPaperEquityLiveQuote(sym);
    if (live?.price) {
      return {
        ...item,
        price: live.price,
        change: live.change,
        changePercent: live.changePercent,
        open: live.open,
        high: live.high,
        low: live.low,
        volume: live.volume,
      };
    }
    return tickGlobalPaperQuote(item);
  }

  const fno = getLiveQuote(sym);
  if (fno?.price) {
    return {
      ...item,
      price: fno.price,
      change: fno.change,
      changePercent: fno.changePercent,
      open: fno.open,
      high: fno.high,
      low: fno.low,
      volume: fno.volume,
    };
  }

  const eq = getPaperEquityLiveQuote(sym);
  if (eq?.price) {
    return {
      ...item,
      price: eq.price,
      change: eq.change,
      changePercent: eq.changePercent,
      open: eq.open,
      high: eq.high,
      low: eq.low,
      volume: eq.volume,
    };
  }

  const sel = getJournalSymbolSelection(item.symbol, item.exchange);
  if (!sel?.price) return item;
  return selectionToMarketItem(sel, item);
}

async function fetchQuotesWithRetry(symbols: string[]): Promise<MarketQuoteDto[]> {
  if (!symbols.length) return [];
  let res = await fetchMarketQuotes(symbols);
  let quotes = res?.quotes?.filter((q) => q?.price) ?? [];
  if (quotes.length < symbols.length) {
    await new Promise((r) => setTimeout(r, 900));
    res = await fetchMarketQuotes(symbols);
    const again = res?.quotes?.filter((q) => q?.price) ?? [];
    const map = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
    for (const q of again) map.set(q.symbol.toUpperCase(), q);
    quotes = [...map.values()];
  }
  return quotes;
}

export async function refreshPaperTradingLiveQuotes(
  watchlistSymbols: string[],
): Promise<PaperQuoteFeedStatus> {
  registerPaperTradingSymbols(watchlistSymbols);
  const toFetch = [...new Set([...watchlistSymbols, ...registeredSymbols])]
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  subscribeLiveSymbols(toFetch);

  let serverOk = false;
  try {
    const health = await fetchMarketHealth();
    serverOk = Boolean(health?.status);
  } catch {
    serverOk = false;
  }

  if (!serverOk) {
    return {
      mode: 'offline',
      liveSymbolCount: 0,
      serverOk: false,
      message: serverOfflineMessage(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Always REST-refresh — do not rely only on WS (quiet / closed sessions).
  const quotes = await fetchQuotesWithRetry(toFetch.slice(0, 40));
  for (const q of quotes) cacheQuote(q);

  if (quotes.length) {
    applyStreamQuotes(
      quotes.map((q) => ({
        symbol: q.symbol,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        open: q.open,
        high: q.high,
        low: q.low,
        prevClose: q.prevClose,
        volume: q.volume,
        source: q.source || 'tradingview',
        lastUpdated: q.lastUpdated,
      })),
    );
  }

  for (const sym of toFetch) {
    const live = getLiveQuote(sym);
    if (live?.price) {
      cacheQuote({
        symbol: sym,
        price: live.price,
        change: live.change,
        changePercent: live.changePercent,
        open: live.open,
        high: live.high,
        low: live.low,
        prevClose: live.prevClose,
        volume: live.volume,
        source: 'tradingview',
        lastUpdated: live.lastUpdated,
      });
    }
  }

  const totalLive = toFetch.filter((s) => {
    const q = getLiveQuote(s) || equityQuoteCache.get(s);
    return Boolean(q?.price);
  }).length;
  const ws = getMarketConnectionState().streamActive;

  return {
    mode: totalLive > 0 ? 'live' : 'offline',
    liveSymbolCount: totalLive,
    serverOk: true,
    message:
      totalLive > 0
        ? `Live · ${totalLive} symbol${totalLive === 1 ? '' : 's'}`
        : ws
          ? 'WebSocket connected — waiting for ticks'
          : 'Server OK — fetching live tape…',
    updatedAt: new Date().toISOString(),
  };
}

export function isTvPricedGlobalSymbol(symbol: string): boolean {
  return TV_GLOBAL_SYMBOLS.has(symbol.trim().toUpperCase());
}
