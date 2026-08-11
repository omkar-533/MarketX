/** WOLF RADAR shared types — market intelligence (not broker execution). */

export type RadarTimeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';

export type RadarMarket = 'NSE' | 'BSE';

export type RadarUniverse = 'F&O' | 'NSE' | 'BSE' | 'NIFTY50' | 'CASH' | 'BANKNIFTY';

export type RadarBias = 'bullish' | 'bearish' | 'neutral';

export type RadarSetupStatus =
  | 'WATCH'
  | 'CONFIRMATION PENDING'
  | 'SETUP DEVELOPING'
  | 'SETUP CONFIRMED'
  | 'INVALIDATED';

export type RadarSetupType =
  | 'Liquidity Sweep'
  | 'Breakout'
  | 'Breakdown'
  | 'Structure Shift'
  | 'Trend Continuation'
  | 'Reversal'
  | 'Volume Expansion'
  | 'Multi-Timeframe Alignment';

export type Candle = {
  symbol: string;
  exchange: string;
  instrumentToken?: string;
  timeframe: RadarTimeframe;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Aggregated from a smaller timeframe when provider lacks native TF */
  derived?: boolean;
};

export type ScoreBreakdown = {
  structure: number;
  liquidity: number;
  volume: number;
  momentum: number;
  htfAlignment: number;
  volatility: number;
  setupQuality: number;
};

export type WolfScore = {
  score: number;
  breakdown: ScoreBreakdown;
};

export type MarketPulseItem = {
  symbol: string;
  direction: RadarBias;
  /** Optional legacy score — omit when not meaningfully computed. */
  strength?: number | null;
  trendState: string;
  structure?: string;
  momentum?: string;
  relativeVolume?: number | null;
  regime?: string;
  note?: string;
};

export type RadarResult = {
  id: string;
  symbol: string;
  exchange: string;
  price: number;
  timeframe: RadarTimeframe;
  setupType: RadarSetupType;
  direction: RadarBias;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  status: RadarSetupStatus;
  confirmations: string[];
  structure: string;
  liquidity: string;
  volume: string;
  momentum: string;
  htfAlignment: boolean;
  keyLevels: { label: string; price: number }[];
  invalidation: string;
  explanation: string;
  detectedAt: number;
  /** DEMO until a real authorized provider is active */
  dataMode: 'DEMO' | 'LIVE';
  /** When filtered by Strategy Lab scan — human-readable matched labels */
  matchedConditions?: string[];
  strategyName?: string;
  strategyId?: string;
};

export type RadarScanRequest = {
  market: RadarMarket;
  universe: RadarUniverse;
  timeframe: RadarTimeframe;
  /** Max cards shown — FULL universe is still scanned */
  displayLimit?: number;
};

export type RadarScanProgress = {
  status: 'idle' | 'scanning' | 'complete' | 'failed';
  symbolsChecked: number;
  symbolsTotal: number;
  phase: string;
  lastScanAt: number | null;
  error?: string;
  currentSymbol?: string | null;
  matchedSoFar?: number;
  noMatchSoFar?: number;
  unavailableSoFar?: number;
  errorsSoFar?: number;
};

export type RadarScanIssue = {
  symbol: string;
  reason: string;
};

export type RadarScanSummary = {
  universe: RadarUniverse;
  universeLoaded: number;
  scanned: number;
  matched: number;
  unavailable: number;
  errors: number;
  developing: number;
  watch: number;
  confirmed: number;
  durationMs: number;
  displayLimit: number;
  displayed: number;
};

export type RadarScanOutcome = {
  results: RadarResult[];
  allMatches: RadarResult[];
  summary: RadarScanSummary;
  issues: RadarScanIssue[];
};

export type UserSetupCondition =
  | 'liquidity_sweep'
  | 'structure_shift'
  | 'volume_expansion'
  | 'htf_bullish'
  | 'htf_bearish'
  | 'breakout'
  | 'breakdown'
  | 'reversal';

export type UserSetup = {
  id: string;
  name: string;
  conditions: UserSetupCondition[];
  timeframe: RadarTimeframe;
  createdAt: number;
};

export type WatchlistItem = {
  symbol: string;
  resultId?: string;
  score?: number;
  setupType?: RadarSetupType;
  status?: RadarSetupStatus;
  addedAt: number;
  lastDetectedAt?: number;
};

export type RadarAnalyzeContext = {
  symbol: string;
  timeframe: RadarTimeframe;
  setup: RadarSetupType;
  score: number;
  structure: string;
  liquidity: string;
  volume: string;
  momentum: string;
  htfAlignment: boolean;
  keyLevels: { label: string; price: number }[];
  invalidation: string;
  explanation: string;
  status: RadarSetupStatus;
  scanTimestamp: number;
  source: 'WOLF_RADAR';
  dataMode: 'DEMO' | 'LIVE';
};
