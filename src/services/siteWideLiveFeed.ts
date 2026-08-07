/**
 * Boots TradingView forex/crypto (+ India core) live tape for the whole app.
 * Keeps Socket.IO + REST quotes seeded continuously (24×7) while the tab is open.
 */
import { ALL_CORE_LIVE_SYMBOLS } from '../data/fnoUniverse';
import { CORE_GLOBAL_LIVE_SYMBOLS } from '../data/coreGlobalLiveSymbols';
import { forceFyersReconnect, isFyersSocketConnected, startFyersSocketClient } from './fyersSocketClient';
import { subscribeLiveSymbols } from './marketTickStream';
import { applyStreamQuotes, refreshFnoLiveQuotesAsync } from './symbolLiveService';
import { fetchMarketQuotes } from './marketApiService';
import { API_SERVER_READY_EVENT } from './apiAutoConnect';

/** REST safety net — fills gaps when WS is quiet (market closed / lag). */
const REST_SEED_MS = 15_000;
/** If connected socket has been silent this long, resubscribe / soft reconnect. */
const SOCKET_QUIET_MS = 45_000;

let started = false;
let restTimer: ReturnType<typeof setInterval> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let seedInFlight: Promise<void> | null = null;
let lastSeedAt = 0;

async function seedQuotes(): Promise<void> {
  if (seedInFlight) return seedInFlight;
  seedInFlight = (async () => {
    try {
      startFyersSocketClient();
      subscribeLiveSymbols(ALL_CORE_LIVE_SYMBOLS);
      void refreshFnoLiveQuotesAsync(true);
      try {
        const res = await fetchMarketQuotes([...CORE_GLOBAL_LIVE_SYMBOLS, ...ALL_CORE_LIVE_SYMBOLS]);
        if (res?.quotes?.length) {
          applyStreamQuotes(
            res.quotes.map((q) => ({
              symbol: q.symbol,
              price: q.price,
              change: q.change,
              changePercent: q.changePercent,
              open: q.open,
              high: q.high,
              low: q.low,
              prevClose: q.prevClose,
              volume: q.volume,
              lastUpdated: q.lastUpdated || new Date().toISOString(),
              source: q.source || 'tradingview',
            })),
          );
        }
      } catch {
        /* cold start — WS ticks / next poll will fill */
      }
      lastSeedAt = Date.now();
    } finally {
      seedInFlight = null;
    }
  })();
  return seedInFlight;
}

function startTimers() {
  if (!restTimer) {
    restTimer = setInterval(() => {
      void seedQuotes();
    }, REST_SEED_MS);
  }
  if (!watchdogTimer) {
    watchdogTimer = setInterval(() => {
      startFyersSocketClient();
      subscribeLiveSymbols(ALL_CORE_LIVE_SYMBOLS);
      if (!isFyersSocketConnected()) {
        forceFyersReconnect();
        void seedQuotes();
        return;
      }
      // Quiet tape (e.g. NSE closed) — still refresh REST; soft-resub on WS
      if (Date.now() - lastSeedAt > SOCKET_QUIET_MS) {
        subscribeLiveSymbols(ALL_CORE_LIVE_SYMBOLS);
        void seedQuotes();
      }
    }, 20_000);
  }
}

/** Call once after login / app shell mount. Idempotent. */
export function ensureSiteWideLiveFeed(): void {
  if (typeof window === 'undefined') return;
  startFyersSocketClient();
  subscribeLiveSymbols(ALL_CORE_LIVE_SYMBOLS);
  void seedQuotes();

  if (started) return;
  started = true;

  startTimers();
  window.addEventListener(API_SERVER_READY_EVENT, () => {
    void seedQuotes();
  });
  window.addEventListener('visibilitychange', () => {
    if (!document.hidden) void seedQuotes();
  });
  window.addEventListener('online', () => {
    forceFyersReconnect();
    void seedQuotes();
  });
}

/** Immediate re-seed (tab focus / network / API ready). */
export function nudgeSiteWideLiveFeed(): void {
  if (typeof window === 'undefined') return;
  ensureSiteWideLiveFeed();
  void seedQuotes();
}
