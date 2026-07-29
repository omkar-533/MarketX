import type { TradeRecord } from '../types/journal';
import { getJournalCompletenessWarnings } from './masterAiService';

export const WOLF_AI_PENDING_PROMPT_KEY = 'wolf_ai_pending_prompt';

/** Prompt seeded into Wolf AI when user taps “Review with Hunter”. */
export const JOURNAL_HUNTER_REVIEW_PROMPT =
  'Review my trading journal for patterns in discipline, mistakes and edge — coaching tone only. Cover journal quality, risk drift, and what to focus on next.';

export type CoachTone = 'good' | 'warning' | 'info';

export type CoachTip = {
  id: string;
  tone: CoachTone;
  title: string;
  detail: string;
};

export type JournalQuality = {
  score: number;
  label: string;
  tradeCount: number;
  missingFieldHits: number;
  topGaps: string[];
};

export type RiskDrift = {
  enoughData: boolean;
  severity: 'none' | 'mild' | 'elevated';
  title: string;
  detail: string;
  earlyAbsPnl: number;
  lateAbsPnl: number;
  earlySize: number;
  lateSize: number;
  outlierCount: number;
};

export type SessionRecap = {
  todayCount: number;
  todayPnl: number;
  todayWins: number;
  todayLosses: number;
  weekCount: number;
  weekPnl: number;
  weekWins: number;
  weekLosses: number;
  topInstrument: string | null;
  headline: string;
  subline: string;
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function scoreTradeCompleteness(t: TradeRecord): number {
  let pts = 0;
  const max = 10;
  if (t.instrument) pts += 1;
  if (Number(t.entryPrice) && Number(t.exitPrice)) pts += 1;
  if (Number(t.stopLoss) && Number(t.target)) pts += 1;
  if (Number(t.quantity)) pts += 1;
  if (t.strategy && t.strategy !== 'Manual') pts += 1;
  if (t.type && t.side) pts += 1;
  if (Number.isFinite(Number(t.pnl))) pts += 1;
  if (String(t.notes || '').trim()) pts += 1;
  if (t.screenshot) pts += 1;
  if (
    [t.beforeEmotion, t.afterEmotion, t.psychologyNote].some((x) => String(x || '').trim()) ||
    (Array.isArray(t.tags) && t.tags.length > 0)
  ) {
    pts += 1;
  }
  return Math.round((pts / max) * 100);
}

function qualityLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 55) return 'Average';
  if (score >= 35) return 'Incomplete';
  return 'Poor';
}

export function computeJournalQuality(trades: TradeRecord[]): JournalQuality {
  if (!trades.length) {
    return {
      score: 0,
      label: 'Empty',
      tradeCount: 0,
      missingFieldHits: 0,
      topGaps: ['Log your first trade to unlock quality scoring'],
    };
  }
  const scores = trades.map(scoreTradeCompleteness);
  const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const gapCounts = new Map<string, number>();
  let missingFieldHits = 0;
  for (const t of trades) {
    const warns = getJournalCompletenessWarnings(t);
    missingFieldHits += warns.length;
    for (const w of warns) {
      gapCounts.set(w, (gapCounts.get(w) || 0) + 1);
    }
  }
  const topGaps = [...gapCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, n]) => `${label} (${n})`);
  return {
    score,
    label: qualityLabel(score),
    tradeCount: trades.length,
    missingFieldHits,
    topGaps: topGaps.length ? topGaps : ['Journal looks complete on logged fields'],
  };
}

export function computeRiskDrift(trades: TradeRecord[]): RiskDrift {
  const empty: RiskDrift = {
    enoughData: false,
    severity: 'none',
    title: 'Risk drift',
    detail: 'Need ~6+ trades for a reliable early→late risk cue.',
    earlyAbsPnl: 0,
    lateAbsPnl: 0,
    earlySize: 0,
    lateSize: 0,
    outlierCount: 0,
  };
  if (trades.length < 6) return empty;

  const chrono = [...trades].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const mid = Math.floor(chrono.length / 2);
  const halfStats = (slice: TradeRecord[]) => {
    const pnls = slice.map((t) => Math.abs(Number(t.pnl || 0)));
    const sizes = slice.map((t) => Number(t.quantity || 0)).filter((n) => n > 0);
    return {
      avgAbsPnl: pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0,
      avgSize: sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0,
    };
  };
  const early = halfStats(chrono.slice(0, mid || 1));
  const late = halfStats(chrono.slice(mid));

  const absPnls = chrono.map((t) => Math.abs(Number(t.pnl || 0)));
  const medPnl = median(absPnls.filter((n) => n > 0));
  const sizes = chrono.map((t) => Number(t.quantity || 0)).filter((n) => n > 0);
  const medSize = median(sizes);
  const outlierCount = chrono.filter((t) => {
    const ap = Math.abs(Number(t.pnl || 0));
    const q = Number(t.quantity || 0);
    return (medPnl > 0 && ap > medPnl * 2.5) || (medSize > 0 && q > medSize * 2.5);
  }).length;

  const pnlRatio = early.avgAbsPnl > 0 ? late.avgAbsPnl / early.avgAbsPnl : late.avgAbsPnl > 0 ? 2 : 1;
  const sizeRatio = early.avgSize > 0 ? late.avgSize / early.avgSize : late.avgSize > 0 ? 2 : 1;
  const elevated = pnlRatio >= 1.6 || sizeRatio >= 1.6 || outlierCount >= 3;
  const mild = pnlRatio >= 1.25 || sizeRatio >= 1.25 || outlierCount >= 1;

  return {
    enoughData: true,
    severity: elevated ? 'elevated' : mild ? 'mild' : 'none',
    title: elevated ? 'Risk size drifting up' : mild ? 'Mild risk drift' : 'Risk stable',
    detail: elevated
      ? `|PnL| ${early.avgAbsPnl.toFixed(0)}→${late.avgAbsPnl.toFixed(0)} · size ${early.avgSize.toFixed(1)}→${late.avgSize.toFixed(1)}. ${outlierCount} outlier(s). Tighten size rules before next session.`
      : mild
        ? `Early→late cue shows a slight rise in risk. Outliers: ${outlierCount}. Keep size consistent.`
        : `Early→late risk looks steady. Outliers vs median: ${outlierCount}.`,
    earlyAbsPnl: early.avgAbsPnl,
    lateAbsPnl: late.avgAbsPnl,
    earlySize: early.avgSize,
    lateSize: late.avgSize,
    outlierCount,
  };
}

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inRange(trade: TradeRecord, from: Date, to: Date): boolean {
  const t = new Date(trade.date).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export function buildSessionRecap(trades: TradeRecord[]): SessionRecap {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const today = trades.filter((t) => inRange(t, todayStart, end));
  const week = trades.filter((t) => inRange(t, weekStart, end));

  const sum = (list: TradeRecord[]) => list.reduce((s, t) => s + Number(t.pnl || 0), 0);
  const wins = (list: TradeRecord[]) => list.filter((t) => t.pnl > 0).length;
  const losses = (list: TradeRecord[]) => list.filter((t) => t.pnl < 0).length;

  const todayPnl = sum(today);
  const weekPnl = sum(week);
  const todayCount = today.length;
  const weekCount = week.length;

  const instrumentCounts = new Map<string, number>();
  for (const t of week) {
    const k = t.instrument || '?';
    instrumentCounts.set(k, (instrumentCounts.get(k) || 0) + 1);
  }
  const topInstrument =
    [...instrumentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  let headline: string;
  let subline: string;
  if (!trades.length) {
    headline = 'No sessions yet';
    subline = 'Log a trade — AI Desk will auto-build today’s recap.';
  } else if (todayCount === 0 && weekCount === 0) {
    headline = 'Quiet window';
    subline = 'No trades in the last 7 days. Consistency compounds.';
  } else if (todayCount > 0) {
    headline = `Today · ${todayCount} trade${todayCount === 1 ? '' : 's'}`;
    subline = `${wins(today)}W / ${losses(today)}L · net ${todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(0)}${
      topInstrument ? ` · focus ${topInstrument}` : ''
    }`;
  } else {
    headline = `7-day · ${weekCount} trade${weekCount === 1 ? '' : 's'}`;
    subline = `${wins(week)}W / ${losses(week)}L · net ${weekPnl >= 0 ? '+' : ''}${weekPnl.toFixed(0)}${
      topInstrument ? ` · most traded ${topInstrument}` : ''
    }`;
  }

  return {
    todayCount,
    todayPnl,
    todayWins: wins(today),
    todayLosses: losses(today),
    weekCount,
    weekPnl,
    weekWins: wins(week),
    weekLosses: losses(week),
    topInstrument,
    headline,
    subline,
  };
}

export type CoachMetricsInput = {
  winRate: number;
  avgRR: number;
  streak: number;
  totalTrades: number;
  disciplineScore: number;
};

export function buildAutoCoachTips(
  trades: TradeRecord[],
  metrics: CoachMetricsInput,
): CoachTip[] {
  const tips: CoachTip[] = [];
  const quality = computeJournalQuality(trades);
  const drift = computeRiskDrift(trades);
  const recap = buildSessionRecap(trades);

  const repeatedTags = [...new Set(trades.flatMap((t) => (Array.isArray(t.tags) ? t.tags : [])))]
    .map((tag) => ({
      tag,
      count: trades.filter((t) => (Array.isArray(t.tags) ? t.tags : []).includes(tag)).length,
    }))
    .sort((a, b) => b.count - a.count);

  if (!trades.length) {
    tips.push({
      id: 'start',
      tone: 'info',
      title: 'Start the desk',
      detail: 'Log your first completed trade — quality scoring and recap unlock automatically.',
    });
    return tips;
  }

  if (quality.score < 55) {
    tips.push({
      id: 'quality',
      tone: 'warning',
      title: 'Journal quality low',
      detail: `Avg completeness ${quality.score}/100. Top gap: ${quality.topGaps[0] || 'fill notes & screenshots'}.`,
    });
  } else if (quality.score >= 85) {
    tips.push({
      id: 'quality-good',
      tone: 'good',
      title: 'Logging discipline strong',
      detail: `Completeness ${quality.score}/100 (${quality.label}). Keep the same standard on every save.`,
    });
  }

  if (metrics.winRate < 50 && metrics.totalTrades >= 5) {
    tips.push({
      id: 'winrate',
      tone: 'warning',
      title: 'Win rate below target',
      detail: 'Focus on cleaner entries and patient execution — process over outcome.',
    });
  }

  if (metrics.avgRR < 1.5 && metrics.totalTrades >= 3) {
    tips.push({
      id: 'rr',
      tone: 'warning',
      title: 'Reward-to-risk soft',
      detail: 'Average R:R is low. Improve trade quality and protect edge.',
    });
  }

  if (metrics.disciplineScore < 75) {
    tips.push({
      id: 'discipline',
      tone: 'warning',
      title: 'Discipline watch',
      detail: 'Recent discipline score is soft. Revisit stop respect and pre-trade checklist.',
    });
  }

  if (metrics.streak >= 3) {
    tips.push({
      id: 'streak',
      tone: 'good',
      title: `${metrics.streak}-win streak`,
      detail: 'Momentum is real — keep size rules fixed so confidence does not inflate risk.',
    });
  } else if (metrics.streak === 0 && metrics.totalTrades > 0) {
    tips.push({
      id: 'neutral',
      tone: 'info',
      title: 'Neutral phase',
      detail: 'Revisit your trade checklist before the next setup.',
    });
  }

  if (drift.enoughData && drift.severity !== 'none') {
    tips.push({
      id: 'drift',
      tone: drift.severity === 'elevated' ? 'warning' : 'info',
      title: drift.title,
      detail: drift.detail,
    });
  }

  if (repeatedTags[0] && repeatedTags[0].count >= 2) {
    tips.push({
      id: 'tag',
      tone: 'info',
      title: `Pattern: ${repeatedTags[0].tag}`,
      detail: `Seen ${repeatedTags[0].count}×. Review those tags for process vs luck.`,
    });
  }

  if (recap.todayCount >= 4) {
    tips.push({
      id: 'overtrade',
      tone: 'warning',
      title: 'Busy session',
      detail: `${recap.todayCount} trades today. Pause and check if setups still meet A+ criteria.`,
    });
  }

  if (!tips.length) {
    tips.push({
      id: 'clean',
      tone: 'good',
      title: 'Process looks clean',
      detail: 'Keep consistency and protect your edge. Review with Hunter when you want a deep pass.',
    });
  }

  return tips.slice(0, 6);
}

export function queueHunterJournalReview(prompt = JOURNAL_HUNTER_REVIEW_PROMPT) {
  try {
    window.sessionStorage.setItem(WOLF_AI_PENDING_PROMPT_KEY, prompt);
  } catch {
    /* private mode */
  }
}

export function consumeHunterPendingPrompt(): string | null {
  try {
    const raw = window.sessionStorage.getItem(WOLF_AI_PENDING_PROMPT_KEY);
    if (!raw?.trim()) return null;
    window.sessionStorage.removeItem(WOLF_AI_PENDING_PROMPT_KEY);
    return raw.trim();
  } catch {
    return null;
  }
}
