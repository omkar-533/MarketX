import type { IndexData, StockData } from '../data/marketData';
import {
  FNO_INDICES,
  FNO_STOCKS,
  FNO_UNIVERSE,
  CORE_LIVE_SYMBOLS,
  getDefaultIv,
  getFnoInstrument,
  getStrikeIntervalForSpot,
  type FnoInstrument,
  type FnoInstrumentType,
} from '../data/fnoUniverse';
import {
  fetchMarketHealth,
  fetchMarketQuotes,
  fetchMarketTicks,
  type MarketTickDto,
} from './marketApiService';
import {
  getMarketConnectionState,
  isMarketStreamActive,
  refreshMarketConnection,
  resetMarketConnectionCache,
} from './marketConnection';
import { serverOfflineMessage, serverUnreachableMessage } from '../constants/brandLabels';
import { API_SERVER_READY_EVENT, FYERS_MARKET_LIVE_EVENT } from './apiAutoConnect';
import { setMarketLiveError, setMarketLiveSnapshot, setMarketProvider } from './marketLiveStore';

function isLiveFeedActive(): boolean {
  return getMarketConnectionState().serverOk;
}

export interface LiveSymbolQuote {
  symbol: string;
  name: string;
  type: FnoInstrumentType;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  iv: number;
  lotSize: number;
  strikeInterval: number;
  marketCap?: number;
  pe?: number;
  rsi?: number;
  vwap?: number;
  lastUpdated: string;
  dataSource: 'live';
}

let liveCache: LiveSymbolQuote[] = [];
const extraLiveCache = new Map<string, LiveSymbolQuote>();
let refreshInFlight: Promise<LiveSymbolQuote[]> | null = null;

const PRIORITY_SYMBOLS = CORE_LIVE_SYMBOLS;

function normalizeQuoteChange(q: {
  price: number;
  change: number;
  changePercent: number;
  prevClose: number;
}) {
  const prevClose = q.prevClose > 0 ? q.prevClose : q.price;
  if (
    q.prevClose > 0 &&
    Math.abs(q.price - q.prevClose) > 0.01 &&
    q.change === 0 &&
    q.changePercent === 0
  ) {
    const change = Math.round((q.price - q.prevClose) * 100) / 100;
    const changePercent = Math.round((change / q.prevClose) * 10000) / 100;
    return { ...q, change, changePercent, prevClose };
  }
  return { ...q, prevClose };
}

function quoteToLive(inst: FnoInstrument, q: {
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  lastUpdated: string;
}): LiveSymbolQuote {
  const n = normalizeQuoteChange(q);
  const interval = getStrikeIntervalForSpot(q.price, inst);
  const iv =
    inst.type === 'stock'
      ? Math.round((18 + Math.abs(q.changePercent) * 2 + (inst.sector === 'Banking' ? 4 : 0)) * 10) / 10
      : getDefaultIv(inst);

  return {
    symbol: inst.symbol,
    name: inst.name,
    type: inst.type,
    sector: inst.sector,
    price: n.price,
    change: n.change,
    changePercent: n.changePercent,
    open: q.open,
    high: q.high,
    low: q.low,
    prevClose: n.prevClose,
    volume: q.volume,
    iv,
    lotSize: inst.lotSize,
    strikeInterval: interval,
    vwap: Math.round((q.high + q.low + q.price) / 3 * 100) / 100,
    rsi: 50,
    lastUpdated: q.lastUpdated,
    dataSource: 'live',
  };
}

function buildIndicesStocksFromQuotes(quotes: LiveSymbolQuote[]): {
  indices: IndexData[];
  stocks: StockData[];
} {
  const indices: IndexData[] = [];
  const stocks: StockData[] = [];

  for (const q of quotes) {
    if (q.type === 'index') {
      indices.push({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        open: q.open,
        high: q.high,
        low: q.low,
        prevClose: q.prevClose,
        volume: q.volume,
        value: Math.round(q.volume / 10000),
      });
    } else {
      stocks.push({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume,
        marketCap: q.marketCap ?? 0,
        sector: q.sector,
        pe: q.pe ?? 0,
        high: q.high,
        low: q.low,
        open: q.open,
        prevClose: q.prevClose,
        delivery: 0,
        vwap: q.vwap ?? q.price,
        rsi: q.rsi ?? 50,
      });
    }
  }

  return { indices, stocks };
}

function mergeQuoteMap(
  ticks: MarketTickDto[] | null,
  rest: { symbol: string; price: number; change: number; changePercent: number; open: number; high: number; low: number; prevClose: number; volume: number; lastUpdated: string }[] | undefined,
): Map<string, MarketTickDto> {
  const map = new Map<string, MarketTickDto>();
  for (const q of ticks ?? []) map.set(q.symbol, q);
  for (const q of rest ?? []) map.set(q.symbol, q);
  return map;
}

function buildCacheFromQuoteMap(quoteMap: Map<string, MarketTickDto>): LiveSymbolQuote[] {
  const out: LiveSymbolQuote[] = [];
  for (const inst of FNO_UNIVERSE) {
    const live = quoteMap.get(inst.symbol);
    if (live) {
      out.push(quoteToLive(inst, live));
      continue;
    }
    const prev = liveCache.find((q) => q.symbol === inst.symbol);
    if (prev) out.push(prev);
  }
  return out;
}

function publishLiveSnapshot(liveQuotes: LiveSymbolQuote[], errorMsg = '') {
  const { indices, stocks } = buildIndicesStocksFromQuotes(liveQuotes);
  setMarketLiveSnapshot({
    indices,
    stocks,
    liveCount: liveQuotes.length,
    error: errorMsg,
  });
}

function quoteFromTick(q: MarketTickDto): LiveSymbolQuote {
  const inst = FNO_UNIVERSE.find((i) => i.symbol === q.symbol) ?? getFnoInstrument(q.symbol);
  if (inst) return quoteToLive(inst, q);
  const n = normalizeQuoteChange(q);
  return {
    symbol: q.symbol,
    name: q.symbol,
    type: 'stock',
    sector: 'Equity',
    price: n.price,
    change: n.change,
    changePercent: n.changePercent,
    open: q.open,
    high: q.high,
    low: q.low,
    prevClose: n.prevClose,
    volume: q.volume,
    iv: 22,
    lotSize: 1,
    strikeInterval: 50,
    vwap: q.price,
    lastUpdated: q.lastUpdated,
    dataSource: 'live',
  };
}

export function applyStreamQuotes(quotes: MarketTickDto[]): void {
  if (!quotes.length) return;
  const map = new Map(liveCache.map((item) => [item.symbol, item]));
  for (const q of quotes) {
    const row = quoteFromTick(q);
    const inst = FNO_UNIVERSE.find((i) => i.symbol === q.symbol);
    if (inst) map.set(q.symbol, row);
    else extraLiveCache.set(q.symbol, row);
  }
  liveCache = [...map.values()];
  publishLiveSnapshot([...liveCache, ...extraLiveCache.values()]);
}

async function refreshFromLiveApi(): Promise<LiveSymbolQuote[]> {
  const unique = [...new Set(PRIORITY_SYMBOLS)];
  const conn = getMarketConnectionState();

  if (conn.streamActive) {
    const hasLive = liveCache.length > 0 || extraLiveCache.size > 0;
    if (hasLive) {
      publishLiveSnapshot([...liveCache, ...extraLiveCache.values()]);
      return liveCache;
    }
    const ticks = await fetchMarketTicks(unique);
    const quoteMap = mergeQuoteMap(ticks, undefined);
    liveCache = buildCacheFromQuoteMap(quoteMap);
    publishLiveSnapshot(liveCache);
    return liveCache;
  }

  const ticks = await fetchMarketTicks(unique);
  const quoteMap = mergeQuoteMap(ticks, undefined);
  if (quoteMap.size >= unique.length * 0.5) {
    liveCache = buildCacheFromQuoteMap(quoteMap);
    publishLiveSnapshot(liveCache);
    return liveCache;
  }

  const res = await fetchMarketQuotes(unique);
  const merged = mergeQuoteMap(ticks, res?.quotes);
  liveCache = buildCacheFromQuoteMap(merged);
  publishLiveSnapshot(
    liveCache,
    res?.errors?.length ? `${res.errors.length} symbols delayed` : '',
  );
  return liveCache;
}

export async function refreshFnoLiveQuotesAsync(): Promise<LiveSymbolQuote[]> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      await refreshMarketConnection();
      const health = await fetchMarketHealth();
      if (!health?.status) {
        setMarketLiveError(serverOfflineMessage());
        return liveCache;
      }
      setMarketProvider(health.provider || 'fyers');
      const hasLive = liveCache.length > 0;
      if (isLiveFeedActive() && isMarketStreamActive() && hasLive) {
        publishLiveSnapshot(liveCache);
        return liveCache;
      }
      return await refreshFromLiveApi();
    } catch {
      setMarketLiveError(serverUnreachableMessage());
      return liveCache;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export function refreshFnoLiveQuotes(): LiveSymbolQuote[] {
  void import('./marketTickStream').then((m) => {
    m.subscribeLiveSymbols(PRIORITY_SYMBOLS);
  });
  if (!isMarketStreamActive() && !liveCache.length) {
    void refreshFnoLiveQuotesAsync();
  }
  return getFnoLiveQuotes();
}

export function getFnoLiveQuotes(): LiveSymbolQuote[] {
  return liveCache.length ? liveCache : [];
}

export function getLiveQuote(symbol: string): LiveSymbolQuote | null {
  const sym = symbol.trim().toUpperCase();
  return liveCache.find((q) => q.symbol === sym) ?? extraLiveCache.get(sym) ?? null;
}

export function searchFnoSymbols(query: string, type?: FnoInstrumentType): LiveSymbolQuote[] {
  const q = query.trim().toLowerCase();
  let list = getFnoLiveQuotes();
  if (type) list = list.filter((i) => i.type === type);
  if (!q) return list;
  return list.filter(
    (i) =>
      i.symbol.toLowerCase().includes(q) ||
      i.name.toLowerCase().includes(q) ||
      i.sector.toLowerCase().includes(q),
  );
}

export function getSymbolMetaFromQuote(quote: LiveSymbolQuote) {
  return {
    label: quote.name,
    interval: quote.strikeInterval,
    lotSize: quote.lotSize,
    ivBase: quote.iv,
    type: quote.type,
    sector: quote.sector,
  };
}

let serverListenersBound = false;

export function bindLiveServerListeners(): void {
  if (serverListenersBound || typeof window === 'undefined') return;
  serverListenersBound = true;
  const onServerReady = () => {
    resetMarketConnectionCache();
    void refreshFnoLiveQuotesAsync();
  };
  window.addEventListener(API_SERVER_READY_EVENT, onServerReady);
  window.addEventListener(FYERS_MARKET_LIVE_EVENT, onServerReady);
}

bindLiveServerListeners();

export { FNO_INDICES, FNO_STOCKS, FNO_UNIVERSE };
