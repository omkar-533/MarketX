/**
 * Predefined WOLF screener templates — shared by Strategy Lab + Radar.
 * Explanations must match the current soft conditionEvaluator (post-scan filter),
 * not claim bar-by-bar guarantees the scanner does not yet enforce.
 */
import type { StrategyTemplate } from './strategyTypes';

const SHARED_LIMIT =
  'WOLF filters Radar detections using setup labels and score fields — not a guarantee of future price. ' +
  'Scores are setup-quality, not win probability.';

function expl(partial: StrategyTemplate['explanation']): StrategyTemplate['explanation'] {
  return {
    ...partial,
    limitations: `${partial.limitations} ${SHARED_LIMIT}`.trim(),
  };
}

export const STRATEGY_TEMPLATE_CATEGORIES = [
  'ALL',
  'LIQUIDITY',
  'STRUCTURE',
  'BREAKOUT',
  'TREND',
  'VOLUME',
  'REVERSAL',
  'VOLATILITY',
] as const;

export type ScreenerCategoryFilter = (typeof STRATEGY_TEMPLATE_CATEGORIES)[number];

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'tpl-liquidity-sweep',
    name: 'Liquidity Sweep',
    description: 'Detects stocks tagged with a liquidity sweep / reclaim bias.',
    category: 'LIQUIDITY',
    timeframeMode: 'SINGLE',
    timeframe: '5m',
    timeframes: {},
    conditions: [{ type: 'LIQUIDITY_SWEEP', timeframe: '5m', direction: 'ANY' }],
    explanation: expl({
      whatItLooksFor:
        'Radar results whose setup or confirmation text indicates a liquidity sweep (price taking a recent swing level).',
      whyItMatters:
        'Sweeps often mark areas where stop liquidity was taken before a reclaim or reverse attempt.',
      howWolfDetects:
        'Matches Radar detections whose labels include liquidity sweep / sweep language via the shared ConditionRegistry filter.',
      bestUsedFor: 'Intraday discovery when you want sweep-tagged setups only.',
      limitations:
        'Does not yet reconstruct swing points candle-by-candle independent of the Radar engine labels.',
      marketCompatibility: 'NSE · BSE · F&O · index baskets',
    }),
  },
  {
    id: 'tpl-liquidity-reversal',
    name: 'Liquidity Reversal',
    description: '15M sweep + 5M structure shift + RVOL + 1H trend alignment.',
    category: 'LIQUIDITY',
    timeframeMode: 'MULTI',
    timeframe: '5m',
    timeframes: { context: '1h', structure: '15m', setup: '5m' },
    conditions: [
      { type: 'LIQUIDITY_SWEEP', timeframe: '15m', direction: 'BULLISH', target: 'PREVIOUS_LOW' },
      { type: 'STRUCTURE_SHIFT', timeframe: '5m', direction: 'BULLISH' },
      { type: 'RELATIVE_VOLUME', timeframe: '5m', operator: '>=', value: 1.5 },
      { type: 'HTF_TREND', timeframe: '1h', direction: 'BULLISH' },
    ],
    explanation: expl({
      whatItLooksFor:
        'A liquidity sweep signal plus structure-shift confirmation, volume expansion proxy, and HTF alignment.',
      whyItMatters:
        'Combines liquidity event + structural confirmation — a common intraday reversal framework.',
      howWolfDetects:
        'AND across LIQUIDITY_SWEEP, STRUCTURE_SHIFT, RELATIVE_VOLUME (soft RVOL ≥1.5 via volume labels), and HTF_TREND.',
      bestUsedFor: 'Intraday reversal hunt on liquid names.',
      limitations:
        'Relative volume is approximated from volume-expansion labels until the scanner exposes a numeric RVOL field.',
      marketCompatibility: 'Best on F&O / NIFTY50 liquid underlyings',
    }),
  },
  {
    id: 'tpl-equal-highs',
    name: 'Equal High Sweep',
    description: 'Equal highs liquidity reference.',
    category: 'LIQUIDITY',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [{ type: 'EQUAL_HIGHS', timeframe: '15m' }],
    explanation: expl({
      whatItLooksFor: 'Results mentioning equal high liquidity.',
      whyItMatters: 'Flags double-top style liquidity pools.',
      howWolfDetects: 'EQUAL_HIGHS condition filter on Radar labels.',
      bestUsedFor: 'Bearish liquidity hunts / short bias research.',
      limitations: 'Depends on Radar engine emitting equal-high language.',
      marketCompatibility: 'NSE · BSE · F&O',
    }),
  },
  {
    id: 'tpl-equal-lows',
    name: 'Equal Low Sweep',
    description: 'Equal lows liquidity reference.',
    category: 'LIQUIDITY',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [{ type: 'EQUAL_LOWS', timeframe: '15m' }],
    explanation: expl({
      whatItLooksFor: 'Results mentioning equal low liquidity.',
      whyItMatters: 'Flags double-bottom style liquidity pools.',
      howWolfDetects: 'EQUAL_LOWS condition filter on Radar labels.',
      bestUsedFor: 'Bullish liquidity hunts.',
      limitations: 'Depends on Radar engine emitting equal-low language.',
      marketCompatibility: 'NSE · BSE · F&O',
    }),
  },
  {
    id: 'tpl-structure-shift-bull',
    name: 'Bullish Structure Shift',
    description: 'Structure turning bullish on the setup timeframe.',
    category: 'STRUCTURE',
    timeframeMode: 'SINGLE',
    timeframe: '5m',
    timeframes: {},
    conditions: [{ type: 'STRUCTURE_SHIFT', timeframe: '5m', direction: 'BULLISH' }],
    explanation: expl({
      whatItLooksFor: 'Bullish (or non-bearish) structure-shift tagged detections.',
      whyItMatters: 'Structure shifts can mark change of character after a sweep or base.',
      howWolfDetects: 'STRUCTURE_SHIFT + bullish direction gate on RadarResult.',
      bestUsedFor: 'Continuation / reversal confirmation legs.',
      limitations: 'Soft match on structure text — not a full swing-structure state machine yet.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-structure-shift-bear',
    name: 'Bearish Structure Shift',
    description: 'Structure turning bearish on the setup timeframe.',
    category: 'STRUCTURE',
    timeframeMode: 'SINGLE',
    timeframe: '5m',
    timeframes: {},
    conditions: [{ type: 'STRUCTURE_SHIFT', timeframe: '5m', direction: 'BEARISH' }],
    explanation: expl({
      whatItLooksFor: 'Bearish structure-shift tagged detections.',
      whyItMatters: 'Helps isolate downside structural flips.',
      howWolfDetects: 'STRUCTURE_SHIFT + bearish direction gate.',
      bestUsedFor: 'Short-side confirmation research.',
      limitations: 'Soft label matching.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-bos',
    name: 'Break of Structure',
    description: 'Recent BOS / break of structure language.',
    category: 'STRUCTURE',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [{ type: 'BOS', timeframe: '15m' }],
    explanation: expl({
      whatItLooksFor: 'BOS, break of structure, breakout, or breakdown labeled results.',
      whyItMatters: 'BOS marks displacement past a prior swing.',
      howWolfDetects: 'BOS condition matches BOS/breakout/breakdown labels.',
      bestUsedFor: 'Momentum continuation screens.',
      limitations: 'Overlaps with breakout/breakdown engines by design of the soft matcher.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-trend-continuation',
    name: 'Trend Continuation',
    description: 'HTF bullish + continuation on setup TF.',
    category: 'TREND',
    timeframeMode: 'MULTI',
    timeframe: '5m',
    timeframes: { context: '1h', setup: '5m' },
    conditions: [
      { type: 'HTF_TREND', timeframe: '1h', direction: 'BULLISH' },
      { type: 'TREND_CONTINUATION', timeframe: '5m', direction: 'BULLISH' },
    ],
    explanation: expl({
      whatItLooksFor: 'HTF alignment plus Trend Continuation setup type / labels.',
      whyItMatters: 'Filters for trend-side pullback continuations.',
      howWolfDetects: 'HTF_TREND AND TREND_CONTINUATION.',
      bestUsedFor: 'Intraday trend days.',
      limitations: 'Requires Radar engine to emit continuation setup types.',
      marketCompatibility: 'F&O · NIFTY50 preferred',
    }),
  },
  {
    id: 'tpl-breakout-volume',
    name: 'Breakout + Volume',
    description: 'Breakout with relative volume confirmation.',
    category: 'BREAKOUT',
    timeframeMode: 'SINGLE',
    timeframe: '5m',
    timeframes: {},
    conditions: [
      { type: 'BREAKOUT', timeframe: '5m' },
      { type: 'RELATIVE_VOLUME', timeframe: '5m', operator: '>=', value: 1.5 },
    ],
    explanation: expl({
      whatItLooksFor: 'Breakout detections that also show volume-expansion style labels.',
      whyItMatters: 'Volume confirmation reduces quiet false break tags.',
      howWolfDetects: 'BREAKOUT AND soft RELATIVE_VOLUME ≥1.5 proxy.',
      bestUsedFor: 'Range break / news-impulse discovery.',
      limitations: 'RVOL is approximate until numeric RVOL is on RadarResult.',
      marketCompatibility: 'NSE · BSE · F&O',
    }),
  },
  {
    id: 'tpl-breakout',
    name: 'Breakout',
    description: 'Bullish breakout with volume expansion.',
    category: 'BREAKOUT',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [
      { type: 'BREAKOUT', timeframe: '15m' },
      { type: 'VOLUME_EXPANSION', timeframe: '15m' },
    ],
    explanation: expl({
      whatItLooksFor: 'Breakout setup type plus volume expansion.',
      whyItMatters: 'Classic expansion after compression / level break.',
      howWolfDetects: 'BREAKOUT AND VOLUME_EXPANSION.',
      bestUsedFor: 'Momentum sessions.',
      limitations: 'No separate “range contraction first” gate yet.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-breakdown',
    name: 'Breakdown',
    description: 'Bearish breakdown with volume expansion.',
    category: 'BREAKOUT',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [
      { type: 'BREAKDOWN', timeframe: '15m' },
      { type: 'VOLUME_EXPANSION', timeframe: '15m' },
    ],
    explanation: expl({
      whatItLooksFor: 'Breakdown setup plus volume expansion.',
      whyItMatters: 'Downside displacement with participation.',
      howWolfDetects: 'BREAKDOWN AND VOLUME_EXPANSION.',
      bestUsedFor: 'Weak-tape discovery.',
      limitations: 'Does not encode retest / failed reclaim separately.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-breakout-retest',
    name: 'Breakout Retest',
    description: 'Breakout language plus structure continuation (proxy for retest).',
    category: 'BREAKOUT',
    timeframeMode: 'MULTI',
    timeframe: '5m',
    timeframes: { structure: '15m', setup: '5m' },
    conditions: [
      { type: 'BREAKOUT', timeframe: '15m' },
      { type: 'TREND_CONTINUATION', timeframe: '5m', direction: 'BULLISH' },
    ],
    explanation: expl({
      whatItLooksFor:
        'Breakout-tagged HTF bar plus LTF trend continuation (proxy for break→hold→continue).',
      whyItMatters: 'Many traders wait for retest/continuation after the initial break.',
      howWolfDetects: 'BREAKOUT + TREND_CONTINUATION — not a dedicated pullback geometry engine yet.',
      bestUsedFor: 'Post-break continuation research.',
      limitations:
        'Does not measure explicit retest of the break level; uses continuation labels as proxy.',
      marketCompatibility: 'F&O · NIFTY50',
    }),
  },
  {
    id: 'tpl-range-expansion',
    name: 'Range Expansion',
    description: 'Volume/range expansion after quiet conditions (soft).',
    category: 'VOLATILITY',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [
      { type: 'VOLUME_EXPANSION', timeframe: '15m' },
      { type: 'BREAKOUT', timeframe: '15m' },
    ],
    explanation: expl({
      whatItLooksFor: 'Expansion via volume expansion coinciding with breakout labels.',
      whyItMatters: 'Volatility expansion often follows contraction phases.',
      howWolfDetects: 'VOLUME_EXPANSION AND BREAKOUT (soft stand-in for range expansion).',
      bestUsedFor: 'Finding activity ignition.',
      limitations:
        'No dedicated ATR contraction→expansion evaluator yet — uses volume+breakout proxies.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-volume-expansion',
    name: 'Volume Expansion',
    description: 'Unusual or expanding volume.',
    category: 'VOLUME',
    timeframeMode: 'SINGLE',
    timeframe: '5m',
    timeframes: {},
    conditions: [{ type: 'VOLUME_EXPANSION', timeframe: '5m' }],
    explanation: expl({
      whatItLooksFor: 'Volume Expansion setup type or expanding/unusual volume labels.',
      whyItMatters: 'Participation spikes often accompany actionable moves.',
      howWolfDetects: 'VOLUME_EXPANSION condition.',
      bestUsedFor: 'Activity screens before adding structure filters.',
      limitations: 'Does not encode a numeric multiple vs average alone.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-unusual-volume',
    name: 'Unusual Volume',
    description: 'Relative volume well above average (soft ≥2× proxy).',
    category: 'VOLUME',
    timeframeMode: 'SINGLE',
    timeframe: '5m',
    timeframes: {},
    conditions: [{ type: 'RELATIVE_VOLUME', timeframe: '5m', operator: '>=', value: 2 }],
    explanation: expl({
      whatItLooksFor: 'Volume-expansion / unusual / relative volume labels (2× preference).',
      whyItMatters: 'Highlights outliers versus typical session volume.',
      howWolfDetects: 'RELATIVE_VOLUME with value 2 — still soft label-based until numeric RVOL ships.',
      bestUsedFor: 'Surge detection.',
      limitations: 'Numeric 2× is not yet measured on every RadarResult.',
      marketCompatibility: 'NSE · BSE · F&O',
    }),
  },
  {
    id: 'tpl-price-volume-confirm',
    name: 'Price + Volume Confirmation',
    description: 'Breakout with volume expansion confirmation.',
    category: 'VOLUME',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [
      { type: 'BREAKOUT', timeframe: '15m' },
      { type: 'VOLUME_EXPANSION', timeframe: '15m' },
    ],
    explanation: expl({
      whatItLooksFor: 'Price breakout plus volume expansion.',
      whyItMatters: 'Aligns displacement with participation.',
      howWolfDetects: 'BREAKOUT AND VOLUME_EXPANSION.',
      bestUsedFor: 'Confirming expansion moves.',
      limitations: 'Does not require close location relative to VWAP.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-ema-alignment',
    name: 'EMA Alignment',
    description: 'Bullish EMA stack / price above EMA bias.',
    category: 'TREND',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [
      { type: 'EMA_ALIGNMENT', timeframe: '15m', direction: 'BULLISH' },
      { type: 'PRICE_ABOVE_EMA', timeframe: '15m' },
    ],
    explanation: expl({
      whatItLooksFor: 'HTF/EMA alignment labels plus bullish price bias.',
      whyItMatters: 'Trend stack filters reduce counter-trend noise.',
      howWolfDetects: 'EMA_ALIGNMENT and PRICE_ABOVE_EMA soft gates (direction / htfAlignment).',
      bestUsedFor: 'Trend-following screens.',
      limitations: 'Does not yet enforce explicit 13>22>50>200 number stack on every bar.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-trend-pullback',
    name: 'Trend Pullback',
    description: 'HTF bullish trend + LTF structure for continuation entries.',
    category: 'TREND',
    timeframeMode: 'MULTI',
    timeframe: '5m',
    timeframes: { context: '1h', setup: '5m' },
    conditions: [
      { type: 'HTF_TREND', timeframe: '1h', direction: 'BULLISH' },
      { type: 'STRUCTURE_SHIFT', timeframe: '5m', direction: 'BULLISH' },
    ],
    explanation: expl({
      whatItLooksFor: 'Higher-timeframe bullish alignment with a bullish LTF structure shift.',
      whyItMatters: 'Models trend + pullback/reclaim confirmation without inventing entry prices.',
      howWolfDetects: 'HTF_TREND AND STRUCTURE_SHIFT (bullish).',
      bestUsedFor: 'Pullback long research on trend days.',
      limitations: 'No Fibonacci / measured-move retrace math yet.',
      marketCompatibility: 'F&O · NIFTY50',
    }),
  },
  {
    id: 'tpl-mtf-trend',
    name: 'Multi-Timeframe Trend Alignment',
    description: '1H trend + 15M EMA alignment.',
    category: 'TREND',
    timeframeMode: 'MULTI',
    timeframe: '15m',
    timeframes: { context: '1h', setup: '15m' },
    conditions: [
      { type: 'HTF_TREND', timeframe: '1h', direction: 'BULLISH' },
      { type: 'EMA_ALIGNMENT', timeframe: '15m', direction: 'BULLISH' },
    ],
    explanation: expl({
      whatItLooksFor: 'Bullish HTF alignment plus mid-TF EMA alignment labels.',
      whyItMatters: 'Multi-TF agreement improves trend-context quality.',
      howWolfDetects: 'HTF_TREND AND EMA_ALIGNMENT.',
      bestUsedFor: 'Bias filters before adding liquidity/structure legs.',
      limitations: 'Does not require a third confirmation TF unless you add conditions.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-momentum-reversal',
    name: 'Momentum Reversal',
    description: 'Reversal-tagged setups with volume expansion.',
    category: 'REVERSAL',
    timeframeMode: 'SINGLE',
    timeframe: '5m',
    timeframes: {},
    conditions: [
      { type: 'REVERSAL', timeframe: '5m' },
      { type: 'VOLUME_EXPANSION', timeframe: '5m' },
    ],
    explanation: expl({
      whatItLooksFor: 'Reversal / sweep / structure-shift labels plus volume expansion.',
      whyItMatters: 'Finds turn attempts with rising participation.',
      howWolfDetects: 'REVERSAL AND VOLUME_EXPANSION.',
      bestUsedFor: 'Counter-trend watchlists (higher risk).',
      limitations: 'Reversal is a soft label group — not a completed strategy model.',
      marketCompatibility: 'Liquid names preferred',
    }),
  },
  {
    id: 'tpl-structure-reversal',
    name: 'Structure Reversal',
    description: 'Liquidity sweep followed by structure shift.',
    category: 'REVERSAL',
    timeframeMode: 'MULTI',
    timeframe: '5m',
    timeframes: { structure: '15m', setup: '5m' },
    conditions: [
      { type: 'LIQUIDITY_SWEEP', timeframe: '15m', direction: 'ANY' },
      { type: 'STRUCTURE_SHIFT', timeframe: '5m', direction: 'ANY' },
    ],
    explanation: expl({
      whatItLooksFor: 'Sweep then structure shift (direction agnostic).',
      whyItMatters: 'Core liquidity→structure reversal map.',
      howWolfDetects: 'LIQUIDITY_SWEEP AND STRUCTURE_SHIFT.',
      bestUsedFor: 'Reversal discovery across both sides.',
      limitations: 'Direction not forced — refine in Manual Builder if needed.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-vol-expansion-regime',
    name: 'Volatility Expansion',
    description: 'Volume expansion as volatility expansion proxy.',
    category: 'VOLATILITY',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [{ type: 'VOLUME_EXPANSION', timeframe: '15m' }],
    explanation: expl({
      whatItLooksFor: 'Volume / activity expansion labels used as a volatility expansion proxy.',
      whyItMatters: 'Rising activity often accompanies range expansion regimes.',
      howWolfDetects: 'VOLUME_EXPANSION (proxy — not ATR percentiles yet).',
      bestUsedFor: 'Finding ignition after quiet stretches.',
      limitations: 'True ATR expansion metrics are not yet in ConditionRegistry.',
      marketCompatibility: 'All universes',
    }),
  },
  {
    id: 'tpl-vol-contraction',
    name: 'Volatility Contraction',
    description: 'Volume contraction / compression language.',
    category: 'VOLATILITY',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [{ type: 'VOLUME_CONTRACTION', timeframe: '15m' }],
    explanation: expl({
      whatItLooksFor: 'Results mentioning volume/range contraction.',
      whyItMatters: 'Compression often precedes expansion.',
      howWolfDetects: 'VOLUME_CONTRACTION label match.',
      bestUsedFor: 'Pre-break watchlists.',
      limitations: 'Depends on Radar emitting contraction language; ATR squeeze not separate yet.',
      marketCompatibility: 'All universes',
    }),
  },
];

export function getStrategyTemplate(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find((t) => t.id === id);
}

export function filterStrategyTemplates(
  category: ScreenerCategoryFilter,
  query = '',
): StrategyTemplate[] {
  const q = query.trim().toLowerCase();
  return STRATEGY_TEMPLATES.filter((t) => {
    if (category !== 'ALL' && t.category.toUpperCase() !== category) return false;
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.explanation.whatItLooksFor.toLowerCase().includes(q)
    );
  });
}
