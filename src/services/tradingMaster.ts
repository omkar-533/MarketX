/**
 * Module 6 — Wolf AI Institutional Mentor (Trading Master).
 * Personal Trading Brain: DNA, personality, twin, playbook, roadmap.
 * Never executes trades. Never invents live Entry/Stop/Target orders.
 */
import type { TradeRecord } from '../types/journal';
import type { MentorStudentProfile } from './mentorStudentProfile';
import { loadCurriculumProgress, type CurriculumProgress } from './mentorCurriculum';
import { loadLabProgress, type LabProgress } from './tradingLab';
import { buildTradingDna, type TradingDna } from './liveMentor';
import { buildTraderSkillProfile } from './traderSkillProfile';
import { computeJournalQuality } from './journalAiAssist';
import { buildPsychologyAnalytics } from './journalPsychAnalytics';

export type TraderPersonalityId =
  | 'sniper'
  | 'scalper'
  | 'swing'
  | 'emotional'
  | 'overtrader'
  | 'riskTaker'
  | 'ruleFollower';

export type MasterGoalId =
  | 'compliance90'
  | 'rr2'
  | 'max2'
  | 'noRevenge'
  | 'journalDaily';

export type CareerTrackId =
  | 'retail'
  | 'professional'
  | 'funded'
  | 'pm'
  | 'coach'
  | 'institutional';

export type StrategyBuilderInput = {
  capital: string;
  timeStyle: 'intraday' | 'swing' | 'positional';
  market: string;
  riskPct: string;
  style: 'liquidity' | 'structure' | 'breakout' | 'mixed';
};

export type MasterDnaCard = TradingDna & {
  experience: string;
  riskProfile: 'Low' | 'Medium' | 'High';
  bestMarket: string;
  bestTime: string;
  worstTime: string;
  bestStrategy: string;
  worstStrategy: string;
  psychologyNote: string;
  execution: number;
  discipline: number;
  consistency: number;
  personality: TraderPersonalityId;
  personalityLabel: string;
  overallProgress: number;
  knowledge: number;
  currentFocus: string;
  certLevel: number;
  certLabel: string;
  nextLessonHint: string;
  weaknessForecast: string[];
  twinMatchScore: number;
};

export type Playbook = {
  bestSetups: string[];
  worstSetups: string[];
  rules: string[];
  mistakes: string[];
  winningNotes: string[];
  losingNotes: string[];
  learningNotes: string[];
};

export type CommunityInsight = { text: string; tag: string };

export type MasterMemory = {
  notes: string[];
  lastSessionAt: string;
  careerTrack: CareerTrackId;
  goals: Record<MasterGoalId, boolean>;
  strategy: StrategyBuilderInput;
};

const MEMORY_KEY = 'wolf_mentor_master_memory_v1';

export const PERSONALITY_META: Record<
  TraderPersonalityId,
  { label: string; coaching: string }
> = {
  sniper: {
    label: 'The Sniper',
    coaching: 'Few high-quality setups — protect patience, deepen confirmation checklist.',
  },
  scalper: {
    label: 'The Scalper',
    coaching: 'Speed is a skill — pair with hard max-trades and pre-defined invalidation.',
  },
  swing: {
    label: 'The Swing Trader',
    coaching: 'Patience strength — sharpen higher-TF structure and gap risk process.',
  },
  emotional: {
    label: 'The Emotional Trader',
    coaching: 'Emotion first — journal before size; pause rules after losses.',
  },
  overtrader: {
    label: 'The Overtrader',
    coaching: 'Volume is the risk — mission: max 2 process-ready ideas per session.',
  },
  riskTaker: {
    label: 'The Risk Taker',
    coaching: 'Edge dies without size control — lock 1% risk framework before style work.',
  },
  ruleFollower: {
    label: 'The Rule Follower',
    coaching: 'Discipline is an edge — next unlock advanced scenario reading, not more rules.',
  },
};

export const MASTER_GOALS: { id: MasterGoalId; label: string }[] = [
  { id: 'compliance90', label: '90% rule compliance' },
  { id: 'rr2', label: 'Planned RR > 2' },
  { id: 'max2', label: 'Max 2 trades / day' },
  { id: 'noRevenge', label: 'Zero revenge trading' },
  { id: 'journalDaily', label: 'Journal daily' },
];

export const CAREER_TRACKS: { id: CareerTrackId; label: string; next: string }[] = [
  { id: 'retail', label: 'Retail Trader', next: 'Professional process + Lab XP' },
  { id: 'professional', label: 'Professional Trader', next: 'Funded-style risk weeks' },
  { id: 'funded', label: 'Funded Trader', next: 'Consistency + drawdown control' },
  { id: 'pm', label: 'Portfolio Manager', next: 'Multi-market risk framework' },
  { id: 'coach', label: 'Trading Coach', next: 'Teach Module 1 + journal reviews' },
  { id: 'institutional', label: 'Institutional Trader', next: 'Process docs + scenario desk' },
];

export const MASTER_CERTS = [
  'Level 1 · Foundation',
  'Level 2 · Technical',
  'Level 3 · Advanced Price Action',
  'Level 4 · SMC',
  'Level 5 · Professional Trader',
  'Level 6 · Master Trader',
] as const;

export const COMMUNITY_INSIGHTS: CommunityInsight[] = [
  { tag: 'BOS', text: 'Aggregated desk note: many students mis-label BOS without displacement — Module 1 Level drills help.' },
  { tag: 'Liquidity', text: 'After liquidity lessons, average Lab session scores tend to rise (~process, not P&L).' },
  { tag: 'Risk', text: 'Beginners most often struggle with position sizing completeness in journals.' },
  { tag: 'Discipline', text: 'Students who log emotions show steadier consistency indexes over 30+ trades.' },
];

const DEFAULT_STRATEGY: StrategyBuilderInput = {
  capital: '100000',
  timeStyle: 'intraday',
  market: 'NIFTY',
  riskPct: '1',
  style: 'liquidity',
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function storageKey(base: string, ownerKey: string) {
  return `${base}:${ownerKey || 'guest'}`;
}

export function loadMasterMemory(ownerKey = 'guest'): MasterMemory {
  const fallback: MasterMemory = {
    notes: [],
    lastSessionAt: '',
    careerTrack: 'retail',
    goals: {
      compliance90: true,
      rr2: true,
      max2: true,
      noRevenge: true,
      journalDaily: true,
    },
    strategy: { ...DEFAULT_STRATEGY },
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(MEMORY_KEY, ownerKey));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as MasterMemory;
    return {
      ...fallback,
      ...parsed,
      goals: { ...fallback.goals, ...parsed.goals },
      strategy: { ...fallback.strategy, ...parsed.strategy },
    };
  } catch {
    return fallback;
  }
}

export function saveMasterMemory(mem: MasterMemory, ownerKey = 'guest') {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(MEMORY_KEY, ownerKey), JSON.stringify(mem));
}

function hourBucket(trades: TradeRecord[]) {
  const buckets = new Map<number, { n: number; pnl: number }>();
  for (const t of trades) {
    const d = new Date(t.date || t.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    // Approx IST session hours from local if stored as date-only → skip
    const h = d.getHours();
    if (h === 0 && String(t.date || '').length <= 10) continue;
    const cur = buckets.get(h) ?? { n: 0, pnl: 0 };
    cur.n += 1;
    cur.pnl += t.pnl || 0;
    buckets.set(h, cur);
  }
  let best: { h: number; avg: number } | null = null;
  let worst: { h: number; avg: number } | null = null;
  for (const [h, v] of buckets) {
    if (v.n < 2) continue;
    const avg = v.pnl / v.n;
    if (!best || avg > best.avg) best = { h, avg };
    if (!worst || avg < worst.avg) worst = { h, avg };
  }
  const fmt = (h: number) =>
    `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`;
  return {
    bestTime: best ? fmt(best.h) : '09:30–11:00 (default study window)',
    worstTime: worst && worst.h !== best?.h ? fmt(worst.h) : '14:30–15:30 (caution window)',
  };
}

function detectPersonality(trades: TradeRecord[], dna: TradingDna): TraderPersonalityId {
  const n = trades.length;
  const avgPerDay = (() => {
    const days = new Set(trades.map((t) => String(t.date || t.createdAt).slice(0, 10)));
    return days.size ? n / days.size : 0;
  })();
  const blob = trades
    .flatMap((t) => [t.notes, t.psychologyNote, t.afterEmotion, ...(t.tags || [])])
    .join(' ')
    .toLowerCase();
  const emotional =
    /fear|greed|angry|frustrat|revenge|fomo/.test(blob) || dna.emotionalStability < 50;
  if (avgPerDay >= 5 || (n >= 40 && avgPerDay >= 3.5)) return 'overtrader';
  if (emotional && dna.emotionalStability < 55) return 'emotional';
  if (dna.riskDiscipline < 50) return 'riskTaker';
  if (dna.consistencyIndex >= 75 && dna.riskDiscipline >= 70) return 'ruleFollower';
  if (/scalp|1m|3m|fast/.test(blob)) return 'scalper';
  if (/swing|positional|daily/.test(blob) || avgPerDay > 0 && avgPerDay <= 1.2) return 'swing';
  if (avgPerDay > 0 && avgPerDay <= 2.2 && dna.executionQuality >= 65) return 'sniper';
  return dna.learningSpeed >= 70 ? 'ruleFollower' : 'sniper';
}

function strategyQuality(trades: TradeRecord[]) {
  const by = new Map<string, { n: number; wins: number }>();
  for (const t of trades) {
    const key =
      (t.strategy || '').trim() ||
      (t.tags || []).find((x) => /liquidity|breakout|reversal|pullback|bos/i.test(x)) ||
      'unlabeled';
    const cur = by.get(key) ?? { n: 0, wins: 0 };
    cur.n += 1;
    if ((t.pnl || 0) > 0) cur.wins += 1;
    by.set(key, cur);
  }
  let best = 'Liquidity Sweep process';
  let worst = 'Counter-trend without confirmation';
  let bestWr = -1;
  let worstWr = 2;
  for (const [k, v] of by) {
    if (v.n < 2) continue;
    const wr = v.wins / v.n;
    if (wr > bestWr) {
      bestWr = wr;
      best = k;
    }
    if (wr < worstWr) {
      worstWr = wr;
      worst = k;
    }
  }
  return { best, worst };
}

export function buildPlaybook(trades: TradeRecord[], dna: TradingDna): Playbook {
  const wins = trades.filter((t) => (t.pnl || 0) > 0).slice(-5);
  const losses = trades.filter((t) => (t.pnl || 0) < 0).slice(-5);
  const { best, worst } = strategyQuality(trades);
  return {
    bestSetups: [best, ...dna.favoriteSetups].filter(Boolean).slice(0, 4),
    worstSetups: [worst, ...dna.commonMistakes].filter(Boolean).slice(0, 4),
    rules: [
      'Define invalidation before entry (process)',
      'Max risk per idea from personal framework',
      'No revenge re-entry within same session impulse',
    ],
    mistakes: dna.commonMistakes,
    winningNotes: wins.map(
      (t) => `${t.instrument}: ${String(t.notes || t.strategy || 'process win').slice(0, 80)}`,
    ),
    losingNotes: losses.map(
      (t) => `${t.instrument}: ${String(t.notes || t.psychologyNote || 'review loss process').slice(0, 80)}`,
    ),
    learningNotes: [
      dna.focusToday,
      `Weak area: ${dna.weakArea}`,
      `Market lean: ${dna.marketPreference}`,
    ],
  };
}

export function buildStrategyFramework(input: StrategyBuilderInput, dna: MasterDnaCard) {
  const styleLine =
    input.style === 'liquidity'
      ? 'Liquidity Sweep + Market Structure + Pullback confirmation'
      : input.style === 'structure'
        ? 'Market Structure + BOS/CHoCH wait + Retest process'
        : input.style === 'breakout'
          ? 'Level break + volume/close quality + retest (no chase)'
          : 'Hybrid: structure bias + liquidity AOI + selective pullback';
  const rr = input.timeStyle === 'intraday' ? '1:2 to 1:3 process' : '1:3+ swing process';
  return {
    title: `${input.market} · ${input.timeStyle} framework`,
    pillars: styleLine.split(' + ').map((s) => s.trim()),
    riskLine: `${input.riskPct}% risk per idea on ~₹${Number(input.capital || 0).toLocaleString('en-IN') || input.capital} capital (educational sizing frame)`,
    rr,
    why: `Matches your DNA lean (${dna.bestStrategy}) and personality (${dna.personalityLabel}). Weak area “${dna.weakArea}” stays in homework, not in live size inflation.`,
    caution: 'Framework = process checklist. Not a signal. No guaranteed outcomes.',
  };
}

function certFromProgress(
  curriculum: CurriculumProgress,
  lab: LabProgress,
  dna: TradingDna,
  journalScore: number,
): { level: number; label: string } {
  let level = 0;
  if (curriculum.highestUnlocked >= 2) level = 1;
  if (curriculum.highestUnlocked >= 5) level = 2;
  if (curriculum.highestUnlocked >= 8) level = 3;
  if (curriculum.highestUnlocked >= 10 || lab.certTier >= 2) level = Math.max(level, 4);
  if (lab.bestSessionScore >= 75 && dna.riskDiscipline >= 70 && journalScore >= 60) {
    level = Math.max(level, 5);
  }
  if (
    curriculum.highestUnlocked >= 12 &&
    lab.certTier >= 4 &&
    dna.consistencyIndex >= 75 &&
    journalScore >= 75
  ) {
    level = 6;
  }
  level = Math.min(6, Math.max(1, level || 1));
  return { level, label: MASTER_CERTS[level - 1] };
}

export function buildMasterDnaCard(args: {
  trades: TradeRecord[];
  ownerKey: string;
  user?: { id?: string; email?: string } | null;
  profile: MentorStudentProfile | null;
}): MasterDnaCard {
  const { trades, ownerKey, user, profile } = args;
  const base = buildTradingDna(trades, ownerKey, user);
  const skill = buildTraderSkillProfile(ownerKey, user);
  const psych = buildPsychologyAnalytics(trades);
  const quality = computeJournalQuality(trades);
  const curriculum = loadCurriculumProgress(ownerKey);
  const lab = loadLabProgress(ownerKey);
  const times = hourBucket(trades);
  const strat = strategyQuality(trades);
  const personality = detectPersonality(trades, base);
  const discipline = clamp(
    (psych.gauges.find((g) => g.key === 'discipline')?.value || 55) * 0.6 +
      base.riskDiscipline * 0.4,
  );
  const execution = base.executionQuality;
  const consistency = base.consistencyIndex;
  const knowledge = clamp(
    curriculum.highestUnlocked * 7 +
      (skill.drillsCorrect / Math.max(1, skill.drillsTotal || 1)) * 40,
  );
  const overallProgress = clamp(
    knowledge * 0.2 +
      execution * 0.2 +
      base.emotionalStability * 0.15 +
      base.riskDiscipline * 0.2 +
      discipline * 0.15 +
      consistency * 0.1,
  );
  const riskProfile: MasterDnaCard['riskProfile'] =
    base.riskDiscipline >= 75 ? 'Low' : base.riskDiscipline >= 50 ? 'Medium' : 'High';

  const overtradeRisk =
    trades.length >= 8 &&
    (() => {
      const days = new Set(trades.map((t) => String(t.date || t.createdAt).slice(0, 10)));
      return days.size ? trades.length / days.size >= 3.5 : false;
    })();

  const profitRiskCreep = computeRiskDriftProxy(trades);

  const weaknessForecast: string[] = [];
  if (overtradeRisk) {
    weaknessForecast.push(
      'Behavior warning (not a certainty): if this trade-frequency pattern continues, overtrading may be the largest process risk over the next ~20 trades.',
    );
  }
  if (profitRiskCreep) {
    weaknessForecast.push(
      'Discipline is improving in spots, but size/risk tends to expand after green trades — watch post-profit risk creep.',
    );
  }
  if (base.emotionalStability < 55) {
    weaknessForecast.push(
      'Fear/greed volatility after outcomes may drag execution — log emotion before the next idea.',
    );
  }
  if (!weaknessForecast.length) {
    weaknessForecast.push(
      'No acute behavior forecast — keep compounding journal quality and Lab drills.',
    );
  }

  const nextLessonHint =
    base.weakArea.toLowerCase().includes('liquidity') ||
    profile?.weakAreas.some((w) => /liquid/i.test(w))
      ? 'Next path: Liquidity chapter revise → quiz → Lab liquidity mission → Live Mentor homework'
      : base.weakArea.toLowerCase().includes('risk')
        ? 'Next path: Risk sizing drills → Coach goals → Lab “protect capital” mission'
        : `Next path: Module 1 Level ${Math.min(12, curriculum.highestUnlocked)} deepen → Chart Mentor scenarios → Lab challenge`;

  const twinMatchScore = clamp(
    discipline * 0.35 + execution * 0.35 + consistency * 0.3 - (overtradeRisk ? 12 : 0),
  );

  const cert = certFromProgress(curriculum, lab, base, quality.score);

  return {
    ...base,
    experience: profile?.experience || skill.level.label,
    riskProfile,
    bestMarket: /nifty|bank/i.test(base.marketPreference)
      ? 'NIFTY / BANKNIFTY'
      : base.marketPreference.includes('Crypto')
        ? 'Crypto'
        : 'NIFTY',
    bestTime: times.bestTime,
    worstTime: times.worstTime,
    bestStrategy: strat.best,
    worstStrategy: strat.worst,
    psychologyNote:
      base.emotionalStability < 50
        ? 'Fear / reactivity after losses'
        : base.emotionalStability < 65
          ? 'Mixed — needs post-trade cool-down'
          : 'Relatively stable emotional baseline',
    execution,
    discipline,
    consistency,
    personality,
    personalityLabel: PERSONALITY_META[personality].label,
    overallProgress,
    knowledge,
    currentFocus: base.focusToday,
    certLevel: cert.level,
    certLabel: cert.label,
    nextLessonHint,
    weaknessForecast,
    twinMatchScore,
  };
}

function computeRiskDriftProxy(trades: TradeRecord[]): boolean {
  if (trades.length < 8) return false;
  const chrono = [...trades].sort((a, b) =>
    String(a.date || a.createdAt).localeCompare(String(b.date || b.createdAt)),
  );
  const mid = Math.floor(chrono.length / 2);
  const early = chrono.slice(0, mid).filter((t) => (t.pnl || 0) > 0);
  const late = chrono.slice(mid).filter((t) => (t.pnl || 0) > 0);
  if (early.length < 2 || late.length < 2) return false;
  const earlyAbs = early.reduce((s, t) => s + Math.abs(t.pnl || 0), 0) / early.length;
  const lateAbs = late.reduce((s, t) => s + Math.abs(t.pnl || 0), 0) / late.length;
  return lateAbs > earlyAbs * 1.45;
}

export function twinCompareDecision(args: {
  dna: MasterDnaCard;
  decisionNote: string;
}): { score: number; verdict: string; tips: string[] } {
  const note = args.decisionNote.toLowerCase();
  let score = args.dna.twinMatchScore;
  const tips: string[] = [];
  if (/fomo|chase|jaldi|revenge|market order rush/.test(note)) {
    score -= 18;
    tips.push('This language drifts from your best-performing patience habits.');
  }
  if (/confirm|retest|liquidity|invalidation|plan|rr/.test(note)) {
    score += 10;
    tips.push('Process keywords align with your stronger historical habits.');
  }
  if (/counter|reversal|fade/.test(note) && /counter/i.test(args.dna.worstStrategy)) {
    score -= 12;
    tips.push('Counter-trend lean historically weaker in your sample — raise confirmation bar.');
  }
  score = clamp(score);
  const verdict =
    score >= 75
      ? 'Current decision framing is close to your AI Twin’s stronger habit cluster.'
      : score >= 55
        ? 'Partial match — tighten confirmation / risk language before acting.'
        : 'Drift detected vs your better historical process — pause and rewrite the plan.';
  if (!tips.length) tips.push('Add confirmation + invalidation notes to improve Twin match reading.');
  return { score, verdict, tips };
}

export function goalProgress(
  goals: Record<MasterGoalId, boolean>,
  trades: TradeRecord[],
  dna: MasterDnaCard,
): { id: MasterGoalId; label: string; active: boolean; status: string; ok: boolean }[] {
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = trades.filter((t) => String(t.date || t.createdAt).slice(0, 10) === todayKey);
  return MASTER_GOALS.map((g) => {
    let ok = true;
    let status = 'On track';
    if (!goals[g.id]) {
      return { id: g.id, label: g.label, active: false, status: 'Paused', ok: true };
    }
    if (g.id === 'max2') {
      ok = today.length <= 2;
      status = `${today.length} trades today`;
    } else if (g.id === 'rr2') {
      ok = !today.length || today.every((t) => !t.rr || t.rr >= 2);
      status = ok ? 'RR process ok' : 'Some trades under 1:2';
    } else if (g.id === 'noRevenge') {
      ok = !today.some((t) => /revenge|fomo/i.test([t.notes, t.psychologyNote, ...(t.tags || [])].join(' ')));
      status = ok ? 'Clean language' : 'Revenge/FOMO flags';
    } else if (g.id === 'journalDaily') {
      ok = today.length > 0 || dna.consistency >= 60;
      status = today.length ? 'Journaled today' : 'No trade — observation day ok if noted';
    } else if (g.id === 'compliance90') {
      ok = dna.discipline >= 80;
      status = `Discipline proxy ${dna.discipline}%`;
    }
    return { id: g.id, label: g.label, active: true, status, ok };
  });
}

export function buildMasterBriefPrompt(dna: MasterDnaCard, playbook: Playbook, studentName: string): string {
  return `[TRADING MASTER] Module 6 — Wolf AI Institutional Mentor
Student: ${studentName || 'Trader'}
You are their Personal Trading Brain / Jarvis — optimize learning, psychology, risk process, long-term growth.
NEVER invent live Entry/Stop/Target/Buy/Sell. No guaranteed predictions.

TRADING DNA
Experience: ${dna.experience}
Risk profile: ${dna.riskProfile}
Best market: ${dna.bestMarket}
Best time: ${dna.bestTime} · Worst time: ${dna.worstTime}
Best strategy: ${dna.bestStrategy} · Worst: ${dna.worstStrategy}
Psychology: ${dna.psychologyNote}
Execution ${dna.execution}% · Discipline ${dna.discipline}% · Consistency ${dna.consistency}%
Personality: ${dna.personalityLabel}
Overall progress ${dna.overallProgress}% · Knowledge ${dna.knowledge}%
Cert: ${dna.certLabel}
Focus: ${dna.currentFocus}
Twin match baseline: ${dna.twinMatchScore}%
Next learning path: ${dna.nextLessonHint}
Forecasts:
${dna.weaknessForecast.map((f) => `- ${f}`).join('\n')}

PLAYBOOK
Best: ${playbook.bestSetups.join('; ')}
Worst: ${playbook.worstSetups.join('; ')}
Mistakes: ${playbook.mistakes.join('; ')}

Deliver:
### DNA read
### Personality coaching
### Adaptive next steps (lesson → quiz → homework → lab → review)
### Twin reminder (compare to best habits — no trade copy)
### Focus for this week
Institutional, precise, supportive.`;
}

export function buildStrategyPrompt(
  framework: ReturnType<typeof buildStrategyFramework>,
  input: StrategyBuilderInput,
  studentName: string,
): string {
  return `[TRADING MASTER] Module 6 — Personal strategy framework
Student: ${studentName || 'Trader'}
Inputs: capital=${input.capital} time=${input.timeStyle} market=${input.market} risk=${input.riskPct}% style=${input.style}
Framework: ${framework.title}
Pillars: ${framework.pillars.join(' · ')}
Risk line: ${framework.riskLine}
RR process: ${framework.rr}
Why: ${framework.why}

Explain why this PROCESS framework fits, how to practice it in Lab, and what homework proves readiness.
FORBIDDEN: live Buy/Sell, exact Entry/Stop/Target orders, profit guarantees.`;
}

export function buildTwinPrompt(args: {
  dna: MasterDnaCard;
  decisionNote: string;
  compare: ReturnType<typeof twinCompareDecision>;
  studentName: string;
}): string {
  return `[TRADING MASTER] Module 6 — AI Trading Twin
Student: ${args.studentName || 'Trader'}
Twin match score: ${args.compare.score}%
Verdict: ${args.compare.verdict}
Student decision note: ${args.decisionNote || '(empty)'}
Tips: ${args.compare.tips.join(' | ')}
DNA best habits: ${args.dna.bestStrategy} · ${args.dna.bestTime} · discipline ${args.dna.discipline}%
DNA weak: ${args.dna.worstStrategy} · ${args.dna.weakArea}

Compare current decision framing to their historical BEST process habits.
Show 1 relevant winning-process theme and 1 losing-process theme from DNA/playbook language.
Do NOT copy trades. Do NOT invent orders. Growth roadmap nudge only.`;
}

export function buildCareerPrompt(track: CareerTrackId, dna: MasterDnaCard, studentName: string): string {
  const meta = CAREER_TRACKS.find((t) => t.id === track) || CAREER_TRACKS[0];
  return `[TRADING MASTER] Module 6 — Career roadmap
Student: ${studentName || 'Trader'}
Track: ${meta.label}
Next gate: ${meta.next}
DNA overall ${dna.overallProgress}% · cert ${dna.certLabel} · personality ${dna.personalityLabel}

Build a staged roadmap (30/60/90 days) across Modules 1–5 practice — knowledge, chart, coach, lab, live mentor.
No recruitment promises. No funded-account guarantees. Process milestones only.`;
}
