import { istCalendarDay } from '../../utils/marketHours';
import { nseTradingDay } from '../radar/barTime';
import type { OpportunityFilters, OpportunityHit, ScannerCardState } from './opportunityTypes';
import { DEFAULT_OPPORTUNITY_FILTERS, OPPORTUNITY_SCAN_CAP, OPPORTUNITY_SCANNERS } from './opportunityTypes';

const FILTERS_KEY = 'wolf_opportunity_filters_v3';
const WATCH_KEY = 'wolf_opportunity_watchlist_v1';
const ALERTS_KEY = 'wolf_opportunity_alerts_v1';
// v27 matches the server board key. Bumping only the server left browsers
// replaying their own cached rows, which is why stale prints kept coming back.
const DAY_BOARD_KEY = 'wolf_opportunity_day_board_v27';
/** Pre-quality-pack boards mixed WATCH/proxy hits — do not hydrate. */
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
      hits: rankHitsByCreated(
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
    localStorage.removeItem('wolf_opportunity_day_board_v26');
    localStorage.removeItem('wolf_opportunity_day_board_v25');
    localStorage.removeItem('wolf_opportunity_day_board_v24');
    localStorage.removeItem('wolf_opportunity_day_board_v23');
    localStorage.removeItem('wolf_opportunity_day_board_v22');
    localStorage.removeItem('wolf_opportunity_day_board_v21');
    localStorage.removeItem('wolf_opportunity_day_board_v20');
    localStorage.removeItem('wolf_opportunity_day_board_v19');
    localStorage.removeItem('wolf_opportunity_day_board_v18');
    localStorage.removeItem('wolf_opportunity_day_board_v17');
    localStorage.removeItem('wolf_opportunity_day_board_v16');
    localStorage.removeItem('wolf_opportunity_day_board_v15');
    localStorage.removeItem('wolf_opportunity_day_board_v14');
    localStorage.removeItem('wolf_opportunity_day_board_v13');
    localStorage.removeItem('wolf_opportunity_day_board_v12');
    localStorage.removeItem('wolf_opportunity_day_board_v11');
    localStorage.removeItem('wolf_opportunity_day_board_v10');
    localStorage.removeItem('wolf_opportunity_day_board_v9');
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

/** Day log: newest episode first. Same name + later Created stays a 2nd row. */
export function rankHitsByCreated(hits: OpportunityHit[]): OpportunityHit[] {
  return [...hits].sort(
    (a, b) =>
      b.detectedAt - a.detectedAt ||
      a.symbol.localeCompare(b.symbol) ||
      Number(a.meta?.signalN || 0) - Number(b.meta?.signalN || 0),
  );
}

export function opportunityPrintOrdinal(n: number): string {
  if (!(n >= 1) || !Number.isFinite(n)) return '';
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  const d = n % 10;
  if (d === 1) return `${n}st`;
  if (d === 2) return `${n}nd`;
  if (d === 3) return `${n}rd`;
  return `${n}th`;
}

function printHitKey(hit: OpportunityHit): string {
  return `${hit.id}|${hit.detectedAt}`;
}

/**
 * 1st / 2nd / 3rd / 4th for the same symbol inside one scanner list only.
 * A single listing stays unlabeled. Counts do not leak across scanners.
 */
export function scannerPrintLabels(hits: OpportunityHit[]): Map<string, string> {
  const groups = new Map<string, OpportunityHit[]>();
  for (const h of hits) {
    const g = groups.get(h.symbol) || [];
    g.push(h);
    groups.set(h.symbol, g);
  }
  const out = new Map<string, string>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const ordered = [...g].sort(
      (a, b) => a.detectedAt - b.detectedAt || String(a.id).localeCompare(String(b.id)),
    );
    ordered.forEach((h, i) => {
      out.set(printHitKey(h), opportunityPrintOrdinal(i + 1));
    });
  }
  return out;
}

export function scannerPrintLabelOf(hit: OpportunityHit, labels: Map<string, string>): string {
  return labels.get(printHitKey(hit)) || '';
}

export type OpportunityDeskSort = 'default' | 'long' | 'short' | 'created' | 'percent';

export const DEFAULT_OPPORTUNITY_DESK_SORT: OpportunityDeskSort = 'default';

export const OPPORTUNITY_DESK_SORTS: OpportunityDeskSort[] = [
  'default',
  'long',
  'short',
  'created',
  'percent',
];

export function nextOpportunityDeskSort(current: OpportunityDeskSort): OpportunityDeskSort {
  const i = OPPORTUNITY_DESK_SORTS.indexOf(current);
  return OPPORTUNITY_DESK_SORTS[(i + 1) % OPPORTUNITY_DESK_SORTS.length];
}

function deskBias(hit: OpportunityHit): 'bullish' | 'bearish' | 'neutral' {
  if (hit.direction === 'bullish' || hit.direction === 'bearish') return hit.direction;
  if ((hit.changePercent || 0) > 0) return 'bullish';
  if ((hit.changePercent || 0) < 0) return 'bearish';
  return 'neutral';
}

/** Combined list. Default = original Created ranking. Other cycle steps keep Wolf score on top. */
export function sortHitsForDesk(hits: OpportunityHit[], mode: OpportunityDeskSort): OpportunityHit[] {
  if (mode === 'default') return rankHitsByCreated(hits);
  const list = [...hits];
  const byScore = (a: OpportunityHit, b: OpportunityHit) =>
    b.score - a.score ||
    b.detectedAt - a.detectedAt ||
    a.symbol.localeCompare(b.symbol);

  if (mode === 'created') return list.sort(byScore);
  if (mode === 'percent') {
    return list.sort(
      (a, b) =>
        b.score - a.score ||
        (b.changePercent || 0) - (a.changePercent || 0) ||
        b.detectedAt - a.detectedAt ||
        a.symbol.localeCompare(b.symbol),
    );
  }
  const prefer = mode === 'long' ? 'bullish' : 'bearish';
  const rank = (h: OpportunityHit) => {
    const b = deskBias(h);
    if (b === prefer) return 0;
    if (b === 'neutral') return 1;
    return 2;
  };
  return list.sort((a, b) => rank(a) - rank(b) || byScore(a, b));
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
    const hits = rankHitsByCreated(
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

/** Same IST day: keep every signal print. New reprint adds a row; first print never restamps. */
export function applyDaySignalCards(
  prev: ScannerCardState[],
  incoming: ScannerCardState[],
): ScannerCardState[] {
  const prevBy = new Map(prev.map((c) => [c.scannerId, c]));
  const inBy = new Map(incoming.map((c) => [c.scannerId, c]));
  return emptyOpportunityCards().map((blank) => {
    const nextCard = inBy.get(blank.scannerId);
    const prevCard = prevBy.get(blank.scannerId);
    const byKey = new Map<string, OpportunityHit>();
    for (const h of prevCard?.hits || []) {
      if (listingTime(h.detectedAt)) byKey.set(`${h.symbol}|${h.detectedAt}`, h);
    }
    for (const h of nextCard?.hits || []) {
      const k = `${h.symbol}|${h.detectedAt}`;
      const old = byKey.get(k);
      byKey.set(k, old ? mergeHitKeepFirstSeen(old, h) : h);
    }
    const hits = rankHitsByCreated([...byKey.values()]);
    return {
      ...blank,
      status: hits.length ? 'ready' : nextCard?.status || prevCard?.status || 'idle',
      hits,
      updatedAt: nextCard?.updatedAt ?? Date.now(),
      unavailableReason: nextCard?.unavailableReason,
    };
  });
}
export function applyLiveScanCards(incoming: ScannerCardState[]): ScannerCardState[] {
  const inBy = new Map(incoming.map((c) => [c.scannerId, c]));
  return emptyOpportunityCards().map((blank) => {
    const nextCard = inBy.get(blank.scannerId);
    const hits = rankHitsByCreated(nextCard?.hits || []);
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
    const existing = card.hits.find(
      (h) => h.symbol === hit.symbol && listingTime(h.detectedAt) === listingTime(hit.detectedAt),
    );
    const merged = existing ? mergeHitKeepFirstSeen(existing, hit) : hit;
    const hits = [...card.hits.filter((h) => h !== existing), merged].sort(
      (a, b) => a.detectedAt - b.detectedAt || a.symbol.localeCompare(b.symbol),
    );
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
    hits: rankHitsByCreated(card.hits || []),
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
    next.universe = 'F&O';
    next.direction = 'all';
    next.autoRefresh = true;
    if (![5, 10, 30, 60].includes(Number(next.refreshSec))) next.refreshSec = 30;
    // Timeframe is a per-card choice now. The shared board the desk scans and
    // contributes to stays on 5m, so a stale saved value cannot redirect it.
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
