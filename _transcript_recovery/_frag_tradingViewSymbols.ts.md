# Fragments for tradingViewSymbols.ts

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

