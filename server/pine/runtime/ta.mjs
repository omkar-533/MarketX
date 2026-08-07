/**
 * Technical analysis builtins for Wolf Pine.
 */

import { isFiniteNum, nan, nz } from '../util.mjs';

export function sma(src, len) {
  const n = Math.max(1, Math.floor(Number(len) || 1));
  if (!Array.isArray(src) || src.length < n) return nan();
  let sum = 0;
  for (let i = src.length - n; i < src.length; i += 1) {
    const v = src[i];
    if (!isFiniteNum(v)) return nan();
    sum += v;
  }
  return sum / n;
}

export function ema(src, len) {
  const n = Math.max(1, Math.floor(Number(len) || 1));
  if (!Array.isArray(src) || !src.length) return nan();
  const k = 2 / (n + 1);
  let e = src[0];
  for (let i = 1; i < src.length; i += 1) {
    const v = src[i];
    if (!isFiniteNum(v)) continue;
    e = isFiniteNum(e) ? v * k + e * (1 - k) : v;
  }
  return e;
}

export function rma(src, len) {
  const n = Math.max(1, Math.floor(Number(len) || 1));
  if (!Array.isArray(src) || !src.length) return nan();
  let r = src[0];
  for (let i = 1; i < src.length; i += 1) {
    const v = src[i];
    if (!isFiniteNum(v)) continue;
    r = isFiniteNum(r) ? (r * (n - 1) + v) / n : v;
  }
  return r;
}

export function rsi(src, len) {
  const n = Math.max(1, Math.floor(Number(len) || 14));
  if (!Array.isArray(src) || src.length < n + 1) return nan();
  let gains = 0;
  let losses = 0;
  for (let i = src.length - n; i < src.length; i += 1) {
    const d = src[i] - src[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function atr(ctx, len) {
  const n = Math.max(1, Math.floor(Number(len) || 14));
  const i = ctx.barIndex;
  if (i < 1) return nan();
  const trs = [];
  for (let j = Math.max(1, i - n + 1); j <= i; j += 1) {
    const h = ctx.high[j];
    const l = ctx.low[j];
    const pc = ctx.close[j - 1];
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return sma(trs, trs.length);
}

export function highest(src, len) {
  const n = Math.max(1, Math.floor(Number(len) || 1));
  if (!Array.isArray(src) || !src.length) return nan();
  let m = -Infinity;
  const start = Math.max(0, src.length - n);
  for (let i = start; i < src.length; i += 1) {
    if (isFiniteNum(src[i]) && src[i] > m) m = src[i];
  }
  return m === -Infinity ? nan() : m;
}

export function lowest(src, len) {
  const n = Math.max(1, Math.floor(Number(len) || 1));
  if (!Array.isArray(src) || !src.length) return nan();
  let m = Infinity;
  const start = Math.max(0, src.length - n);
  for (let i = start; i < src.length; i += 1) {
    if (isFiniteNum(src[i]) && src[i] < m) m = src[i];
  }
  return m === Infinity ? nan() : m;
}

export function change(src, len = 1) {
  const n = Math.max(1, Math.floor(Number(len) || 1));
  if (!Array.isArray(src) || src.length <= n) return nan();
  const a = src[src.length - 1];
  const b = src[src.length - 1 - n];
  if (!isFiniteNum(a) || !isFiniteNum(b)) return nan();
  return a - b;
}

export function stdev(src, len) {
  const n = Math.max(1, Math.floor(Number(len) || 1));
  if (!Array.isArray(src) || src.length < n) return nan();
  const mean = sma(src, n);
  if (!isFiniteNum(mean)) return nan();
  let s = 0;
  for (let i = src.length - n; i < src.length; i += 1) {
    const d = src[i] - mean;
    s += d * d;
  }
  return Math.sqrt(s / n);
}

export function pivothigh(high, left, right) {
  const L = Math.max(0, Math.floor(Number(left) || 0));
  const R = Math.max(0, Math.floor(Number(right) || 0));
  if (!Array.isArray(high) || high.length < L + R + 1) return nan();
  const pivot = high.length - 1 - R;
  if (pivot < L) return nan();
  const v = high[pivot];
  if (!isFiniteNum(v)) return nan();
  for (let i = pivot - L; i <= pivot + R; i += 1) {
    if (i === pivot) continue;
    if (!isFiniteNum(high[i]) || high[i] >= v) return nan();
  }
  return v;
}

export function pivotlow(low, left, right) {
  const L = Math.max(0, Math.floor(Number(left) || 0));
  const R = Math.max(0, Math.floor(Number(right) || 0));
  if (!Array.isArray(low) || low.length < L + R + 1) return nan();
  const pivot = low.length - 1 - R;
  if (pivot < L) return nan();
  const v = low[pivot];
  if (!isFiniteNum(v)) return nan();
  for (let i = pivot - L; i <= pivot + R; i += 1) {
    if (i === pivot) continue;
    if (!isFiniteNum(low[i]) || low[i] <= v) return nan();
  }
  return v;
}

export function crossover(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return false;
  const a0 = a[a.length - 1];
  const a1 = a[a.length - 2];
  const b0 = b[b.length - 1];
  const b1 = b[b.length - 2];
  return a1 <= b1 && a0 > b0;
}

export function crossunder(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return false;
  const a0 = a[a.length - 1];
  const a1 = a[a.length - 2];
  const b0 = b[b.length - 1];
  const b1 = b[b.length - 2];
  return a1 >= b1 && a0 < b0;
}

export function seriesSlice(ctx, fieldOrArr) {
  if (Array.isArray(fieldOrArr)) return fieldOrArr.slice(0, ctx.barIndex + 1);
  if (typeof fieldOrArr === 'string') {
    const f = fieldOrArr.toLowerCase();
    if (f === 'close' || f === 'open' || f === 'high' || f === 'low' || f === 'volume') {
      return ctx[f].slice(0, ctx.barIndex + 1);
    }
    // UDT field series e.g. b.c / b.h — prefer tracked series buffer
    const buf = ctx.series.get(fieldOrArr);
    if (buf && buf.data.length) return buf.data.slice(0, ctx.barIndex + 1);
    // Fallback: map known bar aliases onto OHLC
    const m = /^b\.(c|o|h|l|v|t|n)$/i.exec(fieldOrArr);
    if (m) {
      const key =
        m[1].toLowerCase() === 'c'
          ? 'close'
          : m[1].toLowerCase() === 'o'
            ? 'open'
            : m[1].toLowerCase() === 'h'
              ? 'high'
              : m[1].toLowerCase() === 'l'
                ? 'low'
                : m[1].toLowerCase() === 'v'
                  ? 'volume'
                  : m[1].toLowerCase() === 't'
                    ? 'time'
                    : null;
      if (key === 'time') return ctx.time.slice(0, ctx.barIndex + 1);
      if (key) return ctx[key].slice(0, ctx.barIndex + 1);
      // b.n → bar_index series
      return Array.from({ length: ctx.barIndex + 1 }, (_, i) => i);
    }
  }
  if (isFiniteNum(fieldOrArr)) {
    // Constant level: use same level across history (correct when level is sticky).
    return Array(ctx.barIndex + 1).fill(Number(fieldOrArr));
  }
  return [];
}

export function callTa(ctx, name, args) {
  const n = String(name).toLowerCase();
  const a0 = args[0];
  const a1 = args[1];
  const a2 = args[2];
  switch (n) {
    case 'sma':
      return sma(seriesSlice(ctx, a0), a1);
    case 'ema':
      return ema(seriesSlice(ctx, a0), a1);
    case 'rma':
      return rma(seriesSlice(ctx, a0), a1);
    case 'rsi':
      return rsi(seriesSlice(ctx, a0), a1);
    case 'atr':
      return atr(ctx, a0);
    case 'highest':
      return highest(seriesSlice(ctx, a0), a1);
    case 'lowest':
      return lowest(seriesSlice(ctx, a0), a1);
    case 'change':
      return change(seriesSlice(ctx, a0), a1 ?? 1);
    case 'stdev':
      return stdev(seriesSlice(ctx, a0), a1);
    case 'pivothigh':
      return pivothigh(seriesSlice(ctx, a0 ?? 'high'), a1, a2);
    case 'pivotlow':
      return pivotlow(seriesSlice(ctx, a0 ?? 'low'), a1, a2);
    case 'crossover':
      return crossover(seriesSlice(ctx, a0), seriesSlice(ctx, a1));
    case 'crossunder':
      return crossunder(seriesSlice(ctx, a0), seriesSlice(ctx, a1));
    case 'barssince':
      return a0 ? 0 : nan();
    case 'valuewhen':
      return isFiniteNum(a1) ? a1 : nan();
    case 'nz':
      return nz(a0, a1 ?? 0);
    case 'na':
      return !isFiniteNum(a0);
    default:
      ctx.warnings.push(`ta.${name} not implemented`);
      return nan();
  }
}
