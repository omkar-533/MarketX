/**
 * Unified live quote feed: Kite WebSocket when configured, else TradingView.
 * Hard-killed when LIVE_MARKET_DISABLED (default).
 */
import { LIVE_MARKET_DISABLED } from './liveKill.mjs';
import { isKiteConfigured } from './kite/kiteConfig.mjs';
import * as kite from './kite/kiteWsManager.mjs';
import * as tv from './tradingview/tvWsManager.mjs';

export function activeUpstream() {
  if (LIVE_MARKET_DISABLED) return 'disabled';
  return isKiteConfigured() ? 'kite' : 'tradingview';
}

export function ensureLiveSocket(bootSymbols = []) {
  if (LIVE_MARKET_DISABLED) {
    console.log('[Market] Live tape disabled — no TV/Kite tick sockets');
    return 'disabled';
  }
  if (isKiteConfigured()) {
    kite.ensureKiteSocket(bootSymbols);
    return 'kite';
  }
  tv.ensureTvSocket(bootSymbols);
  return 'tradingview';
}

export function resetLiveSocket() {
  if (LIVE_MARKET_DISABLED) return;
  if (isKiteConfigured()) kite.resetKiteSocket();
  else tv.resetTvSocket();
}

export function subscribeLiveSymbols(symbols) {
  if (LIVE_MARKET_DISABLED) return;
  if (isKiteConfigured()) return kite.subscribeKiteSymbols(symbols);
  return tv.subscribeTvSymbols(symbols);
}

export function unsubscribeLiveSymbols(symbols) {
  if (LIVE_MARKET_DISABLED) return;
  if (isKiteConfigured()) return kite.unsubscribeKiteSymbols(symbols);
  return tv.unsubscribeTvSymbols(symbols);
}

export function getLiveWsStatus() {
  if (LIVE_MARKET_DISABLED) {
    return {
      status: 'disabled',
      connected: false,
      hasTicks: false,
      lastTickAt: 0,
      lastMessageAt: 0,
      reconnectAttempt: 0,
      lastError: 'live market disabled',
      subscribedCount: 0,
      pendingCount: 0,
      symbolCap: 0,
      activeSymbols: 0,
      upstream: 'disabled',
    };
  }
  if (isKiteConfigured()) return kite.getKiteWsStatus();
  return tv.getTvWsStatus();
}

export function getLiveTickSnapshot(symbols) {
  if (LIVE_MARKET_DISABLED) return [];
  if (isKiteConfigured()) return kite.getTickSnapshot(symbols);
  return tv.getTickSnapshot(symbols);
}

export function subscribeLiveTickBroadcast(fn) {
  if (LIVE_MARKET_DISABLED) return () => {};
  if (isKiteConfigured()) return kite.subscribeTickBroadcast(fn);
  return tv.subscribeTickBroadcast(fn);
}

export function subscribeLiveWsStatus(fn) {
  if (LIVE_MARKET_DISABLED) {
    fn(getLiveWsStatus());
    return () => {};
  }
  if (isKiteConfigured()) return kite.subscribeWsStatus(fn);
  return tv.subscribeWsStatus(fn);
}
