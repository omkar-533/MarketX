/**
 * Handoff Opportunity → Wolf AI / LIVE via existing radar analyze pipeline.
 */
import type { RadarResult } from '../radar/radarTypes';
import { setPendingRadarAnalyze } from '../radar/radarBridge';
import type { OpportunityHit } from './opportunityTypes';

export function opportunityToRadarResult(hit: OpportunityHit): RadarResult {
  return {
    id: hit.id,
    symbol: hit.symbol,
    exchange: hit.exchange,
    price: hit.price,
    timeframe: hit.timeframe === '1h' ? '1h' : hit.timeframe,
    setupType: 'Volume Expansion',
    direction: hit.direction === 'neutral' ? 'bullish' : hit.direction,
    score: hit.score,
    scoreBreakdown: {
      structure: hit.breakdown.structure ?? 0,
      liquidity: hit.breakdown.liquidity ?? 0,
      volume: hit.breakdown.volume ?? 0,
      momentum: hit.breakdown.momentum ?? 0,
      htfAlignment: hit.breakdown.trend ?? hit.breakdown.emaAlignment ?? 0,
      volatility: hit.breakdown.expansion ?? hit.breakdown.compression ?? 0,
      setupQuality: hit.breakdown.confirmation ?? hit.breakdown.breakout ?? 0,
    },
    status: hit.status === 'ACTIVE' || hit.status === 'CONFIRM' ? 'SETUP CONFIRMED' : 'CONFIRMATION PENDING',
    confirmations: hit.evidence.filter((e) => e.ok).map((e) => e.label),
    structure: hit.stateLabel,
    liquidity: hit.keyLevel != null ? `Key ${hit.keyLevel}` : '—',
    volume: hit.evidence.find((e) => /vol|rvol/i.test(e.label))?.label || '—',
    momentum: hit.direction,
    htfAlignment: Boolean(hit.meta?.htf),
    keyLevels: [
      ...(hit.keyLevel != null ? [{ label: 'KEY', price: hit.keyLevel }] : []),
      ...(hit.trigger != null ? [{ label: 'TRIGGER', price: hit.trigger }] : []),
    ],
    invalidation: hit.invalidation,
    explanation: `[Wolf Opportunity · ${hit.scannerId}] ${hit.why} Next: ${hit.confirmationNeeded}`,
    detectedAt: hit.detectedAt,
    dataMode: hit.dataMode,
  };
}

export function openOpportunityInWolfAi(hit: OpportunityHit) {
  setPendingRadarAnalyze(opportunityToRadarResult(hit));
}
