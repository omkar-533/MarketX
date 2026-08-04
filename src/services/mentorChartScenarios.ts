/** Module 2 — Wolf AI Chart Mentor: educational scenario prompts + light parsers. */

export type ChartMentorRelatedLevel = {
  levelId: number;
  title: string;
  reason: string;
};

/** Map chart themes to Module 1 curriculum levels for deep-links. */
export const CHART_MENTOR_TOPIC_LEVELS: ChartMentorRelatedLevel[] = [
  { levelId: 3, title: 'Trend', reason: 'trend / bias conflict' },
  { levelId: 4, title: 'Support & Resistance', reason: 'reaction areas' },
  { levelId: 5, title: 'Liquidity', reason: 'BSL/SSL / sweeps' },
  { levelId: 6, title: 'Market Structure', reason: 'BOS / CHoCH' },
  { levelId: 7, title: 'SMC', reason: 'OB / FVG / premium-discount' },
  { levelId: 9, title: 'Price Action', reason: 'candle context at location' },
  { levelId: 10, title: 'Risk Management', reason: 'invalidation thinking' },
];

export type ChartMentorConfidence = {
  structure: number | null;
  liquidity: number | null;
  trend: number | null;
  overall: string | null;
};

export type ParsedChartMentor = {
  relatedLevelId: number | null;
  confidence: ChartMentorConfidence;
  hasScenarios: boolean;
};

export const CHART_MENTOR_FOLLOWUPS = [
  { id: 'bos', label: 'BOS kyun?', prompt: 'Is chart pe BOS kyun consider kiya? Evidence batao — no trade orders.' },
  { id: 'choch', label: 'CHOCH kahan?', prompt: 'CHOCH kahan dikh raha hai ya abhi confirm nahi? Why — no Entry/SL/Target.' },
  { id: 'fvg', label: 'FVG explain', prompt: 'Visible FVG / imbalance Area of Interest explain karo with why. No trade orders.' },
  { id: 'scenario', label: 'Dusra scenario', prompt: 'Scenario B ko thoda deeper expand karo: evidence + invalidation AOI. No Entry/SL/Target.' },
  { id: 'fail', label: 'Agar breakout fail?', prompt: 'Agar breakout / BOS fail ho to process mein kya badlega? Invalidation AOI — no trade orders.' },
  { id: 'easy', label: 'Easy language', prompt: 'Same chart mentor read simpler language mein samjhao. Areas of Interest only.' },
] as const;

export function buildChartMentorAnalyzePrompt(input: {
  symbolLabel: string;
  interval: string;
  studentName?: string;
  weakAreas?: string[];
  experience?: string;
}): string {
  const weak =
    input.weakAreas?.length
      ? `Student weak areas (explain these with extra care): ${input.weakAreas.join(', ')}.`
      : '';
  const level =
    input.experience === 'none' || input.experience === 'beginner'
      ? 'Student is beginner — simple language, define terms once.'
      : 'Student can handle SMC/ICT terms with one-line definitions.';

  return `[CHART MENTOR] Module 2 — Wolf AI Chart Mentor educational read.
Open chart: ${input.symbolLabel} · ${input.interval}
Student: ${input.studentName || 'Student'}
${level}
${weak}

Run a full educational mentor breakdown using MARKET INTEL (and screenshot if provided).
Teach reasoning so the student can read the NEXT chart alone.
NEVER Entry / Stop / Target / Buy / Sell / RR as orders.
Use Confirmation AOIs and Invalidation AOIs instead of an entry planner.
If a screenshot is blurry/unclear, ask for a clearer image before inventing levels.
End with wolfchart Areas of Interest marks.`;
}

export function buildChartMentorFollowupPrompt(chipPrompt: string): string {
  return `[CHART MENTOR FOLLOW-UP] ${chipPrompt}
Stay on the open chart context. Educational Areas of Interest only — never Entry/Stop/Target.`;
}

/** Infer a Module 1 level from reply keywords. */
export function inferRelatedLevelId(text: string): number | null {
  const t = text.toLowerCase();
  if (/\b(liquidity|bsl|ssl|sweep|equal high|equal low)\b/i.test(t)) return 5;
  if (/\b(bos|choch|market structure|hh|hl|lh|ll)\b/i.test(t)) return 6;
  if (/\b(order block|fvg|fair value|premium|discount|smc)\b/i.test(t)) return 7;
  if (/\b(support|resistance|demand|supply)\b/i.test(t)) return 4;
  if (/\b(pin bar|engulf|doji|price action|rejection candle)\b/i.test(t)) return 9;
  if (/\b(trend|higher high|lower low)\b/i.test(t)) return 3;
  if (/\b(risk|invalidat|heat)\b/i.test(t)) return 10;
  return 6;
}

function pctNear(label: RegExp, text: string): number | null {
  const m = text.match(new RegExp(`${label.source}[^\\d%]{0,40}(\\d{1,3})\\s*%`, 'i'));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

export function parseChartMentorReply(text: string): ParsedChartMentor {
  const confidence: ChartMentorConfidence = {
    structure: pctNear(/structure/i, text),
    liquidity: pctNear(/liquidity/i, text),
    trend: pctNear(/trend/i, text),
    overall: null,
  };
  const overall =
    text.match(/overall\s*confidence[^:\n]*[:\-]?\s*(high|medium|low|moderate)/i) ||
    text.match(/\b(high|medium|low|moderate)\s+overall\b/i);
  if (overall) confidence.overall = overall[1].toLowerCase();

  const hasScenarios =
    /scenario\s*a\b/i.test(text) ||
    /scenario\s*1\b/i.test(text) ||
    (/bullish/i.test(text) && /bearish/i.test(text) && /\d{1,3}\s*%/.test(text));

  return {
    relatedLevelId: inferRelatedLevelId(text),
    confidence,
    hasScenarios,
  };
}

export function relatedLevelMeta(levelId: number | null): ChartMentorRelatedLevel | null {
  if (!levelId) return null;
  return CHART_MENTOR_TOPIC_LEVELS.find((l) => l.levelId === levelId) ?? null;
}
