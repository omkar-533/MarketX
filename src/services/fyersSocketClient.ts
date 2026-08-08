import type { FyersMarketQuote, FyersWsConnectionStatus } from '../types/fyersMarket';

type TickHandler = (ticks: FyersMarketQuote[]) => void;
type StatusHandler = (status: FyersWsConnectionStatus) => void;
type TokenInvalidHandler = () => void;
type OptionChainHandler = (payload: unknown) => void;

/** Live market sockets deleted — TradingView / NSE / Kite stack removed. */

export function subscribeOptionChainLive(_symbol: string, _expiry?: string): void {}
export function unsubscribeOptionChainLive(_symbol: string, _expiry?: string): void {}
export function onOptionChainUpdate(_fn: OptionChainHandler): () => void {
  return () => undefined;
}

export function startFyersSocketClient(): () => void {
  return () => undefined;
}

export function stopFyersSocketClient(): void {}

export function subscribeFyersMarketSymbols(_symbols: string[]): void {}
export function unsubscribeFyersMarketSymbols(_symbols: string[]): void {}

export function onFyersConnectionStatus(fn: StatusHandler): () => void {
  try {
    fn('disconnected');
  } catch {
    /* ignore */
  }
  return () => undefined;
}

export function onFyersMarketTicks(_fn: TickHandler): () => void {
  return () => undefined;
}

export function onFyersTokenInvalid(_fn: TokenInvalidHandler): () => void {
  return () => undefined;
}

export function getFyersCachedQuote(_symbol: string): FyersMarketQuote | undefined {
  return undefined;
}

export function getFyersConnectionStatus(): FyersWsConnectionStatus {
  return 'disconnected';
}

export function isFyersSocketConnected(): boolean {
  return false;
}

export function forceFyersReconnect(): void {}
