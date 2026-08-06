/**
 * Unified live quote feed: Kite WebSocket when configured, else TradingView.
 */
import { isKiteConfigured } from './kite/kiteConfig.mjs';
import * as kite from './kite/kiteWsManager.mjs';
import * as tv from './tradingview/tvWsManager.mjs';

export function activeUpstream() {
  return isKiteConfigured() ? 'kite' : 'tradingview';
}

export function ensureLiveSocket(bootSymbols = []) {
  if (isKiteConfigured()) {
    kite.ensureKiteSocket(bootSymbols);
    // Keep TV warm as OHLC fallback (optional lightly)
    return 'kite';
  }
  tv.ensureTvSocket(bootSymbols);
  return 'tradingview';
}

export function resetLiveSocket() {
  if (isKiteConfigured()) kite.resetKiteSocket();
  else tv.resetTvSocket();
}

export function subscribeLiveSymbols(symbols) {
  if (isKiteConfigured()) return kite.subscribeKiteSymbols(symbols);
  return tv.subscribeTvSymbols(symbols);
}

export function unsubscribeLiveSymbols(symbols) {
  if (isKiteConfigured()) return kite.unsubscribeKiteSymbols(symbols);
  return tv.unsubscribeTvSymbols(symbols);
}

export function getLiveWsStatus() {
  if (isKiteConfigured()) return kite.getKiteWsStatus();
  return tv.getTvWsStatus();
}

export function getLiveTickSnapshot(symbols) {
  if (isKiteConfigured()) return kite.getTickSnapshot(symbols);
  return tv.getTickSnapshot(symbols);
}

export function subscribeLiveTickBroadcast(fn) {
  if (isKiteConfigured()) return kite.subscribeTickBroadcast(fn);
  return tv.subscribeTickBroadcast(fn);
}

export function subscribeLiveWsStatus(fn) {
  if (isKiteConfigured()) return kite.subscribeWsStatus(fn);
  return tv.subscribeWsStatus(fn);
}
