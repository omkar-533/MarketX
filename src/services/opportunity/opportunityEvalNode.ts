/**
 * Node entry for the Render Opportunity board job.
 * Bundled to server/marketData/generated/opportunityEval.mjs — same scanners as the site.
 */
import { lastClosedBarCloseMs } from '../radar/barTime';
import { evaluateOpportunityFromCandleMap } from './opportunityEvaluate';
import {
  DEFAULT_OPPORTUNITY_FILTERS,
  type OpportunityTimeframe,
} from './opportunityTypes';

type SnapCandle = {
  timestamp?: number;
  time?: number;
  ts?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  symbol?: string;
};

export async function evaluateOpportunitySnapshot(snap: {
  symbols?: string[];
  candlesBySymbol?: Record<string, SnapCandle[]>;
  timeframe?: string;
  universe?: string;
  asOf?: number;
  builtAt?: number;
}) {
  const tf = (['5m', '15m', '1h', '1D'].includes(String(snap.timeframe))
    ? snap.timeframe
    : '5m') as OpportunityTimeframe;
  const universe = snap.universe === 'CASH' ? 'CASH' : 'F&O';
  const candleMap = snap.candlesBySymbol || {};
  const symbols = [
    ...new Set(
      (snap.symbols?.length ? snap.symbols : Object.keys(candleMap)).map((s) =>
        String(s || '').toUpperCase(),
      ),
    ),
  ].filter(Boolean);
  const asOf =
    lastClosedBarCloseMs(tf) ||
    Math.min(Number(snap.asOf || snap.builtAt) || Date.now(), Date.now());
  return evaluateOpportunityFromCandleMap({
    filters: {
      ...DEFAULT_OPPORTUNITY_FILTERS,
      universe,
      timeframe: tf,
      direction: 'all',
    },
    symbols,
    asOf,
    dataMode: 'LIVE',
    shared: true,
    fetchBatch: 80,
    candleMapAll: candleMap,
  });
}
