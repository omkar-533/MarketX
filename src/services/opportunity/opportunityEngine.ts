/**
 * Wolf Opportunity scan orchestrator.
 * One batched candle fetch per symbol group → all OHLC scanners. No fabricated hits.
 */
import type { Candle, RadarUniverse } from '../radar/radarTypes';
import type { MarketDataProvider } from '../radar/MarketDataProvider';
import { mockMarketDataProvider } from '../radar/MockMarketDataProvider';
import { buildFeatureSnapshot } from './featureSnapshot';
import { sectorOf } from './sectorMap';
import {
  OHLC_SCANNERS,
  scanBreakoutRadar,
  scanCompressionBreak,
  scanDeliveryFlow,
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
import { OPPORTUNITY_CARD_POOL, OPPORTUNITY_SCANNERS } from './opportunityTypes';

export type RunOpportunityOptions = {
  signal?: AbortSignal;
  onProgress?: (p: OpportunityScanProgress) => void;
  onCard?: (card: ScannerCardState) => void;
  /** Fired as each opportunity is discovered so UI can append live. */
  onHit?: (hit: OpportunityHit) => void;
  topN?: number;
};

type CandleBatchProvider = MarketDataProvider & {
  getCandlesMany?: (
    symbols: string[],
    timeframe: OpportunityTimeframe,
    bars?: number,
  ) => Promise<Record<string, Candle[]>>;
};

async function loadCandleMap(
  provider: CandleBatchProvider,
  symbols: string[],
  tf: OpportunityTimeframe,
  bars: number,
  signal?: AbortSignal,
): Promise<Record<string, Candle[]>> {
  if (signal?.aborted) return {};
  if (typeof provider.getCandlesMany === 'function') {
    return provider.getCandlesMany(symbols, tf, bars);
  }
  const out: Record<string, Candle[]> = {};
  const conc = provider.isDemo ? 12 : 8;
  for (let i = 0; i < symbols.length; i += conc) {
    if (signal?.aborted) break;
    const slice = symbols.slice(i, i + conc);
    await Promise.all(
      slice.map(async (symbol) => {
        try {
          out[symbol] = await provider.getCandles(symbol, tf, bars);
        } catch {
          out[symbol] = [];
        }
      }),
    );
  }
  return out;
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
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
    out.set(id, filtered);
  }
  return out;
}

export async function runOpportunityScan(
  filters: OpportunityFilters,
  opts: RunOpportunityOptions = {},
  provider: MarketDataProvider = mockMarketDataProvider,
): Promise<{ cards: ScannerCardState[]; hits: OpportunityHit[]; dataMode: 'LIVE' | 'DEMO' }> {
  const topN = opts.topN ?? OPPORTUNITY_CARD_POOL;
  const dataMode: 'LIVE' | 'DEMO' = provider.isDemo ? 'DEMO' : 'LIVE';
  const tf = filters.timeframe as OpportunityTimeframe;
  const buckets = new Map<OpportunityScannerId, OpportunityHit[]>();
  for (const s of OPPORTUNITY_SCANNERS) buckets.set(s.id, []);

  const emitHit = (hit: OpportunityHit | null) => {
    if (!hit) return;
    if (hit.score < filters.minScore) return;
    if (
      filters.direction !== 'all' &&
      hit.direction !== filters.direction &&
      hit.direction !== 'neutral'
    ) {
      return;
    }
    pushHit(buckets, hit);
    opts.onHit?.(hit);
  };

  let symbols: string[] = [];
  try {
    symbols = await provider.getSymbols(toRadarUniverse(filters.universe), filters.market);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load universe';
    opts.onProgress?.({
      status: 'failed',
      symbolsChecked: 0,
      symbolsTotal: 0,
      phase: 'ERROR',
      error: message,
    });
    return { cards: emptyCards(message), hits: [], dataMode };
  }

  if (!symbols.length) {
    return {
      cards: emptyCards('Universe returned no symbols.'),
      hits: [],
      dataMode,
    };
  }

  const FETCH_BATCH = provider.isDemo ? 24 : 32;
  const sectorBag = new Map<string, { symbol: string; changePercent: number; f: ReturnType<typeof buildFeatureSnapshot> }[]>();
  const total = symbols.length;
  let checked = 0;

  opts.onProgress?.({
    status: 'scanning',
    symbolsChecked: 0,
    symbolsTotal: total,
    phase: 'UNIVERSE',
  });

  for (let start = 0; start < symbols.length; start += FETCH_BATCH) {
    if (opts.signal?.aborted) break;
    const batch = symbols.slice(start, start + FETCH_BATCH);
    const candleMap = await loadCandleMap(provider, batch, tf, 80, opts.signal);
    for (const symbol of batch) {
      if (opts.signal?.aborted) break;
      try {
        const candles = candleMap[symbol] || [];
        const f = buildFeatureSnapshot(symbol, filters.market, tf, candles);
        if (!f) continue;

        const quotePrice = f.tech.last;
        const ctx = { f, timeframe: tf, dataMode, quotePrice };
        const sibling: Partial<Record<OpportunityScannerId, number>> = {};

        const runners: Array<[OpportunityScannerId, () => OpportunityHit | null]> = [
          ['momentum_surge', () => scanMomentumSurge(ctx)],
          ['flow_shift', () => scanFlowShift(ctx)],
          ['liquidity_hunt', () => scanLiquidityHunt(ctx)],
          ['compression_break', () => scanCompressionBreak(ctx)],
          ['momentum_fade', () => scanMomentumFade(ctx)],
          ['breakout_radar', () => scanBreakoutRadar(ctx)],
          ['reversal_hunter', () => scanReversalHunter(ctx)],
          ['delivery_flow', () => scanDeliveryFlow(ctx)],
          ['trend_rider', () => scanTrendRider(ctx)],
          ['options_flow', () => scanOptionsFlow(ctx)],
        ];

        for (const [, fn] of runners) {
          const hit = fn();
          if (hit) {
            sibling[hit.scannerId] = hit.score;
            emitHit(hit);
          }
        }

        emitHit(scanWolfPrime(ctx, sibling));

        const sec = sectorOf(symbol);
        const bag = sectorBag.get(sec) || [];
        bag.push({ symbol, changePercent: f.changePercent, f });
        sectorBag.set(sec, bag);
      } catch {
        /* skip symbol */
      } finally {
        checked += 1;
        opts.onProgress?.({
          status: 'scanning',
          symbolsChecked: checked,
          symbolsTotal: total,
          phase: 'EVALUATING',
          currentSymbol: symbol,
        });
      }
    }
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
    emitHit(hit);
  }

  const ranked = rankTrim(buckets, filters.minScore, filters.direction, topN);
  const now = Date.now();
  const cards: ScannerCardState[] = OPPORTUNITY_SCANNERS.map((s) => {
    const hits = ranked.get(s.id) || [];
    return {
      scannerId: s.id,
      title: s.title,
      tagline: s.tagline,
      status: 'ready',
      hits,
      updatedAt: now,
    };
  });

  for (const card of cards) opts.onCard?.(card);

  opts.onProgress?.({
    status: 'complete',
    symbolsChecked: total,
    symbolsTotal: total,
    phase: 'DONE',
  });

  const hits = cards.flatMap((c) => c.hits);
  return { cards, hits, dataMode };
}

export { OHLC_SCANNERS };
