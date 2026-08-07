/**
 * Live market tick helpers — Socket.IO client talks to TradingView-backed API.
 */

import { isFyersSocketConnected, startFyersSocketClient } from './fyersSocketClient';

export const MARKET_TOKEN_INVALID_EVENT = 'market:feed-invalid';
/** @deprecated */
export const FYERS_TOKEN_INVALID_EVENT = MARKET_TOKEN_INVALID_EVENT;

/** Subscribe symbols on the browser Socket.IO client. */
export function subscribeLiveSymbols(symbols: string[]): void {
  void import('./fyersSocketClient')
    .then((m) => {
      m.startFyersSocketClient();
      m.subscribeFyersMarketSymbols(symbols);
    })
    .catch(() => {});
}

export function startMarketTickStream(): () => void {
  startFyersSocketClient();
  return stopMarketTickStream;
}

/** Intentional no-op — site-wide singleton stays up until logout / hard reload. */
export function stopMarketTickStream(): void {}

export function isMarketWebSocketConnected(): boolean {
  try {
    return isFyersSocketConnected();
  } catch {
    return false;
  }
}
