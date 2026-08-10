/**
 * Client catalog + status API for Connect Market Data.
 * Tokens never returned here — server keeps credentials.
 */
import { getApiBaseUrl } from '../../config/api';

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
  message: string;
};

function base() {
  return getApiBaseUrl().replace(/\/$/, '');
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json', ...(init?.headers || {}) },
    ...init,
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

/** Activate DEMO session server-side — no broker OAuth. */
export async function connectDemoMarketData(): Promise<ServerConnectionStatus> {
  return json('/api/market-data/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: 'mock-demo' }),
  });
}

export async function disconnectMarketData(): Promise<ServerConnectionStatus> {
  return json('/api/market-data/disconnect', { method: 'POST' });
}
