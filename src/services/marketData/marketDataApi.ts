/**
 * Client catalog + status + LIVE proxy APIs for Connect Market Data.
 * Access tokens are POST'd once to the server and never stored in localStorage.
 */
import { getApiBaseUrl } from '../../config/api';
import { loadAppSession } from '../appInviteAuth';

export type CatalogProvider = {
  id: string;
  name: string;
  authenticationType: string;
  supportedExchanges: string[];
  supportedTimeframes: string[];
  capabilities: {
    historicalCandles: boolean;
    liveQuotes: boolean;
    bidAsk: boolean;
    marketDepth: boolean;
    instrumentList: boolean;
    marketStatus: boolean;
    orderExecution: false;
  };
  isDemo: boolean;
  enabled: boolean;
  notes?: string;
};

export type ServerConnectionStatus = {
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'EXPIRED' | 'ERROR';
  providerId: string | null;
  providerName: string | null;
  mode: 'DEMO' | 'LIVE' | null;
  historical: boolean;
  liveQuotes: boolean;
  orderAccess: 'NOT ENABLED';
  permissionNote?: string | null;
  message: string;
};

/** Wolf Opportunity / Radar / LIVE WOLF / Strategy Lab — INDstocks LIVE only, never DEMO. */
export function isIndstocksLive(s: ServerConnectionStatus | null | undefined): boolean {
  return Boolean(s && s.status === 'CONNECTED' && s.mode === 'LIVE' && s.liveQuotes);
}

function base() {
  return getApiBaseUrl().replace(/\/$/, '');
}

function authHeaders(): HeadersInit {
  const session = loadAppSession();
  return {
    Accept: 'application/json',
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
  };
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchMarketDataProviders(): Promise<CatalogProvider[]> {
  const data = await json<{ providers: CatalogProvider[] }>('/api/market-data/providers');
  return data.providers;
}

export async function fetchMarketDataStatus(): Promise<ServerConnectionStatus> {
  return json('/api/market-data/status');
}

export async function connectDemoMarketData(): Promise<ServerConnectionStatus> {
  return json('/api/market-data/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: 'mock-demo' }),
  });
}

/** Token is sent once to server — do not keep in React state after success. */
export async function connectIndstocksMarketData(
  accessToken: string,
): Promise<ServerConnectionStatus> {
  return json('/api/market-data/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: 'indstocks', accessToken }),
  });
}

export async function disconnectMarketData(): Promise<ServerConnectionStatus> {
  return json('/api/market-data/disconnect', { method: 'POST' });
}

export async function fetchLiveQuote(symbol: string) {
  return json<{ quote: { symbol: string; price: number; lastPrice: number; changePercent: number; timestamp: number; exchange: string } }>(
    `/api/market-data/quote?symbol=${encodeURIComponent(symbol)}`,
  );
}

export type LiveQuoteRow = {
  symbol: string;
  price: number;
  lastPrice?: number;
  change?: number;
  changePercent: number;
  volume?: number;
  dayOpen?: number;
  dayHigh?: number;
  dayLow?: number;
  previousClose?: number;
  timestamp?: number;
  exchange?: string;
};

export async function fetchLiveQuotesBatch(symbols: string[]): Promise<{ quotes: LiveQuoteRow[]; mode: string; source: string }> {
  const list = [...new Set(symbols.map((s) => String(s || '').toUpperCase()).filter(Boolean))].slice(0, 80);
  if (!list.length) return { quotes: [], mode: 'LIVE', source: 'indstocks' };
  return json('/api/market-data/quotes-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: list }),
  });
}

type LiveCandlesResponse = {
  candles: import('../radar/radarTypes').Candle[];
  mode: string;
};

/** Short TTL so chart + LIVE analysis share one INDstocks history pull. */
const CANDLE_MEM_TTL_MS = 45_000;
const candleMem = new Map<string, { at: number; barsWanted: number; data: LiveCandlesResponse }>();

function candleMemKey(symbol: string, timeframe: string): string {
  return `${String(symbol || '').toUpperCase()}|${String(timeframe || '').toLowerCase()}`;
}

export async function fetchLiveCandles(
  symbol: string,
  timeframe: string,
  bars = 80,
  beforeMs?: number,
): Promise<LiveCandlesResponse> {
  const want = Math.min(3200, Math.max(10, Math.floor(bars) || 80));
  const key = candleMemKey(symbol, timeframe);
  if (!beforeMs) {
    const hit = candleMem.get(key);
    if (
      hit &&
      Date.now() - hit.at < CANDLE_MEM_TTL_MS &&
      Array.isArray(hit.data.candles) &&
      hit.data.candles.length >= want &&
      (hit.barsWanted >= want || hit.data.candles.length >= want)
    ) {
      const slice =
        hit.data.candles.length > want ? hit.data.candles.slice(-want) : hit.data.candles;
      return { ...hit.data, candles: slice };
    }
  }

  const q = new URLSearchParams({
    symbol,
    timeframe,
    bars: String(want),
  });
  if (beforeMs && beforeMs > 0) q.set('before', String(Math.floor(beforeMs)));
  const data = await json<LiveCandlesResponse>(`/api/market-data/candles?${q}`);
  if (!beforeMs && data?.candles?.length) {
    const prev = candleMem.get(key);
    if (!prev || data.candles.length >= prev.data.candles.length || Date.now() - prev.at > CANDLE_MEM_TTL_MS) {
      candleMem.set(key, { at: Date.now(), barsWanted: want, data });
      if (candleMem.size > 400) {
        const oldest = [...candleMem.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) candleMem.delete(oldest[0]);
      }
    }
  }
  return data;
}

type LiveCandlesBatchResponse = {
  candlesBySymbol: Record<string, import('../radar/radarTypes').Candle[]>;
  mode: string;
  timeframe: string;
};

export async function fetchLiveCandlesBatch(
  symbols: string[],
  timeframe: string,
  bars = 80,
): Promise<LiveCandlesBatchResponse> {
  const want = Math.min(500, Math.max(20, Math.floor(bars) || 80));
  const list = [...new Set(symbols.map((s) => String(s || '').toUpperCase()).filter(Boolean))].slice(0, 40);
  const cached: Record<string, import('../radar/radarTypes').Candle[]> = {};
  const missing: string[] = [];
  for (const symbol of list) {
    const hit = candleMem.get(candleMemKey(symbol, timeframe));
    if (
      hit &&
      Date.now() - hit.at < CANDLE_MEM_TTL_MS &&
      Array.isArray(hit.data.candles) &&
      hit.data.candles.length >= want
    ) {
      cached[symbol] =
        hit.data.candles.length > want ? hit.data.candles.slice(-want) : hit.data.candles;
    } else {
      missing.push(symbol);
    }
  }
  if (!missing.length) {
    return { candlesBySymbol: cached, mode: 'LIVE', timeframe };
  }
  const data = await json<LiveCandlesBatchResponse>('/api/market-data/candles-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: missing, timeframe, bars: want }),
  });
  const candlesBySymbol = { ...cached, ...(data.candlesBySymbol || {}) };
  for (const [symbol, candles] of Object.entries(candlesBySymbol)) {
    if (!candles?.length) continue;
    candleMem.set(candleMemKey(symbol, timeframe), {
      at: Date.now(),
      barsWanted: want,
      data: { candles, mode: 'LIVE' },
    });
  }
  if (candleMem.size > 400) {
    const oldest = [...candleMem.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, candleMem.size - 400);
    for (const [k] of oldest) candleMem.delete(k);
  }
  return { ...data, candlesBySymbol };
}

export async function fetchLiveSymbols(universe: string, mode: 'catalog' | 'scannable' = 'scannable') {
  return json<{
    symbols: string[];
    catalog?: string[];
    scannable?: string[];
    universe?: string;
    universeLoaded?: number;
    dataAvailable?: number;
    dataUnavailable?: number;
    source?: string;
    note?: string;
    instrumentMaster?: {
      nseEquity: number;
      bseEquity: number;
      fnoUnderlyings: number;
      indices: number;
      refreshedAt: number | null;
      source: string;
    };
  }>(
    `/api/market-data/symbols?universe=${encodeURIComponent(universe)}&mode=${mode === 'scannable' ? 'scannable' : 'catalog'}`,
  );
}

export async function fetchUniversesMeta() {
  return json<{
    source: string;
    instrumentMaster: {
      nseEquity: number;
      bseEquity: number;
      fnoUnderlyings: number;
      indices: number;
      refreshedAt: number | null;
      source: string;
    };
    universes: Record<
      string,
      { id: string; catalogCount: number; scannableCount: number; unavailableCount: number }
    >;
  }>('/api/market-data/universes');
}
