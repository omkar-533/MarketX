/** Setup classifier from structured engine outputs. */
import type { StructureEvent } from './StructureEngine';
import type { LiquidityEvent } from './LiquidityEngine';
import type { VolumeEvent } from './VolumeEngine';
import type { TechnicalSnapshot } from './TechnicalEngine';
import type { RadarBias, RadarSetupStatus, RadarSetupType } from './radarTypes';

export type SetupDetection = {
  setupType: RadarSetupType;
  direction: RadarBias;
  status: RadarSetupStatus;
  confirmations: string[];
  structureLabel: string;
  liquidityLabel: string;
  volumeLabel: string;
  momentumLabel: string;
  htfAlignment: boolean;
  keyLevels: { label: string; price: number }[];
  invalidation: string;
  explanation: string;
};

function momentumLabel(tech: TechnicalSnapshot): string {
  const r = tech.rsi14;
  if (r == null) return 'UNKNOWN';
  if (r >= 62) return 'STRONG';
  if (r >= 52) return 'RISING';
  if (r <= 38) return 'SOFT';
  return 'BUILDING';
}

export function classifySetup(input: {
  timeframe: string;
  tech: TechnicalSnapshot;
  structure: StructureEvent;
  liquidity: LiquidityEvent;
  volume: VolumeEvent;
  htfTrend: 'up' | 'down' | 'range';
}): SetupDetection | null {
  const { tech, structure, liquidity, volume, htfTrend, timeframe } = input;
  const htfAlignment =
    (structure.direction === 'bullish' && htfTrend === 'up') ||
    (structure.direction === 'bearish' && htfTrend === 'down');

  const confirmations: string[] = [];
  let setupType: RadarSetupType | null = null;
  let direction: RadarBias = structure.direction;
  let status: RadarSetupStatus = 'WATCH';

  if (liquidity.type === 'LIQUIDITY_SWEEP' && liquidity.confirmed) {
    setupType = 'Liquidity Sweep';
    direction = liquidity.direction === 'neutral' ? structure.direction : liquidity.direction;
    confirmations.push('Liquidity Sweep');
    if (structure.type === 'STRUCTURE_SHIFT' || structure.type === 'BOS') {
      confirmations.push(structure.type === 'BOS' ? 'Break of Structure' : 'Structure Shift');
      status = 'CONFIRMATION PENDING';
    }
    if (volume.state === 'EXPANDING' || volume.state === 'UNUSUAL') {
      confirmations.push('Volume Expansion');
    }
  } else if (structure.type === 'BOS' && structure.direction === 'bullish') {
    setupType = 'Breakout';
    direction = 'bullish';
    confirmations.push('Breakout');
    if (volume.state === 'EXPANDING' || volume.state === 'UNUSUAL') confirmations.push('Volume Expansion');
    status = 'WATCH';
  } else if (structure.type === 'BOS' && structure.direction === 'bearish') {
    setupType = 'Breakdown';
    direction = 'bearish';
    confirmations.push('Breakdown');
    if (volume.state === 'EXPANDING' || volume.state === 'UNUSUAL') confirmations.push('Volume Expansion');
    status = 'WATCH';
  } else if (structure.type === 'STRUCTURE_SHIFT') {
    setupType = 'Structure Shift';
    direction = structure.direction;
    confirmations.push('Structure Shift');
    if (volume.state === 'EXPANDING') confirmations.push('Volume Expansion');
    status = 'SETUP DEVELOPING';
  } else if (
    (structure.direction === 'bullish' && tech.trend === 'up') ||
    (structure.direction === 'bearish' && tech.trend === 'down')
  ) {
    setupType = 'Trend Continuation';
    direction = structure.direction;
    confirmations.push('Trend Continuation');
    status = 'WATCH';
  } else if (volume.state === 'EXPANDING' || volume.state === 'UNUSUAL') {
    setupType = 'Volume Expansion';
    direction = structure.direction;
    confirmations.push('Volume Expansion');
    status = 'SETUP DEVELOPING';
  }

  if (!setupType || confirmations.length === 0) return null;

  if (htfAlignment) confirmations.push('HTF Alignment');
  if (htfAlignment && confirmations.length >= 3 && setupType === 'Liquidity Sweep') {
    status = 'CONFIRMATION PENDING';
  }

  const atr = tech.atr14 ?? tech.last * 0.004;
  const invPrice =
    direction === 'bullish'
      ? Number((tech.last - atr * 1.4).toFixed(2))
      : Number((tech.last + atr * 1.4).toFixed(2));

  const keyLevels: { label: string; price: number }[] = [
    { label: 'Spot', price: Number(tech.last.toFixed(2)) },
  ];
  if (liquidity.level > 0 && liquidity.type !== 'NONE') {
    keyLevels.push({ label: 'Liquidity', price: Number(liquidity.level.toFixed(2)) });
  }
  keyLevels.push({ label: 'Invalidation', price: invPrice });

  const structureLabel =
    structure.direction === 'bullish'
      ? structure.type === 'STRUCTURE_SHIFT'
        ? 'SHIFTING BULLISH'
        : 'BULLISH'
      : structure.direction === 'bearish'
        ? structure.type === 'STRUCTURE_SHIFT'
          ? 'SHIFTING BEARISH'
          : 'BEARISH'
        : 'NEUTRAL';

  const liquidityLabel =
    liquidity.type === 'LIQUIDITY_SWEEP'
      ? 'SWEPT'
      : liquidity.type === 'EQUAL_LOWS'
        ? 'EQUAL LOWS'
        : liquidity.type === 'EQUAL_HIGHS'
          ? 'EQUAL HIGHS'
          : 'CLEAR';

  const explanation = [
    liquidity.note !== 'No clear liquidity event on last bars' ? liquidity.note + '.' : null,
    structure.note + '.',
    volume.note + '.',
    htfAlignment
      ? 'Higher timeframe remains aligned with this lean.'
      : 'Higher timeframe alignment is incomplete — treat as watch, not chase.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    setupType,
    direction,
    status,
    confirmations: [...new Set(confirmations)].slice(0, 4),
    structureLabel,
    liquidityLabel,
    volumeLabel: volume.state,
    momentumLabel: momentumLabel(tech),
    htfAlignment,
    keyLevels,
    invalidation:
      direction === 'bullish'
        ? `Close and hold below ${invPrice} on the ${timeframe} invalidates the lean.`
        : `Close and hold above ${invPrice} on the ${timeframe} invalidates the lean.`,
    explanation,
  };
}

/**
 * Always-scoreable watch lean when no primary setup classified.
 * Prevents strategy-matched cards from showing a fake 0/100.
 */
export function buildWatchSetup(input: {
  timeframe: string;
  tech: TechnicalSnapshot;
  structure: StructureEvent;
  liquidity: LiquidityEvent;
  volume: VolumeEvent;
  htfTrend: 'up' | 'down' | 'range';
}): SetupDetection {
  const { tech, structure, liquidity, volume, htfTrend, timeframe } = input;
  const direction: RadarBias =
    structure.direction !== 'neutral'
      ? structure.direction
      : htfTrend === 'up'
        ? 'bullish'
        : htfTrend === 'down'
          ? 'bearish'
          : 'neutral';
  const htfAlignment =
    (direction === 'bullish' && htfTrend === 'up') ||
    (direction === 'bearish' && htfTrend === 'down') ||
    (direction === 'neutral' && htfTrend !== 'range');

  const atr = tech.atr14 ?? tech.last * 0.004;
  const invPrice =
    direction === 'bearish'
      ? Number((tech.last + atr * 1.4).toFixed(2))
      : Number((tech.last - atr * 1.4).toFixed(2));

  const confirmations: string[] = ['Watch lean'];
  if (structure.type !== 'RANGE') confirmations.push(structure.type.replace(/_/g, ' '));
  if (liquidity.type === 'LIQUIDITY_SWEEP') confirmations.push('Liquidity Sweep');
  if (volume.state === 'EXPANDING' || volume.state === 'UNUSUAL') confirmations.push('Volume Expansion');
  if (htfAlignment) confirmations.push('HTF Alignment');

  return {
    setupType: 'Trend Continuation',
    direction,
    status: 'WATCH',
    confirmations: [...new Set(confirmations)].slice(0, 4),
    structureLabel:
      structure.direction === 'bullish'
        ? 'BULLISH'
        : structure.direction === 'bearish'
          ? 'BEARISH'
          : 'NEUTRAL',
    liquidityLabel: liquidity.type === 'NONE' ? 'CLEAR' : liquidity.type.replace(/_/g, ' '),
    volumeLabel: volume.state,
    momentumLabel: momentumLabel(tech),
    htfAlignment,
    keyLevels: [
      { label: 'Spot', price: Number(tech.last.toFixed(2)) },
      { label: 'Invalidation', price: invPrice },
    ],
    invalidation: `Watch lean only — ${timeframe} invalidate near ${invPrice}.`,
    explanation:
      structure.note ||
      'No primary setup classified; scored as a watch lean from structure, volume, and HTF bias.',
  };
}
