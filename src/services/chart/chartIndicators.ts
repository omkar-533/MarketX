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

export function macd(closes: number[], fastLen = 12, slowLen = 26, signalLen = 9) {
  const fast = ema(closes, fastLen);
  const slow = ema(closes, slowLen);
  const line = closes.map((_, i) => fast[i] - slow[i]);
  const signal = ema(line, signalLen);
  return { line, signal, hist: line.map((v, i) => v - signal[i]) };
}

/** Wilder's Average True Range. */
export function atr(bars: ChartBar[], period = 14): number[] {
  const out: number[] = [];
  let prev = 0;
  bars.forEach((b, i) => {
    const prevClose = i > 0 ? bars[i - 1].close : b.open;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
    prev = i === 0 ? tr : (prev * (period - 1) + tr) / period;
    out.push(prev);
  });
  return out;
}

export function stochastic(bars: ChartBar[], period = 14, smooth = 3) {
  const raw = bars.map((b, i) => {
    const from = Math.max(0, i - period + 1);
    let high = -Infinity;
    let low = Infinity;
    for (let j = from; j <= i; j += 1) {
      high = Math.max(high, bars[j].high);
      low = Math.min(low, bars[j].low);
    }
    return high === low ? 50 : ((b.close - low) / (high - low)) * 100;
  });
  const k = sma(raw, smooth);
  return { k, d: sma(k, smooth) };
}

/** Supertrend line plus its direction (+1 up-trend, -1 down-trend). */
export function supertrend(bars: ChartBar[], period = 10, mult = 3) {
  const range = atr(bars, period);
  const line: number[] = [];
  const dir: number[] = [];
  let upper = 0;
  let lower = 0;
  let trend = 1;

  bars.forEach((b, i) => {
    const mid = (b.high + b.low) / 2;
    const rawUpper = mid + mult * range[i];
    const rawLower = mid - mult * range[i];
    if (i === 0) {
      upper = rawUpper;
      lower = rawLower;
    } else {
      const prevClose = bars[i - 1].close;
      upper = rawUpper < upper || prevClose > upper ? rawUpper : upper;
      lower = rawLower > lower || prevClose < lower ? rawLower : lower;
      trend = b.close > upper ? 1 : b.close < lower ? -1 : trend;
    }
    dir.push(trend);
    line.push(trend > 0 ? lower : upper);
  });

  return { line, dir };
}

/** Classic Ichimoku Cloud (9 / 26 / 52). */
export function ichimoku(bars: ChartBar[], tenkanLen = 9, kijunLen = 26, senkouLen = 52) {
  const midpoint = (period: number, i: number) => {
    const from = Math.max(0, i - period + 1);
    let high = -Infinity;
    let low = Infinity;
    for (let j = from; j <= i; j += 1) {
      high = Math.max(high, bars[j].high);
      low = Math.min(low, bars[j].low);
    }
    return (high + low) / 2;
  };

  const tenkan: number[] = [];
  const kijun: number[] = [];
  const spanA: number[] = [];
  const spanB: number[] = [];
  const chikou: number[] = [];

  bars.forEach((b, i) => {
    const t = midpoint(tenkanLen, i);
    const k = midpoint(kijunLen, i);
    tenkan.push(t);
    kijun.push(k);
    spanA.push((t + k) / 2);
    spanB.push(midpoint(senkouLen, i));
    chikou.push(b.close);
  });

  return { tenkan, kijun, spanA, spanB, chikou, displacement: kijunLen };
}

/** Commodity Channel Index. */
export function cci(bars: ChartBar[], period = 20): number[] {
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  return tp.map((_, i) => {
    if (i < period - 1) return 0;
    const slice = tp.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const mad = slice.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
    return mad === 0 ? 0 : (tp[i] - mean) / (0.015 * mad);
  });
}

/** Williams %R (typically -100…0). */
export function williamsR(bars: ChartBar[], period = 14): number[] {
  return bars.map((b, i) => {
    const from = Math.max(0, i - period + 1);
    let high = -Infinity;
    let low = Infinity;
    for (let j = from; j <= i; j += 1) {
      high = Math.max(high, bars[j].high);
      low = Math.min(low, bars[j].low);
    }
    return high === low ? -50 : ((high - b.close) / (high - low)) * -100;
  });
}

/** On-Balance Volume. */
export function obv(bars: ChartBar[]): number[] {
  const out: number[] = [];
  let prev = 0;
  bars.forEach((b, i) => {
    if (i === 0) {
      prev = b.volume || 0;
    } else {
      const dir = b.close > bars[i - 1].close ? 1 : b.close < bars[i - 1].close ? -1 : 0;
      prev += dir * (b.volume || 0);
    }
    out.push(prev);
  });
  return out;
}

/** Momentum / Rate of Change helpers. */
export function momentum(closes: number[], period = 10): number[] {
  return closes.map((c, i) => (i < period ? 0 : c - closes[i - period]));
}

export function roc(closes: number[], period = 12): number[] {
  return closes.map((c, i) => {
    if (i < period || closes[i - period] === 0) return 0;
    return ((c - closes[i - period]) / closes[i - period]) * 100;
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
