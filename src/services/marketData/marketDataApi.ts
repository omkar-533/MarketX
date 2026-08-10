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

export async function fetchLiveCandles(symbol: string, timeframe: string, bars = 80) {
  return json<{ candles: import('../radar/radarTypes').Candle[]; mode: string }>(
    `/api/market-data/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&bars=${bars}`,
  );
}

export async function fetchLiveSymbols(universe: string) {
  return json<{ symbols: string[] }>(
    `/api/market-data/symbols?universe=${encodeURIComponent(universe)}`,
  );
}
