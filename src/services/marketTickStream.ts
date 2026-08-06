/**
 * Live market tick helpers — Socket.IO client talks to TradingView-backed API.
 */

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
  void import('./fyersSocketClient')
    .then((m) => m.startFyersSocketClient())
    .catch(() => {});
  return stopMarketTickStream;
}

export function stopMarketTickStream(): void {}

export function isMarketWebSocketConnected(): boolean {
  try {
    // sync require via cache if module already loaded
    return false;
  } catch {
    return false;
  }
}
