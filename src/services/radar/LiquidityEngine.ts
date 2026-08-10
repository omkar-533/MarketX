/** Liquidity detection — equal highs/lows, sweep + reclaim (rule-based). */
import type { Candle } from './radarTypes';
import { findSwings } from './TechnicalEngine';

export type LiquidityEventType =
  | 'EQUAL_HIGHS'
  | 'EQUAL_LOWS'
  | 'LIQUIDITY_SWEEP'
  | 'RECLAIM'
  | 'NONE';

export type LiquidityEvent = {
  type: LiquidityEventType;
  direction: 'bullish' | 'bearish' | 'neutral';
  timeframe: string;
  level: number;
  confirmed: boolean;
  note: string;
};

export function detectLiquidity(candles: Candle[], timeframe: string): LiquidityEvent {
  if (candles.length < 12) {
    return {
      type: 'NONE',
      direction: 'neutral',
      timeframe,
      level: candles[candles.length - 1]?.close ?? 0,
      confirmed: false,
      note: 'Insufficient history for liquidity read',
    };
  }

  const swings = findSwings(candles, 2);
  const lows = swings.filter((s) => s.kind === 'low');
  const highs = swings.filter((s) => s.kind === 'high');
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const atrish =
    candles.slice(-15).reduce((a, c) => a + (c.high - c.low), 0) / Math.min(15, candles.length);

  if (lows.length >= 2) {
    const a = lows[lows.length - 1].price;
    const b = lows[lows.length - 2].price;
    if (Math.abs(a - b) <= atrish * 0.35) {
      return {
        type: 'EQUAL_LOWS',
        direction: 'neutral',
        timeframe,
        level: (a + b) / 2,
        confirmed: true,
        note: 'Equal lows — sell-side liquidity pool',
      };
    }
  }
  if (highs.length >= 2) {
    const a = highs[highs.length - 1].price;
    const b = highs[highs.length - 2].price;
    if (Math.abs(a - b) <= atrish * 0.35) {
      return {
        type: 'EQUAL_HIGHS',
        direction: 'neutral',
        timeframe,
        level: (a + b) / 2,
        confirmed: true,
        note: 'Equal highs — buy-side liquidity pool',
      };
    }
  }

  if (lows.length >= 1 && prev && last) {
    const level = lows[lows.length - 1].price;
    const swept = prev.low < level - atrish * 0.05 || last.low < level - atrish * 0.05;
    const reclaimed = last.close > level;
    if (swept && reclaimed) {
      return {
        type: 'LIQUIDITY_SWEEP',
        direction: 'bullish',
        timeframe,
        level,
        confirmed: true,
        note: 'Sweep of prior swing low with reclaim',
      };
    }
  }

  if (highs.length >= 1 && prev && last) {
    const level = highs[highs.length - 1].price;
    const swept = prev.high > level + atrish * 0.05 || last.high > level + atrish * 0.05;
    const rejected = last.close < level;
    if (swept && rejected) {
      return {
        type: 'LIQUIDITY_SWEEP',
        direction: 'bearish',
        timeframe,
        level,
        confirmed: true,
        note: 'Sweep of prior swing high with rejection',
      };
    }
  }

  return {
    type: 'NONE',
    direction: 'neutral',
    timeframe,
    level: last?.close ?? 0,
    confirmed: false,
    note: 'No clear liquidity event on last bars',
  };
}
