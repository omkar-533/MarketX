import { istCalendarDay } from '../../utils/marketHours';
import type { OpportunityFilters, OpportunityHit, ScannerCardState } from './opportunityTypes';
import { DEFAULT_OPPORTUNITY_FILTERS, OPPORTUNITY_SCANNERS } from './opportunityTypes';

const FILTERS_KEY = 'wolf_opportunity_filters_v2';
const WATCH_KEY = 'wolf_opportunity_watchlist_v1';
const ALERTS_KEY = 'wolf_opportunity_alerts_v1';
const DAY_BOARD_KEY = 'wolf_opportunity_day_board_v1';
const DAY_HIT_CAP = 80;

type OpportunityDayBoard = {
  day: string;
  cards: ScannerCardState[];
};

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
    if (!parsed || typeof parsed.day !== 'string' || !Array.isArray(parsed.cards)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Today's IST board. Empty after logout or when a new IST day starts. */
export function loadOpportunityDayBoard(): ScannerCardState[] {
  const stored = readDayBoard();
  if (!stored || stored.day !== istCalendarDay()) return emptyOpportunityCards();
  const byId = new Map(stored.cards.map((c) => [c.scannerId, c]));
  return emptyOpportunityCards().map((blank) => {
    const prev = byId.get(blank.scannerId);
    if (!prev) return blank;
    return {
      ...blank,
      ...prev,
      hits: Array.isArray(prev.hits) ? prev.hits : [],
      status: prev.hits?.length ? 'ready' : 'idle',
    };
  });
}

export function saveOpportunityDayBoard(cards: ScannerCardState[]) {
  try {
    const payload: OpportunityDayBoard = { day: istCalendarDay(), cards };
    localStorage.setItem(DAY_BOARD_KEY, JSON.stringify(payload));
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
    detectedAt: prev.detectedAt,
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
    if (!raw) return { ...DEFAULT_OPPORTUNITY_FILTERS };
    const parsed = JSON.parse(raw) as Partial<OpportunityFilters>;
    const next = { ...DEFAULT_OPPORTUNITY_FILTERS, ...parsed };
    if (next.universe === 'NIFTY50' || next.universe === 'NIFTY500') {
      next.universe = 'CASH';
    }
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
