/** Market structure detection — deterministic swing / BOS rules. */
import type { Candle } from './radarTypes';
import { findSwings, type SwingPoint } from './TechnicalEngine';

export type StructureEventType =
  | 'HH'
  | 'HL'
  | 'LH'
  | 'LL'
  | 'BOS'
  | 'STRUCTURE_SHIFT'
  | 'RANGE';

export type StructureEvent = {
  type: StructureEventType;
  direction: 'bullish' | 'bearish' | 'neutral';
  timeframe: string;
  strength: number;
  price: number;
  note: string;
};

function lastOf(swings: SwingPoint[], kind: 'high' | 'low', n = 3): SwingPoint[] {
  return swings.filter((s) => s.kind === kind).slice(-n);
}

export function detectStructure(candles: Candle[], timeframe: string): StructureEvent {
  const swings = findSwings(candles, 2);
  const highs = lastOf(swings, 'high', 3);
  const lows = lastOf(swings, 'low', 3);
  const last = candles[candles.length - 1];
  const price = last?.close ?? 0;

  if (highs.length >= 2 && lows.length >= 2) {
    const hh = highs[highs.length - 1].price > highs[highs.length - 2].price;
    const hl = lows[lows.length - 1].price > lows[lows.length - 2].price;
    const lh = highs[highs.length - 1].price < highs[highs.length - 2].price;
    const ll = lows[lows.length - 1].price < lows[lows.length - 2].price;

    if (hh && hl) {
      const bos = price > highs[highs.length - 2].price;
      return {
        type: bos ? 'BOS' : 'HH',
        direction: 'bullish',
        timeframe,
        strength: bos ? 86 : 74,
        price,
        note: bos ? 'Bullish break of prior swing high' : 'Higher high / higher low sequence',
      };
    }
    if (lh && ll) {
      const bos = price < lows[lows.length - 2].price;
      return {
        type: bos ? 'BOS' : 'LL',
        direction: 'bearish',
        timeframe,
        strength: bos ? 84 : 72,
        price,
        note: bos ? 'Bearish break of prior swing low' : 'Lower high / lower low sequence',
      };
    }
    // Shift: prior bearish lows then bullish reclaim
    if (ll && hh) {
      return {
        type: 'STRUCTURE_SHIFT',
        direction: 'bullish',
        timeframe,
        strength: 80,
        price,
        note: 'Structure shifting after prior lower-low then higher-high',
      };
    }
    if (hh && ll) {
      return {
        type: 'STRUCTURE_SHIFT',
        direction: 'bearish',
        timeframe,
        strength: 78,
        price,
        note: 'Structure shifting after prior higher-high then lower-low',
      };
    }
  }

  return {
    type: 'RANGE',
    direction: 'neutral',
    timeframe,
    strength: 45,
    price,
    note: 'No clear directional structure on visible swings',
  };
}
