/**
 * Wolf Opportunity scanners.
 * Desk lists six keepers. Proxy/watch scanners stay in this file but are not run.
 * Missing data → null. Never invents hits.
 */
import type { Candle } from '../radar/radarTypes';
import type {
  EvidenceItem,
  OpportunityHit,
  OpportunityScannerId,
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
  return {
    id: `opp-${scannerId}-${String(ctx.f.symbol || '').toUpperCase()}-${ctx.timeframe}`,
    scannerId,
    symbol: ctx.f.symbol,
    exchange: (ctx.f.exchange as 'NSE' | 'BSE') || 'NSE',
    price,
    changePercent: ctx.f.changePercent,
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

function sweepReclaim(f: FeatureSnapshot): { buySide: boolean; level: number } | null {
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
    const reclaimed = buySide ? last.close > level : last.close < level;
    return swept && reclaimed;
  };

  const liq = f.liquidity;
  if (liq.type === 'LIQUIDITY_SWEEP' && liq.level > 0) {
    const buySide = liq.direction === 'bullish';
    if (tryLevel(liq.level, buySide)) return { buySide, level: liq.level };
  }

  const low = f.swingLow ?? f.low10;
  if (low != null && tryLevel(low, true)) return { buySide: true, level: low };
  const high = f.swingHigh ?? f.high10;
  if (high != null && tryLevel(high, false)) return { buySide: false, level: high };
  return null;
}

/** PRICE RUNNERS — aaj session mein jo actually move kiya, volume ke saath. Chase allowed. */
export function scanMomentumSurge(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const bar = lastBar(f);
  const atr = atrAbs(f);
  if (!bar || atr == null) return null;

  const rvol = f.volume.ratio;
  const sessVol = f.sessionVolRatio ?? 0;
  const vol = Math.max(rvol, sessVol);
  if (vol < 1.15) return null;

  const range = Math.max(bar.high - bar.low, 1e-9);
  const body = Math.abs(bar.close - (Number.isFinite(bar.open) ? bar.open : bar.close));
  const barAtr = range / atr;
  const exploded = barAtr >= 0.7;
  const burst5 = f.roc5 != null && Math.abs(f.roc5) >= 0.5;
  const burst20 = Math.abs(f.changePercent) >= Math.max(0.7, 0.9 * (f.atrPct || 0));
  const sessChg = f.sessionChangePct;
  const atrFloor = f.atrPct || 0;
  const sessionMoved =
    sessChg != null &&
    (Math.abs(sessChg) >= Math.max(0.75, 0.9 * atrFloor) ||
      (f.sessionRangePct != null && f.sessionRangePct >= Math.max(1.2, 1.5 * atrFloor)));
  if (!exploded && !burst5 && !burst20 && !sessionMoved) return null;
  if (body / range < 0.35 && exploded && !burst5 && !sessionMoved) return null;

  const signed = exploded
    ? bar.close - (Number.isFinite(bar.open) ? bar.open : bar.close)
    : burst5 && f.roc5 != null
      ? f.roc5
      : sessionMoved && sessChg != null
        ? sessChg
        : f.changePercent;
  const bullish = signed >= 0;
  const movePct =
    burst5 && f.roc5 != null
      ? f.roc5
      : sessionMoved && sessChg != null
        ? sessChg
        : f.changePercent;

  const breakdown: ScoreBreakdown = {
    momentum: clampScore(16 + Math.min(9, Math.abs(movePct) * 4), 25),
    volume: clampScore(13 + Math.min(12, (vol - 1.3) * 14), 25),
    expansion: exploded ? 20 : burst5 ? 16 : 14,
    range: exploded ? 18 : f.sessionRangePct != null && f.sessionRangePct >= 1.2 ? 16 : barAtr >= 0.5 ? 14 : 12,
    confirmation: vol >= 2.2 ? 12 : vol >= 1.6 ? 11 : 10,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 58)) return null;

  const sessTag = sessionMoved && sessChg != null && !exploded && !burst5;
  return baseHit('momentum_surge', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: 'ACTIVE',
    score,
    breakdown,
    stateLabel: exploded || vol >= 2 ? '🔥 RUNNING' : sessionMoved ? 'DAY RUNNER' : 'RUNNER',
    why: sessTag
      ? `Aaj ${sessChg! >= 0 ? '+' : ''}${sessChg!.toFixed(2)}% session move, volume ${vol.toFixed(1)}× — day runner, pullback wait nahi.`
      : `Volume ${vol.toFixed(1)}× with a ${Math.abs(movePct).toFixed(2)}% burst — runner, not a pullback wait.`,
    keyLevel: bullish ? f.high20 : f.low20,
    trigger: bullish ? f.sessionHigh ?? f.high10 : f.sessionLow ?? f.low10,
    invalidation: bullish
      ? `Close back below ₹${(f.tech.sma20 ?? f.tech.last * 0.99).toFixed(2)}`
      : `Close back above ₹${(f.tech.sma20 ?? f.tech.last * 1.01).toFixed(2)}`,
    confirmationNeeded: 'This is a running name — trail or skip if volume dies on the next bars.',
    evidence: [
      { label: `RVOL ${rvol.toFixed(1)}×`, ok: rvol >= 1.15 },
      { label: `Day vol ${sessVol.toFixed(1)}×`, ok: sessVol >= 1.15 },
      {
        label:
          sessChg != null
            ? `Aaj ${sessChg >= 0 ? '+' : ''}${sessChg.toFixed(2)}%`
            : burst5 && f.roc5 != null
              ? `5-bar ${f.roc5 >= 0 ? '+' : ''}${f.roc5.toFixed(2)}%`
              : `Move ${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}%`,
        ok: sessionMoved || burst5 || burst20 || exploded,
      },
      { label: 'Chase allowed', ok: true },
    ],
  });
}

/** 03 — LIQUIDITY HUNT — sweep + reclaim only */
export function scanLiquidityHunt(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const event = sweepReclaim(f);
  if (!event) return null;

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

/** 04 — COMPRESSION BREAK — coil on prior bars, then volume close outside */
export function scanCompressionBreak(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const bar = lastBar(f);
  const atr = atrAbs(f);
  if (!bar || atr == null) return null;
  if (!priorCoil(f)) return null;
  if (f.volume.ratio < 1.2) return null;

  const up = f.high20 != null && closeBrokeLevel(bar, f.high20, 'up');
  const down = f.low20 != null && closeBrokeLevel(bar, f.low20, 'down');
  if (!up && !down) return null;
  const level = up ? f.high20! : f.low20!;
  if (!notChased(f.tech.last, level, atr, 1.8)) return null;

  const breakdown: ScoreBreakdown = {
    compression: 28,
    volumeContraction: f.volume.ratio <= 0.9 ? 8 : 12,
    breakout: 25,
    confirmation: 18,
    proximity: 10,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 58)) return null;

  return baseHit('compression_break', ctx, {
    direction: up ? 'bullish' : 'bearish',
    status: 'ACTIVE',
    score,
    breakdown,
    stateLabel: 'COMPRESSION BREAK',
    why: 'Left a coiled 20-bar box on a volume close — expansion after squeeze.',
    keyLevel: level,
    trigger: level,
    invalidation: `Return inside prior range through ₹${level.toFixed(2)}`,
    confirmationNeeded: 'Hold outside range on pullback.',
    evidence: [
      { label: 'Prior ATR/range coiled', ok: true },
      { label: `RVOL ${f.volume.ratio.toFixed(1)}×`, ok: true },
      { label: 'Close outside 20-bar box', ok: true },
    ],
  });
}

/** 06 — BREAKOUT RADAR — 20-bar close + volume, not a 10-bar wick */
export function scanBreakoutRadar(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const bar = lastBar(f);
  const atr = atrAbs(f);
  if (!bar || atr == null) return null;
  if (f.volume.ratio < 1.2) return null;

  const up = f.high20 != null && closeBrokeLevel(bar, f.high20, 'up');
  const down = f.low20 != null && closeBrokeLevel(bar, f.low20, 'down');
  if (!up && !down) return null;
  const level = up ? f.high20! : f.low20!;
  if (!notChased(f.tech.last, level, atr, 1.8)) return null;

  const breakdown: ScoreBreakdown = {
    breakout: 30,
    volume: 25,
    followThrough: Math.abs(f.changePercent) >= 0.6 ? 18 : 10,
    structure: clampScore(f.structure.strength / 5, 15),
    retest: 8,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 58)) return null;

  return baseHit('breakout_radar', ctx, {
    direction: up ? 'bullish' : 'bearish',
    status: 'ACTIVE',
    score,
    breakdown,
    stateLabel: 'BREAKOUT + VOLUME',
    why: `Closed beyond 20-bar ${up ? 'high' : 'low'} with RVOL ${f.volume.ratio.toFixed(1)}×.`,
    keyLevel: level,
    trigger: level,
    invalidation: `Close back inside prior range through ₹${level.toFixed(2)}`,
    confirmationNeeded: 'Retest hold preferred.',
    evidence: [
      { label: up ? '20-bar high broken' : '20-bar low broken', ok: true },
      { label: `RVOL ${f.volume.ratio.toFixed(1)}×`, ok: true },
      { label: 'Close, not wick', ok: true },
    ],
  });
}

/** 10 — TREND RIDER — stack + RSI + pullback hold */
export function scanTrendRider(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const align = emaAlignment(f.tech);
  if (align === 'mixed') return null;
  const rsi = f.tech.rsi14;
  if (rsi == null) return null;
  const momOk = align === 'bullish' ? rsi >= 52 : rsi <= 48;
  if (!momOk) return null;
  if (!emaPullbackHold(f, align)) return null;
  if (f.volume.ratio < 0.9) return null;

  const breakdown: ScoreBreakdown = {
    trend: 28,
    emaAlignment: 22,
    momentum: 18,
    pullback: 16,
    volume: f.volume.ratio >= 1 ? 10 : 8,
  };
  const score = sumBreakdown(breakdown);
  if (!scoreGate(ctx, score, 58)) return null;

  return baseHit('trend_rider', ctx, {
    direction: align,
    status: 'ACTIVE',
    score,
    breakdown,
    stateLabel: align === 'bullish' ? 'TREND PULLBACK' : 'TREND PULLBACK SHORT',
    why: `EMA stack ${align}; RSI ${rsi.toFixed(0)}; pullback holding EMA21.`,
    keyLevel: f.tech.ema21,
    trigger: f.tech.ema21,
    invalidation: 'EMA21/50 cross against the trend.',
    confirmationNeeded: 'Enter on pullback hold, not chase.',
    evidence: [
      { label: `Trend ${align}`, ok: true },
      { label: `RSI ${rsi.toFixed(0)}`, ok: true },
      { label: 'Pullback hold', ok: true },
    ],
    meta: {
      trend: align.toUpperCase(),
      htf: align.toUpperCase(),
      momentum: 'STRONG',
      pullback: 'HEALTHY',
    },
  });
}

const PRIME_KEYS: OpportunityScannerId[] = [
  'momentum_surge',
  'liquidity_hunt',
  'compression_break',
  'breakout_radar',
  'trend_rider',
];
const PRIME_VOLUME_KEYS: OpportunityScannerId[] = [
  'momentum_surge',
  'breakout_radar',
  'compression_break',
];

/** 12 — WOLF PRIME — 2+ keepers, one volume-based */
export function scanWolfPrime(
  ctx: Ctx,
  siblingScores: Partial<Record<OpportunityScannerId, number>>,
): OpportunityHit | null {
  const present = PRIME_KEYS.filter((k) => typeof siblingScores[k] === 'number');
  if (present.length < 2) return null;
  if (!PRIME_VOLUME_KEYS.some((k) => typeof siblingScores[k] === 'number')) return null;

  const scores = present.map((k) => siblingScores[k] as number);
  const avg = scores.reduce((a, n) => a + n, 0) / scores.length;
  const score = clampScore(Math.round(avg) + (present.length >= 3 ? 4 : 0));
  if (!scoreGate(ctx, score, 72)) return null;

  const breakdown: ScoreBreakdown = {
    structure: clampScore(((siblingScores.liquidity_hunt ?? siblingScores.compression_break ?? 0) / 100) * 20, 20),
    momentum: clampScore(((siblingScores.momentum_surge ?? siblingScores.trend_rider ?? 0) / 100) * 20, 20),
    volume: clampScore((Math.max(siblingScores.momentum_surge ?? 0, siblingScores.breakout_radar ?? 0) / 100) * 20, 20),
    liquidity: clampScore(((siblingScores.liquidity_hunt ?? 0) / 100) * 15, 15),
    trend: clampScore(((siblingScores.trend_rider ?? 0) / 100) * 15, 15),
    flow: clampScore(((siblingScores.breakout_radar ?? 0) / 100) * 10, 10),
  };

  return baseHit('wolf_prime', ctx, {
    direction: ctx.f.changePercent >= 0 ? 'bullish' : 'bearish',
    status: 'ACTIVE',
    score,
    breakdown,
    stateLabel: score >= 90 ? '🔥 HIGH CONVICTION' : 'WOLF PRIME',
    why: `Composite of ${present.length} keeper scanners — quality ${score}/100.`,
    keyLevel: ctx.f.tech.ema21 ?? ctx.f.high20,
    trigger: ctx.f.high20,
    invalidation: 'Majority of contributing scanners cool or invalidate.',
    confirmationNeeded: 'Still requires trade plan — score ≠ entry.',
    evidence: present.map((k) => ({
      label: `${k.replace(/_/g, ' ')} ${siblingScores[k]}`,
      ok: (siblingScores[k] ?? 0) >= 70,
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
