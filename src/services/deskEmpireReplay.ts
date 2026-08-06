/**
 * Desk Empire — TradingView historical replay, full pre-trade checklist, trade simulator.
 *
 * Round shape: real bars replay → freeze → the player answers the same checklist a desk
 * runs before risking money (bias, entry model, stop, RR, management, context) → the
 * remaining real bars are replayed and the plan is simulated bar-by-bar for a true R result.
 */

import { fetchMarketOhlc } from './marketApiService';
import type { DetectiveCard } from './mentorDrills';

export type EmpireBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type EmpireSide = 'long' | 'short';

export type StepKey = 'bias' | 'entry' | 'stop' | 'rr' | 'manage' | 'context';

export type StepOption = {
  id: string;
  label: string;
  sub?: string;
};

export type PlanStep = {
  key: StepKey;
  /** Topic badge — maps to what Wolf AI teaches in the curriculum */
  topic: string;
  question: string;
  hint: string;
  options: StepOption[];
  bestId: string;
  /** One line teaching shown in the debrief */
  why: string;
};

export type TapeAnalysis = {
  trend: 'bull' | 'bear' | 'range';
  zone: 'premium' | 'discount' | 'equilibrium';
  atr: number;
  rangeHi: number;
  rangeLo: number;
  eq: number;
  swingHigh: number;
  swingLow: number;
  /** Buy-side / sell-side pools (equal highs / lows) */
  bsl: number;
  ssl: number;
  equalHighs: boolean;
  equalLows: boolean;
  fvg: { top: number; bottom: number; dir: EmpireSide } | null;
  ob: { top: number; bottom: number; dir: EmpireSide } | null;
  displacement: boolean;
  sweptHigh: boolean;
  sweptLow: boolean;
  pattern: string;
  patternBias: EmpireSide | 'none';
  volumePush: 'high' | 'low' | 'normal';
  bias: EmpireSide;
  biasScore: number;
  biasWhy: string;
  /** Room to the next opposing pool, in R terms with a structural stop */
  roomR: number;
  structuralStopLong: number;
  structuralStopShort: number;
  /** Nearest short-term liquidity a sweep entry would wait for */
  sweepLong: number;
  sweepShort: number;
};

export type EmpireScenario = {
  id: string;
  symbol: string;
  interval: string;
  source: 'tradingview' | 'sim';
  /** Bars shown during warmup → freeze (last one is the decision bar) */
  visible: EmpireBar[];
  /** Bars revealed after the plan is locked */
  future: EmpireBar[];
  entry: number;
  hints: string[];
  levels: { price: number; label: string; tone: 'bull' | 'bear' | 'neutral' }[];
  analysis: TapeAnalysis;
  steps: PlanStep[];
};

export type PlanAnswers = Partial<Record<StepKey, string>>;

export type TradePlan = {
  side: EmpireSide;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  risk: number;
  rr: number;
  entryModel: string;
  manageModel: string;
};

export type StepReview = {
  key: StepKey;
  topic: string;
  question: string;
  picked: string;
  best: string;
  correct: boolean;
  why: string;
};

export type EmpireResolve = {
  plan: TradePlan;
  filled: boolean;
  fillIndex: number;
  exit: number;
  exitIndex: number;
  exitReason: 'target' | 'stop' | 'trail' | 'breakeven' | 'timeout' | 'nofill';
  rMultiple: number;
  mfeR: number;
  maeR: number;
  riskAmount: number;
  pnl: number;
  processBonus: number;
  streakMult: number;
  won: boolean;
  edgePct: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  reviews: StepReview[];
  teach: string;
  headline: string;
};

/** Liquid TradingView symbols we can always pull clean history for. */
const TAPE_SYMBOLS = [
  'NIFTY',
  'BANKNIFTY',
  'RELIANCE',
  'HDFCBANK',
  'TCS',
  'INFY',
  'BTCUSDT',
  'ETHUSDT',
  'XAUUSD',
];

const TF_POOL = ['5m', '15m', '1h'];
const VISIBLE_LEN = 44;
const FUTURE_LEN = 34;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeInterval(raw: string | undefined): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return pick(TF_POOL);
  if (/^(1d|d|day|daily)$/.test(v)) return '1d';
  if (/^(1w|w|week|weekly)$/.test(v)) return '1w';
  const m = v.match(/^(\d{1,4})\s*(m|min|mins|minute|minutes)?$/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 60 && n % 60 === 0) return `${n / 60}h`;
    return `${n}m`;
  }
  const h = v.match(/^(\d{1,2})\s*(h|hr|hour|hours)$/);
  if (h) return `${Number(h[1])}h`;
  return '15m';
}

function rangeFor(interval: string): string {
  if (interval === '1d' || interval === '1w') return '1y';
  if (/h$/.test(interval)) return '6mo';
  return '3mo';
}

/** Offline fallback so the desk is still playable when the tape API is down. */
function synthBars(count: number): EmpireBar[] {
  const bars: EmpireBar[] = [];
  let px = 22000 + Math.random() * 800;
  const t0 = Math.floor(Date.now() / 1000) - count * 900;
  let drift = (Math.random() - 0.5) * 6;
  for (let i = 0; i < count; i += 1) {
    if (i % 14 === 0) drift = (Math.random() - 0.5) * 12;
    const open = px;
    const close = px + drift + (Math.random() - 0.5) * 30;
    const high = Math.max(open, close) + Math.random() * 22;
    const low = Math.min(open, close) - Math.random() * 22;
    bars.push({ time: t0 + i * 900, open, high, low, close, volume: 1200 + Math.random() * 5200 });
    px = close;
  }
  return bars;
}

function atrOf(bars: EmpireBar[], period = 14): number {
  const slice = bars.slice(-(period + 1));
  if (slice.length < 2) return Math.max(1e-6, (bars.at(-1)?.high ?? 1) - (bars.at(-1)?.low ?? 0));
  let sum = 0;
  for (let i = 1; i < slice.length; i += 1) {
    const b = slice[i];
    const p = slice[i - 1];
    sum += Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
  }
  return Math.max(1e-6, sum / (slice.length - 1));
}

type Swing = { index: number; price: number };

function swingPoints(bars: EmpireBar[], span = 2): { highs: Swing[]; lows: Swing[] } {
  const highs: Swing[] = [];
  const lows: Swing[] = [];
  for (let i = span; i < bars.length - span; i += 1) {
    const b = bars[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - span; j <= i + span; j += 1) {
      if (j === i) continue;
      if (bars[j].high >= b.high) isHigh = false;
      if (bars[j].low <= b.low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: b.high });
    if (isLow) lows.push({ index: i, price: b.low });
  }
  return { highs, lows };
}

function candleRead(bars: EmpireBar[]): { pattern: string; bias: EmpireSide | 'none' } {
  const b = bars.at(-1);
  const p = bars.at(-2);
  if (!b || !p) return { pattern: 'Neutral candle', bias: 'none' };
  const body = Math.abs(b.close - b.open);
  const range = Math.max(1e-9, b.high - b.low);
  const upper = b.high - Math.max(b.open, b.close);
  const lower = Math.min(b.open, b.close) - b.low;
  const pBody = Math.abs(p.close - p.open);

  if (body / range < 0.18) return { pattern: 'Doji — buyers/sellers balanced', bias: 'none' };
  if (lower > body * 1.6 && lower > upper * 1.5)
    return { pattern: 'Pin bar — lower wick, sellers rejected', bias: 'long' };
  if (upper > body * 1.6 && upper > lower * 1.5)
    return { pattern: 'Pin bar — upper wick, buyers rejected', bias: 'short' };
  if (b.close > b.open && b.close > p.high && body > pBody * 1.2)
    return { pattern: 'Bullish engulf — demand took control', bias: 'long' };
  if (b.close < b.open && b.close < p.low && body > pBody * 1.2)
    return { pattern: 'Bearish engulf — supply took control', bias: 'short' };
  if (b.high < p.high && b.low > p.low) return { pattern: 'Inside bar — compression', bias: 'none' };
  if (body / range > 0.7)
    return {
      pattern: b.close > b.open ? 'Marubozu up — one-way buying' : 'Marubozu down — one-way selling',
      bias: b.close > b.open ? 'long' : 'short',
    };
  return { pattern: 'Normal body — no strong signal', bias: 'none' };
}

function nearlyEqual(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

function analyseTape(visible: EmpireBar[]): TapeAnalysis {
  const last = visible.at(-1) as EmpireBar;
  const entry = last.close;
  const atr = atrOf(visible);
  const window = visible.slice(-30);
  const rangeHi = Math.max(...window.map((b) => b.high));
  const rangeLo = Math.min(...window.map((b) => b.low));
  const eq = (rangeHi + rangeLo) / 2;

  const { highs, lows } = swingPoints(visible, 2);
  const lastHighs = highs.slice(-3);
  const lastLows = lows.slice(-3);
  const swingHigh = lastHighs.at(-1)?.price ?? rangeHi;
  const swingLow = lastLows.at(-1)?.price ?? rangeLo;

  let trend: TapeAnalysis['trend'] = 'range';
  if (lastHighs.length >= 2 && lastLows.length >= 2) {
    const hh = (lastHighs.at(-1)?.price ?? 0) > (lastHighs.at(-2)?.price ?? 0);
    const hl = (lastLows.at(-1)?.price ?? 0) > (lastLows.at(-2)?.price ?? 0);
    const lh = (lastHighs.at(-1)?.price ?? 0) < (lastHighs.at(-2)?.price ?? 0);
    const ll = (lastLows.at(-1)?.price ?? 0) < (lastLows.at(-2)?.price ?? 0);
    if (hh && hl) trend = 'bull';
    else if (lh && ll) trend = 'bear';
  }

  const pos = (entry - rangeLo) / Math.max(1e-9, rangeHi - rangeLo);
  const zone: TapeAnalysis['zone'] = pos > 0.62 ? 'premium' : pos < 0.38 ? 'discount' : 'equilibrium';

  const tol = atr * 0.25;
  const equalHighs =
    lastHighs.length >= 2 &&
    nearlyEqual(lastHighs.at(-1)?.price ?? 0, lastHighs.at(-2)?.price ?? 0, tol);
  const equalLows =
    lastLows.length >= 2 &&
    nearlyEqual(lastLows.at(-1)?.price ?? 0, lastLows.at(-2)?.price ?? 0, tol);
  const bsl = Math.max(swingHigh, rangeHi);
  const ssl = Math.min(swingLow, rangeLo);

  // Fair value gap in the last 10 bars (3-candle imbalance)
  let fvg: TapeAnalysis['fvg'] = null;
  for (let i = visible.length - 1; i >= Math.max(2, visible.length - 10); i -= 1) {
    const a = visible[i - 2];
    const c = visible[i];
    if (c.low > a.high) {
      fvg = { top: c.low, bottom: a.high, dir: 'long' };
      break;
    }
    if (c.high < a.low) {
      fvg = { top: a.low, bottom: c.high, dir: 'short' };
      break;
    }
  }

  // Order block: last opposite candle before the strongest recent impulse
  let ob: TapeAnalysis['ob'] = null;
  let bestBody = 0;
  for (let i = visible.length - 1; i >= Math.max(1, visible.length - 12); i -= 1) {
    const b = visible[i];
    const body = Math.abs(b.close - b.open);
    if (body > bestBody && body > atr) {
      const prev = visible[i - 1];
      if (b.close > b.open && prev.close < prev.open) {
        ob = { top: Math.max(prev.open, prev.close), bottom: prev.low, dir: 'long' };
        bestBody = body;
      } else if (b.close < b.open && prev.close > prev.open) {
        ob = { top: prev.high, bottom: Math.min(prev.open, prev.close), dir: 'short' };
        bestBody = body;
      }
    }
  }

  const displacement = Math.abs(last.close - last.open) > atr * 1.1;
  const recent = visible.slice(-4);
  const prior = visible.slice(-20, -4);
  const priorHi = prior.length ? Math.max(...prior.map((b) => b.high)) : rangeHi;
  const priorLo = prior.length ? Math.min(...prior.map((b) => b.low)) : rangeLo;
  const sweptHigh = recent.some((b) => b.high > priorHi && b.close < priorHi);
  const sweptLow = recent.some((b) => b.low < priorLo && b.close > priorLo);

  const { pattern, bias: patternBias } = candleRead(visible);
  const avgVol = window.reduce((s, b) => s + (b.volume || 0), 0) / Math.max(1, window.length);
  const volumePush =
    !last.volume || !avgVol ? 'normal' : last.volume > avgVol * 1.4 ? 'high' : last.volume < avgVol * 0.6 ? 'low' : 'normal';

  // Confluence scoring — the same stack Wolf AI teaches: structure + location + liquidity + candle.
  let score = 0;
  const why: string[] = [];
  if (trend === 'bull') {
    score += 2;
    why.push('structure HH/HL');
  } else if (trend === 'bear') {
    score -= 2;
    why.push('structure LH/LL');
  }
  if (zone === 'discount') {
    score += 1.5;
    why.push('discount location');
  } else if (zone === 'premium') {
    score -= 1.5;
    why.push('premium location');
  }
  if (sweptLow) {
    score += 2;
    why.push('sell-side sweep + reclaim');
  }
  if (sweptHigh) {
    score -= 2;
    why.push('buy-side sweep + rejection');
  }
  if (equalHighs) {
    score += 0.5;
    why.push('equal highs = draw above');
  }
  if (equalLows) {
    score -= 0.5;
    why.push('equal lows = draw below');
  }
  if (patternBias === 'long') {
    score += 1;
    why.push(pattern.toLowerCase());
  }
  if (patternBias === 'short') {
    score -= 1;
    why.push(pattern.toLowerCase());
  }
  if (displacement) {
    score += last.close > last.open ? 1 : -1;
    why.push('displacement candle');
  }

  const bias: EmpireSide = score >= 0 ? 'long' : 'short';
  const structuralStopLong = Math.min(swingLow, last.low) - atr * 0.3;
  const structuralStopShort = Math.max(swingHigh, last.high) + atr * 0.3;
  const near = visible.slice(-5);
  const sweepLong = Math.max(Math.min(...near.map((b) => b.low)), entry - atr * 0.7);
  const sweepShort = Math.min(Math.max(...near.map((b) => b.high)), entry + atr * 0.7);
  // A stop tighter than ~0.8 ATR is inside noise, so RR room is measured against that floor.
  const rawRisk = bias === 'long' ? entry - structuralStopLong : structuralStopShort - entry;
  const risk = Math.max(atr * 0.8, rawRisk);
  const room = bias === 'long' ? bsl - entry : entry - ssl;
  const roomR = Math.min(6, Math.max(0.5, room / risk));

  return {
    trend,
    zone,
    atr,
    rangeHi,
    rangeLo,
    eq,
    swingHigh,
    swingLow,
    bsl,
    ssl,
    equalHighs,
    equalLows,
    fvg,
    ob,
    displacement,
    sweptHigh,
    sweptLow,
    pattern,
    patternBias,
    volumePush,
    bias,
    biasScore: Math.abs(score),
    biasWhy: why.slice(0, 3).join(' + ') || 'mixed signals',
    roomR,
    structuralStopLong,
    structuralStopShort,
    sweepLong,
    sweepShort,
  };
}

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */

const CONTEXT_STEPS = (a: TapeAnalysis): PlanStep[] => [
  {
    key: 'context',
    topic: 'Market Structure',
    question: 'Higher-timeframe draw kaha hai — price kis liquidity ki taraf khinch raha hai?',
    hint: a.equalHighs ? 'Equal highs bane hue hain' : a.equalLows ? 'Equal lows bane hue hain' : 'Range ke dono ends dekho',
    options: [
      { id: 'up', label: 'Buy-side above highs', sub: 'stops resting over swing high' },
      { id: 'down', label: 'Sell-side below lows', sub: 'stops resting under swing low' },
      { id: 'none', label: 'Koi draw nahi — dead range', sub: 'no clean pool' },
    ],
    bestId: a.equalHighs ? 'up' : a.equalLows ? 'down' : a.trend === 'bull' ? 'up' : a.trend === 'bear' ? 'down' : 'none',
    why: 'Market ek pool se dusre pool tak chalta hai. Entry lene se pehle draw pata hona chahiye, warna target randomly lagta hai.',
  },
  {
    key: 'context',
    topic: 'Candlestick Psychology',
    question: 'Decision candle kya keh rahi hai?',
    hint: a.pattern,
    options: [
      { id: 'long', label: 'Buyers ne control liya', sub: 'demand absorbed supply' },
      { id: 'short', label: 'Sellers ne control liya', sub: 'supply absorbed demand' },
      { id: 'none', label: 'Balance — koi winner nahi', sub: 'indecision' },
    ],
    bestId: a.patternBias === 'none' ? 'none' : a.patternBias,
    why: 'Candle ka body/wick ratio batata hai kisne control kiya. Wick = reject, body = acceptance.',
  },
  {
    key: 'context',
    topic: 'Risk Management',
    question: 'Ek trade me account ka kitna risk sahi hai?',
    hint: 'Survival first — 10 losses lagatar aa sakte hain',
    options: [
      { id: '0.5', label: '0.5% — ultra safe', sub: 'slow but bulletproof' },
      { id: '1', label: '1% — standard desk risk', sub: '20 losses tak survive' },
      { id: '3', label: '3% — aggressive', sub: 'drawdown fast' },
      { id: '10', label: '10% — all-in feel', sub: '10 losses = account gone' },
    ],
    bestId: '1',
    why: '1% risk par 10 lagatar losses = ~10% drawdown, recover ho jata hai. 10% par account khatam.',
  },
  {
    key: 'context',
    topic: 'Price Action',
    question: 'Participation kaisi hai is push me?',
    hint: `Volume ${a.volumePush === 'high' ? 'average se upar' : a.volumePush === 'low' ? 'average se neeche' : 'average ke aas paas'}`,
    options: [
      { id: 'high', label: 'Strong — volume expand hua', sub: 'real participation' },
      { id: 'low', label: 'Weak — volume dry', sub: 'move par trust kam' },
      { id: 'normal', label: 'Normal — kuch khaas nahi', sub: 'neutral' },
    ],
    bestId: a.volumePush,
    why: 'Bina participation ke breakout aksar wapas aata hai. Volume expansion = move me real orders.',
  },
  {
    key: 'context',
    topic: 'Trading Psychology',
    question: 'Setup B-grade lage to sahi kaam kya hai?',
    hint: 'No-trade bhi ek trade hai',
    options: [
      { id: 'skip', label: 'Skip — A+ ka wait', sub: 'capital bachao' },
      { id: 'half', label: 'Aadha size le lo', sub: 'compromise' },
      { id: 'full', label: 'Full size, feel achha hai', sub: 'FOMO' },
    ],
    bestId: 'skip',
    why: 'Har candle par trade nahi hoti. B-grade setups hi long-run me account slow-bleed karte hain.',
  },
  {
    key: 'context',
    topic: 'SMC',
    question: 'Is tape me FVG / Order Block ka role kya hai?',
    hint: a.fvg
      ? `FVG ${a.fvg.dir} unfilled`
      : a.ob
        ? `${a.ob.dir === 'long' ? 'Demand' : 'Supply'} OB paas me`
        : 'Koi clear imbalance nahi dikha',
    options: [
      { id: 'magnet', label: 'Magnet — price fill ke liye laut sakta hai', sub: 'imbalance fill' },
      { id: 'ignore', label: 'Ignore — structure hi decide kare', sub: 'sirf HH/HL' },
      { id: 'chase', label: 'Abhi chase through the gap', sub: 'extended entry' },
    ],
    bestId: a.fvg || a.ob ? 'magnet' : 'ignore',
    why: 'FVG/OB location + stop ka foundation hote hain — chase se RR kharab hota hai.',
  },
  {
    key: 'context',
    topic: 'ICT',
    question: 'Agla draw of liquidity kaha pehle likely hai?',
    hint: a.equalHighs
      ? 'Equal highs upar'
      : a.equalLows
        ? 'Equal lows neeche'
        : a.bias === 'long'
          ? 'Bias long — buy-side pool'
          : 'Bias short — sell-side pool',
    options: [
      { id: 'bsl', label: 'Buy-side liquidity (above highs)', sub: 'stops of shorts' },
      { id: 'ssl', label: 'Sell-side liquidity (below lows)', sub: 'stops of longs' },
      { id: 'mid', label: 'EQ pehle, phir decide', sub: 'range mid' },
    ],
    bestId: a.equalHighs ? 'bsl' : a.equalLows ? 'ssl' : a.bias === 'long' ? 'bsl' : 'ssl',
    why: 'Price liquidity pool se pool chalta hai. Draw pehle clear ho, tab target banta hai.',
  },
];

function buildSteps(a: TapeAnalysis, entry: number): PlanStep[] {
  const long = a.bias === 'long';
  const stopL = a.structuralStopLong;
  const stopS = a.structuralStopShort;
  const risk = Math.max(1e-6, long ? entry - stopL : stopS - entry);

  const breakingOut =
    (a.displacement || a.volumePush === 'high') &&
    (long ? entry >= a.rangeHi - a.atr * 0.4 : entry <= a.rangeLo + a.atr * 0.4);
  const bestEntry =
    breakingOut
      ? 'breakout'
      : a.zone === (long ? 'premium' : 'discount')
        ? 'pullback'
        : (long && a.sweptLow) || (!long && a.sweptHigh)
          ? 'sweep'
          : 'pullback';

  const zoneNear =
    (a.ob && Math.abs((a.ob.top + a.ob.bottom) / 2 - entry) < a.atr * 1.5) ||
    (a.fvg && Math.abs((a.fvg.top + a.fvg.bottom) / 2 - entry) < a.atr * 1.5);
  const bestStop = zoneNear ? 'zone' : 'structure';

  // Range me target chhota rakhna hi honest hai — 1:5 sirf trending tape par realistic hai.
  const rrCap = a.trend === 'range' ? 2 : 5;
  const roomOpts = [1, 2, 3, 5];
  const bestRrNum = roomOpts.filter((r) => r <= Math.min(a.roomR, rrCap)).at(-1) ?? 1;

  const bestManage =
    a.trend !== 'range' && bestRrNum >= 3 ? 'trail' : bestRrNum >= 2 ? 'partial' : 'fixed';

  const steps: PlanStep[] = [
    {
      key: 'bias',
      topic: 'Structure + Liquidity',
      question: 'Is freeze par tumhara directional bias kya hai?',
      hint: `${a.trend === 'bull' ? 'HH/HL structure' : a.trend === 'bear' ? 'LH/LL structure' : 'Range structure'} · price ${a.zone}`,
      options: [
        { id: 'long', label: 'LONG', sub: 'buyers ka draw' },
        { id: 'short', label: 'SHORT', sub: 'sellers ka draw' },
        { id: 'skip', label: 'NO TRADE', sub: 'edge saaf nahi' },
      ],
      bestId: a.biasScore < 0.5 ? 'skip' : a.bias,
      why:
        a.biasScore < 0.5
          ? 'Signals mixed the — is tarah ke tape par best trade "no trade" hoti hai.'
          : `Bias ${a.bias.toUpperCase()} kyunki ${a.biasWhy}.`,
    },
    {
      key: 'entry',
      topic: 'Entry Model',
      question: 'Entry kaise loge?',
      hint:
        a.zone === 'premium'
          ? 'Price premium me hai — chase mehnga padta hai'
          : a.zone === 'discount'
            ? 'Price discount me hai'
            : 'Price equilibrium ke paas',
      options: [
        { id: 'market', label: 'Abhi market par', sub: 'turant fill, worst price' },
        {
          id: 'pullback',
          label: 'Zone me pullback ka wait',
          sub: a.ob ? 'OB / FVG retest' : 'value par limit',
        },
        { id: 'sweep', label: 'Liquidity sweep + reclaim', sub: 'stop hunt ke baad entry' },
        { id: 'breakout', label: 'Breakout candle close', sub: 'confirmation ke saath' },
      ],
      bestId: bestEntry,
      why:
        bestEntry === 'pullback'
          ? 'Extended price ko chase karne se stop door aur RR kharab hota hai — pullback me risk chhota rehta hai.'
          : bestEntry === 'sweep'
            ? 'Sweep ke baad reclaim sabse clean entry deta hai: stop sweep ke us paar, target opposite pool.'
            : 'Displacement + volume ke baad breakout close par entry chalti hai — momentum saath hota hai.',
    },
    {
      key: 'stop',
      topic: 'Invalidation',
      question: 'Stop loss kaha rakhoge?',
      hint: `ATR ≈ ${a.atr.toFixed(a.atr < 5 ? 2 : 1)} — noise isse chhota nahi hota`,
      options: [
        { id: 'tight', label: 'Bilkul tight — 0.4× ATR', sub: 'bada size, noise me kat jayega' },
        {
          id: 'structure',
          label: long ? 'Swing low ke neeche' : 'Swing high ke upar',
          sub: 'structure invalidation + buffer',
        },
        {
          id: 'zone',
          label: a.ob ? 'OB / zone ke us paar' : 'Demand-supply zone ke paar',
          sub: 'setup galat tabhi hoga',
        },
        { id: 'wide', label: 'Kaafi wide — 2.5× ATR', sub: 'safe lagta hai, RR marta hai' },
      ],
      bestId: bestStop,
      why: 'Stop wahi jaha idea galat sabit hota hai — na noise ke andar, na itna wide ki RR hi na bane.',
    },
    {
      key: 'rr',
      topic: 'Risk : Reward',
      question: 'Target RR kya rakhoge?',
      hint: `Agla ${long ? 'buy-side' : 'sell-side'} pool ≈ ${a.roomR.toFixed(1)}R door hai (risk ${risk.toFixed(risk < 5 ? 2 : 1)})`,
      options: [
        { id: '1', label: '1 : 1', sub: 'high hit-rate, patla edge' },
        { id: '2', label: '1 : 2', sub: 'desk standard' },
        { id: '3', label: '1 : 3', sub: 'trend chalna chahiye' },
        { id: '5', label: '1 : 5', sub: 'lottery — room chahiye' },
      ],
      bestId: String(bestRrNum),
      why: `Target liquidity tak hi realistic hai. Yaha room ≈ ${a.roomR.toFixed(1)}R, isliye 1:${bestRrNum} honest hai — usse aage target sirf hope hai.`,
    },
    {
      key: 'manage',
      topic: 'Trade Management',
      question: 'Trade chalne ke baad manage kaise karoge?',
      hint: a.trend === 'range' ? 'Range me trail jaldi kat-ta hai' : 'Trend me trail chalta hai',
      options: [
        { id: 'fixed', label: 'Fixed TP — chhedna nahi', sub: 'plan ke hisaab se exit' },
        { id: 'partial', label: '1R par half + SL to BE', sub: 'risk free karo' },
        { id: 'trail', label: 'Swing ke peeche trail', sub: 'runner banao' },
        { id: 'earlybe', label: 'Turant BE par SL', sub: 'sabse common galti' },
      ],
      bestId: bestManage,
      why:
        bestManage === 'trail'
          ? 'Room bada hai — swing ke peeche trail karke runner nikalta hai, fixed TP jaldi kaat deta.'
          : bestManage === 'partial'
            ? '1R par half booking + BE trade ko risk-free karta hai, baaki target tak chalti hai.'
            : 'Chhote room me fixed TP best hai — over-management aur trailing yaha sirf exit jaldi karati hai.',
    },
  ];

  const ctx = CONTEXT_STEPS(a);
  steps.push(ctx[Math.floor(Math.random() * ctx.length)]);
  return steps;
}

/* ------------------------------------------------------------------ */
/* Scenario                                                            */
/* ------------------------------------------------------------------ */

function buildScenario(
  bars: EmpireBar[],
  symbol: string,
  interval: string,
  source: EmpireScenario['source'],
): EmpireScenario {
  const need = VISIBLE_LEN + FUTURE_LEN;
  const src = bars.length >= need ? bars : [...synthBars(need - bars.length), ...bars];
  const maxStart = Math.max(0, src.length - need);
  const start = Math.floor(Math.random() * (maxStart + 1));
  const decisionIdx = start + VISIBLE_LEN - 1;
  const visible = src.slice(start, decisionIdx + 1);
  const future = src.slice(decisionIdx + 1, decisionIdx + 1 + FUTURE_LEN);
  const entry = visible.at(-1)?.close ?? 0;
  const a = analyseTape(visible);

  const hints: string[] = [
    a.trend === 'bull'
      ? 'Structure: higher highs / higher lows'
      : a.trend === 'bear'
        ? 'Structure: lower highs / lower lows'
        : 'Structure: range — koi clean trend nahi',
    a.zone === 'premium'
      ? 'Location: premium (range ke upper half me)'
      : a.zone === 'discount'
        ? 'Location: discount (range ke lower half me)'
        : 'Location: equilibrium ke paas',
    a.sweptLow
      ? 'Sell-side liquidity sweep hua, price wapas andar'
      : a.sweptHigh
        ? 'Buy-side liquidity sweep hua, price wapas andar'
        : a.equalHighs
          ? 'Equal highs — buy-side pool upar'
          : a.equalLows
            ? 'Equal lows — sell-side pool neeche'
            : 'Koi fresh sweep nahi',
    a.pattern,
  ];
  if (a.fvg) hints.push(`FVG ${a.fvg.dir === 'long' ? 'bullish' : 'bearish'} unfilled`);
  else if (a.ob) hints.push(`${a.ob.dir === 'long' ? 'Demand' : 'Supply'} order block paas me`);

  const levels: EmpireScenario['levels'] = [
    { price: a.bsl, label: 'BSL / buy-side pool', tone: 'bear' },
    { price: a.eq, label: 'EQ 50%', tone: 'neutral' },
    { price: a.ssl, label: 'SSL / sell-side pool', tone: 'bull' },
  ];
  if (a.ob) {
    levels.push({
      price: (a.ob.top + a.ob.bottom) / 2,
      label: a.ob.dir === 'long' ? 'Demand OB' : 'Supply OB',
      tone: a.ob.dir === 'long' ? 'bull' : 'bear',
    });
  }

  return {
    id: `sc-${symbol}-${interval}-${decisionIdx}-${Date.now()}`,
    symbol,
    interval,
    source,
    visible,
    future: future.length >= 8 ? future : synthBars(FUTURE_LEN),
    entry,
    hints: hints.slice(0, 5),
    levels,
    analysis: a,
    steps: buildSteps(a, entry),
  };
}

export async function loadEmpireScenario(detective: DetectiveCard | null): Promise<EmpireScenario> {
  const useDetective = detective?.symbol && Math.random() < 0.5;
  const symbol = (useDetective ? detective?.symbol : pick(TAPE_SYMBOLS)) || 'NIFTY';
  const interval = useDetective ? normalizeInterval(detective?.interval) : pick(TF_POOL);

  const attempts: Array<{ s: string; i: string }> = [
    { s: symbol, i: interval },
    { s: symbol, i: '15m' },
    { s: 'NIFTY', i: '15m' },
    { s: 'BTCUSDT', i: '1h' },
  ];

  for (const at of attempts) {
    try {
      const res = await fetchMarketOhlc(at.s, at.i, rangeFor(at.i));
      const bars = (res?.bars ?? []).filter(
        (b) => Number.isFinite(b.close) && Number.isFinite(b.high) && Number.isFinite(b.low),
      ) as EmpireBar[];
      if (bars.length >= VISIBLE_LEN + FUTURE_LEN) {
        return buildScenario(bars, at.s, at.i, 'tradingview');
      }
    } catch {
      /* try next */
    }
  }
  return buildScenario(synthBars(160), symbol, interval, 'sim');
}

/* ------------------------------------------------------------------ */
/* Plan + simulation                                                   */
/* ------------------------------------------------------------------ */

export function buildPlan(scenario: EmpireScenario, answers: PlanAnswers): TradePlan {
  const a = scenario.analysis;
  const side: EmpireSide = answers.bias === 'short' ? 'short' : 'long';
  const long = side === 'long';
  const base = scenario.entry;

  let entryPrice = base;
  const model = answers.entry ?? 'market';
  if (model === 'pullback') {
    const zoneMid = a.ob ? (a.ob.top + a.ob.bottom) / 2 : a.fvg ? (a.fvg.top + a.fvg.bottom) / 2 : null;
    const fallback = long ? base - a.atr * 0.18 : base + a.atr * 0.18;
    const useZone =
      zoneMid != null &&
      (long ? zoneMid < base : zoneMid > base) &&
      Math.abs(zoneMid - base) < a.atr * 0.6;
    entryPrice = useZone ? (zoneMid as number) : fallback;
  } else if (model === 'sweep') {
    entryPrice = long ? a.sweepLong : a.sweepShort;
  } else if (model === 'breakout') {
    entryPrice = long ? Math.max(a.swingHigh, a.rangeHi) : Math.min(a.swingLow, a.rangeLo);
  }

  const stopModel = answers.stop ?? 'structure';
  let stopPrice: number;
  if (stopModel === 'tight') stopPrice = long ? entryPrice - a.atr * 0.4 : entryPrice + a.atr * 0.4;
  else if (stopModel === 'wide') stopPrice = long ? entryPrice - a.atr * 2.5 : entryPrice + a.atr * 2.5;
  else if (stopModel === 'zone') {
    const z = a.ob ?? a.fvg;
    stopPrice = z
      ? long
        ? Math.min(z.bottom - a.atr * 0.2, entryPrice - a.atr * 0.5)
        : Math.max(z.top + a.atr * 0.2, entryPrice + a.atr * 0.5)
      : long
        ? a.structuralStopLong
        : a.structuralStopShort;
  } else {
    stopPrice = long
      ? Math.min(a.structuralStopLong, entryPrice - a.atr * 0.4)
      : Math.max(a.structuralStopShort, entryPrice + a.atr * 0.4);
  }

  const risk = Math.max(a.atr * 0.15, Math.abs(entryPrice - stopPrice));
  const rr = Number(answers.rr ?? '2') || 2;
  const targetPrice = long ? entryPrice + risk * rr : entryPrice - risk * rr;

  return {
    side,
    entryPrice,
    stopPrice: long ? entryPrice - risk : entryPrice + risk,
    targetPrice,
    risk,
    rr,
    entryModel: model,
    manageModel: answers.manage ?? 'fixed',
  };
}

/** Player dragged Entry / SL / Target on the chart — RR derived from geometry. */
export function buildPlanFromDraft(
  scenario: EmpireScenario,
  side: EmpireSide,
  draft: { entry: number; stop: number; target: number },
  manage = 'fixed',
): TradePlan {
  const long = side === 'long';
  let entryPrice = draft.entry;
  let stopPrice = draft.stop;
  let targetPrice = draft.target;

  // Normalize: stop must be on the risk side, target on the reward side.
  if (long) {
    if (stopPrice >= entryPrice) stopPrice = entryPrice - Math.max(scenario.analysis.atr * 0.4, entryPrice * 0.0005);
    if (targetPrice <= entryPrice) targetPrice = entryPrice + Math.abs(entryPrice - stopPrice) * 2;
  } else {
    if (stopPrice <= entryPrice) stopPrice = entryPrice + Math.max(scenario.analysis.atr * 0.4, entryPrice * 0.0005);
    if (targetPrice >= entryPrice) targetPrice = entryPrice - Math.abs(entryPrice - stopPrice) * 2;
  }

  const risk = Math.max(1e-9, Math.abs(entryPrice - stopPrice));
  const reward = Math.abs(targetPrice - entryPrice);
  const rr = Math.round((reward / risk) * 10) / 10;

  return {
    side,
    entryPrice,
    stopPrice,
    targetPrice,
    risk,
    rr: Math.max(0.5, rr),
    entryModel: 'market',
    manageModel: manage,
  };
}

/** Seed default draft lines from analysis (structure stop + ~2R target). */
export function defaultDraftLevels(scenario: EmpireScenario, side: EmpireSide) {
  const long = side === 'long';
  const entry = scenario.entry;
  const a = scenario.analysis;
  const stop = long
    ? Math.min(a.structuralStopLong, entry - a.atr * 0.5)
    : Math.max(a.structuralStopShort, entry + a.atr * 0.5);
  const risk = Math.abs(entry - stop);
  const target = long ? entry + risk * 2 : entry - risk * 2;
  return { entry, stop, target };
}

type SimCore = {
  filled: boolean;
  fillIndex: number;
  exit: number;
  exitIndex: number;
  exitReason: EmpireResolve['exitReason'];
  rMultiple: number;
  mfeR: number;
  maeR: number;
};

function simulate(scenario: EmpireScenario, plan: TradePlan): SimCore {
  const bars = scenario.future;
  const long = plan.side === 'long';
  const dir = long ? 1 : -1;
  const a = scenario.analysis;

  // Leave room after the fill so a filled trade still gets bars to play out.
  const fillWindow = Math.max(8, bars.length - 8);

  let fillIndex = -1;
  if (plan.entryModel === 'market') {
    fillIndex = 0;
  } else if (plan.entryModel === 'pullback') {
    for (let i = 0; i < fillWindow; i += 1) {
      if (long ? bars[i].low <= plan.entryPrice : bars[i].high >= plan.entryPrice) {
        fillIndex = i;
        break;
      }
    }
  } else if (plan.entryModel === 'sweep') {
    // Sweep the pool first, then take the reclaim close — same bar or a later one.
    const pool = long ? a.sweepLong : a.sweepShort;
    let swept = false;
    for (let i = 0; i < fillWindow; i += 1) {
      if (!swept && (long ? bars[i].low <= pool : bars[i].high >= pool)) swept = true;
      if (swept && (long ? bars[i].close > pool : bars[i].close < pool)) {
        fillIndex = i;
        break;
      }
    }
  } else if (plan.entryModel === 'breakout') {
    for (let i = 0; i < fillWindow; i += 1) {
      if (long ? bars[i].close > plan.entryPrice : bars[i].close < plan.entryPrice) {
        fillIndex = i;
        break;
      }
    }
  }

  if (fillIndex < 0) {
    return {
      filled: false,
      fillIndex: -1,
      exit: plan.entryPrice,
      exitIndex: bars.length - 1,
      exitReason: 'nofill',
      rMultiple: 0,
      mfeR: 0,
      maeR: 0,
    };
  }

  // Sweep / breakout fills happen at the bar close, not the planned level.
  const entryPrice =
    plan.entryModel === 'market'
      ? bars[0].open
      : plan.entryModel === 'pullback'
        ? plan.entryPrice
        : bars[fillIndex].close;
  const risk = plan.risk;
  const target = long ? entryPrice + risk * plan.rr : entryPrice - risk * plan.rr;
  let stop = long ? entryPrice - risk : entryPrice + risk;

  let booked = 0;
  let openSize = 1;
  let mfeR = 0;
  let maeR = 0;

  for (let i = fillIndex; i < bars.length; i += 1) {
    const b = bars[i];
    const favor = ((long ? b.high : b.low) - entryPrice) * dir;
    const against = ((long ? b.low : b.high) - entryPrice) * dir;
    mfeR = Math.max(mfeR, favor / risk);
    maeR = Math.min(maeR, against / risk);

    const stopHit = long ? b.low <= stop : b.high >= stop;
    const targetHit = long ? b.high >= target : b.low <= target;

    if (stopHit) {
      const r = ((stop - entryPrice) * dir) / risk;
      const total = booked + r * openSize;
      const atBe = Math.abs(stop - entryPrice) < risk * 0.05;
      return {
        filled: true,
        fillIndex,
        exit: stop,
        exitIndex: i,
        exitReason: atBe ? 'breakeven' : stop !== (long ? entryPrice - risk : entryPrice + risk) ? 'trail' : 'stop',
        rMultiple: total,
        mfeR,
        maeR,
      };
    }
    if (targetHit) {
      const total = booked + plan.rr * openSize;
      return {
        filled: true,
        fillIndex,
        exit: target,
        exitIndex: i,
        exitReason: 'target',
        rMultiple: total,
        mfeR,
        maeR,
      };
    }

    const runR = ((b.close - entryPrice) * dir) / risk;
    if (plan.manageModel === 'partial' && openSize === 1 && mfeR >= 1) {
      booked += 0.5;
      openSize = 0.5;
      stop = entryPrice;
    } else if (plan.manageModel === 'earlybe' && mfeR >= 0.3) {
      stop = entryPrice;
    } else if (plan.manageModel === 'trail' && runR >= 1) {
      const trail = long ? b.low - a.atr * 0.25 : b.high + a.atr * 0.25;
      stop = long ? Math.max(stop, trail) : Math.min(stop, trail);
    }
  }

  const last = bars.at(-1) as EmpireBar;
  const r = ((last.close - entryPrice) * dir) / risk;
  return {
    filled: true,
    fillIndex,
    exit: last.close,
    exitIndex: bars.length - 1,
    exitReason: 'timeout',
    rMultiple: booked + r * openSize,
    mfeR,
    maeR,
  };
}

const OPTION_LABEL = (step: PlanStep, id: string | undefined): string =>
  step.options.find((o) => o.id === id)?.label ?? '—';

function riskPctOf(answers: PlanAnswers, steps: PlanStep[]): number {
  const riskStep = steps.find((s) => s.key === 'context' && s.topic === 'Risk Management');
  if (!riskStep) return 1;
  const v = Number(answers.context);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

export function resolveEmpireRound(
  scenario: EmpireScenario,
  answers: PlanAnswers,
  stake: number,
  streak = 0,
  planOverride?: TradePlan | null,
): EmpireResolve {
  const plan = planOverride ?? buildPlan(scenario, answers);
  const sim = simulate(scenario, plan);

  const ideal = buildPlan(scenario, {
    ...answers,
    bias: answers.bias === 'skip' ? answers.bias : scenario.steps[0]?.bestId === 'skip' ? 'skip' : scenario.analysis.bias,
    entry: scenario.steps.find((s) => s.key === 'entry')?.bestId,
    stop: scenario.steps.find((s) => s.key === 'stop')?.bestId,
    rr: scenario.steps.find((s) => s.key === 'rr')?.bestId,
    manage: scenario.steps.find((s) => s.key === 'manage')?.bestId ?? answers.manage,
  });

  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
  const atr = scenario.analysis.atr;

  const reviews: StepReview[] = scenario.steps.map((s) => {
    if (planOverride && (s.key === 'entry' || s.key === 'stop' || s.key === 'rr')) {
      let correct = false;
      let picked = '—';
      if (s.key === 'entry') {
        correct = near(plan.entryPrice, ideal.entryPrice, atr * 0.35);
        picked = `ENTRY ${plan.entryPrice.toFixed(2)}`;
      } else if (s.key === 'stop') {
        correct = near(plan.stopPrice, ideal.stopPrice, atr * 0.45);
        picked = `SL ${plan.stopPrice.toFixed(2)}`;
      } else {
        correct = Math.abs(plan.rr - ideal.rr) <= 0.6;
        picked = `1:${plan.rr}`;
      }
      return {
        key: s.key,
        topic: s.topic,
        question: s.question,
        picked,
        best: OPTION_LABEL(s, s.bestId),
        correct,
        why: s.why,
      };
    }
    return {
      key: s.key,
      topic: s.topic,
      question: s.question,
      picked: OPTION_LABEL(s, answers[s.key]),
      best: OPTION_LABEL(s, s.bestId),
      correct: answers[s.key] === s.bestId,
      why: s.why,
    };
  });
  const edgePct = Math.round((reviews.filter((r) => r.correct).length / reviews.length) * 100);

  const riskPct = riskPctOf(answers, scenario.steps);
  const riskAmount = Math.round(stake * Math.min(5, Math.max(0.5, riskPct)));
  const rawPnl = Math.round(riskAmount * sim.rMultiple);
  const edge = edgePct / 100;

  // Outcome is the tape's call, but process is what the desk pays for: a clean checklist
  // boosts winners and the desk absorbs part of a loss taken on a correct process.
  const streakMult = 1 + Math.min(0.75, Math.max(0, streak) * 0.15);
  let pnl: number;
  if (answers.bias === 'skip') {
    pnl = scenario.steps[0].bestId === 'skip' ? Math.round(stake * (0.15 + edge * 0.15)) : 0;
  } else if (!sim.filled) {
    pnl = Math.round(stake * 0.2 * edge);
  } else if (rawPnl >= 0) {
    pnl = Math.round(rawPnl * (1 + edge * 0.6) * streakMult);
  } else {
    pnl = Math.round(rawPnl * (1 - edge * 0.45));
  }
  const processBonus = Math.max(0, pnl - (answers.bias === 'skip' || !sim.filled ? 0 : rawPnl));

  const grade: EmpireResolve['grade'] =
    edgePct >= 95 ? 'S' : edgePct >= 80 ? 'A' : edgePct >= 60 ? 'B' : edgePct >= 40 ? 'C' : 'D';

  const rTxt = `${sim.rMultiple >= 0 ? '+' : ''}${sim.rMultiple.toFixed(2)}R`;
  let headline: string;
  let teach: string;

  if (answers.bias === 'skip') {
    headline = 'NO TRADE — capital bacha';
    teach =
      scenario.steps[0].bestId === 'skip'
        ? 'Sahi call. Yaha signals mixed the, skip karna hi edge tha.'
        : `Setup tha (${scenario.analysis.biasWhy}) — over-filtering se A+ trades bhi chhoot jate hain.`;
  } else if (!sim.filled) {
    headline = 'NO FILL — risk liya hi nahi';
    teach =
      'Tumhara trigger kabhi hit nahi hua, isliye paisa risk par gaya hi nahi. Miss karna loss se sasta hai — par agar baar baar miss ho raha hai to entry model tape ke hisaab se badalna padta hai.';
  } else if (sim.exitReason === 'target') {
    headline = `TARGET HIT · ${rTxt}`;
    teach = `Plan ne 1:${plan.rr} deliver kiya. Target liquidity par tha, isliye price wahan tak pahucha.`;
  } else if (sim.exitReason === 'trail') {
    headline = `TRAIL EXIT · ${rTxt}`;
    teach = `Trail ne ${sim.mfeR.toFixed(1)}R ka move partly lock kiya. Trend me ye theek hai, chop me jaldi kat-ta hai.`;
  } else if (sim.exitReason === 'breakeven') {
    headline = 'BREAKEVEN — bach gaye';
    teach =
      sim.mfeR >= plan.rr * 0.8
        ? `Trade ${sim.mfeR.toFixed(1)}R gaya tha phir BE par nikal gaya — BE bahut jaldi lagaya.`
        : 'SL BE par aa gaya tha, isliye loss nahi hua. Capital safe.';
  } else if (sim.exitReason === 'stop') {
    headline = `STOP HIT · ${rTxt}`;
    teach =
      sim.mfeR >= 1
        ? `Trade pehle ${sim.mfeR.toFixed(1)}R profit me tha phir full stop laga — management (partial/BE) hota to result alag hota.`
        : `Idea invalid hua. Stop ${answers.stop === 'tight' ? 'noise ke andar tha' : 'structure par tha'} — 1R loss plan ka hissa hai.`;
  } else {
    headline = `TIME EXIT · ${rTxt}`;
    teach = `Na target na stop — tape range me atka. MFE ${sim.mfeR.toFixed(1)}R, MAE ${sim.maeR.toFixed(1)}R.`;
  }

  const wrong = reviews.filter((r) => !r.correct);
  if (wrong.length) teach += ` Checklist gap: ${wrong[0].topic}.`;

  return {
    plan,
    filled: sim.filled,
    fillIndex: sim.fillIndex,
    exit: sim.exit,
    exitIndex: sim.exitIndex,
    exitReason: sim.exitReason,
    rMultiple: sim.rMultiple,
    mfeR: sim.mfeR,
    maeR: sim.maeR,
    riskAmount,
    pnl,
    processBonus,
    streakMult,
    won: pnl > 0,
    edgePct,
    grade,
    reviews,
    teach,
    headline,
  };
}
