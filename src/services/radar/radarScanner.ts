/**
 * Radar scanner orchestration.
 * MarketDataProvider → Technical → Structure → Liquidity → Volume → Setup → Score.
 * Default provider is DEMO / SIMULATED — do not claim live.
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
import type {
  MarketPulseItem,
  RadarResult,
  RadarScanProgress,
  RadarScanRequest,
  RadarBias,
} from './radarTypes';

export type ScanCallbacks = {
  onProgress?: (p: RadarScanProgress) => void;
};

const PHASES = ['UNIVERSE', 'LIQUIDITY', 'STRUCTURE', 'VOLUME', 'MOMENTUM', 'SCORING'] as const;

const MIN_SCORE = 62;
const TOP_N = 5;

function htfFromTrend(t: 'up' | 'down' | 'range'): RadarBias {
  if (t === 'up') return 'bullish';
  if (t === 'down') return 'bearish';
  return 'neutral';
}

export async function fetchMarketPulse(
  provider: MarketDataProvider = mockMarketDataProvider,
): Promise<{
  items: MarketPulseItem[];
  dataMode: 'DEMO';
  providerLabel: string;
}> {
  const symbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];
  const items: MarketPulseItem[] = [];
  for (const symbol of symbols) {
    // Demo pulse: synthetic index-like series from F&O proxies when not in BASE map
    const proxy =
      symbol === 'NIFTY'
        ? 'RELIANCE'
        : symbol === 'BANKNIFTY'
          ? 'HDFCBANK'
          : 'SBIN';
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
    dataMode: 'DEMO',
    providerLabel: provider.label,
  };
}

export async function runRadarScan(
  req: RadarScanRequest,
  callbacks?: ScanCallbacks,
  provider: MarketDataProvider = mockMarketDataProvider,
): Promise<RadarResult[]> {
  const symbols = await provider.getSymbols(req.universe, req.market);
  const total = symbols.length;

  const report = (i: number, phase: string) => {
    callbacks?.onProgress?.({
      status: 'scanning',
      symbolsChecked: Math.min(total, i),
      symbolsTotal: total,
      phase,
      lastScanAt: null,
    });
  };

  report(0, PHASES[0]);
  await new Promise((r) => setTimeout(r, 120));

  const results: RadarResult[] = [];
  const htfTf = req.timeframe === '1D' || req.timeframe === '4h' ? '1D' : '1h';

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const phase =
      i < total * 0.2
        ? 'LIQUIDITY'
        : i < total * 0.45
          ? 'STRUCTURE'
          : i < total * 0.7
            ? 'VOLUME'
            : i < total * 0.9
              ? 'MOMENTUM'
              : 'SCORING';
    report(i + 1, phase);

    const [ltf, htf] = await Promise.all([
      provider.getCandles(symbol, req.timeframe, 80),
      provider.getCandles(symbol, htfTf, 80),
    ]);
    if (ltf.length < 25) continue;

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
    if (!setup) continue;

    const scored = computeWolfScore({ structure, liquidity, volume, tech, setup });
    if (scored.score < MIN_SCORE) continue;

    const quote = await provider.getQuote(symbol);
    results.push({
      id: `radar-${symbol}-${req.timeframe}-${Date.now()}-${i}`,
      symbol,
      exchange: req.market,
      price: quote.price || tech.last,
      timeframe: req.timeframe,
      setupType: setup.setupType,
      direction: setup.direction,
      score: scored.score,
      scoreBreakdown: scored.breakdown,
      status: setup.status,
      confirmations: setup.confirmations,
      structure: setup.structureLabel,
      liquidity: setup.liquidityLabel,
      volume: setup.volumeLabel,
      momentum: setup.momentumLabel,
      htfAlignment: setup.htfAlignment,
      keyLevels: setup.keyLevels,
      invalidation: setup.invalidation,
      explanation: setup.explanation,
      detectedAt: Date.now() - (symbols.length - i) * 12_000,
      dataMode: 'DEMO',
    });

    // Yield so UI stays responsive
    if (i % 3 === 0) await new Promise((r) => setTimeout(r, 40));
  }

  const ranked = results.sort((a, b) => b.score - a.score).slice(0, TOP_N);
  cacheLastResults(ranked);

  callbacks?.onProgress?.({
    status: 'complete',
    symbolsChecked: total,
    symbolsTotal: total,
    phase: 'COMPLETE',
    lastScanAt: Date.now(),
  });

  return ranked;
}
