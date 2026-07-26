import { serverOfflineMessage } from '../constants/brandLabels';
import type { StockData } from '../data/marketData';
import { FNO_STOCKS_ALL, type FnoInstrument } from '../data/fnoUniverse';
import {
  fetchFnoOiBatch,
  fetchMarketHealth,
  fetchMarketOhlc,
  fetchMarketQuotes,
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

const OHLC_CONCURRENCY = 3;
const OHLC_TTL_MS = 8 * 60_000;
const OHLC_BATCH_MAX = 45;
const QUOTE_BATCH = 40;

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
const OI_ROTATE_SIZE = 40;
let oiRotateOffset = 0;
let ohlcRotateOffset = 0;

let refreshInFlight: Promise<ScreenerFeedStatus> | null = null;
let lastOhlcRefresh = 0;
let lastQuoteRefresh = 0;

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
    if (q && inst && q.price > 0) {
      stocks.push(quoteToStock(inst, q));
      liveCount += 1;
      continue;
    }
    const live = getMarketLiveState().stocks.find((s) => s.symbol === sym);
    if (live?.price) {
      stocks.push(live);
      liveCount += 1;
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

/** REST quotes for full F&O universe (WebSocket alone is not enough on first load) */
async function hydrateQuotesFromApi(symbols: string[]): Promise<number> {
  let loaded = 0;
  for (let i = 0; i < symbols.length; i += QUOTE_BATCH) {
    const chunk = symbols.slice(i, i + QUOTE_BATCH);
    try {
      const res = await fetchMarketQuotes(chunk);
      for (const q of res?.quotes ?? []) {
        if (q?.symbol && q.price > 0) {
          quoteCache.set(q.symbol, q);
          loaded += 1;
        }
      }
    } catch {
      /* continue other batches */
    }
  }
  lastQuoteRefresh = Date.now();
  return loaded;
}

async function fetchOhlcForSymbol(symbol: string, force: boolean): Promise<boolean> {
  const cached = ohlcCache.get(symbol);
  if (!force && cached && Date.now() - cached.at < OHLC_TTL_MS) {
    setRealBarHistory(symbol, '1D', cached.bars);
    return true;
  }
  const res = await fetchMarketOhlc(symbol, '1d', '6mo');
  if (!res?.bars?.length) return false;
  const hist = barsFromOhlc(res.bars);
  ohlcCache.set(symbol, { bars: hist, at: Date.now() });
  setRealBarHistory(symbol, '1D', hist);
  return true;
}

/** Prefer movers + rotate so every symbol gets real indicators over time */
function pickOhlcSymbols(stocks: StockData[]): string[] {
  if (!stocks.length) return [];
  const sorted = [...stocks].sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent) || b.volume - a.volume,
  );
  const top = sorted.slice(0, 18).map((s) => s.symbol);
  const rotated: string[] = [];
  const n = sorted.length;
  for (let i = 0; i < OHLC_BATCH_MAX; i++) {
    rotated.push(sorted[(ohlcRotateOffset + i) % n].symbol);
  }
  ohlcRotateOffset = (ohlcRotateOffset + OHLC_BATCH_MAX) % n;
  return [...new Set([...top, ...rotated])];
}

async function refreshOhlcBatch(stocks: StockData[], force: boolean): Promise<number> {
  const symbols = pickOhlcSymbols(stocks);
  if (!symbols.length) return ohlcCache.size;

  lastOhlcRefresh = Date.now();
  let loaded = 0;
  const queue = [...symbols];
  const workers = Array.from({ length: OHLC_CONCURRENCY }, async () => {
    while (queue.length) {
      const sym = queue.shift();
      if (!sym) break;
      try {
        if (await fetchOhlcForSymbol(sym, force)) loaded += 1;
      } catch {
        /* skip */
      }
    }
  });
  await Promise.all(workers);
  return ohlcCache.size;
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

function applyQuoteSnapshot(symbols: string[], stocks: StockData[], liveCount: number, oiLoaded: number) {
  cachedRows = buildRows(stocks);
  const feedLabel = getMarketProviderLabel(getMarketLiveState().provider);
  const mode: ScreenerFeedMode =
    liveCount >= Math.max(stocks.length, 1) * 0.75
      ? 'live'
      : liveCount > 0
        ? 'mixed'
        : 'offline';

  setStatus({
    mode,
    liveCount,
    totalCount: Math.max(stocks.length, symbols.length),
    serverOk: true,
    oiLoaded,
    ohlcLoaded: ohlcCache.size,
    message:
      mode === 'live'
        ? `Live · ${liveCount} quotes · indicators ${ohlcCache.size} · OI ${oiLoaded} · ${feedLabel}`
        : mode === 'mixed'
          ? `Partial live · ${liveCount}/${symbols.length} quotes · indicators ${ohlcCache.size} · ${feedLabel}`
          : `Waiting for quotes · ${feedLabel}`,
  });
}

/** Full refresh: REST quotes + WS merge + OHLC + fno-oi */
export async function refreshScreenerFeedAsync(opts?: { forceOhlc?: boolean }): Promise<ScreenerFeedStatus> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    setStatus({ mode: 'loading', message: 'Fetching live quotes…' });

    const symbols = [...new Set(FNO_STOCKS_ALL.filter((i) => i.type === 'stock').map((i) => i.symbol))];
    feedStatus.totalCount = symbols.length;

    let serverOk = false;
    try {
      const health = await fetchMarketHealth();
      serverOk = Boolean(health?.status);
      if (health?.provider) setMarketProvider(health.provider);
    } catch {
      serverOk = getMarketConnectionState().serverOk;
    }

    if (!serverOk) {
      // Keep last good snapshot so UI still scrolls / shows prior tape
      setStatus({
        mode: cachedRows.length ? 'offline' : 'offline',
        liveCount: 0,
        totalCount: symbols.length,
        serverOk: false,
        message: cachedRows.length
          ? `${serverOfflineMessage()} · showing last snapshot`
          : serverOfflineMessage(),
        ohlcLoaded: ohlcCache.size,
        oiLoaded: fnoOiCache.size,
      });
      if (!cachedRows.length) cachedRows = [];
      return feedStatus;
    }

    subscribeLiveSymbols(symbols);

    const needQuotes = opts?.forceOhlc || Date.now() - lastQuoteRefresh > 20_000 || quoteCache.size < symbols.length * 0.5;
    let apiCount = 0;
    if (needQuotes) {
      apiCount = await hydrateQuotesFromApi(symbols);
    }
    const wsCount = syncQuotesFromWebSocket(symbols);
    const { stocks, liveCount } = mergeStocksWithQuotes(symbols);
    const oiLoaded = await refreshFnoOiBatch(symbols);
    applyQuoteSnapshot(symbols, stocks, Math.max(liveCount, apiCount, wsCount), oiLoaded);

    const shouldOhlc =
      opts?.forceOhlc ||
      ohlcCache.size < Math.min(20, stocks.length) ||
      Date.now() - lastOhlcRefresh > 90_000;

    if (shouldOhlc && stocks.length) {
      void refreshOhlcBatch(stocks, Boolean(opts?.forceOhlc)).then(async () => {
        const { stocks: fresh } = mergeStocksWithQuotes(symbols);
        const oiCount = await refreshFnoOiBatch(symbols);
        applyQuoteSnapshot(symbols, fresh, Math.max(fresh.length, liveCount), oiCount);
      });
    }

    return feedStatus;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}
