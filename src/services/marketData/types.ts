/**
 * Normalized market-data models for WOLF.
 * Broker adapters MUST map into these shapes — scanner never sees broker JSON.
 * orderExecution is always false in WOLF capabilities.
 */

export type WolfTimeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';

export type WolfExchange = 'NSE' | 'BSE' | 'NFO' | 'BFO' | 'MCX';

export type InstrumentType = 'EQUITY' | 'INDEX' | 'FUTURES' | 'OPTIONS';

export type OptionType = 'CE' | 'PE' | null;

export type MarketDataMode = 'DEMO' | 'LIVE';

export type ConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'EXPIRED'
  | 'ERROR';

export type LiveConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ERROR';

/** Provider capability flags — never claim more than implemented. */
export type ProviderCapabilities = {
  historicalCandles: boolean;
  liveQuotes: boolean;
  bidAsk: boolean;
  marketDepth: boolean;
  instrumentList: boolean;
  marketStatus: boolean;
  /** Always false for WOLF — analysis only. */
  orderExecution: false;
};

export type ProviderDescriptor = {
  id: string;
  name: string;
  authenticationType: 'none' | 'oauth2' | 'api_key_session' | 'unavailable';
  supportedExchanges: WolfExchange[];
  supportedTimeframes: WolfTimeframe[];
  capabilities: ProviderCapabilities;
  /** True only for MockMarketDataProvider */
  isDemo: boolean;
  /** False until Phase 12 official integration ships */
  enabled: boolean;
  notes?: string;
};

export type NormalizedCandle = {
  symbol: string;
  exchange: string;
  instrumentToken?: string;
  timeframe: WolfTimeframe;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** True when aggregated from a smaller TF */
  derived?: boolean;
  source?: string;
  freshnessMs?: number;
};

export type NormalizedQuote = {
  symbol: string;
  exchange: string;
  instrumentToken?: string;
  timestamp: number;
  lastPrice: number;
  /** Convenience alias for callers that expect `price` */
  price: number;
  changePercent: number;
  bid?: number;
  ask?: number;
  bidQuantity?: number;
  askQuantity?: number;
  volume?: number;
  dayOpen?: number;
  dayHigh?: number;
  dayLow?: number;
  previousClose?: number;
};

export type NormalizedInstrument = {
  /** Stable WOLF id — not broker-specific alone */
  wolfInstrumentId: string;
  symbol: string;
  exchange: WolfExchange | string;
  instrumentToken: string;
  tradingSymbol: string;
  instrumentType: InstrumentType;
  expiry: string | null;
  strike: number | null;
  optionType: OptionType;
  lotSize: number | null;
  tickSize: number | null;
  currency: string;
};

export type MarketStatusInfo = {
  exchange: string;
  isOpen: boolean;
  session: 'PRE_OPEN' | 'OPEN' | 'CLOSED' | 'UNKNOWN';
  serverTime: number;
  raw?: string;
};

export type DataQualityIssue =
  | 'MISSING_CANDLES'
  | 'DUPLICATE_CANDLES'
  | 'INVALID_OHLC'
  | 'TIMESTAMP_ORDER'
  | 'STALE_QUOTE'
  | 'ZERO_VOLUME'
  | 'INVALID_SYMBOL'
  | 'INCOMPLETE_DATA';

export type DataQualityReport = {
  ok: boolean;
  warning?: 'DATA_QUALITY_WARNING';
  issues: DataQualityIssue[];
  candleCount: number;
};

export type RateLimitConfig = {
  requestsPerSecond: number;
  requestsPerMinute: number;
  maxSubscriptions: number;
  historicalRequestLimit: number;
};

export type CachedEnvelope<T> = {
  data: T;
  timestamp: number;
  source: string;
  freshnessMs: number;
  mode: MarketDataMode;
};

export const DEFAULT_DEMO_CAPABILITIES: ProviderCapabilities = {
  historicalCandles: true,
  liveQuotes: false,
  bidAsk: false,
  marketDepth: false,
  instrumentList: true,
  marketStatus: true,
  orderExecution: false,
};

export const ALL_WOLF_TIMEFRAMES: WolfTimeframe[] = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1D',
];
