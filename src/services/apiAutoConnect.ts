import { apiFetch } from '../config/api';
import {
  applyServerLiveFromHealth,
  refreshMarketConnection,
  resetMarketConnectionCache,
} from './marketConnection';

export const API_SERVER_READY_EVENT = 'api-server-ready';
export const API_CONNECT_STATUS_EVENT = 'api-connect-status';
export const FYERS_MARKET_LIVE_EVENT = 'fyers-market-live';

/** Keep wake light — Render free tier sleeps; hammering makes the UI feel hung. */
const MAX_BOOT_ATTEMPTS = 8;
const WATCH_MS = 3 * 60_000;
const HEALTH_TIMEOUT_MS = 12_000;

let bootStarted = false;
let connectAttempt = 0;
let serverReady = false;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(800 + attempt * 400, 4_000);
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
    const h = await apiFetch('/api/health', undefined, {
      retries: 0,
      timeoutMs: HEALTH_TIMEOUT_MS,
    });
    if (!h.ok) return null;
    return (await h.json()) as HealthPayload;
  } catch {
    return null;
  }
}

async function finishMarketHandshake(): Promise<void> {
  // Live ticks are off for product tabs — skip unless explicitly enabled.
  if (String(import.meta.env.VITE_MARKET_LIVE || '').toLowerCase() !== 'true') return;
  resetMarketConnectionCache();
  await refreshMarketConnection(true);
}

async function onHealthOk(payload: HealthPayload): Promise<boolean> {
  applyServerLiveFromHealth(payload.live);

  if (!serverReady) {
    serverReady = true;
    window.dispatchEvent(new CustomEvent(API_SERVER_READY_EVENT));
    emitStatus();
  }

  void finishMarketHandshake();
  return true;
}

async function tryConnect(): Promise<boolean> {
  const payload = await pingHealthOnce();
  if (!payload || payload.status !== 'ok') return false;
  return onHealthOk(payload);
}

async function bootConnect(stopped: () => boolean): Promise<void> {
  for (let i = 0; i < MAX_BOOT_ATTEMPTS && !stopped(); i++) {
    connectAttempt = i + 1;
    emitStatus();
    if (await tryConnect()) return;
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
    if (!stopped && !serverReady) void tryConnect();
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
