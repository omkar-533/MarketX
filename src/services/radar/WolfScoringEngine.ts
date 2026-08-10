/**
 * WOLF SCORE — transparent setup-quality model (0–100).
 * Not a probability of profit.
 */
import type { ScoreBreakdown, WolfScore } from './radarTypes';
import type { StructureEvent } from './StructureEngine';
import type { LiquidityEvent } from './LiquidityEngine';
import type { VolumeEvent } from './VolumeEngine';
import type { TechnicalSnapshot } from './TechnicalEngine';
import type { SetupDetection } from './SetupEngine';

/** Configurable max points per pillar (sum = 100). */
export const WOLF_SCORE_WEIGHTS = {
  structure: 20,
  liquidity: 20,
  volume: 15,
  momentum: 15,
  htfAlignment: 15,
  volatility: 5,
  setupQuality: 10,
} as const;

function clamp(n: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(n)));
}

export function computeWolfScore(input: {
  structure: StructureEvent;
  liquidity: LiquidityEvent;
  volume: VolumeEvent;
  tech: TechnicalSnapshot;
  setup: SetupDetection;
}): WolfScore {
  const { structure, liquidity, volume, tech, setup } = input;
  const w = WOLF_SCORE_WEIGHTS;

  const structurePts = clamp((structure.strength / 100) * w.structure, w.structure);

  let liquidityPts = 0;
  if (liquidity.type === 'LIQUIDITY_SWEEP' && liquidity.confirmed) liquidityPts = w.liquidity * 0.95;
  else if (liquidity.type === 'EQUAL_HIGHS' || liquidity.type === 'EQUAL_LOWS')
    liquidityPts = w.liquidity * 0.7;
  else if (liquidity.type === 'RECLAIM') liquidityPts = w.liquidity * 0.6;
  else liquidityPts = w.liquidity * 0.25;
  liquidityPts = clamp(liquidityPts, w.liquidity);

  let volumePts = w.volume * 0.4;
  if (volume.state === 'UNUSUAL') volumePts = w.volume;
  else if (volume.state === 'EXPANDING') volumePts = w.volume * 0.9;
  else if (volume.state === 'NORMAL') volumePts = w.volume * 0.55;
  else volumePts = w.volume * 0.3;
  volumePts = clamp(volumePts, w.volume);

  const rsi = tech.rsi14 ?? 50;
  let momentumPts = w.momentum * 0.45;
  if (setup.direction === 'bullish' && rsi >= 55) momentumPts = w.momentum * (0.7 + (rsi - 55) / 100);
  else if (setup.direction === 'bearish' && rsi <= 45)
    momentumPts = w.momentum * (0.7 + (45 - rsi) / 100);
  momentumPts = clamp(momentumPts, w.momentum);

  const htfPts = clamp(setup.htfAlignment ? w.htfAlignment : w.htfAlignment * 0.35, w.htfAlignment);

  const atrPct = tech.atr14 && tech.last ? (tech.atr14 / tech.last) * 100 : 1;
  let volatilityPts = w.volatility * 0.6;
  if (atrPct >= 0.4 && atrPct <= 2.2) volatilityPts = w.volatility;
  else if (atrPct > 3) volatilityPts = w.volatility * 0.4;
  volatilityPts = clamp(volatilityPts, w.volatility);

  let setupQuality = w.setupQuality * 0.4;
  setupQuality += Math.min(w.setupQuality * 0.4, setup.confirmations.length * 2);
  if (setup.status === 'CONFIRMATION PENDING') setupQuality += 1;
  if (setup.status === 'SETUP CONFIRMED') setupQuality += 2;
  setupQuality = clamp(setupQuality, w.setupQuality);

  const breakdown: ScoreBreakdown = {
    structure: structurePts,
    liquidity: liquidityPts,
    volume: volumePts,
    momentum: momentumPts,
    htfAlignment: htfPts,
    volatility: volatilityPts,
    setupQuality,
  };

  const score =
    breakdown.structure +
    breakdown.liquidity +
    breakdown.volume +
    breakdown.momentum +
    breakdown.htfAlignment +
    breakdown.volatility +
    breakdown.setupQuality;

  return { score: clamp(score, 100), breakdown };
}
