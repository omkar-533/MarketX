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
  ScoreBreakdown,
} from './opportunityTypes';
import { clampScore, emaAlignment, type FeatureSnapshot } from './featureSnapshot';

type Ctx = {
  f: FeatureSnapshot;
  timeframe: OpportunityTimeframe;
  dataMode: 'LIVE' | 'DEMO';
  quotePrice?: number;
  /** Skip score cutoff so Created time is the first print, not when quality crossed the gate. */
  forTimeWalk?: boolean;
};

function scoreGate(ctx: Ctx, score: number, min: number): boolean {
  return Boolean(ctx.forTimeWalk) || score >= min;
}

function baseHit(
  scannerId: OpportunityScannerId,
  ctx: Ctx,
  partial: Omit<
    OpportunityHit,
    'id' | 'scannerId' | 'symbol' | 'exchange' | 'price' | 'changePercent' | 'timeframe' | 'detectedAt' | 'dataMode'
  >,
): OpportunityHit {
  const price = ctx.quotePrice && ctx.quotePrice > 0 ? ctx.quotePrice : ctx.f.tech.last;
  // Card % must be the DAY move (prev close → price), not the last-20-bars drift.
  const prevClose = ctx.f.prevClose;
  const dayChange =
    prevClose != null && prevClose > 0 && price > 0
      ? ((price - prevClose) / prevClose) * 100
      : ctx.f.changePercent;
  return {
    id: `opp-${scannerId}-${String(ctx.f.symbol || '').toUpperCase()}-${ctx.timeframe}`,
    scannerId,
    symbol: ctx.f.symbol,
    exchange: (ctx.f.exchange as 'NSE' | 'BSE') || 'NSE',
    price,
    changePercent: dayChange,
    timeframe: ctx.timeframe,
    detectedAt: ctx.f.setupAt || 0,
    dataMode: ctx.dataMode,
    ...partial,
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

function tooExtended(last: number, level: number, atr: number, maxAtr = 2): boolean {
  return Math.abs(last - level) > maxAtr * atr;
}

/**
 * MORNING SPRINT — first closed 5m (9:20) → 10:50.
 * WATCH: gap / early volume before 0.8% is done. ACTIVE: blast or drive on.
 */
export function scanMorningSprint(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const atr = atrAbs(f);
  if (atr == null) return null;
  const mins = f.sessionMinsFromOpen;
  if (mins == null || mins < 0 || mins > 100) return null;
  const chg = f.sessionChangePct;
  const sessOpen = f.sessionOpen;
  if (chg == null || sessOpen == null || !(sessOpen > 0)) return null;
  if (!volumeLive(f, 1.3)) return null;

  const last = f.tech.last;
  const gap = f.gapPct ?? 0;
  const vol = Math.max(f.volume.ratio, f.sessionVolRatio ?? 0);
  const gapWatchUp = gap >= 0.6 && last > sessOpen;
  const gapWatchDown = gap <= -0.6 && last < sessOpen;
  const earlyUp = chg >= 0.5 || (chg >= 0.35 && gap >= 0.4);
  const earlyDown = chg <= -0.5 || (chg <= -0.35 && gap <= -0.4);
  const gapBlastUp = gap >= 0.8 && last > sessOpen;
  const gapBlastDown = gap <= -0.8 && last < sessOpen;
  const driveUp = chg >= 0.8;
  const driveDown = chg <= -0.8;
  const activeUp = gapBlastUp || driveUp;
  const activeDown = gapBlastDown || driveDown;
  const watchUp =
    !activeUp && mins <= 20 && volumeRising(f) && (gapWatchUp || earlyUp);
  const watchDown =
    !activeDown && mins <= 20 && volumeRising(f) && (gapWatchDown || earlyDown);
  if (!activeUp && !activeDown && !watchUp && !watchDown) return null;
  const bullish = activeUp || watchUp;
  if (!vwapHeld(f, bullish)) return null;

  const trigger = bullish ? (f.sessionHigh ?? last) : (f.sessionLow ?? last);
  if (tooExtended(last, trigger, atr, 2)) return null;
  const active = activeUp || activeDown;
  if (active && !notChased(last, trigger, atr, 1.8)) return null;

  const brokeOR = bullish
    ? f.openingHigh != null && last > f.openingHigh
    : f.openingLow != null && last < f.openingLow;
  const brokePD = bullish
    ? f.prevDayHigh != null && last > f.prevDayHigh
    : f.prevDayLow != null && last < f.prevDayLow;
  const isGapBlast = bullish ? gapBlastUp : gapBlastDown;
  const breakdown: ScoreBreakdown = {
    move: clampScore((active ? 16 : 10) + Math.min(11, Math.abs(chg) * 5), 25),
    volume: clampScore(12 + Math.min(13, (vol - 1.3) * 16), 25),
    vwap: f.vwap != null ? 16 : 10,
    levels: brokePD ? 18 : brokeOR ? 15 : active ? 10 : 8,
    timing: mins <= 20 ? 20 : mins <= 50 ? 16 : 12,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, active ? 58 : 55)) return null;

  return baseHit('morning_sprint', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: active ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: active
      ? isGapBlast
        ? '🔥 GAP BLAST'
        : 'MORNING SPRINT'
      : isGapBlast || Math.abs(gap) >= 0.6
        ? 'WATCH GAP'
        : 'WATCH SPRINT',
    why: active
      ? isGapBlast
        ? `Gap ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}% + open ke baad ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% in ${Math.round(mins)} min, volume ${vol.toFixed(1)}× — subah ka blast.`
        : `Open se ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% in ${Math.round(mins)} min, volume ${vol.toFixed(1)}× — morning drive on.`
      : `Subah setup: ${Math.abs(gap) >= 0.6 ? `gap ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}%` : `open se ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`} + volume ${vol.toFixed(1)}× — blast se pehle.`,
    keyLevel: f.vwap ?? f.tech.ema21,
    trigger,
    invalidation: bullish
      ? `VWAP ₹${(f.vwap ?? sessOpen).toFixed(2)} ke neeche close — sprint khatam`
      : `VWAP ₹${(f.vwap ?? sessOpen).toFixed(2)} ke upar close — sprint khatam`,
    confirmationNeeded: active
      ? bullish
        ? `Day high ₹${trigger.toFixed(2)} break pe entry; VWAP ke neeche exit.`
        : `Day low ₹${trigger.toFixed(2)} break pe entry; VWAP ke upar exit.`
      : 'WATCH — 0.8% drive ya gap hold ka wait. Abhi chase mat karo.',
    evidence: [
      { label: `Open se ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% (${Math.round(mins)} min)`, ok: true },
      { label: `Volume ${vol.toFixed(1)}×`, ok: vol >= 1.3 },
      {
        label: f.vwap != null ? `VWAP ${bullish ? 'upar' : 'neeche'} ₹${f.vwap.toFixed(2)}` : 'VWAP n/a',
        ok: f.vwap != null,
      },
      {
        label: active
          ? brokePD
            ? bullish
              ? 'PDH break'
              : 'PDL break'
            : brokeOR
              ? 'Opening range break'
              : 'Range ke andar'
          : 'WATCH — move shuru, break nahi',
        ok: active ? brokePD || brokeOR : true,
      },
    ],
    meta: { early: !active },
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

/** OPENING DRIVE — WATCH at the range edge, ACTIVE on close beyond. Morning only. */
export function scanOpeningDrive(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const bar = lastBar(f);
  const atr = atrAbs(f);
  if (!bar || atr == null) return null;
  if (f.openingHigh == null || f.openingLow == null || !(f.openingHigh > f.openingLow)) return null;
  const mins = f.sessionMinsFromOpen;
  if (mins == null || mins > 105) return null;
  if (!volumeLive(f, 1.2)) return null;

  const vol = Math.max(f.volume.ratio, f.sessionVolRatio ?? 0);
  const up = closeBrokeLevel(bar, f.openingHigh, 'up');
  const down = closeBrokeLevel(bar, f.openingLow, 'down');
  const watchUp = !up && bar.close <= f.openingHigh && nearLevel(f.tech.last, f.openingHigh, atr, 0.4) && volumeRising(f);
  const watchDown = !down && bar.close >= f.openingLow && nearLevel(f.tech.last, f.openingLow, atr, 0.4) && volumeRising(f);
  if (!up && !down && !watchUp && !watchDown) return null;
  const bullish = up || watchUp;
  const level = bullish ? f.openingHigh : f.openingLow;
  if ((up || down) && !notChased(f.tech.last, level, atr, 1.5)) return null;
  if ((watchUp || watchDown) && tooExtended(f.tech.last, level, atr, 1.2)) return null;

  const active = up || down;
  const gap = f.gapPct ?? 0;
  const gapAligned = bullish ? gap >= 0.3 : gap <= -0.3;
  const breakdown: ScoreBreakdown = {
    rangeBreak: active ? 25 : 12,
    earlyVolume: clampScore(10 + (vol - 1) * 18, 20),
    gap: gapAligned ? 15 : 8,
    timing: mins <= 45 ? 20 : mins <= 105 ? 14 : 10,
    followThrough: f.sessionChangePct != null && Math.abs(f.sessionChangePct) >= 0.5 ? 12 : 8,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, active ? 58 : 55)) return null;

  return baseHit('opening_drive', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: active ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: active ? (gapAligned ? '🔥 GAP + DRIVE' : 'OPENING DRIVE') : 'WATCH OR',
    why: active
      ? `Opening range ₹${f.openingLow.toFixed(2)}–₹${f.openingHigh.toFixed(2)} broken ${bullish ? 'up' : 'down'} in the first ${Math.round(mins)} min with volume ${vol.toFixed(1)}×.`
      : `Opening range ${bullish ? 'high' : 'low'} ₹${level.toFixed(2)} ke paas, volume ${vol.toFixed(1)}× — break se pehle.`,
    keyLevel: level,
    trigger: level,
    invalidation: `Close back inside the opening range (₹${level.toFixed(2)})`,
    confirmationNeeded: active
      ? 'Morning drive — if it re-enters the opening range, the drive failed.'
      : 'WATCH — range ke bahar close ka wait.',
    evidence: [
      { label: active ? 'Opening range break (close)' : 'At opening range', ok: true },
      { label: `Early vol ${vol.toFixed(1)}×`, ok: vol >= 1.2 },
      {
        label: gapAligned ? `Gap ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}% aligned` : 'No gap',
        ok: gapAligned,
      },
      { label: `First ${Math.round(mins)} min`, ok: mins <= 105 },
    ],
    meta: { early: !active },
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

/** COMPRESSION BREAK — WATCH while coiled + vol presses the box; ACTIVE on close out. */
export function scanCompressionBreak(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const bar = lastBar(f);
  const atr = atrAbs(f);
  if (!bar || atr == null) return null;
  if (!priorCoil(f)) return null;
  if (f.volume.ratio < 1.2) return null;

  const up = f.high20 != null && closeBrokeLevel(bar, f.high20, 'up');
  const down = f.low20 != null && closeBrokeLevel(bar, f.low20, 'down');
  const watchUp =
    !up &&
    f.high20 != null &&
    bar.close <= f.high20 &&
    nearLevel(f.tech.last, f.high20, atr, 0.35) &&
    volumeRising(f);
  const watchDown =
    !down &&
    f.low20 != null &&
    bar.close >= f.low20 &&
    nearLevel(f.tech.last, f.low20, atr, 0.35) &&
    volumeRising(f);
  if (!up && !down && !watchUp && !watchDown) return null;
  const bullish = up || watchUp;
  const level = bullish ? f.high20! : f.low20!;
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
      ? 'Left a coiled 20-bar box on a volume close — expansion after squeeze.'
      : 'Coil tight, volume box ke edge pe — break se pehle.',
    keyLevel: level,
    trigger: level,
    invalidation: `Return inside prior range through ₹${level.toFixed(2)}`,
    confirmationNeeded: active
      ? 'Hold outside range on pullback.'
      : 'WATCH — box ke bahar close ka wait.',
    evidence: [
      { label: 'Prior ATR/range coiled', ok: true },
      { label: `RVOL ${f.volume.ratio.toFixed(1)}×`, ok: true },
      { label: active ? 'Close outside 20-bar box' : 'WATCH — still inside box', ok: active },
    ],
    meta: { early: !active },
  });
}

/** BREAKOUT RADAR — no coil (that's Compression). WATCH at the level, ACTIVE on close. */
export function scanBreakoutRadar(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const bar = lastBar(f);
  const atr = atrAbs(f);
  if (!bar || atr == null) return null;
  if (priorCoil(f)) return null;
  if (f.volume.ratio < 1.2) return null;

  const up = f.high20 != null && closeBrokeLevel(bar, f.high20, 'up');
  const down = f.low20 != null && closeBrokeLevel(bar, f.low20, 'down');
  const watchUp = !up && f.high20 != null && bar.close <= f.high20 && nearLevel(f.tech.last, f.high20, atr, 0.3);
  const watchDown = !down && f.low20 != null && bar.close >= f.low20 && nearLevel(f.tech.last, f.low20, atr, 0.3);
  if (!up && !down && !watchUp && !watchDown) return null;
  const bullish = up || watchUp;
  const level = bullish ? f.high20! : f.low20!;
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
      ? `Closed beyond 20-bar ${bullish ? 'high' : 'low'} with RVOL ${f.volume.ratio.toFixed(1)}×.`
      : `20-bar ${bullish ? 'high' : 'low'} ₹${level.toFixed(2)} ke 0.3 ATR andar, volume ${f.volume.ratio.toFixed(1)}× — break se pehle.`,
    keyLevel: level,
    trigger: level,
    invalidation: `Close back inside prior range through ₹${level.toFixed(2)}`,
    confirmationNeeded: active
      ? 'Retest hold preferred.'
      : 'WATCH — level ke bahar close ka wait.',
    evidence: [
      { label: active ? (bullish ? '20-bar high broken' : '20-bar low broken') : 'Pressing 20-bar level', ok: active },
      { label: `RVOL ${f.volume.ratio.toFixed(1)}×`, ok: true },
      { label: 'No prior coil', ok: true },
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

/** @internal parked — Options Flow proxy. Not on the Opportunity desk. */
export function scanOptionsFlow(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const atrExp = f.atrCompression != null && f.atrCompression >= 1.12;
  const rangeWide = f.rangePct >= 1.4;
  const rvol = f.volume.ratio;
  const rsi = f.tech.rsi14 ?? 50;
  if (!atrExp && !rangeWide) return null;
  if (rvol < 1.2) return null;

  const bullish = f.changePercent >= 0 && rsi >= 48;
  const breakdown: ScoreBreakdown = {
    volExpansion: atrExp ? 26 : 12,
    range: rangeWide ? 20 : 10,
    volume: clampScore(Math.min(22, (rvol - 1) * 12), 22),
    momentum: clampScore(Math.min(18, Math.abs(f.changePercent) * 8), 18),
    confirmation: Math.abs(rsi - 50) >= 8 ? 12 : 6,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 55)) return null;

  return baseHit('options_flow', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: score >= 78 ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: atrExp ? 'IV/RANGE EXPANSION PROXY' : 'WIDE RANGE PROXY',
    why: `ATR/range expansion with RVOL ${rvol.toFixed(1)}× (option-chain feed offline — volatility proxy, not strike OI).`,
    keyLevel: f.tech.last,
    trigger: bullish ? f.high10 : f.low10,
    invalidation: 'Volatility compresses back and volume fades.',
    confirmationNeeded: 'Confirm with live option chain / PCR when feed returns.',
    evidence: [
      { label: atrExp ? 'ATR expanding' : 'ATR steady', ok: atrExp },
      { label: `Range ${f.rangePct.toFixed(1)}%`, ok: rangeWide },
      { label: 'Option chain feed offline', ok: false, detail: 'Using vol expansion proxy' },
    ],
  });
}
