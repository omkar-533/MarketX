/**
 * Trader skill profile from journal + mentor drills — local progression.
 */
import { loadLocalTrades } from './journalSyncService';
import { computeRiskDrift } from './journalAiAssist';
import { loadDrillResults } from './mentorDrills';
import type { TradeRecord } from '../types/journal';

export type SkillScores = {
  marketReading: number;
  entryTiming: number;
  riskManagement: number;
  patience: number;
};

export type TraderLevel = {
  id: string;
  label: string;
  minXp: number;
};

export const TRADER_LEVELS: TraderLevel[] = [
  { id: 'beginner', label: 'Beginner Trader', minXp: 0 },
  { id: 'sms', label: 'Smart Money Student', minXp: 40 },
  { id: 'analyst', label: 'Market Analyst', minXp: 120 },
  { id: 'institutional', label: 'Institutional Thinker', minXp: 260 },
];

export type Achievement = {
  id: string;
  label: string;
  earned: boolean;
  detail: string;
};

export type TraderSkillProfile = {
  scores: SkillScores;
  weakness: string;
  focusWeek: string[];
  level: TraderLevel;
  xp: number;
  achievements: Achievement[];
  drillsCorrect: number;
  drillsTotal: number;
  journalStreakDays: number;
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function tagBlob(trades: TradeRecord[]) {
  return trades
    .flatMap((t) => [...(t.tags || []), t.notes || '', t.psychologyNote || ''])
    .join(' ')
    .toLowerCase();
}

function journalStreak(trades: TradeRecord[]): number {
  const days = new Set(
    trades
      .map((t) => String(t.date || t.createdAt || '').slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  );
  if (!days.size) return 0;
  let streak = 0;
  const cur = new Date();
  for (let i = 0; i < 60; i += 1) {
    const key = cur.toISOString().slice(0, 10);
    if (days.has(key)) streak += 1;
    else if (streak > 0) break;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export function buildTraderSkillProfile(
  ownerKey = 'guest',
  user?: { id?: string; email?: string } | null,
): TraderSkillProfile {
  // Journal store keys off id/email; cast keeps callers free of full User shape.
  const trades = loadLocalTrades((user as Parameters<typeof loadLocalTrades>[0]) ?? null);
  const drills = loadDrillResults(ownerKey);
  const drillsTotal = drills.length;
  const drillsCorrect = drills.filter((d) => d.correct).length;
  const marketReading = drillsTotal
    ? clamp((drillsCorrect / drillsTotal) * 100)
    : 50;

  const withLevels = trades.filter((t) => t.stopLoss > 0 && t.target > 0).length;
  const riskCompleteness = trades.length
    ? clamp((withLevels / trades.length) * 100)
    : 55;
  const drift = computeRiskDrift(trades);
  const riskManagement = clamp(
    riskCompleteness - (drift.severity === 'elevated' ? 18 : drift.severity === 'mild' ? 10 : 0),
  );

  const blob = tagBlob(trades);
  const fomoHits = (blob.match(/\bfomo|revenge|late entry|early entry|over.?trad/gi) || []).length;
  const patience = clamp(78 - fomoHits * 8 + (drillsCorrect > 5 ? 5 : 0));

  const early = (blob.match(/\bearly entry|chased|fomo\b/gi) || []).length;
  const entryTiming = clamp(70 - early * 7 + (drillsCorrect / Math.max(1, drillsTotal)) * 20);

  const scores: SkillScores = {
    marketReading,
    entryTiming,
    riskManagement,
    patience,
  };

  const weakest = (Object.entries(scores) as [keyof SkillScores, number][]).sort(
    (a, b) => a[1] - b[1],
  )[0];

  const focusMap: Record<keyof SkillScores, string[]> = {
    marketReading: [
      'Run 5 structure drills this week',
      'Mark BOS/CHoCH on one chart daily without taking a trade',
      'Write one invalidation sentence before any entry',
    ],
    entryTiming: [
      'Practice wait-for-confirmation quizzes only',
      'Journal whether entry was early / on-time / late',
      'No chase tags for 7 days',
    ],
    riskManagement: [
      'Log SL and target on every trade',
      'Keep size consistent for 7 sessions',
      'Review risk drift in Journal Overview',
    ],
    patience: [
      'Liquidity + confirmation practice only',
      'Skip the first impulse candle after news',
      'Use Socratic mode: answer why before acting',
    ],
  };

  const xp = drillsCorrect * 4 + trades.length * 2 + journalStreak(trades) * 3;
  const level =
    [...TRADER_LEVELS].reverse().find((l) => xp >= l.minXp) ?? TRADER_LEVELS[0];

  const streak = journalStreak(trades);
  const revengeWeek = /\brevenge\b/i.test(
    trades
      .filter((t) => {
        const d = new Date(t.date || t.createdAt || 0).getTime();
        return Date.now() - d < 7 * 86400000;
      })
      .map((t) => (t.tags || []).join(' '))
      .join(' '),
  );

  const achievements: Achievement[] = [
    {
      id: 'drills50',
      label: '50 correct analysis drills',
      earned: drillsCorrect >= 50,
      detail: `${drillsCorrect}/50`,
    },
    {
      id: 'streak30',
      label: '30-day journal discipline',
      earned: streak >= 30,
      detail: `${streak} day streak`,
    },
    {
      id: 'noRevenge',
      label: 'Zero revenge trading (7d)',
      earned: trades.length > 0 && !revengeWeek,
      detail: revengeWeek ? 'Revenge tag found' : 'Clean week',
    },
  ];

  const weaknessLabel: Record<keyof SkillScores, string> = {
    marketReading: 'Market reading consistency',
    entryTiming: 'Early / chased entries',
    riskManagement: 'Risk & level completeness',
    patience: 'Patience / FOMO pressure',
  };

  return {
    scores,
    weakness: weaknessLabel[weakest[0]],
    focusWeek: focusMap[weakest[0]],
    level,
    xp,
    achievements,
    drillsCorrect,
    drillsTotal,
    journalStreakDays: streak,
  };
}

export function trainingPlanPrompt(profile: TraderSkillProfile): string {
  return [
    'Build my personalized 7-day training path as Hunter.',
    `Weakness: ${profile.weakness}.`,
    `Scores — Reading ${profile.scores.marketReading}, Timing ${profile.scores.entryTiming}, Risk ${profile.scores.riskManagement}, Patience ${profile.scores.patience}.`,
    `Suggested focus: ${profile.focusWeek.join('; ')}.`,
    'Give a day-by-day practice plan (process only — no Entry/Stop/Target). Keep it under 150 words.',
  ].join(' ');
}
