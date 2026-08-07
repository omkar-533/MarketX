/**
 * request.security — same-symbol HTF resample from chart bars (v1).
 */

import { isFiniteNum, nan, splitArgs } from '../util.mjs';
import { atr, ema, rsi, sma } from './ta.mjs';

const TF_SECONDS = {
  '1': 60,
  '3': 180,
  '5': 300,
  '8': 480,
  '12': 720,
  '15': 900,
  '20': 1200,
  '30': 1800,
  '45': 2700,
  '60': 3600,
  '120': 7200,
  '180': 10800,
  '240': 14400,
  '1440': 86400,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  'd': 86400,
  '1d': 86400,
  'w': 604800,
  '1w': 604800,
  'm': 2592000,
  '1m': 2592000,
  '12m': 31536000,
};

export function parseTimeframeSeconds(tf) {
  const t = String(tf || '').trim().toLowerCase();
  if (!t) return 0; // empty → chart TF
  if (TF_SECONDS[t] != null) return TF_SECONDS[t];
  const m = /^(\d+)([mhdw])?$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    const u = m[2] || 'm';
    if (u === 'm') return n * 60;
    if (u === 'h') return n * 3600;
    if (u === 'd') return n * 86400;
    if (u === 'w') return n * 604800;
  }
  if (/^\d+$/.test(t)) return Number(t) * 60;
  return null;
}

export function resampleBars(ctx, tfSec) {
  if (!tfSec || tfSec <= 0) return null;
  const out = { open: [], high: [], low: [], close: [], volume: [], time: [] };
  const mapFromLtf = new Array(ctx.n).fill(0);
  let bucket = null;

  for (let i = 0; i < ctx.n; i += 1) {
    const t = ctx.time[i] || i;
    const start = Math.floor(t / tfSec) * tfSec;
    if (!bucket || bucket.start !== start) {
      if (bucket) {
        out.open.push(bucket.open);
        out.high.push(bucket.high);
        out.low.push(bucket.low);
        out.close.push(bucket.close);
        out.volume.push(bucket.volume);
        out.time.push(bucket.start);
      }
      bucket = {
        start,
        open: ctx.open[i],
        high: ctx.high[i],
        low: ctx.low[i],
        close: ctx.close[i],
        volume: ctx.volume[i] || 0,
      };
    } else {
      bucket.high = Math.max(bucket.high, ctx.high[i]);
      bucket.low = Math.min(bucket.low, ctx.low[i]);
      bucket.close = ctx.close[i];
      bucket.volume += ctx.volume[i] || 0;
    }
    mapFromLtf[i] = Math.max(0, out.close.length);
  }
  if (bucket) {
    out.open.push(bucket.open);
    out.high.push(bucket.high);
    out.low.push(bucket.low);
    out.close.push(bucket.close);
    out.volume.push(bucket.volume);
    out.time.push(bucket.start);
    for (let i = 0; i < ctx.n; i += 1) {
      if (mapFromLtf[i] >= out.close.length) mapFromLtf[i] = out.close.length - 1;
    }
  }
  return { htf: out, mapFromLtf };
}

function htfTrend(htf, hi) {
  if (hi < 2) return 0;
  const a = htf.close[hi];
  const b = htf.close[Math.max(0, hi - 3)];
  if (!isFiniteNum(a) || !isFiniteNum(b)) return 0;
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

function htfCandleValues(htf, hi, len = 9) {
  const src = htf.close.slice(0, hi + 1);
  const cur = ema(src, len);
  const prevSrc = htf.close.slice(0, Math.max(1, hi));
  const prev = ema(prevSrc, len);
  const impulse = isFiniteNum(cur) && isFiniteNum(prev) && cur !== prev;
  return [cur, prev, impulse];
}

/**
 * Evaluate HTF expression. Supports OHLC, ta.*, get_candle_values(), structure(...).
 * User-fn callbacks for structure are lightweight stubs on MTF to keep /run under time limit;
 * chart-timeframe structure(false) runs fully in the main engine.
 */
export function requestSecurity(ctx, _ticker, timeframe, expr, evalUserFn) {
  const tfSec = parseTimeframeSeconds(timeframe);
  if (tfSec === null) {
    if (ctx.warnings.length < 40) {
      ctx.warnings.push(`request.security: unsupported timeframe ${timeframe}`);
    }
    return nan();
  }

  // Empty TF → current chart series
  if (tfSec === 0) {
    const e = String(expr || '').trim();
    if (/^(open|high|low|close|volume)$/i.test(e)) return ctx.ohlc(e.toLowerCase());
    if (/^hl\s*\(\s*\)$/i.test(e)) return [ctx.ohlc('high'), ctx.ohlc('low')];
    if (/^get_candle_values\s*\(\s*\)$/i.test(e)) {
      return htfCandleValues(
        { close: ctx.close.slice(0, ctx.barIndex + 1) },
        ctx.barIndex,
      );
    }
    if (/^structure\s*\(/i.test(e)) {
      return [nan(), false, false, 0, nan(), false, false, false, 0, nan(), false];
    }
    return ctx.ohlc('close');
  }

  let pack = ctx.securityCache.get(String(timeframe));
  if (!pack) {
    pack = resampleBars(ctx, tfSec);
    ctx.securityCache.set(String(timeframe), pack);
  }
  if (!pack) return nan();

  const hi = pack.mapFromLtf[ctx.barIndex] ?? pack.htf.close.length - 1;
  const htf = pack.htf;
  const e = String(expr || '').trim();

  if (/^(open|high|low|close|volume)$/i.test(e)) {
    const f = e.toLowerCase();
    return htf[f][hi] ?? nan();
  }

  if (/^hl\s*\(\s*\)$/i.test(e)) {
    return [htf.high[hi] ?? nan(), htf.low[hi] ?? nan()];
  }

  if (/^\[\s*(high|low|close|open)/i.test(e)) {
    const inner = e.slice(1, -1);
    return splitArgs(inner).map((part) => {
      const f = part.trim().toLowerCase();
      if (f === 'high' || f === 'low' || f === 'close' || f === 'open' || f === 'volume') {
        return htf[f][hi] ?? nan();
      }
      return nan();
    });
  }

  // get_candle_values() — EMA triplet used by Wolf SMC
  if (/^get_candle_values\s*\(\s*\)$/i.test(e)) {
    return htfCandleValues(htf, hi);
  }

  // structure(true|false) on HTF — return 11-tuple; only itrend/trend meaningful for MTF
  if (/^structure\s*\(/i.test(e)) {
    const tr = htfTrend(htf, hi);
    return [nan(), false, false, tr, nan(), false, false, false, tr, nan(), false];
  }

  let m = /^ta\.(sma|ema|rsi)\s*\(\s*(close|open|high|low)\s*,\s*(\d+)\s*\)$/i.exec(e);
  if (m) {
    const fn = m[1].toLowerCase();
    const field = m[2].toLowerCase();
    const len = Number(m[3]);
    const src = htf[field].slice(0, hi + 1);
    if (fn === 'sma') return sma(src, len);
    if (fn === 'ema') return ema(src, len);
    if (fn === 'rsi') return rsi(src, len);
  }

  m = /^ta\.atr\s*\(\s*(\d+)\s*\)$/i.exec(e);
  if (m) {
    return atr(
      { barIndex: hi, high: htf.high, low: htf.low, close: htf.close, open: htf.open },
      Number(m[1]),
    );
  }

  // Optional: callback for other user functions
  if (typeof evalUserFn === 'function') {
    const call = /^([A-Za-z_][\w]*)\s*\((.*)\)\s*$/.exec(e);
    if (call) {
      try {
        return evalUserFn(call[1], call[2], htf, hi);
      } catch {
        /* fall through */
      }
    }
  }

  const num = Number(e);
  if (isFiniteNum(num)) return num;

  if (ctx.warnings.length < 40) {
    ctx.warnings.push(`request.security expr limited: ${e.slice(0, 60)}`);
  }
  return htf.close[hi] ?? nan();
}
