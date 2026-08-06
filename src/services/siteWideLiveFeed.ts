/**
 * Boots TradingView forex/crypto (+ India core) live tape for the whole app.
 * Call once after login / API ready so every screen shares the same getLiveQuote().
 */
import { ALL_CORE_LIVE_SYMBOLS } from '../data/fnoUniverse';
import { CORE_GLOBAL_LIVE_SYMBOLS } from '../data/coreGlobalLiveSymbols';
import { startFyersSocketClient } from './fyersSocketClient';
import { subscribeLiveSymbols } from './marketTickStream';
import { applyStreamQuotes, refreshFnoLiveQuotesAsync } from './symbolLiveService';
import { fetchMarketQuotes } from './marketApiService';
import { API_SERVER_READY_EVENT } from './apiAutoConnect';

let started = false;

export function ensureSiteWideLiveFeed(): void {
  if (typeof window === 'undefined') return;
  startFyersSocketClient();
  subscribeLiveSymbols(ALL_CORE_LIVE_SYMBOLS);

  if (started) return;
  started = true;

  const seed = async () => {
    subscribeLiveSymbols(ALL_CORE_LIVE_SYMBOLS);
    void refreshFnoLiveQuotesAsync();
    try {
      const res = await fetchMarketQuotes([...CORE_GLOBAL_LIVE_SYMBOLS]);
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
      /* cold start — WS ticks will fill */
    }
  };

  void seed();
  window.addEventListener(API_SERVER_READY_EVENT, () => {
    void seed();
  });
}
