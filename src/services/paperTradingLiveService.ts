import type { MarketItem } from './paperTradingEngine';
import { tickGlobalPaperQuote } from './paperTradingGlobalQuotes';
import { getJournalSymbolSelection } from './equitySymbolService';
import { fetchMarketHealth, fetchMarketQuotes, type MarketQuoteDto } from './marketApiService';
import { subscribeLiveSymbols } from './marketTickStream';
import { getMarketConnectionState } from './marketConnection';
import { serverOfflineMessage } from '../constants/brandLabels';
import { getLiveQuote } from './symbolLiveService';

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

export function applyLiveQuoteToMarketItem(item: MarketItem): MarketItem {
  if (item.assetMarket === 'crypto' || item.assetMarket === 'forex') {
    return tickGlobalPaperQuote(item);
  }

  const fno = getLiveQuote(item.symbol);
  if (fno) {
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

  const eq = getPaperEquityLiveQuote(item.symbol);
  if (eq) {
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

export async function refreshPaperTradingLiveQuotes(
  watchlistSymbols: string[],
): Promise<PaperQuoteFeedStatus> {
  registerPaperTradingSymbols(watchlistSymbols);
  subscribeLiveSymbols([...watchlistSymbols, ...registeredSymbols]);

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

  const toFetch = [...new Set([...watchlistSymbols, ...registeredSymbols])]
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const missing = toFetch.filter((s) => !getLiveQuote(s));
  if (missing.length) {
    const res = await fetchMarketQuotes(missing.slice(0, 40));
    for (const q of res?.quotes ?? []) {
      equityQuoteCache.set(q.symbol, q);
    }
  }

  for (const sym of toFetch) {
    const live = getLiveQuote(sym);
    if (live) {
      equityQuoteCache.set(sym, {
        symbol: sym,
        price: live.price,
        change: live.change,
        changePercent: live.changePercent,
        open: live.open,
        high: live.high,
        low: live.low,
        prevClose: live.prevClose,
        volume: live.volume,
        source: 'fyers-ws',
        lastUpdated: live.lastUpdated,
      });
    }
  }

  const totalLive = toFetch.filter((s) => getLiveQuote(s) || equityQuoteCache.get(s)).length;
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
          : 'Server OK — subscribe symbols for ticks',
    updatedAt: new Date().toISOString(),
  };
}
