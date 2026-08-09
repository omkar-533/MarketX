import type { ChartLevel, ChartShape } from './chartAnnotations';
import type { WolfSetupAnalysis, WolfSetupBias, WolfSetupStatus } from './parseWolfSetupReply';

export type WolfExperienceMode = 'copilot' | 'quick' | 'pro' | 'teach';

export type VisualStoryStepType =
  | 'overview'
  | 'liquidity'
  | 'sweep'
  | 'structure'
  | 'confirmation'
  | 'entry'
  | 'invalidation'
  | 'target'
  | 'bull'
  | 'bear'
  | 'status';

export type VisualStoryStep = {
  id: string;
  type: VisualStoryStepType;
  title: string;
  subtitle: string;
  /** Focus label for chart overlay highlight */
  highlight?: string | null;
  /** Short on-screen line (max ~6 words ideal) */
  caption: string;
};

export type WolfEvidenceBars = {
  structure: number;
  liquidity: number;
  momentum: number;
  confirmation: number;
};

export type WolfBullBearCase = {
  label: string;
  points: string[];
  score: number;
};

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function guessBars(analysis: WolfSetupAnalysis): WolfEvidenceBars {
  const base = analysis.evidenceScore ?? 55;
  const text = `${analysis.setup} ${analysis.keyObservation} ${analysis.why.join(' ')}`.toLowerCase();
  const hasLiq = /liquid|sweep|bsl|ssl|equal/.test(text);
  const hasStruct = /structure|bos|choch|hh|hl|lh|ll|mss/.test(text);
  const hasMom = /displac|impuls|momentum|expans/.test(text);
  const waiting = analysis.status === 'WAITING' || analysis.status === 'DEVELOPING' || analysis.bias === 'WAIT';
  return {
    structure: clampScore(base + (hasStruct ? 8 : -6)),
    liquidity: clampScore(base + (hasLiq ? 12 : -8)),
    momentum: clampScore(base + (hasMom ? 6 : -4) - (waiting ? 10 : 0)),
    confirmation: clampScore(waiting ? base * 0.45 : base * 0.85),
  };
}

function firstLabel(shapes: ChartShape[], levels: ChartLevel[], re: RegExp): string | null {
  for (const s of shapes) {
    if (s.label && re.test(s.label)) return s.label;
  }
  for (const l of levels) {
    if (l.label && re.test(l.label)) return l.label;
    if (re.test(l.kind)) return l.label || l.kind;
  }
  return null;
}

/** Build cinematic story frames from structured analysis + optional chart marks. */
export function buildVisualStory(
  analysis: WolfSetupAnalysis,
  opts?: { levels?: ChartLevel[]; shapes?: ChartShape[] },
): VisualStoryStep[] {
  const levels = opts?.levels || [];
  const shapes = opts?.shapes || [];
  const steps: VisualStoryStep[] = [];

  steps.push({
    id: 'overview',
    type: 'overview',
    title: 'Market Context',
    subtitle: analysis.setup || 'Chart overview',
    caption: 'Full chart',
    highlight: null,
  });

  const liq = firstLabel(shapes, levels, /liquid|bsl|ssl|pdh|pdl|pool/i);
  if (liq || /liquid|sweep/i.test(`${analysis.setup} ${analysis.keyObservation}`)) {
    steps.push({
      id: 'liquidity',
      type: 'liquidity',
      title: 'Liquidity Found',
      subtitle: liq || analysis.keyObservation || 'Key liquidity area',
      caption: '💧 Liquidity',
      highlight: liq,
    });
  }

  if (/sweep/i.test(`${analysis.setup} ${analysis.keyObservation} ${analysis.why.join(' ')}`)) {
    steps.push({
      id: 'sweep',
      type: 'sweep',
      title: 'Sweep Detected',
      subtitle: analysis.why[0] || 'Price interacted with liquidity',
      caption: '⚡ Sweep',
      highlight: liq,
    });
  }

  if (/structure|bos|choch|hh|hl/i.test(`${analysis.setup} ${analysis.why.join(' ')}`)) {
    steps.push({
      id: 'structure',
      type: 'structure',
      title: 'Structure Evidence',
      subtitle: analysis.why.find((w) => /structure|bos|choch|hh|hl/i.test(w)) || 'Structure context',
      caption: '🧠 Structure',
      highlight: firstLabel(shapes, levels, /bos|choch|hh|hl|lh|ll/i),
    });
  }

  const waiting =
    analysis.status === 'WAITING' ||
    analysis.status === 'DEVELOPING' ||
    analysis.bias === 'WAIT' ||
    /confirm|wait/i.test(analysis.entry);

  steps.push({
    id: 'confirmation',
    type: 'confirmation',
    title: waiting ? 'Confirmation Pending' : 'Confirmation Found',
    subtitle: analysis.entry || analysis.keyObservation,
    caption: waiting ? '🟡 Waiting' : '🟢 Confirmed',
    highlight: firstLabel(shapes, levels, /entry|confirm|zone/i),
  });

  if (analysis.entry) {
    steps.push({
      id: 'entry',
      type: 'entry',
      title: 'Entry Zone',
      subtitle: analysis.entry,
      caption: '📍 Entry',
      highlight: firstLabel(shapes, levels, /entry/i) || 'ENTRY ZONE',
    });
  }

  if (analysis.invalidation || analysis.stopLoss) {
    steps.push({
      id: 'invalidation',
      type: 'invalidation',
      title: 'Invalidation',
      subtitle: analysis.invalidation || analysis.stopLoss,
      caption: '🛑 Invalidation',
      highlight: firstLabel(shapes, levels, /invalid|sl|stop/i),
    });
  }

  if (analysis.target) {
    steps.push({
      id: 'target',
      type: 'target',
      title: 'Target Path',
      subtitle: analysis.target,
      caption: '🎯 Target',
      highlight: firstLabel(shapes, levels, /target|resist|liquid/i),
    });
  }

  const bias: WolfSetupBias = analysis.bias;
  if (bias === 'LONG' || bias === 'SHORT' || bias === 'WAIT') {
    steps.push({
      id: 'bull',
      type: 'bull',
      title: 'Bull Case',
      subtitle: bias === 'LONG' ? 'Primary path for now' : 'Alternate if level holds / reclaim',
      caption: '🟢 Bull case',
      highlight: null,
    });
    steps.push({
      id: 'bear',
      type: 'bear',
      title: 'Bear Case',
      subtitle: bias === 'SHORT' ? 'Primary path for now' : 'Alternate if level breaks',
      caption: '🔴 Bear case',
      highlight: null,
    });
  }

  steps.push({
    id: 'status',
    type: 'status',
    title: statusTitle(analysis.status, analysis.bias),
    subtitle: analysis.setup || analysis.keyObservation,
    caption: 'Final state',
    highlight: null,
  });

  return steps;
}

function statusTitle(status: WolfSetupStatus, bias: WolfSetupBias): string {
  if (status === 'NO_TRADE' || bias === 'NO_TRADE') return 'Wolf Wait — No Trade';
  if (status === 'INVALIDATED') return 'Setup Invalidated';
  if (status === 'CONFIRMED') {
    if (bias === 'LONG') return 'Long Setup Confirmed';
    if (bias === 'SHORT') return 'Short Setup Confirmed';
  }
  if (bias === 'LONG') return 'Long Setup Developing';
  if (bias === 'SHORT') return 'Short Setup Developing';
  return 'Waiting for Confirmation';
}

export function buildEvidenceBars(analysis: WolfSetupAnalysis): WolfEvidenceBars {
  return guessBars(analysis);
}

export function buildBullBearCases(analysis: WolfSetupAnalysis): {
  bull: WolfBullBearCase;
  bear: WolfBullBearCase;
  current: string;
} {
  const bars = guessBars(analysis);
  const bullPts = analysis.why.filter((w) => !/bear|short|reject|fail/i.test(w)).slice(0, 3);
  const bearPts = analysis.why.filter((w) => /bear|short|reject|fail|break/i.test(w)).slice(0, 3);
  while (bullPts.length < 2) bullPts.push(analysis.entry || 'Needs confirmation');
  while (bearPts.length < 2) bearPts.push(analysis.invalidation || 'Break of key level');

  const bullScore =
    analysis.bias === 'LONG' ? clampScore((analysis.evidenceScore ?? 60) + 8) : clampScore(bars.confirmation + 10);
  const bearScore =
    analysis.bias === 'SHORT' ? clampScore((analysis.evidenceScore ?? 60) + 8) : clampScore(100 - bullScore + 8);

  let current = 'Bias balanced — wait for confirmation.';
  if (analysis.bias === 'LONG') current = 'Current bias bullish — confirmation pending if marked WAIT.';
  if (analysis.bias === 'SHORT') current = 'Current bias bearish — confirmation pending if marked WAIT.';
  if (analysis.bias === 'WAIT' || analysis.status === 'WAITING') current = 'No forced trade — confirmation still pending.';
  if (analysis.bias === 'NO_TRADE') current = 'No trade — stand aside.';

  return {
    bull: { label: 'BULL CASE', points: bullPts.slice(0, 3), score: bullScore },
    bear: { label: 'BEAR CASE', points: bearPts.slice(0, 3), score: Math.min(100, bearScore) },
    current,
  };
}

const MODE_KEY = 'wolf_ai_experience_mode';

export function loadWolfExperienceMode(): WolfExperienceMode {
  if (typeof window === 'undefined') return 'copilot';
  const v = window.localStorage.getItem(MODE_KEY);
  if (v === 'quick' || v === 'teach' || v === 'pro' || v === 'copilot') return v;
  return 'copilot';
}

export function saveWolfExperienceMode(mode: WolfExperienceMode): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(MODE_KEY, mode);
}
