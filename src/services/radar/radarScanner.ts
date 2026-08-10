/**
 * Radar scanner — FULL selected universe is evaluated.
 * TOP_N / displayLimit only slices RESULTS after ranking — never the scan set.
 */
import type { MarketDataProvider } from './MarketDataProvider';
import { mockMarketDataProvider } from './MockMarketDataProvider';
import { analyzeTechnical, trendDirection } from './TechnicalEngine';
import { detectStructure } from './StructureEngine';
import { detectLiquidity } from './LiquidityEngine';
import { detectVolume } from './VolumeEngine';
import { classifySetup } from './SetupEngine';
import { computeWolfScore } from './WolfScoringEngine';
import { cacheLastResults } from './radarStore';
import { evaluateStrategy } from '../strategy/conditionEvaluator';
import type { StrategyDefinition } from '../strategy/strategyTypes';
import type {
  MarketPulseItem,
  RadarBias,
  RadarResult,
  RadarScanIssue,
  RadarScanOutcome,
  RadarScanProgress,
  RadarScanRequest,
  RadarScanSummary,
  ScoreBreakdown,
} from './radarTypes';

export type ScanCallbacks = {
  onProgress?: (p: RadarScanProgress) => void;
};

export type RunRadarScanOptions = ScanCallbacks & {
  strategy?: StrategyDefinition | null;
  displayLimit?: number;
};

const MIN_SCORE = 62;
/** Display only — full universe still scanned */
export const DEFAULT_DISPLAY_LIMIT = 20;

const EMPTY_BREAKDOWN: ScoreBreakdown = {
  structure: 0,
  liquidity: 0,
  volume: 0,
  momentum: 0,
  htfAlignment: 0,
  volatility: 0,
  setupQuality: 0,
};

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
    const proxy =
      symbol === 'NIFTY' ? 'RELIANCE' : symbol === 'BANKNIFTY' ? 'HDFCBANK' : 'SBIN';
    const candles = await provider.getCandles(proxy, '15m', 60);
    const trend = trendDirection(candles);
    const tech = analyzeTechnical(candles);
    const strength = Math.round(
      Math.min(
        95,
        Math.max(
          35,
          50 +
            (trend === 'up' ? 20 : trend === 'down' ? -10 : 0) +
            ((tech.rsi14 ?? 50) - 50),
        ),
      ),
    );
    items.push({
      symbol,
      direction: htfFromTrend(trend),
      strength,
      trendState: trend === 'up' ? 'Uptrend' : trend === 'down' ? 'Downtrend' : 'Range',
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
  const opts: RunRadarScanOptions =
    callbacksOrOpts && 'onProgress' in (callbacksOrOpts as object) && !('strategy' in (callbacksOrOpts as object))
      ? { onProgress: (callbacksOrOpts as ScanCallbacks).onProgress }
      : ((callbacksOrOpts as RunRadarScanOptions) || {});

  const strategy = opts.strategy ?? null;
  const displayLimit = Math.max(
    1,
    opts.displayLimit ?? req.displayLimit ?? DEFAULT_DISPLAY_LIMIT,
  );

  // Process entire universe — batched concurrency for data fetch only
  const CONCURRENCY = provider.isDemo ? 8 : 1;
  const started = Date.now();

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
      status: 'scanning',
      symbolsChecked: Math.min(total, i),
      symbolsTotal: total,
      phase,
      lastScanAt: null,
      currentSymbol: currentSymbol ?? null,
      matchedSoFar,
      noMatchSoFar,
      unavailableSoFar,
      errorsSoFar,
    });
  };

  report(0, 'UNIVERSE');
  await new Promise((r) => setTimeout(r, 40));

  const htfTf = req.timeframe === '1D' || req.timeframe === '4h' ? '1D' : '1h';

  for (let start = 0; start < symbols.length; start += CONCURRENCY) {
    const batch = symbols.slice(start, start + CONCURRENCY);
    await Promise.all(
      batch.map(async (symbol, bi) => {
        const i = start + bi;
        report(i, 'EVALUATING', symbol);
        try {
          const [ltf, htf] = await Promise.all([
            provider.getCandles(symbol, req.timeframe, 80),
            provider.getCandles(symbol, htfTf, 80),
          ]);
          if (ltf.length < 25) {
            unavailableSoFar += 1;
            issues.push({ symbol, reason: 'Insufficient historical candles' });
            return;
          }

          const tech = analyzeTechnical(ltf);
          const structure = detectStructure(ltf, req.timeframe);
          const liquidity = detectLiquidity(ltf, req.timeframe);
          const volume = detectVolume(ltf);
          const htfTrend = trendDirection(htf);
          const setup = classifySetup({
            timeframe: req.timeframe,
            tech,
            structure,
            liquidity,
            volume,
            htfTrend,
          });

          const scored = setup
            ? computeWolfScore({ structure, liquidity, volume, tech, setup })
            : { score: 0, breakdown: EMPTY_BREAKDOWN };

          let quotePrice = tech.last;
          try {
            const quote = await provider.getQuote(symbol);
            quotePrice = quote.price || tech.last;
          } catch {
            /* quote optional */
          }

          const row: RadarResult = {
            id: `radar-${symbol}-${req.timeframe}-${Date.now()}-${i}`,
            symbol,
            exchange: req.market,
            price: quotePrice,
            timeframe: req.timeframe,
            setupType: setup?.setupType || 'Trend Continuation',
            direction: setup?.direction || htfFromTrend(htfTrend),
            score: scored.score,
            scoreBreakdown: scored.breakdown,
            status: setup?.status || 'WATCH',
            confirmations: setup?.confirmations || [],
            structure: setup?.structureLabel || structure.note || '—',
            liquidity: setup?.liquidityLabel || liquidity.note || '—',
            volume: setup?.volumeLabel || volume.note || '—',
            momentum: setup?.momentumLabel || '—',
            htfAlignment: setup?.htfAlignment ?? htfTrend !== 'range',
            keyLevels: setup?.keyLevels || [],
            invalidation: setup?.invalidation || '—',
            explanation: setup?.explanation || 'Evaluated against scan engines / strategy.',
            detectedAt: Date.now(),
            dataMode: provider.isDemo ? 'DEMO' : 'LIVE',
          };

          if (strategy) {
            const reportMatch = evaluateStrategy(strategy, row);
            if (!reportMatch.ok) {
              noMatchSoFar += 1;
              return;
            }
            row.matchedConditions = reportMatch.matched;
            row.strategyId = strategy.id;
            row.strategyName = strategy.name;
            matches.push(row);
            matchedSoFar += 1;
            return;
          }

          if (!setup || scored.score < MIN_SCORE) {
            noMatchSoFar += 1;
            return;
          }
          matches.push(row);
          matchedSoFar += 1;
        } catch (err) {
          errorsSoFar += 1;
          issues.push({
            symbol,
            reason: err instanceof Error ? err.message : 'Evaluation error',
          });
        }
      }),
    );
    report(Math.min(total, start + batch.length), 'BATCH', batch[batch.length - 1]);
    // Yield between batches so UI can paint + respect LIVE rate limits
    await new Promise((r) => setTimeout(r, provider.isDemo ? 8 : 120));
  }

  const ranked = matches.sort((a, b) => b.score - a.score);
  const displayed = ranked.slice(0, displayLimit);
  cacheLastResults(displayed);

  const statusCounts = countStatuses(ranked);
  const summary: RadarScanSummary = {
    universe: req.universe,
    universeLoaded: catalogSize,
    scanned: total,
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
    symbolsChecked: total,
    symbolsTotal: total,
    phase: 'COMPLETE',
    lastScanAt: Date.now(),
    currentSymbol: null,
    matchedSoFar: ranked.length,
    noMatchSoFar,
    unavailableSoFar,
    errorsSoFar,
  });

  console.info(
    `[WOLF Radar] SCAN COMPLETE universe=${req.universe} loaded=${total} scanned=${total} matched=${ranked.length} displayed=${displayed.length} unavailable=${unavailableSoFar} errors=${errorsSoFar} ms=${summary.durationMs}`,
  );

  return { results: displayed, allMatches: ranked, summary, issues };
}
