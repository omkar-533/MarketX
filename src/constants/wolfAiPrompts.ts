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
 * Default locked analysis when a screenshot is attached (Upside / Downside / Wait).
 * Used as auto-prompt if the user sends an image with no custom note.
 */
export const WOLF_SCREENSHOT_DEFAULT_PROMPT: DeskPrompt = {
  id: 'scenarios-3',
  label: '3-path brief',
  labelHi: '3-path brief',
  prompt:
    'Analyse this chart screenshot. Use the locked format only: (1) Upside — where price can move up and why, (2) Downside — where price can move down and why, (3) Wait / Range — why waiting may be better. Short, crisp evidence from what is visible. No buy/sell, entry, stop, or target.',
  promptHi:
    'Is chart screenshot ko analyse karo. Sirf locked format: (1) Upside — up kahan/kyun, (2) Downside — down kahan/kyun, (3) Wait / Range — wait kyun better. Short crisp evidence — jo dikhe. Buy/sell, entry, stop, target mat do.',
  hint: 'Up · Down · Wait',
  hintHi: 'Up · Down · Wait',
};

/** Wolf AI (Hunter) — empty-desk starters (screenshot desk) */
export const WOLF_CHAT_PROMPTS: DeskPrompt[] = [
  {
    id: 'how-to',
    label: 'How this desk works',
    labelHi: 'How this desk works',
    prompt:
      'Explain briefly how Wolf AI screenshot analysis works: I paste a chart, you reply with Upside / Downside / Wait paths — no trade orders.',
    promptHi:
      'Wolf AI screenshot analysis kaise kaam karti hai short me batao: main chart paste karta hoon, tum Upside / Downside / Wait paths dete ho — trade orders nahi.',
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

/** Chart-attached prompt picker — all map to 3-path style */
export const WOLF_CHART_PROMPTS: DeskPrompt[] = [
  WOLF_SCREENSHOT_DEFAULT_PROMPT,
  {
    id: 'tight',
    label: 'Ultra short',
    labelHi: 'Ultra short',
    prompt:
      'Same locked Upside / Downside / Wait format, but ultra short — max 8 lines total. Evidence only from the screenshot. No trade orders.',
    promptHi:
      'Wahi Upside / Downside / Wait format, lekin ultra short — max 8 lines. Sirf screenshot evidence. Trade orders nahi.',
    hint: 'Minimal brief',
    hintHi: 'Minimal brief',
  },
  {
    id: 'levels-focus',
    label: 'Levels focus',
    labelHi: 'Levels focus',
    prompt:
      '3-path format (Upside / Downside / Wait) with extra attention to clear support, resistance and liquidity from this screenshot. No trade orders.',
    promptHi:
      '3-path format (Upside / Downside / Wait) — support, resistance aur liquidity pe focus, jo screenshot me clear ho. Trade orders nahi.',
    hint: 'S/R & pools',
    hintHi: 'S/R & pools',
  },
  {
    id: 'htf-lean',
    label: 'Structure lean',
    labelHi: 'Structure lean',
    prompt:
      '3-path format focusing on HH/HL vs LH/LL, BOS/CHOCH clues and range vs trend from this screenshot. No trade orders.',
    promptHi:
      '3-path format — HH/HL vs LH/LL, BOS/CHOCH, range vs trend jo screenshot me dikhe. Trade orders nahi.',
    hint: 'Structure',
    hintHi: 'Structure',
  },
];

export function deskPromptText(p: DeskPrompt, hinglish: boolean): string {
  return hinglish ? p.promptHi : p.prompt;
}

export function deskPromptLabel(p: DeskPrompt, hinglish: boolean): string {
  return hinglish ? p.labelHi : p.label;
}

export function deskPromptHint(p: DeskPrompt, hinglish: boolean): string {
  return hinglish ? p.hintHi : p.hint;
}
