import { fetchMarketHealth, isMarketLiveEnabled } from './marketApiService';
import type { MarketWsConnectionStatus } from '../types/marketLive';
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
  /** True when TradingView WS reports connected / has recent ticks */
  liveConnected: boolean;
  streamActive: boolean;
  wsStatus: MarketWsConnectionStatus;
  wsLastError: string;
  /** @deprecated use liveConnected */
  fyersConnected: boolean;
};

const state: ConnectionState = {
  provider: '',
  serverOk: false,
  liveConnected: false,
  streamActive: false,
  wsStatus: 'disconnected',
  wsLastError: '',
  fyersConnected: false,
};

export function getMarketConnectionState(): Readonly<ConnectionState> {
  return state;
}

export function isStrictLiveMode(): boolean {
  return isMarketLiveEnabled() && state.serverOk;
}

export function isMarketLiveActive(): boolean {
  return (
    state.serverOk &&
    (state.provider === 'tradingview' || state.provider.startsWith('tradingview')) &&
    state.liveConnected &&
    (state.streamActive || state.wsStatus === 'connected')
  );
}

/** @deprecated */
export function isFyersLiveActive(): boolean {
  return isMarketLiveActive();
}

export function setMarketStreamActive(active: boolean) {
  state.streamActive = active;
}

export function isMarketStreamActive(): boolean {
  return state.streamActive;
}

export function setMarketWsStatus(status: MarketWsConnectionStatus, lastError?: string) {
  state.wsStatus = status;
  if (lastError !== undefined) state.wsLastError = sanitizeDisplayMessage(lastError);
  state.streamActive = status === 'connected';
  state.liveConnected = status === 'connected';
  state.fyersConnected = state.liveConnected;
  notifyConnectionListeners();
}

/** @deprecated */
export function setFyersWsStatus(status: MarketWsConnectionStatus, lastError?: string) {
  setMarketWsStatus(status, lastError);
}

export function getMarketWsStatus(): MarketWsConnectionStatus {
  return state.wsStatus;
}

/** @deprecated */
export function getFyersWsStatus(): MarketWsConnectionStatus {
  return state.wsStatus;
}

let lastHealthAt = 0;
const HEALTH_TTL_MS = 15_000;
const HEALTH_STALE_OK_MS = 90_000;

export function resetMarketConnectionCache(): void {
  lastHealthAt = 0;
}

export function markServerReachable(): void {
  state.serverOk = true;
  lastHealthAt = Date.now();
  notifyConnectionListeners();
}

export function applyServerLiveFromHealth(live?: {
  provider?: string;
  configured?: boolean;
  fyersConfigured?: boolean;
  hasToken?: boolean;
  wsStatus?: string;
  wsConnected?: boolean;
  hasTicks?: boolean;
}): void {
  markServerReachable();
  if (!live) return;

  state.provider = live.provider || 'tradingview';
  setMarketProvider(state.provider);
  state.liveConnected = Boolean(
    live.wsConnected || live.wsStatus === 'connected' || live.hasTicks,
  );
  state.fyersConnected = state.liveConnected;

  if (live.wsStatus) {
    state.wsStatus = live.wsStatus as MarketWsConnectionStatus;
    state.streamActive = live.wsConnected === true || live.wsStatus === 'connected';
  }
  notifyConnectionListeners();
}

export async function refreshMarketConnection(force = false): Promise<ConnectionState> {
  if (!isMarketLiveEnabled()) {
    state.serverOk = false;
    state.provider = '';
    state.liveConnected = false;
    state.fyersConnected = false;
    return state;
  }
  if (!force && Date.now() - lastHealthAt < HEALTH_TTL_MS && state.serverOk) {
    return state;
  }
  try {
    const health = await fetchMarketHealth();
    state.serverOk = Boolean(health?.status);
    state.provider = health?.provider || 'tradingview';
    state.liveConnected = Boolean(
      health?.configured !== false &&
        (health?.websocket || health?.wsStatus === 'connected'),
    );
    state.fyersConnected = state.liveConnected;
    if (health?.wsStatus) {
      state.wsStatus = health.wsStatus as MarketWsConnectionStatus;
    }
    lastHealthAt = Date.now();
    if (state.provider) setMarketProvider(state.provider);
    notifyConnectionListeners();
  } catch {
    if (state.serverOk && Date.now() - lastHealthAt < HEALTH_STALE_OK_MS) {
      return state;
    }
    state.serverOk = false;
    state.liveConnected = false;
    state.fyersConnected = false;
    notifyConnectionListeners();
  }
  return state;
}
