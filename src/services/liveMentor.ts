/**
 * Module 5 — Wolf AI Live Mentor.
 * Real-market process coach: plan, rules, risk guardian, DNA profile.
 * Never executes trades. Never invents Buy/Sell/Entry/Stop/Target orders.
 */
import type { TradeRecord } from '../types/journal';
import type { DetectiveCard } from './mentorDrills';
import { buildPsychologyAnalytics } from './journalPsychAnalytics';
import { buildTraderSkillProfile, type TraderSkillProfile } from './traderSkillProfile';
import { computeJournalQuality, computeRiskDrift } from './journalAiAssist';

export type LiveRuleId =
  | 'max2trades'
  | 'minRR'
  | 'noRevenge'
  | 'alwaysSL'
  | 'maxRisk1'
  | 'noNews'
  | 'journalEmotion';

export type LiveRules = Record<LiveRuleId, boolean>;

export type TradePlanDraft = {
  symbol: string;
  trend: string;
  entryReason: string;
  confirmation: string;
  stopLoss: string;
  target: string;
  rr: string;
  maxRisk: string;
  failExit: string;
};

export type WatchlistCriteria =
  | 'breakout'
  | 'liquidity'
  | 'highVolume'
  | 'gapUp'
  | 'gapDown'
  | 'continuation'
  | 'reversal';

export type WatchlistItem = {
  symbol: string;
  setupType: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  learning: string;
  criteria: WatchlistCriteria;
};

export type LiveEmotion =
  | 'Calm'
  | 'Excited'
  | 'Fear'
  | 'Greed'
  | 'Angry'
  | 'Frustrated'
  | 'Confident';

export type LiveChallenge = {
  id: string;
  title: string;
  detail: string;
  days: number;
};

export type TradingDna = {
  technicalAccuracy: number;
  executionQuality: number;
  riskDiscipline: number;
  emotionalStability: number;
  consistencyIndex: number;
  learningSpeed: number;
  setupPreference: string;
  marketPreference: string;
  weakArea: string;
  focusToday: string;
  favoriteSetups: string[];
  commonMistakes: string[];
};

export type RuleCheckResult = {
  checks: { id: string; label: string; ok: boolean; detail: string }[];
  compliance: number;
  guardianAlerts: string[];
};

export type MentorMemory = {
  focusNotes: string[];
  lastBriefAt: string;
  challengeId: string;
  challengeStarted: string;
  homework: string;
};

const RULES_KEY = 'wolf_mentor_live_rules_v1';
const MEMORY_KEY = 'wolf_mentor_live_memory_v1';
const PLAN_KEY = 'wolf_mentor_live_plan_v1';
const EMOTION_KEY = 'wolf_mentor_live_emotions_v1';

export const LIVE_RULE_OPTIONS: { id: LiveRuleId; label: string }[] = [
  { id: 'max2trades', label: 'Max 2 trades / day' },
  { id: 'minRR', label: 'RR process ≥ 1:2' },
  { id: 'noRevenge', label: 'No revenge trading' },
  { id: 'alwaysSL', label: 'Always define stop loss' },
  { id: 'maxRisk1', label: 'Max 1% risk / trade' },
  { id: 'noNews', label: 'No trading during high-impact news' },
  { id: 'journalEmotion', label: 'Log emotion after every trade' },
];

export const WATCHLIST_CRITERIA: { id: WatchlistCriteria; label: string }[] = [
  { id: 'breakout', label: 'Breakout' },
  { id: 'liquidity', label: 'Liquidity setups' },
  { id: 'highVolume', label: 'High volume' },
  { id: 'gapUp', label: 'Gap up' },
  { id: 'gapDown', label: 'Gap down' },
  { id: 'continuation', label: 'Trend continuation' },
  { id: 'reversal', label: 'Reversal candidates' },
];

/** Educational watchlist seeds — process study, not buy signals. */
const WATCH_SEED: Record<WatchlistCriteria, WatchlistItem[]> = {
  breakout: [
    { symbol: 'NIFTY', setupType: 'Range break study', riskLevel: 'Medium', learning: 'Wait for retest vs chase', criteria: 'breakout' },
    { symbol: 'RELIANCE', setupType: 'Level break observation', riskLevel: 'Medium', learning: 'Volume + close quality', criteria: 'breakout' },
    { symbol: 'TATASTEEL', setupType: 'Compression break', riskLevel: 'High', learning: 'Fake breakout filters', criteria: 'breakout' },
  ],
  liquidity: [
    { symbol: 'BANKNIFTY', setupType: 'Equal highs / SSL', riskLevel: 'Medium', learning: 'Sweep then displacement', criteria: 'liquidity' },
    { symbol: 'NIFTY', setupType: 'Session liquidity', riskLevel: 'Low', learning: 'Mark BSL/SSL only', criteria: 'liquidity' },
    { symbol: 'HDFCBANK', setupType: 'Prior day extremes', riskLevel: 'Medium', learning: 'Retail stop logic', criteria: 'liquidity' },
  ],
  highVolume: [
    { symbol: 'SBIN', setupType: 'Relative volume', riskLevel: 'Medium', learning: 'Effort vs result', criteria: 'highVolume' },
    { symbol: 'ICICIBANK', setupType: 'Participation spike', riskLevel: 'Medium', learning: 'Confirm with structure', criteria: 'highVolume' },
    { symbol: 'INFY', setupType: 'News-volume caution', riskLevel: 'High', learning: 'Avoid impulsive chase', criteria: 'highVolume' },
  ],
  gapUp: [
    { symbol: 'NIFTY', setupType: 'Gap map', riskLevel: 'Medium', learning: 'Fill vs hold process', criteria: 'gapUp' },
    { symbol: 'BAJFINANCE', setupType: 'Gap continuation study', riskLevel: 'High', learning: 'First 15m patience', criteria: 'gapUp' },
  ],
  gapDown: [
    { symbol: 'NIFTY', setupType: 'Gap down map', riskLevel: 'Medium', learning: 'Open drive vs reclaim', criteria: 'gapDown' },
    { symbol: 'TCS', setupType: 'Gap risk study', riskLevel: 'High', learning: 'Do not average emotionally', criteria: 'gapDown' },
  ],
  continuation: [
    { symbol: 'NIFTY', setupType: 'Pullback in trend', riskLevel: 'Low', learning: 'Higher-TF alignment', criteria: 'continuation' },
    { symbol: 'BANKNIFTY', setupType: 'Flag / pullback', riskLevel: 'Medium', learning: 'Entry after confirmation', criteria: 'continuation' },
  ],
  reversal: [
    { symbol: 'NIFTY', setupType: 'CHoCH observation', riskLevel: 'High', learning: 'Need displacement + retest', criteria: 'reversal' },
    { symbol: 'GOLD', setupType: 'Exhaustion study', riskLevel: 'High', learning: 'Counter-trend risk sizing', criteria: 'reversal' },
  ],
};

export const LIVE_CHALLENGES: LiveChallenge[] = [
  { id: 'discipline', title: 'Discipline Week', detail: '7 days: no FOMO, no rule breaks.', days: 7 },
  { id: 'risk', title: 'Risk Week', detail: 'Every planned trade max 1% risk process.', days: 7 },
  { id: 'patience', title: 'Patience Week', detail: 'Only A+ confirmed setups — skip the rest.', days: 7 },
];

export const LIVE_HOMEWORK = [
  'Aaj sirf BOS / structure events identify karo — trade optional.',
  '5 liquidity sweep Areas of Interest mark karo (no orders).',
  'Ek bhi unnecessary trade mat lo — journal the skips.',
  'Har potential setup pe pehle fail-exit condition likho.',
  'Higher timeframe bias likho before any lower-TF action.',
];

export const LIVE_EMOTIONS: LiveEmotion[] = [
  'Calm',
  'Excited',
  'Fear',
  'Greed',
  'Angry',
  'Frustrated',
  'Confident',
];

export const EMPTY_PLAN: TradePlanDraft = {
  symbol: 'NIFTY',
  trend: '',
  entryReason: '',
  confirmation: '',
  stopLoss: '',
  target: '',
  rr: '',
  maxRisk: '',
  failExit: '',
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function storageKey(base: string, ownerKey: string) {
  return `${base}:${ownerKey || 'guest'}`;
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function loadLiveRules(ownerKey = 'guest'): LiveRules {
  const defaults: LiveRules = {
    max2trades: true,
    minRR: true,
    noRevenge: true,
    alwaysSL: true,
    maxRisk1: true,
    noNews: false,
    journalEmotion: true,
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(storageKey(RULES_KEY, ownerKey));
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as LiveRules) };
  } catch {
    return defaults;
  }
}

export function saveLiveRules(rules: LiveRules, ownerKey = 'guest') {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(RULES_KEY, ownerKey), JSON.stringify(rules));
}

export function loadMentorMemory(ownerKey = 'guest'): MentorMemory {
  const fallback: MentorMemory = {
    focusNotes: [],
    lastBriefAt: '',
    challengeId: 'discipline',
    challengeStarted: todayKey(),
    homework: LIVE_HOMEWORK[0],
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(MEMORY_KEY, ownerKey));
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as MentorMemory) };
  } catch {
    return fallback;
  }
}

export function saveMentorMemory(mem: MentorMemory, ownerKey = 'guest') {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(MEMORY_KEY, ownerKey), JSON.stringify(mem));
}

export function loadTradePlan(ownerKey = 'guest'): TradePlanDraft {
  if (typeof window === 'undefined') return { ...EMPTY_PLAN };
  try {
    const raw = window.localStorage.getItem(storageKey(PLAN_KEY, ownerKey));
    if (!raw) return { ...EMPTY_PLAN };
    return { ...EMPTY_PLAN, ...(JSON.parse(raw) as TradePlanDraft) };
  } catch {
    return { ...EMPTY_PLAN };
  }
}

export function saveTradePlan(plan: TradePlanDraft, ownerKey = 'guest') {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(PLAN_KEY, ownerKey), JSON.stringify(plan));
}

export function loadEmotionLog(ownerKey = 'guest'): { date: string; emotion: LiveEmotion; note: string }[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(EMOTION_KEY, ownerKey));
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function pushEmotionLog(
  emotion: LiveEmotion,
  note: string,
  ownerKey = 'guest',
) {
  const prev = loadEmotionLog(ownerKey);
  const next = [...prev, { date: new Date().toISOString(), emotion, note }].slice(-60);
  window.localStorage.setItem(storageKey(EMOTION_KEY, ownerKey), JSON.stringify(next));
  return next;
}

export function tradesToday(trades: TradeRecord[]): TradeRecord[] {
  const key = todayKey();
  return trades.filter((t) => String(t.date || t.createdAt || '').slice(0, 10) === key);
}

export function planCompleteness(plan: TradePlanDraft): { score: number; missing: string[] } {
  const fields: { key: keyof TradePlanDraft; label: string }[] = [
    { key: 'trend', label: 'Trend' },
    { key: 'entryReason', label: 'Entry reason' },
    { key: 'confirmation', label: 'Confirmation' },
    { key: 'stopLoss', label: 'Stop loss (your level)' },
    { key: 'target', label: 'Target (your level)' },
    { key: 'rr', label: 'RR' },
    { key: 'maxRisk', label: 'Max risk' },
    { key: 'failExit', label: 'Fail-exit condition' },
  ];
  const missing = fields.filter((f) => !String(plan[f.key] || '').trim()).map((f) => f.label);
  const score = clamp(((fields.length - missing.length) / fields.length) * 100);
  return { score, missing };
}

export function buildWatchlist(criteria: WatchlistCriteria[]): WatchlistItem[] {
  const picked = criteria.length ? criteria : (['liquidity', 'continuation'] as WatchlistCriteria[]);
  const out: WatchlistItem[] = [];
  for (const c of picked) {
    for (const row of WATCH_SEED[c] || []) out.push(row);
  }
  // Priority: Low risk first, then Medium, then High — educational order
  const rank = { Low: 0, Medium: 1, High: 2 };
  return out
    .filter((v, i, a) => a.findIndex((x) => x.symbol === v.symbol && x.setupType === v.setupType) === i)
    .sort((a, b) => rank[a.riskLevel] - rank[b.riskLevel])
    .slice(0, 10);
}

export function buildTradingDna(
  trades: TradeRecord[],
  ownerKey: string,
  user?: { id?: string; email?: string } | null,
): TradingDna {
  const skill: TraderSkillProfile = buildTraderSkillProfile(ownerKey, user);
  const psych = buildPsychologyAnalytics(trades);
  const quality = computeJournalQuality(trades);
  const drift = computeRiskDrift(trades);
  const today = tradesToday(trades);
  const earlyEntries = trades.filter((t) =>
    /early|fomo|chase|jaldi/i.test([t.notes, t.psychologyNote, ...(t.tags || [])].join(' ')),
  ).length;

  const riskDiscipline = clamp(
    skill.scores.riskManagement * 0.7 +
      (drift.severity === 'elevated' ? 30 : drift.severity === 'mild' ? 55 : 85) * 0.3,
  );
  const emotionalStability = clamp(
    typeof psych.mindScore === 'number'
      ? psych.mindScore
      : 100 - (psych.gauges.find((g) => g.key === 'fearGreed')?.value || 50),
  );
  const executionQuality = clamp(skill.scores.entryTiming * 0.55 + skill.scores.patience * 0.45);
  const technicalAccuracy = clamp(skill.scores.marketReading * 0.6 + quality.score * 0.4);
  const consistencyIndex = clamp(
    (psych.gauges.find((g) => g.key === 'discipline')?.value || 50) * 0.5 +
      Math.min(trades.length * 3, 40) +
      (today.length <= 2 ? 10 : 0),
  );
  const learningSpeed = clamp(40 + skill.drillsCorrect * 4 + Math.min(skill.xp / 5, 30));

  const tagBlob = trades.flatMap((t) => t.tags || []).join(' ').toLowerCase();
  const setupPreference = /liquidity|sweep/.test(tagBlob)
    ? 'Liquidity / sweep process'
    : /breakout/.test(tagBlob)
      ? 'Breakout process'
      : /pullback|continuation/.test(tagBlob)
        ? 'Pullback continuation'
        : skill.weakness.includes('Timing')
          ? 'Needs confirmation focus'
          : 'Structure-first study';

  const markets = trades.map((t) => t.market || 'equity');
  const marketPreference =
    markets.filter((m) => m === 'crypto').length > markets.length / 2
      ? 'Crypto-heavy journal'
      : markets.filter((m) => m === 'forex').length > markets.length / 3
        ? 'Forex mix'
        : 'Indian equity / index focus';

  const focusToday =
    earlyEntries >= 2
      ? 'Patience — sirf confirmed pullback / confirmation entries. Kal early entries ka pattern dikha.'
      : riskDiscipline < 60
        ? 'Risk discipline — har plan me max risk % aur SL pehle likho.'
        : emotionalStability < 55
          ? 'Emotional stability — trade se pehle emotion check + fail-exit likho.'
          : skill.focusWeek[0] || 'Process over outcome — one clean A+ setup focus.';

  const commonMistakes: string[] = [];
  if (earlyEntries) commonMistakes.push('Early / FOMO entries');
  if (drift.severity !== 'none') commonMistakes.push('Risk drift across session');
  if (trades.some((t) => !(t.stopLoss > 0))) commonMistakes.push('Missing stop documentation');
  if (!commonMistakes.length) commonMistakes.push('Keep journaling to surface mistakes');

  return {
    technicalAccuracy,
    executionQuality,
    riskDiscipline,
    emotionalStability,
    consistencyIndex,
    learningSpeed,
    setupPreference,
    marketPreference,
    weakArea: skill.weakness,
    focusToday,
    favoriteSetups: [setupPreference, skill.focusWeek[0] || 'Structure reading'].filter(Boolean),
    commonMistakes: commonMistakes.slice(0, 4),
  };
}

export function checkRulesAndRisk(args: {
  rules: LiveRules;
  plan: TradePlanDraft;
  todayTrades: TradeRecord[];
  dna: TradingDna;
}): RuleCheckResult {
  const { rules, plan, todayTrades, dna } = args;
  const checks: RuleCheckResult['checks'] = [];
  const guardianAlerts: string[] = [];

  if (rules.max2trades) {
    const ok = todayTrades.length <= 2;
    checks.push({
      id: 'max2trades',
      label: 'Max 2 trades',
      ok,
      detail: `${todayTrades.length} logged today`,
    });
    if (!ok) {
      guardianAlerts.push(
        'Aaj ka max trades limit touch / cross ho chuka hai. Continue karna aapke plan ke against ho sakta hai.',
      );
    }
  }

  if (rules.minRR) {
    const rrNum = Number(plan.rr);
    const planOk = !plan.rr.trim() || (Number.isFinite(rrNum) && rrNum >= 2);
    const histOk =
      !todayTrades.length || todayTrades.every((t) => !t.rr || t.rr >= 2);
    const ok = planOk && histOk;
    checks.push({
      id: 'minRR',
      label: 'RR ≥ 1:2 process',
      ok,
      detail: plan.rr ? `Plan RR ${plan.rr}` : 'Plan RR not set',
    });
  }

  if (rules.alwaysSL) {
    const planOk = Boolean(plan.stopLoss.trim());
    const histOk = !todayTrades.length || todayTrades.every((t) => t.stopLoss > 0);
    checks.push({
      id: 'alwaysSL',
      label: 'Stop loss defined',
      ok: planOk && histOk,
      detail: planOk ? 'Plan has SL field' : 'Plan missing SL',
    });
  }

  if (rules.maxRisk1) {
    const riskTxt = plan.maxRisk.toLowerCase();
    const ok =
      !riskTxt ||
      /1\s*%|0\.\d|one percent/.test(riskTxt) ||
      (Number(plan.maxRisk) > 0 && Number(plan.maxRisk) <= 1);
    checks.push({
      id: 'maxRisk1',
      label: 'Max 1% risk process',
      ok,
      detail: plan.maxRisk || 'Risk not stated',
    });
    if (!ok) {
      guardianAlerts.push('Planned risk 1% rule se zyada lagta hai — pehle size verify karo.');
    }
  }

  if (rules.noRevenge) {
    const revenge = todayTrades.some((t) =>
      /revenge|fomo|angry|tilt/i.test([t.notes, t.psychologyNote, t.afterEmotion, ...(t.tags || [])].join(' ')),
    );
    checks.push({
      id: 'noRevenge',
      label: 'No revenge pattern',
      ok: !revenge,
      detail: revenge ? 'Journal flags emotional re-entry language' : 'Clear so far',
    });
    if (revenge) {
      guardianAlerts.push('Revenge / FOMO language journal me dikhi. Pause + review recommended.');
    }
  }

  if (rules.journalEmotion) {
    const ok =
      !todayTrades.length ||
      todayTrades.every((t) => Boolean(t.beforeEmotion || t.afterEmotion));
    checks.push({
      id: 'journalEmotion',
      label: 'Emotion logged',
      ok,
      detail: ok ? 'Emotions present' : 'Some trades missing emotion fields',
    });
  }

  if (rules.noNews) {
    checks.push({
      id: 'noNews',
      label: 'News window caution',
      ok: true,
      detail: 'Self-check: avoid entries in high-impact news window',
    });
  }

  if (dna.riskDiscipline < 45 && todayTrades.length >= 2) {
    guardianAlerts.push(
      'Risk discipline DNA soft hai aur aaj already multiple trades hain — capital protect mode socho.',
    );
  }

  const passed = checks.filter((c) => c.ok).length;
  const compliance = checks.length ? clamp((passed / checks.length) * 100) : 100;

  return { checks, compliance, guardianAlerts };
}

export function buildMorningBriefPrompt(args: {
  studentName: string;
  dna: TradingDna;
  detective: DetectiveCard | null;
  memory: MentorMemory;
  criteria: WatchlistCriteria[];
  watchlist: WatchlistItem[];
}): string {
  const d = args.detective;
  const wl = args.watchlist
    .map((w) => `• ${w.symbol} — ${w.setupType} · risk ${w.riskLevel} · learn: ${w.learning}`)
    .join('\n');
  return `[LIVE MENTOR] Module 5 — Wolf AI Live Mentor · Morning routine
Student: ${args.studentName || 'Trader'}
Mission: Prepare the student for the session. AI does NOT decide trades. Never say Buy/Sell/Enter now. Never invent Entry/Stop/Target orders.

DNA FOCUS TODAY: ${args.dna.focusToday}
Weak area: ${args.dna.weakArea}
Common mistakes: ${args.dna.commonMistakes.join('; ')}
Challenge: ${args.memory.challengeId} · Homework seed: ${args.memory.homework}
Watchlist criteria: ${args.criteria.join(', ') || 'default'}

LIVE TAPE SNAPSHOT (educational context only):
${
  d
    ? `Symbol ${d.symbol} ${d.interval} · LTP ${d.ltp}
Trend: ${d.trend}
Liquidity note: ${d.liquidity}
Zone: ${d.zone}
Volatility: ${d.volatility}
Day range: ${d.dayLow ?? '—'} – ${d.dayHigh ?? '—'}
MTF: D=${d.mtf?.daily || '—'} H1=${d.mtf?.h1 || '—'}
BestAction field is DESK PROCESS language only — do NOT convert to orders.`
    : 'Detective tape unavailable — keep brief general and ask student to open chart.'
}

WATCHLIST (study priority — not signals):
${wl || '(empty)'}

Deliver labeled short sections:
### Daily brief
Major lean, volatility expectation, gap/context if known — probabilistic.
### Areas of Interest
Support/resistance style AOIs only (no Entry/Stop/Target).
### Watchlist coaching
How to study each name (learning opportunity).
### Key learning focus
Tie to DNA focus today.
### Live homework
One concrete observation task (no trade required).
### Risk reminder
Daily risk / patience.
End with one Decision Challenge question (fail-exit habit).`;
}

export function buildPlanCheckPrompt(plan: TradePlanDraft, completeness: ReturnType<typeof planCompleteness>): string {
  return `[LIVE MENTOR] Module 5 — Trade planning assistant
Student plan draft (THEIR levels — do not invent new ones):
Symbol: ${plan.symbol}
Trend: ${plan.trend || '—'}
Entry reason: ${plan.entryReason || '—'}
Confirmation: ${plan.confirmation || '—'}
Stop (student): ${plan.stopLoss || '—'}
Target (student): ${plan.target || '—'}
RR: ${plan.rr || '—'}
Max risk: ${plan.maxRisk || '—'}
Fail-exit if wrong: ${plan.failExit || '—'}
Completeness: ${completeness.score}% · Missing: ${completeness.missing.join(', ') || 'none'}

Coach the PLAN QUALITY only. If incomplete, warn clearly.
Ask the Decision Challenge: if this trade fails, what is the exit condition?
NEVER say Buy/Sell now. NEVER invent replacement Entry/Stop/Target numbers.
Scenarios OK (A/B). Uncertainty OK.`;
}

export function buildLiveGuidancePrompt(args: {
  question: string;
  plan: TradePlanDraft;
  dna: TradingDna;
  detective: DetectiveCard | null;
}): string {
  return `[LIVE MENTOR] Module 5 — Live market observation coaching
Student question: ${args.question}
Active plan symbol: ${args.plan.symbol}
DNA focus: ${args.dna.focusToday}
Tape: ${
    args.detective
      ? `${args.detective.symbol} LTP ${args.detective.ltp} trend=${args.detective.trend} zone=${args.detective.zone}`
      : 'unavailable'
  }

Answer with reasoning + alternate scenarios. Use “if structure holds / if liquidity confirms” language.
FORBIDDEN: “Abhi Buy”, “Abhi Sell”, Entry/Stop/Target orders, lot size, guaranteed profit.
Guide independent decision-making.`;
}

export function buildEodReviewPrompt(args: {
  studentName: string;
  dna: TradingDna;
  todayTrades: TradeRecord[];
  compliance: number;
  guardianAlerts: string[];
  emotions: { emotion: LiveEmotion; note: string }[];
  challengeId: string;
}): string {
  const trades = args.todayTrades
    .slice(0, 8)
    .map(
      (t) =>
        `• ${t.instrument} ${t.side} pnl=${t.pnl} rr=${t.rr} disc=${t.discipline ?? '—'} before=${t.beforeEmotion || '—'} after=${t.afterEmotion || '—'} notes=${String(t.notes || '').slice(0, 70)}`,
    )
    .join('\n');
  const emo = args.emotions
    .slice(-5)
    .map((e) => `${e.emotion}${e.note ? `: ${e.note}` : ''}`)
    .join(' | ');
  return `[LIVE MENTOR] Module 5 — End of day review
Student: ${args.studentName || 'Trader'}
Rule compliance today: ${args.compliance}%
Guardian alerts: ${args.guardianAlerts.join(' | ') || 'none'}
Challenge: ${args.challengeId}
DNA: tech ${args.dna.technicalAccuracy} exec ${args.dna.executionQuality} risk ${args.dna.riskDiscipline} emotion ${args.dna.emotionalStability} consistency ${args.dna.consistencyIndex}
Emotions logged: ${emo || 'none'}
Today journal trades:
${trades || '(no trades logged — review observation / skips)'}

Deliver:
### Performance
### Discipline / rules
### Psychology
### Technical (best/worst process — not signal grades)
### Improvement plan for tomorrow
No new Entry/Stop/Target. No Buy/Sell instructions.`;
}

export function buildWeeklyLivePrompt(dna: TradingDna, studentName: string): string {
  return `[LIVE MENTOR] Module 5 — Weekly coaching session
Student: ${studentName || 'Trader'}
Trading DNA: ${JSON.stringify(dna)}
Compare process themes week-over-week using DNA + known weak areas.
Sections: Win-rate process (if journal known), Discipline, Execution, Psychology, Risk, Consistency, Actionable focus.
No trade orders. Personalized mentor memory tone.`;
}
