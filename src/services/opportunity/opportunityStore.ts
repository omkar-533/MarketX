import { istCalendarDay } from '../../utils/marketHours';
import { keepFirstSetupTime } from '../radar/barTime';
import type { OpportunityFilters, OpportunityHit, ScannerCardState } from './opportunityTypes';
import { DEFAULT_OPPORTUNITY_FILTERS, OPPORTUNITY_SCANNERS } from './opportunityTypes';

const FILTERS_KEY = 'wolf_opportunity_filters_v3';
const WATCH_KEY = 'wolf_opportunity_watchlist_v1';
const ALERTS_KEY = 'wolf_opportunity_alerts_v1';
const DAY_BOARD_KEY = 'wolf_opportunity_day_board_v4';
const DAY_HIT_CAP = 80;

type OpportunityDayBoard = {
  day: string;
  byKey: Record<string, ScannerCardState[]>;
};

export function opportunityBoardKey(universe: string, timeframe: string): string {
  return `${universe}|${timeframe}`;
}

export function emptyOpportunityCards(): ScannerCardState[] {
  return OPPORTUNITY_SCANNERS.map((s) => ({
    scannerId: s.id,
    title: s.title,
    tagline: s.tagline,
    status: 'idle',
    hits: [],
    updatedAt: null,
  }));
}

function readDayBoard(): OpportunityDayBoard | null {
  try {
    const raw = localStorage.getItem(DAY_BOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OpportunityDayBoard;
    if (!parsed || typeof parsed.day !== 'string' || !parsed.byKey || typeof parsed.byKey !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function hydrateCards(cards: ScannerCardState[] | undefined): ScannerCardState[] {
  const byId = new Map((cards || []).map((c) => [c.scannerId, c]));
  return emptyOpportunityCards().map((blank) => {
    const prev = byId.get(blank.scannerId);
    if (!prev) return blank;
    return {
      ...blank,
      ...prev,
      title: blank.title,
      tagline: blank.tagline,
      hits: Array.isArray(prev.hits) ? prev.hits.filter((h) => h.dataMode === 'LIVE') : [],
      status: prev.hits?.some((h) => h.dataMode === 'LIVE') ? 'ready' : 'idle',
    };
  });
}

/** Today's IST board for this universe + timeframe. Empty after logout or a new IST day. */
export function loadOpportunityDayBoard(key: string): ScannerCardState[] {
  const stored = readDayBoard();
  if (!stored || stored.day !== istCalendarDay()) return emptyOpportunityCards();
  return hydrateCards(stored.byKey[key]);
}

export function saveOpportunityDayBoard(key: string, cards: ScannerCardState[]) {
  try {
    const day = istCalendarDay();
    const stored = readDayBoard();
    const byKey = stored && stored.day === day ? { ...stored.byKey } : {};
    byKey[key] = cards;
    localStorage.setItem(DAY_BOARD_KEY, JSON.stringify({ day, byKey } satisfies OpportunityDayBoard));
  } catch {
    /* quota */
  }
}

export function clearOpportunityDayBoard() {
  try {
    localStorage.removeItem(DAY_BOARD_KEY);
  } catch {
    /* ignore */
  }
}

function mergeHitKeepFirstSeen(prev: OpportunityHit | undefined, hit: OpportunityHit): OpportunityHit {
  if (!prev) return hit;
  return {
    ...hit,
    id: prev.id,
    detectedAt: keepFirstSetupTime(prev.detectedAt, hit.detectedAt),
  };
}

/** Append new names; update price/score in place; never drop a name during the IST day. */
export function mergeOpportunityHitIntoCards(
  prev: ScannerCardState[],
  hit: OpportunityHit,
  cap = DAY_HIT_CAP,
): ScannerCardState[] {
  return prev.map((card) => {
    if (card.scannerId !== hit.scannerId) return card;
    if (card.status === 'unavailable') return card;
    const existing = card.hits.find((h) => h.symbol === hit.symbol);
    if (existing) {
      return {
        ...card,
        status: 'ready',
        hits: card.hits.map((h) => (h.symbol === hit.symbol ? mergeHitKeepFirstSeen(h, hit) : h)),
        updatedAt: Date.now(),
        unavailableReason: undefined,
      };
    }
    if (card.hits.length >= cap) return card;
    return {
      ...card,
      status: 'ready',
      hits: [...card.hits, hit],
      updatedAt: Date.now(),
      unavailableReason: undefined,
    };
  });
}

export function mergeOpportunityCardSets(
  prev: ScannerCardState[],
  incoming: ScannerCardState[],
): ScannerCardState[] {
  let next = prev;
  for (const card of incoming) {
    for (const hit of card.hits || []) {
      next = mergeOpportunityHitIntoCards(next, hit);
    }
  }
  return next;
}

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
    const parsed = raw ? (JSON.parse(raw) as Partial<OpportunityFilters>) : {};
    const next = { ...DEFAULT_OPPORTUNITY_FILTERS, ...parsed };
    if (next.universe === 'NIFTY50' || next.universe === 'NIFTY500') {
      next.universe = 'CASH';
    }
    next.timeframe = '5m';
    return next;
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
