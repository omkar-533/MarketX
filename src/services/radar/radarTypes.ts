/** WOLF RADAR shared types — market intelligence (not broker execution). */

export type RadarTimeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';

export type RadarMarket = 'NSE' | 'BSE';

export type RadarUniverse = 'F&O' | 'NIFTY50' | 'CASH';

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
  strength: number;
  trendState: string;
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
};

export type RadarScanRequest = {
  market: RadarMarket;
  universe: RadarUniverse;
  timeframe: RadarTimeframe;
};

export type RadarScanProgress = {
  status: 'idle' | 'scanning' | 'complete' | 'failed';
  symbolsChecked: number;
  symbolsTotal: number;
  phase: string;
  lastScanAt: number | null;
  error?: string;
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
