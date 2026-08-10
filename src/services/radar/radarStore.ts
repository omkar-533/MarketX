import type { RadarResult, UserSetup, UserSetupCondition, WatchlistItem } from './radarTypes';

const WATCH_KEY = 'wolf_radar_watchlist_v1';
const SETUPS_KEY = 'wolf_radar_setups_v1';
const LAST_RESULTS_KEY = 'wolf_radar_last_results_v1';

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
  return readJson<RadarResult[]>(LAST_RESULTS_KEY, []);
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
