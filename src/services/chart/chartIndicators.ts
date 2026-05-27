import type { ChartBar } from '../../types/chart';

export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev = values[0] ?? 0;
  values.forEach((v, i) => {
    prev = i === 0 ? v : (v - prev) * k + prev;
    out.push(prev);
  });
  return out;
}

export function sma(values: number[], period: number): number[] {
  return values.map((_, i) => {
    if (i < period - 1) return values[i];
    const slice = values.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      out.push(50);
      continue;
    }
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      out.push(50);
      continue;
    }
    if (i === period + 1) {
      avgGain /= period;
      avgLoss /= period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const middle = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  closes.forEach((_, i) => {
    if (i < period - 1) {
      upper.push(closes[i]);
      lower.push(closes[i]);
      return;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  });
  return { upper, middle, lower };
}

export function vwap(bars: ChartBar[]): number[] {
  let cumVol = 0;
  let cumTpVol = 0;
  return bars.map((b) => {
    const tp = (b.high + b.low + b.close) / 3;
    cumVol += b.volume;
    cumTpVol += tp * b.volume;
    return cumVol > 0 ? cumTpVol / cumVol : tp;
  });
}

export function toHeikinAshi(bars: ChartBar[]): ChartBar[] {
  const out: ChartBar[] = [];
  let prevHaOpen = bars[0].open;
  let prevHaClose = (bars[0].open + bars[0].high + bars[0].low + bars[0].close) / 4;

  bars.forEach((b, i) => {
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = i === 0 ? (b.open + b.close) / 2 : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(b.high, haOpen, haClose);
    const haLow = Math.min(b.low, haOpen, haClose);
    out.push({ time: b.time, open: haOpen, high: haHigh, low: haLow, close: haClose, volume: b.volume });
    prevHaOpen = haOpen;
    prevHaClose = haClose;
  });
  return out;
}
