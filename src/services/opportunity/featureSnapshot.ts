/**
 * Shared quantitative features for Opportunity scanners.
 * Deterministic — no fabricated prices when candles missing.
 */
import type { Candle } from '../radar/radarTypes';
import {
  analyzeTechnical,
  atr,
  closes,
  ema,
  findSwings,
  rsi,
  sma,
  type TechnicalSnapshot,
} from '../radar/TechnicalEngine';
import { detectVolume, type VolumeEvent } from '../radar/VolumeEngine';
import { detectStructure, type StructureEvent } from '../radar/StructureEngine';
import { detectLiquidity, type LiquidityEvent } from '../radar/LiquidityEngine';

export type FeatureSnapshot = {
  symbol: string;
  exchange: string;
  timeframe: string;
  candles: Candle[];
  tech: TechnicalSnapshot;
  volume: VolumeEvent;
  structure: StructureEvent;
  liquidity: LiquidityEvent;
  changePercent: number;
  rangePct: number;
  atrPct: number;
  atrCompression: number | null;
  roc5: number | null;
  rsiPrev: number | null;
  dayHigh: number;
  dayLow: number;
  swingHigh: number | null;
  swingLow: number | null;
  high10: number | null;
  high20: number | null;
  low10: number | null;
  low20: number | null;
};

function pctChange(from: number, to: number): number {
  if (!(from > 0)) return 0;
  return ((to - from) / from) * 100;
}

export function buildFeatureSnapshot(
  symbol: string,
  exchange: string,
  timeframe: string,
  candles: Candle[],
): FeatureSnapshot | null {
  if (!candles || candles.length < 25) return null;
  const tech = analyzeTechnical(candles);
  if (!(tech.last > 0)) return null;

  const c = closes(candles);
  const last = c[c.length - 1];
  const prev = c[c.length - 2] ?? last;
  const lookback = Math.min(20, c.length - 1);
  const base = c[c.length - 1 - lookback] ?? prev;
  const changePercent = pctChange(base, last);

  const window = candles.slice(-20);
  const dayHigh = Math.max(...window.map((b) => b.high));
  const dayLow = Math.min(...window.map((b) => b.low));
  const rangePct = dayLow > 0 ? ((dayHigh - dayLow) / dayLow) * 100 : 0;
  const atr14 = atr(candles, 14);
  const atrPct = atr14 && last > 0 ? (atr14 / last) * 100 : 0;

  const atrNow = atr(candles, 14);
  const atrPrev = atr(candles.slice(0, -5), 14);
  const atrCompression =
    atrNow && atrPrev && atrPrev > 0 ? atrNow / atrPrev : null;

  const roc5 =
    c.length >= 6 && c[c.length - 6] > 0
      ? pctChange(c[c.length - 6], last)
      : null;
  const rsiPrev = c.length > 20 ? rsi(c.slice(0, -3), 14) : null;

  const swings = findSwings(candles, 2);
  const lastHigh = [...swings].reverse().find((s) => s.kind === 'high');
  const lastLow = [...swings].reverse().find((s) => s.kind === 'low');

  const high10 = c.length >= 10 ? Math.max(...candles.slice(-10).map((b) => b.high)) : null;
  const high20 = c.length >= 20 ? Math.max(...candles.slice(-20).map((b) => b.high)) : null;
  const low10 = c.length >= 10 ? Math.min(...candles.slice(-10).map((b) => b.low)) : null;
  const low20 = c.length >= 20 ? Math.min(...candles.slice(-20).map((b) => b.low)) : null;

  return {
    symbol,
    exchange,
    timeframe,
    candles,
    tech,
    volume: detectVolume(candles),
    structure: detectStructure(candles, timeframe as never),
    liquidity: detectLiquidity(candles, timeframe as never),
    changePercent,
    rangePct,
    atrPct,
    atrCompression,
    roc5,
    rsiPrev,
    dayHigh,
    dayLow,
    swingHigh: lastHigh?.price ?? null,
    swingLow: lastLow?.price ?? null,
    high10,
    high20,
    low10,
    low20,
  };
}

export function emaAlignment(tech: TechnicalSnapshot): 'bullish' | 'bearish' | 'mixed' {
  if (tech.ema21 == null || tech.ema50 == null) return 'mixed';
  if (tech.last > tech.ema21 && tech.ema21 > tech.ema50) return 'bullish';
  if (tech.last < tech.ema21 && tech.ema21 < tech.ema50) return 'bearish';
  return 'mixed';
}

export function clampScore(n: number, max = 100): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

export function sessionSma(candles: Candle[], period: number): number | null {
  return sma(closes(candles), period);
}

export function sessionEma(candles: Candle[], period: number): number | null {
  return ema(closes(candles), period);
}
