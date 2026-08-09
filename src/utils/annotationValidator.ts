/**
 * AnnotationValidator — keep chart markings precise, on-canvas, non-cluttered.
 */

import type { WolfEvidenceItem } from './wolfEvidence';

const PRIORITY: Record<string, number> = {
  entry: 100,
  invalidation: 95,
  bos: 90,
  choch: 88,
  sweep: 85,
  liquidity: 80,
  breakout: 75,
  structure: 70,
  support: 65,
  resistance: 65,
  target: 60,
  fvg: 55,
  order_block: 55,
  confirmation: 50,
  other: 20,
};

function severity(item: WolfEvidenceItem): 'CRITICAL' | 'IMPORTANT' | 'SECONDARY' {
  if (item.importance === 'high' || item.confidence === 'high') {
    if (['entry', 'invalidation', 'bos', 'sweep', 'liquidity'].includes(item.type)) return 'CRITICAL';
    return 'IMPORTANT';
  }
  if (item.confidence === 'low' || item.importance === 'low') return 'SECONDARY';
  return 'IMPORTANT';
}

function overlaps(a: WolfEvidenceItem, b: WolfEvidenceItem): boolean {
  const ax2 = a.bbox.x + a.bbox.width;
  const ay2 = a.bbox.y + a.bbox.height;
  const bx2 = b.bbox.x + b.bbox.width;
  const by2 = b.bbox.y + b.bbox.height;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.bbox.x, b.bbox.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.bbox.y, b.bbox.y));
  const inter = ix * iy;
  const smaller = Math.min(a.bbox.width * a.bbox.height, b.bbox.width * b.bbox.height);
  return smaller > 0 && inter / smaller > 0.55;
}

/** Filter + order evidence for clean rendering (CRITICAL + IMPORTANT by default). */
export function validateAnnotations(
  items: WolfEvidenceItem[],
  opts?: { showAll?: boolean; maxVisible?: number; lens?: string },
): WolfEvidenceItem[] {
  const max = opts?.maxVisible ?? 7;
  const cleaned = (items || [])
    .filter((item) => {
      if (!item?.bbox) return false;
      const { x, y, width, height } = item.bbox;
      if (![x, y, width, height].every((n) => Number.isFinite(n))) return false;
      if (x < 0 || y < 0 || x + width > 1.02 || y + height > 1.02) return false;
      if (width > 0.85 && height > 0.85) return false; // no full-image boxes
      if (width < 0.02 || height < 0.02) return false;
      if (item.confidence === 'low' && !opts?.showAll) return false;
      return true;
    })
    .map((item) => ({
      ...item,
      importance:
        item.importance ||
        (severity(item) === 'CRITICAL' ? 'high' : severity(item) === 'IMPORTANT' ? 'medium' : 'low'),
      sourceLens: opts?.lens || item.sourceLens,
    }))
    .sort((a, b) => (PRIORITY[b.type] || 0) - (PRIORITY[a.type] || 0));

  const picked: WolfEvidenceItem[] = [];
  for (const item of cleaned) {
    if (!opts?.showAll && severity(item) === 'SECONDARY') continue;
    if (picked.some((p) => overlaps(p, item))) continue;
    picked.push(item);
    if (picked.length >= max) break;
  }
  return picked;
}
