/**
 * Module 3 — Wolf AI Performance Coach.
 * Reviews historical journal trades only — never invents new Entry/SL/Target orders.
 */
import type { TradeRecord } from '../types/journal';
import {
  buildAutoCoachTips,
  buildSessionRecap,
  computeJournalQuality,
  computeRiskDrift,
  type CoachTip,
} from './journalAiAssist';
import { buildPsychologyAnalytics } from './journalPsychAnalytics';
import { buildTraderSkillProfile, type TraderSkillProfile } from './traderSkillProfile';

export type PerformanceSnapshot = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgRR: number;
  streak: number;
  totalPnl: number;
  disciplineScore: number;
  psychologyScore: number;
  riskScore: number;
  executionScore: number;
  overallProgress: number;
  journalQuality: number;
  tips: CoachTip[];
  recapHeadline: string;
  recapSubline: string;
  patterns: string[];
  weakness: string;
  focusWeek: string[];
  recentTrades: TradeRecord[];
};

export type CoachGoalId = 'max2trades' | 'minRR' | 'noRevenge' | 'journalDaily' | 'reviewDaily';

export type CoachGoals = Record<CoachGoalId, boolean>;

export type CoachHabitId = 'morning' | 'plan' | 'journal' | 'review' | 'revision';

export type CoachHabits = {
  date: string; // YYYY-MM-DD
  checks: Record<CoachHabitId, boolean>;
  streak: number;
};

const GOALS_KEY = 'wolf_mentor_coach_goals_v1';
const HABITS_KEY = 'wolf_mentor_coach_habits_v1';

export const COACH_GOAL_OPTIONS: { id: CoachGoalId; label: string }[] = [
  { id: 'max2trades', label: 'Max 2 trades / day' },
  { id: 'minRR', label: 'Respect planned R:R process' },
  { id: 'noRevenge', label: 'No revenge trading' },
  { id: 'journalDaily', label: 'Journal every session' },
  { id: 'reviewDaily', label: 'End-of-day review' },
];

export const COACH_HABIT_OPTIONS: { id: CoachHabitId; label: string }[] = [
  { id: 'morning', label: 'Morning analysis' },
  { id: 'plan', label: 'Trading plan ready' },
  { id: 'journal', label: 'Journal written' },
  { id: 'review', label: 'Review completed' },
  { id: 'revision', label: 'Revision done' },
];

export const COACH_FOLLOWUPS = [
  {
    id: 'loss',
    label: 'Loss review',
    prompt:
      'I took a loss. Coach me with Socratic questions on plan vs impulse, confirmation, risk, stop respect, exit process — historical review only. No new Entry/SL/Target orders.',
  },
  {
    id: 'week',
    label: 'Weekly review',
    prompt:
      'Give a weekly performance coaching review from my journal stats: wins, discipline, psychology, biggest mistake, focus next week. No new trade orders.',
  },
  {
    id: 'psych',
    label: 'Psychology check',
    prompt:
      'Analyze my psychology from journal emotions and scores. Name patterns (FOMO, revenge, overconfidence) with supportive coaching. No Entry/SL/Target.',
  },
  {
    id: 'plan',
    label: 'Improvement plan',
    prompt:
      'Build a personalized improvement plan from my weakness + tips: homework process drills only (identify on chart / journal), link Module 1 topics if useful. Never invent trade orders.',
  },
  {
    id: 'reflect',
    label: 'Daily reflection',
    prompt:
      'Run daily reflection: ask best decision, biggest mistake, plan followed?, emotion, one improvement for tomorrow. Keep it short and supportive.',
  },
] as const;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function storageKey(base: string, ownerKey: string) {
  return `${base}:${ownerKey || 'guest'}`;
}

export function loadCoachGoals(ownerKey = 'guest'): CoachGoals {
  const defaults: CoachGoals = {
    max2trades: true,
    minRR: true,
    noRevenge: true,
    journalDaily: true,
    reviewDaily: false,
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(storageKey(GOALS_KEY, ownerKey));
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as CoachGoals) };
  } catch {
    return defaults;
  }
}

export function saveCoachGoals(goals: CoachGoals, ownerKey = 'guest') {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(GOALS_KEY, ownerKey), JSON.stringify(goals));
}

export function loadCoachHabits(ownerKey = 'guest'): CoachHabits {
  const emptyChecks = Object.fromEntries(COACH_HABIT_OPTIONS.map((h) => [h.id, false])) as Record<
    CoachHabitId,
    boolean
  >;
  const fallback: CoachHabits = { date: todayKey(), checks: emptyChecks, streak: 0 };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(HABITS_KEY, ownerKey));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as CoachHabits;
    if (parsed.date !== todayKey()) {
      const yesterdayDone = Object.values(parsed.checks || {}).every(Boolean);
      return {
        date: todayKey(),
        checks: emptyChecks,
        streak: yesterdayDone ? (parsed.streak || 0) + 0 : parsed.streak || 0,
      };
    }
    return {
      date: parsed.date,
      checks: { ...emptyChecks, ...parsed.checks },
      streak: parsed.streak || 0,
    };
  } catch {
    return fallback;
  }
}

export function saveCoachHabits(habits: CoachHabits, ownerKey = 'guest') {
  if (typeof window === 'undefined') return;
  const allDone = Object.values(habits.checks).every(Boolean);
  const next = {
    ...habits,
    date: todayKey(),
    streak: allDone ? Math.max(habits.streak, 1) : habits.streak,
  };
  if (allDone && habits.streak === 0) next.streak = 1;
  window.localStorage.setItem(storageKey(HABITS_KEY, ownerKey), JSON.stringify(next));
}

function winStreak(trades: TradeRecord[]): number {
  const sorted = [...trades].sort(
    (a, b) => Date.parse(b.date || b.createdAt) - Date.parse(a.date || a.createdAt),
  );
  let streak = 0;
  for (const t of sorted) {
    if ((t.pnl ?? 0) > 0) streak += 1;
    else break;
  }
  return streak;
}

function detectPatterns(trades: TradeRecord[]): string[] {
  if (trades.length < 3) return ['Log more trades to unlock pattern insights.'];
  const out: string[] = [];
  const byDow = new Map<number, { n: number; pnl: number }>();
  for (const t of trades) {
    const d = new Date(t.date || t.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const dow = d.getDay();
    const cur = byDow.get(dow) ?? { n: 0, pnl: 0 };
    cur.n += 1;
    cur.pnl += t.pnl || 0;
    byDow.set(dow, cur);
  }
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let best: { day: string; avg: number } | null = null;
  let worst: { day: string; avg: number } | null = null;
  for (const [dow, v] of byDow) {
    if (v.n < 2) continue;
    const avg = v.pnl / v.n;
    const day = names[dow];
    if (!best || avg > best.avg) best = { day, avg };
    if (!worst || avg < worst.avg) worst = { day, avg };
  }
  if (best) out.push(`${best.day} sessions show relatively stronger average PnL in your sample.`);
  if (worst && worst.day !== best?.day) {
    out.push(`${worst.day} sessions show softer average PnL — review process, not just outcomes.`);
  }

  const breakout = trades.filter((t) => /breakout/i.test([t.strategy, t.notes, ...(t.tags || [])].join(' ')));
  const reverse = trades.filter((t) => /reversal|fade/i.test([t.strategy, t.notes, ...(t.tags || [])].join(' ')));
  if (breakout.length >= 2) {
    const wr = breakout.filter((t) => (t.pnl || 0) > 0).length / breakout.length;
    out.push(`Breakout-tagged trades: sample win rate ${(wr * 100).toFixed(0)}% (${breakout.length} trades).`);
  }
  if (reverse.length >= 2) {
    const wr = reverse.filter((t) => (t.pnl || 0) > 0).length / reverse.length;
    out.push(`Reversal-tagged trades: sample win rate ${(wr * 100).toFixed(0)}% — study confirmation quality.`);
  }

  const revenge = trades.filter((t) =>
    /revenge|fomo|overtrad/i.test([t.psychologyNote, t.notes, t.afterEmotion, ...(t.tags || [])].join(' ')),
  );
  if (revenge.length) {
    out.push(`${revenge.length} trade(s) flagged with FOMO/revenge/overtrading language — priority coaching topic.`);
  }

  return out.slice(0, 5);
}

export function buildPerformanceSnapshot(
  trades: TradeRecord[],
  ownerKey: string,
  user?: { id?: string; email?: string } | null,
): PerformanceSnapshot & { skill: TraderSkillProfile } {
  const skill = buildTraderSkillProfile(ownerKey, user);
  const psych = buildPsychologyAnalytics(trades);
  const quality = computeJournalQuality(trades);
  const recap = buildSessionRecap(trades);
  const drift = computeRiskDrift(trades);

  const closed = trades.filter((t) => Number.isFinite(t.pnl));
  const wins = closed.filter((t) => (t.pnl || 0) > 0);
  const losses = closed.filter((t) => (t.pnl || 0) < 0);
  const winRate = closed.length ? Math.round((wins.length / closed.length) * 100) : 0;
  const rrVals = closed.map((t) => Number(t.rr)).filter((n) => Number.isFinite(n) && n > 0);
  const avgRR = rrVals.length
    ? Math.round((rrVals.reduce((a, b) => a + b, 0) / rrVals.length) * 10) / 10
    : 0;
  const streak = winStreak(closed);
  const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);

  const disciplineScore = psych.gauges.find((g) => g.key === 'discipline')?.value || skill.scores.riskManagement;
  const psychologyScore =
    typeof (psych as { mindScore?: number }).mindScore === 'number'
      ? (psych as { mindScore: number }).mindScore
      : Math.round(
          0.35 * (psych.gauges.find((g) => g.key === 'confidence')?.value || 50) +
            0.45 * disciplineScore +
            0.2 * (100 - (psych.gauges.find((g) => g.key === 'fearGreed')?.value || 50)),
        );
  const riskScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        skill.scores.riskManagement * 0.6 +
          (drift.severity === 'elevated' ? 35 : drift.severity === 'mild' ? 55 : 85) * 0.4,
      ),
    ),
  );
  const executionScore = Math.round(
    skill.scores.entryTiming * 0.5 + skill.scores.patience * 0.3 + quality.score * 0.2,
  );
  const overallProgress = Math.round(
    winRate * 0.15 +
      Math.min(avgRR * 25, 100) * 0.1 +
      disciplineScore * 0.2 +
      psychologyScore * 0.2 +
      riskScore * 0.2 +
      executionScore * 0.15,
  );

  const tips = buildAutoCoachTips(closed, {
    winRate,
    avgRR,
    streak,
    totalTrades: closed.length,
    disciplineScore,
  });

  return {
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgRR,
    streak,
    totalPnl,
    disciplineScore,
    psychologyScore,
    riskScore,
    executionScore,
    overallProgress: Math.max(0, Math.min(100, overallProgress)),
    journalQuality: quality.score,
    tips,
    recapHeadline: recap.headline,
    recapSubline: recap.subline,
    patterns: detectPatterns(closed),
    weakness: skill.weakness,
    focusWeek: skill.focusWeek,
    recentTrades: [...closed]
      .sort((a, b) => Date.parse(b.date || b.createdAt) - Date.parse(a.date || a.createdAt))
      .slice(0, 8),
    skill,
  };
}

export function buildCoachBriefingPrompt(snap: PerformanceSnapshot, studentName: string): string {
  const tipLines = snap.tips
    .slice(0, 5)
    .map((t) => `- [${t.tone}] ${t.title}: ${t.detail}`)
    .join('\n');
  const patternLines = snap.patterns.map((p) => `- ${p}`).join('\n');
  const recent = snap.recentTrades
    .slice(0, 5)
    .map(
      (t) =>
        `• ${t.date?.slice(0, 10) || '?'} ${t.instrument} ${t.side} PnL=${t.pnl} RR=${t.rr} disc=${t.discipline ?? '—'} before=${t.beforeEmotion || '—'} after=${t.afterEmotion || '—'} notes=${String(t.notes || '').slice(0, 80)}`,
    )
    .join('\n');

  return `[PERFORMANCE COACH] Module 3 — Wolf AI Performance Coach
Student: ${studentName || 'Trader'}
Mission: Improve habits, discipline, psychology, decision-making. Review HISTORICAL journal only.
NEVER invent new Entry / Stop / Target / Buy / Sell orders. You may discuss logged historical levels.

LIVE STATS
Trades: ${snap.totalTrades} · Win rate: ${snap.winRate}% · Avg RR: ${snap.avgRR}
Discipline: ${snap.disciplineScore}% · Psychology: ${snap.psychologyScore}% · Risk: ${snap.riskScore}%
Execution: ${snap.executionScore}% · Overall progress: ${snap.overallProgress}%
Journal quality: ${snap.journalQuality}%
Weakness focus: ${snap.weakness}
Focus week: ${snap.focusWeek.join('; ')}
Recap: ${snap.recapHeadline} — ${snap.recapSubline}

AUTO TIPS
${tipLines || '- none'}

PATTERNS
${patternLines || '- none yet'}

RECENT TRADES (historical)
${recent || '- no trades logged'}

Deliver:
### Performance read
### Mistakes / process gaps (technical + discipline + risk — from evidence)
### Psychology notes (supportive, not judgmental)
### Personalized improvement plan (homework = process drills / journal — no trade signals)
### Next practice assignment
### Accountability (if goals look broken, recommend pause/review — supportive tone)
End with one Socratic question for the student.`;
}

export function buildCoachFollowupPrompt(chipPrompt: string, snap: PerformanceSnapshot): string {
  return `[PERFORMANCE COACH FOLLOW-UP] ${chipPrompt}

Context snapshot: trades=${snap.totalTrades} winRate=${snap.winRate}% disc=${snap.disciplineScore} psych=${snap.psychologyScore} weakness=${snap.weakness}
Historical journal review only. Never invent new Entry/Stop/Target orders.`;
}
