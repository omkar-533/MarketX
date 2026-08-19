/**
 * Wolf Opportunity — types for the market-intelligence dashboard.
 * Scores are setup quality / condition strength — never profit probability.
 */

export type OpportunityScannerId =
  | 'morning_sprint'
  | 'top_movers'
  | 'momentum_surge'
  | 'opening_drive'
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
    tagline: 'Early + confirmed keepers on the same side — conviction overlay, not a new setup.',
    requires: 'ohlc',
  },
  {
    id: 'morning_sprint',
    title: 'MORNING SPRINT',
    tagline: '9:20–10:50. WATCH on gap/early volume, ACTIVE on the blast.',
    requires: 'ohlc',
  },
  {
    id: 'top_movers',
    title: 'TOP MOVERS',
    tagline: 'Accelerating now with live volume — dead day winners drop off.',
    requires: 'ohlc',
  },
  {
    id: 'opening_drive',
    title: 'OPENING DRIVE',
    tagline: 'WATCH at the 9:15–9:30 range edge, ACTIVE on the close beyond.',
    requires: 'ohlc',
  },
  {
    id: 'momentum_surge',
    title: 'PRICE RUNNERS',
    tagline: 'Volume first, price second — WATCH inside the box, ACTIVE on the burst.',
    requires: 'ohlc',
  },
  {
    id: 'compression_break',
    title: 'COMPRESSION BREAK',
    tagline: 'WATCH while the coil presses the box, ACTIVE on the volume close out.',
    requires: 'ohlc',
  },
  {
    id: 'breakout_radar',
    title: 'BREAKOUT RADAR',
    tagline: 'No coil. WATCH at the 20-bar level, ACTIVE on the close — not Compression.',
    requires: 'ohlc',
  },
  {
    id: 'liquidity_hunt',
    title: 'LIQUIDITY HUNT',
    tagline: 'WATCH on the stop-hunt wick, CONFIRM when it reclaims.',
    requires: 'ohlc',
  },
  {
    id: 'trend_rider',
    title: 'TREND RIDER',
    tagline: 'WATCH on first EMA/VWAP touch, ACTIVE on the pullback hold.',
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
  minScore: 55,
  autoRefresh: true,
  refreshSec: 30,
};
