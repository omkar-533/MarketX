/**
 * Module 4 — Wolf AI Trading Lab.
 * Historical candle replay + paper decisions + process scoring.
 * Student places lab orders; AI evaluates process — never invents live-market trade signals.
 */
import type { ChartBar } from '../types/chart';

export type LabMode = 'beginner' | 'intermediate' | 'professional' | 'challenge';

export type LabMarket = {
  id: string;
  label: string;
  apiSymbol: string;
  defaultInterval: string;
  asset: 'index' | 'stock' | 'forex' | 'crypto' | 'commodity';
};

export type LabSide = 'BUY' | 'SELL';

export type LabPosition = {
  side: LabSide;
  qty: number;
  entry: number;
  entryBarIndex: number;
  stopLoss: number | null;
  takeProfit: number | null;
  notes: string;
  plannedRr: number | null;
  riskPoints: number | null;
};

export type LabTradeScore = {
  entryQuality: number;
  riskManagement: number;
  structureReading: number;
  execution: number;
  discipline: number;
  overall: number;
};

export type LabClosedTrade = LabPosition & {
  exit: number;
  exitBarIndex: number;
  pnlPoints: number;
  pnlR: number | null;
  reason: 'manual' | 'sl' | 'tp' | 'session_end';
  scores: LabTradeScore;
  heldBars: number;
};

export type LabMission = {
  id: string;
  title: string;
  detail: string;
  xp: number;
};

export type LabProgress = {
  xp: number;
  sessions: number;
  trades: number;
  completedMissions: string[];
  certTier: number;
  bestSessionScore: number;
};

export type LabSessionRules = {
  maxTrades: number;
  maxRiskPct: number;
  minRr: number;
  dailyLossLimitPct: number;
};

export const LAB_MARKETS: LabMarket[] = [
  { id: 'NIFTY', label: 'NIFTY', apiSymbol: 'NIFTY', defaultInterval: '15m', asset: 'index' },
  { id: 'BANKNIFTY', label: 'BANKNIFTY', apiSymbol: 'BANKNIFTY', defaultInterval: '15m', asset: 'index' },
  { id: 'RELIANCE', label: 'RELIANCE', apiSymbol: 'RELIANCE', defaultInterval: '15m', asset: 'stock' },
  { id: 'EURUSD', label: 'EURUSD', apiSymbol: 'EURUSD', defaultInterval: '15m', asset: 'forex' },
  { id: 'BTC', label: 'BTCUSDT', apiSymbol: 'BTCUSDT', defaultInterval: '15m', asset: 'crypto' },
  { id: 'GOLD', label: 'Gold', apiSymbol: 'GOLD', defaultInterval: '15m', asset: 'commodity' },
  { id: 'CRUDE', label: 'Crude Oil', apiSymbol: 'CRUDE', defaultInterval: '15m', asset: 'commodity' },
];

export const LAB_INTERVALS = [
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1h' },
  { id: '1d', label: '1D' },
] as const;

export const LAB_MODES: { id: LabMode; label: string; hint: string; speedMs: number; hints: boolean }[] = [
  { id: 'beginner', label: 'Beginner', hint: 'Slow replay · concept hints ON', speedMs: 1600, hints: true },
  { id: 'intermediate', label: 'Intermediate', hint: 'Normal speed · limited hints', speedMs: 900, hints: true },
  { id: 'professional', label: 'Professional', hint: 'No hints · self-analysis first', speedMs: 500, hints: false },
  { id: 'challenge', label: 'Challenge', hint: 'Timed pressure · scoring', speedMs: 350, hints: false },
];

export const LAB_MISSIONS: LabMission[] = [
  {
    id: 'observe5',
    title: 'Observe before trade',
    detail: 'Advance ≥ 8 candles before your first entry.',
    xp: 40,
  },
  {
    id: 'rr12',
    title: 'Respect 1:2 RR',
    detail: 'Every closed trade must have planned RR ≥ 2.',
    xp: 50,
  },
  {
    id: 'max2',
    title: 'Max 2 trades',
    detail: 'Close the session with ≤ 2 trades.',
    xp: 45,
  },
  {
    id: 'protect',
    title: 'Protect capital',
    detail: 'End session drawdown under 2% of start balance.',
    xp: 60,
  },
  {
    id: 'sl_always',
    title: 'Always use a stop',
    detail: 'Every lab trade must have a stop loss.',
    xp: 40,
  },
];

export const LAB_CERTS = [
  'Bronze Trader',
  'Silver Trader',
  'Gold Trader',
  'Professional Trader',
  'Elite Trader',
  'Institutional Trader',
] as const;

const PROGRESS_KEY = 'wolf_mentor_lab_progress_v1';

const DEFAULT_RULES: LabSessionRules = {
  maxTrades: 4,
  maxRiskPct: 1,
  minRr: 2,
  dailyLossLimitPct: 3,
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function storageKey(base: string, ownerKey: string) {
  return `${base}:${ownerKey || 'guest'}`;
}

export function loadLabProgress(ownerKey = 'guest'): LabProgress {
  const fallback: LabProgress = {
    xp: 0,
    sessions: 0,
    trades: 0,
    completedMissions: [],
    certTier: 0,
    bestSessionScore: 0,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(PROGRESS_KEY, ownerKey));
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as LabProgress) };
  } catch {
    return fallback;
  }
}

export function saveLabProgress(progress: LabProgress, ownerKey = 'guest') {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(PROGRESS_KEY, ownerKey), JSON.stringify(progress));
}

export function certLabel(tier: number) {
  return LAB_CERTS[Math.max(0, Math.min(LAB_CERTS.length - 1, tier))] || LAB_CERTS[0];
}

export function certTierFromXp(xp: number) {
  if (xp >= 800) return 5;
  if (xp >= 500) return 4;
  if (xp >= 320) return 3;
  if (xp >= 180) return 2;
  if (xp >= 80) return 1;
  return 0;
}

export function warmupIndex(barsLen: number) {
  if (barsLen < 30) return Math.max(5, Math.floor(barsLen * 0.35));
  return Math.min(Math.floor(barsLen * 0.45), barsLen - 12);
}

export function revealedBars(bars: ChartBar[], cursor: number): ChartBar[] {
  if (!bars.length) return [];
  const end = Math.max(0, Math.min(cursor, bars.length - 1));
  return bars.slice(0, end + 1);
}

export function currentPrice(bars: ChartBar[], cursor: number): number {
  const bar = bars[Math.max(0, Math.min(cursor, bars.length - 1))];
  return bar?.close || 0;
}

export function plannedRr(_side: LabSide, entry: number, sl: number | null, tp: number | null): number | null {
  if (!sl || !tp || !(entry > 0)) return null;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (!(risk > 0)) return null;
  return Math.round((reward / risk) * 100) / 100;
}

export function positionSizeFromRisk(
  balance: number,
  riskPct: number,
  entry: number,
  sl: number | null,
): number {
  if (!sl || !(entry > 0) || !(balance > 0)) return 1;
  const riskPts = Math.abs(entry - sl);
  if (!(riskPts > 0)) return 1;
  const riskCash = balance * (riskPct / 100);
  const qty = Math.floor(riskCash / riskPts);
  return Math.max(1, qty);
}

export function scoreLabTrade(
  trade: Omit<LabClosedTrade, 'scores'>,
  rules: LabSessionRules,
  priorLossBarsAgo: number | null,
): LabTradeScore {
  const hasSl = trade.stopLoss != null && trade.stopLoss > 0;
  const hasTp = trade.takeProfit != null && trade.takeProfit > 0;
  const rr = trade.plannedRr ?? 0;

  let entryQuality = 62;
  if (trade.heldBars >= 2) entryQuality += 8;
  if (trade.heldBars === 0) entryQuality -= 18;
  if (trade.notes.trim().length >= 12) entryQuality += 10;
  if (trade.pnlPoints > 0) entryQuality += 6;
  else entryQuality -= 4;

  let riskManagement = hasSl ? 78 : 28;
  if (hasTp) riskManagement += 8;
  if (rr >= rules.minRr) riskManagement += 12;
  else if (rr > 0 && rr < rules.minRr) riskManagement -= 14;
  if (trade.reason === 'sl' && hasSl) riskManagement += 4;

  let structureReading = 58;
  if (trade.notes.trim().length >= 20) structureReading += 14;
  if (trade.heldBars >= 3 && trade.pnlPoints > 0) structureReading += 10;
  if (trade.heldBars === 0) structureReading -= 12;

  let execution = 70;
  if (trade.reason === 'tp') execution += 12;
  if (trade.reason === 'manual' && trade.pnlPoints < 0) execution -= 8;
  if (hasSl && trade.reason !== 'session_end') execution += 6;

  let discipline = 72;
  if (!hasSl) discipline -= 30;
  if (rr > 0 && rr < rules.minRr) discipline -= 16;
  if (priorLossBarsAgo != null && priorLossBarsAgo <= 3) discipline -= 22;
  if (trade.notes.trim().length >= 8) discipline += 8;

  const overall = clamp(
    entryQuality * 0.22 +
      riskManagement * 0.24 +
      structureReading * 0.18 +
      execution * 0.18 +
      discipline * 0.18,
  );

  return {
    entryQuality: clamp(entryQuality),
    riskManagement: clamp(riskManagement),
    structureReading: clamp(structureReading),
    execution: clamp(execution),
    discipline: clamp(discipline),
    overall,
  };
}

export function applyBarToPosition(
  position: LabPosition,
  bar: ChartBar,
  barIndex: number,
): { closed: LabClosedTrade | null; stillOpen: LabPosition | null } {
  const { side, stopLoss, takeProfit } = position;
  const hitSl =
    stopLoss != null &&
    (side === 'BUY' ? bar.low <= stopLoss : bar.high >= stopLoss);
  const hitTp =
    takeProfit != null &&
    (side === 'BUY' ? bar.high >= takeProfit : bar.low <= takeProfit);

  // Conservative: if both in same bar, assume SL first (worst case process).
  if (hitSl && stopLoss != null) {
    return { closed: closeAt(position, stopLoss, barIndex, 'sl'), stillOpen: null };
  }
  if (hitTp && takeProfit != null) {
    return { closed: closeAt(position, takeProfit, barIndex, 'tp'), stillOpen: null };
  }
  return { closed: null, stillOpen: position };
}

function closeAt(
  position: LabPosition,
  exit: number,
  exitBarIndex: number,
  reason: LabClosedTrade['reason'],
): LabClosedTrade {
  const dir = position.side === 'BUY' ? 1 : -1;
  const pnlPoints = (exit - position.entry) * dir * position.qty;
  const risk = position.riskPoints && position.riskPoints > 0 ? position.riskPoints : null;
  const pnlR = risk ? Math.round(((exit - position.entry) * dir) / risk * 100) / 100 : null;
  const base = {
    ...position,
    exit,
    exitBarIndex,
    pnlPoints,
    pnlR,
    reason,
    heldBars: Math.max(0, exitBarIndex - position.entryBarIndex),
  };
  return {
    ...base,
    scores: scoreLabTrade(base, DEFAULT_RULES, null),
  };
}

export function closePositionManual(
  position: LabPosition,
  exit: number,
  exitBarIndex: number,
  rules: LabSessionRules,
  priorLossBarsAgo: number | null,
): LabClosedTrade {
  const dir = position.side === 'BUY' ? 1 : -1;
  const pnlPoints = (exit - position.entry) * dir * position.qty;
  const risk = position.riskPoints && position.riskPoints > 0 ? position.riskPoints : null;
  const pnlR = risk ? Math.round(((exit - position.entry) * dir) / risk * 100) / 100 : null;
  const base = {
    ...position,
    exit,
    exitBarIndex,
    pnlPoints,
    pnlR,
    reason: 'manual' as const,
    heldBars: Math.max(0, exitBarIndex - position.entryBarIndex),
  };
  return { ...base, scores: scoreLabTrade(base, rules, priorLossBarsAgo) };
}

export type InterventionKind = 'risk_limit' | 'no_sl' | 'revenge' | 'max_trades' | 'min_rr' | 'remove_sl';

export function checkMentorIntervention(args: {
  kind: InterventionKind;
  mode: LabMode;
}): string | null {
  const map: Record<InterventionKind, string> = {
    risk_limit:
      'Pause. Ye decision aapke daily risk limit se match nahi karta. Pehle risk verify karo, phir execute.',
    no_sl:
      'Pause. Trading plan me stop loss defined hona chahiye. Pehle SL set karo — signal nahi, discipline check.',
    revenge:
      'Pause. Loss ke turant baad re-entry revenge pattern jaisa lagta hai. Reason verify karo, phir trade socho.',
    max_trades:
      'Pause. Aaj ka max trades limit hit ho chuka hai. Charts review karo — overtrading avoid.',
    min_rr:
      'Pause. Planned RR aapke session rule se kam hai. Setup skip karna bhi valid decision hai.',
    remove_sl:
      'Pause. Stop loss hataana aapke risk rules todta hai. Pehle reason likho, phir decide karo.',
  };
  // Professional still gets interventions — that's Mentor Intervention™
  void args.mode;
  return map[args.kind];
}

export function conceptHint(mode: LabMode, cursor: number, bars: ChartBar[]): string | null {
  const meta = LAB_MODES.find((m) => m.id === mode);
  if (!meta?.hints || bars.length < 8) return null;
  if (mode === 'intermediate' && cursor % 7 !== 0) return null;
  const slice = bars.slice(Math.max(0, cursor - 8), cursor + 1);
  if (slice.length < 5) return 'Structure observe karo — higher highs / lower lows.';
  const first = slice[0].close;
  const last = slice[slice.length - 1].close;
  const rangeHigh = Math.max(...slice.map((b) => b.high));
  const rangeLow = Math.min(...slice.map((b) => b.low));
  const nearHigh = last >= rangeHigh - (rangeHigh - rangeLow) * 0.15;
  const nearLow = last <= rangeLow + (rangeHigh - rangeLow) * 0.15;
  if (nearHigh) return 'Liquidity / range high area pass aa rahi hai — confirmation wait karo.';
  if (nearLow) return 'Range low / liquidity pocket near — risk calculate kiya?';
  if (last > first) return 'Short-term lean up — higher timeframe structure check kiya?';
  if (last < first) return 'Short-term lean soft — impulse vs pullback distinguish karo.';
  return 'Risk calculate kiya? Position size pehle, entry baad me.';
}

export function evaluateMissions(args: {
  closed: LabClosedTrade[];
  cursor: number;
  startCursor: number;
  startBalance: number;
  balance: number;
  missionIds: string[];
}): string[] {
  const done: string[] = [];
  const { closed, cursor, startCursor, startBalance, balance, missionIds } = args;
  const ddPct = startBalance > 0 ? ((startBalance - balance) / startBalance) * 100 : 0;
  const firstEntry = closed[0]?.entryBarIndex ?? Infinity;

  for (const id of missionIds) {
    if (id === 'observe5' && firstEntry - startCursor >= 8) done.push(id);
    if (id === 'rr12' && closed.length && closed.every((t) => (t.plannedRr ?? 0) >= 2)) done.push(id);
    if (id === 'max2' && closed.length > 0 && closed.length <= 2) done.push(id);
    if (id === 'protect' && closed.length > 0 && ddPct < 2) done.push(id);
    if (id === 'sl_always' && closed.length && closed.every((t) => t.stopLoss != null)) done.push(id);
  }
  // unused cursor silence
  void cursor;
  return [...new Set(done)];
}

export function sessionGrade(avgOverall: number): string {
  if (avgOverall >= 90) return 'A+';
  if (avgOverall >= 80) return 'A';
  if (avgOverall >= 70) return 'B';
  if (avgOverall >= 60) return 'C';
  if (avgOverall >= 50) return 'D';
  return 'F';
}

export function summarizeSession(closed: LabClosedTrade[], startBalance: number, balance: number) {
  const wins = closed.filter((t) => t.pnlPoints > 0);
  const losses = closed.filter((t) => t.pnlPoints < 0);
  const winRate = closed.length ? Math.round((wins.length / closed.length) * 100) : 0;
  const rrVals = closed.map((t) => t.plannedRr).filter((n): n is number => n != null && n > 0);
  const avgRr = rrVals.length
    ? Math.round((rrVals.reduce((a, b) => a + b, 0) / rrVals.length) * 10) / 10
    : 0;
  const avgOverall = closed.length
    ? Math.round(closed.reduce((s, t) => s + t.scores.overall, 0) / closed.length)
    : 0;
  const grossWin = wins.reduce((s, t) => s + t.pnlPoints, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPoints, 0));
  const profitFactor =
    grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : grossWin > 0 ? 99 : 0;
  const maxDd = Math.max(0, startBalance - Math.min(balance, startBalance));
  return {
    trades: closed.length,
    winRate,
    avgRr,
    avgOverall,
    profitFactor,
    maxDrawdown: Math.round(maxDd * 100) / 100,
    pnl: Math.round((balance - startBalance) * 100) / 100,
    grade: sessionGrade(avgOverall),
  };
}

export function buildLabTradeReviewPrompt(trade: LabClosedTrade, ctx: {
  symbol: string;
  interval: string;
  mode: LabMode;
  studentName: string;
}): string {
  return `[TRADING LAB] Module 4 — Wolf AI Trading Lab trade review
Student: ${ctx.studentName || 'Trader'}
Simulator trade (HISTORICAL REPLAY — educational lab only, not a live order):
Symbol ${ctx.symbol} · ${ctx.interval} · mode ${ctx.mode}
Side ${trade.side} qty ${trade.qty}
Entry ${trade.entry} → Exit ${trade.exit} (${trade.reason})
SL ${trade.stopLoss ?? '—'} · TP ${trade.takeProfit ?? '—'} · Planned RR ${trade.plannedRr ?? '—'}
PnL points ${trade.pnlPoints} · Held bars ${trade.heldBars}
Student notes: ${trade.notes || '(none)'}
Auto scores: Entry ${trade.scores.entryQuality}% · Risk ${trade.scores.riskManagement}% · Structure ${trade.scores.structureReading}% · Execution ${trade.scores.execution}% · Discipline ${trade.scores.discipline}% · Overall ${trade.scores.overall}/100

Deliver:
### Trade replay analysis
Walk the decision timeline (early / confirmation / liquidity / SL improvement) — process language.
### Student decision vs alternatives
Scenario A / B / C (continuation, pullback, fakeout) — educational, no new live Entry/Stop/Target for real money.
### Scores read
Agree/adjust the auto scores with reasons.
### Next drill
One focused practice assignment for the lab.

Hard rule: Do NOT invent live-market Buy/Sell orders. Lab levels above may be discussed as historical practice.`;
}

export function buildLabSessionReportPrompt(args: {
  studentName: string;
  symbol: string;
  interval: string;
  mode: LabMode;
  summary: ReturnType<typeof summarizeSession>;
  closed: LabClosedTrade[];
  interventions: string[];
  missionDone: string[];
}): string {
  const trades = args.closed
    .slice(0, 6)
    .map(
      (t, i) =>
        `${i + 1}. ${t.side} ${t.entry}→${t.exit} pnl=${t.pnlPoints} RR=${t.plannedRr ?? '—'} overall=${t.scores.overall} notes=${String(t.notes || '').slice(0, 60)}`,
    )
    .join('\n');
  return `[TRADING LAB] Module 4 — session performance report
Student: ${args.studentName || 'Trader'}
${args.symbol} ${args.interval} · ${args.mode}
Trades ${args.summary.trades} · WinRate ${args.summary.winRate}% · AvgRR ${args.summary.avgRr} · PF ${args.summary.profitFactor}
Avg score ${args.summary.avgOverall} · Grade ${args.summary.grade} · Session PnL ${args.summary.pnl}
Missions completed: ${args.missionDone.join(', ') || 'none'}
Interventions: ${args.interventions.slice(0, 5).join(' | ') || 'none'}
Trades:
${trades || '(no trades)'}

Deliver:
### Session read
### What improved
### What to fix next (exits / entries / risk / psychology)
### Next challenge
Process coaching only. Never invent live Entry/Stop/Target orders.`;
}

export function defaultSessionRules(mode: LabMode): LabSessionRules {
  if (mode === 'challenge') {
    return { maxTrades: 2, maxRiskPct: 1, minRr: 2, dailyLossLimitPct: 2 };
  }
  if (mode === 'beginner') {
    return { maxTrades: 5, maxRiskPct: 1, minRr: 1.5, dailyLossLimitPct: 4 };
  }
  return { ...DEFAULT_RULES };
}

export function awardSessionProgress(
  ownerKey: string,
  args: {
    closed: LabClosedTrade[];
    summary: ReturnType<typeof summarizeSession>;
    missionDone: string[];
  },
): LabProgress {
  const prev = loadLabProgress(ownerKey);
  let xpGain = Math.round(args.summary.avgOverall * 0.35) + args.closed.length * 4;
  for (const id of args.missionDone) {
    if (!prev.completedMissions.includes(id)) {
      const m = LAB_MISSIONS.find((x) => x.id === id);
      xpGain += m?.xp || 20;
    }
  }
  const completedMissions = [...new Set([...prev.completedMissions, ...args.missionDone])];
  const xp = prev.xp + Math.max(5, xpGain);
  const next: LabProgress = {
    xp,
    sessions: prev.sessions + 1,
    trades: prev.trades + args.closed.length,
    completedMissions,
    certTier: certTierFromXp(xp),
    bestSessionScore: Math.max(prev.bestSessionScore, args.summary.avgOverall),
  };
  saveLabProgress(next, ownerKey);
  return next;
}
