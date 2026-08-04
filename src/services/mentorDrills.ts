/** Live + historical Decision Training drills + local result log for skill scoring. */

export type DrillOption = { id: string; label: string };
export type DrillScope = 'live' | 'historical' | 'teach';

export type MentorDrill = {
  id: string;
  question: string;
  options: DrillOption[];
  /** Preferred process answer — never a trade order */
  correctId: string;
  reason: string;
  symbol: string;
  createdAt: string;
  scope: DrillScope;
  /** Optional markup hint so coach can draw the lesson */
  drawHint?: string;
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

export type DetectiveSwing = {
  label: string;
  price: number;
  barsAgo: number;
  kind: string;
};

export type DetectiveEvent = {
  label: string;
  price: number;
  barsAgo: number;
};

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
  swings?: DetectiveSwing[];
  eventDetails?: DetectiveEvent[];
  dayHigh?: number;
  dayLow?: number;
  mtf?: { daily: string; h1: string; entryTf: string };
  volumePressure?: string;
  weakBreakout?: boolean;
};

function liveProcessDrill(d: DetectiveCard): MentorDrill {
  const id = `drill-live-${Date.now()}`;
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
    if (/wait/i.test(d.bestAction)) correctId = 'wait';
  } else if (discount) {
    correctId = 'wait';
    reason =
      'Discount zone does not mean buy now — process is wait for structure confirmation / acceptance.';
  }

  return {
    id,
    scope: 'live',
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
    drawHint: `Mark current LTP ${Number(d.ltp).toFixed(1)}, session high/low, and label the ${d.zone} zone on the chart.`,
  };
}

function historicalStructureDrill(d: DetectiveCard): MentorDrill | null {
  const swings = d.swings || [];
  const events = d.eventDetails || [];
  const pick =
    events[Math.floor(Math.random() * Math.max(events.length, 1))] ||
    swings[Math.floor(Math.random() * Math.max(swings.length, 1))];
  if (!pick || !('price' in pick)) return null;

  const isEvent = 'label' in pick && /BOS|CHOCH/i.test(String(pick.label));
  const id = `drill-hist-${Date.now()}`;

  if (isEvent) {
    const ev = pick as DetectiveEvent;
    const bull = /bull/i.test(ev.label);
    return {
      id,
      scope: 'historical',
      question: `On the historical chart (~${ev.barsAgo} bars ago) a structure event printed near ${ev.price}: “${ev.label}”. What does that event mainly tell a desk reader?`,
      options: [
        { id: 'chase', label: 'Immediately buy/sell without waiting' },
        {
          id: 'shift',
          label: bull
            ? 'Bullish structure shift — still need confirmation'
            : 'Bearish structure shift — still need confirmation',
        },
        { id: 'ignore', label: 'Ignore structure — only indicators matter' },
        { id: 'guaranteed', label: 'Guaranteed reversal from that candle' },
      ],
      correctId: 'shift',
      reason: `${ev.label} is a structure clue at ${ev.price}, not a trade order. Process: note the break, wait for acceptance/confirmation.`,
      symbol: d.symbol,
      createdAt: new Date().toISOString(),
      drawHint: `Draw a vline/label for ${ev.label} at ${ev.price} with x1 ≈ -${ev.barsAgo} (bars ago).`,
    };
  }

  const sw = pick as DetectiveSwing;
  const label = sw.label || 'SH';
  const meaning: Record<string, { correctId: string; explain: string }> = {
    HH: {
      correctId: 'hh',
      explain: 'Higher High — bullish swing structure (price made a higher peak).',
    },
    HL: {
      correctId: 'hl',
      explain: 'Higher Low — bullish swing structure (pullback held higher).',
    },
    LH: {
      correctId: 'lh',
      explain: 'Lower High — bearish swing structure (rally failed lower).',
    },
    LL: {
      correctId: 'll',
      explain: 'Lower Low — bearish swing structure (price made a lower trough).',
    },
  };
  const meta = meaning[label] || {
    correctId: 'swing',
    explain: `${label} is a swing marker used to read market structure.`,
  };

  const allOpts: DrillOption[] = [
    { id: 'hh', label: 'Higher High — bullish peak structure' },
    { id: 'hl', label: 'Higher Low — bullish pullback hold' },
    { id: 'lh', label: 'Lower High — bearish failed rally' },
    { id: 'll', label: 'Lower Low — bearish trough structure' },
  ];
  const options =
    meta.correctId === 'swing'
      ? [
          ...allOpts.slice(0, 3),
          { id: 'swing', label: 'Just a random candle — no structure meaning' },
        ]
      : allOpts;

  return {
    id,
    scope: 'historical',
    question: `Historical swing ~${sw.barsAgo} bars ago at ${sw.price} is labeled ${label}. What does “${label}” mean?`,
    options,
    correctId: meta.correctId,
    reason: meta.explain,
    symbol: d.symbol,
    createdAt: new Date().toISOString(),
    drawHint: `Mark label ${label} at ${sw.price} with x1 ≈ -${sw.barsAgo}.`,
  };
}

function teachBasicsDrill(d: DetectiveCard): MentorDrill {
  const topics = [
    {
      question: 'You are new to trading. What is “market structure” mainly about?',
      correctId: 'swings',
      reason:
        'Market structure is how swing highs/lows (HH/HL/LH/LL) and breaks (BOS/CHoCH) describe bias — not a buy button.',
      options: [
        { id: 'swings', label: 'Swing highs/lows and how bias develops' },
        { id: 'news', label: 'Only reading news headlines' },
        { id: 'guess', label: 'Guessing the next tick' },
        { id: 'broker', label: 'Whatever the broker app highlights green' },
      ],
      drawHint: `Label the latest swings from MARKET INTEL on ${d.symbol}.`,
    },
    {
      question: 'Premium vs discount zone — what is the correct beginner takeaway?',
      correctId: 'context',
      reason:
        'Premium/discount is range context. It does not mean buy or sell now — wait for confirmation.',
      options: [
        { id: 'buy_disc', label: 'Discount = always buy immediately' },
        { id: 'sell_prem', label: 'Premium = always sell immediately' },
        { id: 'context', label: 'Context only — still wait for confirmation' },
        { id: 'ignore', label: 'Zones do not matter at all' },
      ],
      drawHint: `Shade session range / premium-discount context using day high ${d.dayHigh ?? ''} and day low ${d.dayLow ?? ''}.`,
    },
    {
      question: 'A beginner sees a strong green candle. Best process habit?',
      correctId: 'confirm',
      reason: 'Impulse candles tempt FOMO. Process: map structure + liquidity, wait for confirmation — never chase.',
      options: [
        { id: 'chase', label: 'Market-buy instantly (FOMO)' },
        { id: 'confirm', label: 'Check structure/liquidity, wait for confirmation' },
        { id: 'double', label: 'Double size because it looks strong' },
        { id: 'ignore_risk', label: 'Skip risk thoughts until later' },
      ],
      drawHint: `Mark recent impulse vs prior swing so the student sees why chasing is weak process.`,
    },
  ];
  const t = topics[Math.floor(Math.random() * topics.length)];
  return {
    id: `drill-teach-${Date.now()}`,
    scope: 'teach',
    question: t.question,
    options: t.options,
    correctId: t.correctId,
    reason: t.reason,
    symbol: d.symbol,
    createdAt: new Date().toISOString(),
    drawHint: t.drawHint,
  };
}

export type DrillBias = 'auto' | 'live' | 'historical' | 'teach';

/** Build a drill — rotates live tape, historical structure, and beginner teaching. */
export function buildDrillFromDetective(d: DetectiveCard, bias: DrillBias = 'auto'): MentorDrill {
  if (bias === 'live') return liveProcessDrill(d);
  if (bias === 'historical') return historicalStructureDrill(d) || liveProcessDrill(d);
  if (bias === 'teach') return teachBasicsDrill(d);

  const roll = Math.random();
  if (roll < 0.34) {
    return historicalStructureDrill(d) || liveProcessDrill(d);
  }
  if (roll < 0.55) return teachBasicsDrill(d);
  return liveProcessDrill(d);
}

export function isDrillAnswerCorrect(drill: MentorDrill, chosenId: string): boolean {
  if (chosenId === drill.correctId) return true;
  if (
    (drill.correctId === 'wait' || drill.correctId === 'no_trade') &&
    (chosenId === 'wait' || chosenId === 'no_trade')
  ) {
    return true;
  }
  return false;
}

/** Prompt fragment when grading — forces mistake callout + chart draw. */
export function gradePromptForDrill(
  drill: MentorDrill,
  chosenLabel: string,
  chosenId: string,
  correct: boolean,
): string {
  return [
    `[DECISION TRAINING] My choice: ${chosenLabel} (${chosenId}).`,
    `Drill scope: ${drill.scope}.`,
    `Drill: ${drill.question}`,
    `Correct process key: ${drill.correctId}.`,
    `Brief reason key: ${drill.reason}`,
    drill.drawHint ? `Draw hint: ${drill.drawHint}` : '',
    correct
      ? 'I was correct — briefly reinforce WHY, teach the concept simply if I am new, and DRAW the lesson on the chart (wolfchart).'
      : 'I was WRONG — clearly say where the mistake is, teach the correct idea like I am new to trading, and DRAW the correct structure/levels on the chart (wolfchart). No Entry/Stop/Target.',
  ]
    .filter(Boolean)
    .join('\n');
}
