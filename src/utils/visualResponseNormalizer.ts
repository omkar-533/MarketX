/**
 * VisualResponseNormalizer — every Hunter reply becomes a visual response object.
 * LLM prose never reaches the user as the primary UI.
 */

import { parseWolfSetupReply, type WolfSetupAnalysis } from './parseWolfSetupReply';
import {
  buildNextAction,
  crispStatusTitle,
  resolveUiStatus,
} from './wolfCopilot';
import type { ChartLevel, ChartShape } from './chartAnnotations';
import type { WolfEvidenceItem } from './wolfEvidence';
import { synthesizeEvidenceFromSetup } from './wolfEvidence';

export type WolfVisualResponseType =
  | 'VISUAL_ANALYSIS'
  | 'VISUAL_EXPLANATION'
  | 'VISUAL_PINPOINT'
  | 'VISUAL_SCENARIO'
  | 'VISUAL_COMPARISON'
  | 'VISUAL_WALKTHROUGH'
  | 'VISUAL_UPDATE'
  | 'VISUAL_CORRECTION'
  | 'VISUAL_TRADE_PLAN'
  | 'VISUAL_TEACHING'
  | 'VISUAL_FALLBACK';

export type WolfVisualResponse = {
  type: WolfVisualResponseType;
  state: { emoji: string; label: string; title: string; subtitle: string };
  insight: { headline: string; text: string };
  nextAction: { label: string; message: string; ifConfirmed?: string };
  /** Synthetic lock-template text so the desk can keep parsing entry/SL/etc. */
  templateText: string;
  evidence: WolfEvidenceItem[];
  imageUrl?: string | null;
  levels: ChartLevel[];
  shapes: ChartShape[];
  actions: string[];
  analysis: WolfSetupAnalysis | null;
};

function classifyType(userAsk: string, text: string): WolfVisualResponseType {
  const q = `${userAsk} ${text}`.toLowerCase();
  if (/what\s*changed|update|naya chart|new screenshot/i.test(q)) return 'VISUAL_UPDATE';
  if (/what\s*if|scenario|agar|holds?|breaks?/i.test(q)) return 'VISUAL_SCENARIO';
  if (/samajh|simple|simpler|explain|teach|kya hota|meaning/i.test(q)) return 'VISUAL_TEACHING';
  if (/why|kyun|kyu/i.test(q)) return 'VISUAL_EXPLANATION';
  if (/entry|trade plan|sl\b|target|invalid/i.test(q)) return 'VISUAL_TRADE_PLAN';
  if (/challenge|galat|wrong|not\s*clean|disagree|missing/i.test(q)) return 'VISUAL_CORRECTION';
  if (/point|yahan|show|pinpoint|kaha|where/i.test(q)) return 'VISUAL_PINPOINT';
  if (/vs|compare|bull|bear/i.test(q)) return 'VISUAL_COMPARISON';
  if (/replay|walk|step/i.test(q)) return 'VISUAL_WALKTHROUGH';
  if (/bias|setup|analy|wait|confirm|liquidity|sweep|bos/i.test(q)) return 'VISUAL_ANALYSIS';
  return 'VISUAL_EXPLANATION';
}

function firstInsightLine(text: string): string {
  const cleaned = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\*\*/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
    .filter((l) => l.length > 8 && !/^(market bias|setup|entry|stop|target|invalid|why|assumptions|next action|evidence)/i.test(l));
  const line = cleaned[0] || text.trim().slice(0, 90);
  const words = line.split(/\s+/).slice(0, 14);
  return words.join(' ').replace(/[.!?]+$/, '') || 'Look at the highlighted area.';
}

function headlineFrom(type: WolfVisualResponseType, analysis: WolfSetupAnalysis | null, insight: string): string {
  if (analysis) {
    const crisp = crispStatusTitle(analysis);
    return crisp.title.split('—')[0].trim().slice(0, 22) || 'WOLF';
  }
  if (type === 'VISUAL_SCENARIO') return 'WHAT IF';
  if (type === 'VISUAL_EXPLANATION') return 'WHY';
  if (type === 'VISUAL_TEACHING') return 'SIMPLE';
  if (type === 'VISUAL_TRADE_PLAN') return 'TRADE PLAN';
  if (type === 'VISUAL_CORRECTION') return 'CHALLENGE';
  if (type === 'VISUAL_UPDATE') return 'WHAT CHANGED';
  if (type === 'VISUAL_PINPOINT') return 'SHOW';
  const words = insight.split(/\s+/).slice(0, 3).join(' ').toUpperCase();
  return words || 'WOLF';
}

function buildSyntheticTemplate(opts: {
  analysis: WolfSetupAnalysis | null;
  insight: string;
  nextMsg: string;
  type: WolfVisualResponseType;
}): string {
  if (opts.analysis) {
    // Ensure Next Action line exists for the desk/parser
    if (/Next Action\s*:/i.test(opts.analysis.raw)) return opts.analysis.raw;
    return `${opts.analysis.raw}\nNext Action: ${opts.nextMsg}`;
  }
  const label =
    opts.type === 'VISUAL_SCENARIO'
      ? 'WAIT'
      : opts.type === 'VISUAL_CORRECTION'
        ? 'WAIT'
        : 'WAIT';
  return [
    'WOLF AI · FOLLOW-UP',
    `Market Bias: ${label}`,
    'Setup: Chart follow-up',
    'Setup Status: WAITING FOR CONFIRMATION',
    `Key Observation: ${opts.insight}`,
    `Next Action: ${opts.nextMsg}`,
    `Entry Condition: ${opts.insight}`,
    'Stop Loss Logic: Use chart invalidation',
    'Target Logic: Next structure / liquidity',
    'Invalidation: Thesis breaks on opposing acceptance',
    'Evidence Score: 55 / 100',
    'Why:',
    `1. ${opts.insight}`,
    'Assumptions / Unknown: Follow-up without full re-scan',
  ].join('\n');
}

export type NormalizeVisualArgs = {
  text: string;
  userAsk?: string;
  imageUrl?: string | null;
  evidence?: WolfEvidenceItem[];
  levels?: ChartLevel[];
  shapes?: ChartShape[];
  /** Carry prior session evidence when follow-up has none. */
  sessionEvidence?: WolfEvidenceItem[];
  hindi?: boolean;
};

/**
 * Mandatory gate: raw model text → visual response object.
 */
export function normalizeVisualResponse(args: NormalizeVisualArgs): WolfVisualResponse {
  const raw = String(args.text || '').trim();
  const analysis = parseWolfSetupReply(raw);
  const type = classifyType(args.userAsk || '', raw);
  const insightText = analysis?.keyObservation || firstInsightLine(raw);
  const next = analysis
    ? buildNextAction(analysis, { nextActionField: analysis.nextAction })
    : {
        title: 'WATCH THIS',
        message: args.hindi ? 'Chart pe yahi dekh.' : 'Watch this area on the chart.',
        ifConfirmed: undefined as string | undefined,
      };

  let evidence =
    (args.evidence && args.evidence.length ? args.evidence : null) ||
    (args.sessionEvidence && args.sessionEvidence.length ? args.sessionEvidence : null) ||
    [];

  if ((!evidence || evidence.length === 0) && analysis) {
    evidence = synthesizeEvidenceFromSetup({
      keyObservation: analysis.keyObservation,
      entry: analysis.entry,
      stopLoss: analysis.stopLoss,
      target: analysis.target,
      invalidation: analysis.invalidation,
      why: analysis.why,
      setup: analysis.setup,
    });
  }

  const hasVisual = Boolean(args.imageUrl);
  const ui = analysis
    ? resolveUiStatus(analysis)
    : {
        emoji: type === 'VISUAL_SCENARIO' ? '🔮' : type === 'VISUAL_CORRECTION' ? '⚠️' : '🟡',
        label: headlineFrom(type, null, insightText),
        status: 'WAIT' as const,
        headline: headlineFrom(type, null, insightText),
      };

  const crisp = analysis
    ? crispStatusTitle(analysis)
    : {
        title: `${ui.emoji} ${ui.label}`.replace(/^🟡\s*/, '').slice(0, 28) || ui.label,
        subtitle: insightText.slice(0, 48),
      };

  const templateText = buildSyntheticTemplate({
    analysis,
    insight: insightText,
    nextMsg: next.message,
    type: hasVisual ? type : 'VISUAL_FALLBACK',
  });

  // Re-parse synthetic template so desk always gets a structured analysis
  const ensuredAnalysis = analysis || parseWolfSetupReply(templateText);

  return {
    type: hasVisual ? type : 'VISUAL_FALLBACK',
    state: {
      emoji: ui.emoji,
      label: ui.label,
      title: crisp.title,
      subtitle: crisp.subtitle || insightText.slice(0, 48),
    },
    insight: {
      headline: headlineFrom(type, analysis, insightText),
      text: insightText.slice(0, 96),
    },
    nextAction: {
      label: 'WATCH THIS',
      message: next.message.slice(0, 72),
      ifConfirmed: next.ifConfirmed,
    },
    templateText,
    evidence: evidence || [],
    imageUrl: args.imageUrl,
    levels: args.levels || [],
    shapes: args.shapes || [],
    actions: ['SHOW', 'WHY', 'WHAT_IF'],
    analysis: ensuredAnalysis,
  };
}
