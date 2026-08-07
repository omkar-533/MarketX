import type { IndexData, StockData } from '../data/marketData';
import {
  FNO_INDICES,
  FNO_STOCKS,
  FNO_UNIVERSE,
  ALL_CORE_LIVE_SYMBOLS,
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

const FNO_BY_SYMBOL = new Map(FNO_UNIVERSE.map((i) => [i.symbol, i]));
/** Throttle UI store updates — keep dashboard tippy without flooding React. */
const SNAPSHOT_PUBLISH_MS = 80;
let snapshotPublishTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshotQuotes: LiveSymbolQuote[] | null = null;
let pendingSnapshotError = '';

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

const PRIORITY_SYMBOLS = ALL_CORE_LIVE_SYMBOLS;

function changeEpsilon(price: number): number {
  const p = Math.abs(Number(price) || 0);
  if (p > 0 && p < 2) return 1e-6; // FX pairs
  if (p < 50) return 1e-4; // low-priced crypto / metals fractions
  return 0.01; // indices / equities
}

function normalizeQuoteChange(q: {
  price: number;
  change: number;
  changePercent: number;
  prevClose: number;
}) {
  const prevClose = q.prevClose > 0 ? q.prevClose : 0;
  const price = Number(q.price) || 0;
  let change = Number(q.change) || 0;
  let changePercent = Number(q.changePercent) || 0;

  if (prevClose > 0 && price > 0) {
    const diff = price - prevClose;
    const eps = changeEpsilon(price);
    const needsRecalc =
      Math.abs(diff) > eps &&
      (Math.abs(change) < eps ||
        (change === 0 && changePercent === 0) ||
        Math.abs(change - diff) > Math.max(eps * 10, Math.abs(diff) * 0.25));

    if (needsRecalc) {
      const digits = price < 2 ? 5 : price < 100 ? 4 : 2;
      const pow = 10 ** digits;
      change = Math.round(diff * pow) / pow;
      changePercent = Math.round((diff / prevClose) * 10000) / 100;
    }
  }

  return {
    ...q,
    change,
    changePercent,
    prevClose: prevClose > 0 ? prevClose : price,
  };
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

/** Throttle UI store updates — ticks arrive ~20×/sec; React only needs ~2–3×/sec. */
function schedulePublishLiveSnapshot(liveQuotes: LiveSymbolQuote[], errorMsg = '') {
  pendingSnapshotQuotes = liveQuotes;
  pendingSnapshotError = errorMsg;
  if (snapshotPublishTimer) return;
  snapshotPublishTimer = setTimeout(() => {
    snapshotPublishTimer = null;
    if (!pendingSnapshotQuotes) return;
    publishLiveSnapshot(pendingSnapshotQuotes, pendingSnapshotError);
    pendingSnapshotQuotes = null;
    pendingSnapshotError = '';
  }, SNAPSHOT_PUBLISH_MS);
}

function quoteFromTick(q: MarketTickDto): LiveSymbolQuote {
  const prior = FNO_BY_SYMBOL.get(q.symbol)
    ? liveCache.find((x) => x.symbol === q.symbol)
    : extraLiveCache.get(q.symbol);

  const enriched: MarketTickDto = {
    ...q,
    prevClose: q.prevClose > 0 ? q.prevClose : prior?.prevClose ?? 0,
    open: q.open > 0 ? q.open : prior?.open ?? q.price,
    high: Math.max(q.high || 0, prior?.high || 0, q.price || 0),
    low: (() => {
      const lows = [q.low, prior?.low].filter((n): n is number => typeof n === 'number' && n > 0);
      if (!lows.length) return q.price;
      return Math.min(...lows, q.price || lows[0]);
    })(),
    change: q.change,
    changePercent: q.changePercent,
  };

  const inst = FNO_BY_SYMBOL.get(q.symbol) ?? getFnoInstrument(q.symbol);
  if (inst) return quoteToLive(inst, enriched);
  const n = normalizeQuoteChange(enriched);
  return {
    symbol: q.symbol,
    name: prior?.name || q.symbol,
    type: 'stock',
    sector: prior?.sector || 'Global',
    price: n.price,
    change: n.change,
    changePercent: n.changePercent,
    open: enriched.open,
    high: enriched.high,
    low: enriched.low,
    prevClose: n.prevClose,
    volume: q.volume || prior?.volume || 0,
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
  lastStreamTickAt = Date.now();
  const map = new Map(liveCache.map((item) => [item.symbol, item]));
  for (const q of quotes) {
    const row = quoteFromTick(q);
    const inst = FNO_BY_SYMBOL.get(q.symbol);
    if (inst) map.set(q.symbol, row);
    else extraLiveCache.set(q.symbol, row);
  }
  liveCache = [...map.values()];
  schedulePublishLiveSnapshot([...liveCache, ...extraLiveCache.values()]);
}

async function refreshFromLiveApi(): Promise<LiveSymbolQuote[]> {
  const unique = [...new Set(PRIORITY_SYMBOLS)];

  const hydrateExtras = (quoteMap: Map<string, MarketTickDto>) => {
    const extras: MarketTickDto[] = [];
    for (const [sym, q] of quoteMap) {
      if (!FNO_BY_SYMBOL.has(sym) && q?.price) extras.push(q);
    }
    if (extras.length) applyStreamQuotes(extras);
  };

  // Always merge ticks + REST quotes — never skip because streamActive is sticky.
  const ticks = await fetchMarketTicks(unique);
  const res = await fetchMarketQuotes(unique);
  const merged = mergeQuoteMap(ticks, res?.quotes);
  liveCache = buildCacheFromQuoteMap(merged);
  hydrateExtras(merged);
  publishLiveSnapshot(
    [...liveCache, ...extraLiveCache.values()],
    res?.errors?.length ? `${res.errors.length} symbols delayed` : '',
  );
  return liveCache;
}

/** Last Stream/WS tick applied into cache (ms). */
let lastStreamTickAt = 0;

export function getLastStreamTickAt(): number {
  return lastStreamTickAt;
}

export async function refreshFnoLiveQuotesAsync(force = false): Promise<LiveSymbolQuote[]> {
  if (refreshInFlight && !force) return refreshInFlight;

  const run = async () => {
    try {
      await refreshMarketConnection();
      const health = await fetchMarketHealth();
      if (!health?.status) {
        setMarketLiveError(serverOfflineMessage());
        return liveCache;
      }
      setMarketProvider(health.provider || 'tradingview');
      const hasLive = liveCache.length > 0;
      const streamFresh =
        isLiveFeedActive() &&
        isMarketStreamActive() &&
        hasLive &&
        lastStreamTickAt > 0 &&
        Date.now() - lastStreamTickAt < 8_000;
      // Only skip REST when ticks are actually arriving — not when stream flag is stale.
      if (!force && streamFresh) {
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
  };

  if (force && refreshInFlight) {
    // Let the in-flight finish, then force another pass.
    try {
      await refreshInFlight;
    } catch {
      /* ignore */
    }
  }

  refreshInFlight = run();
  return refreshInFlight;
}

export function refreshFnoLiveQuotes(): LiveSymbolQuote[] {
  void import('./marketTickStream').then((m) => {
    m.subscribeLiveSymbols(PRIORITY_SYMBOLS);
  });
  // Always schedule a background refresh — hub + 24×7 REST need this path.
  void refreshFnoLiveQuotesAsync();
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
