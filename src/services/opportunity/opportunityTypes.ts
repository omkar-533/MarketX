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
  | 'wolf_hunters'
  | 'rally_rider'
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

/**
 * Wilder RSI printed at each bar close: [barCloseMs, rsi].
 * Built server-side because 30m/2h history is not in the 5m board snapshot.
 */
export type RsiPoint = [number, number];

export type SymbolRsiSeries = {
  m5: RsiPoint[];
  m30: RsiPoint[];
  h2: RsiPoint[];
};

export type IndexPulse = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  available: boolean;
};

/**
 * Desk cards. The desk runs Morning Sprint and Boosters only — every other
 * scanner still exists in opportunityScanners.ts but is off the board, so it is
 * neither evaluated nor stored.
 */
export const OPPORTUNITY_SCANNERS: {
  id: OpportunityScannerId;
  title: string;
  tagline: string;
  requires: 'ohlc' | 'oi' | 'options' | 'sector';
  /** Timeframes this scanner is actually built for. First entry is the card default. */
  timeframes: OpportunityTimeframe[];
}[] = [
  {
    id: 'wolf_hunters',
    title: 'WOLF HUNTERS',
    tagline:
      '1h: candle mother ke andar khule, wick se uska high/low hunt kare aur mother ke 50% ke andar hi band ho. Sweep price ka 0.1% aur mother range ka 10% hona chahiye. Mother khud inside bar (open+close pichhli candle ke andar) nahi honi chahiye.',
    requires: 'ohlc',
    // The rule is written on hourly candles and reads null anywhere else.
    timeframes: ['1h'],
  },
  {
    id: 'rally_rider',
    title: 'RALLY RIDER',
    tagline:
      '1h: lagataar do sweep ek hi taraf — candle 2 ne candle 1 ka low liya, candle 3 ne candle 2 ka low liya, aur dono apni-apni swept half me band hui (short me ulta). SL candle 3 ke low/high par.',
    requires: 'ohlc',
    // A chain of hourly sweeps — scanRallyRider returns null on every other timeframe.
    timeframes: ['1h'],
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
  // Every desk card is an hourly rule — see PRIMARY_TIMEFRAME.
  timeframe: '1h',
  direction: 'all',
  minScore: 55,
  autoRefresh: true,
  refreshSec: 30,
};
