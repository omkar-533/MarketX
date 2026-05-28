import { apiFetch } from '../config/api';
import { refreshMarketConnection, resetMarketConnectionCache } from './marketConnection';

export const API_SERVER_READY_EVENT = 'api-server-ready';
export const FYERS_MARKET_LIVE_EVENT = 'fyers-market-live';

const RETRY_MS = 1500;
const MAX_BOOT_RETRIES = 40;
const WATCH_MS = 30_000;

let bootStarted = false;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pingApi(): Promise<boolean> {
  try {
    const h = await apiFetch('/api/health');
    if (!h.ok) return false;
  } catch {
    return false;
  }
  resetMarketConnectionCache();
  const state = await refreshMarketConnection();
  if (state.serverOk) {
    window.dispatchEvent(new CustomEvent(API_SERVER_READY_EVENT));
    if (state.fyersConnected) {
      window.dispatchEvent(new CustomEvent(FYERS_MARKET_LIVE_EVENT));
    }
    return true;
  }
  return false;
}

/** Retry until /api/health responds — runs once per page load */
export function startApiAutoConnect(): () => void {
  if (bootStarted) return () => {};
  bootStarted = true;

  let stopped = false;
  let watchTimer: ReturnType<typeof setInterval> | null = null;

  void (async () => {
    for (let i = 0; i < MAX_BOOT_RETRIES && !stopped; i++) {
      if (await pingApi()) return;
      await sleep(RETRY_MS);
    }
  })();

  watchTimer = setInterval(() => {
    if (!stopped) void pingApi();
  }, WATCH_MS);

  return () => {
    stopped = true;
    bootStarted = false;
    if (watchTimer) clearInterval(watchTimer);
  };
}
