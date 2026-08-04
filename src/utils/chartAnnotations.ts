/**
 * Wolf AI marks up the chart by appending a machine-readable block to its
 * reply. We lift it out here so the user only ever sees the prose.
 *
 * Levels stay "areas of interest" on purpose — the desk governance forbids
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

export const CHART_ANNOTATION_TAG = 'wolfchart';

const MAX_LEVELS = 6;
const LABEL_MAX = 24;

/** ```wolfchart { ... } ``` — tolerant of missing fences and stray whitespace. */
const BLOCK_RE = new RegExp(
  `\`{3,}\\s*${CHART_ANNOTATION_TAG}\\s*([\\s\\S]*?)(?:\`{3,}|$)`,
  'i',
);

/** Same payload, but the model forgot the fences. */
const BARE_RE = /(\{[^{}]*"levels"\s*:\s*\[[\s\S]*?\][^{}]*\})/i;

function toKind(raw: unknown): ChartLevelKind | null {
  const kind = String(raw ?? '').trim().toLowerCase();
  if (kind === 'support' || kind === 'demand') return 'support';
  if (kind === 'resistance' || kind === 'supply') return 'resistance';
  if (kind === 'pivot' || kind === 'poc' || kind === 'vwap') return 'pivot';
  return null;
}

function toLevel(raw: unknown): ChartLevel | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const price = Number(row.price ?? row.p);
  if (!Number.isFinite(price) || price <= 0) return null;
  const kind = toKind(row.kind ?? row.k ?? row.type);
  if (!kind) return null;
  const label = String(row.label ?? row.l ?? row.note ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LABEL_MAX);
  return { price, kind, label };
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

export interface ParsedReply {
  /** Reply with the machine block removed, safe to show and to store. */
  text: string;
  levels: ChartLevel[];
  /** Instrument the reply is about, in TradingView form (NSE:NIFTY). */
  symbol: string | null;
  /** Timeframe the reply is about, when the model could identify one. */
  interval: TvInterval | null;
}

/**
 * Split an AI reply into display text and chart levels. Any malformed block is
 * dropped silently — a broken annotation must never break the answer.
 */
export function parseChartAnnotations(reply: string): ParsedReply {
  const source = String(reply ?? '');
  // Models drop the fences often enough that a bare trailing object is worth catching.
  const match = source.match(BLOCK_RE) ?? source.match(BARE_RE);
  if (!match) return { text: source.trim(), levels: [], symbol: null, interval: null };

  const text = source.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim();

  let levels: ChartLevel[] = [];
  let symbol: string | null = null;
  let interval: TvInterval | null = null;
  try {
    const parsed = JSON.parse(match[1].trim()) as unknown;
    levels = sanitizeLevels(parsed);
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
      const row = parsed as Record<string, unknown>;
      symbol = resolveKnownSymbol(row.symbol ?? row.sym);
      interval = normalizeTvInterval(row.tf ?? row.timeframe ?? row.interval);
    }
  } catch {
    /* malformed block — keep the prose, drop the drawing */
  }

  return { text, levels, symbol, interval };
}

/** Guard against a model that quotes levels nowhere near the traded price. */
export function levelsNearPrice(levels: ChartLevel[], reference: number): ChartLevel[] {
  if (!Number.isFinite(reference) || reference <= 0) return levels;
  return levels.filter((lvl) => Math.abs(lvl.price - reference) / reference <= 0.25);
}
