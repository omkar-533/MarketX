/** Live Decision Training drills + local result log for skill scoring. */

export type DrillOption = { id: string; label: string };
export type MentorDrill = {
  id: string;
  question: string;
  options: DrillOption[];
  /** Preferred process answer — never a trade order */
  correctId: string;
  reason: string;
  symbol: string;
  createdAt: string;
};

export type DrillResult = {
  drillId: string;
  chosenId: string;
  correct: boolean;
  at: string;
  symbol: string;
};

const STORAGE = 'wolf_ai_drill_log_v1';

export function loadDrillResults(ownerKey = 'guest'): DrillResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${STORAGE}:${ownerKey}`);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function saveDrillResult(result: DrillResult, ownerKey = 'guest'): void {
  if (typeof window === 'undefined') return;
  const prev = loadDrillResults(ownerKey);
  const next = [...prev, result].slice(-200);
  window.localStorage.setItem(`${STORAGE}:${ownerKey}`, JSON.stringify(next));
}

export type DetectiveCard = {
  symbol: string;
  interval: string;
  trend: string;
  liquidity: string;
  institutionalZone: string;
  volatility: string;
  zone: string;
  bestAction: string;
  confidence: number;
  ltp: number;
  events?: string[];
  mtf?: { daily: string; h1: string; entryTf: string };
  volumePressure?: string;
  weakBreakout?: boolean;
};

/** Build a multiple-choice process drill from the detective brief. */
export function buildDrillFromDetective(d: DetectiveCard): MentorDrill {
  const id = `drill-${Date.now()}`;
  const premium = d.zone === 'premium';
  const discount = d.zone === 'discount';
  const weak = Boolean(d.weakBreakout);

  let correctId = 'wait';
  let reason = d.bestAction;
  if (weak) {
    correctId = 'wait';
    reason = 'Volume does not confirm acceptance — treat the move as weak and wait.';
  } else if (premium) {
    correctId = 'sell_rejection';
    reason =
      'Price is in a premium zone versus the recent range — chasing breakout longs is lower-quality process; waiting for rejection or confirmation is cleaner.';
    // Still grade "wait" as also acceptable via correctId primary wait if bestAction says wait
    if (/wait/i.test(d.bestAction)) correctId = 'wait';
  } else if (discount) {
    correctId = 'wait';
    reason =
      'Discount zone does not mean buy now — process is wait for structure confirmation / acceptance.';
  }

  return {
    id,
    question: `${d.symbol} near ${Number(d.ltp).toFixed(1)} is in a ${d.zone} zone (${d.trend} lean, ${d.volatility.toLowerCase()} volatility). What is the better process choice?`,
    options: [
      { id: 'buy_breakout', label: 'Buy the breakout now' },
      { id: 'sell_rejection', label: 'Fade / sell rejection only if confirmed' },
      { id: 'wait', label: 'Wait for confirmation' },
      { id: 'no_trade', label: 'No trade — conditions unclear' },
    ],
    correctId,
    reason,
    symbol: d.symbol,
    createdAt: new Date().toISOString(),
  };
}

export function isDrillAnswerCorrect(drill: MentorDrill, chosenId: string): boolean {
  if (chosenId === drill.correctId) return true;
  // Waiting / no-trade are both acceptable when the key lesson is patience.
  if (
    (drill.correctId === 'wait' || drill.correctId === 'no_trade') &&
    (chosenId === 'wait' || chosenId === 'no_trade')
  ) {
    return true;
  }
  return false;
}
