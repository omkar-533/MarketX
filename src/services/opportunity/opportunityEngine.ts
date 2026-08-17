/**
 * Wolf Opportunity scan orchestrator.
 * One batched candle fetch per symbol group → all OHLC scanners. No fabricated hits.
 */
import type { Candle, RadarMarket, RadarUniverse } from '../radar/radarTypes';
import type { MarketDataProvider } from '../radar/MarketDataProvider';
import { mockMarketDataProvider } from '../radar/MockMarketDataProvider';
import { resolveCatalogUniverse } from '../radar/universeCatalog';
import {
  closedBarIndex,
  currentRunStartOfIstDay,
  keepDisplaySetupTime,
  lastBarStamp,
  lastClosedBarCloseMs,
  readCandleTimeMs,
  sessionBarsNeeded,
} from '../radar/barTime';
import { buildFeatureSnapshot, type FeatureSnapshot } from './featureSnapshot';
import { sectorOf } from './sectorMap';
import {
  OHLC_SCANNERS,
  scanBreakoutRadar,
  scanCompressionBreak,
  scanFlowShift,
  scanLiquidityHunt,
  scanMomentumFade,
  scanMomentumSurge,
  scanOptionsFlow,
  scanReversalHunter,
  scanSectorLeaders,
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

export type RunOpportunityOptions = {
  signal?: AbortSignal;
  onProgress?: (p: OpportunityScanProgress) => void;
  onCard?: (card: ScannerCardState) => void;
  /** Fired as each opportunity is discovered so UI can append live. */
  onHit?: (hit: OpportunityHit) => void;
  topN?: number;
  /** Skip candle caches and pull INDstocks again (connect / manual scan). */
  freshCandles?: boolean;
};

type CandleFetchOpts = { fresh?: boolean };

type CandleBatchProvider = MarketDataProvider & {
  getCandlesMany?: (
    symbols: string[],
    timeframe: OpportunityTimeframe,
    bars?: number,
    opts?: CandleFetchOpts,
  ) => Promise<Record<string, Candle[]>>;
  getOpportunitySymbols?: (universe: RadarUniverse, market?: RadarMarket) => Promise<string[]>;
  getOpportunitySnapshot?: (
    universe: RadarUniverse,
    timeframe: OpportunityTimeframe,
    signal?: AbortSignal,
    onWait?: (p: { loaded: number; total: number }) => void,
  ) => Promise<{
    symbols: string[];
    candlesBySymbol: Record<string, Candle[]>;
    builtAt?: number;
    asOf?: number;
  }>;
};

const MIN_SCAN_BARS = 25;

function uniqueSortedSymbols(symbols: string[]): string[] {
  return [...new Set(symbols.map((s) => String(s || '').toUpperCase()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function sliceCandleMap(
  all: Record<string, Candle[]>,
  symbols: string[],
): Record<string, Candle[]> {
  const out: Record<string, Candle[]> = {};
  for (const symbol of symbols) {
    out[symbol] = all[symbol] || all[String(symbol).toUpperCase()] || [];
  }
  return out;
}

async function retryThinCandles(
  provider: CandleBatchProvider,
  map: Record<string, Candle[]>,
  symbols: string[],
  tf: OpportunityTimeframe,
  bars: number,
  signal?: AbortSignal,
  fresh = false,
): Promise<Record<string, Candle[]>> {
  const missing = symbols.filter((s) => (map[s]?.length || 0) < MIN_SCAN_BARS);
  if (!missing.length || signal?.aborted) return map;
  if (typeof provider.getCandlesMany === 'function') {
    const extra = await provider.getCandlesMany(missing, tf, bars, { fresh });
    for (const symbol of missing) {
      const rows = extra[symbol] || extra[String(symbol).toUpperCase()] || [];
      if (rows.length > (map[symbol]?.length || 0)) map[symbol] = rows;
    }
    return map;
  }
  const conc = 8;
  for (let i = 0; i < missing.length; i += conc) {
    if (signal?.aborted) break;
    const slice = missing.slice(i, i + conc);
    await Promise.all(
      slice.map(async (symbol) => {
        try {
          const rows = await provider.getCandles(symbol, tf, bars);
          if ((rows?.length || 0) > (map[symbol]?.length || 0)) map[symbol] = rows;
        } catch {
          /* keep whatever we have */
        }
      }),
    );
  }
  return map;
}

async function loadCandleMap(
  provider: CandleBatchProvider,
  symbols: string[],
  tf: OpportunityTimeframe,
  bars: number,
  signal?: AbortSignal,
  fresh = false,
): Promise<Record<string, Candle[]>> {
  if (signal?.aborted) return {};
  let map: Record<string, Candle[]> = {};
  if (typeof provider.getCandlesMany === 'function') {
    map = await provider.getCandlesMany(symbols, tf, bars, { fresh });
  } else {
    const conc = provider.isDemo ? 12 : 10;
    for (let i = 0; i < symbols.length; i += conc) {
      if (signal?.aborted) break;
      const slice = symbols.slice(i, i + conc);
      await Promise.all(
        slice.map(async (symbol) => {
          try {
            map[symbol] = await provider.getCandles(symbol, tf, bars);
          } catch {
            map[symbol] = [];
          }
        }),
      );
    }
  }
  return retryThinCandles(provider, map, symbols, tf, bars, signal, fresh);
}

async function loadOpportunityUniverse(
  provider: CandleBatchProvider,
  filters: OpportunityFilters,
): Promise<string[]> {
  const fallback = uniqueSortedSymbols(resolveCatalogUniverse(toRadarUniverse(filters.universe)));
  if (typeof provider.getOpportunitySymbols === 'function') {
    try {
      const live = uniqueSortedSymbols(
        await provider.getOpportunitySymbols(toRadarUniverse(filters.universe), filters.market),
      );
      if (live.length) return live;
    } catch {
      /* bundled catalog is identical on every client of this deploy */
    }
  }
  return fallback;
}

function toRadarUniverse(u: OpportunityFilters['universe']): RadarUniverse {
  if (u === 'F&O') return 'F&O';
  if (u === 'NIFTY50') return 'NIFTY50';
  if (u === 'CASH' || u === 'NIFTY500') return 'CASH';
  return 'CASH';
}

function emptyCards(reason?: string): ScannerCardState[] {
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

function pushHit(map: Map<OpportunityScannerId, OpportunityHit[]>, hit: OpportunityHit | null) {
  if (!hit) return;
  const list = map.get(hit.scannerId) || [];
  list.push(hit);
  map.set(hit.scannerId, list);
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
      .filter((h) => direction === 'all' || h.direction === direction || h.direction === 'neutral')
      .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
      .slice(0, topN);
    out.set(id, filtered);
  }
  return out;
}

export async function runOpportunityScan(
  filters: OpportunityFilters,
  opts: RunOpportunityOptions = {},
  provider: MarketDataProvider = mockMarketDataProvider,
): Promise<{
  cards: ScannerCardState[];
  hits: OpportunityHit[];
  dataMode: 'LIVE' | 'DEMO';
  complete: boolean;
}> {
  const topN = opts.topN ?? OPPORTUNITY_SCAN_CAP;
  const dataMode: 'LIVE' | 'DEMO' = provider.isDemo ? 'DEMO' : 'LIVE';
  const tf = filters.timeframe as OpportunityTimeframe;
  let asOf = Date.now();
  const buckets = new Map<OpportunityScannerId, OpportunityHit[]>();
  for (const s of OPPORTUNITY_SCANNERS) buckets.set(s.id, []);
  const failed = (message: string, cards = emptyCards(message)) => ({
    cards,
    hits: [] as OpportunityHit[],
    dataMode,
    complete: false,
  });

  const emitHit = (hit: OpportunityHit | null) => {
    if (!hit) return;
    // Current-run listing time. Never Date.now() / last-bar close for every name.
    const listed = keepDisplaySetupTime(hit.detectedAt);
    if (!(listed > 0)) return;
    hit.detectedAt = listed;
    if (hit.score < DEFAULT_OPPORTUNITY_FILTERS.minScore) return;
    pushHit(buckets, hit);
    opts.onHit?.(hit);
  };

  let symbols: string[] = [];
  const batchProvider = provider as CandleBatchProvider;
  const shared = Boolean(!provider.isDemo && typeof batchProvider.getOpportunitySnapshot === 'function');
  let candleMapAll: Record<string, Candle[]> | null = null;
  try {
    if (shared) {
      opts.onProgress?.({
        status: 'scanning',
        symbolsChecked: 0,
        symbolsTotal: 0,
        phase: 'SHARED',
      });
      const snap = await batchProvider.getOpportunitySnapshot!(
        toRadarUniverse(filters.universe),
        tf,
        opts.signal,
        (p) => {
          opts.onProgress?.({
            status: 'scanning',
            symbolsChecked: p.loaded,
            symbolsTotal: p.total,
            phase: 'SHARED',
          });
        },
      );
      symbols = uniqueSortedSymbols(snap.symbols);
      candleMapAll = snap.candlesBySymbol || {};
      const barClose = lastClosedBarCloseMs(tf);
      asOf = barClose || Math.min(Number(snap.asOf || snap.builtAt) || Date.now(), Date.now());
    } else {
      symbols = await loadOpportunityUniverse(batchProvider, filters);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load universe';
    opts.onProgress?.({
      status: 'failed',
      symbolsChecked: 0,
      symbolsTotal: 0,
      phase: 'ERROR',
      error: message,
    });
    return failed(message);
  }

  if (!symbols.length) {
    return failed('Universe returned no symbols.');
  }

  const FETCH_BATCH = provider.isDemo ? 24 : 80;
  const bars = sessionBarsNeeded(tf);
  const fresh = Boolean(opts.freshCandles) && !shared;
  if (candleMapAll && !shared) {
    candleMapAll = await retryThinCandles(
      batchProvider,
      candleMapAll,
      symbols,
      tf,
      bars,
      opts.signal,
      fresh,
    );
  }
  const sectorBag = new Map<string, { symbol: string; changePercent: number; f: ReturnType<typeof buildFeatureSnapshot> }[]>();
  const total = symbols.length;
  let checked = 0;
  let barsOk = 0;

  opts.onProgress?.({
    status: 'scanning',
    symbolsChecked: 0,
    symbolsTotal: total,
    phase: 'UNIVERSE',
  });

  let pendingCandles: Promise<Record<string, Candle[]>> | null = symbols.length
    ? candleMapAll
      ? Promise.resolve(sliceCandleMap(candleMapAll, symbols.slice(0, FETCH_BATCH)))
      : loadCandleMap(batchProvider, symbols.slice(0, FETCH_BATCH), tf, bars, opts.signal, fresh)
    : null;

  for (let start = 0; start < symbols.length; start += FETCH_BATCH) {
    if (opts.signal?.aborted) break;
    const batch = symbols.slice(start, start + FETCH_BATCH);
    const nextBatch =
      start + FETCH_BATCH < symbols.length
        ? symbols.slice(start + FETCH_BATCH, start + FETCH_BATCH * 2)
        : null;
    const candleMap = pendingCandles
      ? await pendingCandles
      : candleMapAll
        ? sliceCandleMap(candleMapAll, batch)
        : await loadCandleMap(batchProvider, batch, tf, bars, opts.signal, fresh);
    pendingCandles = nextBatch
      ? candleMapAll
        ? Promise.resolve(sliceCandleMap(candleMapAll, nextBatch))
        : loadCandleMap(batchProvider, nextBatch, tf, bars, opts.signal, fresh)
      : null;
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
        const listedAtFor = (
          scan: (c: typeof ctx) => OpportunityHit | null,
          direction?: OpportunityHit['direction'],
        ): number => {
          try {
            return (
              currentRunStartOfIstDay(
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
                  return (
                    !!h &&
                    h.score >= DEFAULT_OPPORTUNITY_FILTERS.minScore &&
                    (direction == null || h.direction === direction)
                  );
                },
                asOf,
              ) || 0
            );
          } catch {
            return 0;
          }
        };

        const runners: Array<[OpportunityScannerId, (c: typeof ctx) => OpportunityHit | null]> = [
          ['momentum_surge', scanMomentumSurge],
          ['flow_shift', scanFlowShift],
          ['liquidity_hunt', scanLiquidityHunt],
          ['compression_break', scanCompressionBreak],
          ['momentum_fade', scanMomentumFade],
          ['breakout_radar', scanBreakoutRadar],
          ['reversal_hunter', scanReversalHunter],
          ['trend_rider', scanTrendRider],
          ['options_flow', scanOptionsFlow],
        ];

        const listedTimes: number[] = [];
        for (const [, scan] of runners) {
          const hit = scan(ctx);
          if (!hit || hit.score < DEFAULT_OPPORTUNITY_FILTERS.minScore) continue;
          const listed = listedAtFor(scan, hit.direction) || lastBarStamp(series, tf, asOf);
          if (!listed) continue;
          hit.detectedAt = listed;
          sibling[hit.scannerId] = hit.score;
          listedTimes.push(listed);
          emitHit(hit);
        }

        const prime = scanWolfPrime(ctx, sibling);
        if (prime) {
          const listed =
            listedTimes.length
              ? Math.min(...listedTimes)
              : listedAtFor((c) => scanWolfPrime(c, sibling), prime.direction) || lastBarStamp(series, tf, asOf);
          if (listed) {
            prime.detectedAt = listed;
            emitHit(prime);
          }
        }

        const sec = sectorOf(symbol);
        const bag = sectorBag.get(sec) || [];
        bag.push({ symbol, changePercent: f.changePercent, f });
        sectorBag.set(sec, bag);
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
    // Let the UI paint tiles between batches — don't freeze the tab on a 600-name walk.
    await new Promise((r) => setTimeout(r, 0));
  }

  // Sector Leaders — one hit per strong sector, anchored on top peer
  for (const [sector, peers] of sectorBag) {
    if (sector === 'OTHER' || peers.length < 2) continue;
    const avg = peers.reduce((a, p) => a + p.changePercent, 0) / peers.length;
    if (Math.abs(avg) < 0.35) continue;
    const anchor = [...peers].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0];
    if (!anchor.f) continue;
    const hit = scanSectorLeaders(
      { f: anchor.f, timeframe: tf, dataMode, quotePrice: anchor.f.tech.last },
      sector,
      peers.map((p) => ({ symbol: p.symbol, changePercent: p.changePercent })),
      avg,
    );
    if (hit && hit.score >= DEFAULT_OPPORTUNITY_FILTERS.minScore) {
      const candles = anchor.f.candles || [];
      const listed = currentRunStartOfIstDay(
        candles,
        tf,
        (i) => {
          const snap = buildFeatureSnapshot(anchor.symbol, filters.market, tf, candles.slice(0, i + 1));
          if (!snap) return false;
          const walked = scanSectorLeaders(
            { f: snap, timeframe: tf, dataMode, quotePrice: snap.tech.last },
            sector,
            peers.map((p) => ({ symbol: p.symbol, changePercent: p.changePercent })),
            avg,
          );
          return !!walked && walked.score >= DEFAULT_OPPORTUNITY_FILTERS.minScore;
        },
        asOf,
      );
      if (listed) {
        hit.detectedAt = listed;
        emitHit(hit);
      }
    }
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

  const hits = cards.flatMap((c) => c.hits);
  return { cards, hits, dataMode, complete };
}

export { OHLC_SCANNERS };
