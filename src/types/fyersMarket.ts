/** FYERS real-time market types (Socket.IO bridge) */

export type FyersWsConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'token_invalid'
  | 'degraded';

export type FyersConnectionPayload = {
  status: FyersWsConnectionStatus;
  connected: boolean;
  hasTicks?: boolean;
  lastTickAt?: number;
  lastMessageAt?: number;
  reconnectAttempt?: number;
  lastError?: string;
  upstream?: string;
  tokenInvalid?: boolean;
};

export type FyersCandleTick = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FyersMarketQuote = {
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
  candle?: FyersCandleTick;
};

export type FyersTickPayload = {
  type: 'tick';
  provider: string;
  quotes: FyersMarketQuote[];
  candles?: Record<string, FyersCandleTick>;
  at: number;
};

export type FyersDepthLevel = {
  price: number;
  qty: number;
};

export type FyersMarketDepth = {
  symbol: string;
  bids: FyersDepthLevel[];
  asks: FyersDepthLevel[];
  at: number;
};
