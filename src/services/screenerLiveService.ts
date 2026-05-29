import { serverOfflineMessage } from '../constants/brandLabels';
import type { StockData } from '../data/marketData';
import { FNO_STOCKS_ALL, type FnoInstrument } from '../data/fnoUniverse';
import {
  fetchFnoOiBatch,
  fetchMarketHealth,
  fetchMarketOhlc,
  type FnoOiSnapshot,
  type MarketQuoteDto,
} from './marketApiService';
import { getMarketConnectionState } from './marketConnection';
import { getMarketLiveState, setMarketProvider } from './marketLiveStore';
import { getMarketProviderLabel } from '../utils/marketProviderLabel';
import { subscribeLiveSymbols } from './marketTickStream';
import { getFnoLiveQuotes } from './symbolLiveService';
import type { ScreenerMarketRow } from './screenerDataService';
import { buildScreenerRow } from './screenerDataService';
import { barsFromOhlc, computeTechnicalsFromBars } from './screenerIndicators';
import type { BarHistory } from './screenerHistory';
import { setRealBarHistory } from './screenerHistory';

const OHLC_CONCURRENCY = 2;
const OHLC_TTL_MS = 10 * 60_000;
const OHLC_BATCH_MAX = 28;

export type ScreenerFeedMode = 'live' | 'offline' | 'mixed' | 'loading';

export interface ScreenerFeedStatus {
  mode: ScreenerFeedMode;
  liveCount: number;
  totalCount: number;
  serverOk: boolean;
  message: string;
  updatedAt: string;
  ohlcLoaded: number;
  oiLoaded: number;
}

const quoteCache = new Map<string, MarketQuoteDto>();
const ohlcCache = new Map<string, { bars: BarHistory; at: number }>();

let cachedRows: ScreenerMarketRow[] = [];
let feedStatus: ScreenerFeedStatus = {
  mode: 'loading',
  liveCount: 0,
  totalCount: 0,
  serverOk: false,
  message: 'Loading market data…',
  updatedAt: '',
  ohlcLoaded: 0,
  oiLoaded: 0,
};

const fnoOiCache = new Map<string, FnoOiSnapshot>();
const OI_ROTATE_SIZE = 35;
let oiRotateOffset = 0;

let refreshInFlight: Promise<ScreenerFeedStatus> | null = null;
let lastOhlcRefresh = 0;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeScreenerFeed(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getScreenerFeedStatus(): Readonly<ScreenerFeedStatus> {
  return feedStatus;
}

export function getCachedScreenerRows(): ScreenerMarketRow[] {
  return cachedRows;
}

function quoteToStock(inst: FnoInstrument, q: MarketQuoteDto): StockData {
  const vwap = (q.high + q.low + q.price) / 3;
  return {
    symbol: inst.symbol,
    name: inst.name,
    price: q.price,
    change: q.change,
    changePercent: q.changePercent,
    volume: q.volume,
    marketCap: Math.round(q.price * q.volume * 0.02),
    sector: inst.sector,
    pe: 0,
    high: q.high,
    low: q.low,
    open: q.open,
    prevClose: q.prevClose,
    delivery: 0,
    vwap: Math.round(vwap * 100) / 100,
    rsi: 50,
  };
}

function mergeStocksWithQuotes(symbols: string[]): { stocks: StockData[]; liveCount: number } {
  const instMap = new Map(FNO_STOCKS_ALL.map((i) => [i.symbol, i]));
  const stocks: StockData[] = [];
  let liveCount = 0;

  for (const sym of symbols) {
    const q = quoteCache.get(sym);
    const inst = instMap.get(sym);
    if (q && inst) {
      stocks.push(quoteToStock(inst, q));
      liveCount += 1;
      continue;
    }
    const live = getMarketLiveState().stocks.find((s) => s.symbol === sym);
    if (live?.price) {
      stocks.push(live);
      if (quoteCache.has(sym)) liveCount += 1;
    }
  }

  return { stocks, liveCount };
}

function syncQuotesFromWebSocket(symbols: string[]): number {
  let live = 0;
  for (const sym of symbols) {
    const q = getFnoLiveQuotes().find((row) => row.symbol === sym);
    if (q?.price) {
      quoteCache.set(sym, {
        symbol: sym,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        open: q.open,
        high: q.high,
        low: q.low,
        prevClose: q.prevClose,
        volume: q.volume,
        source: 'fyers-ws',
        lastUpdated: q.lastUpdated,
      });
      live += 1;
    }
  }
  return live;
}

async function fetchOhlcForSymbol(symbol: string): Promise<boolean> {
  const cached = ohlcCache.get(symbol);
  if (cached && Date.now() - cached.at < OHLC_TTL_MS) {
    setRealBarHistory(symbol, '1D', cached.bars);
    return true;
  }
  const res = await fetchMarketOhlc(symbol, '1d', '3mo');
  if (!res?.bars?.length) return false;
  const hist = barsFromOhlc(res.bars);
  ohlcCache.set(symbol, { bars: hist, at: Date.now() });
  setRealBarHistory(symbol, '1D', hist);
  return true;
}

async function refreshOhlcBatch(symbols: string[], force: boolean): Promise<number> {
  if (!force && Date.now() - lastOhlcRefresh < OHLC_TTL_MS) {
    return ohlcCache.size;
  }
  lastOhlcRefresh = Date.now();
  let loaded = 0;
  const queue = [...symbols];
  const workers = Array.from({ length: OHLC_CONCURRENCY }, async () => {
    while (queue.length) {
      const sym = queue.shift();
      if (!sym) break;
      try {
        if (await fetchOhlcForSymbol(sym)) loaded += 1;
      } catch {
        /* skip */
      }
    }
  });
  await Promise.all(workers);
  return loaded;
}

function buildRows(stocks: StockData[]): ScreenerMarketRow[] {
  return stocks.map((stock, idx) => {
    const hist = ohlcCache.get(stock.symbol)?.bars;
    const technicals = hist ? computeTechnicalsFromBars(hist) : null;
    const oi = fnoOiCache.get(stock.symbol);
    return buildScreenerRow(stock, idx, technicals, oi ?? null);
  });
}

async function refreshFnoOiBatch(symbols: string[]): Promise<number> {
  if (!symbols.length) return fnoOiCache.size;
  const slice: string[] = [];
  for (let i = 0; i < OI_ROTATE_SIZE; i++) {
    slice.push(symbols[(oiRotateOffset + i) % symbols.length]);
  }
  oiRotateOffset = (oiRotateOffset + OI_ROTATE_SIZE) % Math.max(symbols.length, 1);

  const res = await fetchFnoOiBatch(slice);
  for (const snap of res?.snapshots ?? []) {
    fnoOiCache.set(snap.symbol, snap);
  }
  return fnoOiCache.size;
}

function setStatus(partial: Partial<ScreenerFeedStatus>) {
  feedStatus = { ...feedStatus, ...partial, updatedAt: new Date().toISOString() };
  notify();
}

/** Full refresh: Fyers quotes + OHLC + fno-oi */
export async function refreshScreenerFeedAsync(opts?: { forceOhlc?: boolean }): Promise<ScreenerFeedStatus> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    setStatus({ mode: 'loading', message: 'Fetching live quotes…' });

    const symbols = [...new Set(FNO_STOCKS_ALL.filter((i) => i.type === 'stock').map((i) => i.symbol))];
    feedStatus.totalCount = symbols.length;

    if (
      getMarketConnectionState().serverOk &&
      cachedRows.length &&
      feedStatus.mode === 'live'
    ) {
      const apiLive = syncQuotesFromWebSocket(symbols);
      const { stocks, liveCount } = mergeStocksWithQuotes(symbols);
      const oiLoaded = await refreshFnoOiBatch(symbols);
      cachedRows = buildRows(stocks);
      const feedLabel = getMarketProviderLabel(getMarketLiveState().provider);
      setStatus({
        liveCount: Math.max(liveCount, apiLive),
        totalCount: stocks.length,
        oiLoaded,
        message: `Live · ${liveCount} quotes · OI ${oiLoaded}/${stocks.length} (TradeX) · ${feedLabel}`,
        ohlcLoaded: ohlcCache.size,
      });
      return feedStatus;
    }

    let serverOk = false;
    try {
      const health = await fetchMarketHealth();
      serverOk = Boolean(health?.status);
      if (health?.provider) setMarketProvider(health.provider);
    } catch {
      serverOk = false;
    }

    if (!serverOk) {
      cachedRows = [];
      setStatus({
        mode: 'offline',
        liveCount: 0,
        totalCount: symbols.length,
        serverOk: false,
        message: serverOfflineMessage(),
        ohlcLoaded: 0,
        oiLoaded: 0,
      });
      return feedStatus;
    }

    subscribeLiveSymbols(symbols);
    const apiLive = syncQuotesFromWebSocket(symbols);
    const { stocks, liveCount } = mergeStocksWithQuotes(symbols);

    const oiLoaded = await refreshFnoOiBatch(symbols);
    cachedRows = buildRows(stocks);

    const effectiveLive = Math.max(liveCount, apiLive);
    const mode: ScreenerFeedMode =
      effectiveLive >= stocks.length * 0.85 ? 'live' : effectiveLive > 0 ? 'mixed' : 'offline';

    const feedLabel = getMarketProviderLabel(getMarketLiveState().provider);
    setStatus({
      mode,
      liveCount: effectiveLive,
      totalCount: stocks.length,
      serverOk: true,
      message:
        mode === 'live'
          ? `Live · ${liveCount} quotes · OI ${oiLoaded}/${stocks.length} (TradeX) · ${feedLabel}`
          : `Mixed · ${liveCount}/${stocks.length} quotes · OI ${oiLoaded} · ${feedLabel}`,
      ohlcLoaded: ohlcCache.size,
      oiLoaded,
    });

    const shouldOhlc =
      opts?.forceOhlc ||
      (ohlcCache.size < 8 && Date.now() - lastOhlcRefresh > OHLC_TTL_MS);
    if (!shouldOhlc) return feedStatus;

    void refreshOhlcBatch(
      stocks.slice(0, OHLC_BATCH_MAX).map((s) => s.symbol),
      opts?.forceOhlc ?? false,
    ).then(async (loaded) => {
      const { stocks: freshStocks } = mergeStocksWithQuotes(symbols);
      const oiCount = await refreshFnoOiBatch(symbols);
      cachedRows = buildRows(freshStocks);
      notify();
      setStatus({
        ohlcLoaded: loaded,
        oiLoaded: oiCount,
        message:
          loaded > 0
            ? `${feedStatus.message} · ${loaded} OHLC indicators`
            : feedStatus.message,
      });
    });

    return feedStatus;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}
