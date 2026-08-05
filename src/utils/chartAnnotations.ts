/**
 * Wolf AI marks up the chart by appending a machine-readable block to its
 * reply. We lift it out here so the user only ever sees the prose.
 *
 * Markings stay "areas of interest" on purpose — the desk governance forbids
 * entry / stop / target calls, so nothing here carries a trade instruction.
 */

import {
  normalizeTvInterval,
  resolveKnownSymbol,
  type TvInterval,
} from './tradingViewSymbols';

export type ChartLevelKind = 'support' | 'resistance' | 'pivot';

export interface ChartLevel {
  price: number;
  kind: ChartLevelKind;
  label: string;
}

/**
 * Desk toolkit the model can emit (TradingView-style).
 * hline = full-width horizontal · hray = horizontal ray from a bar ·
 * arrow/callout = directional / note annotations · zone = rectangle bands.
 */
export type ChartShapeType =
  | 'zone'
  | 'trend'
  | 'ray'
  | 'hline'
  | 'hray'
  | 'fib'
  | 'vline'
  | 'label'
  | 'arrow'
  | 'callout';
export type ChartShapeTone = 'bull' | 'bear' | 'neutral';

/**
 * Time anchors are either a bar offset from the last candle (0 = latest,
 * -30 = thirty bars ago), a unix timestamp, or an ISO date the model read off
 * a screenshot. Missing anchors fall back to a sensible span on the right.
 */
export type ChartAnchor = number | string;

export interface ChartShape {
  type: ChartShapeType;
  tone: ChartShapeTone;
  label: string;
  /** Primary price: band top, line start, fib start, label height. */
  p1?: number;
  /** Secondary price: band bottom, line end, fib end. */
  p2?: number;
  x1?: ChartAnchor;
  x2?: ChartAnchor;
  /** Optional hex color (Pine liquidity / OB border). */
  color?: string;
  /** Zone border (Pine OB). */
  borderColor?: string;
  /** Zone fill rgba (Pine OB bgcolor). */
  fillColor?: string;
  /** Line style — Pine liquidity uses dotted right-extend rays. */
  lineStyle?: 'solid' | 'dotted';
}

export const CHART_ANNOTATION_TAG = 'wolfchart';

const MAX_LEVELS = 10;
const MAX_SHAPES = 20;
const LABEL_MAX = 36;

/** ```wolfchart { ... } ``` — the format we ask for. */
const TAGGED_RE = new RegExp(
  `\`{3,}\\s*${CHART_ANNOTATION_TAG}\\s*([\\s\\S]*?)(?:\`{3,}|$)`,
  'i',
);
/** Any fenced block — models like to answer with ```json instead. */
const FENCED_RE = /`{3,}[a-z]*\s*(\{[\s\S]*?\})\s*(?:`{3,}|$)/gi;
/** Same payload with no fences at all. */
const BARE_RE = /(\{[^{}]*"(?:levels|shapes)"\s*:\s*\[[\s\S]*?\][\s\S]*?\})\s*$/i;

function hasMarkup(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const row = raw as Record<string, unknown>;
  return Array.isArray(row.levels) || Array.isArray(row.shapes);
}

function toKind(raw: unknown): ChartLevelKind | null {
  const kind = String(raw ?? '').trim().toLowerCase();
  if (kind === 'support' || kind === 'demand') return 'support';
  if (kind === 'resistance' || kind === 'supply') return 'resistance';
  if (kind === 'pivot' || kind === 'poc' || kind === 'vwap') return 'pivot';
  return null;
}

function toLabel(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LABEL_MAX);
}

/** Pine liquidity shortcuts only — never long "Resistance Liquidity (BSL)". */
function toPineLiqLabel(raw: unknown): string | null {
  const t = toLabel(raw);
  if (!t) return null;
  if (/^BSL \(High Vol\)$/i.test(t)) return 'BSL (High Vol)';
  if (/^SSL \(High Vol\)$/i.test(t)) return 'SSL (High Vol)';
  if (/^(PDH|PDL|PWH|PWL|PMH|PML)$/i.test(t)) return t.toUpperCase();
  if (/\bpmh\b|prev(?:ious)?\s*month(?:ly)?\s*high/i.test(t)) return 'PMH';
  if (/\bpml\b|prev(?:ious)?\s*month(?:ly)?\s*low/i.test(t)) return 'PML';
  if (/\bpwh\b|prev(?:ious)?\s*week(?:ly)?\s*high/i.test(t)) return 'PWH';
  if (/\bpwl\b|prev(?:ious)?\s*week(?:ly)?\s*low/i.test(t)) return 'PWL';
  if (/\bpdh\b|prev(?:ious)?\s*day\s*high|daily\s*high/i.test(t)) return 'PDH';
  if (/\bpdl\b|prev(?:ious)?\s*day\s*low|daily\s*low/i.test(t)) return 'PDL';
  if (/\bbsl\b|buy[\s-]*side|resistance\s*liquidity/i.test(t)) return 'BSL (High Vol)';
  if (/\bssl\b|sell[\s-]*side|support\s*liquidity/i.test(t)) return 'SSL (High Vol)';
  if (/internal\s*liquidity|external\s*liquidity|^liquidity$/i.test(t)) return null;
  return null;
}

function toLevel(raw: unknown): ChartLevel | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const price = Number(row.price ?? row.p);
  if (!Number.isFinite(price) || price <= 0) return null;
  const kind = toKind(row.kind ?? row.k ?? row.type);
  if (!kind) return null;
  return { price, kind, label: toLabel(row.label ?? row.l ?? row.note) };
}

/** Coerce anything (parsed JSON, restored localStorage) into safe levels. */
export function sanitizeLevels(raw: unknown): ChartLevel[] {
  const rows = Array.isArray(raw)
    ? raw
    : ((raw as Record<string, unknown> | null)?.levels as unknown[]) ?? [];
  if (!Array.isArray(rows)) return [];
  const seen = new Set<number>();
  return rows
    .map(toLevel)
    .filter((lvl): lvl is ChartLevel => {
      if (!lvl || seen.has(lvl.price)) return false;
      seen.add(lvl.price);
      return true;
    })
    .slice(0, MAX_LEVELS);
}

function toShapeType(raw: unknown): ChartShapeType | null {
  const type = String(raw ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (
    ['zone', 'box', 'rect', 'rectangle', 'ob', 'orderblock', 'area', 'fvg', 'gap', 'ellipse'].includes(
      type,
    )
  ) {
    return 'zone';
  }
  if (['trend', 'trendline', 'channel', 'pitchfork'].includes(type)) return 'trend';
  if (['ray', 'extend', 'diagonalray'].includes(type)) return 'ray';
  if (['hline', 'horizontal', 'horizontalline', 'pricelevel'].includes(type)) return 'hline';
  if (['hray', 'horizontalray', 'priceray'].includes(type)) return 'hray';
  if (
    ['fib', 'fibonacci', 'retracement', 'fibretrace', 'fibextension', 'fibchannel'].includes(type)
  ) {
    return 'fib';
  }
  if (['vline', 'vertical', 'verticalline', 'time', 'event', 'session'].includes(type)) {
    return 'vline';
  }
  if (['arrow', 'pointer', 'direction'].includes(type)) return 'arrow';
  if (['callout', 'annotation'].includes(type)) return 'callout';
  if (['label', 'text', 'note', 'marker', 'tag'].includes(type)) return 'label';
  // Bare "line" → trend (sloped). Horizontals should say hline.
  if (type === 'line') return 'trend';
  return null;
}

function toTone(raw: unknown): ChartShapeTone {
  const tone = String(raw ?? '').trim().toLowerCase();
  if (['bull', 'bullish', 'demand', 'support', 'up', 'long', 'green'].includes(tone)) return 'bull';
  if (['bear', 'bearish', 'supply', 'resistance', 'down', 'short', 'red'].includes(tone)) {
    return 'bear';
  }
  return 'neutral';
}

function toAnchor(raw: unknown): ChartAnchor | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = String(raw ?? '').trim();
  if (!text) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  // Anything else has to look like a date before we trust it.
  return Number.isFinite(Date.parse(text)) ? text : undefined;
}

function toPrice(raw: unknown): number | undefined {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function toShape(raw: unknown): ChartShape | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const type = toShapeType(row.type ?? row.kind ?? row.t);
  if (!type) return null;

  const rawLabel = toLabel(row.label ?? row.text ?? row.note ?? row.l);
  const pineLiq = toPineLiqLabel(rawLabel);
  // Drop invented long liquidity names that don't map to a Pine shortcut.
  if (
    pineLiq === null &&
    /liquidity|resistance\s*liquidity|support\s*liquidity|internal\s*liquidity/i.test(rawLabel)
  ) {
    return null;
  }
  const shape: ChartShape = {
    type,
    tone: toTone(row.tone ?? row.side ?? row.bias),
    label: pineLiq || rawLabel,
    p1: toPrice(row.p1 ?? row.price ?? row.top ?? row.y1 ?? row.from_price),
    p2: toPrice(row.p2 ?? row.price2 ?? row.bottom ?? row.y2 ?? row.to_price),
    x1: toAnchor(row.x1 ?? row.from ?? row.start ?? row.x ?? row.time),
    x2: toAnchor(row.x2 ?? row.to ?? row.end),
  };
  if (pineLiq) {
    shape.lineStyle = 'dotted';
    if (/^BSL/i.test(pineLiq)) shape.color = '#ef5350';
    else if (/^SSL/i.test(pineLiq)) shape.color = '#26a69a';
    else if (/^PDH|^PDL/i.test(pineLiq)) shape.color = '#ff9800';
    else if (/^PWH|^PWL/i.test(pineLiq)) shape.color = '#f0b90b';
    else if (/^PMH|^PML/i.test(pineLiq)) shape.color = '#2962ff';
  }

  const colorRaw = String(row.color ?? row.col ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(colorRaw)) shape.color = colorRaw.toLowerCase();
  const borderRaw = String(row.borderColor ?? row.border ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(borderRaw)) shape.borderColor = borderRaw.toLowerCase();
  const fillRaw = String(row.fillColor ?? row.bgcolor ?? row.bg ?? '').trim();
  if (/^rgba?\(/i.test(fillRaw) || /^#[0-9a-fA-F]{6,8}$/.test(fillRaw)) {
    shape.fillColor = fillRaw;
  }
  // Pine OB defaults — Demand/Bull OB green, Supply/Bear OB red (never FVG colors)
  if (/^(demand|bull)\s*ob\b/i.test(shape.label)) {
    shape.borderColor = shape.borderColor || '#00ff9d';
    shape.fillColor = shape.fillColor || 'rgba(0,255,157,0.15)';
    shape.color = shape.color || '#00ff9d';
    shape.tone = shape.tone || 'bull';
  } else if (/^(supply|bear)\s*ob\b/i.test(shape.label)) {
    shape.borderColor = shape.borderColor || '#ff4d4d';
    shape.fillColor = shape.fillColor || 'rgba(255,77,77,0.15)';
    shape.color = shape.color || '#ff4d4d';
    shape.tone = shape.tone || 'bear';
  }
  const styleRaw = String(row.lineStyle ?? row.style ?? row.ls ?? '')
    .trim()
    .toLowerCase();
  if (styleRaw === 'dotted' || styleRaw === 'dashed' || styleRaw === 'solid') {
    shape.lineStyle = styleRaw === 'dashed' ? 'dotted' : (styleRaw as 'solid' | 'dotted');
  }
  // Pine liquidity labels default to dotted even if model omits style.
  if (
    !shape.lineStyle &&
    /^(BSL|SSL|PDH|PDL|PWH|PWL|PMH|PML)\b/i.test(shape.label)
  ) {
    shape.lineStyle = 'dotted';
  }

  // Each shape needs the prices its geometry is built from.
  if (type === 'vline') return shape.x1 === undefined ? null : shape;
  if (type === 'label' || type === 'callout' || type === 'hline' || type === 'hray') {
    return shape.p1 === undefined ? null : shape;
  }
  if (type === 'zone' || type === 'fib') {
    if (shape.p1 === undefined || shape.p2 === undefined) return null;
    if (shape.p1 === shape.p2) {
      // A band quoted at one price ("OB around 24774") is still a real marking;
      // dropping it loses the answer, so it gets a thin band to sit in.
      if (type === 'fib') return null;
      const pad = shape.p1 * 0.0006;
      return { ...shape, p1: shape.p1 + pad, p2: shape.p2 - pad };
    }
    return shape;
  }
  // trend / ray / arrow need two prices
  return shape.p1 !== undefined && shape.p2 !== undefined ? shape : null;
}

/**
 * Horizontal hline shapes also become price lines so they show on the axis
 * even if canvas paint is skipped.
 * SUPPORT/RESISTANCE stay canvas-only (TV-style rays) — a full-width price
 * line would redraw left of the swing and break that look.
 */
export function shapesToExtraLevels(shapes: ChartShape[]): ChartLevel[] {
  return shapes
    .filter(
      (s) =>
        (s.type === 'hline' || s.type === 'hray') &&
        s.p1 &&
        !/^(support|resistance)$/i.test(s.label || ''),
    )
    .map((s) => ({
      price: s.p1!,
      kind: (s.tone === 'bull' ? 'support' : s.tone === 'bear' ? 'resistance' : 'pivot') as ChartLevelKind,
      label: s.label || (s.type === 'hray' ? 'H-Ray' : 'Level'),
    }));
}

export function sanitizeShapes(raw: unknown): ChartShape[] {
  const rows = Array.isArray(raw)
    ? raw
    : ((raw as Record<string, unknown> | null)?.shapes as unknown[]) ?? [];
  if (!Array.isArray(rows)) return [];
  const shapes = rows.map(toShape).filter((s): s is ChartShape => s !== null);

  // Collapse near-duplicate zones (same tone + overlapping price band)
  const out: ChartShape[] = [];
  for (const s of shapes) {
    if (s.type !== 'zone' || s.p1 == null || s.p2 == null) {
      out.push(s);
      continue;
    }
    const hi = Math.max(s.p1, s.p2);
    const lo = Math.min(s.p1, s.p2);
    const twin = out.find((u) => {
      if (u.type !== 'zone' || u.p1 == null || u.p2 == null) return false;
      if ((u.tone || '') !== (s.tone || '')) return false;
      const uHi = Math.max(u.p1, u.p2);
      const uLo = Math.min(u.p1, u.p2);
      const overlap = Math.max(0, Math.min(hi, uHi) - Math.max(lo, uLo));
      const smaller = Math.min(hi - lo, uHi - uLo) || 1;
      return overlap / smaller >= 0.4;
    });
    if (!twin) out.push(s);
  }
  return out.slice(0, MAX_SHAPES);
}

export interface ParsedReply {
  /** Reply with the machine block removed, safe to show and to store. */
  text: string;
  levels: ChartLevel[];
  shapes: ChartShape[];
  /** Instrument the reply is about, in TradingView form (NSE:NIFTY). */
  symbol: string | null;
  /** Timeframe the reply is about, when the model could identify one. */
  interval: TvInterval | null;
}

/** Find the markup block whatever fence the model decided to use. */
function extractBlock(source: string): { raw: string; json: string } | null {
  // Prefer the LAST wolfchart fence — the server enforcer appends the correct
  // tool at the end; taking the first kept stale OB/SR when a trend block followed.
  const taggedRe = new RegExp(TAGGED_RE.source, 'gi');
  const taggedAll = [...source.matchAll(taggedRe)];
  if (taggedAll.length) {
    const last = taggedAll[taggedAll.length - 1];
    return { raw: last[0], json: last[1] };
  }

  let lastFenced: { raw: string; json: string } | null = null;
  for (const match of source.matchAll(FENCED_RE)) {
    try {
      if (hasMarkup(JSON.parse(match[1].trim()))) {
        lastFenced = { raw: match[0], json: match[1] };
      }
    } catch {
      /* not our block */
    }
  }
  if (lastFenced) return lastFenced;

  const bare = source.match(BARE_RE);
  return bare ? { raw: bare[0], json: bare[1] } : null;
}

/**
 * Split an AI reply into display text and chart markings. Any malformed block
 * is dropped silently — a broken annotation must never break the answer.
 */
export function parseChartAnnotations(reply: string): ParsedReply {
  const source = String(reply ?? '');
  const block = extractBlock(source);
  if (!block) {
    return { text: source.trim(), levels: [], shapes: [], symbol: null, interval: null };
  }

  const text = source
    .replace(block.raw, '')
    // A stripped block can leave an orphan fence behind.
    .replace(/`{3,}[a-z]*\s*`{3,}/gi, '')
    .replace(/`{3,}\s*$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  let levels: ChartLevel[] = [];
  let shapes: ChartShape[] = [];
  let symbol: string | null = null;
  let interval: TvInterval | null = null;
  try {
    const parsed = JSON.parse(block.json.trim()) as unknown;
    levels = sanitizeLevels(parsed);
    shapes = sanitizeShapes(parsed);
    // hline / hray also become axis price lines so they stay visible.
    const extras = shapesToExtraLevels(shapes);
    if (extras.length) {
      const seen = new Set(levels.map((l) => `${l.kind}:${l.price.toFixed(4)}`));
      for (const lvl of extras) {
        const key = `${lvl.kind}:${lvl.price.toFixed(4)}`;
        if (!seen.has(key)) {
          seen.add(key);
          levels.push(lvl);
        }
      }
      levels = levels.slice(0, MAX_LEVELS);
    }
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
      const row = parsed as Record<string, unknown>;
      symbol = resolveKnownSymbol(row.symbol ?? row.sym);
      interval = normalizeTvInterval(row.tf ?? row.timeframe ?? row.interval);
    }
  } catch {
    /* malformed block — keep the prose, drop the drawing */
  }

  return { text, levels, shapes, symbol, interval };
}

/** Guard against a model that quotes levels nowhere near the traded price. */
export function levelsNearPrice(levels: ChartLevel[], reference: number): ChartLevel[] {
  if (!Number.isFinite(reference) || reference <= 0) return levels;
  return levels.filter((lvl) => Math.abs(lvl.price - reference) / reference <= 0.25);
}

/** Same sanity check for shapes: everything must sit near the traded range. */
export function shapesNearPrice(shapes: ChartShape[], reference: number): ChartShape[] {
  if (!Number.isFinite(reference) || reference <= 0) return shapes;
  const near = (price?: number, band = 0.25) =>
    price === undefined || Math.abs(price - reference) / reference <= band;

  return shapes.filter((shape) => {
    // Pine liquidity / structural levels can sit farther than a 25% band (PDH…).
    if (
      shape.type === 'hray' ||
      shape.type === 'hline' ||
      /^(BSL|SSL|PDH|PDL|PWH|PWL|PMH|PML|support|resistance)\b/i.test(shape.label || '')
    ) {
      return near(shape.p1, 0.5);
    }
    // Trend / ray: older swing can be far below LTP — keep if either end is
    // near OR the projected price at the latest bar is near.
    if (shape.type === 'trend' || shape.type === 'ray' || shape.type === 'arrow') {
      if (near(shape.p1, 0.45) || near(shape.p2, 0.45)) return true;
      if (
        shape.p1 !== undefined &&
        shape.p2 !== undefined &&
        shape.x1 !== undefined &&
        shape.x2 !== undefined
      ) {
        const x1 = Number(shape.x1);
        const x2 = Number(shape.x2);
        if (Number.isFinite(x1) && Number.isFinite(x2) && x2 !== x1) {
          const t = (0 - x1) / (x2 - x1);
          const projected = shape.p1 + (shape.p2 - shape.p1) * t;
          if (near(projected, 0.35)) return true;
        }
      }
      return false;
    }
    return near(shape.p1, 0.35) && near(shape.p2, 0.35);
  });
}
