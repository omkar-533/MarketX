/**
 * Twelve specialized Wolf Opportunity scanners.
 * Each returns null when conditions fail or required data is missing — never invents hits.
 */
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
};

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
    detectedAt: Date.now(),
    dataMode: ctx.dataMode,
    ...partial,
  };
}

function sumBreakdown(b: ScoreBreakdown): number {
  return clampScore(Object.values(b).reduce((a, n) => a + n, 0));
}

/** 01 — MOMENTUM SURGE */
export function scanMomentumSurge(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const rvol = f.volume.ratio;
  const rsi = f.tech.rsi14 ?? 50;
  const expanding = f.atrCompression != null && f.atrCompression >= 1.15;
  const nearBreak =
    f.high20 != null && f.tech.last >= f.high20 * 0.995 && f.tech.last <= f.high20 * 1.02;

  if (rvol < 1.6 && Math.abs(f.changePercent) < 0.8) return null;
  if (rvol < 1.35) return null;

  const breakdown: ScoreBreakdown = {
    momentum: clampScore(Math.min(25, Math.abs(f.changePercent) * 8 + (rsi > 55 || rsi < 45 ? 8 : 0)), 25),
    volume: clampScore(Math.min(25, (rvol - 1) * 12), 25),
    expansion: expanding ? 18 : f.rangePct > 1.2 ? 12 : 6,
    breakoutProximity: nearBreak ? 20 : 8,
    confirmation: f.volume.state === 'UNUSUAL' ? 12 : f.volume.state === 'EXPANDING' ? 8 : 4,
  };
  const score = sumBreakdown(breakdown);
  if (score < 55) return null;

  const bullish = f.changePercent >= 0;
  const evidence: EvidenceItem[] = [
    { label: `RVOL ${rvol.toFixed(1)}×`, ok: rvol >= 1.6 },
    { label: `Price ${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%`, ok: Math.abs(f.changePercent) >= 0.8 },
    { label: expanding ? 'ATR expanding' : 'ATR steady', ok: expanding },
    { label: nearBreak ? 'Near recent high/low' : 'Inside recent range', ok: nearBreak },
  ];

  return baseHit('momentum_surge', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: score >= 80 ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: score >= 85 ? '🔥 ACTIVE' : 'WATCH',
    why: `Price expansion with volume ${rvol.toFixed(1)}× vs recent baseline.`,
    keyLevel: bullish ? f.high20 : f.low20,
    trigger: bullish && f.high20 ? Number((f.high20 * 1.002).toFixed(2)) : f.low20 ? Number((f.low20 * 0.998).toFixed(2)) : null,
    invalidation: bullish
      ? `Close back below ₹${(f.tech.sma20 ?? f.tech.last * 0.99).toFixed(2)}`
      : `Close back above ₹${(f.tech.sma20 ?? f.tech.last * 1.01).toFixed(2)}`,
    confirmationNeeded: 'Sustained follow-through on next bars with volume holding.',
    evidence,
  });
}

/** 02 — FLOW SHIFT — price×volume positioning (OI feed offline → participation proxy) */
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
  if (score < 55) return null;

  return baseHit('flow_shift', ctx, {
    direction,
    status: score >= 78 ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel,
    why: `${stateLabel}: price ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% with RVOL ${rvol.toFixed(1)}× (OI feed offline — participation proxy).`,
    keyLevel: direction === 'bullish' ? f.tech.ema21 : f.tech.ema21,
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

/** 03 — LIQUIDITY HUNT */
export function scanLiquidityHunt(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const liq = f.liquidity;
  const sweep =
    liq.type === 'LIQUIDITY_SWEEP' ||
    liq.type === 'EQUAL_HIGHS' ||
    liq.type === 'EQUAL_LOWS' ||
    liq.type === 'RECLAIM';
  if (!sweep && liq.type === 'NONE') return null;

  const buySide =
    liq.type === 'EQUAL_LOWS' ||
    (liq.type === 'LIQUIDITY_SWEEP' && f.changePercent >= 0) ||
    liq.type === 'RECLAIM';
  const confirmed = Boolean(liq.confirmed);

  const breakdown: ScoreBreakdown = {
    liquidity: liq.type === 'LIQUIDITY_SWEEP' ? 28 : 18,
    confirmation: confirmed ? 22 : 10,
    structure: clampScore(f.structure.strength / 5, 20),
    volume: f.volume.ratio >= 1.3 ? 15 : 8,
    distance: 10,
  };
  const score = sumBreakdown(breakdown);
  if (score < 50) return null;

  let stateLabel = 'LIQUIDITY RESTING';
  if (liq.type === 'LIQUIDITY_SWEEP' && confirmed) stateLabel = buySide ? 'BUY-SIDE SWEEP' : 'SELL-SIDE SWEEP';
  else if (liq.type === 'RECLAIM') stateLabel = 'SWEEP + RECLAIM';
  else if (liq.type === 'EQUAL_HIGHS') stateLabel = 'EQUAL HIGHS';
  else if (liq.type === 'EQUAL_LOWS') stateLabel = 'EQUAL LOWS';

  const level = liq.level ?? (buySide ? f.swingLow : f.swingHigh);

  return baseHit('liquidity_hunt', ctx, {
    direction: buySide ? 'bullish' : 'bearish',
    status: confirmed ? 'CONFIRM' : 'WATCH',
    score,
    breakdown,
    stateLabel,
    why: liq.note || 'Liquidity clustered near a recent swing / session extreme.',
    keyLevel: level,
    trigger: level,
    invalidation: level
      ? `Acceptance beyond ₹${level.toFixed(2)} without reclaim`
      : 'Acceptance beyond swept level',
    confirmationNeeded: confirmed
      ? 'Hold reclaim; watch for continuation.'
      : 'Wait for reclaim / rejection confirmation.',
    evidence: [
      { label: stateLabel, ok: true },
      { label: confirmed ? 'Reclaim confirmed' : 'Confirmation pending', ok: confirmed },
      { label: `Vol ×${f.volume.ratio.toFixed(1)}`, ok: f.volume.ratio >= 1.2 },
    ],
  });
}

/** 04 — COMPRESSION BREAK */
export function scanCompressionBreak(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const compressing = (f.atrCompression != null && f.atrCompression <= 0.85) || f.rangePct < 1.1;
  const volQuiet = f.volume.ratio <= 0.9;
  const breaking =
    (f.high20 != null && f.tech.last > f.high20) || (f.low20 != null && f.tech.last < f.low20);

  if (!compressing && !breaking) return null;

  let stateLabel = 'COMPRESSING';
  if (breaking && f.volume.ratio >= 1.4) stateLabel = 'BREAKOUT ACTIVE';
  else if (breaking) stateLabel = 'BREAKOUT WATCH';
  else if (compressing) stateLabel = 'COMPRESSING';

  const breakdown: ScoreBreakdown = {
    compression: compressing ? 28 : 10,
    volumeContraction: volQuiet ? 18 : 8,
    breakout: breaking ? 25 : 10,
    confirmation: breaking && f.volume.ratio >= 1.4 ? 18 : 8,
    proximity: 10,
  };
  const score = sumBreakdown(breakdown);
  if (score < 52) return null;

  const bullish = breaking ? f.tech.last >= (f.high20 ?? f.tech.last) : f.tech.trend !== 'down';

  return baseHit('compression_break', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: stateLabel === 'BREAKOUT ACTIVE' ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel,
    why: compressing
      ? 'Range/ATR compressed — expansion risk elevated.'
      : 'Price left compression zone; volume decides quality.',
    keyLevel: f.high20 ?? f.dayHigh,
    trigger: f.high20,
    invalidation: `Return inside prior range below ₹${(f.tech.sma20 ?? f.tech.last).toFixed(2)}`,
    confirmationNeeded:
      stateLabel === 'BREAKOUT ACTIVE'
        ? 'Hold outside range on pullback.'
        : 'Wait for range break with volume.',
    evidence: [
      { label: compressing ? 'ATR/range compressed' : 'Not compressed', ok: compressing },
      { label: volQuiet ? 'Volume quiet' : 'Volume active', ok: volQuiet || breaking },
      { label: breaking ? 'Outside range' : 'Inside range', ok: breaking },
    ],
  });
}

/** 05 — MOMENTUM FADE (watch, not auto-reversal) */
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
    trigger: fadeBull ? f.tech.sma20 : f.tech.sma20,
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

/** 06 — BREAKOUT RADAR */
export function scanBreakoutRadar(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const break10 = f.high10 != null && f.tech.last > f.high10;
  const break20 = f.high20 != null && f.tech.last > f.high20;
  const breakLow10 = f.low10 != null && f.tech.last < f.low10;
  const breakLow20 = f.low20 != null && f.tech.last < f.low20;
  const up = break10 || break20;
  const down = breakLow10 || breakLow20;
  if (!up && !down) return null;

  const level = up ? (break20 ? f.high20 : f.high10) : breakLow20 ? f.low20 : f.low10;
  const volOk = f.volume.ratio >= 1.35;
  const breakdown: ScoreBreakdown = {
    breakout: break20 || breakLow20 ? 30 : 22,
    volume: volOk ? 25 : 10,
    followThrough: Math.abs(f.changePercent) >= 0.6 ? 18 : 8,
    structure: clampScore(f.structure.strength / 5, 15),
    retest: 8,
  };
  const score = sumBreakdown(breakdown);
  if (score < 55) return null;

  return baseHit('breakout_radar', ctx, {
    direction: up ? 'bullish' : 'bearish',
    status: volOk ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: volOk ? 'BREAKOUT + VOLUME' : 'BREAKOUT WATCH',
    why: `Broke ${up ? 'high' : 'low'} with RVOL ${f.volume.ratio.toFixed(1)}×.`,
    keyLevel: level,
    trigger: level,
    invalidation: level
      ? `Close back inside prior range through ₹${level.toFixed(2)}`
      : 'Failed breakout acceptance',
    confirmationNeeded: volOk ? 'Retest hold preferred.' : 'Need volume confirmation.',
    evidence: [
      { label: up ? 'High broken' : 'Low broken', ok: true },
      { label: volOk ? 'Volume confirms' : 'Volume weak', ok: volOk },
      { label: break20 || breakLow20 ? '20-bar level' : '10-bar level', ok: true },
    ],
  });
}

/** 07 — REVERSAL HUNTER */
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
  if (score < 52) return null;

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

/** 08 — SECTOR LEADERS (built from relative peer bag in engine) */
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
  if (score < 50) return null;

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

/** 09 — DELIVERY FLOW — accumulation proxy when official delivery % feed is offline */
export function scanDeliveryFlow(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const bars = f.candles.slice(-12);
  if (bars.length < 8) return null;

  let accum = 0;
  let totalVol = 0;
  for (const b of bars) {
    const range = Math.max(b.high - b.low, 1e-6);
    const closePos = (b.close - b.low) / range; // 0–1
    const signed = (closePos - 0.5) * 2; // -1..1
    accum += signed * (b.volume || 0);
    totalVol += b.volume || 0;
  }
  if (!(totalVol > 0)) return null;
  const accumScore = accum / totalVol; // -1..1
  const rvol = f.volume.ratio;
  if (Math.abs(accumScore) < 0.12 || rvol < 1.1) return null;

  const bullish = accumScore > 0;
  const breakdown: ScoreBreakdown = {
    deliveryProxy: clampScore(Math.abs(accumScore) * 40, 30),
    volume: clampScore(Math.min(22, (rvol - 1) * 12), 22),
    persistence: Math.abs(f.changePercent) >= 0.4 ? 16 : 8,
    trend: (bullish && f.changePercent >= 0) || (!bullish && f.changePercent <= 0) ? 18 : 8,
    confirmation: f.volume.state === 'EXPANDING' || f.volume.state === 'UNUSUAL' ? 12 : 6,
  };
  const score = sumBreakdown(breakdown);
  if (score < 55) return null;

  return baseHit('delivery_flow', ctx, {
    direction: bullish ? 'bullish' : 'bearish',
    status: score >= 78 ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: bullish ? 'ACCUMULATION PROXY' : 'DISTRIBUTION PROXY',
    why: `Close location × volume over last ${bars.length} bars suggests ${
      bullish ? 'buying' : 'selling'
    } pressure (official delivery % feed unavailable).`,
    keyLevel: f.tech.vwap ?? f.tech.ema21,
    trigger: bullish ? f.high10 : f.low10,
    invalidation: bullish
      ? 'Closes start pinning session lows on rising volume.'
      : 'Closes start pinning session highs on rising volume.',
    confirmationNeeded: 'Treat as participation hint until delivery % feed is live.',
    evidence: [
      { label: bullish ? 'Accumulation bias' : 'Distribution bias', ok: true },
      { label: `RVOL ${rvol.toFixed(1)}×`, ok: rvol >= 1.2 },
      { label: 'Delivery % feed offline', ok: false, detail: 'Using volume accumulation proxy' },
    ],
  });
}

/** 10 — TREND RIDER */
export function scanTrendRider(ctx: Ctx): OpportunityHit | null {
  const { f } = ctx;
  const align = emaAlignment(f.tech);
  if (align === 'mixed') return null;
  const rsi = f.tech.rsi14 ?? 50;
  const momOk = align === 'bullish' ? rsi >= 52 : rsi <= 48;
  const pullback =
    align === 'bullish'
      ? f.tech.ema21 != null && f.tech.last >= f.tech.ema21 * 0.985
      : f.tech.ema21 != null && f.tech.last <= f.tech.ema21 * 1.015;

  const breakdown: ScoreBreakdown = {
    trend: 28,
    emaAlignment: 22,
    momentum: momOk ? 18 : 8,
    pullback: pullback ? 16 : 6,
    volume: f.volume.ratio >= 1 ? 10 : 6,
  };
  const score = sumBreakdown(breakdown);
  if (score < 58) return null;

  return baseHit('trend_rider', ctx, {
    direction: align,
    status: 'ACTIVE',
    score,
    breakdown,
    stateLabel: align === 'bullish' ? 'TREND BULLISH' : 'TREND BEARISH',
    why: `EMA alignment ${align}; momentum ${momOk ? 'supportive' : 'soft'}; pullback ${pullback ? 'healthy' : 'extended'}.`,
    keyLevel: f.tech.ema21,
    trigger: f.tech.ema21,
    invalidation: `EMA21/50 cross against the trend.`,
    confirmationNeeded: 'Prefer entries on pullback holds, not chase.',
    evidence: [
      { label: `Trend ${align}`, ok: true },
      { label: momOk ? 'Momentum ok' : 'Momentum soft', ok: momOk },
      { label: pullback ? 'Pullback healthy' : 'Stretched', ok: pullback },
    ],
    meta: {
      trend: align.toUpperCase(),
      htf: align.toUpperCase(),
      momentum: momOk ? 'STRONG' : 'SOFT',
      pullback: pullback ? 'HEALTHY' : 'EXTENDED',
    },
  });
}

/** 11 — OPTIONS FLOW — strike feed offline → volatility / expansion proxy */
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
  if (score < 55) return null;

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

/** 12 — WOLF PRIME composite from sibling hits on same symbol */
export function scanWolfPrime(
  ctx: Ctx,
  siblingScores: Partial<Record<OpportunityScannerId, number>>,
): OpportunityHit | null {
  const keys: OpportunityScannerId[] = [
    'momentum_surge',
    'liquidity_hunt',
    'compression_break',
    'breakout_radar',
    'trend_rider',
    'momentum_fade',
    'reversal_hunter',
  ];
  const present = keys.filter((k) => typeof siblingScores[k] === 'number');
  if (present.length < 2) return null;

  const structure = siblingScores.liquidity_hunt ?? siblingScores.compression_break ?? 0;
  const momentum = siblingScores.momentum_surge ?? siblingScores.trend_rider ?? 0;
  const volume = Math.max(siblingScores.momentum_surge ?? 0, siblingScores.breakout_radar ?? 0);
  const liquidity = siblingScores.liquidity_hunt ?? 0;
  const trend = siblingScores.trend_rider ?? 0;
  const flow = siblingScores.breakout_radar ?? siblingScores.reversal_hunter ?? 0;

  const breakdown: ScoreBreakdown = {
    structure: clampScore((structure / 100) * 20, 20),
    momentum: clampScore((momentum / 100) * 20, 20),
    volume: clampScore((volume / 100) * 20, 20),
    liquidity: clampScore((liquidity / 100) * 15, 15),
    trend: clampScore((trend / 100) * 15, 15),
    flow: clampScore((flow / 100) * 10, 10),
  };
  const score = sumBreakdown(breakdown);
  if (score < 70) return null;

  return baseHit('wolf_prime', ctx, {
    direction: ctx.f.changePercent >= 0 ? 'bullish' : 'bearish',
    status: score >= 85 ? 'ACTIVE' : 'WATCH',
    score,
    breakdown,
    stateLabel: score >= 85 ? '🔥 HIGH CONVICTION' : 'WOLF PRIME',
    why: `Composite of ${present.length} independent scanners — quality ${score}/100.`,
    keyLevel: ctx.f.tech.ema21 ?? ctx.f.high20,
    trigger: ctx.f.high20,
    invalidation: 'Majority of contributing scanners cool or invalidate.',
    confirmationNeeded: 'Still requires trade plan — score ≠ entry.',
    evidence: present.map((k) => ({
      label: `${k.replace(/_/g, ' ')} ${siblingScores[k]}`,
      ok: (siblingScores[k] ?? 0) >= 60,
    })),
  });
}

export const OHLC_SCANNERS: OpportunityScannerId[] = [
  'momentum_surge',
  'flow_shift',
  'liquidity_hunt',
  'compression_break',
  'momentum_fade',
  'breakout_radar',
  'reversal_hunter',
  'delivery_flow',
  'trend_rider',
  'options_flow',
];
