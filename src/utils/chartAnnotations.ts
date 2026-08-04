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

/** Everything the model can draw beyond a plain horizontal line. */
export type ChartShapeType = 'zone' | 'trend' | 'ray' | 'fib' | 'vline' | 'label';
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
}

export const CHART_ANNOTATION_TAG = 'wolfchart';

const MAX_LEVELS = 8;
const MAX_SHAPES = 12;
const LABEL_MAX = 28;

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
  const type = String(raw ?? '').trim().toLowerCase();
  if (['zone', 'box', 'rect', 'ob', 'orderblock', 'area', 'fvg', 'gap'].includes(type)) {
    return 'zone';
  }
  if (['trend', 'trendline', 'line', 'channel'].includes(type)) return 'trend';
  if (['ray', 'extend'].includes(type)) return 'ray';
  if (['fib', 'fibonacci', 'retracement'].includes(type)) return 'fib';
  if (['vline', 'vertical', 'time', 'event'].includes(type)) return 'vline';
  if (['label', 'text', 'note', 'marker'].includes(type)) return 'label';
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

  const shape: ChartShape = {
    type,
    tone: toTone(row.tone ?? row.side ?? row.bias),
    label: toLabel(row.label ?? row.text ?? row.note ?? row.l),
    p1: toPrice(row.p1 ?? row.price ?? row.top ?? row.y1 ?? row.from_price),
    p2: toPrice(row.p2 ?? row.price2 ?? row.bottom ?? row.y2 ?? row.to_price),
    x1: toAnchor(row.x1 ?? row.from ?? row.start ?? row.x ?? row.time),
    x2: toAnchor(row.x2 ?? row.to ?? row.end),
  };

  // Each shape needs the prices its geometry is built from.
  if (type === 'vline') return shape.x1 === undefined ? null : shape;
  if (type === 'label') return shape.p1 === undefined ? null : shape;
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
  return shape.p1 !== undefined && shape.p2 !== undefined ? shape : null;
}

export function sanitizeShapes(raw: unknown): ChartShape[] {
  const rows = Array.isArray(raw)
    ? raw
    : ((raw as Record<string, unknown> | null)?.shapes as unknown[]) ?? [];
  if (!Array.isArray(rows)) return [];
  return rows.map(toShape).filter((s): s is ChartShape => s !== null).slice(0, MAX_SHAPES);
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
  const tagged = source.match(TAGGED_RE);
  if (tagged) return { raw: tagged[0], json: tagged[1] };

  for (const match of source.matchAll(FENCED_RE)) {
    try {
      if (hasMarkup(JSON.parse(match[1].trim()))) return { raw: match[0], json: match[1] };
    } catch {
      /* not our block */
    }
  }

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
  const near = (price?: number) =>
    price === undefined || Math.abs(price - reference) / reference <= 0.25;
  return shapes.filter((shape) => near(shape.p1) && near(shape.p2));
}
