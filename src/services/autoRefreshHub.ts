import { refreshOiIntelligenceLive } from './oiIntelligenceLiveService';
import { refreshOptionChainsLive } from './optionChainEngine';
import { refreshLiveSectionsCache } from './liveSectionsCache';
import { getMarketConnectionState, refreshMarketConnection } from './marketConnection';
import { refreshScreenerFeedAsync } from './screenerLiveService';
import { invalidateChartCache } from './chart/chartDataService';
import { subscribeLiveSymbols } from './marketTickStream';
import { CORE_LIVE_SYMBOLS } from '../data/fnoUniverse';
import { getFnoLiveQuotes, refreshFnoLiveQuotesAsync } from './symbolLiveService';

export const AUTO_REFRESH_EVENT = 'tradeflow:auto-refresh';
export const DEFAULT_AUTO_REFRESH_MS = 15_000;
const OI_REFRESH_EVERY = 8;
const CHAIN_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];
const SECTIONS_REFRESH_EVERY = 4;

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
  void refreshMarketConnection()
    .then(() => {
      const conn = getMarketConnectionState();
      const hasLive = getFnoLiveQuotes().length > 0;
      if (conn.streamActive && conn.serverOk && hasLive) return;
      return refreshFnoLiveQuotesAsync();
    })
    .then(() => {
      if (tick % OI_REFRESH_EVERY === 0) {
        void refreshOptionChainsLive(CHAIN_SYMBOLS);
        void refreshOiIntelligenceLive();
      }
      if (tick % SECTIONS_REFRESH_EVERY === 0) {
        void refreshLiveSectionsCache();
      }
    })
    .then(() => {
      if (tick % 3 === 0) return refreshScreenerFeedAsync();
    })
    .then(() => {
      if (tick % 10 === 0) {
        invalidateChartCache();
        void import('./chart/chartDataService').then((m) =>
          m.prewarmChartCache(['NIFTY', 'BANKNIFTY'], '15m'),
        );
      }
    })
    .finally(() => {
    try {
      import('./equitySymbolService').then((m) => m.refreshMarketSymbols());
    } catch {
      /* optional */
    }
    window.dispatchEvent(new CustomEvent(AUTO_REFRESH_EVENT, { detail }));
  });
  return detail;
}

export function getAutoRefreshTick(): number {
  return tick;
}

export function startAutoRefreshHub(ms = DEFAULT_AUTO_REFRESH_MS): () => void {
  if (started) return stopAutoRefreshHub;
  started = true;
  subscribeLiveSymbols(CORE_LIVE_SYMBOLS);
  runGlobalRefresh();
  intervalId = setInterval(runGlobalRefresh, ms);

  const onVisible = () => {
    if (document.visibilityState === 'visible') runGlobalRefresh();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    stopAutoRefreshHub();
  };
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
