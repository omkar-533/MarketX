/** Pure technical indicators for WOLF RADAR — deterministic, no React. */
import type { Candle } from './radarTypes';

export function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

export function volumes(candles: Candle[]): number[] {
  return candles.map((c) => c.volume);
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return sma(trs, period);
}

/** Session-style VWAP from candle typical price × volume. */
export function vwap(candles: Candle[]): number | null {
  if (!candles.length) return null;
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume;
    vol += c.volume;
  }
  if (vol <= 0) return null;
  return pv / vol;
}

export function volumeAverage(candles: Candle[], period = 20): number | null {
  return sma(volumes(candles), period);
}

export function volumeRatio(candles: Candle[], period = 20): number | null {
  if (!candles.length) return null;
  const avg = volumeAverage(candles, period);
  if (!avg || avg <= 0) return null;
  return candles[candles.length - 1].volume / avg;
}

export type SwingPoint = { index: number; price: number; kind: 'high' | 'low' };

export function findSwings(candles: Candle[], lookback = 2): SwingPoint[] {
  const out: SwingPoint[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const hi = candles[i].high;
    const lo = candles[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= hi || candles[i + j].high >= hi) isHigh = false;
      if (candles[i - j].low <= lo || candles[i + j].low <= lo) isLow = false;
    }
    if (isHigh) out.push({ index: i, price: hi, kind: 'high' });
    if (isLow) out.push({ index: i, price: lo, kind: 'low' });
  }
  return out;
}

export type TrendDirection = 'up' | 'down' | 'range';

export function trendDirection(candles: Candle[]): TrendDirection {
  const c = closes(candles);
  const e21 = ema(c, 21);
  const e50 = ema(c, Math.min(50, Math.max(10, Math.floor(c.length / 2))));
  if (e21 == null || e50 == null) return 'range';
  const last = c[c.length - 1];
  if (e21 > e50 && last > e21) return 'up';
  if (e21 < e50 && last < e21) return 'down';
  return 'range';
}

export type TechnicalSnapshot = {
  last: number;
  ema21: number | null;
  ema50: number | null;
  sma20: number | null;
  rsi14: number | null;
  atr14: number | null;
  vwap: number | null;
  volumeRatio: number | null;
  trend: TrendDirection;
  swings: SwingPoint[];
};

export function analyzeTechnical(candles: Candle[]): TechnicalSnapshot {
  const c = closes(candles);
  return {
    last: c[c.length - 1] ?? 0,
    ema21: ema(c, 21),
    ema50: ema(c, 50),
    sma20: sma(c, 20),
    rsi14: rsi(c, 14),
    atr14: atr(candles, 14),
    vwap: vwap(candles),
    volumeRatio: volumeRatio(candles, 20),
    trend: trendDirection(candles),
    swings: findSwings(candles, 2),
  };
}
