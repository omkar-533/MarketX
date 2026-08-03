/**
 * Options Scalping Terminal — multi-factor signal engine
 * Price + Volume + OI + Momentum alignment (VPT-style logic)
 */

import { classifyOiBuildup, type OiBuildupLabel } from './ltpCalculatorEngine';

export type ScalpSignal = 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL' | 'AVOID';
export type MomentumTier = 'Weak' | 'Slow' | 'Active' | 'Strong' | 'Explosive';
export type PremiumPhase = 'Stable' | 'Expansion' | 'Explosion' | 'Reversal' | 'Trap';
export type AlertType =
  | 'Breakout'
  | 'Breakdown'
  | 'OI Spike'
  | 'VWAP Cross'
  | 'EMA Cross'
  | 'Fake Breakout'
  | 'Premium Explosion'
  | 'Smart Money'
  | 'Strong Buy'
  | 'Strong Sell';

export type TickPoint = {
  at: number;
  price: number;
  volume: number;
  oi: number;
  oiChange: number;
  bid: number;
  ask: number;
  changePct: number;
};

export type CandleBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  body: number;
};

export type TimeframeBias = 'bull' | 'bear' | 'neutral';

export interface ScalpTickContext {
  ticks: TickPoint[];
  avgVolume: number;
  avgBody: number;
  vwap: number;
  ema9: number;
  ema20: number;
  oiDelta: number;
  priceSpeed: number;
  premiumSeries: number[];
}

export interface ScalpConditionFlags {
  ltpUp: boolean;
  ltpDown: boolean;
  volumeSpike: boolean;
  oiUp: boolean;
  oiDown: boolean;
  priceAboveVwap: boolean;
  priceBelowVwap: boolean;
  emaBullish: boolean;
  emaBearish: boolean;
  breakout: boolean;
  breakdown: boolean;
  premiumMomentum: boolean;
  premiumCollapse: boolean;
  largeCandle: boolean;
  fakeBreakout: boolean;
  weakOiSupport: boolean;
}

export interface ScalpingAnalysis {
  signal: ScalpSignal;
  signalCategory: 'NO TRADE' | 'WEAK SIGNAL' | 'BUY' | 'STRONG BUY' | 'SELL' | 'STRONG SELL';
  score: number;
  masterScore: number;
  buyScore: number;
  sellScore: number;
  conditions: ScalpConditionFlags;
  oiBuildup: OiBuildupLabel;
  momentum: number;
  momentumTier: MomentumTier;
  premiumPhase: PremiumPhase;
  smartMoneyActive: boolean;
  priceSpeedLabel: string;
  premiumLabel: string;
  volumeRatio: number;
  oiChangePct: number;
  vwapDistancePct: number;
  breakoutValidated: boolean;
  candleStrengthScore: number;
  priceSpeedScore: number;
  volumeScore: number;
  oiScore: number;
  vwapScore: number;
  emaScore: number;
  breakoutScore: number;
  premiumScore: number;
  smartMoneyScore: number;
  confidenceLevel: 'Low' | 'Medium' | 'High';
  tradeExecutionReady: boolean;
  mtf: { m1: TimeframeBias; m3: TimeframeBias; m5: TimeframeBias; aligned: boolean };
  reasons: string[];
  alerts: AlertType[];
  ltpSpeed: number;
}

const MAX_TICKS = 120;

function round(n: number, d = 2): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** d) / 10 ** d;
}

export function pushTick(buffer: TickPoint[], tick: TickPoint): TickPoint[] {
  const next = [...buffer, tick].slice(-MAX_TICKS);
  return next;
}

export function avgVolumeFromTicks(ticks: TickPoint[]): number {
  if (!ticks.length) return 1;
  const sum = ticks.reduce((s, t) => s + t.volume, 0);
  return Math.max(1, sum / ticks.length);
}

export function computeVwap(ticks: TickPoint[]): number {
  if (!ticks.length) return 0;
  let pv = 0;
  let vol = 0;
  for (const t of ticks) {
    const v = Math.max(t.volume, 1);
    pv += t.price * v;
    vol += v;
  }
  return vol > 0 ? round(pv / vol) : ticks[ticks.length - 1].price;
}

export function emaFromTicks(ticks: TickPoint[], period: number): number {
  if (!ticks.length) return 0;
  const k = 2 / (period + 1);
  let ema = ticks[0].price;
  for (let i = 1; i < ticks.length; i++) {
    ema = ticks[i].price * k + ema * (1 - k);
  }
  return round(ema);
}

export function priceSpeedPct(ticks: TickPoint[], window = 8): number {
  if (ticks.length < 2) return 0;
  const slice = ticks.slice(-window);
  const first = slice[0].price;
  const last = slice[slice.length - 1].price;
  if (first <= 0) return 0;
  return round(((last - first) / first) * 100, 3);
}

export function buildCandles(ticks: TickPoint[], bucketMs: number): CandleBar[] {
  if (!ticks.length) return [];
  const buckets = new Map<number, CandleBar>();
  for (const t of ticks) {
    const key = Math.floor(t.at / bucketMs) * bucketMs;
    const cur = buckets.get(key);
    if (!cur) {
      buckets.set(key, {
        time: key,
        open: t.price,
        high: t.price,
        low: t.price,
        close: t.price,
        volume: t.volume,
        body: 0,
      });
    } else {
      cur.high = Math.max(cur.high, t.price);
      cur.low = Math.min(cur.low, t.price);
      cur.close = t.price;
      cur.volume += t.volume;
      cur.body = Math.abs(cur.close - cur.open);
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

export function timeframeBias(candles: CandleBar[]): TimeframeBias {
  if (candles.length < 2) return 'neutral';
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  if (last.close > prev.close && last.close > last.open) return 'bull';
  if (last.close < prev.close && last.close < last.open) return 'bear';
  return 'neutral';
}

export function avgCandleBody(candles: CandleBar[]): number {
  if (!candles.length) return 0;
  return candles.reduce((s, c) => s + c.body, 0) / candles.length;
}

export function detectPremiumPhase(series: number[]): PremiumPhase {
  if (series.length < 4) return 'Stable';
  const recent = series.slice(-5);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const mid = recent[Math.floor(recent.length / 2)];
  const upMove = ((last - first) / Math.max(first, 0.01)) * 100;
  const reversal = last < mid && mid > first + Math.abs(first) * 0.02;
  if (reversal && upMove > 3) return 'Trap';
  if (upMove > 8) return 'Explosion';
  if (upMove > 3) return 'Expansion';
  if (upMove < -4) return 'Reversal';
  return 'Stable';
}

export function momentumTier(score: number): MomentumTier {
  if (score >= 80) return 'Explosive';
  if (score >= 60) return 'Strong';
  if (score >= 40) return 'Active';
  if (score >= 20) return 'Slow';
  return 'Weak';
}

export function classifyPriceSpeed(pct: number): { label: string; score: number } {
  const absPct = Math.abs(pct);
  if (absPct > 3) return { label: 'Explosive', score: 20 };
  if (absPct > 2) return { label: 'Strong', score: 15 };
  if (absPct > 1) return { label: 'Active', score: 10 };
  return { label: 'Slow', score: 4 };
}

export function classifyPremiumSpeed(pct: number): { label: string; score: number } {
  if (pct > 10) return { label: 'Explosive', score: 5 };
  if (pct >= 5) return { label: 'Strong', score: 4 };
  if (pct >= 2) return { label: 'Active', score: 3 };
  return { label: 'Weak', score: 1 };
}

export function classifyVolumeRatio(ratio: number): { label: string; score: number } {
  if (ratio > 3) return { label: 'Institutional', score: 20 };
  if (ratio > 2) return { label: 'Strong', score: 15 };
  if (ratio > 1.5) return { label: 'Active', score: 10 };
  return { label: 'Normal', score: 4 };
}

export function classifyOiChange(pct: number): { label: string; score: number } {
  const absPct = Math.abs(pct);
  if (absPct > 10) return { label: 'Aggressive', score: 20 };
  if (absPct > 5) return { label: 'Strong', score: 15 };
  if (absPct > 2) return { label: 'Active', score: 10 };
  return { label: 'Weak', score: 4 };
}

export function classifyCandleStrength(body: number, avgBody: number): { label: string; score: number } {
  if (avgBody <= 0) return { label: 'Weak', score: 0 };
  const ratio = body / avgBody;
  if (ratio > 3) return { label: 'Explosive', score: 100 };
  if (ratio > 2) return { label: 'Strong', score: 80 };
  if (ratio > 1) return { label: 'Normal', score: 60 };
  return { label: 'Weak', score: 30 };
}

export function calculateSmartMoneyScore(
  oiScore: number,
  volumeScore: number,
  premiumScore: number,
  vwapScore: number,
): number {
  const score = oiScore * 0.3 + volumeScore * 0.3 + premiumScore * 0.2 + vwapScore * 0.2;
  return round(Math.min(100, score));
}

export function calculateMomentumScore(
  priceSpeedScore: number,
  volumeScore: number,
  oiScore: number,
  candleStrengthScore: number,
): number {
  return round((priceSpeedScore + volumeScore + oiScore + candleStrengthScore) / 4);
}

export function calculateVwapDistancePct(price: number, vwap: number): number {
  if (vwap === 0) return 0;
  return round(((price - vwap) / vwap) * 100, 2);
}

export function calculateRiskManagement(
  capital: number,
  riskPct: number,
  entry: number,
  stoploss: number,
  target: number,
) {
  const riskAmount = round(capital * (riskPct / 100));
  const positionSize = stoploss === entry ? 0 : round(riskAmount / Math.abs(entry - stoploss));
  const rrRatio = stoploss === entry ? 0 : round(Math.abs(target - entry) / Math.abs(entry - stoploss), 2);
  const maxLoss = round(positionSize * Math.abs(entry - stoploss));
  const maxProfit = round(positionSize * Math.abs(target - entry));
  return { riskAmount, positionSize, rrRatio, maxLoss, maxProfit, exposure: round(positionSize * entry) };
}

export function autoTargets(entry: number, stoploss: number) {
  const r = Math.abs(entry - stoploss);
  if (r === 0) return { t1: entry, t2: entry, t3: entry };
  if (entry > stoploss) {
    return { t1: entry + r, t2: entry + 2 * r, t3: entry + 3 * r };
  }
  return { t1: entry - r, t2: entry - 2 * r, t3: entry - 3 * r };
}

export function buildScalpContext(
  ticks: TickPoint[],
  vwapOverride?: number,
  premiumSeries?: number[],
): ScalpTickContext {
  const m1 = buildCandles(ticks, 60_000);
  const avgVol = avgVolumeFromTicks(ticks);
  const avgBody = avgCandleBody(m1);
  const last = ticks[ticks.length - 1];
  const firstOi = ticks.length > 5 ? ticks[ticks.length - 6].oi : last.oi;
  return {
    ticks,
    avgVolume: avgVol,
    avgBody: Math.max(avgBody, 0.01),
    vwap: vwapOverride && vwapOverride > 0 ? vwapOverride : computeVwap(ticks),
    ema9: emaFromTicks(ticks, 9),
    ema20: emaFromTicks(ticks, 20),
    oiDelta: last.oi - firstOi,
    priceSpeed: priceSpeedPct(ticks),
    premiumSeries: premiumSeries ?? ticks.map((t) => t.price),
  };
}

export function evaluateConditions(ctx: ScalpTickContext): ScalpConditionFlags {
  const last = ctx.ticks[ctx.ticks.length - 1];
  if (!last) {
    return {
      ltpUp: false,
      ltpDown: false,
      volumeSpike: false,
      oiUp: false,
      oiDown: false,
      priceAboveVwap: false,
      priceBelowVwap: false,
      emaBullish: false,
      emaBearish: false,
      breakout: false,
      breakdown: false,
      premiumMomentum: false,
      premiumCollapse: false,
      largeCandle: false,
      fakeBreakout: false,
      weakOiSupport: false,
    };
  }

  const m1 = buildCandles(ctx.ticks, 60_000);
  const lastCandle = m1[m1.length - 1];
  const prevCandle = m1[m1.length - 2];
  const ltpUp = ctx.priceSpeed > 0.5;
  const ltpDown = ctx.priceSpeed < -0.5;
  const volumeRatio = last.volume / Math.max(ctx.avgVolume, 1);
  const volumeSpike = volumeRatio > 1.5;
  const oiUp = ctx.oiDelta > 0 || last.oiChange > 0;
  const oiDown = ctx.oiDelta < 0 || last.oiChange < 0;
  const priceAboveVwap = last.price > ctx.vwap;
  const priceBelowVwap = last.price < ctx.vwap;
  const emaBullish = ctx.ema9 > ctx.ema20;
  const emaBearish = ctx.ema9 < ctx.ema20;
  const breakout = Boolean(
    lastCandle && prevCandle && lastCandle.close > prevCandle.high && lastCandle.close > ctx.vwap,
  );
  const breakdown = Boolean(
    lastCandle && prevCandle && lastCandle.close < prevCandle.low && lastCandle.close < ctx.vwap,
  );
  const premiumPhase = detectPremiumPhase(ctx.premiumSeries);
  const premiumMomentum = premiumPhase === 'Expansion' || premiumPhase === 'Explosion';
  const premiumCollapse = premiumPhase === 'Reversal' || premiumPhase === 'Trap';
  const largeCandle = Boolean(lastCandle && lastCandle.body > ctx.avgBody * 1.2);
  const prevOi = ctx.ticks.length >= 2 ? ctx.ticks[ctx.ticks.length - 2].oi : 1;
  const fakeBreakout = breakout && (volumeRatio <= 2 || Math.abs(ctx.oiDelta) <= Math.max(1, prevOi * 0.03));
  const weakOiSupport = breakout && !oiUp;

  return {
    ltpUp,
    ltpDown,
    volumeSpike,
    oiUp,
    oiDown,
    priceAboveVwap,
    priceBelowVwap,
    emaBullish,
    emaBearish,
    breakout,
    breakdown,
    premiumMomentum,
    premiumCollapse,
    largeCandle,
    fakeBreakout,
    weakOiSupport,
  };
}

export function analyzeScalpingTerminal(
  ticks: TickPoint[],
  opts?: { vwap?: number; changePct?: number; premiumSeries?: number[] },
): ScalpingAnalysis {
  if (ticks.length < 3) {
    return {
      signal: 'HOLD',
      signalCategory: 'NO TRADE',
      score: 0,
      masterScore: 0,
      buyScore: 0,
      sellScore: 0,
      conditions: evaluateConditions(buildScalpContext([])),
      oiBuildup: 'Neutral',
      momentum: 0,
      momentumTier: 'Weak',
      premiumPhase: 'Stable',
      smartMoneyActive: false,
      priceSpeedLabel: 'Slow',
      premiumLabel: 'Weak',
      volumeRatio: 0,
      oiChangePct: 0,
      vwapDistancePct: 0,
      breakoutValidated: false,
      candleStrengthScore: 0,
      priceSpeedScore: 0,
      volumeScore: 0,
      oiScore: 0,
      vwapScore: 0,
      emaScore: 0,
      breakoutScore: 0,
      premiumScore: 0,
      smartMoneyScore: 0,
      confidenceLevel: 'Low',
      tradeExecutionReady: false,
      mtf: { m1: 'neutral', m3: 'neutral', m5: 'neutral', aligned: false },
      reasons: ['Collecting live ticks…'],
      alerts: [],
      ltpSpeed: 0,
    };
  }

  const ctx = buildScalpContext(ticks, opts?.vwap, opts?.premiumSeries);
  const c = evaluateConditions(ctx);
  const last = ctx.ticks[ctx.ticks.length - 1];
  const priceChg = opts?.changePct ?? last.changePct;
  const oiBuildup = classifyOiBuildup(priceChg, ctx.oiDelta);

  const m1Candles = buildCandles(ctx.ticks, 60_000);
  const lastCandle = m1Candles[m1Candles.length - 1];
  const premiumPhase = detectPremiumPhase(ctx.premiumSeries);
  const m1 = timeframeBias(m1Candles);
  const m3 = timeframeBias(buildCandles(ctx.ticks, 180_000));
  const m5 = timeframeBias(buildCandles(ctx.ticks, 300_000));
  const mtfAligned =
    (m1 === 'bull' && m3 === 'bull' && m5 === 'bull') ||
    (m1 === 'bear' && m3 === 'bear' && m5 === 'bear');

  const prevOi = ctx.ticks.length >= 2 ? ctx.ticks[ctx.ticks.length - 2].oi : last.oi;
  const oiChangePct = prevOi > 0 ? round(((last.oi - prevOi) / prevOi) * 100, 2) : 0;
  const volumeRatio = last.volume / Math.max(ctx.avgVolume, 1);
  const premiumSpeed =
    ctx.premiumSeries.length >= 2
      ? round(
          ((ctx.premiumSeries[ctx.premiumSeries.length - 1] - ctx.premiumSeries[ctx.premiumSeries.length - 2]) /
            Math.max(ctx.premiumSeries[ctx.premiumSeries.length - 2], 0.01)) *
            100,
          2,
        )
      : 0;
  const priceSpeedData = classifyPriceSpeed(ctx.priceSpeed);
  const premiumData = classifyPremiumSpeed(premiumSpeed);
  const volumeData = classifyVolumeRatio(volumeRatio);
  const oiData = classifyOiChange(oiChangePct);
  const candleData = classifyCandleStrength(lastCandle?.body ?? 0, ctx.avgBody);
  const vwapDistancePct = calculateVwapDistancePct(last.price, ctx.vwap);
  const vwapScore = c.priceAboveVwap || c.priceBelowVwap ? 15 : 0;
  const emaScore = c.emaBullish || c.emaBearish ? 10 : 0;
  const breakoutScore = c.breakout || c.breakdown ? 10 : 0;
  const premiumScore = premiumData.score;
  const priceSpeedScore = priceSpeedData.score;
  const volumeScore = volumeData.score;
  const oiScore = oiData.score;
  const candleStrengthScore = Math.round((candleData.score / 100) * 20);

  let buyScore = 0;
  let sellScore = 0;
  const reasons: string[] = [];
  const alerts: AlertType[] = [];

  if (c.ltpUp) {
    buyScore += priceSpeedScore;
    reasons.push(`LTP speed ↑ (${priceSpeedData.label})`);
  }
  if (c.ltpDown) {
    sellScore += priceSpeedScore;
    reasons.push(`LTP speed ↓ (${priceSpeedData.label})`);
  }

  if (volumeRatio > 1) {
    buyScore += volumeScore;
    sellScore += volumeScore;
    reasons.push(`Volume spike ${volumeData.label}`);
    alerts.push('OI Spike');
  }

  if (c.oiUp) {
    buyScore += oiScore;
    reasons.push(`OI increase ${oiData.label}`);
  }
  if (c.oiDown) {
    sellScore += oiScore;
    reasons.push(`OI decrease ${oiData.label}`);
  }

  if (c.priceAboveVwap) {
    buyScore += vwapScore;
    reasons.push('Price above VWAP');
    alerts.push('VWAP Cross');
  }
  if (c.priceBelowVwap) {
    sellScore += vwapScore;
    reasons.push('Price below VWAP');
    alerts.push('VWAP Cross');
  }

  if (c.emaBullish) {
    buyScore += emaScore;
    reasons.push('EMA9 > EMA20');
    alerts.push('EMA Cross');
  }
  if (c.emaBearish) {
    sellScore += emaScore;
    reasons.push('EMA9 < EMA20');
    alerts.push('EMA Cross');
  }

  if (c.breakout) {
    buyScore += breakoutScore;
    reasons.push('Breakout strength confirmed');
    alerts.push('Breakout');
  }
  if (c.breakdown) {
    sellScore += breakoutScore;
    reasons.push('Breakdown strength confirmed');
    alerts.push('Breakout');
  }

  if (c.premiumMomentum) {
    buyScore += premiumScore;
    reasons.push(`Premium ${premiumData.label}`);
    alerts.push('Premium Explosion');
  }
  if (c.premiumCollapse) {
    sellScore += premiumScore;
    reasons.push('Premium collapse');
  }

  if (c.largeCandle) {
    buyScore += 5;
    sellScore += 5;
    reasons.push('Candle strength high');
  }

  const breakoutValidated = c.breakout && volumeRatio > 2 && oiChangePct > 3;
  const fakeBreakout = c.breakout && !breakoutValidated;

  const smartMoneyScore = calculateSmartMoneyScore(oiScore, volumeScore, premiumScore, vwapScore);
  const smartMoneyActive = smartMoneyScore > 80;

  if (smartMoneyActive) {
    reasons.push('Smart money active');
    alerts.push('Smart Money');
  }
  if (fakeBreakout) {
    reasons.push('Fake breakout filter — low vol/OI');
    alerts.push('Fake Breakout');
  }
  if (c.weakOiSupport) reasons.push('Weak OI support on breakout');

  const momentum = calculateMomentumScore(priceSpeedScore, volumeScore, oiScore, candleStrengthScore);
  const confidenceLevel = mtfAligned ? 'High' : m1 === m3 || m3 === m5 || m1 === m5 ? 'Medium' : 'Low';

  const buyReady =
    buyScore > 75 && volumeRatio > 2 && oiChangePct > 3 && premiumSpeed > 5 && c.priceAboveVwap && c.emaBullish;
  const sellReady =
    sellScore > 75 && volumeRatio > 2 && oiChangePct > 3 && premiumSpeed > 5 && c.priceBelowVwap && c.emaBearish;

  const masterScore = Math.max(buyScore, sellScore);
  const finalScore = round(Math.min(100, masterScore));
  let signal: ScalpSignal = 'HOLD';
  let signalCategory: ScalpingAnalysis['signalCategory'] = 'NO TRADE';

  if (c.fakeBreakout) {
    signal = 'AVOID';
    signalCategory = 'NO TRADE';
  } else if (buyReady) {
    signal = 'STRONG BUY';
    signalCategory = 'STRONG BUY';
    alerts.push('Strong Buy');
  } else if (sellReady) {
    signal = 'STRONG SELL';
    signalCategory = 'STRONG SELL';
    alerts.push('Strong Sell');
  } else if (buyScore >= 61 && buyScore > sellScore) {
    signal = 'BUY';
    signalCategory = buyScore >= 81 ? 'STRONG BUY' : 'BUY';
  } else if (sellScore >= 61 && sellScore > buyScore) {
    signal = 'SELL';
    signalCategory = sellScore >= 81 ? 'STRONG SELL' : 'SELL';
  } else if (finalScore >= 41) {
    signalCategory = 'WEAK SIGNAL';
    signal = 'HOLD';
  } else {
    signalCategory = 'NO TRADE';
    signal = 'HOLD';
  }

  return {
    signal,
    signalCategory,
    score: finalScore,
    masterScore: finalScore,
    buyScore: round(buyScore, 1),
    sellScore: round(sellScore, 1),
    conditions: c,
    oiBuildup,
    momentum,
    momentumTier: momentumTier(momentum),
    premiumPhase,
    smartMoneyActive,
    priceSpeedLabel: priceSpeedData.label,
    premiumLabel: premiumData.label,
    volumeRatio: round(volumeRatio, 2),
    oiChangePct,
    vwapDistancePct,
    breakoutValidated,
    candleStrengthScore,
    priceSpeedScore,
    volumeScore,
    oiScore,
    vwapScore,
    emaScore,
    breakoutScore,
    premiumScore,
    smartMoneyScore,
    confidenceLevel,
    tradeExecutionReady: buyReady || sellReady,
    mtf: { m1, m3, m5, aligned: mtfAligned },
    reasons,
    alerts: [...new Set(alerts)],
    ltpSpeed: ctx.priceSpeed,
  };
}

export const OI_BUILDUP_COLORS: Record<OiBuildupLabel, string> = {
  'Long Buildup': 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  'Short Buildup': 'text-red-400 bg-red-500/15 border-red-500/30',
  'Short Covering': 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30',
  'Long Unwinding': 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  Neutral: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

export const SIGNAL_STYLES: Record<ScalpSignal, string> = {
  'STRONG BUY': 'bg-emerald-500/25 text-emerald-300 border-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.35)] animate-pulse',
  BUY: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  HOLD: 'bg-slate-700/40 text-slate-300 border-slate-600/50',
  SELL: 'bg-red-500/15 text-red-400 border-red-500/40',
  'STRONG SELL': 'bg-red-500/25 text-red-300 border-red-400/50 shadow-[0_0_20px_rgba(248,113,113,0.35)] animate-pulse',
  AVOID: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
};
