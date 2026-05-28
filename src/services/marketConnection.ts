import { fetchMarketHealth, isMarketLiveEnabled } from './marketApiService';
import type { FyersWsConnectionStatus } from '../types/fyersMarket';
import { sanitizeDisplayMessage } from '../constants/brandLabels';

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
}

export function getFyersWsStatus(): FyersWsConnectionStatus {
  return state.wsStatus;
}

let lastHealthAt = 0;
const HEALTH_TTL_MS = 15_000;

export function resetMarketConnectionCache(): void {
  lastHealthAt = 0;
}

export async function refreshMarketConnection(): Promise<ConnectionState> {
  if (!isMarketLiveEnabled()) {
    state.serverOk = false;
    state.provider = '';
    state.fyersConnected = false;
    return state;
  }
  if (Date.now() - lastHealthAt < HEALTH_TTL_MS && state.serverOk) {
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
  } catch {
    state.serverOk = false;
    state.fyersConnected = false;
  }
  return state;
}
