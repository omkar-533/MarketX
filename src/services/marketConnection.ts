import { fetchMarketHealth, isMarketLiveEnabled } from './marketApiService';
import type { FyersWsConnectionStatus } from '../types/fyersMarket';
import { sanitizeDisplayMessage } from '../constants/brandLabels';
import { setMarketProvider } from './marketLiveStore';

export const MARKET_CONNECTION_EVENT = 'tradeflow:market-connection';

const connectionListeners = new Set<() => void>();

function notifyConnectionListeners() {
  connectionListeners.forEach((fn) => fn());
  window.dispatchEvent(new CustomEvent(MARKET_CONNECTION_EVENT));
}

export function subscribeMarketConnection(fn: () => void): () => void {
  connectionListeners.add(fn);
  return () => connectionListeners.delete(fn);
}

type ConnectionState = {
  provider: string;
  serverOk: boolean;
  fyersConnected: boolean;
  streamActive: boolean;
  wsStatus: FyersWsConnectionStatus;
  wsLastError: string;
};

const state: ConnectionState = {
  provider: '',
  serverOk: false,
  fyersConnected: false,
  streamActive: false,
  wsStatus: 'disconnected',
  wsLastError: '',
};

export function getMarketConnectionState(): Readonly<ConnectionState> {
  return state;
}

export function isStrictLiveMode(): boolean {
  return isMarketLiveEnabled() && state.serverOk;
}

export function isFyersLiveActive(): boolean {
  return (
    state.serverOk &&
    state.provider === 'fyers' &&
    state.fyersConnected &&
    (state.streamActive || state.wsStatus === 'connected')
  );
}

export function setMarketStreamActive(active: boolean) {
  state.streamActive = active;
}

export function isMarketStreamActive(): boolean {
  return state.streamActive;
}

export function setFyersWsStatus(status: FyersWsConnectionStatus, lastError?: string) {
  state.wsStatus = status;
  if (lastError !== undefined) state.wsLastError = sanitizeDisplayMessage(lastError);
  state.streamActive = status === 'connected';
  notifyConnectionListeners();
}

export function getFyersWsStatus(): FyersWsConnectionStatus {
  return state.wsStatus;
}

let lastHealthAt = 0;
const HEALTH_TTL_MS = 15_000;
const HEALTH_STALE_OK_MS = 90_000;

export function resetMarketConnectionCache(): void {
  lastHealthAt = 0;
}

/** Fast path after /api/health — full market health loads in background */
export function markServerReachable(): void {
  state.serverOk = true;
  lastHealthAt = Date.now();
  notifyConnectionListeners();
}

export function applyServerLiveFromHealth(live?: {
  fyersConfigured?: boolean;
  hasToken?: boolean;
  wsStatus?: string;
  wsConnected?: boolean;
}): void {
  markServerReachable();
  if (!live) return;

  if (live.fyersConfigured && live.hasToken) {
    state.provider = 'fyers';
    setMarketProvider('fyers');
    state.fyersConnected = Boolean(live.wsConnected || live.wsStatus === 'connected');
  } else if (live.fyersConfigured) {
    state.provider = 'fyers-offline';
    setMarketProvider('fyers-offline');
    state.fyersConnected = false;
  } else {
    state.provider = 'fyers-offline';
    setMarketProvider('fyers-offline');
    state.fyersConnected = false;
  }

  if (live.wsStatus) {
    state.wsStatus = live.wsStatus as FyersWsConnectionStatus;
    state.streamActive = live.wsConnected === true || live.wsStatus === 'connected';
  }
  notifyConnectionListeners();
}

export async function refreshMarketConnection(force = false): Promise<ConnectionState> {
  if (!isMarketLiveEnabled()) {
    state.serverOk = false;
    state.provider = '';
    state.fyersConnected = false;
    return state;
  }
  if (!force && Date.now() - lastHealthAt < HEALTH_TTL_MS && state.serverOk) {
    return state;
  }
  try {
    const health = await fetchMarketHealth();
    state.serverOk = Boolean(health?.status);
    state.provider = health?.provider || '';
    state.fyersConnected = Boolean(
      health?.configured && (health?.websocket || health?.wsStatus === 'connected'),
    );
    if (health?.wsStatus) {
      state.wsStatus = health.wsStatus as FyersWsConnectionStatus;
    }
    lastHealthAt = Date.now();
    if (state.provider) setMarketProvider(state.provider);
    notifyConnectionListeners();
  } catch {
    if (state.serverOk && Date.now() - lastHealthAt < HEALTH_STALE_OK_MS) {
      return state;
    }
    state.serverOk = false;
    state.fyersConnected = false;
    notifyConnectionListeners();
  }
  return state;
}
