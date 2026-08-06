import type { MarketItem } from './paperTradingEngine';
import { tickGlobalPaperQuote } from './paperTradingGlobalQuotes';
import { getJournalSymbolSelection } from './equitySymbolService';
import { fetchMarketHealth, fetchMarketQuotes, type MarketQuoteDto } from './marketApiService';
import { subscribeLiveSymbols } from './marketTickStream';
import { getMarketConnectionState } from './marketConnection';
import { serverOfflineMessage } from '../constants/brandLabels';
import { applyStreamQuotes, getLiveQuote } from './symbolLiveService';
import {
  CORE_GLOBAL_LIVE_SYMBOLS,
  GLOBAL_SYMBOL_ALIASES,
  toGlobalLiveSymbol,
} from '../data/coreGlobalLiveSymbols';
import { ensureSiteWideLiveFeed } from './siteWideLiveFeed';

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

/** Map UI / watchlist symbols → TradingView API tickers. */
const API_ALIAS: Record<string, string> = { ...GLOBAL_SYMBOL_ALIASES };

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
  const raw = symbol.trim().toUpperCase();
  if (!raw) return null;
  return (
    equityQuoteCache.get(raw) ??
    equityQuoteCache.get(toApiSymbol(raw)) ??
    equityQuoteCache.get(raw.replace('/', '')) ??
    null
  );
}

/** Normalize journal/paper symbols to API-friendly tickers. */
export function toApiSymbol(symbol: string): string {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return '';
  const global = toGlobalLiveSymbol(raw);
  if (global && (API_ALIAS[raw] || API_ALIAS[global] || CORE_GLOBAL_LIVE_SYMBOLS.includes(global))) {
    return global;
  }
  if (API_ALIAS[raw]) return API_ALIAS[raw];
  const noslash = raw.replace(/\s+/g, '');
  if (API_ALIAS[noslash]) return API_ALIAS[noslash];
  // BTC/USDT → try BTCUSDT then BTC
  if (noslash.includes('/')) {
    const compact = noslash.replace(/\//g, '');
    if (API_ALIAS[compact]) return API_ALIAS[compact];
    if (compact.endsWith('USDT')) return compact.slice(0, -4) || compact;
    if (compact.endsWith('USD') && compact.length > 3) return compact.slice(0, -3) || compact;
  }
  return noslash.replace(/\//g, '');
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

function cacheQuote(q: MarketQuoteDto, aliases: string[] = []): void {
  const sym = q.symbol.trim().toUpperCase();
  const row = { ...q, symbol: sym };
  equityQuoteCache.set(sym, row);
  for (const a of aliases) {
    const key = a.trim().toUpperCase();
    if (key) equityQuoteCache.set(key, { ...row, symbol: key });
  }
}

function liveRowFor(symbol: string): MarketQuoteDto | null {
  const sym = symbol.trim().toUpperCase();
  const api = toApiSymbol(sym);
  const fromCache = getPaperEquityLiveQuote(sym) || getPaperEquityLiveQuote(api);
  if (fromCache?.price) return fromCache;
  const live = getLiveQuote(sym) || getLiveQuote(api);
  if (!live?.price) return null;
  return {
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
  };
}

/** Prefer TradingView live; only mock if tape cold. */
export function applyLiveQuoteToMarketItem(item: MarketItem): MarketItem {
  const live = liveRowFor(item.symbol);
  if (live?.price) {
    return {
      ...item,
      price: live.price,
      change: live.change,
      changePercent: live.changePercent,
      open: live.open || item.open,
      high: live.high || item.high,
      low: live.low || item.low,
      volume: live.volume,
    };
  }

  // Only simulate when no live tape at all (forex pairs without TV map, etc.).
  if (item.assetMarket === 'crypto' || item.assetMarket === 'forex') {
    // Keep last paper price steady briefly instead of random-walking over TV
    // until the first websocket/REST quote lands.
    if (item.price > 0) return item;
    return tickGlobalPaperQuote(item);
  }

  const exchange =
    item.exchange === 'CRYPTO' || item.exchange === 'FX' ? undefined : item.exchange;
  const sel = getJournalSymbolSelection(item.symbol, exchange);
  if (!sel?.price) return item;
  return selectionToMarketItem(sel, item);
}

async function fetchQuotesWithRetry(symbols: string[]): Promise<MarketQuoteDto[]> {
  if (!symbols.length) return [];
  let res = await fetchMarketQuotes(symbols);
  let quotes = res?.quotes?.filter((q) => q?.price) ?? [];
  if (quotes.length < Math.min(symbols.length, 1)) {
    await new Promise((r) => setTimeout(r, 700));
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
  if (import.meta.env.VITE_PAPER_TRADING_LIVE === 'false') {
    return {
      mode: 'offline',
      liveSymbolCount: 0,
      serverOk: false,
      message: 'Paper live feed disabled',
      updatedAt: new Date().toISOString(),
    };
  }

  ensureSiteWideLiveFeed();
  registerPaperTradingSymbols([...watchlistSymbols, ...CORE_GLOBAL_LIVE_SYMBOLS]);
  const originals = [...new Set([...watchlistSymbols, ...registeredSymbols, ...CORE_GLOBAL_LIVE_SYMBOLS])]
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  // Build API list + reverse alias map so BTC quote updates BTC/USDT rows too.
  const apiToOriginals = new Map<string, Set<string>>();
  for (const orig of originals) {
    const api = toApiSymbol(orig);
    if (!api) continue;
    if (!apiToOriginals.has(api)) apiToOriginals.set(api, new Set());
    apiToOriginals.get(api)!.add(orig);
    apiToOriginals.get(api)!.add(api);
  }
  const toFetch = [...apiToOriginals.keys()].slice(0, 40);

  subscribeLiveSymbols(toFetch);

  let serverOk = false;
  try {
    const health = await fetchMarketHealth();
    serverOk = Boolean(health?.status);
  } catch {
    serverOk = false;
  }

  // Always try quotes — health can time out on Render cold start while quotes still work.
  const quotes = await fetchQuotesWithRetry(toFetch);
  for (const q of quotes) {
    const aliases = [...(apiToOriginals.get(q.symbol.toUpperCase()) ?? new Set([q.symbol]))];
    cacheQuote(q, aliases);
  }

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

  for (const api of toFetch) {
    const live = getLiveQuote(api);
    if (live?.price) {
      cacheQuote(
        {
          symbol: api,
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
        },
        [...(apiToOriginals.get(api) ?? [])],
      );
    }
  }

  const totalLive = originals.filter((s) => Boolean(liveRowFor(s)?.price)).length;
  const ws = getMarketConnectionState().streamActive;
  const ok = serverOk || totalLive > 0;

  return {
    mode: totalLive > 0 ? 'live' : 'offline',
    liveSymbolCount: totalLive,
    serverOk: ok,
    message:
      totalLive > 0
        ? `Live TradingView · ${totalLive} symbol${totalLive === 1 ? '' : 's'}`
        : !ok
          ? serverOfflineMessage()
          : ws
            ? 'WebSocket connected — waiting for ticks'
            : 'Server OK — retrying live tape…',
    updatedAt: new Date().toISOString(),
  };
}
