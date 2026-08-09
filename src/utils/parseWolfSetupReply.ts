/** Parse Hunter lock-template replies into structured Wolf Vision UI data. */

export type WolfSetupStatus =
  | 'CONFIRMED'
  | 'WAITING'
  | 'DEVELOPING'
  | 'INVALIDATED'
  | 'NO_TRADE'
  | 'UNKNOWN';

export type WolfSetupBias = 'LONG' | 'SHORT' | 'WAIT' | 'NO_TRADE' | 'UNKNOWN';

export type WolfSetupAnalysis = {
  bias: WolfSetupBias;
  status: WolfSetupStatus;
  setup: string;
  keyObservation: string;
  entry: string;
  stopLoss: string;
  target: string;
  invalidation: string;
  /** Explicit “Next Action / Watch This” from the model when present. */
  nextAction: string;
  evidenceScore: number | null;
  why: string[];
  assumptions: string;
  /** Conditional branch if primary thesis fails. */
  alternative: string;
  raw: string;
};

function pickField(text: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\n)\\s*\\*{0,2}${label}\\*{0,2}\\s*[:：-]\\s*([^\\n]+)`,
      'i',
    );
    const m = text.match(re);
    if (m?.[1]?.trim()) return m[1].trim().replace(/^\*+|\*+$/g, '').trim();
  }
  return '';
}

function normalizeBias(raw: string): WolfSetupBias {
  const t = raw.toUpperCase();
  if (/\bNO\s*TRADE\b/.test(t)) return 'NO_TRADE';
  if (/\bWAIT\b/.test(t)) return 'WAIT';
  if (/\bLONG\b/.test(t)) return 'LONG';
  if (/\bSHORT\b/.test(t)) return 'SHORT';
  return 'UNKNOWN';
}

function normalizeStatus(raw: string): WolfSetupStatus {
  const t = raw.toUpperCase();
  if (/NO\s*TRADE/.test(t)) return 'NO_TRADE';
  if (/INVALID/.test(t)) return 'INVALIDATED';
  if (/CONFIRM/.test(t) && !/WAIT|PENDING|FOR\s*CONFIRM/.test(t)) return 'CONFIRMED';
  if (/WAIT|PENDING/.test(t)) return 'WAITING';
  if (/DEVELOP/.test(t)) return 'DEVELOPING';
  return 'UNKNOWN';
}

function pickWhy(text: string): string[] {
  const block = text.match(/(?:^|\n)\s*\*{0,2}Why\*{0,2}\s*[:：]?\s*([\s\S]*?)(?=\n\s*\*{0,2}(?:Assumptions|Unknown|Alternative)|$)/i);
  const body = block?.[1] || '';
  const lines = body
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim())
    .filter((l) => l.length > 2 && !/^why\b/i.test(l));
  return lines.slice(0, 5);
}

function pickScore(raw: string): number | null {
  const m = raw.match(/(\d{1,3})\s*(?:\/\s*100)?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Returns structured analysis when enough lock-template fields are present. */
export function parseWolfSetupReply(text: string): WolfSetupAnalysis | null {
  const raw = String(text || '').trim();
  if (!raw || raw.length < 40) return null;

  const biasRaw = pickField(raw, ['Market Bias', 'Bias']);
  const statusRaw = pickField(raw, ['Setup Status', 'Status']);
  const entry = pickField(raw, ['Entry Condition', 'Entry']);
  const stopLoss = pickField(raw, ['Stop Loss Logic', 'Stop Loss', 'SL']);
  const target = pickField(raw, ['Target Logic', 'Target']);
  const invalidation = pickField(raw, ['Invalidation']);
  const setup = pickField(raw, ['Setup']);
  const keyObservation = pickField(raw, ['Key Observation', 'Observation']);
  const scoreRaw = pickField(raw, ['Evidence Score', 'Setup Strength', 'Score']);
  const assumptions = pickField(raw, ['Assumptions / Unknown', 'Assumptions', 'Unknown']);
  const alternative = pickField(raw, [
    'Alternative Scenario',
    'Alternative',
    'What If Primary Fails',
  ]);
  const nextAction = pickField(raw, [
    'Next Action',
    'Watch This',
    'WATCH THIS',
    'One Thing',
    'What To Watch',
  ]);
  const why = pickWhy(raw);

  const hits = [biasRaw, statusRaw, entry, stopLoss, target, invalidation, setup].filter(Boolean).length;
  if (hits < 3) return null;

  return {
    bias: normalizeBias(biasRaw || statusRaw),
    status: normalizeStatus(statusRaw || biasRaw),
    setup,
    keyObservation,
    entry,
    stopLoss,
    target,
    invalidation,
    nextAction,
    evidenceScore: pickScore(scoreRaw),
    why,
    assumptions: alternative
      ? assumptions
        ? `${assumptions} · Alt: ${alternative}`
        : `Alt: ${alternative}`
      : assumptions,
    alternative,
    raw,
  };
}

export function wolfBiasLabel(bias: WolfSetupBias): string {
  switch (bias) {
    case 'LONG':
      return 'LONG SETUP';
    case 'SHORT':
      return 'SHORT SETUP';
    case 'WAIT':
      return 'WAITING';
    case 'NO_TRADE':
      return 'NO TRADE';
    default:
      return 'SETUP';
  }
}

export function wolfStatusTone(
  status: WolfSetupStatus,
  bias: WolfSetupBias,
): 'long' | 'short' | 'wait' | 'none' {
  if (status === 'NO_TRADE' || bias === 'NO_TRADE') return 'none';
  if (status === 'WAITING' || status === 'DEVELOPING' || bias === 'WAIT') return 'wait';
  if (bias === 'SHORT' || status === 'INVALIDATED') return 'short';
  if (bias === 'LONG') return 'long';
  return 'wait';
}
