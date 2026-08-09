/**
 * Multi-lens consensus / conflict engine — compare 2–5 analyses of the SAME chart.
 */

import type { WolfAnalysisMode } from '../constants/wolfAnalysisModes';
import { wolfAnalysisModeLabel } from '../constants/wolfAnalysisModes';
import type { WolfSetupAnalysis, WolfSetupBias } from './parseWolfSetupReply';

export type AnalysisLayer = {
  id: string;
  mode: WolfAnalysisMode;
  label: string;
  text: string;
  analysis: WolfSetupAnalysis | null;
  evidenceIds: string[];
  createdAt: number;
  visible: boolean;
};

export type LensCompareRow = {
  mode: WolfAnalysisMode;
  label: string;
  bias: WolfSetupBias;
  status: string;
  story: string;
  entry: string;
  invalidation: string;
  next: string;
  score: number | null;
};

export type ConsensusReport = {
  rows: LensCompareRow[];
  biasConsensus: string;
  entryConsensus: string;
  conflicts: string[];
  verdict: string;
  agreementBias: { agree: number; total: number; bias: WolfSetupBias | 'MIXED' };
};

function normBias(b: WolfSetupBias | undefined): WolfSetupBias {
  if (b === 'LONG' || b === 'SHORT' || b === 'WAIT' || b === 'NO_TRADE') return b;
  return 'UNKNOWN';
}

function storyOf(a: WolfSetupAnalysis | null): string {
  if (!a) return '—';
  return (a.keyObservation || a.setup || a.nextAction || '—').slice(0, 42);
}

export function buildConsensusReport(layers: AnalysisLayer[]): ConsensusReport | null {
  const active = layers.filter((l) => l.analysis);
  if (active.length < 2) return null;

  const rows: LensCompareRow[] = active.map((l) => ({
    mode: l.mode,
    label: wolfAnalysisModeLabel(l.mode),
    bias: normBias(l.analysis?.bias),
    status: l.analysis?.status || 'UNKNOWN',
    story: storyOf(l.analysis),
    entry: (l.analysis?.entry || '—').slice(0, 40),
    invalidation: (l.analysis?.invalidation || '—').slice(0, 36),
    next: (l.analysis?.nextAction || '—').slice(0, 32),
    score: l.analysis?.evidenceScore ?? null,
  }));

  const biasCounts = new Map<WolfSetupBias, number>();
  for (const r of rows) {
    biasCounts.set(r.bias, (biasCounts.get(r.bias) || 0) + 1);
  }
  let topBias: WolfSetupBias | 'MIXED' = 'UNKNOWN';
  let topN = 0;
  for (const [b, n] of biasCounts) {
    if (n > topN) {
      topBias = b;
      topN = n;
    }
  }

  const agreementBias: ConsensusReport['agreementBias'] = {
    agree: topN,
    total: rows.length,
    bias:
      topN === rows.length
        ? topBias
        : topN >= Math.ceil(rows.length / 2)
          ? topBias
          : 'MIXED',
  };

  const entryKeys = rows.map((r) =>
    r.entry
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .join(' '),
  );
  const entryAgree = entryKeys.filter((k) => k && k === entryKeys[0]).length;
  const entryConsensus =
    entryAgree === rows.length
      ? `${rows.length}/${rows.length} lenses share a similar entry condition.`
      : `Only ${entryAgree}/${rows.length} share a similar entry condition — confirmation rules differ.`;

  const biasConsensus =
    agreementBias.bias === 'MIXED'
      ? `Lenses disagree on direction (${[...biasCounts.entries()]
          .map(([b, n]) => `${n}× ${b}`)
          .join(', ')}).`
      : `${topN}/${rows.length} lenses agree on ${topBias} bias.`;

  const conflicts: string[] = [];
  if (agreementBias.bias === 'MIXED' || topN < rows.length) {
    conflicts.push('Directional bias is not unanimous across lenses.');
  }
  if (entryAgree < rows.length) {
    const waitLike = rows.filter((r) => /wait|retest|confirm/i.test(r.entry + r.next));
    const chaseLike = rows.filter((r) => /breakout|market|now|accept/i.test(r.entry + r.next));
    if (waitLike.length && chaseLike.length) {
      conflicts.push(
        `${waitLike.map((r) => r.label).join('/')} prefer wait/retest while ${chaseLike
          .map((r) => r.label)
          .join('/')} accept earlier confirmation.`,
      );
    } else {
      conflicts.push('Entry conditions diverge — use the stricter confirmation.');
    }
  }
  const scores = rows.map((r) => r.score).filter((n): n is number => n != null);
  if (scores.length >= 2) {
    const spread = Math.max(...scores) - Math.min(...scores);
    if (spread >= 25) conflicts.push(`Evidence-quality spread is wide (${spread} pts) — not win probability.`);
  }

  let verdict = 'WAIT — prefer confirmation over rush.';
  if (agreementBias.bias === 'LONG' || agreementBias.bias === 'SHORT') {
    if (entryAgree >= Math.ceil(rows.length * 0.6)) {
      verdict = `${agreementBias.bias} confluence is meaningful; still require the shared confirmation before acting.`;
    } else {
      verdict = `${topN}/${rows.length} lean ${topBias}, but entry rules conflict — retest / confirmation is the cleaner risk-defined path.`;
    }
  } else if (agreementBias.bias === 'WAIT' || agreementBias.bias === 'NO_TRADE') {
    verdict = 'Consensus prefers WAIT / NO TRADE — do not force a setup.';
  } else {
    verdict = 'No clean consensus — reduce size or stay flat until structure clarifies.';
  }

  return {
    rows,
    biasConsensus,
    entryConsensus,
    conflicts: conflicts.slice(0, 3),
    verdict,
    agreementBias,
  };
}

export function makeLayerId(mode: WolfAnalysisMode): string {
  return `${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
