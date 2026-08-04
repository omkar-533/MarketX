/** Prop-firm style challenge rules over paper-trading equity — process coaching only. */

export type PropChallengeRules = {
  startingCapital: number;
  dailyLossLimitPct: number;
  maxDrawdownPct: number;
  profitTargetPct: number;
};

export type PropChallengeState = {
  active: boolean;
  startedAt: string;
  startingEquity: number;
  highWater: number;
  dayStartEquity: number;
  dayKey: string;
  locked: boolean;
  lockReason?: string;
  passed: boolean;
  rules: PropChallengeRules;
};

export const MENTOR_PROP_PRESET: PropChallengeRules = {
  startingCapital: 100_000,
  dailyLossLimitPct: 5,
  maxDrawdownPct: 10,
  profitTargetPct: 8,
};

const STORAGE = 'wolf_prop_challenge_v1';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function loadPropChallenge(ownerKey = 'guest'): PropChallengeState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE}:${ownerKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PropChallengeState;
    if (!parsed?.active && !parsed?.locked && !parsed?.passed) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePropChallenge(state: PropChallengeState | null, ownerKey = 'guest'): void {
  if (typeof window === 'undefined') return;
  const key = `${STORAGE}:${ownerKey}`;
  if (!state) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(state));
}

export function startPropChallenge(rules: PropChallengeRules = MENTOR_PROP_PRESET): PropChallengeState {
  const equity = rules.startingCapital;
  return {
    active: true,
    startedAt: new Date().toISOString(),
    startingEquity: equity,
    highWater: equity,
    dayStartEquity: equity,
    dayKey: todayKey(),
    locked: false,
    passed: false,
    rules,
  };
}

/** Recompute lock / pass from current net equity. Never invents trade signals. */
export function evaluatePropChallenge(
  prev: PropChallengeState,
  netEquity: number,
): PropChallengeState {
  if (!prev.active || prev.locked || prev.passed) return prev;

  let next = { ...prev };
  const day = todayKey();
  if (day !== next.dayKey) {
    next.dayKey = day;
    next.dayStartEquity = netEquity;
  }

  next.highWater = Math.max(next.highWater, netEquity);

  const { rules, startingEquity, dayStartEquity, highWater } = next;
  const profitPct = ((netEquity - startingEquity) / startingEquity) * 100;
  const ddPct = ((highWater - netEquity) / startingEquity) * 100;
  const dayLossPct = ((dayStartEquity - netEquity) / startingEquity) * 100;

  if (profitPct >= rules.profitTargetPct) {
    return { ...next, passed: true, active: false };
  }
  if (dayLossPct >= rules.dailyLossLimitPct) {
    return {
      ...next,
      locked: true,
      active: false,
      lockReason: `Daily loss limit (${rules.dailyLossLimitPct}%) breached — session locked. Review process in Wolf AI.`,
    };
  }
  if (ddPct >= rules.maxDrawdownPct) {
    return {
      ...next,
      locked: true,
      active: false,
      lockReason: `Max drawdown (${rules.maxDrawdownPct}%) breached — challenge locked. Review risk process in Wolf AI.`,
    };
  }
  return next;
}

export function propCoachPrompt(state: PropChallengeState, netEquity: number): string {
  const pnlPct = (((netEquity - state.startingEquity) / state.startingEquity) * 100).toFixed(2);
  return [
    'Review my Mentor Prop Challenge adherence as Hunter.',
    `Start ₹${state.startingEquity.toLocaleString('en-IN')}, equity now ₹${Math.round(netEquity).toLocaleString('en-IN')} (${pnlPct}%).`,
    `Rules: daily loss ${state.rules.dailyLossLimitPct}%, max DD ${state.rules.maxDrawdownPct}%, profit target ${state.rules.profitTargetPct}%.`,
    state.locked ? `Status: LOCKED — ${state.lockReason || 'rule breach'}.` : state.passed ? 'Status: TARGET HIT.' : 'Status: IN PROGRESS.',
    'Coach process and risk discipline only — no Entry/Stop/Target or buy/sell.',
  ].join(' ');
}
