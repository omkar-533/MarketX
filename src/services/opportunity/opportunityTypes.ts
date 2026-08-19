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

export type OpportunityUniverse = 'F&O' | 'NIFTY50' | 'NIFTY500' | 'CASH' | 'CUSTOM';

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

/** Desk cards — hide proxy/watch scanners until live OI/chain exists. */
export const OPPORTUNITY_SCANNERS: {
  id: OpportunityScannerId;
  title: string;
  tagline: string;
  requires: 'ohlc' | 'oi' | 'options' | 'sector';
}[] = [
  {
    id: 'wolf_prime',
    title: 'WOLF PRIME',
    tagline: 'Same name hits 2+ keepers on this bar — conviction overlay, not a new setup.',
    requires: 'ohlc',
  },
  {
    id: 'momentum_surge',
    title: 'PRICE RUNNERS',
    tagline: 'Aaj session mein jo actually move kiya — day move with volume, chase allowed.',
    requires: 'ohlc',
  },
  {
    id: 'compression_break',
    title: 'COMPRESSION BREAK',
    tagline: 'Prior range/ATR coiled, then a volume close left that box.',
    requires: 'ohlc',
  },
  {
    id: 'breakout_radar',
    title: 'BREAKOUT RADAR',
    tagline: 'Close beyond the prior 20-bar high or low, with volume, not a late chase.',
    requires: 'ohlc',
  },
  {
    id: 'liquidity_hunt',
    title: 'LIQUIDITY HUNT',
    tagline: 'Stop-hunt wick through a swing, then close back — sweep plus reclaim only.',
    requires: 'ohlc',
  },
  {
    id: 'trend_rider',
    title: 'TREND RIDER',
    tagline: 'EMA 21/50 stacked, RSI with the trend, and a pullback hold — not a chase.',
    requires: 'ohlc',
  },
];

/** Visible rows per card before inner scrollbar. Ranked pool can be larger. */
export const OPPORTUNITY_CARD_VISIBLE = 6;
export const OPPORTUNITY_CARD_POOL = 12;
/** Kept for scan option compatibility — the day board does not drop names. */
export const OPPORTUNITY_SCAN_CAP = Number.MAX_SAFE_INTEGER;

export const OPPORTUNITY_UNIVERSES = ['F&O'] as const;

export const DEFAULT_OPPORTUNITY_FILTERS: OpportunityFilters = {
  market: 'NSE',
  universe: 'F&O',
  timeframe: '5m',
  direction: 'all',
  minScore: 68,
  autoRefresh: true,
  refreshSec: 30,
};
