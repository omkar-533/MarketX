import { LIVE_MARKET_DATA } from '../constants/liveMarket';
import { apiFetch } from '../config/api';

export type MarketQuoteDto = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  source: string;
  lastUpdated: string;
};

export type MarketQuotesResponse = {
  quotes: MarketQuoteDto[];
  errors: { symbol: string; error: string }[];
  source: string;
  fetchedAt: string;
};

export type MarketOhlcResponse = {
  symbol: string;
  timeframe: string;
  bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  source: string;
  fetchedAt: string;
};

/** Live quotes/ticks — hard-off while LIVE_MARKET_DATA is false. */
export function isMarketLiveEnabled(): boolean {
  return LIVE_MARKET_DATA;
}

export type MarketTickDto = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  source?: string;
  lastUpdated: string;
};

export async function fetchMarketHealth(): Promise<{
  status: string;
  provider?: string;
  configured?: boolean;
  websocket?: boolean;
  wsStatus?: string;
  wsLastTickAt?: number | null;
  wsReconnectAttempt?: number;
} | null> {
  try {
    const res = await apiFetch('/api/market/health', undefined, { retries: 1, timeoutMs: 20_000 });
    if (res.ok) return res.json();
  } catch {
    /* fall through to lightweight /api/health */
  }

  try {
    const res = await apiFetch('/api/health', undefined, { retries: 1, timeoutMs: 15_000 });
    if (!res.ok) return null;
    const data = await res.json();
    const live = data?.live ?? {};
    return {
      status: data?.status === 'ok' ? 'ok' : 'degraded',
      provider: live.provider || 'tradingview',
      configured: live.configured !== false,
      websocket: Boolean(live.wsConnected || live.hasTicks),
      wsStatus: live.wsStatus,
    };
  } catch {
    return null;
  }
}

export async function fetchMarketTicks(symbols?: string[]): Promise<MarketTickDto[] | null> {
  if (!isMarketLiveEnabled()) return [];
  try {
    const q = symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(','))}` : '';
    const res = await apiFetch(`/api/market/ticks${q}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.quotes ?? null;
  } catch {
    return null;
  }
}

export async function fetchMarketQuotes(symbols: string[]): Promise<MarketQuotesResponse | null> {
  if (!symbols.length) return null;
  if (!isMarketLiveEnabled()) {
    return {
      quotes: [],
      errors: symbols.map((symbol) => ({ symbol, error: 'live market disabled' })),
      source: 'disabled',
      fetchedAt: new Date().toISOString(),
    };
  }
  try {
    // Large batch + cold TV can exceed default 18s; prefer ticks snapshot on server now.
    const res = await apiFetch(
      `/api/market/quotes?symbols=${encodeURIComponent(symbols.join(','))}`,
      undefined,
      { retries: 1, timeoutMs: 35_000 },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchMarketOhlc(
  symbol: string,
  interval: string,
  range?: string,
  bars?: number,
): Promise<MarketOhlcResponse | null> {
  const wantBars = barsForOhlcRange(range, bars);

  // Legacy /api/market/* stack is gone — prefer connected market-data (INDstocks / demo).
  const fromLive = await fetchOhlcFromMarketData(symbol, interval, wantBars);
  if (fromLive?.bars?.length) return fromLive;

  if (!isMarketLiveEnabled()) {
    return (
      fromLive || {
        symbol,
        timeframe: interval,
        bars: [],
        source: 'disabled',
        fetchedAt: new Date().toISOString(),
      }
    );
  }
  try {
    const q = new URLSearchParams({ symbol, interval });
    if (range) q.set('range', range);
    if (wantBars > 0) q.set('bars', String(wantBars));
    const res = await apiFetch(`/api/market/ohlc?${q}`);
    if (!res.ok) return fromLive;
    const data = (await res.json()) as MarketOhlcResponse;
    if (data?.bars?.length) return data;
    return fromLive || data;
  } catch {
    return fromLive;
  }
}

function barsForOhlcRange(range?: string, bars?: number): number {
  if (bars && bars > 0) return Math.min(500, Math.floor(bars));
  const r = String(range || '').toLowerCase();
  if (r === '1y' || r === '6mo' || r === '3mo') return 500;
  if (r === '1mo') return 400;
  if (r === '5d' || r === '1d') return 200;
  return 300;
}

/** Map NativeChatChart intervals → /api/market-data/candles timeframes. */
function toMarketDataTimeframe(interval: string): string {
  const raw = String(interval || '5m').trim();
  const lower = raw.toLowerCase();
  if (raw === '1D' || lower === '1d' || lower === 'd' || lower === '1day') return '1D';
  if (lower === '1w' || lower === 'w' || raw === '1M' || lower === '1month') return '1D';
  if (lower === '2h' || lower === '120m') return '1h';
  if (['1m', '3m', '5m', '15m', '30m', '1h', '4h'].includes(lower)) return lower;
  return '5m';
}

async function fetchOhlcFromMarketData(
  symbol: string,
  interval: string,
  bars: number,
): Promise<MarketOhlcResponse | null> {
  try {
    const { fetchLiveCandles } = await import('./marketData/marketDataApi');
    const tf = toMarketDataTimeframe(interval);
    const data = await fetchLiveCandles(symbol, tf, bars);
    const next = (data?.candles || [])
      .map((c) => {
        const ts = Number(c.timestamp);
        return {
          time: ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume || 0),
        };
      })
      .filter(
        (b) =>
          Number.isFinite(b.time) &&
          b.open > 0 &&
          b.high > 0 &&
          b.close > 0 &&
          b.high >= b.low,
      )
      .sort((a, b) => a.time - b.time);

    return {
      symbol,
      timeframe: interval,
      bars: next,
      source: data?.mode === 'LIVE' ? 'market-data' : 'market-data-demo',
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export type FnoHistoryRow = {
  date: string;
  symbol: string;
  totalOi: number;
  volume: number;
  futClose?: number;
  futOpen?: number;
  futHigh?: number;
  futLow?: number;
};

export type FnoHistoryResponse = {
  symbol: string;
  from: string;
  to: string;
  rows: FnoHistoryRow[];
  source: string;
  error?: string;
  note?: string;
  fetchedAt: string;
};

/** @deprecated */
export type NseFnoHistoryResponse = FnoHistoryResponse;
export type NseFnoHistoryRow = FnoHistoryRow;

export type FnoOiSnapshot = {
  symbol: string;
  totalOi: number;
  oiChange: number;
  oiChangePct: number;
  callOi: number;
  putOi: number;
  pcr: number;
  source: string;
  fetchedAt: string;
};

export type FnoOiBatchResponse = {
  snapshots: FnoOiSnapshot[];
  errors: { symbol: string; error: string }[];
  source: string;
  fetchedAt: string;
};

export async function fetchFnoOiBatch(symbols: string[]): Promise<FnoOiBatchResponse | null> {
  if (!symbols.length) return null;
  try {
    const res = await apiFetch(
      `/api/market/fno-oi?symbols=${encodeURIComponent(symbols.join(','))}`,
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export type FiiDiiApiRow = {
  date: string;
  fiiCashBuy: number;
  fiiCashSell: number;
  fiiCashNet: number;
  fiiFuturesBuy: number;
  fiiFuturesSell: number;
  fiiFuturesNet: number;
  fiiOptionsBuy: number;
  fiiOptionsSell: number;
  fiiOptionsNet: number;
  diiCashBuy: number;
  diiCashSell: number;
  diiCashNet: number;
};

export type GlobalIndexQuote = {
  id: string;
  name: string;
  country: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'Open' | 'Closed';
  openTime: string;
  closeTime: string;
  currency: string;
  source: string;
};

export async function fetchFiiDii(days = 30): Promise<{ rows: FiiDiiApiRow[]; source: string } | null> {
  if (!isMarketLiveEnabled()) return { rows: [], source: 'disabled' };
  try {
    const res = await apiFetch(`/api/market/fii-dii?days=${days}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchGlobalQuotes(): Promise<{
  indices: GlobalIndexQuote[];
  source: string;
} | null> {
  if (!isMarketLiveEnabled()) return { indices: [], source: 'disabled' };
  try {
    const res = await apiFetch('/api/market/global-quotes');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchFnoHistory(
  symbol: string,
  from: string,
  to: string,
): Promise<FnoHistoryResponse | null> {
  try {
    const q = new URLSearchParams({ symbol, from, to });
    const res = await apiFetch(`/api/market/fno-history?${q}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** @deprecated use fetchFnoHistory */
export const fetchNseFnoHistory = fetchFnoHistory;
