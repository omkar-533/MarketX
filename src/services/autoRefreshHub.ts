/**
 * Lightweight refresh event bus only.
 * Live Fyers ticks / OI / chain polling removed — product does not use live quotes.
 */

export const AUTO_REFRESH_EVENT = 'tradeflow:auto-refresh';
export const DEFAULT_AUTO_REFRESH_MS = 60_000;

let tick = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
let started = false;

export type AutoRefreshDetail = {
  tick: number;
  at: number;
};

export function runGlobalRefresh(): AutoRefreshDetail {
  tick += 1;
  const detail: AutoRefreshDetail = { tick, at: Date.now() };
  window.dispatchEvent(new CustomEvent(AUTO_REFRESH_EVENT, { detail }));
  return detail;
}

export function getAutoRefreshTick(): number {
  return tick;
}

export function startAutoRefreshHub(ms = DEFAULT_AUTO_REFRESH_MS): () => void {
  if (started) return stopAutoRefreshHub;
  started = true;
  // Intentionally no market subscribe / quote refresh.
  intervalId = setInterval(runGlobalRefresh, ms);
  return stopAutoRefreshHub;
}

export function stopAutoRefreshHub(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  started = false;
}

export function subscribeAutoRefresh(handler: (detail: AutoRefreshDetail) => void): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent<AutoRefreshDetail>).detail);
  };
  window.addEventListener(AUTO_REFRESH_EVENT, listener);
  return () => window.removeEventListener(AUTO_REFRESH_EVENT, listener);
}
