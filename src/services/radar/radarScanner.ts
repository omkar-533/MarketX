/**
 * Radar scanner — FULL selected universe is evaluated.
 * TOP_N / displayLimit only slices RESULTS after ranking — never the scan set.
 */
import type { MarketDataProvider } from './MarketDataProvider';
import { mockMarketDataProvider } from './MockMarketDataProvider';
import { analyzeTechnical, atr, trendDirection, volumeRatio } from './TechnicalEngine';
import { detectStructure } from './StructureEngine';
import { detectLiquidity } from './LiquidityEngine';
import { detectVolume } from './VolumeEngine';
import { classifySetup, buildWatchSetup } from './SetupEngine';
import { computeWolfScore } from './WolfScoringEngine';
import { cacheLastResults } from './radarStore';
import { firstHitTimeOfIstDay, sessionBarsNeeded, setupCreatedAtFromCandles } from './barTime';
import { evaluateStrategy } from '../strategy/conditionEvaluator';
import type { StrategyDefinition } from '../strategy/strategyTypes';
import type {
  Candle,
  MarketPulseItem,
  RadarBias,
  RadarResult,
  RadarScanIssue,
  RadarScanOutcome,
  RadarScanProgress,
  RadarScanRequest,
  RadarScanSummary,
  RadarTimeframe,
} from './radarTypes';

export type ScanActivityRow = {
  symbol: string;
  status: 'MATCHED' | 'NO_MATCH' | 'DATA_UNAVAILABLE' | 'ERROR';
  reason?: string;
  score?: number;
  at: number;
};

export type ScanCallbacks = {
  onProgress?: (p: RadarScanProgress) => void;
  /** Fired immediately when a symbol matches — do not wait for scan end. */
  onMatch?: (result: RadarResult) => void;
  /** Recent evaluate outcomes for Scan Activity transparency. */
  onActivity?: (row: ScanActivityRow) => void;
};

export type RunRadarScanOptions = ScanCallbacks & {
  strategy?: StrategyDefinition | null;
  displayLimit?: number;
  /** Cancel mid-scan; partial matches remain with the caller. */
  signal?: AbortSignal;
};

const MIN_SCORE = 62;
/** Display only — full universe still scanned */
export const DEFAULT_DISPLAY_LIMIT = 20;

type CandleBatchProvider = MarketDataProvider & {
  getCandlesMany?: (
    symbols: string[],
    timeframe: RadarTimeframe,
    bars?: number,
  ) => Promise<Record<string, Candle[]>>;
};

async function loadCandleMap(
  provider: CandleBatchProvider,
  symbols: string[],
  timeframe: RadarTimeframe,
  bars: number,
  signal?: AbortSignal,
): Promise<Record<string, Candle[]>> {
  if (signal?.aborted) return {};
  if (typeof provider.getCandlesMany === 'function') {
    return provider.getCandlesMany(symbols, timeframe, bars);
  }
  const out: Record<string, Candle[]> = {};
  const conc = provider.isDemo ? 12 : 8;
  for (let i = 0; i < symbols.length; i += conc) {
    if (signal?.aborted) break;
    const slice = symbols.slice(i, i + conc);
    await Promise.all(
      slice.map(async (symbol) => {
        try {
          out[symbol] = await provider.getCandles(symbol, timeframe, bars);
        } catch {
          out[symbol] = [];
        }
      }),
    );
  }
  return out;
}

async function loadLtfHtf(
  provider: CandleBatchProvider,
  symbols: string[],
  ltf: RadarTimeframe,
  htf: RadarTimeframe,
  signal?: AbortSignal,
): Promise<{ ltfMap: Record<string, Candle[]>; htfMap: Record<string, Candle[]> }> {
  const ltfBars = sessionBarsNeeded(ltf);
  const htfBars = sessionBarsNeeded(htf);
  if (ltf === htf) {
    const ltfMap = await loadCandleMap(provider, symbols, ltf, ltfBars, signal);
    return { ltfMap, htfMap: ltfMap };
  }
  const [ltfMap, htfMap] = await Promise.all([
    loadCandleMap(provider, symbols, ltf, ltfBars, signal),
    loadCandleMap(provider, symbols, htf, htfBars, signal),
  ]);
  return { ltfMap, htfMap };
}

function htfFromTrend(t: 'up' | 'down' | 'range'): RadarBias {
  if (t === 'up') return 'bullish';
  if (t === 'down') return 'bearish';
  return 'neutral';
}

export async function fetchMarketPulse(
  provider: MarketDataProvider = mockMarketDataProvider,
): Promise<{
  items: MarketPulseItem[];
  dataMode: 'DEMO' | 'LIVE';
  providerLabel: string;
}> {
  const symbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];
  const items: MarketPulseItem[] = [];

  for (const symbol of symbols) {
    // Prefer real index candles. Never substitute equity proxies for MARKET CONTEXT —
    // that produced misleading index cards labeled as NIFTY while using Reliance bars.
    const aliases =
      symbol === 'NIFTY' ? ['NIFTY', 'NIFTY50'] : symbol === 'BANKNIFTY' ? ['BANKNIFTY'] : ['FINNIFTY'];
    let candles: Awaited<ReturnType<MarketDataProvider['getCandles']>> = [];
    let sourceTf: '15m' | '1h' | '1D' = '15m';
    for (const alias of aliases) {
      for (const tf of ['15m', '1h', '1D'] as const) {
        const chunk = await provider.getCandles(alias, tf, tf === '1D' ? 60 : 120);
        if (chunk.length >= 25) {
          candles = chunk;
          sourceTf = tf;
          break;
        }
      }
      if (candles.length >= 25) break;
    }

    if (candles.length < 25) {
      items.push({
        symbol,
        direction: 'neutral',
        strength: null,
        trendState: 'Unavailable',
        structure: '—',
        momentum: '—',
        relativeVolume: null,
        regime: 'UNKNOWN',
        note: 'Index history unavailable (needs NIDX candles). Reconnect market data after API deploy.',
      });
      continue;
    }

    const structureTf = sourceTf === '1D' ? '1D' : sourceTf === '1h' ? '1h' : '15m';
    const trend = trendDirection(candles);
    const tech = analyzeTechnical(candles);
    const structure = detectStructure(candles, structureTf);
    const volRatio = volumeRatio(candles, 20);
    const atrVal = atr(candles, 14);
    const last = candles[candles.length - 1];
    const atrPct = atrVal && last.close > 0 ? (atrVal / last.close) * 100 : null;

    let momentum = 'NEUTRAL';
    if (tech.rsi14 != null) {
      if (tech.rsi14 >= 60) momentum = 'STRONG';
      else if (tech.rsi14 <= 40) momentum = 'WEAK';
      else momentum = 'MODERATE';
    }

    let regime = 'RANGE';
    if (trend !== 'range' && (volRatio == null || volRatio >= 0.85)) {
      regime = atrPct != null && atrPct >= 1.2 ? 'HIGH VOLATILITY TREND' : 'TRENDING';
    } else if (atrPct != null && atrPct >= 1.4) {
      regime = 'HIGH VOLATILITY';
    } else if (trend === 'range') {
      regime = 'RANGE';
    }

    const structureLabel =
      structure.direction === 'bullish'
        ? 'BULLISH'
        : structure.direction === 'bearish'
          ? 'BEARISH'
          : 'NEUTRAL';

    items.push({
      symbol,
      direction: htfFromTrend(trend),
      strength: null, // no fake midpoint score
      trendState: trend === 'up' ? 'BULLISH' : trend === 'down' ? 'BEARISH' : 'RANGE',
      structure: structureLabel,
      momentum,
      relativeVolume: volRatio != null ? Math.round(volRatio * 100) / 100 : null,
      regime,
      note: sourceTf !== '15m' ? `Using ${sourceTf.toUpperCase()} index bars` : undefined,
    });
  }

  return {
    items,
    dataMode: provider.isDemo ? 'DEMO' : 'LIVE',
    providerLabel: provider.label,
  };
}

function countStatuses(rows: RadarResult[]) {
  let developing = 0;
  let watch = 0;
  let confirmed = 0;
  for (const r of rows) {
    if (r.status === 'SETUP DEVELOPING') developing += 1;
    else if (r.status === 'SETUP CONFIRMED' || r.status === 'CONFIRMATION PENDING') confirmed += 1;
    else watch += 1;
  }
  return { developing, watch, confirmed };
}

/**
 * Full-universe scan. Returns ALL matches + display slice + summary.
 * Never truncates the symbol list before evaluation.
 */
export async function runRadarScan(
  req: RadarScanRequest,
  callbacksOrOpts?: ScanCallbacks | RunRadarScanOptions,
  provider: MarketDataProvider = mockMarketDataProvider,
): Promise<RadarResult[]> {
  const outcome = await runRadarScanFull(req, callbacksOrOpts, provider);
  return outcome.results;
}

export async function runRadarScanFull(
  req: RadarScanRequest,
  callbacksOrOpts?: ScanCallbacks | RunRadarScanOptions,
  provider: MarketDataProvider = mockMarketDataProvider,
): Promise<RadarScanOutcome> {
  const opts: RunRadarScanOptions = (callbacksOrOpts as RunRadarScanOptions) || {};
  const strategy = opts.strategy ?? null;
  const displayLimit = Math.max(
    1,
    opts.displayLimit ?? req.displayLimit ?? DEFAULT_DISPLAY_LIMIT,
  );
  const signal = opts.signal;

  const FETCH_BATCH = provider.isDemo ? 24 : 40;
  const started = Date.now();
  const batchProvider = provider as CandleBatchProvider;

  let symbols: string[] = [];
  try {
    symbols = await provider.getSymbols(req.universe, req.market);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load universe symbols';
    opts.onProgress?.({
      status: 'failed',
      symbolsChecked: 0,
      symbolsTotal: 0,
      phase: 'ERROR',
      lastScanAt: null,
      error: message,
    });
    throw new Error(message);
  }
  const total = symbols.length;
  let matchedSoFar = 0;
  let noMatchSoFar = 0;
  let unavailableSoFar = 0;
  let errorsSoFar = 0;
  const matches: RadarResult[] = [];
  const issues: RadarScanIssue[] = [];

  const liveMeta =
    !provider.isDemo && 'lastUniverseMeta' in provider
      ? (provider as { lastUniverseMeta?: { universeLoaded: number; dataAvailable: number } | null })
          .lastUniverseMeta
      : null;
  const catalogSize = liveMeta?.universeLoaded ?? total;
  const preUnavailable = Math.max(0, catalogSize - total);
  if (preUnavailable > 0) {
    unavailableSoFar = preUnavailable;
    issues.push({
      symbol: '—',
      reason: `${preUnavailable} symbols in catalog lack a resolvable scrip (reconnect INDstocks to refresh instrument master)`,
    });
  }

  const report = (i: number, phase: string, currentSymbol?: string | null) => {
    opts.onProgress?.({
      status: signal?.aborted ? 'complete' : 'scanning',
      symbolsChecked: Math.min(total, i),
      symbolsTotal: total,
      phase: signal?.aborted ? 'STOPPED' : phase,
      lastScanAt: null,
      currentSymbol: currentSymbol ?? null,
      matchedSoFar,
      noMatchSoFar,
      unavailableSoFar,
      errorsSoFar,
    });
  };

  const pushMatch = (row: RadarResult) => {
    matches.push(row);
    matchedSoFar += 1;
    opts.onMatch?.(row);
    opts.onActivity?.({
      symbol: row.symbol,
      status: 'MATCHED',
      score: row.score,
      at: Date.now(),
    });
  };

  report(0, 'UNIVERSE');

  const htfTf: RadarTimeframe = req.timeframe === '1D' || req.timeframe === '4h' ? '1D' : '1h';

  let pendingPair: Promise<{ ltfMap: Record<string, Candle[]>; htfMap: Record<string, Candle[]> }> | null =
    symbols.length
      ? loadLtfHtf(batchProvider, symbols.slice(0, FETCH_BATCH), req.timeframe, htfTf, signal)
      : null;

  for (let start = 0; start < symbols.length; start += FETCH_BATCH) {
    if (signal?.aborted) break;
    const batch = symbols.slice(start, start + FETCH_BATCH);
    const nextBatch =
      start + FETCH_BATCH < symbols.length
        ? symbols.slice(start + FETCH_BATCH, start + FETCH_BATCH * 2)
        : null;
    const { ltfMap, htfMap } = pendingPair
      ? await pendingPair
      : await loadLtfHtf(batchProvider, batch, req.timeframe, htfTf, signal);
    pendingPair = nextBatch
      ? loadLtfHtf(batchProvider, nextBatch, req.timeframe, htfTf, signal)
      : null;

    for (let bi = 0; bi < batch.length; bi += 1) {
      if (signal?.aborted) break;
      const symbol = batch[bi];
      const i = start + bi;
      report(i, 'EVALUATING', symbol);
      try {
        const ltf = ltfMap[symbol] || ltfMap[String(symbol).toUpperCase()] || [];
        const htf = htfMap[symbol] || htfMap[String(symbol).toUpperCase()] || ltf;
        if (ltf.length < 25) {
          unavailableSoFar += 1;
          issues.push({ symbol, reason: 'Insufficient historical candles' });
          opts.onActivity?.({
            symbol,
            status: 'DATA_UNAVAILABLE',
            reason: 'Insufficient historical candles',
            at: Date.now(),
          });
          continue;
        }

        const tech = analyzeTechnical(ltf);
        const structure = detectStructure(ltf, req.timeframe);
        const liquidity = detectLiquidity(ltf, req.timeframe);
        const volume = detectVolume(ltf);
        const htfTrend = trendDirection(htf);
        const classified = classifySetup({
          timeframe: req.timeframe,
          tech,
          structure,
          liquidity,
          volume,
          htfTrend,
        });
        const setup =
          classified ||
          buildWatchSetup({
            timeframe: req.timeframe,
            tech,
            structure,
            liquidity,
            volume,
            htfTrend,
          });
        const scored = computeWolfScore({ structure, liquidity, volume, tech, setup });
        const quotePrice = tech.last;

        const row: RadarResult = {
          id: `radar-${symbol}-${req.timeframe}`,
          symbol,
          exchange: req.market,
          price: quotePrice,
          timeframe: req.timeframe,
          setupType: setup.setupType,
          direction: setup.direction,
          score: scored.score,
          scoreBreakdown: scored.breakdown,
          status: setup.status,
          confirmations: setup.confirmations,
          structure: setup.structureLabel || structure.note || '—',
          liquidity: setup.liquidityLabel || liquidity.note || '—',
          volume: setup.volumeLabel || volume.note || '—',
          momentum: setup.momentumLabel || '—',
          htfAlignment: setup.htfAlignment,
          keyLevels: setup.keyLevels,
          invalidation: setup.invalidation,
          explanation: setup.explanation,
          detectedAt: 0,
          dataMode: provider.isDemo ? 'DEMO' : 'LIVE',
        };

        const stampFirstSeen = () => {
          if (!classified) {
            row.detectedAt = setupCreatedAtFromCandles(ltf, req.timeframe);
            return;
          }
          row.detectedAt = firstHitTimeOfIstDay(ltf, req.timeframe, (idx) => {
            if (idx < 24) return false;
            const bars = ltf.slice(0, idx + 1);
            const t = analyzeTechnical(bars);
            const st = detectStructure(bars, req.timeframe);
            const liq = detectLiquidity(bars, req.timeframe);
            const vol = detectVolume(bars);
            const c = classifySetup({
              timeframe: req.timeframe,
              tech: t,
              structure: st,
              liquidity: liq,
              volume: vol,
              htfTrend,
            });
            if (!c) return false;
            return c.setupType === setup.setupType && c.direction === setup.direction;
          });
        };

        if (strategy) {
          const reportMatch = evaluateStrategy(strategy, row);
          if (!reportMatch.ok) {
            noMatchSoFar += 1;
            opts.onActivity?.({
              symbol,
              status: 'NO_MATCH',
              reason: 'Strategy conditions not met',
              at: Date.now(),
            });
            continue;
          }
          row.matchedConditions = reportMatch.matched;
          row.strategyId = strategy.id;
          row.strategyName = strategy.name;
          stampFirstSeen();
          pushMatch(row);
          continue;
        }

        if (!classified || scored.score < MIN_SCORE) {
          noMatchSoFar += 1;
          opts.onActivity?.({
            symbol,
            status: 'NO_MATCH',
            reason: !classified ? 'No setup classified' : `Score ${scored.score} < ${MIN_SCORE}`,
            score: scored.score,
            at: Date.now(),
          });
          continue;
        }
        stampFirstSeen();
        pushMatch(row);
      } catch (err) {
        errorsSoFar += 1;
        const reason = err instanceof Error ? err.message : 'Evaluation error';
        issues.push({ symbol, reason });
        opts.onActivity?.({ symbol, status: 'ERROR', reason, at: Date.now() });
      }
    }
    report(Math.min(total, start + batch.length), 'BATCH', batch[batch.length - 1]);
    await new Promise((r) => setTimeout(r, 0));
  }

  const ranked = matches.sort((a, b) => b.score - a.score);
  const displayed = ranked.slice(0, displayLimit);
  cacheLastResults(displayed);

  const statusCounts = countStatuses(ranked);
  const stopped = Boolean(signal?.aborted);
  const summary: RadarScanSummary = {
    universe: req.universe,
    universeLoaded: catalogSize,
    scanned: stopped
      ? Math.min(
          total,
          matchedSoFar + noMatchSoFar + Math.max(0, unavailableSoFar - preUnavailable) + errorsSoFar,
        )
      : total,
    matched: ranked.length,
    unavailable: unavailableSoFar,
    errors: errorsSoFar,
    developing: statusCounts.developing,
    watch: statusCounts.watch,
    confirmed: statusCounts.confirmed,
    durationMs: Date.now() - started,
    displayLimit,
    displayed: displayed.length,
  };

  opts.onProgress?.({
    status: 'complete',
    symbolsChecked: summary.scanned,
    symbolsTotal: total,
    phase: stopped ? 'STOPPED' : 'COMPLETE',
    lastScanAt: Date.now(),
    currentSymbol: null,
    matchedSoFar: ranked.length,
    noMatchSoFar,
    unavailableSoFar,
    errorsSoFar,
  });

  console.info(
    `[WOLF Radar] SCAN ${stopped ? 'STOPPED' : 'COMPLETE'} universe=${req.universe} loaded=${total} scanned=${summary.scanned} matched=${ranked.length} displayed=${displayed.length} unavailable=${unavailableSoFar} errors=${errorsSoFar} ms=${summary.durationMs}`,
  );

  return { results: displayed, allMatches: ranked, summary, issues };
}
