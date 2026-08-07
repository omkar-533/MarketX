/**
 * App-wide refresh event bus — drives useAutoRefresh consumers 24×7 while logged in.
 */

export const AUTO_REFRESH_EVENT = 'tradeflow:auto-refresh';
/** Quotes / REST safety net cadence (socket ticks stay independent). */
export const DEFAULT_AUTO_REFRESH_MS = 15_000;

let tick = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
let started = false;
let intervalMs = DEFAULT_AUTO_REFRESH_MS;

export type AutoRefreshDetail = {
  tick: number;
  at: number;
};

export function runGlobalRefresh(): AutoRefreshDetail {
  tick += 1;
  const detail: AutoRefreshDetail = { tick, at: Date.now() };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTO_REFRESH_EVENT, { detail }));
  }
  return detail;
}

export function getAutoRefreshTick(): number {
  return tick;
}

export function startAutoRefreshHub(ms = DEFAULT_AUTO_REFRESH_MS): () => void {
  intervalMs = Math.max(5_000, ms);
  if (started) {
    // Restart interval if cadence changed while already running
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = setInterval(runGlobalRefresh, intervalMs);
    }
    return stopAutoRefreshHub;
  }
  started = true;
  runGlobalRefresh();
  intervalId = setInterval(runGlobalRefresh, intervalMs);
  return stopAutoRefreshHub;
}

export function stopAutoRefreshHub(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  started = false;
}

export function isAutoRefreshHubStarted(): boolean {
  return started;
}

export function subscribeAutoRefresh(handler: (detail: AutoRefreshDetail) => void): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent<AutoRefreshDetail>).detail);
  };
  window.addEventListener(AUTO_REFRESH_EVENT, listener);
  return () => window.removeEventListener(AUTO_REFRESH_EVENT, listener);
}
