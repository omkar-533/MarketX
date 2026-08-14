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
  queuedAt?: number;
};

const PENDING_KEY = 'wolf_live_pending_v1';
const LAST_KEY = 'wolf_live_last_v1';

export function requestOpenLiveWolf(payload: LiveWolfOpenPayload) {
  localStorage.setItem(PENDING_KEY, JSON.stringify({ ...payload, queuedAt: Date.now() }));
  window.dispatchEvent(new CustomEvent(LIVE_WOLF_OPEN_EVENT, { detail: payload }));
}

export function peekPendingLiveWolf(): LiveWolfOpenPayload | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveWolfOpenPayload;
    if (!parsed?.symbol) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function consumePendingLiveWolf(): LiveWolfOpenPayload | null {
  const pending = peekPendingLiveWolf();
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
  return pending;
}

export function rememberLiveWolfDesk(tvSymbol: string, timeframe: RadarTimeframe) {
  const tv = String(tvSymbol || '').trim();
  if (!tv) return;
  try {
    sessionStorage.setItem(LAST_KEY, JSON.stringify({ tvSymbol: tv, timeframe }));
  } catch {
    /* ignore */
  }
}

export function loadLastLiveWolfDesk(): { tvSymbol: string; timeframe: RadarTimeframe } | null {
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tvSymbol?: string; timeframe?: RadarTimeframe };
    if (!parsed?.tvSymbol) return null;
    return { tvSymbol: parsed.tvSymbol, timeframe: parsed.timeframe || '5m' };
  } catch {
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
