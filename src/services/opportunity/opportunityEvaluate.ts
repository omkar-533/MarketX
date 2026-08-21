/**
 * Shared Opportunity evaluation — same scanners as the website.
 * Candle fetch stays in the caller (browser provider or Render snapshot).
 */
import type { Candle } from '../radar/radarTypes';
import {
  closedBarIndex,
  inferNseBarOpenMs,
  istSessionStartMs,
  keepDisplaySetupTime,
  readCandleTimeMs,
  setupCreatedAtMs,
} from '../radar/barTime';
import { opportunityCreatedWindows } from './opportunityCreated';
import { buildFeatureSnapshot, type FeatureSnapshot } from './featureSnapshot';
import {
  scanMorningSprint,
  scanOpeningDrive,
  scanWolfHunters,
  stampLiveQuote,
} from './opportunityScanners';
import type { OptionFlowSnap } from './optionFlow';
import type {
  OpportunityFilters,
  OpportunityHit,
  OpportunityScannerId,
  OpportunityScanProgress,
  OpportunityTimeframe,
  ScannerCardState,
  SymbolRsiSeries,
} from './opportunityTypes';
import { OPPORTUNITY_SCAN_CAP, OPPORTUNITY_SCANNERS, DEFAULT_OPPORTUNITY_FILTERS } from './opportunityTypes';

export const MIN_SCAN_BARS = 25;

/** How many episodes of one symbol a card keeps — the most recent ones. */
const EPISODES_PER_SYMBOL = 4;

/**
 * Scanners that describe a state rather than an event: the symbol is listed only
 * while the rule still holds on the latest closed bar, and drops the moment it breaks.
 */
const LIVE_ONLY_SCANNERS = new Set<OpportunityScannerId>(['morning_sprint']);

export type EvaluateOpportunityOpts = {
  signal?: AbortSignal;
  onProgress?: (p: OpportunityScanProgress) => void;
  onCard?: (card: ScannerCardState) => void;
  onHit?: (hit: OpportunityHit) => void;
  topN?: number;
};

export type EvaluateOpportunityInput = {
  filters: OpportunityFilters;
  symbols: string[];
  asOf: number;
  dataMode: 'LIVE' | 'DEMO';
  /** True when candles came from the shared INDstocks snapshot. */
  shared: boolean;
  opts?: EvaluateOpportunityOpts;
  fetchBatch?: number;
  candleMapAll?: Record<string, Candle[]> | null;
  loadBatch?: (symbols: string[]) => Promise<Record<string, Candle[]>>;
  /** Server-built 5m/30m/2h Wilder RSI. Missing symbol → BOOSTERS stays silent. */
  rsiBySymbol?: Record<string, SymbolRsiSeries> | null;
  /** Slim live option-chain features. Missing symbol → Options Flow skips. */
  optionFlowBySymbol?: Record<string, OptionFlowSnap> | null;
};

export function emptyOpportunityCards(reason?: string): ScannerCardState[] {
  return OPPORTUNITY_SCANNERS.map((s) => ({
    scannerId: s.id,
    title: s.title,
    tagline: s.tagline,
    status: reason ? 'unavailable' : 'idle',
    unavailableReason: reason,
    hits: [],
    updatedAt: null,
  }));
}

export function sliceCandleMap(
  all: Record<string, Candle[]>,
  symbols: string[],
): Record<string, Candle[]> {
  const out: Record<string, Candle[]> = {};
  for (const symbol of symbols) {
    out[symbol] = all[symbol] || all[String(symbol).toUpperCase()] || [];
  }
  return out;
}

function pushHit(map: Map<OpportunityScannerId, OpportunityHit[]>, hit: OpportunityHit | null) {
  if (!hit) return;
  const list = map.get(hit.scannerId) || [];
  list.push(hit);
  map.set(hit.scannerId, list);
}

function episodeStamp(
  series: Candle[],
  index: number,
  timeframe: OpportunityTimeframe,
  now: number,
): number {
  // Detection based, so it is a no-op on an open-stamped feed and only corrects
  // the series INDstocks stamps with the bar close.
  const raw = inferNseBarOpenMs(series, index, timeframe, now);
  return keepDisplaySetupTime(setupCreatedAtMs(raw, timeframe, now), now);
}

/**
 * A setup carrying `meta.stopLevel` dies as soon as a later bar closes through it.
 * The row is marked rather than dropped so the day's record stays readable.
 */
function markStopped(
  hit: OpportunityHit,
  series: Candle[],
  fromIndex: number,
  timeframe: OpportunityTimeframe,
  now: number,
): void {
  const stop = Number(hit.meta?.stopLevel);
  if (!Number.isFinite(stop) || stop <= 0) return;
  for (let i = fromIndex + 1; i < series.length; i += 1) {
    const close = Number(series[i]?.close);
    if (!Number.isFinite(close) || close <= 0) continue;
    if (hit.direction === 'bullish' ? close < stop : close > stop) {
      hit.status = 'INVALID';
      hit.meta = { ...hit.meta, stoppedAt: episodeStamp(series, i, timeframe, now) };
      return;
    }
  }
}

/** Last bar that closed before today's bell, else -1. */
function priorSessionLastBar(series: Candle[], now: number): number {
  const open = istSessionStartMs(now);
  if (!(open > 0)) return -1;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (readCandleTimeMs(series[i]) < open) return i;
  }
  return -1;
}

function episodeKey(hit: OpportunityHit): string {
  const bar = Number(hit.meta?.barIndex);
  if (Number.isFinite(bar) && bar >= 0) return `${hit.symbol}|${bar}`;
  return `${hit.symbol}|${hit.detectedAt}`;
}

function rankTrim(
  map: Map<OpportunityScannerId, OpportunityHit[]>,
  minScore: number,
  direction: OpportunityFilters['direction'],
  topN: number,
): Map<OpportunityScannerId, OpportunityHit[]> {
  const out = new Map<OpportunityScannerId, OpportunityHit[]>();
  for (const [id, hits] of map) {
    const filtered = hits
      .filter((h) => h.score >= minScore)
      .filter((h) => direction === 'all' || h.direction === direction || h.direction === 'neutral');
    const groups = new Map<string, OpportunityHit[]>();
    for (const h of filtered) {
      const g = groups.get(h.symbol) || [];
      g.push(h);
      groups.set(h.symbol, g);
    }
    const rankedSymbols = [...groups.entries()].sort((a, b) => {
      const ta = Math.max(...a[1].map((h) => h.detectedAt));
      const tb = Math.max(...b[1].map((h) => h.detectedAt));
      return tb - ta || a[0].localeCompare(b[0]);
    });
    const flat: OpportunityHit[] = [];
    for (const [, g] of rankedSymbols) {
      const runs = [...g]
        .sort((a, b) => a.detectedAt - b.detectedAt || Number(a.meta?.barIndex || 0) - Number(b.meta?.barIndex || 0))
        .filter((h, i, arr) => i === 0 || episodeKey(h) !== episodeKey(arr[i - 1]))
        .slice(-EPISODES_PER_SYMBOL)
        .map((h, i, arr) => ({
          ...h,
          meta: {
            ...h.meta,
            // Keep the true episode number set during the walk, or number what is left.
            signalN: Number(h.meta?.signalN) || i + 1,
            signalCount: Number(h.meta?.signalCount) || arr.length,
          },
        }));
      flat.push(...runs);
    }
    out.set(id, flat);
  }
  return out;
}

export async function evaluateOpportunityFromCandleMap(input: EvaluateOpportunityInput): Promise<{
  cards: ScannerCardState[];
  hits: OpportunityHit[];
  dataMode: 'LIVE' | 'DEMO';
  complete: boolean;
}> {
  const {
    filters,
    symbols,
    asOf,
    dataMode,
    shared,
    opts = {},
    fetchBatch = 80,
    loadBatch,
  } = input;
  let candleMapAll = input.candleMapAll || null;
  const rsiBySymbol = input.rsiBySymbol || {};
  // input.optionFlowBySymbol is still accepted so existing callers keep working,
  // but Options Flow is off the desk — nothing reads the chain any more.
  const topN = opts.topN ?? OPPORTUNITY_SCAN_CAP;
  const tf = filters.timeframe as OpportunityTimeframe;
  const buckets = new Map<OpportunityScannerId, OpportunityHit[]>();
  for (const s of OPPORTUNITY_SCANNERS) buckets.set(s.id, []);

  const emitHit = (hit: OpportunityHit | null, latest?: FeatureSnapshot) => {
    if (!hit) return;
    if (latest) stampLiveQuote(hit, latest);
    const listed = keepDisplaySetupTime(hit.detectedAt);
    if (!(listed > 0)) return;
    hit.detectedAt = listed;
    if (hit.score < DEFAULT_OPPORTUNITY_FILTERS.minScore) return;
    pushHit(buckets, hit);
    opts.onHit?.(hit);
  };

  const total = symbols.length;
  let checked = 0;
  let barsOk = 0;

  opts.onProgress?.({
    status: 'scanning',
    symbolsChecked: 0,
    symbolsTotal: total,
    phase: 'UNIVERSE',
  });

  const resolveBatch = (batch: string[]) =>
    candleMapAll
      ? Promise.resolve(sliceCandleMap(candleMapAll, batch))
      : loadBatch
        ? loadBatch(batch)
        : Promise.resolve({});

  let pendingCandles: Promise<Record<string, Candle[]>> | null = symbols.length
    ? resolveBatch(symbols.slice(0, fetchBatch))
    : null;

  for (let start = 0; start < symbols.length; start += fetchBatch) {
    if (opts.signal?.aborted) break;
    const batch = symbols.slice(start, start + fetchBatch);
    const nextBatch =
      start + fetchBatch < symbols.length
        ? symbols.slice(start + fetchBatch, start + fetchBatch * 2)
        : null;
    const candleMap = pendingCandles ? await pendingCandles : await resolveBatch(batch);
    pendingCandles = nextBatch ? resolveBatch(nextBatch) : null;
    for (const symbol of batch) {
      if (opts.signal?.aborted) break;
      try {
        const rawBars = candleMap[symbol] || candleMap[String(symbol).toUpperCase()] || [];
        const candles = rawBars.map((c) => ({
          ...c,
          timestamp: readCandleTimeMs(c) || Number(c.timestamp) || 0,
        }));
        const closedEnd = closedBarIndex(candles, tf, asOf);
        const series = closedEnd >= 0 ? candles.slice(0, closedEnd + 1) : [];
        if (series.length >= MIN_SCAN_BARS) barsOk += 1;
        const f = buildFeatureSnapshot(symbol, filters.market, tf, series);
        if (!f) continue;

        const rsi = rsiBySymbol[symbol] || rsiBySymbol[String(symbol).toUpperCase()] || null;
        const ctx = { f, timeframe: tf, dataMode, quotePrice: f.tech.last, rsi };
        const featAt = new Map<number, FeatureSnapshot | null>();
        const snapshotAt = (i: number): FeatureSnapshot | null => {
          if (featAt.has(i)) return featAt.get(i) ?? null;
          const snap = buildFeatureSnapshot(symbol, filters.market, tf, series.slice(0, i + 1));
          featAt.set(i, snap);
          return snap;
        };
        const hitAt: Partial<Record<OpportunityScannerId, Record<number, OpportunityHit | null>>> = {};
        const windowsFor = (
          id: OpportunityScannerId,
          scan: (c: typeof ctx) => OpportunityHit | null,
        ) => {
          try {
            return opportunityCreatedWindows(
              series,
              tf,
              (i) => {
                const snap = snapshotAt(i);
                if (!snap) return false;
                const h = scan({
                  f: snap,
                  timeframe: tf,
                  dataMode,
                  quotePrice: snap.tech.last,
                  rsi,
                });
                (hitAt[id] ||= {})[i] = h;
                return Boolean(h && h.score >= DEFAULT_OPPORTUNITY_FILTERS.minScore);
              },
              asOf,
              {
                // Morning Sprint reads only session open/high/low, so the 9:15–9:20
                // bar is valid on its own. Boosters compares that bar's close against
                // the one before it, which on a continuous series is the previous
                // session's last bar — also valid. Skipping the bar pushed both cards'
                // first listing to 9:25.
                // Wolf Hunters compares a bar against the one before it, which on a
                // continuous series is the previous session's last bar. Skipping the
                // 9:15 bar pushed the card's earliest possible print to 11:15.
                includeFirstBar:
                  id === 'compression_break' ||
                  id === 'breakout_radar' ||
                  id === 'morning_sprint' ||
                  id === 'opening_drive' ||
                  id === 'wolf_hunters',
              },
            );
          } catch {
            return [];
          }
        };

        const runners: Array<[OpportunityScannerId, (c: typeof ctx) => OpportunityHit | null]> = [
          ['morning_sprint', scanMorningSprint],
          ['opening_drive', scanOpeningDrive],
          ['wolf_hunters', scanWolfHunters],
        ];

        const lastBar = series.length - 1;
        const sessionOpen = istSessionStartMs(asOf);
        for (const [id, scan] of runners) {
          if (id === 'wolf_hunters' && sessionOpen > 0 && sessionOpen <= asOf) {
            // Yesterday's last candle can hunt the one before it, and that setup is
            // already live when the bell rings — so it prints at the open rather than
            // waiting for a bar of today to close.
            const prior = priorSessionLastBar(series, asOf);
            const snap = prior > 0 ? snapshotAt(prior) : null;
            const carry = snap
              ? scan({ f: snap, timeframe: tf, dataMode, quotePrice: snap.tech.last, rsi })
              : null;
            if (carry && carry.score >= DEFAULT_OPPORTUNITY_FILTERS.minScore) {
              carry.detectedAt = keepDisplaySetupTime(sessionOpen, asOf);
              carry.id = `opp-${carry.scannerId}-${carry.symbol}-${carry.timeframe}-p${prior}`;
              carry.meta = { ...carry.meta, barIndex: prior, carriedOver: true };
              markStopped(carry, series, prior, tf, asOf);
              if (carry.detectedAt > 0) emitHit(carry, f);
            }
          }

          const all = windowsFor(id, scan);
          if (!all.length) continue;

          if (LIVE_ONLY_SCANNERS.has(id)) {
            // Listed only while the rule still holds on the latest closed bar,
            // stamped from when the run began so the card reads "since 9:20".
            const run = all[all.length - 1];
            if (run.endIndex < lastBar) continue;
            const hit = scan(ctx);
            if (!hit || hit.score < DEFAULT_OPPORTUNITY_FILTERS.minScore) continue;
            hit.detectedAt = episodeStamp(series, run.startIndex, tf, asOf);
            hit.id = `opp-${hit.scannerId}-${hit.symbol}-${hit.timeframe}-${run.startIndex}`;
            hit.meta = { ...hit.meta, signalN: 1, signalCount: 1, barIndex: run.startIndex };
            emitHit(hit, f);
            continue;
          }

          // Newest episodes win — keeping the first four hid every afternoon
          // reprint behind stale morning prints.
          const wins = all.slice(-EPISODES_PER_SYMBOL);
          const base = all.length - wins.length;
          for (let n = 0; n < wins.length; n += 1) {
            const win = wins[n];
            const snap = snapshotAt(win.startIndex);
            if (!snap) continue;
            const hit = scan({
              f: snap,
              timeframe: tf,
              dataMode,
              quotePrice: snap.tech.last,
              rsi,
            });
            if (!hit || hit.score < DEFAULT_OPPORTUNITY_FILTERS.minScore) continue;
            hit.detectedAt = episodeStamp(series, win.startIndex, tf, asOf);
            hit.id = `opp-${hit.scannerId}-${hit.symbol}-${hit.timeframe}-${win.startIndex}`;
            hit.meta = {
              ...hit.meta,
              signalN: base + n + 1,
              signalCount: all.length,
              barIndex: win.startIndex,
            };
            markStopped(hit, series, win.startIndex, tf, asOf);
            emitHit(hit, f);
          }
        }

      } catch {
        /* skip symbol */
      } finally {
        checked += 1;
        if (checked % 6 === 0) await new Promise((r) => setTimeout(r, 0));
        opts.onProgress?.({
          status: 'scanning',
          symbolsChecked: checked,
          symbolsTotal: total,
          phase: 'EVALUATING',
          currentSymbol: symbol,
        });
      }
    }
    await new Promise((r) => setTimeout(r, 0));
  }

  const ranked = rankTrim(buckets, DEFAULT_OPPORTUNITY_FILTERS.minScore, 'all', topN);
  const cards: ScannerCardState[] = OPPORTUNITY_SCANNERS.map((s) => {
    const hits = ranked.get(s.id) || [];
    return {
      scannerId: s.id,
      title: s.title,
      tagline: s.tagline,
      status: 'ready',
      hits,
      updatedAt: asOf,
    };
  });

  for (const card of cards) opts.onCard?.(card);

  const aborted = Boolean(opts.signal?.aborted);
  const coverageOk = shared
    ? checked >= total
    : total === 0 || barsOk >= Math.max(15, Math.floor(total * 0.3));
  const complete = !aborted && checked >= total && coverageOk;

  opts.onProgress?.({
    status: complete ? 'complete' : 'failed',
    symbolsChecked: checked,
    symbolsTotal: total,
    phase: complete ? 'DONE' : aborted ? 'ABORTED' : 'INCOMPLETE',
    error: complete ? undefined : aborted ? 'Scan aborted' : 'Incomplete candle coverage',
  });

  return { cards, hits: cards.flatMap((c) => c.hits), dataMode, complete };
}
