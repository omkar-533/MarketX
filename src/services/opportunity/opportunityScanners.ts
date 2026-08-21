/**
 * Wolf Opportunity scanners.
 * Desk lists six keepers. Proxy/watch scanners stay in this file but are not run.
 * Missing data → null. Never invents hits.
 */
import type { Candle } from '../radar/radarTypes';
import type {
  OpportunityDirection,
  OpportunityHit,
  OpportunityScannerId,
  OpportunityStatus,
  OpportunityTimeframe,
  RsiPoint,
  ScoreBreakdown,
  SymbolRsiSeries,
} from './opportunityTypes';
import { cardQuote, clampScore, emaAlignment, type FeatureSnapshot } from './featureSnapshot';
import { optionFlowDayPct, optionFlowSignal, type OptionFlowSnap } from './optionFlow';

type Ctx = {
  f: FeatureSnapshot;
  timeframe: OpportunityTimeframe;
  dataMode: 'LIVE' | 'DEMO';
  quotePrice?: number;
  /** Server-built Wilder RSI per timeframe. Absent → BOOSTERS returns no signal. */
  rsi?: SymbolRsiSeries | null;
  /** Skip score cutoff so Created time is the first print, not when quality crossed the gate. */
  forTimeWalk?: boolean;
};

function scoreGate(ctx: Ctx, score: number, min: number): boolean {
  return Boolean(ctx.forTimeWalk) || score >= min;
}

/** Latest session last + official-style day % (prev trading-day close). */
export function stampLiveQuote(hit: OpportunityHit, latest: FeatureSnapshot): OpportunityHit {
  const q = cardQuote(latest);
  if (q.price > 0) {
    hit.price = q.price;
    hit.changePercent = q.changePercent;
  }
  return hit;
}

function baseHit(
  scannerId: OpportunityScannerId,
  ctx: Ctx,
  partial: Omit<
    OpportunityHit,
    'id' | 'scannerId' | 'symbol' | 'exchange' | 'price' | 'changePercent' | 'timeframe' | 'detectedAt' | 'dataMode'
  >,
): OpportunityHit {
  const q = cardQuote(ctx.f);
  const price = ctx.quotePrice && ctx.quotePrice > 0 ? ctx.quotePrice : q.price;
  const changePercent =
    ctx.f.prevClose != null && ctx.f.prevClose > 0 && price > 0
      ? ((price - ctx.f.prevClose) / ctx.f.prevClose) * 100
      : q.changePercent;
  // X Factor is stamped here, from the snapshot the signal was judged on, so every
  // card — including any added later — carries it without repeating the maths.
  // A scanner that sets its own meta.xFactor still wins.
  const rvol = Math.max(ctx.f.volume?.ratio ?? 0, ctx.f.sessionVolRatio ?? 0);
  return {
    id: `opp-${scannerId}-${String(ctx.f.symbol || '').toUpperCase()}-${ctx.timeframe}`,
    scannerId,
    symbol: ctx.f.symbol,
    exchange: (ctx.f.exchange as 'NSE' | 'BSE') || 'NSE',
    price,
    changePercent,
    timeframe: ctx.timeframe,
    detectedAt: ctx.f.setupAt || 0,
    dataMode: ctx.dataMode,
    ...partial,
    meta: { ...xFactorMeta(rvol), ...partial.meta },
  };
}

function sumBreakdown(b: ScoreBreakdown): number {
  return clampScore(Object.values(b).reduce((a, n) => a + n, 0));
}

function lastBar(f: FeatureSnapshot): Candle | null {
  const bars = f.candles;
  if (!bars?.length) return null;
  return bars[bars.length - 1] ?? null;
}

function atrAbs(f: FeatureSnapshot): number | null {
  const n = f.tech.atr14;
  return n != null && n > 0 ? n : null;
}

/**
 * X Factor — relative volume of the signal bar against its recent average.
 * Left off entirely when it cannot be measured, so the tile falls back to the
 * score rather than printing a made-up multiple. Applied centrally in baseHit.
 */
function xFactorMeta(ratio: number): { xFactor?: number } {
  return Number.isFinite(ratio) && ratio > 0 ? { xFactor: Math.round(ratio * 100) / 100 } : {};
}

function priorBoxPct(f: FeatureSnapshot): number | null {
  if (f.high20 == null || f.low20 == null || !(f.low20 > 0)) return null;
  return ((f.high20 - f.low20) / f.low20) * 100;
}

function priorCoil(f: FeatureSnapshot): boolean {
  const box = priorBoxPct(f);
  const atrCoil = f.priorAtrCompression != null && f.priorAtrCompression <= 0.9;
  const boxCoil = box != null && box < 1.5;
  return atrCoil || boxCoil;
}

function closeBrokeLevel(bar: Candle, level: number, side: 'up' | 'down'): boolean {
  if (!(level > 0)) return false;
  const open = Number.isFinite(bar.open) ? bar.open : bar.close;
  const body = Math.abs(bar.close - open);
  const range = Math.max(bar.high - bar.low, 1e-9);
  if (body / range < 0.35) return false;
  if (side === 'up') {
    if (!(bar.close > level)) return false;
    const bodyLow = Math.min(open, bar.close);
    const bodyHigh = Math.max(open, bar.close);
    return bodyHigh - Math.max(level, bodyLow) >= body * 0.5;
  }
  if (!(bar.close < level)) return false;
  const bodyLow = Math.min(open, bar.close);
  const bodyHigh = Math.max(open, bar.close);
  return Math.min(level, bodyHigh) - bodyLow >= body * 0.5;
}

function notChased(last: number, level: number, atr: number, maxAtr = 1.2): boolean {
  return Math.abs(last - level) <= maxAtr * atr;
}

function emaPullbackHold(f: FeatureSnapshot, align: 'bullish' | 'bearish'): boolean {
  const ema21 = f.tech.ema21;
  const atr = atrAbs(f);
  const bars = f.candles?.slice(-5) || [];
  if (ema21 == null || atr == null || !bars.length) return false;
  if (align === 'bullish') {
    if (f.tech.last < ema21) return false;
    if (f.tech.last > ema21 + 1.6 * atr) return false;
    return bars.some((b) => b.low <= ema21 + 0.15 * atr);
  }
  if (f.tech.last > ema21) return false;
  if (f.tech.last < ema21 - 1.6 * atr) return false;
  return bars.some((b) => b.high >= ema21 - 0.15 * atr);
}

function sweepEvent(
  f: FeatureSnapshot,
): { buySide: boolean; level: number; reclaimed: boolean } | null {
  const atr = atrAbs(f);
  const bars = f.candles;
  if (atr == null || !bars || bars.length < 2) return null;
  if (f.volume.ratio < 1.1) return null;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const wick = atr * 0.2;

  const tryLevel = (level: number, buySide: boolean) => {
    const swept = buySide
      ? Math.min(prev.low, last.low) <= level - wick
      : Math.max(prev.high, last.high) >= level + wick;
    if (!swept) return null;
    const reclaimed = buySide ? last.close > level : last.close < level;
    return { buySide, level, reclaimed };
  };

  const liq = f.liquidity;
  if (liq.type === 'LIQUIDITY_SWEEP' && liq.level > 0) {
    const buySide = liq.direction === 'bullish';
    const ev = tryLevel(liq.level, buySide);
    if (ev) return ev;
  }

  const low = f.swingLow ?? f.low10;
  if (low != null) {
    const ev = tryLevel(low, true);
    if (ev) return ev;
  }
  const high = f.swingHigh ?? f.high10;
  if (high != null) {
    const ev = tryLevel(high, false);
    if (ev) return ev;
  }
  return null;
}

function volumeLive(f: FeatureSnapshot, min = 1.2): boolean {
  return f.volume.ratio >= min || (f.sessionVolRatio ?? 0) >= min;
}

function volumeRising(f: FeatureSnapshot): boolean {
  const bars = f.candles;
  if (!bars || bars.length < 3) return f.volume.ratio >= 1.3;
  const last = Number(bars[bars.length - 1]?.volume) || 0;
  const prev = Number(bars[bars.length - 2]?.volume) || 0;
  const prev2 = Number(bars[bars.length - 3]?.volume) || 0;
  const avg = (prev + prev2) / 2;
  return (avg > 0 && last > avg * 1.15) || f.volume.ratio >= 1.4;
}

function last2VolumeUp(f: FeatureSnapshot): boolean {
  const bars = f.candles;
  if (!bars || bars.length < 2) return f.volume.ratio >= 1.5;
  const last = Number(bars[bars.length - 1]?.volume) || 0;
  const prev = Number(bars[bars.length - 2]?.volume) || 0;
  return last > prev || f.volume.ratio >= 1.5;
}

function last3AccelPct(f: FeatureSnapshot): number | null {
  const c = f.candles;
  if (!c || c.length < 4) return f.roc5 ?? null;
  const from = c[c.length - 4].close;
  const to = c[c.length - 1].close;
  if (!(from > 0)) return null;
  return ((to - from) / from) * 100;
}

function vwapHeld(f: FeatureSnapshot, bullish: boolean): boolean {
  if (f.vwap == null) return true;
  return bullish ? f.tech.last >= f.vwap : f.tech.last <= f.vwap;
}

function nearLevel(last: number, level: number, atr: number, maxAtr = 0.35): boolean {
  return Math.abs(last - level) <= maxAtr * atr;
}

function earlyNear(last: number, level: number, atr: number): boolean {
  const band = Math.max(atr * 1.25, Math.abs(last) * 0.004);
  return Math.abs(last - level) <= band;
}

function tagsLevel(bar: Candle, level: number, side: 'up' | 'down'): boolean {
  if (!(level > 0)) return false;
  return side === 'up' ? bar.high >= level : bar.low <= level;
}

/** First closed session bars — 5m 9:20–9:35, 15m first two, 1h first bar. */
function openDriveWindow(f: FeatureSnapshot): boolean {
  const m = f.sessionMinsFromOpen;
  if (m == null || m < 0) return false;
  if (f.timeframe === '1h' || f.timeframe === '1D') return m <= 60;
  if (f.timeframe === '15m') return m <= 30;
  return m <= 20;
}

function boxHigh(f: FeatureSnapshot): number | null {
  if (openDriveWindow(f) && f.prevDayHigh != null && f.prevDayHigh > 0) {
    if (f.high20 != null) {
      return Math.abs(f.tech.last - f.prevDayHigh) <= Math.abs(f.tech.last - f.high20)
        ? f.prevDayHigh
        : f.high20;
    }
    return f.prevDayHigh;
  }
  return f.high20 ?? f.high10 ?? f.prevDayHigh ?? null;
}

function boxLow(f: FeatureSnapshot): number | null {
  if (openDriveWindow(f) && f.prevDayLow != null && f.prevDayLow > 0) {
    if (f.low20 != null) {
      return Math.abs(f.tech.last - f.prevDayLow) <= Math.abs(f.tech.last - f.low20)
        ? f.prevDayLow
        : f.low20;
    }
    return f.prevDayLow;
  }
  return f.low20 ?? f.low10 ?? f.prevDayLow ?? null;
}

function brokeLevel(bar: Candle, level: number, side: 'up' | 'down', early: boolean): boolean {
  if (early) {
    if (!(level > 0)) return false;
    const open = Number.isFinite(bar.open) ? bar.open : bar.close;
    const body = Math.abs(bar.close - open);
    const range = Math.max(bar.high - bar.low, 1e-9);
    if (body / range < 0.25) return false;
    return side === 'up' ? bar.close > level : bar.close < level;
  }
  return closeBrokeLevel(bar, level, side);
}

function tooExtended(last: number, level: number, atr: number, maxAtr = 2): boolean {
  return Math.abs(last - level) > maxAtr * atr;
}

/**
 * MORNING SPRINT — from the first closed 5m bar (9:20) until the close.
 * Rule: Open == Day Low (long) or Open == Day High (short).
 * Live list: the symbol is listed only while the equality still holds, and the
 * card drops it on the first bar that breaks it.
 */
export function scanMorningSprint(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const atr = atrAbs(f);
  if (atr == null) return null;
  const mins = f.sessionMinsFromOpen;
  // First closed 5m bar appears at 9:20 (mins=5). Before that we stay silent.
  // No upper bound: the rule is re-checked till the close, so late breaks still
  // drop the symbol. A morning-only window froze the list at ~10:55 instead.
  if (mins == null || mins < 5) return null;
  const chg = f.sessionChangePct;
  const sessOpen = f.sessionOpen;
  const sessLow = f.sessionLow;
  const sessHigh = f.sessionHigh;
  if (
    chg == null ||
    sessOpen == null ||
    !(sessOpen > 0) ||
    sessLow == null ||
    sessHigh == null
  ) {
    return null;
  }

  // Small tolerance for feed rounding noise (paise-level).
  const eqBand = Math.max(0.02, atr * 0.08, sessOpen * 0.00035);
  const openEqLow = Math.abs(sessOpen - sessLow) <= eqBand;
  const openEqHigh = Math.abs(sessHigh - sessOpen) <= eqBand;
  if (openEqLow === openEqHigh) return null;

  const bullish = openEqLow;
  // Safety: direction must match current session move.
  if ((bullish && chg < -0.02) || (!bullish && chg > 0.02)) return null;
  const vol = Math.max(f.volume.ratio, f.sessionVolRatio ?? 0);
  const trigger = bullish ? sessHigh : sessLow;
  // Only a broken open/low equality may drop a symbol. Distance from the day
  // extreme is an ordinary pullback, and gating on it silently hid valid names.
  if (!(trigger > 0)) return null;

  const breakdown: ScoreBreakdown = {
    openRule: 30,
    move: clampScore(10 + Math.min(14, Math.abs(chg) * 8), 24),
    volume: clampScore(8 + Math.min(12, Math.max(0, vol - 0.9) * 14), 20),
    vwap: f.vwap != null ? 14 : 10,
    timing: mins <= 20 ? 16 : mins <= 60 ? 12 : 9,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 55)) return null;

  return baseHit('morning_sprint', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: 'ACTIVE',
    score,
    breakdown,
    stateLabel: bullish ? 'OPEN = LOW' : 'OPEN = HIGH',
    why: bullish
      ? `Open ₹${sessOpen.toFixed(2)} abhi tak day low ke barabar hai (${Math.round(mins)} min). Day move ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%, volume ${vol.toFixed(1)}×.`
      : `Open ₹${sessOpen.toFixed(2)} abhi tak day high ke barabar hai (${Math.round(mins)} min). Day move ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%, volume ${vol.toFixed(1)}×.`,
    keyLevel: sessOpen,
    trigger,
    invalidation: bullish
      ? `Aaj ka low open ₹${sessOpen.toFixed(2)} ke neeche gaya to setup remove.`
      : `Aaj ka high open ₹${sessOpen.toFixed(2)} ke upar gaya to setup remove.`,
    confirmationNeeded: bullish
      ? `Open=Low hold rahe aur day high ₹${trigger.toFixed(2)} break ho to continuation.`
      : `Open=High hold rahe aur day low ₹${trigger.toFixed(2)} break ho to continuation.`,
    evidence: [
      { label: bullish ? 'Daily Open = Daily Low' : 'Daily Open = Daily High', ok: true },
      { label: `Open ₹${sessOpen.toFixed(2)}`, ok: true },
      { label: `Session ${bullish ? 'low' : 'high'} ₹${(bullish ? sessLow : sessHigh).toFixed(2)}`, ok: true },
      { label: `Open se ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% (${Math.round(mins)} min)`, ok: true },
      { label: `Volume ${vol.toFixed(1)}×`, ok: vol >= 1 },
      {
        label: f.vwap != null ? `VWAP ₹${f.vwap.toFixed(2)}` : 'VWAP n/a',
        ok: f.vwap != null,
      },
    ],
    meta: {
      pattern: bullish ? 'open_equals_low' : 'open_equals_high',
      eqBand,
    },
  });
}

/** TOP MOVERS — accelerating now, not a dead day winner. */
export function scanTopMovers(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const atr = atrAbs(f);
  if (atr == null) return null;
  const sessChg = f.sessionChangePct;
  if (sessChg == null) return null;
  if (Math.abs(sessChg) < Math.max(0.7, 0.9 * (f.atrPct || 0))) return null;
  if (!volumeLive(f, 1.15)) return null;

  const accel = last3AccelPct(f);
  const canMeasure = (f.candles?.length || 0) >= 4;
  const liveNow = f.volume.ratio >= 1.35 || volumeRising(f);
  const stillAccel = accel != null && Math.abs(accel) >= 0.35;
  if (canMeasure && !(liveNow && stillAccel)) return null;
  if (!canMeasure && !liveNow) return null;

  const bullish = sessChg >= 0;
  if (canMeasure && accel != null && ((bullish && accel < -0.15) || (!bullish && accel > 0.15))) return null;
  if (!vwapHeld(f, bullish)) return null;

  const trigger = bullish ? f.sessionHigh : f.sessionLow;
  if (trigger != null && tooExtended(f.tech.last, trigger, atr, 2.2)) return null;

  const levelBreak =
    bullish && f.prevDayHigh != null
      ? f.tech.last > f.prevDayHigh
      : !bullish && f.prevDayLow != null
        ? f.tech.last < f.prevDayLow
        : false;
  const mins = f.sessionMinsFromOpen ?? 999;
  const vol = Math.max(f.volume.ratio, f.sessionVolRatio ?? 0);
  const active = liveNow && (!canMeasure || stillAccel);
  const breakdown: ScoreBreakdown = {
    move: clampScore(14 + Math.min(11, Math.abs(sessChg) * 5), 25),
    volume: clampScore(12 + Math.min(13, (vol - 1.15) * 15), 25),
    vwap: f.vwap != null ? 18 : 12,
    levels: levelBreak ? 18 : 10,
    timing: stillAccel ? 14 : mins <= 60 ? 12 : 9,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, active ? 58 : 55)) return null;

  return baseHit('top_movers', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: active ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: active
      ? levelBreak
        ? bullish
          ? '🔥 PDH BREAK'
          : '🔥 PDL BREAK'
        : 'RUNNING'
      : 'WATCH ACCEL',
    why: active
      ? `Aaj ${sessChg >= 0 ? '+' : ''}${sessChg.toFixed(2)}%, last-3 ${accel != null ? `${accel >= 0 ? '+' : ''}${accel.toFixed(2)}%` : 'n/a'}, volume ${vol.toFixed(1)}× — abhi accelerate.`
      : `Day move ${sessChg >= 0 ? '+' : ''}${sessChg.toFixed(2)}% + volume zinda — acceleration confirm ka wait.`,
    keyLevel: f.vwap ?? f.tech.ema21,
    trigger,
    invalidation: bullish
      ? `VWAP ₹${(f.vwap ?? f.tech.last * 0.99).toFixed(2)} ke neeche close`
      : `VWAP ₹${(f.vwap ?? f.tech.last * 1.01).toFixed(2)} ke upar close`,
    confirmationNeeded: active
      ? bullish
        ? 'Buy above day high; VWAP cross ke neeche exit.'
        : 'Sell below day low; VWAP cross ke upar exit.'
      : 'WATCH — last 3 bars tez hon tab entry.',
    evidence: [
      { label: `Aaj ${sessChg >= 0 ? '+' : ''}${sessChg.toFixed(2)}%`, ok: true },
      {
        label: accel != null ? `Last-3 ${accel >= 0 ? '+' : ''}${accel.toFixed(2)}%` : 'Last-3 n/a',
        ok: stillAccel,
      },
      { label: `Vol now ${f.volume.ratio.toFixed(1)}×`, ok: liveNow },
      { label: levelBreak ? (bullish ? 'PDH break' : 'PDL break') : 'PDH/PDL intact', ok: levelBreak },
    ],
    meta: { early: !active },
  });
}

/** Wilder RSI printed at or before `atMs` — never a future bar's value. */
function rsiAsOf(series: RsiPoint[] | undefined, atMs: number): number | null {
  if (!series?.length || !(atMs > 0)) return null;
  let lo = 0;
  let hi = series.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= atMs) {
      found = series[mid][1];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Number.isFinite(found as number) ? found : null;
}

/**
 * BOOSTERS — 5-minute momentum breakout, both sides.
 * LONG:  2h RSI > 50, 30m RSI > 60, 5m RSI > 60, 5m close > previous 5m close.
 * SHORT: 2h RSI < 50, 30m RSI < 40, 5m RSI < 40, 5m close < previous 5m close.
 * Higher-timeframe RSI is server-built; without it this scanner stays silent.
 */
export function scanOpeningDrive(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  if (ctx.timeframe !== '5m') return null;
  const bars = f.candles;
  if (!bars || bars.length < 2) return null;
  const bar = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  if (!bar || !prev || !(bar.close > 0) || !(prev.close > 0)) return null;

  const at = f.setupAt || 0;
  const r5 = rsiAsOf(ctx.rsi?.m5, at);
  const r30 = rsiAsOf(ctx.rsi?.m30, at);
  const r2h = rsiAsOf(ctx.rsi?.h2, at);
  if (r5 == null || r30 == null || r2h == null) return null;

  const bullish = r2h > 50 && r30 > 60 && r5 > 60 && bar.close > prev.close;
  const bearish = r2h < 50 && r30 < 40 && r5 < 40 && bar.close < prev.close;
  if (bullish === bearish) return null;

  const stretch = bullish ? Math.min(r5 - 60, r30 - 60) : Math.min(40 - r5, 40 - r30);
  const anchor = bullish ? r2h - 50 : 50 - r2h;
  const closeStepPct = Math.abs((bar.close - prev.close) / prev.close) * 100;
  const vol = Math.max(f.volume.ratio, f.sessionVolRatio ?? 0);
  const breakdown: ScoreBreakdown = {
    rsiStack: 34,
    rsiStrength: clampScore(6 + Math.min(14, stretch), 20),
    higherTf: clampScore(6 + Math.min(10, anchor), 16),
    closeStep: clampScore(6 + Math.min(10, closeStepPct * 12), 16),
    volume: clampScore(4 + Math.min(10, Math.max(0, vol - 0.9) * 12), 14),
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 55)) return null;

  const side = bullish ? 'bullish' : 'bearish';
  const r = (n: number) => n.toFixed(1);
  return baseHit('opening_drive', ctx, {
    direction: side,
    status: 'ACTIVE',
    score,
    breakdown,
    stateLabel: bullish ? 'BOOSTER LONG' : 'BOOSTER SHORT',
    why: bullish
      ? `2h RSI ${r(r2h)} > 50, 30m RSI ${r(r30)} > 60, 5m RSI ${r(r5)} > 60 aur 5m close ₹${bar.close.toFixed(2)} pichhle close ₹${prev.close.toFixed(2)} se upar.`
      : `2h RSI ${r(r2h)} < 50, 30m RSI ${r(r30)} < 40, 5m RSI ${r(r5)} < 40 aur 5m close ₹${bar.close.toFixed(2)} pichhle close ₹${prev.close.toFixed(2)} se neeche.`,
    keyLevel: prev.close,
    trigger: bar.close,
    invalidation: bullish
      ? `Koi bhi RSI condition toote ya 5m close ₹${prev.close.toFixed(2)} se neeche aaye to setup khatam.`
      : `Koi bhi RSI condition toote ya 5m close ₹${prev.close.toFixed(2)} se upar aaye to setup khatam.`,
    confirmationNeeded: bullish
      ? 'Agla 5m bar bhi higher close de to momentum continue.'
      : 'Agla 5m bar bhi lower close de to momentum continue.',
    evidence: [
      { label: `2h RSI ${r(r2h)} ${bullish ? '> 50' : '< 50'}`, ok: true },
      { label: `30m RSI ${r(r30)} ${bullish ? '> 60' : '< 40'}`, ok: true },
      { label: `5m RSI ${r(r5)} ${bullish ? '> 60' : '< 40'}`, ok: true },
      {
        label: `5m close ₹${bar.close.toFixed(2)} ${bullish ? '>' : '<'} ₹${prev.close.toFixed(2)}`,
        ok: true,
      },
      { label: `Volume ${vol.toFixed(1)}×`, ok: vol >= 1 },
    ],
    meta: {
      rsi5m: r5,
      rsi30m: r30,
      rsi2h: r2h,
      pattern: bullish ? 'booster_long' : 'booster_short',
    },
  });
}

/** PRICE RUNNERS — volume pehle, price baad. Day-long quiet move is Top Movers. */
export function scanMomentumSurge(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const bar = lastBar(f);
  const atr = atrAbs(f);
  if (!bar || atr == null) return null;
  if (!volumeLive(f, 1.15)) return null;

  const rvol = f.volume.ratio;
  const sessVol = f.sessionVolRatio ?? 0;
  const vol = Math.max(rvol, sessVol);
  const range = Math.max(bar.high - bar.low, 1e-9);
  const body = Math.abs(bar.close - (Number.isFinite(bar.open) ? bar.open : bar.close));
  const barAtr = range / atr;
  const exploded = barAtr >= 0.7;
  const burst5 = f.roc5 != null && Math.abs(f.roc5) >= 0.5;
  const burst20 = Math.abs(f.changePercent) >= Math.max(0.7, 0.9 * (f.atrPct || 0));
  const accel = last3AccelPct(f);
  const recentBurst = exploded || burst5 || (accel != null && Math.abs(accel) >= 0.45);
  const inside20 =
    (f.high20 == null || bar.close <= f.high20) && (f.low20 == null || bar.close >= f.low20);
  const volLead = rvol >= 1.5 && inside20 && !exploded && last2VolumeUp(f);
  if (!recentBurst && !burst20 && !volLead) return null;
  if (body / range < 0.35 && exploded && !burst5) return null;

  const signed = exploded
    ? bar.close - (Number.isFinite(bar.open) ? bar.open : bar.close)
    : burst5 && f.roc5 != null
      ? f.roc5
      : accel != null
        ? accel
        : f.changePercent;
  const bullish = signed >= 0;
  const movePct = burst5 && f.roc5 != null ? f.roc5 : accel != null ? accel : f.changePercent;
  const active = recentBurst || burst20;
  const breakdown: ScoreBreakdown = {
    momentum: clampScore((active ? 16 : 10) + Math.min(9, Math.abs(movePct) * 4), 25),
    volume: clampScore(13 + Math.min(12, (vol - 1.3) * 14), 25),
    expansion: exploded ? 20 : burst5 ? 16 : active ? 14 : 10,
    range: exploded ? 18 : barAtr >= 0.5 ? 14 : 12,
    confirmation: vol >= 2.2 ? 12 : vol >= 1.6 ? 11 : 10,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, active ? 58 : 55)) return null;

  return baseHit('momentum_surge', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: active ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: active ? (exploded || vol >= 2 ? '🔥 RUNNING' : 'RUNNER') : 'WATCH VOL',
    why: active
      ? `Volume ${vol.toFixed(1)}× with a ${Math.abs(movePct).toFixed(2)}% burst — runner, not a pullback wait.`
      : `Volume ${rvol.toFixed(1)}× pehle, price abhi 20-bar box ke andar — blast se pehle.`,
    keyLevel: bullish ? f.high20 : f.low20,
    trigger: bullish ? f.sessionHigh ?? f.high10 : f.sessionLow ?? f.low10,
    invalidation: bullish
      ? `Close back below ₹${(f.tech.sma20 ?? f.tech.last * 0.99).toFixed(2)}`
      : `Close back above ₹${(f.tech.sma20 ?? f.tech.last * 1.01).toFixed(2)}`,
    confirmationNeeded: active
      ? 'This is a running name — trail or skip if volume dies on the next bars.'
      : 'WATCH — box ke bahar close ka wait. Volume already aa chuka.',
    evidence: [
      { label: `RVOL ${rvol.toFixed(1)}×`, ok: rvol >= 1.15 },
      { label: volLead ? 'Vol lead, price inside' : `Burst ${Math.abs(movePct).toFixed(2)}%`, ok: true },
      { label: active ? 'Price expanding' : 'WATCH — price abhi box mein', ok: active },
    ],
    meta: { early: !active },
  });
}

/**
 * WOLF HUNTERS — 1h liquidity hunt that stays shallow.
 *
 * A candle opens inside the previous candle, reaches out with a wick to take its
 * high or low, then closes back inside but no further than the 50% mark, so the
 * range's other side is still open as room to run. Because the open has to sit
 * inside the mother, only a genuine wick sweep counts — a candle that opens past
 * the level is already trading there and closing back in is a return, not a hunt.
 * That also rules out any gap open beyond the range.
 *
 * The hunted candle (the mother) can be any candle at all, including the previous
 * session's last one, but it must not itself be an inside bar — one that opened and
 * closed inside the candle before it never built liquidity of its own. Only the body
 * has to be swallowed for that; a mother whose wicks poked out still counts as inside.
 */
export function scanWolfHunters(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  if (ctx.timeframe !== '1h') return null;
  const bars = f.candles;
  if (!bars || bars.length < 3) return null;

  const hunt = bars[bars.length - 1];
  const mother = bars[bars.length - 2];
  const before = bars[bars.length - 3];
  if (!hunt || !mother || !before) return null;

  // The mother cannot be an inside bar of the candle before it. An inside bar is
  // one whose open and close both sit inside that candle's range — the wicks may
  // poke out, the body is what has to be swallowed.
  const insideBefore = (price: number) => price >= before.low && price <= before.high;
  if (insideBefore(mother.open) && insideBefore(mother.close)) return null;

  const range = mother.high - mother.low;
  if (!(range > 0)) return null;
  const mid = (mother.high + mother.low) / 2;

  // A hunt reaches out with a wick, so the candle has to open inside the mother's
  // range. One that opens beyond the level is already trading out there — closing
  // back in is a return, not a sweep.
  if (hunt.open < mother.low || hunt.open > mother.high) return null;

  const tookLow = hunt.low < mother.low;
  const tookHigh = hunt.high > mother.high;
  // Neither side taken, or both taken — an outside bar picks no direction.
  if (tookLow === tookHigh) return null;

  const bullish = tookLow;
  const backInside = bullish
    ? hunt.close >= mother.low && hunt.close <= mid
    : hunt.close <= mother.high && hunt.close >= mid;
  if (!backInside) return null;

  const level = bullish ? mother.low : mother.high;
  const target = bullish ? mother.high : mother.low;
  const sweepDepthPct = (Math.abs(level - (bullish ? hunt.low : hunt.high)) / range) * 100;
  // How much of the half is still unused — the closer the close sits to the swept
  // extreme, the more of the mother range is left to travel.
  const roomPct = (Math.abs(target - hunt.close) / range) * 100;
  const vol = Math.max(f.volume.ratio, f.sessionVolRatio ?? 0);

  const breakdown: ScoreBreakdown = {
    hunt: 30,
    shallowClose: clampScore(8 + Math.min(14, (roomPct - 50) * 0.6), 22),
    sweepDepth: clampScore(6 + Math.min(12, sweepDepthPct * 1.2), 18),
    motherSize: clampScore(6 + Math.min(10, (range / Math.max(1e-6, f.tech.last)) * 100 * 8), 16),
    volume: clampScore(4 + Math.min(10, Math.max(0, vol - 0.9) * 12), 14),
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 55)) return null;

  const r = (n: number) => n.toFixed(2);
  return baseHit('wolf_hunters', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: 'ACTIVE',
    score,
    breakdown,
    stateLabel: bullish ? 'SELL-SIDE HUNT' : 'BUY-SIDE HUNT',
    why: bullish
      ? `1h candle ne pichhli candle ka low ₹${r(level)} hunt kiya aur ₹${r(hunt.close)} par band hui — mother ke 50% (₹${r(mid)}) ke neeche, to ₹${r(target)} tak jagah bachi hai.`
      : `1h candle ne pichhli candle ka high ₹${r(level)} hunt kiya aur ₹${r(hunt.close)} par band hui — mother ke 50% (₹${r(mid)}) ke upar, to ₹${r(target)} tak jagah bachi hai.`,
    keyLevel: level,
    trigger: hunt.close,
    invalidation: bullish
      ? `1h close ₹${r(level)} ke neeche gaya to hunt fail.`
      : `1h close ₹${r(level)} ke upar gaya to hunt fail.`,
    confirmationNeeded: `Agli 1h candle ko ₹${r(level)} bachana hai.`,
    evidence: [
      { label: bullish ? 'Low swept by wick + closed back in' : 'High swept by wick + closed back in', ok: true },
      { label: `Opened inside mother ₹${r(mother.low)}–₹${r(mother.high)}`, ok: true },
      { label: `Close ${bullish ? 'below' : 'above'} 50% ₹${r(mid)}`, ok: true },
      { label: 'Mother not an inside bar', ok: true },
      { label: `Sweep ${sweepDepthPct.toFixed(0)}% of range`, ok: sweepDepthPct >= 5 },
      { label: `Vol ${vol.toFixed(1)}×`, ok: vol >= 1 },
    ],
    meta: {
      pattern: bullish ? 'hunt_low_shallow' : 'hunt_high_shallow',
      motherHigh: mother.high,
      motherLow: mother.low,
      mid,
    },
  });
}

/** LIQUIDITY HUNT — reclaim only. Sweep without close-back does not list. */
export function scanLiquidityHunt(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const event = sweepEvent(f);
  if (!event || !event.reclaimed) return null;

  const breakdown: ScoreBreakdown = {
    liquidity: 28,
    confirmation: 22,
    structure: clampScore(f.structure.strength / 5, 20),
    volume: f.volume.ratio >= 1.3 ? 15 : 12,
    distance: 10,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 58)) return null;

  return baseHit('liquidity_hunt', ctx, {
    direction: event.buySide ? 'bullish' : 'bearish',
    status: 'CONFIRM',
    score,
    breakdown,
    stateLabel: event.buySide ? 'BUY-SIDE SWEEP + RECLAIM' : 'SELL-SIDE SWEEP + RECLAIM',
    why: `Swept ₹${event.level.toFixed(2)} then closed back — stop-hunt with reclaim.`,
    keyLevel: event.level,
    trigger: event.level,
    invalidation: `Acceptance beyond ₹${event.level.toFixed(2)} without reclaim`,
    confirmationNeeded: 'Hold reclaim; watch for continuation.',
    evidence: [
      { label: 'Sweep + reclaim', ok: true },
      { label: `Vol ×${f.volume.ratio.toFixed(1)}`, ok: f.volume.ratio >= 1.1 },
      { label: 'Wick ≥ 0.2 ATR', ok: true },
    ],
  });
}

/** COMPRESSION BREAK — WATCH while coiled + vol presses the box; ACTIVE on close out. First 9:20 bar counts. */
export function scanCompressionBreak(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const bar = lastBar(f);
  const atr = atrAbs(f);
  if (!bar || atr == null) return null;
  if (!priorCoil(f)) return null;
  const early = openDriveWindow(f);
  if (!volumeLive(f, early ? 0.9 : 1.2)) return null;

  const high = boxHigh(f);
  const low = boxLow(f);
  const up = high != null && brokeLevel(bar, high, 'up', early);
  const down = low != null && brokeLevel(bar, low, 'down', early);
  const watchVol = early || volumeRising(f);
  const watchUp =
    !up &&
    high != null &&
    bar.close <= high &&
    watchVol &&
    (early ? earlyNear(f.tech.last, high, atr) || tagsLevel(bar, high, 'up') : nearLevel(f.tech.last, high, atr, 0.35));
  const watchDown =
    !down &&
    low != null &&
    bar.close >= low &&
    watchVol &&
    (early ? earlyNear(f.tech.last, low, atr) || tagsLevel(bar, low, 'down') : nearLevel(f.tech.last, low, atr, 0.35));
  if (!up && !down && !watchUp && !watchDown) return null;
  const bullish = up || watchUp;
  const level = bullish ? high! : low!;
  if ((up || down) && !notChased(f.tech.last, level, atr, 1.8)) return null;

  const active = up || down;
  const breakdown: ScoreBreakdown = {
    compression: 28,
    volumeContraction: f.volume.ratio <= 0.9 ? 8 : 12,
    breakout: active ? 25 : 12,
    confirmation: active ? 18 : 10,
    proximity: 10,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, active ? 58 : 55)) return null;

  return baseHit('compression_break', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: active ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: active ? 'COMPRESSION BREAK' : 'WATCH COIL',
    why: active
      ? 'Left a coiled box on a volume close — expansion after squeeze.'
      : 'Coil tight, volume box ke edge pe — break se pehle.',
    keyLevel: level,
    trigger: level,
    invalidation: `Return inside prior range through ₹${level.toFixed(2)}`,
    confirmationNeeded: active
      ? 'Hold outside range on pullback.'
      : 'WATCH — box ke bahar close ka wait.',
    evidence: [
      { label: 'Prior ATR/range coiled', ok: true },
      { label: `RVOL ${Math.max(f.volume.ratio, f.sessionVolRatio ?? 0).toFixed(1)}×`, ok: true },
      { label: active ? 'Close outside box' : 'WATCH — still inside box', ok: active },
    ],
    meta: { early: !active },
  });
}

/** BREAKOUT RADAR — WATCH at the box, ACTIVE on close. First 9:20 bar counts. */
export function scanBreakoutRadar(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const bar = lastBar(f);
  const atr = atrAbs(f);
  if (!bar || atr == null) return null;
  const early = openDriveWindow(f);
  if (!volumeLive(f, early ? 0.9 : 1.2)) return null;

  const high = boxHigh(f);
  const low = boxLow(f);
  const up = high != null && brokeLevel(bar, high, 'up', early);
  const down = low != null && brokeLevel(bar, low, 'down', early);
  const watchUp =
    !up &&
    high != null &&
    bar.close <= high &&
    (early ? earlyNear(f.tech.last, high, atr) || tagsLevel(bar, high, 'up') : nearLevel(f.tech.last, high, atr, 0.3));
  const watchDown =
    !down &&
    low != null &&
    bar.close >= low &&
    (early ? earlyNear(f.tech.last, low, atr) || tagsLevel(bar, low, 'down') : nearLevel(f.tech.last, low, atr, 0.3));
  if (!up && !down && !watchUp && !watchDown) return null;
  const bullish = up || watchUp;
  const level = bullish ? high! : low!;
  if ((up || down) && !notChased(f.tech.last, level, atr, 1.8)) return null;

  const active = up || down;
  const breakdown: ScoreBreakdown = {
    breakout: active ? 30 : 14,
    volume: 25,
    followThrough: Math.abs(f.changePercent) >= 0.6 ? 18 : 10,
    structure: clampScore(f.structure.strength / 5, 15),
    retest: active ? 8 : 6,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, active ? 58 : 55)) return null;

  return baseHit('breakout_radar', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: active ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: active ? 'BREAKOUT + VOLUME' : 'WATCH LEVEL',
    why: active
      ? `Closed beyond ${bullish ? 'high' : 'low'} ₹${level.toFixed(2)} with RVOL ${Math.max(f.volume.ratio, f.sessionVolRatio ?? 0).toFixed(1)}×.`
      : `${bullish ? 'High' : 'Low'} ₹${level.toFixed(2)} ke andar, volume ${Math.max(f.volume.ratio, f.sessionVolRatio ?? 0).toFixed(1)}× — break se pehle.`,
    keyLevel: level,
    trigger: level,
    invalidation: `Close back inside prior range through ₹${level.toFixed(2)}`,
    confirmationNeeded: active
      ? 'Retest hold preferred.'
      : 'WATCH — level ke bahar close ka wait.',
    evidence: [
      { label: active ? (bullish ? 'Range high broken' : 'Range low broken') : 'Pressing range level', ok: active },
      { label: `RVOL ${Math.max(f.volume.ratio, f.sessionVolRatio ?? 0).toFixed(1)}×`, ok: true },
      { label: priorCoil(f) ? 'Prior coil present' : 'Wide prior range', ok: true },
    ],
    meta: { early: !active },
  });
}

/** TREND RIDER — WATCH on first EMA/VWAP touch, ACTIVE on hold close. */
export function scanTrendRider(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const align = emaAlignment(f.tech);
  if (align === 'mixed') return null;
  const rsi = f.tech.rsi14;
  if (rsi == null) return null;
  const momOk = align === 'bullish' ? rsi >= 52 : rsi <= 48;
  if (!momOk) return null;
  if (f.volume.ratio < 0.85) return null;
  const ema21 = f.tech.ema21;
  const atr = atrAbs(f);
  if (ema21 == null || atr == null) return null;
  const held = emaPullbackHold(f, align);
  const firstTouch = nearLevel(f.tech.last, ema21, atr, 0.4) || (f.vwap != null && nearLevel(f.tech.last, f.vwap, atr, 0.4));
  if (!held && !firstTouch) return null;
  if (align === 'bullish' && f.tech.last > ema21 + 1.6 * atr) return null;
  if (align === 'bearish' && f.tech.last < ema21 - 1.6 * atr) return null;

  const active = held;
  const breakdown: ScoreBreakdown = {
    trend: 28,
    emaAlignment: 22,
    momentum: 18,
    pullback: active ? 16 : 10,
    volume: f.volume.ratio >= 1 ? 10 : 8,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, active ? 58 : 55)) return null;

  return baseHit('trend_rider', ctx, {
    direction: align,
    status: active ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: active
      ? align === 'bullish'
        ? 'TREND PULLBACK'
        : 'TREND PULLBACK SHORT'
      : 'WATCH PULLBACK',
    why: active
      ? `EMA stack ${align}; RSI ${rsi.toFixed(0)}; pullback holding EMA21.`
      : `EMA stack ${align}; pehli EMA21/VWAP touch — hold close ka wait.`,
    keyLevel: ema21,
    trigger: ema21,
    invalidation: 'EMA21/50 cross against the trend.',
    confirmationNeeded: active
      ? 'Enter on pullback hold, not chase.'
      : 'WATCH — pullback hold close ka wait.',
    evidence: [
      { label: `Trend ${align}`, ok: true },
      { label: `RSI ${rsi.toFixed(0)}`, ok: true },
      { label: active ? 'Pullback hold' : 'First touch', ok: active },
    ],
    meta: {
      trend: align.toUpperCase(),
      htf: align.toUpperCase(),
      momentum: 'STRONG',
      pullback: active ? 'HEALTHY' : 'FORMING',
      early: !active,
    },
  });
}

const PRIME_KEYS: OpportunityScannerId[] = [
  'morning_sprint',
  'top_movers',
  'opening_drive',
  'momentum_surge',
  'liquidity_hunt',
  'compression_break',
  'breakout_radar',
  'trend_rider',
];
const PRIME_VOLUME_KEYS: OpportunityScannerId[] = [
  'morning_sprint',
  'top_movers',
  'opening_drive',
  'momentum_surge',
  'breakout_radar',
  'compression_break',
];

export type SiblingMark = {
  score: number;
  status?: OpportunityStatus;
  direction?: OpportunityDirection;
};

export type SiblingInput = Partial<Record<OpportunityScannerId, number | SiblingMark>>;

function markOf(raw: number | SiblingMark | undefined): SiblingMark | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return { score: raw, status: 'ACTIVE' };
  return raw;
}

function markScore(raw: number | SiblingMark | undefined): number {
  return markOf(raw)?.score ?? 0;
}

/** WOLF PRIME — early + confirmed on the same side, or 3 keepers. Not two late confirms. */
export function scanWolfPrime(ctx: Ctx, siblingScores: SiblingInput): OpportunityHit | null {
  const marks = PRIME_KEYS.map((k) => {
    const m = markOf(siblingScores[k]);
    return m ? ([k, m] as const) : null;
  }).filter((x): x is readonly [OpportunityScannerId, SiblingMark] => Boolean(x));
  if (marks.length < 2) return null;
  if (!PRIME_VOLUME_KEYS.some((k) => markOf(siblingScores[k]))) return null;

  const watching = marks.filter(([, m]) => m.status === 'WATCH');
  const confirmed = marks.filter(([, m]) => m.status === 'ACTIVE' || m.status === 'CONFIRM');
  const threeStrong = marks.length >= 3;
  const earlyPlusLive = watching.length >= 1 && confirmed.length >= 1;
  if (!threeStrong && !earlyPlusLive) return null;

  const dirs = marks.map(([, m]) => m.direction).filter((d): d is OpportunityDirection => d === 'bullish' || d === 'bearish');
  if (dirs.length >= 2 && dirs.some((d) => d !== dirs[0])) return null;
  const direction: OpportunityDirection =
    dirs[0] || (ctx.f.sessionChangePct != null
      ? ctx.f.sessionChangePct >= 0
        ? 'bullish'
        : 'bearish'
      : ctx.f.changePercent >= 0
        ? 'bullish'
        : 'bearish');

  const scores = marks.map(([, m]) => m.score);
  const avg = scores.reduce((a, n) => a + n, 0) / scores.length;
  const score = clampScore(Math.round(avg) + (marks.length >= 3 ? 4 : 0));
  if (!scoreGate(ctx, score, 72)) return null;

  const breakdown: ScoreBreakdown = {
    structure: clampScore((markScore(siblingScores.liquidity_hunt || siblingScores.compression_break) / 100) * 20, 20),
    momentum: clampScore((markScore(siblingScores.momentum_surge || siblingScores.trend_rider) / 100) * 20, 20),
    volume: clampScore((Math.max(markScore(siblingScores.momentum_surge), markScore(siblingScores.breakout_radar)) / 100) * 20, 20),
    liquidity: clampScore((markScore(siblingScores.liquidity_hunt) / 100) * 15, 15),
    trend: clampScore((markScore(siblingScores.trend_rider) / 100) * 15, 15),
    flow: clampScore((markScore(siblingScores.breakout_radar) / 100) * 10, 10),
  };

  return baseHit('wolf_prime', ctx, {
    direction,
    status: confirmed.length ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: score >= 90 ? '🔥 HIGH CONVICTION' : 'WOLF PRIME',
    why: `Composite of ${marks.length} keepers (${watching.length} early + ${confirmed.length} confirmed) — quality ${score}/100.`,
    keyLevel: ctx.f.tech.ema21 ?? ctx.f.high20,
    trigger: ctx.f.high20,
    invalidation: 'Majority of contributing scanners cool or invalidate.',
    confirmationNeeded: 'Still requires trade plan — score ≠ entry.',
    evidence: marks.map(([k, m]) => ({
      label: `${k.replace(/_/g, ' ')} ${m.score}${m.status === 'WATCH' ? ' WATCH' : ''}`,
      ok: m.score >= 70,
    })),
  });
}

export const OHLC_SCANNERS: OpportunityScannerId[] = [
  'momentum_surge',
  'liquidity_hunt',
  'compression_break',
  'breakout_radar',
  'trend_rider',
];

/* ---- Parked until live OI / option chain / a dedicated watch rail ---- */

/** @internal parked — Flow Shift proxy. Not on the Opportunity desk. */
export function scanFlowShift(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const rvol = f.volume.ratio;
  const chg = f.changePercent;
  if (rvol < 1.25 || Math.abs(chg) < 0.35) return null;

  const priceUp = chg >= 0;
  const volUp = rvol >= 1.35;
  let stateLabel = 'NEUTRAL FLOW';
  let direction: 'bullish' | 'bearish' = priceUp ? 'bullish' : 'bearish';
  if (priceUp && volUp) stateLabel = 'LONG BUILDUP PROXY';
  else if (!priceUp && volUp) stateLabel = 'SHORT BUILDUP PROXY';
  else if (priceUp && !volUp) {
    stateLabel = 'SHORT COVER PROXY';
    direction = 'bullish';
  } else {
    stateLabel = 'LONG UNWIND PROXY';
    direction = 'bearish';
  }

  const breakdown: ScoreBreakdown = {
    oiProxy: volUp ? 28 : 14,
    price: clampScore(Math.min(22, Math.abs(chg) * 10), 22),
    volume: clampScore(Math.min(22, (rvol - 1) * 14), 22),
    alignment: volUp && Math.abs(chg) >= 0.6 ? 16 : 8,
    confirmation: f.volume.state === 'UNUSUAL' || f.volume.state === 'EXPANDING' ? 12 : 6,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 55)) return null;

  return baseHit('flow_shift', ctx, {
    direction,
    status: score >= 78 ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel,
    why: `${stateLabel}: price ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% with RVOL ${rvol.toFixed(1)}× (OI feed offline — participation proxy).`,
    keyLevel: f.tech.ema21,
    trigger: direction === 'bullish' ? f.high10 : f.low10,
    invalidation: 'Volume dries up or price reverses through EMA21.',
    confirmationNeeded: 'Prefer real futures OI confirmation when feed is live.',
    evidence: [
      { label: stateLabel, ok: true },
      { label: `RVOL ${rvol.toFixed(1)}×`, ok: rvol >= 1.35 },
      { label: 'Futures OI feed offline', ok: false, detail: 'Using price×volume proxy' },
    ],
  });
}

/** @internal parked — Momentum Fade watch. Not on the Opportunity desk. */
export function scanMomentumFade(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const rsi = f.tech.rsi14;
  const prev = f.rsiPrev;
  if (rsi == null || prev == null) return null;

  const priceHigher = f.changePercent > 0.3 && (f.high10 == null || f.tech.last >= f.high10 * 0.998);
  const priceLower = f.changePercent < -0.3 && (f.low10 == null || f.tech.last <= f.low10 * 1.002);
  const momDown = rsi < prev - 3;
  const momUp = rsi > prev + 3;

  const fadeBull = priceHigher && momDown;
  const fadeBear = priceLower && momUp;
  if (!fadeBull && !fadeBear) return null;

  const breakdown: ScoreBreakdown = {
    priceExtension: clampScore(Math.min(25, Math.abs(f.changePercent) * 10), 25),
    momentumDivergence: 28,
    volumeSoft: f.volume.ratio < 1.1 ? 18 : 8,
    structure: 12,
    watch: 10,
  };
  const score = sumBreakdown(breakdown);

  return baseHit('momentum_fade', ctx, {
    direction: fadeBull ? 'bearish' : 'bullish',
    status: 'WATCH',
    score,
    breakdown,
    stateLabel: '⚠️ MOMENTUM FADING',
    why: fadeBull
      ? 'Price still elevated while RSI momentum cooled — watch, not a reversal call.'
      : 'Price still soft while RSI momentum lifted — watch, not a reversal call.',
    keyLevel: fadeBull ? f.high10 : f.low10,
    trigger: f.tech.sma20,
    invalidation: fadeBull
      ? 'Fresh momentum thrust with volume expansion cancels fade watch.'
      : 'Fresh downside thrust with volume expansion cancels fade watch.',
    confirmationNeeded: 'Structure break + volume confirmation before treating as reversal.',
    evidence: [
      { label: fadeBull ? 'Higher price' : 'Lower price', ok: true },
      { label: `RSI ${rsi.toFixed(0)} vs ${prev.toFixed(0)}`, ok: true },
      { label: `Vol ×${f.volume.ratio.toFixed(1)}`, ok: f.volume.ratio < 1.2 },
    ],
  });
}

/** @internal parked — Reversal Hunter. Not on the Opportunity desk. */
export function scanReversalHunter(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const extended = Math.abs(f.changePercent) >= 1.5 || (f.tech.rsi14 != null && (f.tech.rsi14 >= 70 || f.tech.rsi14 <= 30));
  const sweep = f.liquidity.type === 'LIQUIDITY_SWEEP' || f.liquidity.type === 'RECLAIM';
  if (!extended && !sweep) return null;

  const bullishRev = f.changePercent < 0 || (f.tech.rsi14 != null && f.tech.rsi14 <= 35);
  const confirmed = f.liquidity.confirmed || (f.volume.ratio >= 1.5 && Math.abs(f.roc5 ?? 0) < Math.abs(f.changePercent));

  let stateLabel = 'REVERSAL WATCH';
  if (confirmed && sweep) stateLabel = 'REVERSAL CONFIRMED';
  else if (!extended) stateLabel = 'NO CONFIRMATION';

  if (stateLabel === 'NO CONFIRMATION' && !sweep) return null;

  const breakdown: ScoreBreakdown = {
    extension: extended ? 22 : 8,
    liquidity: sweep ? 24 : 8,
    rejection: confirmed ? 20 : 10,
    volume: f.volume.ratio >= 1.4 ? 16 : 8,
    structure: 10,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 52)) return null;

  return baseHit('reversal_hunter', ctx, {
    direction: bullishRev ? 'bullish' : 'bearish',
    status: stateLabel === 'REVERSAL CONFIRMED' ? 'CONFIRM' : 'WATCH',
    score,
    breakdown,
    stateLabel,
    why: extended
      ? 'Extended move with liquidity/rejection cues — confirmation still required.'
      : 'Liquidity event near extreme — waiting for structure proof.',
    keyLevel: bullishRev ? f.dayLow : f.dayHigh,
    trigger: f.tech.sma20,
    invalidation: 'Continuation thrust through extreme with rising volume.',
    confirmationNeeded:
      stateLabel === 'REVERSAL CONFIRMED'
        ? 'Protect against failed reclaim.'
        : 'Need reclaim + structure shift before calling reversal.',
    evidence: [
      { label: extended ? 'Extended move' : 'Not extended', ok: extended },
      { label: sweep ? 'Liquidity event' : 'No sweep', ok: sweep },
      { label: confirmed ? 'Objective confirm' : 'Unconfirmed', ok: confirmed },
    ],
  });
}

/** @internal parked — Sector Leaders. Not on the Opportunity desk. */
export function scanSectorLeaders(
  ctx: Ctx,
  sectorName: string,
  peers: { symbol: string; changePercent: number }[],
  strength: number,
): OpportunityHit | null {
  if (!peers.length) return null;
  const leaders = [...peers].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3);
  const breakdown: ScoreBreakdown = {
    relative: clampScore(Math.abs(strength) * 8, 30),
    breadth: clampScore(peers.filter((p) => p.changePercent * strength > 0).length * 4, 25),
    leaders: 20,
    volume: ctx.f.volume.ratio >= 1.2 ? 15 : 8,
    consistency: 10,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 50)) return null;

  return baseHit('sector_leaders', ctx, {
    direction: strength >= 0 ? 'bullish' : 'bearish',
    status: 'ACTIVE',
    score,
    breakdown,
    stateLabel: `${sectorName} ${strength >= 0 ? '+' : ''}${strength.toFixed(2)}%`,
    why: `${sectorName} showing relative ${strength >= 0 ? 'strength' : 'weakness'}; leaders: ${leaders.map((l) => l.symbol).join(', ')}.`,
    keyLevel: null,
    trigger: null,
    invalidation: 'Sector breadth flips against the lead.',
    confirmationNeeded: 'Confirm with index alignment and leader follow-through.',
    evidence: leaders.map((l) => ({
      label: `${l.symbol} ${l.changePercent >= 0 ? '+' : ''}${l.changePercent.toFixed(2)}%`,
      ok: true,
    })),
    meta: {
      sector: sectorName,
      strength,
      leaders: leaders.map((l) => l.symbol),
    },
  });
}

/** OPTIONS FLOW — live INDstocks chain OI + day price. No chain → no hit. */
export function scanOptionsFlow(ctx: Ctx, flow?: OptionFlowSnap | null): OpportunityHit | null {
  if (!flow) return null;
  const { f } = ctx;
  const dayPct = optionFlowDayPct(f.tech.last, f.prevClose, f.sessionChangePct);
  if (dayPct == null) return null;
  const signal = optionFlowSignal(flow, dayPct);
  if (!signal) return null;

  const totalOi = flow.ceOi + flow.peOi;
  const pcr = flow.pcr;
  const chgPct = totalOi > 0 ? ((Math.abs(flow.ceOiChg) + Math.abs(flow.peOiChg)) / totalOi) * 100 : 0;
  const pcrOk =
    signal.direction === 'bullish' ? pcr != null && pcr <= 0.85 : pcr != null && pcr >= 1.2;
  const breakdown: ScoreBreakdown = {
    buildup: signal.kind.endsWith('buildup') || signal.kind.endsWith('heavy') ? 28 : 16,
    price: clampScore(10 + Math.min(12, Math.abs(dayPct) * 8), 22),
    atm: Math.abs(flow.atmBandCeOiChg) + Math.abs(flow.atmBandPeOiChg) > 0 ? 20 : 8,
    pcr: pcrOk ? 16 : 10,
    volume: flow.ceVol + flow.peVol > 0 ? 14 : 8,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, signal.active ? 58 : 55)) return null;

  const ceChg = flow.ceOiChg >= 0 ? `+${Math.round(flow.ceOiChg)}` : `${Math.round(flow.ceOiChg)}`;
  const peChg = flow.peOiChg >= 0 ? `+${Math.round(flow.peOiChg)}` : `${Math.round(flow.peOiChg)}`;
  return baseHit('options_flow', ctx, {
    direction: signal.direction,
    status: signal.active ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: signal.label,
    why:
      signal.kind === 'call_heavy' || signal.kind === 'put_heavy'
        ? `Last chain ${flow.expiry}: PCR ${pcr != null ? pcr.toFixed(2) : 'n/a'}, day ${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}% — ΔOI flat after close, ${signal.kind.replace(/_/g, ' ')}.`
        : `Live chain ${flow.expiry}: CE OI ${ceChg}, PE OI ${peChg}, day ${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}%${pcr != null ? `, PCR ${pcr.toFixed(2)}` : ''} — ${signal.kind.replace(/_/g, ' ')}.`,
    keyLevel: flow.atmStrike,
    trigger: flow.atmStrike,
    invalidation:
      signal.direction === 'bullish'
        ? 'OI add flips to puts / price closes red against the buildup'
        : 'OI add flips to calls / price closes green against the buildup',
    confirmationNeeded: signal.active
      ? 'Fresh OI + price aligned. Next chain print reverse = exit.'
      : 'WATCH — OI building, wait for a clearer day move.',
    evidence: [
      { label: signal.label, ok: true },
      { label: `CE ΔOI ${ceChg}`, ok: flow.ceOiChg !== 0 },
      { label: `PE ΔOI ${peChg}`, ok: flow.peOiChg !== 0 },
      {
        label: pcr != null ? `PCR ${pcr.toFixed(2)}` : 'PCR n/a',
        ok: pcrOk,
      },
      { label: `OI shift ${chgPct.toFixed(1)}%`, ok: chgPct >= 3 },
    ],
    meta: {
      expiry: flow.expiry,
      kind: signal.kind,
      ...(pcr != null ? { pcr } : {}),
    },
  });
}
