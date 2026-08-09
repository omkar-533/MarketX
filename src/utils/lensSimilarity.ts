/**
 * Lens difference validator — identical SMC vs PA outputs are a hard warning.
 */

import type { AnalysisLayer } from './wolfConsensus';
import type { WolfSetupAnalysis } from './parseWolfSetupReply';
import type { WolfEvidenceItem } from './wolfEvidence';

export type LensSimilarityReport = {
  warning: boolean;
  code: 'LENS_SIMILARITY_WARNING' | null;
  score: number;
  reasons: string[];
};

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(' ')
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 1;
}

function evidenceSignature(items: WolfEvidenceItem[]): string {
  return items
    .map((e) => `${e.type}:${norm(e.title)}`)
    .sort()
    .join('|');
}

function analysisFingerprint(a: WolfSetupAnalysis | null, evidence: WolfEvidenceItem[]): string {
  if (!a) return evidenceSignature(evidence);
  return [
    a.bias,
    norm(a.keyObservation),
    norm(a.entry),
    norm(a.invalidation || a.stopLoss),
    norm(a.target),
    norm(a.nextAction),
    evidenceSignature(evidence),
  ].join('::');
}

/** Compare current analysis against other saved layers of different lenses. */
export function validateLensDifference(opts: {
  currentMode: string;
  currentAnalysis: WolfSetupAnalysis | null;
  currentEvidence: WolfEvidenceItem[];
  layers: AnalysisLayer[];
}): LensSimilarityReport {
  const reasons: string[] = [];
  const others = (opts.layers || []).filter((l) => l.mode !== opts.currentMode && l.analysis);
  if (!others.length) {
    return { warning: false, code: null, score: 0, reasons: [] };
  }

  const curFp = analysisFingerprint(opts.currentAnalysis, opts.currentEvidence);
  const curStory = tokenSet(opts.currentAnalysis?.keyObservation || '');
  const curWhy = tokenSet((opts.currentAnalysis?.why || []).join(' '));
  const curEntry = tokenSet(opts.currentAnalysis?.entry || '');
  const curTypes = new Set(opts.currentEvidence.map((e) => e.type));

  let maxScore = 0;
  for (const layer of others) {
    const otherTypes = new Set(layer.evidenceTypes || []);
    const storyJ = jaccard(curStory, tokenSet(layer.analysis?.keyObservation || ''));
    const whyJ = jaccard(curWhy, tokenSet((layer.analysis?.why || []).join(' ')));
    const entryJ = jaccard(curEntry, tokenSet(layer.analysis?.entry || ''));
    const typeJ =
      curTypes.size || otherTypes.size
        ? jaccard(curTypes as Set<string>, otherTypes as Set<string>)
        : 0;
    const sameBias = opts.currentAnalysis?.bias === layer.analysis?.bias;
    const sameNext =
      norm(opts.currentAnalysis?.nextAction || '') === norm(layer.analysis?.nextAction || '');
    const sameInv =
      norm(opts.currentAnalysis?.invalidation || opts.currentAnalysis?.stopLoss || '') ===
      norm(layer.analysis?.invalidation || layer.analysis?.stopLoss || '');

    let score = storyJ * 0.3 + whyJ * 0.2 + entryJ * 0.25 + typeJ * 0.15;
    if (sameNext) score += 0.05;
    if (sameInv) score += 0.05;
    if (sameBias && storyJ > 0.85 && entryJ > 0.85 && typeJ > 0.8) score = Math.max(score, 0.92);
    if (curFp === analysisFingerprint(layer.analysis, [])) score = Math.max(score, 0.95);

    maxScore = Math.max(maxScore, score);
    if (score >= 0.82) {
      reasons.push(
        `${opts.currentMode.toUpperCase()} ≈ ${layer.mode.toUpperCase()} (score ${score.toFixed(2)}): story/entry/evidence nearly identical.`,
      );
    }
  }

  // Also flag if evidence types are generic-only for a specialised lens
  if (['smc', 'liquidity', 'price_action', 'mbp', 'support_resistance'].includes(opts.currentMode)) {
    const specialised = {
      smc: ['sweep', 'bos', 'choch', 'order_block', 'fvg', 'liquidity'],
      liquidity: ['liquidity', 'sweep'],
      price_action: ['breakout', 'structure', 'confirmation', 'support', 'resistance'],
      support_resistance: ['support', 'resistance'],
      mbp: ['liquidity', 'structure', 'confirmation', 'entry'],
    } as Record<string, string[]>;
    const need = specialised[opts.currentMode] || [];
    const hit = need.some((t) => curTypes.has(t as WolfEvidenceItem['type']));
    if (opts.currentEvidence.length > 0 && !hit && need.length) {
      reasons.push(
        `${opts.currentMode.toUpperCase()} evidence lacks lens-specific types (${need.join('/')}).`,
      );
      maxScore = Math.max(maxScore, 0.7);
    }
  }

  const warning = maxScore >= 0.82 || reasons.some((r) => r.includes('lacks lens-specific'));
  return {
    warning,
    code: warning ? 'LENS_SIMILARITY_WARNING' : null,
    score: maxScore,
    reasons,
  };
}
