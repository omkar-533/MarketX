/**
 * Wolf Opportunity — types for the market-intelligence dashboard.
 * Scores are setup quality / condition strength — never profit probability.
 */

export type OpportunityScannerId =
  | 'momentum_surge'
  | 'flow_shift'
  | 'liquidity_hunt'
  | 'compression_break'
  | 'momentum_fade'
  | 'breakout_radar'
  | 'reversal_hunter'
  | 'sector_leaders'
  | 'delivery_flow'
  | 'trend_rider'
  | 'options_flow'
  | 'wolf_prime';

export type OpportunityStatus =
  | 'ACTIVE'
  | 'WATCH'
  | 'CONFIRM'
  | 'INVALID'
  | 'COOLED'
  | 'UNAVAILABLE';

export type OpportunityDirection = 'bullish' | 'bearish' | 'neutral';

export type DataFeedStatus = 'LIVE' | 'DELAYED' | 'OFFLINE' | 'DEMO';

export type OpportunityTimeframe = '5m' | '15m' | '1h' | '1D';

export type OpportunityUniverse = 'F&O' | 'NIFTY50' | 'NIFTY500' | 'CUSTOM';

export type OpportunityMarket = 'NSE' | 'BSE';

export type ScoreBreakdown = Record<string, number>;

export type EvidenceItem = {
  label: string;
  ok: boolean;
  detail?: string;
};

export type OpportunityHit = {
  id: string;
  scannerId: OpportunityScannerId;
  symbol: string;
  exchange: OpportunityMarket;
  price: number;
  changePercent: number;
  timeframe: OpportunityTimeframe;
  direction: OpportunityDirection;
  status: OpportunityStatus;
  score: number;
  breakdown: ScoreBreakdown;
  stateLabel: string;
  why: string;
  keyLevel: number | null;
  trigger: number | null;
  invalidation: string;
  confirmationNeeded: string;
  evidence: EvidenceItem[];
  detectedAt: number;
  dataMode: 'LIVE' | 'DEMO';
  /** Sector Leaders / composite extras */
  meta?: Record<string, string | number | boolean | string[]>;
};

export type ScannerCardState = {
  scannerId: OpportunityScannerId;
  title: string;
  tagline: string;
  status: 'idle' | 'scanning' | 'ready' | 'unavailable' | 'error';
  unavailableReason?: string;
  hits: OpportunityHit[];
  updatedAt: number | null;
};

export type OpportunityFilters = {
  market: OpportunityMarket;
  universe: OpportunityUniverse;
  timeframe: OpportunityTimeframe;
  direction: 'all' | OpportunityDirection;
  minScore: number;
  autoRefresh: boolean;
  refreshSec: 5 | 10 | 30 | 60;
};

export type OpportunityScanProgress = {
  status: 'idle' | 'scanning' | 'complete' | 'failed';
  symbolsChecked: number;
  symbolsTotal: number;
  phase: string;
  currentSymbol?: string | null;
  error?: string;
};

export type IndexPulse = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  available: boolean;
};

export const OPPORTUNITY_SCANNERS: {
  id: OpportunityScannerId;
  title: string;
  tagline: string;
  requires: 'ohlc' | 'oi' | 'delivery' | 'options' | 'sector';
}[] = [
  { id: 'momentum_surge', title: 'MOMENTUM SURGE', tagline: 'Price + volume expansion', requires: 'ohlc' },
  { id: 'flow_shift', title: 'FLOW SHIFT', tagline: 'Futures / OI positioning', requires: 'oi' },
  { id: 'liquidity_hunt', title: 'LIQUIDITY HUNT', tagline: 'Sweeps around key levels', requires: 'ohlc' },
  { id: 'compression_break', title: 'COMPRESSION BREAK', tagline: 'Range squeeze → expansion', requires: 'ohlc' },
  { id: 'momentum_fade', title: 'MOMENTUM FADE', tagline: 'Price up, momentum soft', requires: 'ohlc' },
  { id: 'breakout_radar', title: 'BREAKOUT RADAR', tagline: 'Swing / range breakouts', requires: 'ohlc' },
  { id: 'reversal_hunter', title: 'REVERSAL HUNTER', tagline: 'Exhaustion + reclaim watch', requires: 'ohlc' },
  { id: 'sector_leaders', title: 'SECTOR LEADERS', tagline: 'Relative sector strength', requires: 'sector' },
  { id: 'delivery_flow', title: 'DELIVERY FLOW', tagline: 'Delivery % behaviour', requires: 'delivery' },
  { id: 'trend_rider', title: 'TREND RIDER', tagline: 'Aligned directional trends', requires: 'ohlc' },
  { id: 'options_flow', title: 'OPTIONS FLOW', tagline: 'Strike / IV / PCR context', requires: 'options' },
  { id: 'wolf_prime', title: 'WOLF PRIME', tagline: 'Composite high-conviction', requires: 'ohlc' },
];

/** Visible rows per card before inner scrollbar. Ranked pool can be larger. */
export const OPPORTUNITY_CARD_VISIBLE = 6;
export const OPPORTUNITY_CARD_POOL = 12;

export const DEFAULT_OPPORTUNITY_FILTERS: OpportunityFilters = {
  market: 'NSE',
  universe: 'F&O',
  timeframe: '15m',
  direction: 'all',
  minScore: 60,
  autoRefresh: true,
  refreshSec: 30,
};
