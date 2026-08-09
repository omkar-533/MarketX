/** Predefined Wolf AI desk prompts — educational / analyst framing only. */

export type DeskPrompt = {
  id: string;
  /** Short chip / menu label */
  label: string;
  labelHi: string;
  /** Full text sent (or filled into input) */
  prompt: string;
  promptHi: string;
  hint: string;
  hintHi: string;
};

/** Wolf Mentor desk actions (process drills) — professional mentor, not a chat product */
export const MENTOR_CHAT_PROMPTS: DeskPrompt[] = [
  {
    id: 'challenge',
    label: 'Challenge my bias',
    labelHi: 'Challenge my bias',
    prompt:
      'As my professional mentor: challenge my current bias on the open chart. Ask what evidence I am using, what would invalidate it, and what I am ignoring on liquidity — Socratic desk critique, no trade orders.',
    promptHi:
      'As my professional mentor: challenge my current bias on the open chart. Ask what evidence I am using, what would invalidate it, and what I am ignoring on liquidity — Socratic desk critique, no trade orders.',
    hint: 'Desk critique',
    hintHi: 'Desk critique',
  },
  {
    id: 'invalidate',
    label: 'Define invalidation',
    labelHi: 'Define invalidation',
    prompt:
      'Process check: help me define clear invalidation for the open chart bias — what structure break or liquidity event would kill the idea. No entry or stop instructions.',
    promptHi:
      'Process check: help me define clear invalidation for the open chart bias — what structure break or liquidity event would kill the idea. No entry or stop instructions.',
    hint: 'Invalidation',
    hintHi: 'Invalidation',
  },
  {
    id: 'why-wait',
    label: 'Why wait?',
    labelHi: 'Why wait?',
    prompt:
      'Mentor session: explain why waiting for confirmation may be the higher-quality process on this chart right now, using structure and liquidity evidence. No trade call.',
    promptHi:
      'Mentor session: explain why waiting for confirmation may be the higher-quality process on this chart right now, using structure and liquidity evidence. No trade call.',
    hint: 'Patience process',
    hintHi: 'Patience process',
  },
  {
    id: 'chart-quiz',
    label: 'Process check from chart',
    labelHi: 'Process check from chart',
    prompt:
      '[MENTOR AUTO-QUIZ] Look at MARKET INTEL for the open chart and ask me ONE short process question (premium/discount, structure lean, or liquidity). Do not answer it yourself — wait for my reply. No Entry/Stop/Target.',
    promptHi:
      '[MENTOR AUTO-QUIZ] Look at MARKET INTEL for the open chart and ask me ONE short process question (premium/discount, structure lean, or liquidity). Do not answer it yourself — wait for my reply. No Entry/Stop/Target.',
    hint: 'Live tape',
    hintHi: 'Live tape',
  },
  {
    id: 'training-plan',
    label: '7-day mentor path',
    labelHi: '7-day mentor path',
    prompt: 'MY_TRAINING_PLAN',
    promptHi: 'MY_TRAINING_PLAN',
    hint: 'Training path',
    hintHi: 'Training path',
  },
];

/**
 * Default locked analysis when a screenshot is attached (setup template).
 * Used as auto-prompt if the user sends an image with no custom note.
 */
export const WOLF_SCREENSHOT_DEFAULT_PROMPT: DeskPrompt = {
  id: 'full-setup',
  label: 'Full setup card',
  labelHi: 'Full setup card',
  prompt:
    'Run the full Wolf visual pipeline on this chart. Decide WHAT MATTERS MOST. Fill locked template (Bias, Status, Key Observation, Next Action, Entry Condition, Invalidation, Alternative Scenario, Evidence Score). Prefer WAIT / NO TRADE when confirmation is missing. Exact prices only if the scale is readable. No invented levels. Bias ≠ Entry.',
  promptHi:
    'Is chart pe full Wolf visual pipeline chalao. Sabse zaroori baat decide karo. Locked template bharo (Bias, Status, Key Observation, Next Action, Entry Condition, Invalidation, Alternative Scenario, Evidence Score). Confirmation missing ho to WAIT / NO TRADE. Exact price sirf clear scale par. Invented levels nahi. Bias ≠ Entry.',
  hint: 'Bias · Watch · Plan',
  hintHi: 'Bias · Watch · Plan',
};

/** Wolf AI (Hunter) — empty-desk starters */
export const WOLF_CHAT_PROMPTS: DeskPrompt[] = [
  {
    id: 'how-to',
    label: 'How this desk works',
    labelHi: 'How this desk works',
    prompt:
      'Explain briefly how Wolf AI works: I pick a setup mode, paste a chart screenshot, you return Bias · Entry condition · SL · Target · WAIT/NO TRADE from that image only.',
    promptHi:
      'Wolf AI short me: setup mode choose, chart screenshot paste, tum Bias · Entry · SL · Target · WAIT/NO TRADE usi image se dete ho.',
    hint: 'Desk intro',
    hintHi: 'Desk intro',
  },
  {
    id: 'journal',
    label: 'Journal review',
    labelHi: 'Journal review',
    prompt: 'Review my trading journal for patterns in discipline, mistakes and edge — coaching tone only.',
    promptHi:
      'Mere trading journal mein discipline, mistakes aur edge ke patterns review karo — sirf coaching tone.',
    hint: 'Habits & edge',
    hintHi: 'Habits & edge',
  },
  {
    id: 'risk',
    label: 'Risk basics',
    labelHi: 'Risk basics',
    prompt: 'Explain position risk, R-multiples and drawdown discipline like a desk risk coach — no entries.',
    promptHi:
      'Position risk, R-multiples aur drawdown discipline desk risk coach jaisi samjhao — bina entry ke.',
    hint: 'Capital care',
    hintHi: 'Capital care',
  },
  {
    id: 'structure',
    label: 'Structure primer',
    labelHi: 'Structure primer',
    prompt: 'Explain market structure simply — HH/HL, LH/LL, BOS and CHOCH — with how a desk reads bias.',
    promptHi:
      'Market structure simple samjhao — HH/HL, LH/LL, BOS and CHOCH — desk bias kaise padhta hai.',
    hint: 'Bias & swings',
    hintHi: 'Bias & swings',
  },
];

/** Shared chart questions — always shown first */
const WOLF_CHART_PROMPTS_SHARED: DeskPrompt[] = [
  WOLF_SCREENSHOT_DEFAULT_PROMPT,
  {
    id: 'wait-or-trade',
    label: 'Wait or trade?',
    labelHi: 'Wait or trade?',
    prompt:
      'From this screenshot only: is this WAIT, NO TRADE, or a potential setup? Give Bias, Status, confirmation needed, and Invalidation. Exact prices only if readable.',
    promptHi:
      'Sirf is screenshot se: WAIT, NO TRADE, ya potential setup? Bias, Status, confirmation, Invalidation do. Exact price agar scale clear ho.',
    hint: 'Status check',
    hintHi: 'Status check',
  },
  {
    id: 'invalidation',
    label: 'What kills it?',
    labelHi: 'What kills it?',
    prompt:
      'Using only visible structure on this screenshot, define clear invalidation for the selected setup mode. Include Bias and Evidence Score.',
    promptHi:
      'Sirf is screenshot ki visible structure se selected setup ke liye clear invalidation likho. Bias aur Evidence Score bhi do.',
    hint: 'Invalidation',
    hintHi: 'Invalidation',
  },
  {
    id: 'entry-condition',
    label: 'Entry condition',
    labelHi: 'Entry condition',
    prompt:
      'Do not say buy now. From this screenshot, state potential direction + conditional Entry Condition + SL logic + Target logic for the selected mode. Prefer WAIT if confirmation is missing.',
    promptHi:
      'Buy now mat bolo. Is screenshot se potential direction + conditional Entry + SL + Target (selected mode). Confirmation missing ho to WAIT.',
    hint: 'Conditional entry',
    hintHi: 'Conditional entry',
  },
  {
    id: 'tight-brief',
    label: 'Ultra short card',
    labelHi: 'Ultra short card',
    prompt:
      'Same locked setup template, ultra short — max 10 lines. Evidence only from the screenshot.',
    promptHi:
      'Wahi locked setup template, ultra short — max 10 lines. Sirf screenshot evidence.',
    hint: 'Minimal',
    hintHi: 'Minimal',
  },
  {
    id: 'key-observation',
    label: 'Key observation',
    labelHi: 'Key observation',
    prompt:
      'Start with the single strongest Key Observation on this screenshot, then complete the setup card for the selected mode.',
    promptHi:
      'Pehle is screenshot ki sabse strong Key Observation, phir selected mode ka full setup card.',
    hint: 'What stands out',
    hintHi: 'What stands out',
  },
];

type ChartPromptPack = Partial<Record<string, DeskPrompt[]>>;

const WOLF_CHART_PROMPTS_BY_MODE: ChartPromptPack = {
  auto: [
    {
      id: 'auto-confluence',
      label: 'Confluence score',
      labelHi: 'Confluence score',
      prompt:
        'AUTO mode: score Structure, Liquidity, S/R, Price Action, Trend from this screenshot (bullish/bearish/neutral each). Then confluence → Bias + Status + WAIT/NO TRADE if conflicted.',
      promptHi:
        'AUTO: is screenshot se Structure, Liquidity, S/R, PA, Trend score karo. Confluence se Bias + Status; conflict pe WAIT/NO TRADE.',
      hint: 'Multi-engine',
      hintHi: 'Multi-engine',
    },
    {
      id: 'auto-best-setup',
      label: 'Best visible setup',
      labelHi: 'Best visible setup',
      prompt:
        'Which single setup is clearest on this screenshot (S/R, liquidity, structure, breakout…)? Run that framework and return the full setup card.',
      promptHi:
        'Is screenshot pe sabse clear kaunsa setup hai? Usi framework se full setup card do.',
      hint: 'Pick best',
      hintHi: 'Pick best',
    },
    {
      id: 'auto-conflicts',
      label: 'Signal conflicts',
      labelHi: 'Signal conflicts',
      prompt:
        'List conflicting signals on this screenshot. If conflicted, return NO CLEAR SETUP / WAIT with Evidence Score.',
      promptHi:
        'Screenshot pe conflicting signals list karo. Conflict pe NO CLEAR SETUP / WAIT + Evidence Score.',
      hint: 'Conflicts',
      hintHi: 'Conflicts',
    },
  ],
  support_resistance: [
    {
      id: 'sr-zones',
      label: 'Mark key S/R',
      labelHi: 'Mark key S/R',
      prompt:
        'Support/Resistance mode: list major swing zones, reaction count, break/retest status, role reversal. Then Bias, Entry condition, SL/Target logic, Invalidation.',
      promptHi:
        'S/R mode: major swing zones, reactions, break/retest, role flip. Phir Bias, Entry, SL/Target, Invalidation.',
      hint: 'Zones',
      hintHi: 'Zones',
    },
    {
      id: 'sr-retest',
      label: 'Break & retest?',
      labelHi: 'Break & retest?',
      prompt:
        'Is there a clear break and retest of S/R on this screenshot? If incomplete → WAIT. Include Evidence Score.',
      promptHi:
        'Screenshot pe clear break+retest hai? Incomplete ho to WAIT. Evidence Score bhi do.',
      hint: 'Retest',
      hintHi: 'Retest',
    },
    {
      id: 'sr-strong-weak',
      label: 'Strong vs weak',
      labelHi: 'Strong vs weak',
      prompt:
        'Which S/R zones look strong vs weak on this chart (reactions, wicks, acceptance)? Setup card next.',
      promptHi:
        'Kaunse S/R strong/weak dikhte hain (reactions, wicks, acceptance)? Phir setup card.',
      hint: 'Strength',
      hintHi: 'Strength',
    },
  ],
  liquidity: [
    {
      id: 'liq-pools',
      label: 'Where is liquidity?',
      labelHi: 'Where is liquidity?',
      prompt:
        'Liquidity mode: identify BSL/SSL, equal highs/lows, PDH/PDL-style pools if visible. Swept yet? Displacement? Structure confirm? Full setup card.',
      promptHi:
        'Liquidity: BSL/SSL, equal H/L, PDH/PDL jaisa dikhe. Swept? Displacement? Structure confirm? Full setup card.',
      hint: 'Pools',
      hintHi: 'Pools',
    },
    {
      id: 'liq-sweep',
      label: 'Sweep confirmed?',
      labelHi: 'Sweep confirmed?',
      prompt:
        'Was liquidity swept on this screenshot? If yes, is confirmation (displacement/BOS) present or still WAIT FOR CONFIRMATION?',
      promptHi:
        'Liquidity sweep hua? Confirmation (displacement/BOS) hai ya WAIT FOR CONFIRMATION?',
      hint: 'Sweep',
      hintHi: 'Sweep',
    },
    {
      id: 'liq-next',
      label: 'Next pool target',
      labelHi: 'Next pool target',
      prompt:
        'After the visible liquidity event, what is the next logical opposing liquidity pool as Target Logic? Bias + Invalidation required.',
      promptHi:
        'Visible liquidity event ke baad next opposing pool Target Logic? Bias + Invalidation zaroori.',
      hint: 'Targets',
      hintHi: 'Targets',
    },
  ],
  market_structure: [
    {
      id: 'str-bias',
      label: 'Structure bias',
      labelHi: 'Structure bias',
      prompt:
        'Market Structure mode: label HH/HL/LH/LL and any BOS/CHOCH from the screenshot. Bias, Status, Entry condition, Invalidation.',
      promptHi:
        'Structure: HH/HL/LH/LL aur BOS/CHOCH label karo. Bias, Status, Entry, Invalidation.',
      hint: 'HH/HL',
      hintHi: 'HH/HL',
    },
    {
      id: 'str-bos',
      label: 'BOS or CHOCH?',
      labelHi: 'BOS or CHOCH?',
      prompt:
        'Is the latest structural event a BOS or CHOCH/MSS on this chart? If unclear → WAIT. Full setup card.',
      promptHi:
        'Latest event BOS hai ya CHOCH/MSS? Unclear → WAIT. Full setup card.',
      hint: 'Events',
      hintHi: 'Events',
    },
    {
      id: 'str-range',
      label: 'Trend or range?',
      labelHi: 'Trend or range?',
      prompt:
        'Is price trending or ranging on this screenshot? Expansion vs compression. Setup card with Evidence Score.',
      promptHi:
        'Trend hai ya range? Expansion vs compression. Setup card + Evidence Score.',
      hint: 'Context',
      hintHi: 'Context',
    },
  ],
  breakout: [
    {
      id: 'bo-valid',
      label: 'Valid breakout?',
      labelHi: 'Valid breakout?',
      prompt:
        'Breakout mode: range edges, breakout candle, displacement, retest. Status: valid / developing / false-break risk / none. Full setup card.',
      promptHi:
        'Breakout: range, candle, displacement, retest. Status: valid/developing/false-break/none. Full setup card.',
      hint: 'Validate',
      hintHi: 'Validate',
    },
    {
      id: 'bo-retest',
      label: 'Wait for retest?',
      labelHi: 'Wait for retest?',
      prompt:
        'Should we WAIT for retest after this break, or is confirmation already visible? Entry condition + SL beyond range.',
      promptHi:
        'Break ke baad retest WAIT karein ya confirmation already hai? Entry + SL beyond range.',
      hint: 'Retest',
      hintHi: 'Retest',
    },
  ],
  reversal: [
    {
      id: 'rev-exhaust',
      label: 'Reversal signs',
      labelHi: 'Reversal signs',
      prompt:
        'Reversal mode: exhaustion, rejection, sweep, structure shift — only if visible. Never call a single wick a confirmed reversal. Setup card.',
      promptHi:
        'Reversal: exhaustion, rejection, sweep, structure shift — sirf jo dikhe. Ek wick pe confirm mat bolo. Setup card.',
      hint: 'Evidence',
      hintHi: 'Evidence',
    },
    {
      id: 'rev-confirm',
      label: 'Need confirmation?',
      labelHi: 'Need confirmation?',
      prompt:
        'Is reversal confirmed or still WAITING FOR CONFIRMATION on this screenshot? State what confirms it.',
      promptHi:
        'Reversal confirmed hai ya WAITING? Kya confirm karega — likho.',
      hint: 'Confirm',
      hintHi: 'Confirm',
    },
  ],
  supply_demand: [
    {
      id: 'sd-zones',
      label: 'Fresh demand/supply',
      labelHi: 'Fresh demand/supply',
      prompt:
        'Supply/Demand mode: impulse–base–departure zones. Fresh vs tested vs broken. Proximal/distal only if clear. Full setup card.',
      promptHi:
        'S/D: impulse–base–departure. Fresh/tested/broken. Proximal/distal agar clear. Full setup card.',
      hint: 'Zones',
      hintHi: 'Zones',
    },
    {
      id: 'sd-reaction',
      label: 'Zone reaction',
      labelHi: 'Zone reaction',
      prompt:
        'Is price reacting at a fresh zone now, or still approaching? Entry conditional on reaction. Invalidation beyond distal.',
      promptHi:
        'Fresh zone pe reaction hai ya abhi approach? Entry reaction pe conditional. Invalidation distal ke paar.',
      hint: 'Reaction',
      hintHi: 'Reaction',
    },
  ],
  price_action: [
    {
      id: 'pa-context',
      label: 'PA in context',
      labelHi: 'PA in context',
      prompt:
        'Price Action mode: rejection/engulfing/pin/displacement only in context of nearby levels/structure on this screenshot. Setup card.',
      promptHi:
        'PA: rejection/engulfing/pin/displacement — nearby levels/structure ke context me. Setup card.',
      hint: 'Candles+',
      hintHi: 'Candles+',
    },
    {
      id: 'pa-momentum',
      label: 'Compression/expansion',
      labelHi: 'Compression/expansion',
      prompt:
        'Is the chart compressing or expanding? What does that imply for Bias and Status on this screenshot?',
      promptHi:
        'Compression hai ya expansion? Bias/Status pe kya matlab — is screenshot se.',
      hint: 'Momentum',
      hintHi: 'Momentum',
    },
  ],
  smc: [
    {
      id: 'smc-concepts',
      label: 'SMC scan',
      labelHi: 'SMC scan',
      prompt:
        'SMC mode: structure, liquidity, BOS/CHOCH, FVG, Order Block — each with short evidence or skip if not visible. Full setup card.',
      promptHi:
        'SMC: structure, liquidity, BOS/CHOCH, FVG, OB — evidence ke saath, warna skip. Full setup card.',
      hint: 'Concepts',
      hintHi: 'Concepts',
    },
    {
      id: 'smc-ob',
      label: 'OB / FVG focus',
      labelHi: 'OB / FVG focus',
      prompt:
        'Focus on Order Block and FVG if visible. Mitigation status? Bias, Entry condition, Invalidation.',
      promptHi:
        'OB aur FVG pe focus (agar dikhe). Mitigation? Bias, Entry, Invalidation.',
      hint: 'OB/FVG',
      hintHi: 'OB/FVG',
    },
  ],
  ict: [
    {
      id: 'ict-mss',
      label: 'MSS / sweep',
      labelHi: 'MSS / sweep',
      prompt:
        'ICT mode: MSS/CHOCH, liquidity sweep, displacement, FVG. Premium/discount only if range readable. Setup card.',
      promptHi:
        'ICT: MSS/CHOCH, sweep, displacement, FVG. Premium/discount agar range clear. Setup card.',
      hint: 'ICT flow',
      hintHi: 'ICT flow',
    },
    {
      id: 'ict-pd',
      label: 'Premium / discount',
      labelHi: 'Premium / discount',
      prompt:
        'If the dealing range is readable, is price in premium or discount? How that affects Bias and Entry condition.',
      promptHi:
        'Dealing range clear ho to premium/discount? Bias aur Entry pe asar.',
      hint: 'PD array',
      hintHi: 'PD array',
    },
  ],
  fibonacci: [
    {
      id: 'fib-pullback',
      label: 'Fib pullback',
      labelHi: 'Fib pullback',
      prompt:
        'Fibonacci mode: only if swing anchors are clear. Confluence with S/R/structure. Setup card — invent no ratios without anchors.',
      promptHi:
        'Fib: sirf clear swing anchors pe. S/R/structure confluence. Bina anchors ke ratios invent mat karo.',
      hint: 'Retrace',
      hintHi: 'Retrace',
    },
    {
      id: 'fib-confluence',
      label: 'Fib + level',
      labelHi: 'Fib + level',
      prompt:
        'Where does fib confluence with a visible level on this chart? Entry condition + Invalidation.',
      promptHi:
        'Fib kahan visible level se milta hai? Entry + Invalidation.',
      hint: 'Confluence',
      hintHi: 'Confluence',
    },
  ],
  momentum: [
    {
      id: 'mom-expand',
      label: 'Momentum state',
      labelHi: 'Momentum state',
      prompt:
        'Momentum mode: compression → expansion quality, continuation vs exhaustion from the screenshot. Setup card.',
      promptHi:
        'Momentum: compression→expansion, continuation vs exhaustion. Setup card.',
      hint: 'Impulse',
      hintHi: 'Impulse',
    },
    {
      id: 'mom-chop',
      label: 'Dead chop?',
      labelHi: 'Dead chop?',
      prompt:
        'Is this dead chop (NO TRADE / WAIT) or actionable momentum? Evidence Score required.',
      promptHi:
        'Dead chop (NO TRADE/WAIT) hai ya actionable momentum? Evidence Score zaroori.',
      hint: 'Filter',
      hintHi: 'Filter',
    },
  ],
  trend: [
    {
      id: 'trd-hl',
      label: 'Trend structure',
      labelHi: 'Trend structure',
      prompt:
        'Trend mode: higher highs/lows or lower highs/lows. Pullback vs break of trend. Setup card.',
      promptHi:
        'Trend: HH/HL ya LH/LL. Pullback vs trend break. Setup card.',
      hint: 'Direction',
      hintHi: 'Direction',
    },
    {
      id: 'trd-pullback',
      label: 'Pullback or reverse?',
      labelHi: 'Pullback or reverse?',
      prompt:
        'Is the visible move a pullback in trend or a reversal? Conditional Entry + Invalidation. Prefer WAIT if unclear.',
      promptHi:
        'Pullback in trend hai ya reversal? Conditional Entry + Invalidation. Unclear → WAIT.',
      hint: 'Pullback',
      hintHi: 'Pullback',
    },
  ],
  mbp: [
    {
      id: 'mbp-pillars',
      label: 'MBP v1 pillars',
      labelHi: 'MBP v1 pillars',
      prompt:
        'MBP v1: evaluate Market Context → Liquidity → Structure → Price Action → Confirmation → Entry → SL → Target → RR → Invalidation. Fail any critical pillar → WAIT/NO TRADE.',
      promptHi:
        'MBP v1: Context→Liquidity→Structure→PA→Confirmation→Entry→SL→Target→RR→Invalidation. Critical fail → WAIT/NO TRADE.',
      hint: 'MBP flow',
      hintHi: 'MBP flow',
    },
    {
      id: 'mbp-pass',
      label: 'MBP pass/fail',
      labelHi: 'MBP pass/fail',
      prompt:
        'Does this screenshot pass MBP v1 end-to-end? List which pillars pass/fail, then full setup card.',
      promptHi:
        'MBP v1 pass hota hai? Pillars pass/fail list, phir full setup card.',
      hint: 'Scorecard',
      hintHi: 'Scorecard',
    },
  ],
  custom: [
    {
      id: 'custom-follow',
      label: 'Follow my notes',
      labelHi: 'Follow my notes',
      prompt:
        'Custom mode: follow any instructions I type with the screenshot, still using the locked setup template and hallucination rules.',
      promptHi:
        'Custom: meri typed instructions follow karo + locked setup template + no hallucination.',
      hint: 'User rules',
      hintHi: 'User rules',
    },
  ],
};

/** Chart-attached prompt picker — shared + selected setup extras */
export function getWolfChartPrompts(analysisMode: string = 'auto'): DeskPrompt[] {
  const mode = String(analysisMode || 'auto');
  const extras = WOLF_CHART_PROMPTS_BY_MODE[mode] || WOLF_CHART_PROMPTS_BY_MODE.auto || [];
  const byId = new Map<string, DeskPrompt>();
  for (const p of [...WOLF_CHART_PROMPTS_SHARED, ...extras]) {
    byId.set(p.id, p);
  }
  return [...byId.values()];
}

/** @deprecated Prefer getWolfChartPrompts(analysisMode) */
export const WOLF_CHART_PROMPTS: DeskPrompt[] = getWolfChartPrompts('auto');

export function deskPromptText(p: DeskPrompt, hinglish: boolean): string {
  return hinglish ? p.promptHi : p.prompt;
}

export function deskPromptLabel(p: DeskPrompt, hinglish: boolean): string {
  return hinglish ? p.labelHi : p.label;
}

export function deskPromptHint(p: DeskPrompt, hinglish: boolean): string {
  return hinglish ? p.hintHi : p.hint;
}
