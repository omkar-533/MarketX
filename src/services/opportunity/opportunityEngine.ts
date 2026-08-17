/**
 * Wolf Opportunity scan orchestrator.
 * One batched candle fetch per symbol group → all OHLC scanners. No fabricated hits.
 */
import type { Candle, RadarMarket, RadarUniverse } from '../radar/radarTypes';
import type { MarketDataProvider } from '../radar/MarketDataProvider';
import { mockMarketDataProvider } from '../radar/MockMarketDataProvider';
import { resolveCatalogUniverse } from '../radar/universeCatalog';
import { lastClosedBarCloseMs, sessionBarsNeeded } from '../radar/barTime';
import { OHLC_SCANNERS } from './opportunityScanners';
import {
  evaluateOpportunityFromCandleMap,
  emptyOpportunityCards,
  MIN_SCAN_BARS,
} from './opportunityEvaluate';
import type {
  OpportunityFilters,
  OpportunityHit,
  OpportunityScanProgress,
  OpportunityTimeframe,
  ScannerCardState,
} from './opportunityTypes';

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

function uniqueSortedSymbols(symbols: string[]): string[] {
  return [...new Set(symbols.map((s) => String(s || '').toUpperCase()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
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
  const dataMode: 'LIVE' | 'DEMO' = provider.isDemo ? 'DEMO' : 'LIVE';
  const tf = filters.timeframe as OpportunityTimeframe;
  let asOf = Date.now();
  const failed = (message: string, cards = emptyOpportunityCards(message)) => ({
    cards,
    hits: [] as OpportunityHit[],
    dataMode,
    complete: false,
  });

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

  return evaluateOpportunityFromCandleMap({
    filters,
    symbols,
    asOf,
    dataMode,
    shared,
    opts,
    fetchBatch: FETCH_BATCH,
    candleMapAll,
    loadBatch: candleMapAll
      ? undefined
      : (batch) => loadCandleMap(batchProvider, batch, tf, bars, opts.signal, fresh),
  });
}

export { OHLC_SCANNERS };
