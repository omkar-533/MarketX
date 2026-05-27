import { bollinger, ema, rsi, sma } from './chart/chartIndicators';
import type { BarHistory } from './screenerHistory';

export interface ComputedTechnicals {
  sma5: number;
  sma10: number;
  sma20: number;
  sma50: number;
  sma200: number;
  ema9: number;
  ema20: number;
  ema50: number;
  rsi14: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  upperBB: number;
  lowerBB: number;
  bbPercentB: number;
  avgVolume: number;
  maxHigh20: number;
  minLow20: number;
  maxHigh50: number;
  minLow50: number;
}

function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

export function barsFromOhlc(
  bars: { open: number; high: number; low: number; close: number; volume: number }[],
): BarHistory {
  return {
    open: bars.map((b) => b.open),
    high: bars.map((b) => b.high),
    low: bars.map((b) => b.low),
    close: bars.map((b) => b.close),
    volume: bars.map((b) => b.volume),
  };
}

export function computeTechnicalsFromBars(hist: BarHistory): ComputedTechnicals | null {
  const closes = hist.close;
  if (closes.length < 25) return null;

  const volumes = hist.volume;
  const highs = hist.high;
  const lows = hist.low;

  const sma5 = last(sma(closes, 5));
  const sma10 = last(sma(closes, 10));
  const sma20 = last(sma(closes, 20));
  const sma50 = last(sma(closes, Math.min(50, closes.length)));
  const sma200 = last(sma(closes, Math.min(200, closes.length)));
  const ema9 = last(ema(closes, 9));
  const ema20 = last(ema(closes, 20));
  const ema50 = last(ema(closes, Math.min(50, closes.length)));
  const rsi14 = last(rsi(closes, 14));
  const ema12 = last(ema(closes, 12));
  const ema26 = last(ema(closes, 26));
  const macd = ema12 - ema26;
  const macdLine = closes.map((_, i) => {
    const e12 = ema(closes.slice(0, i + 1), 12);
    const e26 = ema(closes.slice(0, i + 1), 26);
    return (e12[e12.length - 1] ?? closes[i]) - (e26[e26.length - 1] ?? closes[i]);
  });
  const macdSignal = last(ema(macdLine, 9));
  const macdHist = macd - macdSignal;
  const bb = bollinger(closes, 20, 2);
  const upperBB = last(bb.upper);
  const lowerBB = last(bb.lower);
  const close = last(closes);
  const bbPercentB = ((close - lowerBB) / Math.max(upperBB - lowerBB, 0.01)) * 100;
  const avgVolume =
    volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
  const maxHigh20 = Math.max(...highs.slice(-20));
  const minLow20 = Math.min(...lows.slice(-20));
  const maxHigh50 = Math.max(...highs.slice(-50));
  const minLow50 = Math.min(...lows.slice(-50));

  return {
    sma5,
    sma10,
    sma20,
    sma50,
    sma200,
    ema9,
    ema20,
    ema50,
    rsi14,
    macd,
    macdSignal,
    macdHist,
    upperBB,
    lowerBB,
    bbPercentB,
    avgVolume,
    maxHigh20,
    minLow20,
    maxHigh50,
    minLow50,
  };
}
