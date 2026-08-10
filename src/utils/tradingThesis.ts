/**
 * Trader-First Trading Thesis — answers the 7 questions every analysis must cover.
 * UI renders from this object; never invent prices locally.
 */

import type { ChartLevel, ChartShape } from './chartAnnotations';
import type { WolfEvidenceItem } from './wolfEvidence';
import type { WolfSetupAnalysis, WolfSetupBias } from './parseWolfSetupReply';
import { parseWolfSetupReply } from './parseWolfSetupReply';

export type ThesisStatus = 'WAIT' | 'LONG' | 'SHORT' | 'NO_TRADE';

export type KeyLevelType =
  | 'RESISTANCE'
  | 'SUPPORT'
  | 'DECISION'
  | 'ENTRY'
  | 'INVALIDATION'
  | 'TARGET'
  | 'LIQUIDITY'
  | 'STRUCTURE';

export type ThesisKeyLevel = {
  id: string;
  /** Exact price string or approximate range like "63800–64300" or "Not enough evidence." */
  price: string;
  type: KeyLevelType;
  label: string;
  reason: string;
  confidence: number;
  annotationId: string;
  /** Normalized focus bbox when known */
  bbox?: { x: number; y: number; width: number; height: number };
  /** Panel display: "R1 · 66,000 — Key resistance" */
  display: string;
  watch?: string;
  ifFails?: string;
};

export type TradingThesis = {
  status: ThesisStatus;
  bias: string;
  marketStory: string;
  currentPrice: string;
  keyLevels: ThesisKeyLevel[];
  setup: { name: string; quality: string };
  entryPlan: { trigger: string; zone: string; clean: boolean };
  invalidation: { logic: string };
  targets: { label: string; price: string; annotationId?: string }[];
  alternativeScenario: { text: string };
  waitFor: string;
  nextAction: string;
  noCleanSetup: boolean;
  evidence: WolfEvidenceItem[];
  answers: {
    marketDoing: string;
    bias: string;
    importantLevels: string;
    setupDeveloping: string;
    entryTrigger: string;
    invalidates: string;
    targets: string;
  };
};

const NE = 'Not enough evidence.';

function thesisStatus(bias: WolfSetupBias, setupStatus: string): ThesisStatus {
  if (bias === 'NO_TRADE' || /NO_TRADE|NO TRADE/i.test(setupStatus)) return 'NO_TRADE';
  if (bias === 'LONG') return 'LONG';
  if (bias === 'SHORT') return 'SHORT';
  return 'WAIT';
}

function orNE(v: string): string {
  const t = String(v || '').trim();
  if (!t || /^unclear|n\/a|none|unknown$/i.test(t)) return NE;
  return t;
}

/** Parse "Key Levels:" block from model text. */
export function parseKeyLevelsBlock(text: string): ThesisKeyLevel[] {
  const raw = String(text || '');
  const block = raw.match(
    /(?:^|\n)\s*\*{0,2}Key\s*Levels?\*{0,2}\s*[:：]?\s*([\s\S]*?)(?=\n\s*\*{0,2}(?:Setup|WAIT|Wait for|Entry|Invalid|Target|Next|Why|Alternative)|$)/i,
  );
  const body = block?.[1] || '';
  const lines = body
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length > 3);

  const out: ThesisKeyLevel[] = [];
  for (const line of lines.slice(0, 8)) {
    // R1 · 66,000 — Key resistance | 🔴 66,000 — Decision level
    const m = line.match(
      /^(?:[🔴🟢🎯⚠💧]+)?\s*([A-Z]{0,3}\d?)?\s*[·\-–:]?\s*([\d,.\-~–]+(?:\s*[–\-]\s*[\d,.]+)?)\s*[—\-–:]?\s*(.+)?$/i,
    );
    if (!m) continue;
    const idHint = (m[1] || '').toUpperCase() || `L${out.length + 1}`;
    const price = m[2].replace(/\s+/g, '');
    const rest = (m[3] || '').trim();
    const type = inferLevelType(idHint, rest);
    const label = rest || typeLabel(type);
    const id = idHint.match(/[A-Z]+\d?/) ? idHint : `${type.slice(0, 1)}${out.length + 1}`;
    const annotationId = `ann_${id}`;
    out.push({
      id,
      price,
      type,
      label,
      reason: label,
      confidence: 0.75,
      annotationId,
      display: formatLevelDisplay(id, price, label),
      watch: undefined,
      ifFails: undefined,
    });
  }
  return out;
}

function inferLevelType(id: string, label: string): KeyLevelType {
  const t = `${id} ${label}`.toUpperCase();
  if (/INVALID|SL\b|STOP/.test(t)) return 'INVALIDATION';
  if (/ENTRY|POI|ZONE/.test(t)) return 'ENTRY';
  if (/TARGET|T\d|TP/.test(t)) return 'TARGET';
  if (/DECISION|R\d|RESIST/.test(t) || /^R\d/.test(id)) return /DECISION/.test(t) ? 'DECISION' : 'RESISTANCE';
  if (/S\d|SUPPORT/.test(t) || /^S\d/.test(id)) return 'SUPPORT';
  if (/LIQ/.test(t)) return 'LIQUIDITY';
  if (/STRUCT|BOS|CHOCH/.test(t)) return 'STRUCTURE';
  if (/RESIST/.test(t)) return 'RESISTANCE';
  if (/SUPPORT/.test(t)) return 'SUPPORT';
  return 'DECISION';
}

function typeLabel(type: KeyLevelType): string {
  switch (type) {
    case 'RESISTANCE':
      return 'Key resistance';
    case 'SUPPORT':
      return 'Key support';
    case 'DECISION':
      return 'Decision level';
    case 'ENTRY':
      return 'Entry zone';
    case 'INVALIDATION':
      return 'Invalidation';
    case 'TARGET':
      return 'Target';
    case 'LIQUIDITY':
      return 'Liquidity';
    default:
      return 'Structure';
  }
}

export function formatLevelDisplay(id: string, price: string, label: string): string {
  const p = price.includes('–') || price.includes('-') ? price : price.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${id} · ${p} — ${label}`;
}

function emojiFor(type: KeyLevelType): string {
  switch (type) {
    case 'RESISTANCE':
    case 'DECISION':
      return '🔴';
    case 'SUPPORT':
    case 'ENTRY':
      return '🟢';
    case 'TARGET':
      return '🎯';
    case 'INVALIDATION':
      return '⚠';
    case 'LIQUIDITY':
      return '💧';
    default:
      return '◆';
  }
}

function levelsFromChartMarks(
  levels: ChartLevel[],
  shapes: ChartShape[],
  evidence: WolfEvidenceItem[],
): ThesisKeyLevel[] {
  const out: ThesisKeyLevel[] = [];
  let ri = 1;
  let si = 1;
  let ti = 1;

  for (const l of levels.slice(0, 6)) {
    const isRes = l.kind === 'resistance';
    const id = isRes ? `R${ri++}` : `S${si++}`;
    const type: KeyLevelType = isRes ? 'RESISTANCE' : 'SUPPORT';
    const price = String(l.price);
    const label = l.label || typeLabel(type);
    out.push({
      id,
      price,
      type,
      label,
      reason: label,
      confidence: 0.8,
      annotationId: `ann_${id}`,
      display: formatLevelDisplay(id, price, label),
    });
  }

  for (const s of shapes) {
    if (s.type === 'zone' && s.p1 != null && s.p2 != null && out.length < 7) {
      const lo = Math.min(s.p1, s.p2);
      const hi = Math.max(s.p1, s.p2);
      const price = `${lo}–${hi}`;
      const isEntry = /entry|demand|supply|poi/i.test(s.label || '');
      const id = isEntry ? `E${out.filter((x) => x.type === 'ENTRY').length + 1}` : `Z${out.length + 1}`;
      const type: KeyLevelType = isEntry ? 'ENTRY' : /target/i.test(s.label || '') ? 'TARGET' : 'STRUCTURE';
      out.push({
        id,
        price,
        type,
        label: s.label || typeLabel(type),
        reason: s.label || typeLabel(type),
        confidence: 0.7,
        annotationId: `ann_${id}`,
        display: formatLevelDisplay(id, price, s.label || typeLabel(type)),
      });
    }
    if ((s.type === 'hline' || s.type === 'hray') && s.p1 != null && out.length < 7) {
      if (out.some((x) => x.price === String(s.p1))) continue;
      const id = `L${out.length + 1}`;
      out.push({
        id,
        price: String(s.p1),
        type: /invalid|stop/i.test(s.label || '') ? 'INVALIDATION' : 'DECISION',
        label: s.label || 'Level',
        reason: s.label || 'Visible chart level',
        confidence: 0.7,
        annotationId: `ann_${id}`,
        display: formatLevelDisplay(id, String(s.p1), s.label || 'Level'),
      });
    }
  }

  for (const e of evidence) {
    if (out.length >= 7) break;
    if (!['support', 'resistance', 'entry', 'invalidation', 'target', 'liquidity'].includes(e.type)) {
      continue;
    }
    const typeMap: Record<string, KeyLevelType> = {
      support: 'SUPPORT',
      resistance: 'RESISTANCE',
      entry: 'ENTRY',
      invalidation: 'INVALIDATION',
      target: 'TARGET',
      liquidity: 'LIQUIDITY',
    };
    const type = typeMap[e.type] || 'STRUCTURE';
    let id =
      type === 'TARGET'
        ? `T${ti++}`
        : type === 'RESISTANCE'
          ? `R${ri++}`
          : type === 'SUPPORT'
            ? `S${si++}`
            : type === 'ENTRY'
              ? `E1`
              : type === 'INVALIDATION'
                ? 'INV'
                : `LQ${out.length + 1}`;
    if (out.some((x) => x.id === id)) id = `${id}_${out.length}`;
    const priceMatch = e.title.match(/([\d,]{3,}(?:\s*[–\-]\s*[\d,]+)?)/);
    const price = priceMatch?.[1]?.replace(/\s/g, '') || 'approx';
    const label = e.title.replace(priceMatch?.[0] || '', '').replace(/^[·\-–:\s]+/, '').trim() || typeLabel(type);
    out.push({
      id,
      price,
      type,
      label,
      reason: e.description || label,
      confidence: e.confidence === 'high' ? 0.9 : e.confidence === 'low' ? 0.45 : 0.7,
      annotationId: e.id,
      bbox: e.bbox,
      display: formatLevelDisplay(id, price === 'approx' ? '~' : price, label),
      watch: e.description,
    });
  }

  return out.slice(0, 7);
}

/** Enrich evidence titles to "WHAT · WHERE — WHY" style when missing structure. */
export function explainableEvidenceLabel(item: WolfEvidenceItem): string {
  const title = item.title.trim();
  if (/·|—|–/.test(title) && title.length > 8) return title;
  const typeTag =
    item.type === 'target'
      ? 'T'
      : item.type === 'entry'
        ? 'ENTRY'
        : item.type === 'invalidation'
          ? 'INVALID'
          : item.type === 'resistance'
            ? 'R'
            : item.type === 'support'
              ? 'S'
              : item.type === 'liquidity' || item.type === 'sweep'
                ? 'LIQ'
                : item.type.toUpperCase().slice(0, 4);
  const why = (item.description || '').split(/[.!]/)[0]?.trim().slice(0, 42);
  return why ? `${typeTag} · ${title} — ${why}` : `${typeTag} · ${title}`;
}

export function buildTradingThesis(input: {
  text: string;
  evidence?: WolfEvidenceItem[];
  levels?: ChartLevel[];
  shapes?: ChartShape[];
  analysis?: WolfSetupAnalysis | null;
}): TradingThesis {
  const analysis = input.analysis ?? parseWolfSetupReply(input.text);
  const evidence = input.evidence || [];
  const parsedLevels = parseKeyLevelsBlock(input.text);
  const fromMarks = levelsFromChartMarks(input.levels || [], input.shapes || [], evidence);
  // Prefer explicit Key Levels block; fill gaps from marks
  const keyLevels =
    parsedLevels.length >= 2
      ? parsedLevels.map((l) => {
          const match = evidence.find(
            (e) =>
              e.id === l.annotationId ||
              e.title.includes(l.price) ||
              (l.type === 'ENTRY' && e.type === 'entry') ||
              (l.type === 'INVALIDATION' && e.type === 'invalidation') ||
              (l.type === 'TARGET' && e.type === 'target'),
          );
          return match?.bbox ? { ...l, bbox: match.bbox, annotationId: match.id } : l;
        })
      : fromMarks;

  // Attach explanation defaults
  const richLevels = keyLevels.map((l) => ({
    ...l,
    reason: l.reason || l.label,
    watch:
      l.watch ||
      (l.type === 'DECISION' || l.type === 'RESISTANCE'
        ? 'Sustained close beyond this level changes the thesis.'
        : l.type === 'ENTRY'
          ? 'Wait for trigger confirmation into this zone.'
          : l.type === 'INVALIDATION'
            ? 'Thesis dies if this level fails.'
            : l.type === 'TARGET'
              ? 'Next structural / liquidity objective.'
              : 'Watch reaction quality here.'),
    ifFails:
      l.ifFails ||
      (l.type === 'RESISTANCE' || l.type === 'DECISION'
        ? 'Rejection keeps the opposing scenario active.'
        : 'Reclaim / break flips the local view.'),
  }));

  const status = analysis
    ? thesisStatus(analysis.bias, analysis.status)
    : 'WAIT';

  const entry = orNE(analysis?.entry || '');
  const invalidation = orNE(analysis?.invalidation || analysis?.stopLoss || '');
  const targetRaw = orNE(analysis?.target || '');
  const story = orNE(analysis?.keyObservation || '');
  const setupName = orNE(analysis?.setup || '');
  const nextAction = orNE(analysis?.nextAction || '');
  const alt = orNE(analysis?.alternative || '');

  const noCleanSetup =
    status === 'NO_TRADE' ||
    status === 'WAIT' ||
    entry === NE ||
    /no clean|insufficient|wait|not enough/i.test(entry);

  const targetLevels = richLevels.filter((l) => l.type === 'TARGET');
  const targets =
    targetLevels.length > 0
      ? targetLevels.map((l, i) => ({
          label: `T${i + 1}`,
          price: l.price,
          annotationId: l.annotationId,
        }))
      : targetRaw !== NE
        ? targetRaw.split(/[,;/|]/).map((t, i) => ({
            label: `T${i + 1}`,
            price: t.trim(),
          }))
        : [];

  const biasLine =
    analysis?.bias === 'LONG'
      ? `Bullish — ${story !== NE ? story : 'structure favors upside if trigger clears.'}`
      : analysis?.bias === 'SHORT'
        ? `Bearish — ${story !== NE ? story : 'structure favors downside if trigger clears.'}`
        : analysis?.bias === 'NO_TRADE'
          ? 'No trade — price location / evidence not clean.'
          : `Neutral / waiting — ${story !== NE ? story : 'between major levels.'}`;

  return {
    status,
    bias: biasLine,
    marketStory: story,
    currentPrice: NE,
    keyLevels: richLevels,
    setup: {
      name: setupName,
      quality: noCleanSetup ? 'NO CLEAN SETUP YET' : analysis?.status || 'DEVELOPING',
    },
    entryPlan: {
      trigger: entry,
      zone: richLevels.find((l) => l.type === 'ENTRY')?.display || entry,
      clean: !noCleanSetup && entry !== NE,
    },
    invalidation: { logic: invalidation },
    targets,
    alternativeScenario: { text: alt },
    waitFor: entry !== NE ? entry : nextAction,
    nextAction,
    noCleanSetup,
    evidence,
    answers: {
      marketDoing: story,
      bias: biasLine,
      importantLevels:
        richLevels.length > 0
          ? richLevels.map((l) => l.display).join(' · ')
          : NE,
      setupDeveloping: setupName,
      entryTrigger: noCleanSetup ? 'NO CLEAN SETUP YET' : entry,
      invalidates: invalidation,
      targets: targets.length ? targets.map((t) => `${t.label} ${t.price}`).join(' · ') : NE,
    },
  };
}

export function levelPanelLine(level: ThesisKeyLevel): string {
  return `${emojiFor(level.type)} ${level.display}`;
}

export type GuidedTradeStep = {
  id: string;
  title: string;
  line: string;
  levelId?: string;
  bbox?: ThesisKeyLevel['bbox'];
  annotationId?: string;
};

/** 6-step Guided Trade walkthrough from thesis. */
export function buildGuidedTradeSteps(thesis: TradingThesis, hindi?: boolean): GuidedTradeStep[] {
  const decision =
    thesis.keyLevels.find((l) => l.type === 'DECISION' || l.type === 'RESISTANCE') ||
    thesis.keyLevels[0];
  const entry = thesis.keyLevels.find((l) => l.type === 'ENTRY');
  const inv = thesis.keyLevels.find((l) => l.type === 'INVALIDATION');
  const tgt = thesis.keyLevels.find((l) => l.type === 'TARGET') || thesis.keyLevels.find((l) => l.type === 'SUPPORT');

  return [
    {
      id: 'context',
      title: hindi ? 'MARKET CONTEXT' : 'MARKET CONTEXT',
      line:
        thesis.marketStory !== NE
          ? thesis.marketStory
          : hindi
            ? 'Chart pe clear story abhi thin hai.'
            : 'Market story is thin on this chart.',
    },
    {
      id: 'level',
      title: 'KEY LEVEL',
      line: decision
        ? `${decision.price} is the decision point — ${decision.reason}`
        : NE,
      levelId: decision?.id,
      bbox: decision?.bbox,
      annotationId: decision?.annotationId,
    },
    {
      id: 'structure',
      title: 'STRUCTURE',
      line:
        thesis.setup.name !== NE
          ? `Setup: ${thesis.setup.name}`
          : NE,
    },
    {
      id: 'entry',
      title: 'ENTRY TRIGGER',
      line: thesis.noCleanSetup
        ? 'NO CLEAN SETUP YET — wait for confirmation.'
        : thesis.entryPlan.trigger,
      levelId: entry?.id,
      bbox: entry?.bbox,
      annotationId: entry?.annotationId,
    },
    {
      id: 'invalid',
      title: 'INVALIDATION',
      line: thesis.invalidation.logic,
      levelId: inv?.id,
      bbox: inv?.bbox,
      annotationId: inv?.annotationId,
    },
    {
      id: 'target',
      title: 'TARGET',
      line:
        thesis.targets.length > 0
          ? thesis.targets.map((t) => `${t.label} ${t.price}`).join(' → ')
          : thesis.answers.targets,
      levelId: tgt?.id,
      bbox: tgt?.bbox,
      annotationId: tgt?.annotationId,
    },
  ];
}

export { emojiFor };
