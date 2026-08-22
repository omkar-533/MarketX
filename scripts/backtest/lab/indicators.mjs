/**
 * Indicator library for the strategy lab.
 *
 * Every series here is causal: the value at index i uses bars 0..i and nothing
 * after. Swing points are the one exception people usually get wrong, so they
 * are returned as "confirmed at" arrays rather than raw pivots — a pivot only
 * becomes tradeable once its right-hand bars exist.
 */

export function ema(values, period) {
  const out = new Float64Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function sma(values, period) {
  const out = new Float64Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function rsi(closes, period = 14) {
  const out = new Float64Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let ag = gain / period;
  let al = loss / period;
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(0, d)) / period;
    al = (al * (period - 1) + Math.max(0, -d)) / period;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

export function atr(highs, lows, closes, period = 14) {
  const n = closes.length;
  const out = new Float64Array(n).fill(NaN);
  if (n <= period) return out;
  const tr = new Float64Array(n);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Session-anchored VWAP. `dayStart[i]` marks the first bar of each session. */
export function sessionVwap(highs, lows, closes, volumes, dayStart) {
  const n = closes.length;
  const out = new Float64Array(n).fill(NaN);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < n; i++) {
    if (dayStart[i]) {
      pv = 0;
      vol = 0;
    }
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const v = volumes[i] || 0;
    pv += tp * v;
    vol += v;
    out[i] = vol > 0 ? pv / vol : closes[i];
  }
  return out;
}

/** Rolling average volume of the same bar-of-day across previous sessions. */
export function relativeVolume(volumes, barOfDay, barsPerDay, lookbackDays = 10) {
  const n = volumes.length;
  const out = new Float64Array(n).fill(NaN);
  const history = new Map();
  for (let i = 0; i < n; i++) {
    const slot = barOfDay[i];
    const past = history.get(slot);
    if (past && past.length >= 3) {
      const avg = past.reduce((a, b) => a + b, 0) / past.length;
      out[i] = avg > 0 ? volumes[i] / avg : NaN;
    }
    const arr = past || [];
    arr.push(volumes[i]);
    if (arr.length > lookbackDays) arr.shift();
    history.set(slot, arr);
  }
  return out;
}

/**
 * Confirmed swing levels.
 *
 * `swingHigh[i]` is the most recent pivot high that was already confirmed by
 * bar i, i.e. the pivot plus `right` bars have all printed. Using the raw pivot
 * the moment it forms would be look-ahead, which is the classic way a sweep
 * backtest ends up unrealistically good.
 */
export function confirmedSwings(highs, lows, left = 2, right = 2) {
  const n = highs.length;
  const swingHigh = new Float64Array(n).fill(NaN);
  const swingLow = new Float64Array(n).fill(NaN);
  const swingHighIdx = new Int32Array(n).fill(-1);
  const swingLowIdx = new Int32Array(n).fill(-1);

  let lastHigh = NaN;
  let lastLow = NaN;
  let lastHighIdx = -1;
  let lastLowIdx = -1;

  for (let i = 0; i < n; i++) {
    const p = i - right;
    if (p >= left) {
      let isHigh = true;
      let isLow = true;
      for (let k = p - left; k <= p + right; k++) {
        if (k === p) continue;
        if (highs[k] >= highs[p]) isHigh = false;
        if (lows[k] <= lows[p]) isLow = false;
      }
      if (isHigh) {
        lastHigh = highs[p];
        lastHighIdx = p;
      }
      if (isLow) {
        lastLow = lows[p];
        lastLowIdx = p;
      }
    }
    swingHigh[i] = lastHigh;
    swingLow[i] = lastLow;
    swingHighIdx[i] = lastHighIdx;
    swingLowIdx[i] = lastLowIdx;
  }
  return { swingHigh, swingLow, swingHighIdx, swingLowIdx };
}
