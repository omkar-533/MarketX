export type ScannerMode = 'manual' | 'ai' | 'code';
export type ScannerCategory = 'Momentum' | 'Breakout' | 'Volume' | 'OI' | 'Custom';

/** Chartink scan universe */
export type ScanSegment =
  | 'all'
  | 'nifty50'
  | 'nifty500'
  | 'banknifty'
  | 'midcap'
  | 'smallcap'
  | 'fno'
  | 'watchlist';

/** Chartink timeframes */
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '1D' | '1W';

/** Chartink-style candle offset */
export type TimeOffset = 'latest' | 'prev1' | 'prev5' | 'prev20';

export type CompareTarget = 'number' | 'field';

export type ArithmeticOp = 'none' | 'add' | 'subtract' | 'multiply' | 'divide';

export type RuleType =
  | 'simple'
  | 'max'
  | 'min'
  | 'count'
  | 'countstreak'
  | 'greatest'
  | 'least'
  | 'bracket';

export type FilterField =
  | 'price'
  | 'close'
  | 'open'
  | 'high'
  | 'low'
  | 'changePercent'
  | 'vwap'
  | 'hl2'
  | 'hlc3'
  | 'ohlc4'
  | 'haOpen'
  | 'haHigh'
  | 'haLow'
  | 'haClose'
  | 'gapPercent'
  | 'dayRangePercent'
  | 'priceVsVwap'
  | 'volume'
  | 'avgVolume'
  | 'volumeRatio'
  | 'oi'
  | 'oiChange'
  | 'fnoLotSize'
  | 'sma5'
  | 'sma10'
  | 'sma20'
  | 'sma50'
  | 'sma200'
  | 'ema9'
  | 'ema20'
  | 'ema50'
  | 'wma20'
  | 'tema20'
  | 'hma20'
  | 'vwma20'
  | 'rsi'
  | 'rsi14'
  | 'stochRsi'
  | 'macd'
  | 'macdSignal'
  | 'macdHist'
  | 'stochK'
  | 'stochD'
  | 'slowStochK'
  | 'slowStochD'
  | 'cci'
  | 'cmf'
  | 'mfi'
  | 'williamsR'
  | 'obv'
  | 'atr'
  | 'trueRange'
  | 'upperBB'
  | 'lowerBB'
  | 'bbPercentB'
  | 'adx'
  | 'adxDiPlus'
  | 'adxDiMinus'
  | 'supertrend'
  | 'parabolicSar'
  | 'aroonUp'
  | 'aroonDown'
  | 'ichimokuBase'
  | 'ichimokuConversion'
  | 'pivot'
  | 'pivotR1'
  | 'pivotR2'
  | 'pivotS1'
  | 'pivotS2'
  | 'marketCap'
  | 'marketCapName'
  | 'pe'
  | 'ttmPe'
  | 'ttmEps'
  | 'bookValue'
  | 'priceToBook'
  | 'ttmSales'
  | 'delivery'
  | 'sector'
  | 'industry'
  | 'symbol'
  | 'signal'
  | 'pattern'
  | 'breakout'
  | 'aiScore'
  | 'inNifty50'
  | 'inNifty500'
  | 'inBankNifty'
  | 'isFno'
  | 'maxHigh20'
  | 'minLow20'
  | 'maxHigh50'
  | 'minLow50'
  | 'rollingHigh'
  | 'rollingLow';

export type Operator =
  | '>'
  | '<'
  | '='
  | '!='
  | 'between'
  | 'contains'
  | 'not contains'
  | 'crosses_above'
  | 'crosses_below';

export interface FilterRule {
  id: string;
  field: FilterField;
  operator: Operator;
  value: number | string | boolean;
  secondValue?: number | string | boolean;
  logic: 'AND' | 'OR';
  offset?: TimeOffset;
  timeframe?: Timeframe;
  compareTarget?: CompareTarget;
  compareField?: FilterField;
  compareOffset?: TimeOffset;
  compareTimeframe?: Timeframe;
  ruleType?: RuleType;
  period?: number;
  /** Chartink: + - * / on left operand */
  arithmeticOp?: ArithmeticOp;
  arithmeticValue?: number;
  /** For greatest/least — extra fields */
  extraFields?: FilterField[];
  /** Bracket wraps inner compare */
  bracketInner?: boolean;
}

export interface FilterGroup {
  id: string;
  name: string;
  logic: 'AND' | 'OR';
  rules: FilterRule[];
  children: FilterGroup[];
}

export interface SavedScreener {
  id: string;
  ownerId?: string;
  name: string;
  category: ScannerCategory;
  description: string;
  mode: ScannerMode;
  groups: FilterGroup[];
  codeScript: string;
  segment?: ScanSegment;
  topLevelLogic?: 'AND' | 'OR';
  createdAt: string;
  updatedAt: string;
}
