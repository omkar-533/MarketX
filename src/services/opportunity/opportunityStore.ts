import { istCalendarDay } from '../../utils/marketHours';
import { nseTradingDay } from '../radar/barTime';
import type { OpportunityFilters, OpportunityHit, ScannerCardState } from './opportunityTypes';
import { DEFAULT_OPPORTUNITY_FILTERS, OPPORTUNITY_SCAN_CAP, OPPORTUNITY_SCANNERS } from './opportunityTypes';

const FILTERS_KEY = 'wolf_opportunity_filters_v3';
const WATCH_KEY = 'wolf_opportunity_watchlist_v1';
const ALERTS_KEY = 'wolf_opportunity_alerts_v1';
const DAY_BOARD_KEY = 'wolf_opportunity_day_board_v9';
/** Candle-close stamps from v8 are not listing times. */
const LEGACY_BOARD_KEYS: string[] = [];
const DAY_HIT_CAP = OPPORTUNITY_SCAN_CAP;

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

function parseBoard(raw: string | null): OpportunityDayBoard | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OpportunityDayBoard;
    if (!parsed || typeof parsed.day !== 'string' || !parsed.byKey || typeof parsed.byKey !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function boardDayOk(day: string): boolean {
  return day === nseTradingDay() || day === istCalendarDay();
}

function readDayBoard(): OpportunityDayBoard | null {
  const current = parseBoard(localStorage.getItem(DAY_BOARD_KEY));
  if (current && boardDayOk(current.day)) return current;
  for (const key of LEGACY_BOARD_KEYS) {
    const legacy = parseBoard(localStorage.getItem(key));
    if (legacy && boardDayOk(legacy.day)) return legacy;
  }
  return current;
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
      hits: rankHitsByScore(
        Array.isArray(prev.hits) ? prev.hits.filter((h) => h.dataMode === 'LIVE') : [],
      ),
      status: prev.hits?.some((h) => h.dataMode === 'LIVE') ? 'ready' : 'idle',
    };
  });
}

/** Today's IST board for this universe + timeframe. Empty after logout or a new IST day. */
export function loadOpportunityDayBoard(key: string): ScannerCardState[] {
  const stored = readDayBoard();
  if (!stored || !boardDayOk(stored.day)) return emptyOpportunityCards();
  return hydrateCards(stored.byKey[key]);
}

export function saveOpportunityDayBoard(key: string, cards: ScannerCardState[]) {
  try {
    const day = nseTradingDay();
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
    localStorage.removeItem('wolf_opportunity_day_board_v7');
    localStorage.removeItem('wolf_opportunity_day_board_v6');
    localStorage.removeItem('wolf_opportunity_day_board_v5');
  } catch {
    /* ignore */
  }
}

function listingTime(ms: number, now = Date.now()): number {
  if (!Number.isFinite(ms) || ms <= 0 || ms > now + 2_000) return 0;
  return ms;
}

function mergeHitKeepFirstSeen(prev: OpportunityHit | undefined, hit: OpportunityHit): OpportunityHit {
  if (!prev) return hit;
  const firstListed = listingTime(prev.detectedAt) || listingTime(hit.detectedAt);
  return {
    ...hit,
    id: prev.id,
    detectedAt: firstListed || hit.detectedAt,
  };
}

export function rankHitsByScore(hits: OpportunityHit[]): OpportunityHit[] {
  return [...hits].sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}

/**
 * After a full scan: this run's ranked hits are the board.
 * Keep first listing time for names that stay on the board. Do not freeze first-arrived names.
 */
export function applyScanCardsKeepingFirstSeen(
  prev: ScannerCardState[],
  incoming: ScannerCardState[],
): ScannerCardState[] {
  const prevBy = new Map(prev.map((c) => [c.scannerId, c]));
  const inBy = new Map(incoming.map((c) => [c.scannerId, c]));
  return emptyOpportunityCards().map((blank) => {
    const nextCard = inBy.get(blank.scannerId);
    const prevCard = prevBy.get(blank.scannerId);
    const prevHits = new Map((prevCard?.hits || []).map((h) => [h.symbol, h]));
    const hits = rankHitsByScore(
      (nextCard?.hits || []).map((h) => mergeHitKeepFirstSeen(prevHits.get(h.symbol), h)),
    );
    return {
      ...blank,
      status: hits.length ? 'ready' : nextCard?.status || prevCard?.status || 'idle',
      hits,
      updatedAt: nextCard?.updatedAt ?? Date.now(),
      unavailableReason: nextCard?.unavailableReason,
    };
  });
}

/** Live desk: this scan only. Never merge a browser-saved board. */
export function applyLiveScanCards(incoming: ScannerCardState[]): ScannerCardState[] {
  const inBy = new Map(incoming.map((c) => [c.scannerId, c]));
  return emptyOpportunityCards().map((blank) => {
    const nextCard = inBy.get(blank.scannerId);
    const hits = rankHitsByScore(nextCard?.hits || []);
    return {
      ...blank,
      status: hits.length ? 'ready' : nextCard?.status || 'idle',
      hits,
      updatedAt: nextCard?.updatedAt ?? Date.now(),
      unavailableReason: nextCard?.unavailableReason,
    };
  });
}

/** Update price/score; keep earliest Created. Rank by score and trim — never lock the first arrivals. */
export function mergeOpportunityHitIntoCards(
  prev: ScannerCardState[],
  hit: OpportunityHit,
  cap = DAY_HIT_CAP,
): ScannerCardState[] {
  return prev.map((card) => {
    if (card.scannerId !== hit.scannerId) return card;
    if (card.status === 'unavailable') return card;
    const existing = card.hits.find((h) => h.symbol === hit.symbol);
    const merged = existing ? mergeHitKeepFirstSeen(existing, hit) : hit;
    const hits = rankHitsByScore([
      ...card.hits.filter((h) => h.symbol !== hit.symbol),
      merged,
    ]).slice(0, cap);
    return {
      ...card,
      status: 'ready',
      hits,
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
  return next.map((card) => ({
    ...card,
    hits: rankHitsByScore(card.hits || []),
  }));
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
    if (!['1m', '3m', '5m', '15m', '30m', '1h'].includes(String(next.timeframe))) {
      next.timeframe = '5m';
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
