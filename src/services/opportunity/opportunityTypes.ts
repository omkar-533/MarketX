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

export const OPPORTUNITY_SCANNERS: {
  id: OpportunityScannerId;
  title: string;
  tagline: string;
  requires: 'ohlc' | 'oi' | 'options' | 'sector';
}[] = [
  {
    id: 'breakout_radar',
    title: 'BREAKOUT RADAR',
    tagline: 'Price closed above a recent high or below a recent low, with volume confirming the break.',
    requires: 'ohlc',
  },
  {
    id: 'momentum_surge',
    title: 'MOMENTUM SURGE',
    tagline: 'Sharp price move plus unusual volume versus the stock\'s own recent average (RVOL).',
    requires: 'ohlc',
  },
  {
    id: 'compression_break',
    title: 'COMPRESSION BREAK',
    tagline: 'ATR/range squeezed tight, then price left that box — expansion after a quiet coil.',
    requires: 'ohlc',
  },
  {
    id: 'trend_rider',
    title: 'TREND RIDER',
    tagline: 'EMA 21/50 stacked one way, RSI agreeing, and price holding a pullback to the trend.',
    requires: 'ohlc',
  },
  {
    id: 'liquidity_hunt',
    title: 'LIQUIDITY HUNT',
    tagline: 'Equal highs/lows swept (stop-hunt), then reclaim — SMC liquidity, not a random mover.',
    requires: 'ohlc',
  },
  {
    id: 'wolf_prime',
    title: 'WOLF PRIME',
    tagline: 'Same name hits 2+ of the scanners above on this bar — conviction overlay, not a new setup.',
    requires: 'ohlc',
  },
  {
    id: 'momentum_fade',
    title: 'MOMENTUM FADE',
    tagline: 'Price still stretching while RSI momentum cools — a watch for exhaustion, not a reversal call.',
    requires: 'ohlc',
  },
  {
    id: 'reversal_hunter',
    title: 'REVERSAL HUNTER',
    tagline: 'Extended RSI/move plus a liquidity sweep. Needs reclaim confirmation before it is a trade.',
    requires: 'ohlc',
  },
  {
    id: 'sector_leaders',
    title: 'SECTOR LEADERS',
    tagline: 'Stocks leading or lagging their sector versus peers on the same scan (relative strength).',
    requires: 'sector',
  },
  {
    id: 'flow_shift',
    title: 'FLOW SHIFT',
    tagline: 'Price up/down with volume up/down as a futures OI buildup proxy. Live OI feed is not used.',
    requires: 'ohlc',
  },
  {
    id: 'options_flow',
    title: 'OPTIONS FLOW',
    tagline: 'ATR and the day range expanding with volume. Not option-chain OI, PCR, or strike data.',
    requires: 'ohlc',
  },
];

/** Visible rows per card before inner scrollbar. Ranked pool can be larger. */
export const OPPORTUNITY_CARD_VISIBLE = 6;
export const OPPORTUNITY_CARD_POOL = 12;
/** Max names kept per scanner after a full scan — always the highest scores, never first-arrived. */
export const OPPORTUNITY_SCAN_CAP = 80;

export const OPPORTUNITY_UNIVERSES = ['F&O', 'CASH'] as const;

export const DEFAULT_OPPORTUNITY_FILTERS: OpportunityFilters = {
  market: 'NSE',
  universe: 'F&O',
  timeframe: '5m',
  direction: 'all',
  minScore: 60,
  autoRefresh: true,
  refreshSec: 30,
};
