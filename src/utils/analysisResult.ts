/**
 * Single source of truth for a Wolf chart analysis.
 * UI must render from this object — never invent analysis locally.
 */

import type { WolfAnalysisMode } from '../constants/wolfAnalysisModes';
import type { ChartLevel, ChartShape } from './chartAnnotations';
import { parseWolfSetupReply, type WolfSetupAnalysis } from './parseWolfSetupReply';
import type { WolfEvidenceItem } from './wolfEvidence';
import type { ChartIdentity } from './chartIdentity';

export type AnnotationImportance = 'CRITICAL' | 'IMPORTANT' | 'SECONDARY';

export type AnalysisAnnotation = {
  id: string;
  type: string;
  label: string;
  geometry: {
    type: 'POINT' | 'LINE' | 'RECTANGLE' | 'ZONE' | 'POLYGON' | 'ARROW' | 'TEXT';
    x: number;
    y: number;
    width?: number;
    height?: number;
    x2?: number;
    y2?: number;
  };
  confidence: number;
  importance: AnnotationImportance;
  lens: string;
  evidence: string[];
  /** Links statement ↔ chart */
  linkedText?: string;
};

export type AnalysisResult = {
  chart: {
    symbol: string;
    timeframe: string;
    assetType: string;
    confidence: number;
  };
  lens: WolfAnalysisMode | string;
  marketState: {
    bias: string;
    phase: string;
    structure: string;
  };
  story: string;
  evidence: WolfEvidenceItem[];
  annotations: AnalysisAnnotation[];
  setups: { name: string; status: string }[];
  entryPlan: { condition: string; model: string };
  invalidation: { logic: string };
  targets: { logic: string }[];
  alternativeScenario: { text: string };
  nextAction: string;
  levels: ChartLevel[];
  shapes: ChartShape[];
  rawTemplateText: string;
  warnings: string[];
};

function confToNum(c: WolfEvidenceItem['confidence']): number {
  if (c === 'high') return 0.9;
  if (c === 'low') return 0.4;
  return 0.65;
}

function importanceOf(item: WolfEvidenceItem): AnnotationImportance {
  if (['entry', 'invalidation', 'bos', 'choch', 'sweep', 'liquidity', 'target'].includes(item.type)) {
    if (item.confidence !== 'low') return 'CRITICAL';
  }
  if (item.importance === 'high' || item.confidence === 'high') return 'IMPORTANT';
  if (item.importance === 'low' || item.confidence === 'low') return 'SECONDARY';
  return 'IMPORTANT';
}

/** Convert validated evidence → renderable annotations (normalized 0–1). */
export function evidenceToAnnotations(
  items: WolfEvidenceItem[],
  lens: string,
): AnalysisAnnotation[] {
  return (items || []).map((item) => ({
    id: item.id,
    type: item.type.toUpperCase(),
    label: item.title,
    geometry: {
      type: 'RECTANGLE' as const,
      x: item.bbox.x,
      y: item.bbox.y,
      width: item.bbox.width,
      height: item.bbox.height,
    },
    confidence: confToNum(item.confidence),
    importance: importanceOf(item),
    lens: item.sourceLens || lens,
    evidence: [item.description].filter(Boolean),
    linkedText: item.title,
  }));
}

export function buildAnalysisResult(input: {
  text: string;
  lens: WolfAnalysisMode | string;
  evidence: WolfEvidenceItem[];
  levels?: ChartLevel[];
  shapes?: ChartShape[];
  identity?: ChartIdentity | null;
  warnings?: string[];
}): AnalysisResult {
  const setup: WolfSetupAnalysis | null = parseWolfSetupReply(input.text);
  const annotations = evidenceToAnnotations(input.evidence, String(input.lens));
  const identity = input.identity;

  return {
    chart: {
      symbol: identity?.symbol || 'UNCONFIRMED',
      timeframe: identity?.timeframe || 'UNCONFIRMED',
      assetType: identity?.assetClass || 'UNKNOWN',
      confidence: identity?.confidence != null ? Math.min(1, Math.max(0, identity.confidence / 100)) : 0.4,
    },
    lens: input.lens,
    marketState: {
      bias: setup?.bias || 'WAIT',
      phase: setup?.status || 'DEVELOPING',
      structure: setup?.setup || '',
    },
    story: setup?.keyObservation || '',
    evidence: input.evidence,
    annotations,
    setups: setup
      ? [{ name: setup.setup, status: setup.status }]
      : [],
    entryPlan: {
      condition: setup?.entry || '',
      model: setup?.setup || '',
    },
    invalidation: { logic: setup?.invalidation || setup?.stopLoss || '' },
    targets: setup?.target ? [{ logic: setup.target }] : [],
    alternativeScenario: { text: setup?.alternative || '' },
    nextAction: setup?.nextAction || '',
    levels: input.levels || [],
    shapes: input.shapes || [],
    rawTemplateText: input.text,
    warnings: input.warnings || [],
  };
}
