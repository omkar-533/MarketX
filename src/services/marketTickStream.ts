import { LIVE_MARKET_DATA } from '../constants/liveMarket';
import { isFyersSocketConnected, startFyersSocketClient } from './fyersSocketClient';

export const MARKET_TOKEN_INVALID_EVENT = 'market:feed-invalid';
/** @deprecated */
export const FYERS_TOKEN_INVALID_EVENT = MARKET_TOKEN_INVALID_EVENT;

/** Subscribe symbols on the browser Socket.IO client. */
export function subscribeLiveSymbols(symbols: string[]): void {
  if (!LIVE_MARKET_DATA) return;
  void import('./fyersSocketClient')
    .then((m) => {
      m.startFyersSocketClient();
      m.subscribeFyersMarketSymbols(symbols);
    })
    .catch(() => {});
}

export function startMarketTickStream(): () => void {
  if (!LIVE_MARKET_DATA) return stopMarketTickStream;
  startFyersSocketClient();
  return stopMarketTickStream;
}

/** Intentional no-op — site-wide singleton stays up until logout / hard reload. */
export function stopMarketTickStream(): void {}

export function isMarketWebSocketConnected(): boolean {
  if (!LIVE_MARKET_DATA) return false;
  try {
    return isFyersSocketConnected();
  } catch {
    return false;
  }
}
