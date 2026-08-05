/**
 * Wolf Mentor Arena — timed process rounds, daily streak, combo XP.
 * Keeps the desk feeling like a game without a separate backend.
 */

export type ArenaStats = {
  streakDays: number;
  lastPlayDate: string;
  roundsPlayed: number;
  bestCombo: number;
  totalCorrect: number;
  todayXp: number;
  todayKey: string;
};

export type ArenaRoundResult = {
  correct: number;
  total: number;
  comboMax: number;
  xpEarned: number;
  timedOut: boolean;
};

export const ARENA_ROUND_SIZE = 3;
export const ARENA_ROUND_SECONDS = 75;
export const ARENA_XP_HIT = 10;
export const ARENA_XP_COMBO = 4;
export const ARENA_XP_PERFECT = 15;

const STORAGE = 'wolf_mentor_arena_v1';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyStats(): ArenaStats {
  return {
    streakDays: 0,
    lastPlayDate: '',
    roundsPlayed: 0,
    bestCombo: 0,
    totalCorrect: 0,
    todayXp: 0,
    todayKey: todayKey(),
  };
}

export function loadArenaStats(ownerKey = 'guest'): ArenaStats {
  if (typeof window === 'undefined') return emptyStats();
  try {
    const raw = window.localStorage.getItem(`${STORAGE}:${ownerKey}`);
    const parsed = raw ? (JSON.parse(raw) as ArenaStats) : null;
    if (!parsed || typeof parsed !== 'object') return emptyStats();
    const day = todayKey();
    return {
      ...emptyStats(),
      ...parsed,
      todayXp: parsed.todayKey === day ? Number(parsed.todayXp) || 0 : 0,
      todayKey: day,
    };
  } catch {
    return emptyStats();
  }
}

function saveArenaStats(stats: ArenaStats, ownerKey = 'guest'): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${STORAGE}:${ownerKey}`, JSON.stringify(stats));
}

/** Call when user starts or finishes any arena activity — keeps the streak alive. */
export function touchArenaStreak(ownerKey = 'guest'): ArenaStats {
  const day = todayKey();
  const prev = loadArenaStats(ownerKey);
  let streakDays = prev.streakDays || 0;
  if (prev.lastPlayDate !== day) {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yKey = y.toISOString().slice(0, 10);
    streakDays = prev.lastPlayDate === yKey ? streakDays + 1 : 1;
  }
  const next: ArenaStats = {
    ...prev,
    streakDays: Math.max(1, streakDays),
    lastPlayDate: day,
    todayKey: day,
    todayXp: prev.todayKey === day ? prev.todayXp : 0,
  };
  saveArenaStats(next, ownerKey);
  return next;
}

export function scoreArenaHit(combo: number, correct: boolean): { xp: number; nextCombo: number } {
  if (!correct) return { xp: 0, nextCombo: 0 };
  const nextCombo = combo + 1;
  const xp = ARENA_XP_HIT + Math.max(0, nextCombo - 1) * ARENA_XP_COMBO;
  return { xp, nextCombo };
}

export function recordArenaRound(result: ArenaRoundResult, ownerKey = 'guest'): ArenaStats {
  const base = touchArenaStreak(ownerKey);
  const perfectBonus =
    result.correct === result.total && result.total >= ARENA_ROUND_SIZE ? ARENA_XP_PERFECT : 0;
  const xpEarned = result.xpEarned + perfectBonus;
  const next: ArenaStats = {
    ...base,
    roundsPlayed: (base.roundsPlayed || 0) + 1,
    bestCombo: Math.max(base.bestCombo || 0, result.comboMax),
    totalCorrect: (base.totalCorrect || 0) + result.correct,
    todayXp: (base.todayXp || 0) + xpEarned,
    todayKey: todayKey(),
  };
  saveArenaStats(next, ownerKey);
  return next;
}

export function arenaRankTitle(stats: ArenaStats): string {
  const xp = stats.todayXp + stats.totalCorrect * 2;
  if (xp >= 400) return 'Arena Ace';
  if (xp >= 180) return 'Process Pro';
  if (xp >= 60) return 'Tape Rookie';
  return 'New Challenger';
}
