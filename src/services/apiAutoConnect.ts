import { apiFetch } from '../config/api';
import {
  applyServerLiveFromHealth,
  refreshMarketConnection,
  resetMarketConnectionCache,
} from './marketConnection';

export const API_SERVER_READY_EVENT = 'api-server-ready';
export const API_CONNECT_STATUS_EVENT = 'api-connect-status';
export const FYERS_MARKET_LIVE_EVENT = 'fyers-market-live';

const MAX_BOOT_ATTEMPTS = 50;
const WATCH_MS = 15_000;

let bootStarted = false;
let connectAttempt = 0;
let serverReady = false;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  if (attempt < 8) return 500;
  return Math.min(1000 + attempt * 150, 2500);
}

function emitStatus() {
  window.dispatchEvent(
    new CustomEvent(API_CONNECT_STATUS_EVENT, {
      detail: { attempt: connectAttempt, ready: serverReady },
    }),
  );
}

type HealthPayload = {
  status?: string;
  live?: {
    fyersConfigured?: boolean;
    hasToken?: boolean;
    wsStatus?: string;
    wsConnected?: boolean;
  };
};

async function pingHealthOnce(): Promise<HealthPayload | null> {
  try {
    const h = await apiFetch('/api/health', undefined, { retries: 1, timeoutMs: 35_000 });
    if (!h.ok) return null;
    return (await h.json()) as HealthPayload;
  } catch {
    return null;
  }
}

async function pingHealthBurst(): Promise<HealthPayload | null> {
  const results = await Promise.all([pingHealthOnce(), pingHealthOnce()]);
  return results.find((r) => r?.status === 'ok') ?? null;
}

async function finishMarketHandshake(): Promise<void> {
  resetMarketConnectionCache();
  const state = await refreshMarketConnection(true);
  if (state.fyersConnected) {
    window.dispatchEvent(new CustomEvent(FYERS_MARKET_LIVE_EVENT));
  }
}

async function onHealthOk(payload: HealthPayload): Promise<boolean> {
  applyServerLiveFromHealth(payload.live);

  if (!serverReady) {
    serverReady = true;
    window.dispatchEvent(new CustomEvent(API_SERVER_READY_EVENT));
    emitStatus();
  }

  if (payload.live?.wsConnected) {
    window.dispatchEvent(new CustomEvent(FYERS_MARKET_LIVE_EVENT));
  }

  void finishMarketHandshake();
  return true;
}

async function tryConnect(useBurst: boolean): Promise<boolean> {
  const payload = useBurst ? await pingHealthBurst() : await pingHealthOnce();
  if (!payload || payload.status !== 'ok') return false;
  return onHealthOk(payload);
}

async function pingApi(): Promise<boolean> {
  const payload = await pingHealthOnce();
  if (!payload || payload.status !== 'ok') return false;
  return onHealthOk(payload);
}

async function bootConnect(stopped: () => boolean): Promise<void> {
  for (let i = 0; i < MAX_BOOT_ATTEMPTS && !stopped(); i++) {
    connectAttempt = i + 1;
    emitStatus();

    if (await tryConnect(i % 3 !== 1)) return;

    await sleep(backoffMs(i));
  }
}

/** Retry until /api/health responds — runs once per page load */
export function startApiAutoConnect(): () => void {
  if (bootStarted) return () => {};
  bootStarted = true;

  let stopped = false;
  const isStopped = () => stopped;
  let watchTimer: ReturnType<typeof setInterval> | null = null;

  void bootConnect(isStopped);

  watchTimer = setInterval(() => {
    if (!stopped) void pingApi();
  }, WATCH_MS);

  return () => {
    stopped = true;
    bootStarted = false;
    serverReady = false;
    connectAttempt = 0;
    if (watchTimer) clearInterval(watchTimer);
  };
}

export function warmupApiServer(): void {
  if (!import.meta.env.VITE_API_URL?.trim()) return;
  startApiAutoConnect();
}

export function getApiConnectAttempt(): number {
  return connectAttempt;
}

export function isApiServerReady(): boolean {
  return serverReady;
}
