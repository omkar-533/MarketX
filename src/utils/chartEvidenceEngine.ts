/**
 * Client-side Chart Evidence Engine — crop + pad + annotate from original screenshot.
 * Never mutates the source image URL; returns derived data URLs.
 */

import {
  evidenceIcon,
  type NormalizedBBox,
  type WolfEvidenceItem,
} from './wolfEvidence';

export type RenderedEvidence = WolfEvidenceItem & {
  imageUrl: string;
  cropBox: NormalizedBBox;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load chart image'));
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

/** Expand bbox with padding and clamp to [0,1]. */
export function padBBox(bbox: NormalizedBBox, pad = 0.22): NormalizedBBox {
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const w = Math.min(0.95, bbox.width * (1 + pad * 2));
  const h = Math.min(0.95, bbox.height * (1 + pad * 2));
  // Prefer readable wide frames for horizontal PA
  const aspectAwareW = Math.max(w, h * 1.35);
  const aspectAwareH = Math.max(h, w * 0.55);
  let x = cx - aspectAwareW / 2;
  let y = cy - aspectAwareH / 2;
  let width = aspectAwareW;
  let height = aspectAwareH;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + width > 1) width = 1 - x;
  if (y + height > 1) height = 1 - y;
  return { x, y, width: Math.max(0.08, width), height: Math.max(0.08, height) };
}

function toneFor(type: WolfEvidenceItem['type']): string {
  if (type === 'entry' || type === 'target' || type === 'support') return '#86efac';
  if (type === 'invalidation' || type === 'sweep' || type === 'resistance') return '#fca5a5';
  if (type === 'liquidity' || type === 'confirmation') return '#fcd34d';
  return '#93c5fd';
}

/**
 * Crop padded region from original chart and stamp a compact annotation label.
 */
export async function renderEvidenceCrop(
  originalSrc: string,
  item: WolfEvidenceItem,
): Promise<RenderedEvidence | null> {
  try {
    const img = await loadImage(originalSrc);
    const crop = padBBox(item.bbox, item.type === 'entry' || item.type === 'structure' ? 0.28 : 0.22);
    const sx = Math.floor(crop.x * img.naturalWidth);
    const sy = Math.floor(crop.y * img.naturalHeight);
    const sw = Math.max(8, Math.floor(crop.width * img.naturalWidth));
    const sh = Math.max(8, Math.floor(crop.height * img.naturalHeight));

    const outW = Math.min(960, Math.max(420, sw * 1.35));
    const outH = Math.round((outW * sh) / sw);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

    // Gentle vignette so focus reads as “investigation”
    const grad = ctx.createRadialGradient(outW / 2, outH / 2, outH * 0.2, outW / 2, outH / 2, outH * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(2,6,23,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outW, outH);

    // Inner focus rect corresponding to unpadded bbox within crop
    const relX = ((item.bbox.x - crop.x) / crop.width) * outW;
    const relY = ((item.bbox.y - crop.y) / crop.height) * outH;
    const relW = (item.bbox.width / crop.width) * outW;
    const relH = (item.bbox.height / crop.height) * outH;
    const color = toneFor(item.type);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, outW * 0.004);
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(relX, relY, relW, relH);
    ctx.setLineDash([]);

    // Label chip
    const label = `${evidenceIcon(item.type)} ${item.title}`.slice(0, 42);
    ctx.font = `700 ${Math.max(13, Math.round(outW * 0.028))}px ui-sans-serif, system-ui, sans-serif`;
    const padX = 10;
    const tw = ctx.measureText(label).width;
    const bx = 12;
    const by = 12;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, tw + padX * 2, 28, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, bx + padX, by + 19);

    return {
      ...item,
      imageUrl: canvas.toDataURL('image/jpeg', 0.88),
      cropBox: crop,
    };
  } catch {
    return null;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export async function renderAllEvidence(
  originalSrc: string,
  items: WolfEvidenceItem[],
): Promise<RenderedEvidence[]> {
  const out: RenderedEvidence[] = [];
  for (const item of items) {
    const rendered = await renderEvidenceCrop(originalSrc, item);
    if (rendered) out.push(rendered);
  }
  return out;
}

/** Draw all evidence boxes onto a full-frame annotated copy of the original. */
export async function renderFullAnnotatedChart(
  originalSrc: string,
  items: WolfEvidenceItem[],
): Promise<string | null> {
  try {
    const img = await loadImage(originalSrc);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    for (const item of items.slice(0, 8)) {
      const color = toneFor(item.type);
      const x = item.bbox.x * canvas.width;
      const y = item.bbox.y * canvas.height;
      const w = item.bbox.width * canvas.width;
      const h = item.bbox.height * canvas.height;
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, canvas.width * 0.0025);
      ctx.strokeRect(x, y, w, h);
      ctx.font = `700 ${Math.max(14, Math.round(canvas.width * 0.014))}px ui-sans-serif, system-ui`;
      const label = `${evidenceIcon(item.type)} ${item.title}`.slice(0, 36);
      ctx.fillStyle = 'rgba(2,6,23,0.85)';
      const tw = ctx.measureText(label).width + 16;
      ctx.fillRect(x, Math.max(0, y - 26), tw, 24);
      ctx.fillStyle = color;
      ctx.fillText(label, x + 8, Math.max(16, y - 8));
    }
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return null;
  }
}
