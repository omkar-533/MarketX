/** TradingView real-time market types (Socket.IO bridge) */

export type MarketWsConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'degraded';

export type MarketConnectionPayload = {
  status: MarketWsConnectionStatus;
  connected: boolean;
  hasTicks?: boolean;
  lastTickAt?: number;
  lastMessageAt?: number;
  reconnectAttempt?: number;
  lastError?: string;
  upstream?: string;
};

export type MarketCandleTick = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketQuote = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  bid?: number;
  ask?: number;
  bidQty?: number;
  askQty?: number;
  oi?: number;
  oiChange?: number;
  source?: string;
  lastUpdated: string;
  candle?: MarketCandleTick;
};

export type MarketTickPayload = {
  type: 'tick';
  provider: string;
  quotes: MarketQuote[];
  candles?: Record<string, MarketCandleTick>;
  at: number;
};

/** @deprecated aliases */
export type FyersWsConnectionStatus = MarketWsConnectionStatus;
export type FyersConnectionPayload = MarketConnectionPayload;
export type FyersCandleTick = MarketCandleTick;
export type FyersMarketQuote = MarketQuote;
export type FyersTickPayload = MarketTickPayload;
