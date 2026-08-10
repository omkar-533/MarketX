/**
 * LIVE WOLF shared types — analysis events (not order execution).
 */

export type LiveFeedStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'STALE_DATA'
  | 'ERROR';

export type MarketEventType =
  | 'PRICE_UPDATE'
  | 'CANDLE_CLOSE'
  | 'LIQUIDITY_SWEEP'
  | 'STRUCTURE_SHIFT'
  | 'BREAKOUT'
  | 'BREAKDOWN'
  | 'VOLUME_EXPANSION'
  | 'SETUP_DETECTED'
  | 'SETUP_CONFIRMED'
  | 'SETUP_INVALIDATED'
  | 'HTF_ALIGNMENT_CHANGED'
  | 'NO_SETUP'
  | 'ANALYSIS_UPDATE';

export type EventSignificance = 'LOW' | 'MEDIUM' | 'HIGH';

export type MarketEvent = {
  id: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  type: MarketEventType;
  timestamp: number;
  price: number;
  significance: EventSignificance;
  message: string;
  metadata?: Record<string, unknown>;
};

export type LiveAnalysisSnapshot = {
  symbol: string;
  exchange: string;
  timeframe: string;
  price: number;
  changePercent: number;
  structure: string;
  liquidity: string;
  volume: string;
  momentum: string;
  htfAlignment: boolean;
  htfTrend: string;
  setupType: string | null;
  status: string;
  score: number | null;
  scoreBreakdown: Record<string, number> | null;
  keyLevels: { label: string; price: number }[];
  invalidation: string;
  explanation: string;
  dataMode: 'DEMO' | 'LIVE';
  analyzedAt: number;
  waiting: boolean;
};

export type LiveSessionState = {
  feedStatus: LiveFeedStatus;
  lastTickAt: number | null;
  lastCandleAt: number | null;
  lastAnalysisAt: number | null;
  providerLabel: string;
  dataMode: 'DEMO' | 'LIVE';
  stale: boolean;
};
