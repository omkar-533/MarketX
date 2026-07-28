/**
 * Live market tick stream — intentionally disabled.
 * Product tabs (Indicators / Master AI / Journal) do not consume live quotes.
 */

export { FYERS_TOKEN_INVALID_EVENT } from '../constants/fyersEvents';

/** No-op: live websocket ticks are off. */
export function subscribeLiveSymbols(_symbols: string[]): void {}

/** No-op stop/start — keeps call sites safe without opening Fyers WS. */
export function startMarketTickStream(): () => void {
  return stopMarketTickStream;
}

export function stopMarketTickStream(): void {}

export function isMarketWebSocketConnected(): boolean {
  return false;
}
