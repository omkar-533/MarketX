import { istCalendarDay } from '../../utils/marketHours';
import type { RadarResult, UserSetup, UserSetupCondition, WatchlistItem } from './radarTypes';

const WATCH_KEY = 'wolf_radar_watchlist_v1';
const SETUPS_KEY = 'wolf_radar_setups_v1';
const LAST_RESULTS_KEY = 'wolf_radar_last_results_v1';
const DAY_BOARD_KEY = 'wolf_radar_day_board_v2';
const DAY_RESULT_CAP = 120;

type RadarDayBoard = {
  day: string;
  byKey: Record<string, RadarResult[]>;
};

export function radarDayBoardKey(universe: string, timeframe: string, screenerKey: string): string {
  return `${universe}|${timeframe}|${screenerKey || 'default'}`;
}

function readRadarDayBoard(): RadarDayBoard | null {
  try {
    const raw = localStorage.getItem(DAY_BOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RadarDayBoard;
    if (!parsed || typeof parsed.day !== 'string' || !parsed.byKey || typeof parsed.byKey !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function liveOnly(rows: RadarResult[]): RadarResult[] {
  return rows.filter((r) => r.dataMode === 'LIVE');
}

export function loadRadarDayBoard(key?: string): RadarResult[] {
  const stored = readRadarDayBoard();
  if (!stored || stored.day !== istCalendarDay()) return [];
  if (key) return liveOnly(Array.isArray(stored.byKey[key]) ? stored.byKey[key] : []);
  return liveOnly(Object.values(stored.byKey).flat());
}

export function saveRadarDayBoard(key: string, results: RadarResult[]) {
  try {
    const day = istCalendarDay();
    const stored = readRadarDayBoard();
    const byKey = stored && stored.day === day ? { ...stored.byKey } : {};
    byKey[key] = results.slice(0, DAY_RESULT_CAP);
    localStorage.setItem(DAY_BOARD_KEY, JSON.stringify({ day, byKey } satisfies RadarDayBoard));
  } catch {
    /* quota */
  }
}

export function clearRadarDayBoard() {
  try {
    localStorage.removeItem(DAY_BOARD_KEY);
    localStorage.removeItem(LAST_RESULTS_KEY);
  } catch {
    /* ignore */
  }
}

export function mergeRadarResultKeepFirstSeen(prev: RadarResult[], row: RadarResult): RadarResult[] {
  const existing = prev.find((r) => r.symbol === row.symbol);
  if (existing) {
    const a = existing.detectedAt || 0;
    const b = row.detectedAt || 0;
    const now = Date.now();
    const aScan = !a || Math.abs(now - a) < 90_000;
    const bScan = !b || Math.abs(now - b) < 90_000;
    let detectedAt = b || a;
    if (aScan && !bScan) detectedAt = b;
    else if (!aScan && bScan) detectedAt = a;
    else if (!aScan && !bScan) detectedAt = Math.min(a, b);
    return prev.map((r) =>
      r.symbol === row.symbol
        ? {
            ...row,
            id: existing.id,
            detectedAt,
          }
        : r,
    );
  }
  if (prev.length >= DAY_RESULT_CAP) return prev;
  return [...prev, row];
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function loadWatchlist(): WatchlistItem[] {
  return readJson<WatchlistItem[]>(WATCH_KEY, []);
}

export function saveWatchlist(items: WatchlistItem[]) {
  writeJson(WATCH_KEY, items);
}

export function addToWatchlist(result: RadarResult): WatchlistItem[] {
  const list = loadWatchlist().filter((x) => x.symbol !== result.symbol);
  list.unshift({
    symbol: result.symbol,
    resultId: result.id,
    score: result.score,
    setupType: result.setupType,
    status: result.status,
    addedAt: Date.now(),
    lastDetectedAt: result.detectedAt,
  });
  saveWatchlist(list);
  return list;
}

export function removeFromWatchlist(symbol: string): WatchlistItem[] {
  const list = loadWatchlist().filter((x) => x.symbol !== symbol);
  saveWatchlist(list);
  return list;
}

export function loadUserSetups(): UserSetup[] {
  return readJson<UserSetup[]>(SETUPS_KEY, []);
}

export function saveUserSetups(setups: UserSetup[]) {
  writeJson(SETUPS_KEY, setups);
}

export function createUserSetup(input: {
  name: string;
  conditions: UserSetupCondition[];
  timeframe: UserSetup['timeframe'];
}): UserSetup[] {
  const setups = loadUserSetups();
  setups.unshift({
    id: `setup-${Date.now()}`,
    name: input.name.trim() || 'Untitled setup',
    conditions: input.conditions,
    timeframe: input.timeframe,
    createdAt: Date.now(),
  });
  saveUserSetups(setups);
  return setups;
}

export function deleteUserSetup(id: string): UserSetup[] {
  const setups = loadUserSetups().filter((s) => s.id !== id);
  saveUserSetups(setups);
  return setups;
}

export function cacheLastResults(results: RadarResult[]) {
  writeJson(LAST_RESULTS_KEY, results);
}

export function loadLastResults(): RadarResult[] {
  const day = loadRadarDayBoard();
  if (day.length) return day;
  return liveOnly(readJson<RadarResult[]>(LAST_RESULTS_KEY, []));
}

export const CONDITION_LABELS: Record<UserSetupCondition, string> = {
  liquidity_sweep: 'Liquidity Sweep',
  structure_shift: 'Structure Shift',
  volume_expansion: 'Volume Expansion',
  htf_bullish: 'HTF Bullish',
  htf_bearish: 'HTF Bearish',
  breakout: 'Breakout',
  breakdown: 'Breakdown',
  reversal: 'Reversal',
};
