/**
 * WOLF Evidence — visual findings tied to the user's original chart.
 * Coordinates are normalized 0–1 relative to full image width/height.
 */

export type WolfEvidenceType =
  | 'liquidity'
  | 'sweep'
  | 'structure'
  | 'bos'
  | 'choch'
  | 'support'
  | 'resistance'
  | 'entry'
  | 'invalidation'
  | 'target'
  | 'fvg'
  | 'order_block'
  | 'breakout'
  | 'confirmation'
  | 'other';

export type WolfEvidenceConfidence = 'high' | 'medium' | 'low';

export type NormalizedBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WolfEvidenceItem = {
  id: string;
  type: WolfEvidenceType;
  title: string;
  description: string;
  bbox: NormalizedBBox;
  confidence: WolfEvidenceConfidence;
  importance?: 'high' | 'medium' | 'low';
  /** Multi-lens: which methodology produced this mark. */
  sourceLens?: string;
};

export type WolfEvidencePayload = {
  evidence: WolfEvidenceItem[];
  /** Remaining prose with fences stripped */
  text: string;
};

const FENCE_RE = /```(?:wolfevidence|evidence)\s*([\s\S]*?)```/i;
const BARE_RE = /(\{[\s\S]*"evidence"\s*:\s*\[[\s\S]*?\][\s\S]*?\})\s*$/i;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeBBox(raw: unknown): NormalizedBBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const x = Number(row.x);
  const y = Number(row.y);
  const width = Number(row.width ?? row.w);
  const height = Number(row.height ?? row.h);
  if (![x, y, width, height].every((v) => Number.isFinite(v))) return null;
  const bx = clamp01(x);
  const by = clamp01(y);
  const bw = clamp01(width);
  const bh = clamp01(height);
  if (bw < 0.02 || bh < 0.02) return null;
  return {
    x: bx,
    y: by,
    width: Math.min(bw, 1 - bx),
    height: Math.min(bh, 1 - by),
  };
}

function normalizeType(raw: unknown): WolfEvidenceType {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const map: Record<string, WolfEvidenceType> = {
    liq: 'liquidity',
    liquidity: 'liquidity',
    sweep: 'sweep',
    structure: 'structure',
    bos: 'bos',
    choch: 'choch',
    support: 'support',
    resistance: 'resistance',
    entry: 'entry',
    entry_zone: 'entry',
    invalidation: 'invalidation',
    sl: 'invalidation',
    stop: 'invalidation',
    target: 'target',
    fvg: 'fvg',
    order_block: 'order_block',
    ob: 'order_block',
    breakout: 'breakout',
    confirmation: 'confirmation',
  };
  return map[t] || 'other';
}

function normalizeConfidence(raw: unknown): WolfEvidenceConfidence {
  const t = String(raw || '').toLowerCase();
  if (/high|strong|0\.(8|9)|1(\.0)?/.test(t)) return 'high';
  if (/low|weak|0\.[0-4]/.test(t)) return 'low';
  if (typeof raw === 'number') {
    if (raw >= 0.75) return 'high';
    if (raw < 0.45) return 'low';
  }
  return 'medium';
}

function iconFor(type: WolfEvidenceType): string {
  switch (type) {
    case 'liquidity':
      return '💧';
    case 'sweep':
      return '⚡';
    case 'structure':
    case 'bos':
    case 'choch':
      return '🧠';
    case 'entry':
      return '📍';
    case 'invalidation':
      return '🛑';
    case 'target':
      return '🎯';
    case 'support':
    case 'resistance':
      return '➖';
    case 'confirmation':
      return '🟡';
    default:
      return '👁';
  }
}

export function evidenceIcon(type: WolfEvidenceType): string {
  return iconFor(type);
}

export function evidenceConfidenceLabel(c: WolfEvidenceConfidence): string {
  if (c === 'high') return 'Strong evidence';
  if (c === 'low') return 'Weak evidence';
  return 'Developing evidence';
}

function sanitizeItem(raw: unknown, index: number): WolfEvidenceItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const bbox = normalizeBBox(row.bbox || row.box || row.region);
  if (!bbox) return null;
  const type = normalizeType(row.type || row.kind);
  const title = String(row.title || row.label || type).trim().slice(0, 64) || type;
  const description = String(row.description || row.detail || row.text || '').trim().slice(0, 280);
  const id = String(row.id || row.finding_id || `ev_${index + 1}`).slice(0, 48);
  return {
    id,
    type,
    title,
    description,
    bbox,
    confidence: normalizeConfidence(row.confidence),
    importance:
      String(row.importance || '').toLowerCase() === 'high'
        ? 'high'
        : String(row.importance || '').toLowerCase() === 'low'
          ? 'low'
          : 'medium',
  };
}

function parseArray(data: unknown): WolfEvidenceItem[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { evidence?: unknown }).evidence)
      ? (data as { evidence: unknown[] }).evidence
      : [];
  return list
    .map((row, i) => sanitizeItem(row, i))
    .filter((x): x is WolfEvidenceItem => Boolean(x))
    .slice(0, 10);
}

/** Lift ```wolfevidence JSON from model reply. */
export function parseWolfEvidence(reply: string): WolfEvidencePayload {
  const raw = String(reply || '');
  let jsonText = '';
  let text = raw;
  const fenced = FENCE_RE.exec(raw);
  if (fenced) {
    jsonText = fenced[1].trim();
    text = raw.replace(FENCE_RE, '').trim();
  } else {
    const bare = BARE_RE.exec(raw);
    if (bare) {
      jsonText = bare[1].trim();
      text = raw.replace(bare[1], '').trim();
    }
  }
  if (!jsonText) return { evidence: [], text: raw };
  try {
    const parsed = JSON.parse(jsonText);
    return { evidence: parseArray(parsed), text };
  } catch {
    return { evidence: [], text: raw };
  }
}

/**
 * When the model skips wolfevidence, synthesize rough focus boxes from
 * wolfchart-ish price bands mapped into vertical bands (full-width strips).
 */
export function synthesizeEvidenceFromSetup(args: {
  keyObservation?: string;
  entry?: string;
  stopLoss?: string;
  target?: string;
  invalidation?: string;
  why?: string[];
  setup?: string;
}): WolfEvidenceItem[] {
  const out: WolfEvidenceItem[] = [];
  const push = (
    id: string,
    type: WolfEvidenceType,
    title: string,
    description: string,
    y: number,
    h = 0.18,
  ) => {
    out.push({
      id,
      type,
      title,
      description: description.slice(0, 220),
      bbox: { x: 0.08, y: Math.max(0.05, Math.min(0.78, y)), width: 0.84, height: h },
      confidence: 'medium',
      importance: 'high',
    });
  };

  const blob = `${args.setup || ''} ${args.keyObservation || ''} ${(args.why || []).join(' ')}`.toLowerCase();
  if (/liquid|sweep|bsl|ssl/.test(blob)) {
    push('syn_liq', 'liquidity', 'Liquidity Found', args.keyObservation || 'Liquidity area on chart', 0.55);
  }
  if (/sweep/.test(blob)) {
    push('syn_sweep', 'sweep', 'Sweep Detected', args.why?.[0] || 'Liquidity interaction', 0.48, 0.2);
  }
  if (args.entry) push('syn_entry', 'entry', 'Entry Zone', args.entry, 0.42);
  if (args.invalidation || args.stopLoss) {
    push('syn_inv', 'invalidation', 'Invalidation', args.invalidation || args.stopLoss || '', 0.62);
  }
  if (args.target) push('syn_tgt', 'target', 'Target', args.target, 0.22);
  if (/structure|bos|choch/.test(blob) && out.length < 5) {
    push('syn_struct', 'structure', 'Structure', args.why?.find((w) => /structure|bos|choch/i.test(w)) || 'Structure evidence', 0.35);
  }
  return out.slice(0, 6);
}
