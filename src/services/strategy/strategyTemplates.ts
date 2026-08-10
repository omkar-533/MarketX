/**
 * Predefined WOLF strategy templates — config layer, not hardcoded in UI.
 */
import type { StrategyTemplate } from './strategyTypes';

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'tpl-liquidity-sweep',
    name: 'Liquidity Sweep',
    description: 'Hunt previous-level liquidity sweeps with reclaim bias.',
    category: 'Liquidity',
    timeframeMode: 'SINGLE',
    timeframe: '5m',
    timeframes: {},
    conditions: [{ type: 'LIQUIDITY_SWEEP', timeframe: '5m', direction: 'ANY' }],
  },
  {
    id: 'tpl-liquidity-reversal',
    name: 'Liquidity Reversal',
    description: '15M sweep → 5M structure shift → volume + 1H trend.',
    category: 'Liquidity',
    timeframeMode: 'MULTI',
    timeframe: '5m',
    timeframes: { context: '1h', structure: '15m', setup: '5m' },
    conditions: [
      { type: 'LIQUIDITY_SWEEP', timeframe: '15m', direction: 'BULLISH', target: 'PREVIOUS_LOW' },
      { type: 'STRUCTURE_SHIFT', timeframe: '5m', direction: 'BULLISH' },
      { type: 'RELATIVE_VOLUME', timeframe: '5m', operator: '>=', value: 1.5 },
      { type: 'HTF_TREND', timeframe: '1h', direction: 'BULLISH' },
    ],
  },
  {
    id: 'tpl-breakout',
    name: 'Breakout',
    description: 'Bullish breakout with volume expansion.',
    category: 'Price',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [
      { type: 'BREAKOUT', timeframe: '15m' },
      { type: 'VOLUME_EXPANSION', timeframe: '15m' },
    ],
  },
  {
    id: 'tpl-breakdown',
    name: 'Breakdown',
    description: 'Bearish breakdown with volume expansion.',
    category: 'Price',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [
      { type: 'BREAKDOWN', timeframe: '15m' },
      { type: 'VOLUME_EXPANSION', timeframe: '15m' },
    ],
  },
  {
    id: 'tpl-structure-shift',
    name: 'Structure Shift',
    description: 'Standalone structure flip watch.',
    category: 'Structure',
    timeframeMode: 'SINGLE',
    timeframe: '5m',
    timeframes: {},
    conditions: [{ type: 'STRUCTURE_SHIFT', timeframe: '5m', direction: 'ANY' }],
  },
  {
    id: 'tpl-trend-continuation',
    name: 'Trend Continuation',
    description: 'HTF bullish + continuation on setup TF.',
    category: 'Trend',
    timeframeMode: 'MULTI',
    timeframe: '5m',
    timeframes: { context: '1h', setup: '5m' },
    conditions: [
      { type: 'HTF_TREND', timeframe: '1h', direction: 'BULLISH' },
      { type: 'TREND_CONTINUATION', timeframe: '5m', direction: 'BULLISH' },
    ],
  },
  {
    id: 'tpl-volume-expansion',
    name: 'Volume Expansion',
    description: 'Unusual or expanding volume.',
    category: 'Volume',
    timeframeMode: 'SINGLE',
    timeframe: '5m',
    timeframes: {},
    conditions: [{ type: 'VOLUME_EXPANSION', timeframe: '5m' }],
  },
  {
    id: 'tpl-breakout-volume',
    name: 'Breakout + Volume',
    description: 'Breakout confirmed by relative volume.',
    category: 'Price',
    timeframeMode: 'SINGLE',
    timeframe: '5m',
    timeframes: {},
    conditions: [
      { type: 'BREAKOUT', timeframe: '5m' },
      { type: 'RELATIVE_VOLUME', timeframe: '5m', operator: '>=', value: 1.5 },
    ],
  },
  {
    id: 'tpl-liq-structure',
    name: 'Liquidity + Structure',
    description: 'Sweep then structure alignment.',
    category: 'Liquidity',
    timeframeMode: 'MULTI',
    timeframe: '5m',
    timeframes: { structure: '15m', setup: '5m' },
    conditions: [
      { type: 'LIQUIDITY_SWEEP', timeframe: '15m', direction: 'ANY' },
      { type: 'STRUCTURE_SHIFT', timeframe: '5m', direction: 'ANY' },
    ],
  },
  {
    id: 'tpl-mtf-trend',
    name: 'Multi-Timeframe Trend',
    description: '1H and setup TF trend alignment.',
    category: 'Multi-TF',
    timeframeMode: 'MULTI',
    timeframe: '15m',
    timeframes: { context: '1h', setup: '15m' },
    conditions: [
      { type: 'HTF_TREND', timeframe: '1h', direction: 'BULLISH' },
      { type: 'EMA_ALIGNMENT', timeframe: '15m', direction: 'BULLISH' },
    ],
  },
  {
    id: 'tpl-ema-alignment',
    name: 'EMA Alignment',
    description: 'Bullish EMA stack / price above EMA.',
    category: 'Indicators',
    timeframeMode: 'SINGLE',
    timeframe: '15m',
    timeframes: {},
    conditions: [
      { type: 'EMA_ALIGNMENT', timeframe: '15m', direction: 'BULLISH' },
      { type: 'PRICE_ABOVE_EMA', timeframe: '15m' },
    ],
  },
];

export function getStrategyTemplate(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find((t) => t.id === id);
}
