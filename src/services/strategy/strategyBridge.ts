/**
 * Bridge: Strategy Lab → WOLF Radar scan with selected strategy.
 */
import type { StrategyDefinition } from './strategyTypes';
import { getStrategy, markStrategyScanned } from './strategyStore';

export const STRATEGY_SCAN_EVENT = 'wolf-strategy-scan';
const PENDING_KEY = 'wolf_strategy_pending_scan_v1';

export type PendingStrategyScan = {
  strategyId: string;
  strategy: StrategyDefinition;
};

export function requestStrategyScan(strategy: StrategyDefinition) {
  const payload: PendingStrategyScan = { strategyId: strategy.id, strategy };
  localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  markStrategyScanned(strategy.id);
  window.dispatchEvent(new CustomEvent(STRATEGY_SCAN_EVENT, { detail: payload }));
}

export function consumePendingStrategyScan(): PendingStrategyScan | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    const parsed = JSON.parse(raw) as PendingStrategyScan;
    // refresh from store if available
    const fresh = getStrategy(parsed.strategyId);
    if (fresh) parsed.strategy = fresh;
    return parsed;
  } catch {
    localStorage.removeItem(PENDING_KEY);
    return null;
  }
}

export function peekPendingStrategyScan(): PendingStrategyScan | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingStrategyScan;
  } catch {
    return null;
  }
}
