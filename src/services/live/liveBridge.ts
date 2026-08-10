/**
 * liveBridge — Radar/Watchlist → LIVE WOLF desk (no screenshot required).
 */
import type { RadarResult, RadarTimeframe } from '../radar/radarTypes';

export const LIVE_WOLF_OPEN_EVENT = 'wolf-live-open';

export type LiveWolfOpenPayload = {
  symbol: string;
  exchange: string;
  timeframe: RadarTimeframe;
  seedResult?: RadarResult | null;
  /** Strategy Lab context for continuous evaluation (optional) */
  strategyId?: string;
  strategyName?: string;
  matchedConditions?: string[];
};

const PENDING_KEY = 'wolf_live_pending_v1';

export function requestOpenLiveWolf(payload: LiveWolfOpenPayload) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(LIVE_WOLF_OPEN_EVENT, { detail: payload }));
}

export function consumePendingLiveWolf(): LiveWolfOpenPayload | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw) as LiveWolfOpenPayload;
  } catch {
    localStorage.removeItem(PENDING_KEY);
    return null;
  }
}

export function openLiveWolfFromRadarResult(result: RadarResult) {
  requestOpenLiveWolf({
    symbol: result.symbol,
    exchange: result.exchange,
    timeframe: result.timeframe,
    seedResult: result,
    strategyId: result.strategyId,
    strategyName: result.strategyName,
    matchedConditions: result.matchedConditions,
  });
}
