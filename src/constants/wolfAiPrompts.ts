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

/** Empty-state / general chat starters */
export const WOLF_CHAT_PROMPTS: DeskPrompt[] = [
  {
    id: 'structure',
    label: 'Market structure',
    labelHi: 'Market structure',
    prompt: 'Explain market structure simply — HH/HL, LH/LL, BOS and CHOCH — with how a desk reads bias.',
    promptHi:
      'Market structure simple samjhao — HH/HL, LH/LL, BOS aur CHOCH — desk bias kaise padhta hai.',
    hint: 'Bias & swings',
    hintHi: 'Bias & swings',
  },
  {
    id: 'liquidity',
    label: 'Liquidity & sweeps',
    labelHi: 'Liquidity & sweeps',
    prompt: 'Explain liquidity pools, stop hunts and sweeps — how institutions use them without giving trade orders.',
    promptHi:
      'Liquidity pools, stop hunts aur sweeps samjhao — institutions kaise use karte hain, bina trade order diye.',
    hint: 'Pools & traps',
    hintHi: 'Pools & traps',
  },
  {
    id: 'zones',
    label: 'Supply & demand',
    labelHi: 'Supply & demand',
    prompt: 'How do you map supply and demand zones as Areas of Interest, and what invalidates them?',
    promptHi:
      'Supply/demand zones ko Areas of Interest kaise map karte ho, aur kya unhe invalidate karta hai?',
    hint: 'AOI mapping',
    hintHi: 'AOI mapping',
  },
  {
    id: 'mtf',
    label: 'Multi-timeframe',
    labelHi: 'Multi-timeframe',
    prompt: 'Walk me through a top-down multi-timeframe confluence check — HTF context to LTF confirmation.',
    promptHi:
      'Top-down multi-timeframe confluence check samjhao — HTF context se LTF confirmation tak.',
    hint: 'HTF → LTF',
    hintHi: 'HTF → LTF',
  },
  {
    id: 'risk',
    label: 'Risk & R-multiples',
    labelHi: 'Risk & R-multiples',
    prompt: 'Explain position risk, R-multiples and drawdown discipline like a desk risk coach — no entries.',
    promptHi:
      'Position risk, R-multiples aur drawdown discipline desk risk coach jaisi samjhao — bina entry ke.',
    hint: 'Capital care',
    hintHi: 'Capital care',
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
];

/** Chart-attached prompt picker */
export const WOLF_CHART_PROMPTS: DeskPrompt[] = [
  {
    id: 'full',
    label: 'Full structure read',
    labelHi: 'Full structure read',
    prompt:
      'Analyse this chart as a senior market analyst: structure, trend bias, Areas of Interest, and bullish vs bearish scenarios. No buy/sell or entry/stop/target.',
    promptHi:
      'Is chart ka senior market analyst style analysis do: structure, trend bias, Areas of Interest, aur bullish vs bearish scenarios. Buy/sell ya entry/stop/target mat do.',
    hint: 'Complete desk brief',
    hintHi: 'Complete desk brief',
  },
  {
    id: 'aoi',
    label: 'Areas of Interest',
    labelHi: 'Areas of Interest',
    prompt:
      'Mark the key Areas of Interest on this chart and explain why each matters — with invalidation context, not trade orders.',
    promptHi:
      'Is chart pe key Areas of Interest mark karo aur batayo har ek kyun matter karta hai — invalidation ke saath, trade orders ke bina.',
    hint: 'Zones & levels',
    hintHi: 'Zones & levels',
  },
  {
    id: 'liq',
    label: 'Liquidity map',
    labelHi: 'Liquidity map',
    prompt:
      'Map likely liquidity pools, sweeps and stop clusters on this chart. Keep it probabilistic and educational.',
    promptHi:
      'Is chart pe likely liquidity pools, sweeps aur stop clusters map karo. Probabilistic aur educational rakho.',
    hint: 'Pools & sweeps',
    hintHi: 'Pools & sweeps',
  },
  {
    id: 'scenarios',
    label: 'Two scenarios',
    labelHi: 'Do scenarios',
    prompt:
      'Give two competing scenarios from this chart (continuation vs reversal) with evidence for each. No directional order.',
    promptHi:
      'Is chart se do competing scenarios do (continuation vs reversal) — har ek ka evidence. Directional order mat do.',
    hint: 'Bull vs bear path',
    hintHi: 'Bull vs bear path',
  },
  {
    id: 'ob',
    label: 'Order blocks & FVG',
    labelHi: 'Order blocks & FVG',
    prompt:
      'Identify possible order blocks, breakers and FVGs on this chart and how price may react — Areas of Interest only.',
    promptHi:
      'Is chart pe possible order blocks, breakers aur FVGs identify karo aur price reaction kaise ho sakti hai — sirf Areas of Interest.',
    hint: 'ICT-style map',
    hintHi: 'ICT-style map',
  },
  {
    id: 'mtf-chart',
    label: 'What am I missing?',
    labelHi: 'Kya miss ho raha?',
    prompt:
      'Look at this chart and tell me what a desk analyst would double-check before trusting the bias — gaps in context, not a trade call.',
    promptHi:
      'Is chart pe dekho aur batao desk analyst bias trust karne se pehle kya double-check karega — context gaps, trade call nahi.',
    hint: 'Blind spots',
    hintHi: 'Blind spots',
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
