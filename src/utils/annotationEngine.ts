/**
 * Professional Chart Annotation Engine V3
 * Thin levels, compact labels, no giant generic boxes.
 */

import type { WolfEvidenceItem, WolfEvidenceType, NormalizedBBox } from './wolfEvidence';

export type AnnotVisualStyle =
  | 'hline'
  | 'hline_dashed'
  | 'hline_invalid'
  | 'zone_narrow'
  | 'liquidity_dots'
  | 'bos_arrow'
  | 'marker';

export type ProfessionalAnnotation = {
  id: string;
  type: string;
  /** Compact panel/chart label e.g. "R1 · 24,610" */
  label: string;
  style: AnnotVisualStyle;
  /** Normalized geometry after V3 shrink */
  geometry: NormalizedBBox;
  /** Y center 0–1 for horizontal levels */
  y: number;
  tone: 'bull' | 'bear' | 'neutral';
  reason: string;
  layer: 'primary' | 'secondary';
  tradeRelevance?: string;
  raw: WolfEvidenceItem;
};

const ZONE_TYPES = new Set(['entry', 'fvg', 'order_block']);
const LEVEL_TYPES = new Set([
  'support',
  'resistance',
  'target',
  'invalidation',
  'liquidity',
  'structure',
  'confirmation',
  'breakout',
  'other',
]);

export function compactAnnotLabel(item: WolfEvidenceItem): string {
  const title = String(item.title || '').trim();
  if (/·|—|–/.test(title) && title.length <= 42) return title;

  const price = title.match(/([\d,]{3,}(?:\s*[–\-]\s*[\d,]+)?)/)?.[1]?.replace(/\s/g, '');
  const typeTag =
    item.type === 'target'
      ? 'TP1'
      : item.type === 'entry'
        ? 'ENTRY'
        : item.type === 'invalidation'
          ? 'INVALID'
          : item.type === 'resistance'
            ? 'R1'
            : item.type === 'support'
              ? 'S1'
              : item.type === 'liquidity' || item.type === 'sweep'
                ? 'LIQUIDITY'
                : item.type === 'bos'
                  ? 'BOS'
                  : item.type === 'choch'
                    ? 'CHoCH'
                    : item.type === 'fvg'
                      ? 'FVG'
                      : item.type === 'order_block'
                        ? 'OB'
                        : item.type.toUpperCase().slice(0, 6);

  if (price) return `${typeTag} · ${price}`;
  const short = title
    .replace(/resistance|support|entry zone|invalidation|target|liquidity/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 28);
  return short ? `${typeTag} · ${short}` : typeTag;
}

function styleFor(type: WolfEvidenceType): AnnotVisualStyle {
  switch (type) {
    case 'target':
      return 'hline_dashed';
    case 'invalidation':
      return 'hline_invalid';
    case 'entry':
    case 'fvg':
    case 'order_block':
      return 'zone_narrow';
    case 'liquidity':
    case 'sweep':
      return 'liquidity_dots';
    case 'bos':
    case 'choch':
    case 'breakout':
      return 'bos_arrow';
    case 'support':
    case 'resistance':
    case 'structure':
    case 'confirmation':
    default:
      return 'hline';
  }
}

function toneFor(type: WolfEvidenceType): 'bull' | 'bear' | 'neutral' {
  if (['entry', 'support', 'target', 'bos', 'liquidity'].includes(type)) return 'bull';
  if (['invalidation', 'resistance', 'sweep', 'choch'].includes(type)) return 'bear';
  return 'neutral';
}

/**
 * Shrink giant/generic bboxes into professional geometry.
 * Levels → thin horizontal band; zones → narrow height; keep anchored.
 */
export function normalizeAnnotGeometry(
  item: WolfEvidenceItem,
  style: AnnotVisualStyle,
): NormalizedBBox {
  const b = item.bbox;
  const cy = Math.min(0.97, Math.max(0.03, b.y + b.height / 2));

  if (style === 'zone_narrow') {
    // Keep horizontal span if meaningful; clamp height to candle-scale
    const h = Math.min(0.085, Math.max(0.028, b.height > 0.2 ? 0.055 : b.height));
    const w = Math.min(0.42, Math.max(0.12, b.width > 0.7 ? 0.28 : b.width));
    const x = Math.min(1 - w, Math.max(0.02, b.x + b.width / 2 - w / 2));
    const y = Math.min(1 - h, Math.max(0.02, cy - h / 2));
    return { x, y, width: w, height: h };
  }

  if (style === 'bos_arrow' || style === 'marker') {
    const size = 0.045;
    return {
      x: Math.min(0.92, Math.max(0.04, b.x + b.width * 0.55)),
      y: Math.min(0.92, Math.max(0.04, cy - size / 2)),
      width: size,
      height: size,
    };
  }

  if (style === 'liquidity_dots') {
    return {
      x: 0.62,
      y: Math.min(0.96, Math.max(0.02, cy - 0.01)),
      width: 0.34,
      height: 0.02,
    };
  }

  // Horizontal levels: full-ish width, razor-thin height
  return {
    x: 0.04,
    y: Math.min(0.97, Math.max(0.02, cy - 0.006)),
    width: 0.92,
    height: 0.012,
  };
}

/** Reject decorative / useless / giant full-chart marks. */
export function isRenderableAnnot(item: WolfEvidenceItem): boolean {
  if (!item?.bbox) return false;
  const { width, height } = item.bbox;
  if (width > 0.92 && height > 0.55) return false; // giant panel box
  if (width * height > 0.45) return false;
  // Bare generic titles without price/context often noise — still allow typed ones
  const t = String(item.title || '').trim().toLowerCase();
  if (['resistance', 'support', 'target', 'entry', 'entry zone', 'invalidation', 'box'].includes(t)) {
    // Allow but will get compact relabel
  }
  return true;
}

export function toProfessionalAnnotations(
  items: WolfEvidenceItem[],
  opts?: { allowEntry?: boolean; maxPrimary?: number },
): ProfessionalAnnotation[] {
  const allowEntry = opts?.allowEntry !== false;
  const maxPrimary = opts?.maxPrimary ?? 7;

  const mapped = (items || [])
    .filter(isRenderableAnnot)
    .filter((item) => {
      if (item.type === 'entry' && !allowEntry) return false;
      return true;
    })
    .map((item) => {
      const style = styleFor(item.type);
      const geometry = normalizeAnnotGeometry(item, style);
      return {
        id: item.id,
        type: item.type.toUpperCase(),
        label: compactAnnotLabel(item),
        style,
        geometry,
        y: geometry.y + geometry.height / 2,
        tone: toneFor(item.type),
        reason: item.description || item.title,
        layer: 'primary' as const,
        tradeRelevance: undefined,
        raw: { ...item, bbox: geometry, title: compactAnnotLabel(item) },
      };
    })
    // Prefer decision-like marks first
    .sort((a, b) => {
      const rank = (t: string) =>
        ({
          INVALIDATION: 100,
          ENTRY: 95,
          RESISTANCE: 90,
          SUPPORT: 88,
          TARGET: 85,
          LIQUIDITY: 80,
          SWEEP: 78,
          BOS: 75,
          CHOCH: 74,
          FVG: 70,
          ORDER_BLOCK: 68,
        }[t] || 40);
      return rank(b.type) - rank(a.type);
    });

  const primary = mapped.slice(0, maxPrimary).map((a) => ({ ...a, layer: 'primary' as const }));
  const secondary = mapped.slice(maxPrimary).map((a) => ({ ...a, layer: 'secondary' as const }));
  return [...primary, ...secondary];
}

export function primaryAnnotations(ann: ProfessionalAnnotation[]): ProfessionalAnnotation[] {
  return ann.filter((a) => a.layer === 'primary');
}
