# tradingViewSymbols.ts late patches

## L9642 StrReplace

### old_string
```
/** Timeframes our OHLC backend can resolve; 3m and monthly have no mapping. */
const NATIVE_INTERVAL: Partial<Record<TvInterval, string>> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '120': '2h',
  '240': '4h',
  D: '1d',
  W: '1w',
};
```

### new_string
```
/** Timeframes our OHLC backend can resolve. */
const NATIVE_INTERVAL: Partial<Record<TvInterval, string>> = {
  '1': '1m',
  '3': '3m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '120': '2h',
  '240': '4h',
  D: '1d',
  W: '1w',
  M: '1M',
};
```

## L9742 StrReplace

### old_string
```
const NATIVE_STUDY_IDS = new Set([
  'ema',
  'sma',
  'bb',
  'vwap',
  'supertrend',
  'rsi',
  'macd',
  'stoch',
  'atr',
]);

export const NATIVE_STUDY_PRESETS = TV_STUDY_PRESETS.filter((s) => NATIVE_STUDY_IDS.has(s.id));
```

### new_string
```
const NATIVE_STUDY_IDS = new Set([
  'ema',
  'sma',
  'bb',
  'vwap',
  'supertrend',
  'rsi',
  'macd',
  'stoch',
  'atr',
  ...wolfIndicatorIds(),
]);

export const NATIVE_STUDY_PRESETS = TV_STUDY_PRESETS.filter((s) =>
  ['ema', 'sma', 'bb', 'vwap', 'supertrend', 'rsi', 'macd', 'stoch', 'atr'].includes(s.id),
);
```

## L9748 StrReplace

### old_string
```
const NATIVE_STUDY_IDS = new Set([
  'ema',
  'sma',
  'bb',
  'vwap',
  'supertrend',
  'rsi',
  'macd',
  'stoch',
  'atr',
  ...wolfIndicatorIds(),
]);

export const NATIVE_STUDY_PRESETS = TV_STUDY_PRESETS.filter((s) =>
  ['ema', 'sma', 'bb', 'vwap', 'supertrend', 'rsi', 'macd', 'stoch', 'atr'].includes(s.id),
);

```

### new_string
```
export const NATIVE_STUDY_PRESETS = TV_STUDY_PRESETS.filter((s) =>
  ['ema', 'sma', 'bb', 'vwap', 'supertrend', 'rsi', 'macd', 'stoch', 'atr'].includes(s.id),
);

/** All natively selectable study ids (technicals + Wolf Indicators). */
export const NATIVE_STUDY_IDS = new Set([
  ...NATIVE_STUDY_PRESETS.map((s) => s.id),
  ...wolfIndicatorIds(),
]);

```

