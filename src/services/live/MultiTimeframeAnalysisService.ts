/**
 * MultiTimeframeAnalysisService — broker-agnostic.
 * Reuses radar engines; does not call brokers directly.
 */
import { analyzeTechnical, trendDirection } from '../radar/TechnicalEngine';
import { detectStructure } from '../radar/StructureEngine';
import { detectLiquidity } from '../radar/LiquidityEngine';
import { detectVolume } from '../radar/VolumeEngine';
import { classifySetup } from '../radar/SetupEngine';
import { computeWolfScore } from '../radar/WolfScoringEngine';
import type { Candle, RadarTimeframe } from '../radar/radarTypes';
import type { LiveAnalysisSnapshot, MarketEvent } from './liveTypes';

function htfLabel(t: 'up' | 'down' | 'range'): string {
  if (t === 'up') return 'BULLISH';
  if (t === 'down') return 'BEARISH';
  return 'RANGE';
}

export function pickHtf(timeframe: RadarTimeframe): RadarTimeframe {
  if (timeframe === '1D' || timeframe === '4h') return '1D';
  return '1h';
}

export type AnalyzePairInput = {
  symbol: string;
  exchange: string;
  timeframe: RadarTimeframe;
  ltf: Candle[];
  htf: Candle[];
  price: number;
  changePercent?: number;
  dataMode: 'DEMO' | 'LIVE';
  previous?: LiveAnalysisSnapshot | null;
};

export function analyzeMultiTimeframe(input: AnalyzePairInput): {
  snapshot: LiveAnalysisSnapshot;
  events: MarketEvent[];
} {
  const { symbol, exchange, timeframe, ltf, htf, price, dataMode, previous } = input;
  const events: MarketEvent[] = [];
  const now = Date.now();

  if (ltf.length < 25) {
    const snapshot: LiveAnalysisSnapshot = {
      symbol,
      exchange,
      timeframe,
      price,
      changePercent: input.changePercent ?? 0,
      structure: 'INSUFFICIENT DATA',
      liquidity: '—',
      volume: '—',
      momentum: '—',
      htfAlignment: false,
      htfTrend: '—',
      setupType: null,
      status: 'WAIT',
      score: null,
      scoreBreakdown: null,
      keyLevels: [],
      invalidation: 'Need more candles for reliable analysis.',
      explanation: 'WOLF is watching. Insufficient history for a high-quality setup.',
      dataMode,
      analyzedAt: now,
      waiting: true,
    };
    events.push({
      id: `evt-${symbol}-noseup-${now}`,
      symbol,
      exchange,
      timeframe,
      type: 'NO_SETUP',
      timestamp: now,
      price,
      significance: 'LOW',
      message: 'Waiting for enough candles',
    });
    return { snapshot, events };
  }

  const tech = analyzeTechnical(ltf);
  const structure = detectStructure(ltf, timeframe);
  const liquidity = detectLiquidity(ltf, timeframe);
  const volume = detectVolume(ltf);
  const htfTrend = trendDirection(htf.length >= 20 ? htf : ltf);
  const setup = classifySetup({
    timeframe,
    tech,
    structure,
    liquidity,
    volume,
    htfTrend,
  });

  const scored = setup
    ? computeWolfScore({ structure, liquidity, volume, tech, setup })
    : null;

  const snapshot: LiveAnalysisSnapshot = {
    symbol,
    exchange,
    timeframe,
    price: price || tech.last || ltf[ltf.length - 1]?.close || 0,
    changePercent: input.changePercent ?? 0,
    structure: setup?.structureLabel || structure.direction.toUpperCase() || '—',
    liquidity: setup?.liquidityLabel || liquidity.type.replace(/_/g, ' '),
    volume: setup?.volumeLabel || volume.state,
    momentum: setup?.momentumLabel || (tech.rsi14 != null ? `RSI ${tech.rsi14.toFixed(0)}` : '—'),
    htfAlignment: setup?.htfAlignment ?? false,
    htfTrend: htfLabel(htfTrend),
    setupType: setup?.setupType ?? null,
    status: setup?.status ?? 'WAIT',
    score: scored?.score ?? null,
    scoreBreakdown: scored?.breakdown ?? null,
    keyLevels: setup?.keyLevels ?? [],
    invalidation: setup?.invalidation ?? 'No active setup — WOLF is waiting.',
    explanation:
      setup?.explanation ??
      'WOLF is watching. Market conditions do not match a high-quality setup yet.',
    dataMode,
    analyzedAt: now,
    waiting: !setup,
  };

  // Meaningful event diffs only (not every tick)
  if (liquidity.type === 'LIQUIDITY_SWEEP' && previous?.liquidity !== snapshot.liquidity) {
    events.push({
      id: `evt-${symbol}-liq-${now}`,
      symbol,
      exchange,
      timeframe,
      type: 'LIQUIDITY_SWEEP',
      timestamp: now,
      price: snapshot.price,
      significance: 'HIGH',
      message: snapshot.liquidity,
    });
  }
  if (
    (structure.type === 'STRUCTURE_SHIFT' || structure.type === 'BOS') &&
    previous?.structure !== snapshot.structure
  ) {
    events.push({
      id: `evt-${symbol}-str-${now}`,
      symbol,
      exchange,
      timeframe,
      type: 'STRUCTURE_SHIFT',
      timestamp: now,
      price: snapshot.price,
      significance: 'HIGH',
      message: snapshot.structure,
    });
  }
  if (volume.state === 'EXPANDING' && previous?.volume !== 'EXPANDING') {
    events.push({
      id: `evt-${symbol}-vol-${now}`,
      symbol,
      exchange,
      timeframe,
      type: 'VOLUME_EXPANSION',
      timestamp: now,
      price: snapshot.price,
      significance: 'MEDIUM',
      message: 'Volume expanding',
    });
  }
  if (setup && !previous?.setupType) {
    events.push({
      id: `evt-${symbol}-setup-${now}`,
      symbol,
      exchange,
      timeframe,
      type: 'SETUP_DETECTED',
      timestamp: now,
      price: snapshot.price,
      significance: 'HIGH',
      message: `${setup.setupType} · ${setup.status}`,
    });
  }
  if (
    setup?.status === 'SETUP CONFIRMED' &&
    previous?.status &&
    previous.status !== 'SETUP CONFIRMED'
  ) {
    events.push({
      id: `evt-${symbol}-conf-${now}`,
      symbol,
      exchange,
      timeframe,
      type: 'SETUP_CONFIRMED',
      timestamp: now,
      price: snapshot.price,
      significance: 'HIGH',
      message: 'Setup confirmed',
    });
  }
  if (
    setup?.status === 'INVALIDATED' &&
    previous?.status &&
    previous.status !== 'INVALIDATED'
  ) {
    events.push({
      id: `evt-${symbol}-inv-${now}`,
      symbol,
      exchange,
      timeframe,
      type: 'SETUP_INVALIDATED',
      timestamp: now,
      price: snapshot.price,
      significance: 'HIGH',
      message: 'Setup invalidated',
    });
  }
  if (!setup && previous?.setupType) {
    events.push({
      id: `evt-${symbol}-gone-${now}`,
      symbol,
      exchange,
      timeframe,
      type: 'NO_SETUP',
      timestamp: now,
      price: snapshot.price,
      significance: 'MEDIUM',
      message: 'No high-quality setup — WAIT',
    });
  }

  if (!events.length) {
    events.push({
      id: `evt-${symbol}-upd-${now}`,
      symbol,
      exchange,
      timeframe,
      type: 'ANALYSIS_UPDATE',
      timestamp: now,
      price: snapshot.price,
      significance: 'LOW',
      message: snapshot.waiting ? 'Watching — no setup forced' : 'Analysis refreshed',
    });
  }

  return { snapshot, events };
}
