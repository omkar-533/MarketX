import type { HistoricalOIData } from '../data/marketData';
import { estimateOptionPrice } from './optionPricing';
import { getSymbolMeta, type SimLeg } from './optionSimulatorEngine';

export type SymbolKey = string;
import {
  holdingDaysToBars,
  oiBarToHistorical,
  prepareOiSeries,
  type OiBar,
  type OiTimeframeId,
} from './optionOiTimeframe';

export type OiEntrySignal =
  | 'weekly'
  | 'pcr_cross_up'
  | 'pcr_cross_down'
  | 'spot_near_maxpain'
  | 'oi_bullish'
  | 'oi_bearish'
  | 'every_day';

export interface OiBacktestConfig {
  symbol: SymbolKey;
  initialCapital: number;
  holdingDays: number;
  dteAtEntry: number;
  entrySignal: OiEntrySignal;
  pcrThreshold: number;
  maxPainDistancePct: number;
  lookbackDays: number;
  startDate?: string;
  endDate?: string;
  timeframe?: OiTimeframeId;
  useDateRange?: boolean;
  ivBase?: number;
}

export interface OiBacktestTrade {
  id: number;
  entryDate: string;
  exitDate: string;
  entrySpot: number;
  exitSpot: number;
  entryPcr: number;
  exitPcr: number;
  entryMaxPain: number;
  exitMaxPain: number;
  pnl: number;
  pnlPercent: number;
  signal: string;
  daysHeld: number;
  entryOiNote: string;
}

export interface OiBacktestDay {
  date: string;
  time?: string;
  label: string;
  spot: number;
  pcr: number;
  maxPain: number;
  ceOi: number;
  peOi: number;
  portfolioValue: number;
  drawdownPct: number;
  inTrade: boolean;
}

export interface OiBacktestSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgHoldDays: number;
  finalCapital: number;
  bestTrade: number;
  worstTrade: number;
}

export interface OiBacktestResult {
  equityCurve: OiBacktestDay[];
  chartBars: OiBar[];
  trades: OiBacktestTrade[];
  summary: OiBacktestSummary;
  dataRange: { from: string; to: string; days: number; bars: number };
  timeframe: OiTimeframeId;
}

const DEFAULT_CONFIG: OiBacktestConfig = {
  symbol: 'NIFTY',
  initialCapital: 500000,
  holdingDays: 5,
  dteAtEntry: 7,
  entrySignal: 'pcr_cross_up',
  pcrThreshold: 1.05,
  maxPainDistancePct: 0.5,
  lookbackDays: 365 * 2,
  timeframe: '1D',
  useDateRange: false,
  ivBase: 16,
};

function estimateIv(day: HistoricalOIData, baseIv: number): number {
  const pcrSkew = (day.pcr - 1) * 4;
  const volFromRange = Math.abs(day.spotPrice - day.maxPain) / day.spotPrice * 100;
  return Math.max(10, Math.min(40, baseIv + pcrSkew + volFromRange * 0.15));
}

export { estimateOptionPrice } from './optionPricing';

function legTradePnl(
  leg: SimLeg,
  entrySpot: number,
  exitSpot: number,
  entryDte: number,
  exitDte: number,
  entryIv: number,
  exitIv: number,
  contractSize: number,
): number {
  const entryPx = estimateOptionPrice(entrySpot, leg.strike, leg.type, entryDte, entryIv);
  const exitPx = estimateOptionPrice(exitSpot, leg.strike, leg.type, exitDte, exitIv);
  const diff = exitPx - entryPx;
  const mult = leg.quantity * contractSize;
  return leg.action === 'BUY' ? diff * mult : -diff * mult;
}

function checkEntrySignal(
  signal: OiEntrySignal,
  day: HistoricalOIData,
  prev: HistoricalOIData | null,
  idx: number,
  config: OiBacktestConfig,
): { enter: boolean; label: string } {
  const distFromMaxPain = ((day.spotPrice - day.maxPain) / day.maxPain) * 100;

  switch (signal) {
    case 'every_day':
      return { enter: true, label: 'Daily entry' };
    case 'weekly':
      return { enter: idx % 5 === 0, label: 'Weekly (5D)' };
    case 'pcr_cross_up':
      if (!prev) return { enter: false, label: '' };
      return {
        enter: prev.pcr < config.pcrThreshold && day.pcr >= config.pcrThreshold,
        label: `PCR cross ↑ ${day.pcr.toFixed(2)}`,
      };
    case 'pcr_cross_down':
      if (!prev) return { enter: false, label: '' };
      return {
        enter: prev.pcr > config.pcrThreshold && day.pcr <= config.pcrThreshold,
        label: `PCR cross ↓ ${day.pcr.toFixed(2)}`,
      };
    case 'spot_near_maxpain':
      return {
        enter: Math.abs(distFromMaxPain) <= config.maxPainDistancePct,
        label: `Near max pain (${distFromMaxPain.toFixed(2)}%)`,
      };
    case 'oi_bullish': {
      if (!prev) return { enter: false, label: '' };
      const pcrRising = day.pcr > prev.pcr;
      const spotUp = day.spotPrice > prev.spotPrice;
      const peOiBuild = day.totalPE_OI > prev.totalPE_OI;
      return {
        enter: pcrRising && spotUp && peOiBuild,
        label: 'OI Bullish (PCR↑ Spot↑ PE OI↑)',
      };
    }
    case 'oi_bearish': {
      if (!prev) return { enter: false, label: '' };
      const pcrFall = day.pcr < prev.pcr;
      const spotDown = day.spotPrice < prev.spotPrice;
      const ceOiBuild = day.totalCE_OI > prev.totalCE_OI;
      return {
        enter: pcrFall && spotDown && ceOiBuild,
        label: 'OI Bearish (PCR↓ Spot↓ CE OI↑)',
      };
    }
    default:
      return { enter: false, label: '' };
  }
}

export function runOiStrategyBacktest(
  legs: SimLeg[],
  partialConfig: Partial<OiBacktestConfig> = {},
): OiBacktestResult | { error: string } {
  if (!legs.length) {
    return { error: 'Add at least one strategy leg before backtesting' };
  }

  const config: OiBacktestConfig = { ...DEFAULT_CONFIG, ...partialConfig };
  const meta = getSymbolMeta(config.symbol);
  const contractSize = meta.lotSize;
  const ivBase = config.ivBase ?? meta.ivBase;
  const timeframe = config.timeframe ?? '1D';

  const { bars: chartBars, daily } = prepareOiSeries(
    config.symbol,
    timeframe,
    config.useDateRange ? config.startDate : undefined,
    config.useDateRange ? config.endDate : undefined,
    config.useDateRange ? 0 : config.lookbackDays,
  );

  const history = chartBars.map(oiBarToHistorical);
  const holdingBars = holdingDaysToBars(config.holdingDays, timeframe);

  if (history.length < holdingBars + 5) {
    return { error: 'Not enough historical OI data for selected period & timeframe' };
  }

  const trades: OiBacktestTrade[] = [];
  const equityCurve: OiBacktestDay[] = [];
  let capital = config.initialCapital;
  let peakCapital = capital;
  let inTrade = false;
  let entryIdx = 0;

  for (let i = 0; i < history.length; i++) {
    const day = history[i];
    const prev = i > 0 ? history[i - 1] : null;

    if (!inTrade) {
      const { enter, label } = checkEntrySignal(config.entrySignal, day, prev, i, config);
      if (enter) {
        inTrade = true;
        entryIdx = i;
        (day as HistoricalOIData & { _pendingSignal?: string })._pendingSignal = label;
      }
    } else if (i - entryIdx >= holdingBars || i === history.length - 1) {
      const entryDay = history[entryIdx];
      const entryIv = estimateIv(entryDay, ivBase);
      const exitIv = estimateIv(day, ivBase);
      const exitDte = Math.max(0, config.dteAtEntry - (i - entryIdx));

      let tradePnl = 0;
      legs.forEach((leg) => {
        tradePnl += legTradePnl(
          leg,
          entryDay.spotPrice,
          day.spotPrice,
          config.dteAtEntry,
          exitDte,
          entryIv,
          exitIv,
          contractSize,
        );
      });

      capital += tradePnl;
      const pendingSignal = (entryDay as HistoricalOIData & { _pendingSignal?: string })._pendingSignal ?? config.entrySignal;

      const entryLabel = chartBars[entryIdx]?.label ?? entryDay.date;
      const exitLabel = chartBars[i]?.label ?? day.date;

      trades.push({
        id: trades.length + 1,
        entryDate: entryLabel,
        exitDate: exitLabel,
        entrySpot: entryDay.spotPrice,
        exitSpot: day.spotPrice,
        entryPcr: entryDay.pcr,
        exitPcr: day.pcr,
        entryMaxPain: entryDay.maxPain,
        exitMaxPain: day.maxPain,
        pnl: Math.round(tradePnl),
        pnlPercent: Math.round((tradePnl / config.initialCapital) * 10000) / 100,
        signal: pendingSignal,
        daysHeld: i - entryIdx,
        entryOiNote: `CE OI ${(entryDay.totalCE_OI / 1e5).toFixed(1)}L · PE OI ${(entryDay.totalPE_OI / 1e5).toFixed(1)}L`,
      });

      inTrade = false;
    }

    if (capital > peakCapital) peakCapital = capital;
    const drawdownPct = peakCapital > 0 ? ((peakCapital - capital) / peakCapital) * 100 : 0;

    const bar = chartBars[i];
    equityCurve.push({
      date: day.date,
      time: bar?.time,
      label: bar?.label ?? day.date,
      spot: day.spotPrice,
      pcr: day.pcr,
      maxPain: day.maxPain,
      ceOi: day.totalCE_OI,
      peOi: day.totalPE_OI,
      portfolioValue: Math.round(capital),
      drawdownPct: Math.round(drawdownPct * 100) / 100,
      inTrade,
    });
  }

  const winningTrades = trades.filter((t) => t.pnl > 0);
  const losingTrades = trades.filter((t) => t.pnl <= 0);
  const grossProfit = winningTrades.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0));
  const totalPnl = capital - config.initialCapital;

  const summary: OiBacktestSummary = {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: trades.length ? Math.round((winningTrades.length / trades.length) * 1000) / 10 : 0,
    totalPnl: Math.round(totalPnl),
    totalReturnPct: Math.round((totalPnl / config.initialCapital) * 10000) / 100,
    maxDrawdownPct: Math.max(...equityCurve.map((d) => d.drawdownPct), 0),
    profitFactor: grossLoss === 0 ? grossProfit : Math.round((grossProfit / grossLoss) * 100) / 100,
    avgWin: winningTrades.length ? Math.round(grossProfit / winningTrades.length) : 0,
    avgLoss: losingTrades.length ? Math.round(grossLoss / losingTrades.length) : 0,
    avgHoldDays: trades.length ? Math.round(trades.reduce((s, t) => s + t.daysHeld, 0) / trades.length) : 0,
    finalCapital: Math.round(capital),
    bestTrade: trades.length ? Math.max(...trades.map((t) => t.pnl)) : 0,
    worstTrade: trades.length ? Math.min(...trades.map((t) => t.pnl)) : 0,
  };

  return {
    equityCurve,
    chartBars,
    trades,
    summary,
    timeframe,
    dataRange: {
      from: chartBars[0]?.date ?? history[0].date,
      to: chartBars[chartBars.length - 1]?.date ?? history[history.length - 1].date,
      days: daily.length,
      bars: chartBars.length,
    },
  };
}

export { prepareOiSeries, downsampleChartBars, OI_TIMEFRAMES, getOiDateBounds } from './optionOiTimeframe';
export type { OiBar, OiTimeframeId } from './optionOiTimeframe';

export const OI_ENTRY_SIGNALS: { id: OiEntrySignal; label: string; desc: string }[] = [
  { id: 'pcr_cross_up', label: 'PCR Cross Above', desc: 'Put-heavy OI buildup — bullish hedge unwind setup' },
  { id: 'pcr_cross_down', label: 'PCR Cross Below', desc: 'Call-heavy OI — bearish / resistance build' },
  { id: 'oi_bullish', label: 'OI Bullish', desc: 'PCR↑ + Spot↑ + PE OI buildup' },
  { id: 'oi_bearish', label: 'OI Bearish', desc: 'PCR↓ + Spot↓ + CE OI buildup' },
  { id: 'spot_near_maxpain', label: 'Spot Near Max Pain', desc: 'Enter when spot within % of max pain' },
  { id: 'weekly', label: 'Weekly Roll', desc: 'Enter every 5 trading days' },
  { id: 'every_day', label: 'Daily (stress test)', desc: 'Enter each session — high trade count' },
];

export const BACKTEST_LOOKBACK_OPTIONS = [
  { days: 90, label: '3 Months' },
  { days: 180, label: '6 Months' },
  { days: 365, label: '1 Year' },
  { days: 365 * 2, label: '2 Years' },
  { days: 365 * 5, label: '5 Years (full OI)' },
];
