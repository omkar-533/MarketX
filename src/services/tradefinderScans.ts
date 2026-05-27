import type { FilterField, FilterGroup, FilterRule, Operator } from '../types/screener';

export type TradeFinderScanCategory =
  | 'Momentum'
  | 'Breakout'
  | 'Volume'
  | 'Gap'
  | 'Range'
  | 'VWAP'
  | 'Ichimoku'
  | 'Value'
  | 'Trend'
  | 'Options'
  | 'Investor'
  | 'Proprietary';

export interface TradeFinderScanPreset {
  label: string;
  description: string;
  category: TradeFinderScanCategory;
  slug: string;
  groups: FilterGroup[];
}

function r(
  id: string,
  field: FilterField,
  operator: Operator,
  value: number | string | boolean,
  logic: 'AND' | 'OR' = 'AND',
  extra?: Partial<FilterRule>,
): FilterRule {
  return {
    id,
    field,
    operator,
    value,
    logic,
    compareTarget: extra?.compareTarget ?? 'number',
    ruleType: extra?.ruleType ?? 'simple',
    ...extra,
  };
}

function g(id: string, name: string, rules: FilterRule[], logic: 'AND' | 'OR' = 'AND'): FilterGroup {
  return { id, name, logic, rules, children: [] };
}

/** TradeFinder365 / TradeFinder247 / tradefinder.in style quant & expert scans */
export const TRADEFINDER_SCAN_PRESETS: TradeFinderScanPreset[] = [
  // ─── Chartink / tradefinder.in ───
  {
    label: 'Market Master',
    slug: 'tradefinder-sort',
    category: 'Momentum',
    description: 'RSI momentum sort — strong RSI with positive change (Market Master sort)',
    groups: [
      g('tf-sort', 'Market Master', [
        r('tf-sort-1', 'rsi14', '>', 50),
        r('tf-sort-2', 'changePercent', '>', 0, 'AND'),
        r('tf-sort-3', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'sma20' }),
      ]),
    ],
  },
  {
    label: 'Sector Scope',
    slug: 'sector-scope',
    category: 'Momentum',
    description: 'Sector leaders — momentum + volume (Market Master Sector Scope)',
    groups: [
      g('tf-sector', 'Sector scope', [
        r('tf-sector-1', 'changePercent', '>', 1),
        r('tf-sector-2', 'volumeRatio', '>', 1.15, 'AND'),
        r('tf-sector-3', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'vwap' }),
      ]),
    ],
  },

  // ─── Finish Line family (TradeFinder365) ───
  {
    label: 'Finish Line Trending',
    slug: 'finish-line-trending',
    category: 'Trend',
    description: 'EMA stack + ADX trend — finish line style',
    groups: [
      g('tf-flt', 'Finish line trending', [
        r('tf-flt-1', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'ema20' }),
        r('tf-flt-2', 'ema20', '>', 0, 'AND', { compareTarget: 'field', compareField: 'ema50' }),
        r('tf-flt-3', 'adx', '>', 22, 'AND'),
        r('tf-flt-4', 'changePercent', '>', 0, 'AND'),
      ]),
    ],
  },
  {
    label: 'Finish Line with Gap',
    slug: 'finish-line-with-gap',
    category: 'Gap',
    description: 'Gap up + bullish close above SMA20',
    groups: [
      g('tf-flg', 'Finish line gap', [
        r('tf-flg-1', 'gapPercent', '>', 0.6),
        r('tf-flg-2', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'open' }),
        r('tf-flg-3', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'sma20' }),
      ]),
    ],
  },
  {
    label: 'Finish Line without Gap',
    slug: 'finish-line-without-gap',
    category: 'Trend',
    description: 'No gap — steady trend above SMA20 with volume',
    groups: [
      g('tf-flng', 'Finish line no gap', [
        r('tf-flng-1', 'gapPercent', 'between', 0, 'AND', { secondValue: 0.4 }),
        r('tf-flng-2', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'sma20' }),
        r('tf-flng-3', 'volumeRatio', '>', 1, 'AND'),
      ]),
    ],
  },

  // ─── 3R Quant scans ───
  {
    label: '3R Unusual Volume',
    slug: '3r-unusual-volume',
    category: 'Volume',
    description: 'Volume spike 2x+ with positive price',
    groups: [g('tf-3rv', '3R unusual volume', [r('tf-3rv-1', 'volumeRatio', '>', 2), r('tf-3rv-2', 'changePercent', '>', 0, 'AND')])],
  },
  {
    label: '3R VWAP Breakout',
    slug: '3r-vwap-breakout',
    category: 'VWAP',
    description: 'Price crosses above VWAP with volume',
    groups: [
      g('tf-3rvw', '3R VWAP breakout', [
        r('tf-3rvw-1', 'close', 'crosses_above', 0, 'AND', { compareTarget: 'field', compareField: 'vwap' }),
        r('tf-3rvw-2', 'volumeRatio', '>', 1.2, 'AND'),
      ]),
    ],
  },
  {
    label: '3R Trend Breakout',
    slug: '3r-trend-breakout',
    category: 'Trend',
    description: 'Above EMA50 with strong ADX',
    groups: [
      g('tf-3rt', '3R trend breakout', [
        r('tf-3rt-1', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'ema50' }),
        r('tf-3rt-2', 'adx', '>', 22, 'AND'),
        r('tf-3rt-3', 'macd', '>', 0, 'AND', { compareTarget: 'field', compareField: 'macdSignal' }),
      ]),
    ],
  },
  {
    label: '3R POC Breakout',
    slug: '3r-poc-breakout',
    category: 'VWAP',
    description: 'Above VWAP (POC proxy) with elevated volume',
    groups: [
      g('tf-3rp', '3R POC breakout', [
        r('tf-3rp-1', 'priceVsVwap', '>', 0),
        r('tf-3rp-2', 'volumeRatio', '>', 1.35, 'AND'),
      ]),
    ],
  },
  {
    label: '3R Value Zone Breakout',
    slug: '3r-value-zone-breakout',
    category: 'Value',
    description: 'Value names breaking above SMA20',
    groups: [
      g('tf-3rval', '3R value zone', [
        r('tf-3rval-1', 'pe', '<', 28),
        r('tf-3rval-2', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'sma20' }),
        r('tf-3rval-3', 'changePercent', '>', 0, 'AND'),
      ]),
    ],
  },
  {
    label: '3R Profile Breakout',
    slug: '3r-profile-breakout',
    category: 'Volume',
    description: 'Volume profile style — high volume bullish day',
    groups: [
      g('tf-3rprof', '3R profile breakout', [
        r('tf-3rprof-1', 'volumeRatio', '>', 1.5),
        r('tf-3rprof-2', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'open' }),
        r('tf-3rprof-3', 'changePercent', '>', 0.5, 'AND'),
      ]),
    ],
  },
  {
    label: 'Multi Day VWAP Breakout',
    slug: 'multi-day-vwap-breakout',
    category: 'VWAP',
    description: 'Sustained move above VWAP with RSI support',
    groups: [
      g('tf-mdv', 'Multi-day VWAP', [
        r('tf-mdv-1', 'priceVsVwap', '>', 0.25),
        r('tf-mdv-2', 'rsi14', '>', 50, 'AND'),
        r('tf-mdv-3', 'volumeRatio', '>', 1, 'AND'),
      ]),
    ],
  },

  // ─── Exceptional / Brace / Donchian ───
  {
    label: 'The Exceptional',
    slug: 'the-exceptional',
    category: 'Momentum',
    description: 'RSI + MACD + SMA50 strength',
    groups: [
      g('tf-exc', 'The exceptional', [
        r('tf-exc-1', 'rsi14', '>', 58),
        r('tf-exc-2', 'macd', '>', 0, 'AND', { compareTarget: 'field', compareField: 'macdSignal' }),
        r('tf-exc-3', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'sma50' }),
        r('tf-exc-4', 'volumeRatio', '>', 1.15, 'AND'),
      ]),
    ],
  },
  {
    label: 'Brace Bar Breakout',
    slug: 'brace-bar-breakout',
    category: 'Breakout',
    description: 'Breakout bar above 20-day high with volume',
    groups: [
      g('tf-bbb', 'Brace bar breakout', [
        r('tf-bbb-1', 'close', '>', 20, 'AND', { ruleType: 'max', period: 20 }),
        r('tf-bbb-2', 'volumeRatio', '>', 1.3, 'AND'),
      ]),
    ],
  },
  {
    label: 'Donchian Breakout',
    slug: 'donchian-breakout',
    category: 'Breakout',
    description: 'Close above 20-period high channel',
    groups: [g('tf-don', 'Donchian breakout', [r('tf-don-1', 'close', '>', 20, 'AND', { ruleType: 'max', period: 20 })])],
  },
  {
    label: 'Rising Donchian',
    slug: 'rising-donchian',
    category: 'Breakout',
    description: 'Price above SMA20 near channel high',
    groups: [
      g('tf-rdon', 'Rising Donchian', [
        r('tf-rdon-1', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'sma20' }),
        r('tf-rdon-2', 'close', '>', 15, 'AND', { ruleType: 'max', period: 20 }),
        r('tf-rdon-3', 'aroonUp', '>', 60, 'AND'),
      ]),
    ],
  },
  {
    label: 'Triple Zone Breakout',
    slug: 'triple-zone-breakout',
    category: 'Breakout',
    description: 'Above SMA20, EMA20 and VWAP',
    groups: [
      g('tf-tz', 'Triple zone', [
        r('tf-tz-1', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'sma20' }),
        r('tf-tz-2', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'ema20' }),
        r('tf-tz-3', 'priceVsVwap', '>', 0, 'AND'),
      ]),
    ],
  },
  {
    label: 'Rush Levels',
    slug: 'rush-levels',
    category: 'Momentum',
    description: 'Fast movers — strong % change + volume',
    groups: [
      g('tf-rush', 'Rush levels', [
        r('tf-rush-1', 'changePercent', '>', 2),
        r('tf-rush-2', 'volumeRatio', '>', 1.5, 'AND'),
      ]),
    ],
  },
  {
    label: 'Trend Terminator',
    slug: 'trend-terminator',
    category: 'Momentum',
    description: 'Overbought exhaustion — high RSI weakening MACD',
    groups: [
      g('tf-tt', 'Trend terminator', [
        r('tf-tt-1', 'rsi14', '>', 72),
        r('tf-tt-2', 'macdHist', '<', 0, 'AND'),
      ]),
    ],
  },
  {
    label: 'The Performer',
    slug: 'the-performer',
    category: 'Momentum',
    description: 'Top AI score momentum names',
    groups: [
      g('tf-perf', 'The performer', [
        r('tf-perf-1', 'aiScore', '>', 72),
        r('tf-perf-2', 'changePercent', '>', 1.2, 'AND'),
      ]),
    ],
  },

  // ─── Launcher series ───
  {
    label: 'Launcher S1',
    slug: 'launcher-s1',
    category: 'Gap',
    description: 'Gap + volume ignition',
    groups: [
      g('tf-l1', 'Launcher S1', [
        r('tf-l1-1', 'gapPercent', '>', 1),
        r('tf-l1-2', 'volumeRatio', '>', 2, 'AND'),
        r('tf-l1-3', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'open' }),
      ]),
    ],
  },
  {
    label: 'Launcher S2',
    slug: 'launcher-s2',
    category: 'Trend',
    description: 'Short EMA stack breakout',
    groups: [
      g('tf-l2', 'Launcher S2', [
        r('tf-l2-1', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'ema9' }),
        r('tf-l2-2', 'ema9', '>', 0, 'AND', { compareTarget: 'field', compareField: 'ema20' }),
        r('tf-l2-3', 'adx', '>', 18, 'AND'),
      ]),
    ],
  },
  {
    label: 'Launcher S3',
    slug: 'launcher-s3',
    category: 'Breakout',
    description: 'Breakout flag with volume',
    groups: [
      g('tf-l3', 'Launcher S3', [
        r('tf-l3-1', 'breakout', '=', true),
        r('tf-l3-2', 'volumeRatio', '>', 1.4, 'AND'),
      ]),
    ],
  },
  {
    label: 'Launcher S4',
    slug: 'launcher-s4',
    category: 'Breakout',
    description: 'Upper Bollinger expansion',
    groups: [
      g('tf-l4', 'Launcher S4', [
        r('tf-l4-1', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'upperBB' }),
        r('tf-l4-2', 'bbPercentB', '>', 80, 'AND'),
      ]),
    ],
  },

  // ─── Ichimoku ───
  {
    label: 'Ichi Rising Star',
    slug: 'ichi-rising-star',
    category: 'Ichimoku',
    description: 'Price above Ichimoku base with conversion strength',
    groups: [
      g('tf-ichi1', 'Ichi rising star', [
        r('tf-ichi1-1', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'ichimokuBase' }),
        r('tf-ichi1-2', 'ichimokuConversion', '>', 0, 'AND', { compareTarget: 'field', compareField: 'ichimokuBase' }),
      ]),
    ],
  },
  {
    label: 'Ichi Cloud Touch',
    slug: 'ichi-cloud-touch',
    category: 'Ichimoku',
    description: 'Near Ichimoku base — bounce setup',
    groups: [
      g('tf-ichi2', 'Ichi cloud touch', [
        r('tf-ichi2-1', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'ichimokuBase' }),
        r('tf-ichi2-2', 'changePercent', '>', -0.5, 'AND'),
        r('tf-ichi2-3', 'rsi14', '>', 45, 'AND'),
      ]),
    ],
  },
  {
    label: 'Momentum Transformer',
    slug: 'momentum-transformer',
    category: 'Momentum',
    description: 'MACD cross with RSI and volume',
    groups: [
      g('tf-mt', 'Momentum transformer', [
        r('tf-mt-1', 'macd', 'crosses_above', 0, 'AND', { compareTarget: 'field', compareField: 'macdSignal' }),
        r('tf-mt-2', 'rsi14', '>', 52, 'AND'),
        r('tf-mt-3', 'volumeRatio', '>', 1.1, 'AND'),
      ]),
    ],
  },

  // ─── Range family ───
  {
    label: 'I-Range Crusher',
    slug: 'i-range-crusher',
    category: 'Range',
    description: 'Intraday range expansion bullish',
    groups: [
      g('tf-irc', 'I-Range crusher', [
        r('tf-irc-1', 'dayRangePercent', '>', 3),
        r('tf-irc-2', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'open' }),
      ]),
    ],
  },
  {
    label: 'I-Range Conqueror',
    slug: 'i-range-conqueror',
    category: 'Range',
    description: 'Range expansion above VWAP',
    groups: [
      g('tf-irco', 'I-Range conqueror', [
        r('tf-irco-1', 'dayRangePercent', '>', 2.5),
        r('tf-irco-2', 'priceVsVwap', '>', 0, 'AND'),
      ]),
    ],
  },
  {
    label: 'Range Crusher',
    slug: 'range-crusher',
    category: 'Range',
    description: '20-day high breakout with volume',
    groups: [
      g('tf-rc', 'Range crusher', [
        r('tf-rc-1', 'close', '>', 20, 'AND', { ruleType: 'max', period: 20 }),
        r('tf-rc-2', 'volumeRatio', '>', 1.2, 'AND'),
      ]),
    ],
  },
  {
    label: 'Range Conqueror',
    slug: 'range-conqueror',
    category: 'Range',
    description: 'Trend + range expansion',
    groups: [
      g('tf-rcon', 'Range conqueror', [
        r('tf-rcon-1', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'sma20' }),
        r('tf-rcon-2', 'dayRangePercent', '>', 2, 'AND'),
      ]),
    ],
  },

  // ─── TradeFinder247 investor style scans ───
  {
    label: 'Active Investor',
    slug: 'active-investor',
    category: 'Investor',
    description: 'Active style — trend + volume (TF247)',
    groups: [
      g('tf-act', 'Active investor', [
        r('tf-act-1', 'changePercent', '>', 0.5),
        r('tf-act-2', 'volumeRatio', '>', 1, 'AND'),
        r('tf-act-3', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'sma20' }),
      ]),
    ],
  },
  {
    label: 'Passive Investor',
    slug: 'passive-investor',
    category: 'Investor',
    description: 'Quality + delivery focus (TF247)',
    groups: [
      g('tf-pass', 'Passive investor', [
        r('tf-pass-1', 'pe', '<', 35),
        r('tf-pass-2', 'delivery', '>', 38, 'AND'),
        r('tf-pass-3', 'changePercent', '>', -1, 'AND'),
      ]),
    ],
  },
  {
    label: 'Fund Manager Scan',
    slug: 'fund-manager',
    category: 'Investor',
    description: 'Large cap Nifty quality (TF247)',
    groups: [
      g('tf-fm', 'Fund manager', [
        r('tf-fm-1', 'inNifty50', '=', true),
        r('tf-fm-2', 'pe', '<', 45, 'AND'),
        r('tf-fm-3', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'sma50' }),
      ]),
    ],
  },
  {
    label: 'Momentum Scan',
    slug: 'momentum-scan',
    category: 'Momentum',
    description: 'High probability momentum (TF247)',
    groups: [
      g('tf-mom', 'Momentum', [
        r('tf-mom-1', 'rsi14', '>', 58),
        r('tf-mom-2', 'changePercent', '>', 1, 'AND'),
        r('tf-mom-3', 'macdHist', '>', 0, 'AND'),
      ]),
    ],
  },
  {
    label: 'Breakout Scan',
    slug: 'breakout-scan',
    category: 'Breakout',
    description: 'Price breakout scan (TF247)',
    groups: [
      g('tf-brk', 'Breakout', [
        r('tf-brk-1', 'breakout', '=', true),
        r('tf-brk-2', 'volumeRatio', '>', 1.2, 'AND'),
      ]),
    ],
  },
  {
    label: 'Breakdown Scan',
    slug: 'breakdown-scan',
    category: 'Breakout',
    description: 'Bearish breakdown below SMA20 (TF247)',
    groups: [
      g('tf-bd', 'Breakdown', [
        r('tf-bd-1', 'changePercent', '<', -1),
        r('tf-bd-2', 'close', '<', 0, 'AND', { compareTarget: 'field', compareField: 'sma20' }),
      ]),
    ],
  },
  {
    label: 'Volume Scan',
    slug: 'volume-scan',
    category: 'Volume',
    description: 'Volume based TF247 scan',
    groups: [g('tf-vol', 'Volume scan', [r('tf-vol-1', 'volumeRatio', '>', 1.8)])],
  },
  {
    label: 'Value Scan',
    slug: 'value-scan',
    category: 'Value',
    description: 'Value investing filter (TF247)',
    groups: [
      g('tf-val', 'Value scan', [
        r('tf-val-1', 'pe', '<', 22),
        r('tf-val-2', 'priceToBook', '<', 4, 'AND'),
      ]),
    ],
  },
  {
    label: 'Gap Scan',
    slug: 'gap-scan',
    category: 'Gap',
    description: 'Gap up / gap down movers (TF247)',
    groups: [
      g('tf-gap', 'Gap scan', [
        r('tf-gap-1', 'gapPercent', '>', 1),
        r('tf-gap-2', 'volumeRatio', '>', 1.1, 'AND'),
      ]),
    ],
  },
  {
    label: 'Range Scan',
    slug: 'range-scan',
    category: 'Range',
    description: 'Wide range day stocks (TF247)',
    groups: [g('tf-range', 'Range scan', [r('tf-range-1', 'dayRangePercent', '>', 2.8)])],
  },
  {
    label: 'Options Scan',
    slug: 'options-scan',
    category: 'Options',
    description: 'F&O names with OI build-up (TF247)',
    groups: [
      g('tf-opt', 'Options scan', [
        r('tf-opt-1', 'isFno', '=', true),
        r('tf-opt-2', 'oiChange', '>', 3, 'AND'),
        r('tf-opt-3', 'volumeRatio', '>', 1.1, 'AND'),
      ]),
    ],
  },
  {
    label: 'Short Term Scan',
    slug: 'short-term',
    category: 'Investor',
    description: 'Short-term movers (TF247 time based)',
    groups: [
      g('tf-st', 'Short term', [
        r('tf-st-1', 'changePercent', '>', 1.5),
        r('tf-st-2', 'rsi14', '>', 55, 'AND'),
      ]),
    ],
  },
  {
    label: 'Long Term Scan',
    slug: 'long-term',
    category: 'Investor',
    description: 'Above SMA200 — long-term trend (TF247)',
    groups: [
      g('tf-lt', 'Long term', [
        r('tf-lt-1', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'sma200' }),
        r('tf-lt-2', 'pe', '<', 50, 'AND'),
      ]),
    ],
  },
  {
    label: 'Proprietary Bullish',
    slug: 'proprietary-bullish',
    category: 'Proprietary',
    description: 'Proprietary multi-factor bullish (TF247)',
    groups: [
      g('tf-prop', 'Proprietary', [
        r('tf-prop-1', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'supertrend' }),
        r('tf-prop-2', 'adx', '>', 20, 'AND'),
        r('tf-prop-3', 'volumeRatio', '>', 1.15, 'AND'),
        r('tf-prop-4', 'signal', '=', 'BUY', 'AND'),
      ]),
    ],
  },
  {
    label: 'Live Scanner Momentum',
    slug: 'live-scanner-momentum',
    category: 'Momentum',
    description: 'Market Master live scanner — momentum burst',
    groups: [
      g('tf-live', 'Live momentum', [
        r('tf-live-1', 'changePercent', '>', 0.8),
        r('tf-live-2', 'volumeRatio', '>', 1.2, 'AND'),
        r('tf-live-3', 'isFno', '=', true, 'AND'),
      ]),
    ],
  },
  {
    label: 'Entry Precision',
    slug: 'entry-precision',
    category: 'Trend',
    description: 'Entry timing — VWAP + RSI + trend (Market Master)',
    groups: [
      g('tf-entry', 'Entry precision', [
        r('tf-entry-1', 'priceVsVwap', '>', 0),
        r('tf-entry-2', 'rsi14', 'between', 45, 'AND', { secondValue: 68 }),
        r('tf-entry-3', 'close', '>', 0, 'AND', { compareTarget: 'field', compareField: 'ema20' }),
      ]),
    ],
  },
];

export const TRADEFINDER_CATEGORIES: TradeFinderScanCategory[] = [
  'Momentum',
  'Breakout',
  'Volume',
  'Gap',
  'Range',
  'VWAP',
  'Ichimoku',
  'Value',
  'Trend',
  'Options',
  'Investor',
  'Proprietary',
];

export function findTradeFinderPreset(query: string): TradeFinderScanPreset | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return TRADEFINDER_SCAN_PRESETS.find(
    (p) =>
      p.label.toLowerCase() === q ||
      p.slug === q ||
      q.includes(p.slug) ||
      p.label.toLowerCase().replace(/\s+/g, '-').includes(q),
  );
}
