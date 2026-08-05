/**
 * Wolf Mentor Arena — arcade survival: lives, score, waves, speed bonus.
 */

export type ArenaStats = {
  streakDays: number;
  lastPlayDate: string;
  roundsPlayed: number;
  bestCombo: number;
  totalCorrect: number;
  todayXp: number;
  todayKey: string;
  highScore: number;
  bestWave: number;
};

export type ArenaRoundResult = {
  correct: number;
  total: number;
  comboMax: number;
  xpEarned: number;
  score: number;
  wave: number;
  timedOut: boolean;
  survived: boolean;
};

export const ARENA_LIVES = 3;
export const ARENA_WAVE_SIZE = 3;
export const ARENA_MAX_WAVES = 5;
export const ARENA_Q_SECONDS = 18;
export const ARENA_XP_HIT = 12;
export const ARENA_XP_COMBO = 5;
export const ARENA_XP_WAVE = 20;
export const ARENA_XP_PERFECT = 40;

const STORAGE = 'wolf_mentor_arena_v2';

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
    highScore: 0,
    bestWave: 0,
  };
}

export function loadArenaStats(ownerKey = 'guest'): ArenaStats {
  if (typeof window === 'undefined') return emptyStats();
  try {
    const raw =
      window.localStorage.getItem(`${STORAGE}:${ownerKey}`) ||
      window.localStorage.getItem(`wolf_mentor_arena_v1:${ownerKey}`);
    const parsed = raw ? (JSON.parse(raw) as Partial<ArenaStats>) : null;
    if (!parsed || typeof parsed !== 'object') return emptyStats();
    const day = todayKey();
    return {
      ...emptyStats(),
      ...parsed,
      todayXp: parsed.todayKey === day ? Number(parsed.todayXp) || 0 : 0,
      todayKey: day,
      highScore: Number(parsed.highScore) || 0,
      bestWave: Number(parsed.bestWave) || 0,
    };
  } catch {
    return emptyStats();
  }
}

function saveArenaStats(stats: ArenaStats, ownerKey = 'guest'): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${STORAGE}:${ownerKey}`, JSON.stringify(stats));
}

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

/** Points for a hit — faster answers pay more. */
export function scoreArenaHit(
  combo: number,
  correct: boolean,
  secondsLeft: number,
  qSeconds = ARENA_Q_SECONDS,
): { xp: number; points: number; nextCombo: number; speedBonus: number } {
  if (!correct) return { xp: 0, points: 0, nextCombo: 0, speedBonus: 0 };
  const nextCombo = combo + 1;
  const speedPct = Math.max(0, Math.min(1, secondsLeft / qSeconds));
  const speedBonus = Math.round(speedPct * 80);
  const comboMult = 1 + Math.max(0, nextCombo - 1) * 0.35;
  const points = Math.round((100 + speedBonus) * comboMult);
  const xp = ARENA_XP_HIT + Math.max(0, nextCombo - 1) * ARENA_XP_COMBO + Math.round(speedBonus / 20);
  return { xp, points, nextCombo, speedBonus };
}

export function recordArenaRound(result: ArenaRoundResult, ownerKey = 'guest'): ArenaStats {
  const base = touchArenaStreak(ownerKey);
  const clearBonus = result.survived ? ARENA_XP_PERFECT : 0;
  const waveBonus = Math.max(0, result.wave - 1) * ARENA_XP_WAVE;
  const xpEarned = result.xpEarned + clearBonus + waveBonus;
  const next: ArenaStats = {
    ...base,
    roundsPlayed: (base.roundsPlayed || 0) + 1,
    bestCombo: Math.max(base.bestCombo || 0, result.comboMax),
    totalCorrect: (base.totalCorrect || 0) + result.correct,
    todayXp: (base.todayXp || 0) + xpEarned,
    todayKey: todayKey(),
    highScore: Math.max(base.highScore || 0, result.score),
    bestWave: Math.max(base.bestWave || 0, result.wave),
  };
  saveArenaStats(next, ownerKey);
  return next;
}

export function arenaRankTitle(stats: ArenaStats): string {
  const score = stats.highScore || 0;
  if (score >= 5000) return 'Legend';
  if (score >= 2500) return 'Arena Ace';
  if (score >= 1000) return 'Process Pro';
  if (score >= 300) return 'Tape Rookie';
  return 'New Challenger';
}

/** Tiny WebAudio beeps — no asset files needed. */
export function playArenaSfx(kind: 'hit' | 'miss' | 'combo' | 'go' | 'wave' | 'over') {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    const table: Record<string, { f: number; t: number; type: OscillatorType }> = {
      hit: { f: 660, t: 0.08, type: 'square' },
      miss: { f: 140, t: 0.16, type: 'sawtooth' },
      combo: { f: 880, t: 0.12, type: 'triangle' },
      go: { f: 520, t: 0.14, type: 'square' },
      wave: { f: 740, t: 0.18, type: 'triangle' },
      over: { f: 110, t: 0.28, type: 'sine' },
    };
    const cfg = table[kind] || table.hit;
    o.type = cfg.type;
    o.frequency.setValueAtTime(cfg.f, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + cfg.t);
    o.start(now);
    o.stop(now + cfg.t + 0.02);
    window.setTimeout(() => void ctx.close(), 400);
  } catch {
    /* ignore audio failures */
  }
}
