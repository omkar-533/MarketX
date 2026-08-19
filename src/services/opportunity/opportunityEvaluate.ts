/**
 * Shared Opportunity evaluation — same scanners as the website.
 * Candle fetch stays in the caller (browser provider or Render snapshot).
 */
import type { Candle } from '../radar/radarTypes';
import {
  closedBarIndex,
  keepDisplaySetupTime,
  readCandleTimeMs,
  setupCreatedAtMs,
} from '../radar/barTime';
import { opportunityCreatedWindows } from './opportunityCreated';
import { buildFeatureSnapshot, type FeatureSnapshot } from './featureSnapshot';
import {
  scanBreakoutRadar,
  scanCompressionBreak,
  scanLiquidityHunt,
  scanMomentumSurge,
  scanTrendRider,
  scanWolfPrime,
} from './opportunityScanners';
import type {
  OpportunityFilters,
  OpportunityHit,
  OpportunityScannerId,
  OpportunityScanProgress,
  OpportunityTimeframe,
  ScannerCardState,
} from './opportunityTypes';
import { OPPORTUNITY_SCAN_CAP, OPPORTUNITY_SCANNERS, DEFAULT_OPPORTUNITY_FILTERS } from './opportunityTypes';

export const MIN_SCAN_BARS = 25;

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
  const raw = readCandleTimeMs(series[index]) || Number(series[index]?.timestamp) || 0;
  return keepDisplaySetupTime(setupCreatedAtMs(raw, timeframe, now), now);
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
        .slice(0, 4)
        .map((h, i, arr) => ({
          ...h,
          meta: { ...h.meta, signalN: i + 1, signalCount: arr.length },
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
  const topN = opts.topN ?? OPPORTUNITY_SCAN_CAP;
  const tf = filters.timeframe as OpportunityTimeframe;
  const buckets = new Map<OpportunityScannerId, OpportunityHit[]>();
  for (const s of OPPORTUNITY_SCANNERS) buckets.set(s.id, []);

  const emitHit = (hit: OpportunityHit | null) => {
    if (!hit) return;
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

        const quotePrice = f.tech.last;
        const ctx = { f, timeframe: tf, dataMode, quotePrice };
        const sibling: Partial<Record<OpportunityScannerId, number>> = {};
        const featAt = new Map<number, FeatureSnapshot | null>();
        const snapshotAt = (i: number): FeatureSnapshot | null => {
          if (featAt.has(i)) return featAt.get(i) ?? null;
          const snap = buildFeatureSnapshot(symbol, filters.market, tf, series.slice(0, i + 1));
          featAt.set(i, snap);
          return snap;
        };
        const qualifyAt: Partial<Record<OpportunityScannerId, Record<number, boolean>>> = {};
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
                });
                const ok = Boolean(h && h.score >= DEFAULT_OPPORTUNITY_FILTERS.minScore);
                (qualifyAt[id] ||= {})[i] = ok;
                return ok;
              },
              asOf,
            );
          } catch {
            return [];
          }
        };

        const runners: Array<[OpportunityScannerId, (c: typeof ctx) => OpportunityHit | null]> = [
          ['momentum_surge', scanMomentumSurge],
          ['liquidity_hunt', scanLiquidityHunt],
          ['compression_break', scanCompressionBreak],
          ['breakout_radar', scanBreakoutRadar],
          ['trend_rider', scanTrendRider],
        ];

        for (const [id, scan] of runners) {
          const wins = windowsFor(id, scan).slice(0, 4);
          if (!wins.length) continue;
          for (let n = 0; n < wins.length; n += 1) {
            const win = wins[n];
            const snap = snapshotAt(win.startIndex);
            if (!snap) continue;
            const hit = scan({
              f: snap,
              timeframe: tf,
              dataMode,
              quotePrice,
            });
            if (!hit || hit.score < DEFAULT_OPPORTUNITY_FILTERS.minScore) continue;
            hit.detectedAt = episodeStamp(series, win.startIndex, tf, asOf);
            hit.id = `opp-${hit.scannerId}-${hit.symbol}-${hit.timeframe}-${win.startIndex}`;
            hit.meta = {
              ...hit.meta,
              signalN: n + 1,
              signalCount: wins.length,
              barIndex: win.startIndex,
            };
            sibling[hit.scannerId] = Math.max(sibling[hit.scannerId] || 0, hit.score);
            emitHit(hit);
          }
        }

        const primeWins = opportunityCreatedWindows(
          series,
          tf,
          (i) => {
            let n = 0;
            for (const [id] of runners) {
              if (qualifyAt[id]?.[i]) n += 1;
              if (n >= 2) return true;
            }
            return false;
          },
          asOf,
        ).slice(0, 4);
        for (let n = 0; n < primeWins.length; n += 1) {
          const win = primeWins[n];
          const snap = snapshotAt(win.startIndex) || f;
          const prime = scanWolfPrime(
            { f: snap, timeframe: tf, dataMode, quotePrice },
            sibling,
          );
          if (!prime || prime.score < DEFAULT_OPPORTUNITY_FILTERS.minScore) continue;
          prime.detectedAt = episodeStamp(series, win.startIndex, tf, asOf);
          prime.id = `opp-${prime.scannerId}-${prime.symbol}-${prime.timeframe}-${win.startIndex}`;
          prime.meta = {
            ...prime.meta,
            signalN: n + 1,
            signalCount: primeWins.length,
            barIndex: win.startIndex,
          };
          emitHit(prime);
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
