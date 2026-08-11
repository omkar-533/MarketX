import type { OpportunityFilters, OpportunityHit } from './opportunityTypes';
import { DEFAULT_OPPORTUNITY_FILTERS } from './opportunityTypes';

const FILTERS_KEY = 'wolf_opportunity_filters_v1';
const WATCH_KEY = 'wolf_opportunity_watchlist_v1';
const ALERTS_KEY = 'wolf_opportunity_alerts_v1';

export type OpportunityAlertRule = {
  id: string;
  symbol: string;
  scannerId: string;
  condition: 'score_above' | 'breakout_confirmed' | 'price_level';
  threshold: number;
  createdAt: number;
  note: string;
};

export function loadOpportunityFilters(): OpportunityFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return { ...DEFAULT_OPPORTUNITY_FILTERS };
    return { ...DEFAULT_OPPORTUNITY_FILTERS, ...(JSON.parse(raw) as Partial<OpportunityFilters>) };
  } catch {
    return { ...DEFAULT_OPPORTUNITY_FILTERS };
  }
}

export function saveOpportunityFilters(f: OpportunityFilters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {
    /* quota */
  }
}

export function loadOpportunityWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(list) ? list.map((s) => String(s).toUpperCase()) : [];
  } catch {
    return [];
  }
}

export function toggleOpportunityWatch(symbol: string): string[] {
  const key = symbol.toUpperCase();
  const cur = loadOpportunityWatchlist();
  const next = cur.includes(key) ? cur.filter((s) => s !== key) : [...cur, key];
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function loadOpportunityAlerts(): OpportunityAlertRule[] {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    const list = raw ? (JSON.parse(raw) as OpportunityAlertRule[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addOpportunityAlert(hit: OpportunityHit, threshold = 80): OpportunityAlertRule {
  const rule: OpportunityAlertRule = {
    id: `opp-alert-${hit.symbol}-${Date.now()}`,
    symbol: hit.symbol,
    scannerId: hit.scannerId,
    condition: 'score_above',
    threshold,
    createdAt: Date.now(),
    note: `Alert when ${hit.symbol} ${hit.scannerId} score ≥ ${threshold}`,
  };
  const next = [rule, ...loadOpportunityAlerts()].slice(0, 50);
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return rule;
}
