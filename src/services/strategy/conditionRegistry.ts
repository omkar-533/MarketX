/**
 * Condition Registry — only these IDs are executable by scanner / LIVE.
 * Natural language Teach WOLF must map into this whitelist.
 */
import type { RadarTimeframe } from '../radar/radarTypes';

export type ConditionCategory =
  | 'STRUCTURE'
  | 'LIQUIDITY'
  | 'VOLUME'
  | 'TREND'
  | 'MOMENTUM'
  | 'INDICATORS'
  | 'PRICE'
  | 'VOLATILITY'
  | 'MULTI_TIMEFRAME';

export type ConditionDirection = 'BULLISH' | 'BEARISH' | 'ANY';

export type ConditionDef = {
  id: string;
  name: string;
  category: ConditionCategory;
  description: string;
  needsDirection?: boolean;
  needsValue?: boolean;
  valueLabel?: string;
  defaultValue?: number;
  supportedTimeframes?: RadarTimeframe[];
};

export const CONDITION_REGISTRY: ConditionDef[] = [
  {
    id: 'LIQUIDITY_SWEEP',
    name: 'Liquidity Sweep',
    category: 'LIQUIDITY',
    description: 'Previous swing high/low taken then reclaimed or rejected.',
    needsDirection: true,
  },
  {
    id: 'EQUAL_HIGHS',
    name: 'Equal Highs',
    category: 'LIQUIDITY',
    description: 'Matching swing highs (liquidity resting).',
  },
  {
    id: 'EQUAL_LOWS',
    name: 'Equal Lows',
    category: 'LIQUIDITY',
    description: 'Matching swing lows (liquidity resting).',
  },
  {
    id: 'STRUCTURE_SHIFT',
    name: 'Structure Shift',
    category: 'STRUCTURE',
    description: 'MSS / structure flip on swings.',
    needsDirection: true,
  },
  {
    id: 'BOS',
    name: 'Break of Structure',
    category: 'STRUCTURE',
    description: 'Price breaks a prior swing in trend direction.',
    needsDirection: true,
  },
  {
    id: 'HH',
    name: 'Higher High',
    category: 'STRUCTURE',
    description: 'Swing high above prior swing high.',
  },
  {
    id: 'HL',
    name: 'Higher Low',
    category: 'STRUCTURE',
    description: 'Swing low above prior swing low.',
  },
  {
    id: 'LH',
    name: 'Lower High',
    category: 'STRUCTURE',
    description: 'Swing high below prior swing high.',
  },
  {
    id: 'LL',
    name: 'Lower Low',
    category: 'STRUCTURE',
    description: 'Swing low below prior swing low.',
  },
  {
    id: 'BREAKOUT',
    name: 'Breakout',
    category: 'PRICE',
    description: 'Bullish breakout of range / swing.',
    needsDirection: false,
  },
  {
    id: 'BREAKDOWN',
    name: 'Breakdown',
    category: 'PRICE',
    description: 'Bearish breakdown of range / swing.',
  },
  {
    id: 'VOLUME_EXPANSION',
    name: 'Volume Expansion',
    category: 'VOLUME',
    description: 'Volume expanding vs recent average.',
  },
  {
    id: 'VOLUME_CONTRACTION',
    name: 'Volume Contraction',
    category: 'VOLUME',
    description: 'Volume contracting vs recent average.',
  },
  {
    id: 'RELATIVE_VOLUME',
    name: 'Relative Volume',
    category: 'VOLUME',
    description: 'Current volume vs average ratio.',
    needsValue: true,
    valueLabel: '× Average',
    defaultValue: 1.5,
  },
  {
    id: 'HTF_TREND',
    name: 'HTF Trend',
    category: 'MULTI_TIMEFRAME',
    description: 'Higher-timeframe trend direction.',
    needsDirection: true,
  },
  {
    id: 'TREND_CONTINUATION',
    name: 'Trend Continuation',
    category: 'TREND',
    description: 'Price continuing established trend.',
    needsDirection: true,
  },
  {
    id: 'REVERSAL',
    name: 'Reversal',
    category: 'TREND',
    description: 'Potential reversal context (soft filter).',
    needsDirection: true,
  },
  {
    id: 'EMA_ALIGNMENT',
    name: 'EMA Alignment',
    category: 'INDICATORS',
    description: 'EMA stack aligned with bias.',
    needsDirection: true,
  },
  {
    id: 'PRICE_ABOVE_EMA',
    name: 'Price Above EMA',
    category: 'INDICATORS',
    description: 'Close above EMA21.',
  },
  {
    id: 'PRICE_BELOW_EMA',
    name: 'Price Below EMA',
    category: 'INDICATORS',
    description: 'Close below EMA21.',
  },
  {
    id: 'RSI_ABOVE',
    name: 'RSI Above',
    category: 'MOMENTUM',
    description: 'RSI greater than threshold.',
    needsValue: true,
    valueLabel: 'RSI ≥',
    defaultValue: 55,
  },
  {
    id: 'RSI_BELOW',
    name: 'RSI Below',
    category: 'MOMENTUM',
    description: 'RSI less than threshold.',
    needsValue: true,
    valueLabel: 'RSI ≤',
    defaultValue: 45,
  },
];

const byId = new Map(CONDITION_REGISTRY.map((c) => [c.id, c]));

export function getConditionDef(id: string): ConditionDef | undefined {
  return byId.get(id);
}

export function listConditionsByCategory(cat: ConditionCategory): ConditionDef[] {
  return CONDITION_REGISTRY.filter((c) => c.category === cat);
}

export function isKnownConditionId(id: string): boolean {
  return byId.has(id);
}

export const CONDITION_CATEGORIES: ConditionCategory[] = [
  'STRUCTURE',
  'LIQUIDITY',
  'VOLUME',
  'TREND',
  'MOMENTUM',
  'INDICATORS',
  'PRICE',
  'VOLATILITY',
  'MULTI_TIMEFRAME',
];
