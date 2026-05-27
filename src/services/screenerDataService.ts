import type { StockData } from '../data/marketData';
import { getSegmentFlags, loadExpandedStocks } from './screenerUniverse';
import { getRollingHigh, getRollingLow } from './screenerHistory';
import type { ComputedTechnicals } from './screenerIndicators';
import {
  getCachedScreenerRows,
  getScreenerFeedStatus,
  refreshScreenerFeedAsync,
} from './screenerLiveService';

export type ScreenerSignal = 'BUY' | 'SELL' | 'NEUTRAL';

export interface ScreenerMarketRow {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  close: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  rsi: number;
  rsi14: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  vwap: number;
  ema9: number;
  ema20: number;
  ema50: number;
  sma5: number;
  sma10: number;
  sma20: number;
  sma50: number;
  sma200: number;
  wma20: number;
  tema20: number;
  hma20: number;
  vwma20: number;
  hl2: number;
  hlc3: number;
  ohlc4: number;
  haOpen: number;
  haHigh: number;
  haLow: number;
  haClose: number;
  gapPercent: number;
  dayRangePercent: number;
  stochK: number;
  stochD: number;
  slowStochK: number;
  slowStochD: number;
  stochRsi: number;
  cci: number;
  cmf: number;
  mfi: number;
  williamsR: number;
  obv: number;
  atr: number;
  trueRange: number;
  upperBB: number;
  lowerBB: number;
  bbPercentB: number;
  adx: number;
  adxDiPlus: number;
  adxDiMinus: number;
  supertrend: number;
  parabolicSar: number;
  aroonUp: number;
  aroonDown: number;
  ichimokuBase: number;
  ichimokuConversion: number;
  pivot: number;
  pivotR1: number;
  pivotR2: number;
  pivotS1: number;
  pivotS2: number;
  pe: number;
  ttmPe: number;
  ttmEps: number;
  bookValue: number;
  priceToBook: number;
  ttmSales: number;
  delivery: number;
  oi: number;
  oiChange: number;
  fnoLotSize: number;
  aiScore: number;
  signal: ScreenerSignal;
  lastUpdated: string;
  marketCap: number;
  marketCapName: string;
  breakout: boolean;
  volumeRatio: number;
  priceVsVwap: number;
  pattern: string;
  maxHigh20: number;
  minLow20: number;
  maxHigh50: number;
  minLow50: number;
  rollingHigh: number;
  rollingLow: number;
  inNifty50: boolean;
  inNifty500: boolean;
  inBankNifty: boolean;
  isFno: boolean;
}

export const QUICK_SCAN_TYPES = [
  { id: 'volume', label: 'Volume Breakout', hint: 'Unusual volume vs average' },
  { id: 'oi', label: 'OI Buildup', hint: 'Open interest accumulation' },
  { id: 'momentum', label: 'Momentum', hint: 'Strong directional move' },
  { id: 'gapup', label: 'Gap Up', hint: 'Opened above prior close' },
  { id: 'gapdown', label: 'Gap Down', hint: 'Opened below prior close' },
  { id: 'vwap', label: 'VWAP', hint: 'Price vs VWAP positioning' },
  { id: 'delivery', label: 'High Delivery', hint: 'Delivery % filter' },
  { id: 'intraday', label: 'Intraday Movers', hint: 'Active session moves' },
  { id: 'priceaction', label: 'Range Break', hint: 'Day range expansion' },
  { id: 'gamma', label: 'Gamma / Vol', hint: 'High volume derivatives names' },
] as const;

export type QuickScanId = (typeof QUICK_SCAN_TYPES)[number]['id'];

function derivePattern(stock: StockData): string {
  const body = Math.abs(stock.price - (stock.open ?? stock.price));
  const range = (stock.high ?? stock.price) - (stock.low ?? stock.price);
  if (stock.rsi > 68 && stock.changePercent > 1 && body > range * 0.6) return 'Bullish Engulfing';
  if (stock.rsi < 32 && stock.changePercent < -0.5) return 'Bearish Engulfing';
  if (stock.rsi < 35) return 'Hammer';
  if (range > stock.price * 0.03 && stock.changePercent > 0) return 'Morning Star';
  if (stock.price > stock.vwap && stock.changePercent > 0.5) return 'Momentum Continuation';
  if (stock.high - stock.low > stock.price * 0.025) return 'Range Expansion';
  return 'Doji';
}

function marketCapLabel(cap: number): string {
  if (cap >= 1_000_000) return 'Large Cap';
  if (cap >= 200_000) return 'Mid Cap';
  return 'Small Cap';
}

export type ScreenerFnoOi = {
  totalOi: number;
  oiChange: number;
  oiChangePct: number;
};

export function buildScreenerRow(
  stock: StockData,
  idx: number,
  technicals?: ComputedTechnicals | null,
  fnoOi?: ScreenerFnoOi | null,
): ScreenerMarketRow {
  const close = stock.price;
  const open = stock.open ?? close;
  const high = stock.high ?? close;
  const low = stock.low ?? close;
  const prevClose = stock.prevClose ?? close - stock.change;
  const avgVolume = technicals?.avgVolume ?? Math.max(100_000, Math.floor(stock.volume * 0.85));
  const volumeRatio = Number((stock.volume / Math.max(avgVolume, 1)).toFixed(2));
  const vwap = stock.vwap;
  const priceVsVwap = Number((close - vwap).toFixed(2));
  const gapPercent = Number((((open - prevClose) / Math.max(prevClose, 1)) * 100).toFixed(2));
  const dayRangePercent = Number((((high - low) / Math.max(low, 1)) * 100).toFixed(2));
  const hl2 = Number(((high + low) / 2).toFixed(2));
  const hlc3 = Number(((high + low + close) / 3).toFixed(2));
  const ohlc4 = Number(((open + high + low + close) / 4).toFixed(2));
  const haClose = ohlc4;
  const haOpen = Number(((open + close) / 2).toFixed(2));
  const haHigh = Math.max(high, haOpen, haClose);
  const haLow = Math.min(low, haOpen, haClose);

  const sma20 = technicals?.sma20 ?? Number((close * 0.99).toFixed(2));
  const sma50 = technicals?.sma50 ?? Number((close * 0.97).toFixed(2));
  const sma5 = technicals?.sma5 ?? close;
  const sma10 = technicals?.sma10 ?? close;
  const sma200 = technicals?.sma200 ?? Number((close * 0.92).toFixed(2));
  const ema9 = technicals?.ema9 ?? close;
  const ema20 = technicals?.ema20 ?? sma20;
  const ema50 = technicals?.ema50 ?? sma50;
  const wma20 = Number((sma20 * 1.002).toFixed(2));
  const tema20 = Number((ema20 * 1.001).toFixed(2));
  const hma20 = Number((ema20 * 0.999).toFixed(2));
  const vwma20 = Number(vwap.toFixed(2));

  const rsi14 = technicals?.rsi14 ?? stock.rsi;
  const macd = technicals?.macd ?? Number(((stock.changePercent / 8) + (rsi14 - 50) / 40).toFixed(2));
  const macdSignal = technicals?.macdSignal ?? Number((macd * 0.85).toFixed(2));
  const macdHist = technicals?.macdHist ?? Number((macd - macdSignal).toFixed(2));
  const stochK = Math.min(99, Math.max(5, Math.round(50 + (stock.changePercent + idx) * 4)));
  const stochD = Math.min(99, Math.max(5, stochK + (idx % 3) - 1));
  const slowStochK = Math.min(99, Math.max(5, stochK - 2));
  const slowStochD = Math.min(99, Math.max(5, stochD - 1));
  const stochRsi = Math.min(99, Math.max(5, Math.round(rsi14 * 0.9)));
  const cci = Number(((stock.changePercent * 8 + (idx % 10) - 5) * 3).toFixed(1));
  const cmf = Number(((stock.changePercent / 5) * 0.3).toFixed(2));
  const mfi = Math.min(99, Math.max(5, Math.round(45 + rsi14 * 0.4)));
  const williamsR = Number((-20 - (100 - rsi14) * 0.6).toFixed(1));
  const atr = Number((close * 0.018 * (1 + (idx % 5) * 0.02)).toFixed(2));
  const trueRange = Number((atr * 1.05).toFixed(2));
  const upperBB = technicals?.upperBB ?? Number((sma20 * 1.04).toFixed(2));
  const lowerBB = technicals?.lowerBB ?? Number((sma20 * 0.96).toFixed(2));
  const bbPercentB =
    technicals?.bbPercentB ??
    Number((((close - lowerBB) / Math.max(upperBB - lowerBB, 0.01)) * 100).toFixed(1));
  const adx = Math.min(60, Math.max(12, Math.round(22 + Math.abs(stock.changePercent) * 3)));
  const adxDiPlus = Number((adx * 0.55).toFixed(1));
  const adxDiMinus = Number((adx * 0.45).toFixed(1));
  const supertrend = Number((close * (stock.changePercent >= 0 ? 0.985 : 1.015)).toFixed(2));
  const parabolicSar = Number((close * (stock.changePercent >= 0 ? 0.99 : 1.01)).toFixed(2));
  const aroonUp = Math.min(100, Math.max(0, Math.round(50 + stock.changePercent * 8)));
  const aroonDown = Math.min(100, Math.max(0, Math.round(50 - stock.changePercent * 8)));

  const pivot = hl2;
  const pivotR1 = Number((2 * pivot - low).toFixed(2));
  const pivotS1 = Number((2 * pivot - high).toFixed(2));
  const pivotR2 = Number((pivot + (high - low)).toFixed(2));
  const pivotS2 = Number((pivot - (high - low)).toFixed(2));

  const seg = getSegmentFlags(stock.symbol, stock.sector, stock.marketCap);
  const draft: ScreenerMarketRow = {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    industry: `${stock.sector} / ${stock.name.split(' ')[0]}`,
    price: close,
    close,
    open,
    high,
    low,
    prevClose,
    changePercent: stock.changePercent,
    volume: stock.volume,
    avgVolume,
    rsi: rsi14,
    rsi14,
    macd,
    macdSignal,
    macdHist,
    vwap,
    ema9,
    ema20,
    ema50,
    sma5,
    sma10,
    sma20,
    sma50,
    sma200,
    wma20,
    tema20,
    hma20,
    vwma20,
    hl2,
    hlc3,
    ohlc4,
    haOpen,
    haHigh,
    haLow,
    haClose,
    gapPercent,
    dayRangePercent,
    stochK,
    stochD,
    slowStochK,
    slowStochD,
    stochRsi,
    cci,
    cmf,
    mfi,
    williamsR,
    obv: Math.floor(stock.volume * 1.2),
    atr,
    trueRange,
    upperBB,
    lowerBB,
    bbPercentB,
    adx,
    adxDiPlus,
    adxDiMinus,
    supertrend,
    parabolicSar,
    aroonUp,
    aroonDown,
    ichimokuBase: sma20,
    ichimokuConversion: ema9,
    pivot,
    pivotR1,
    pivotR2,
    pivotS1,
    pivotS2,
    pe: stock.pe,
    ttmPe: stock.pe,
    ttmEps: Number((close / Math.max(stock.pe, 1)).toFixed(2)),
    bookValue: Number((close * 0.35).toFixed(2)),
    priceToBook: Number((stock.pe / 4).toFixed(2)),
    ttmSales: stock.marketCap,
    delivery: stock.delivery,
    oi: fnoOi?.totalOi ?? 0,
    oiChange: fnoOi?.oiChangePct ?? 0,
    fnoLotSize: seg.isFno ? (stock.symbol.includes('BANK') ? 15 : 50) : 0,
    aiScore: 0,
    signal: 'NEUTRAL',
    lastUpdated: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    marketCap: stock.marketCap,
    marketCapName: marketCapLabel(stock.marketCap),
    breakout: false,
    volumeRatio,
    priceVsVwap,
    pattern: derivePattern(stock),
    maxHigh20: 0,
    minLow20: 0,
    maxHigh50: 0,
    minLow50: 0,
    rollingHigh: 0,
    rollingLow: 0,
    inNifty50: seg.inNifty50,
    inNifty500: seg.inNifty500,
    inBankNifty: seg.inBankNifty,
    isFno: seg.isFno,
  };

  draft.maxHigh20 = technicals?.maxHigh20 ?? getRollingHigh(draft, 20);
  draft.minLow20 = technicals?.minLow20 ?? getRollingLow(draft, 20);
  draft.maxHigh50 = technicals?.maxHigh50 ?? getRollingHigh(draft, 50);
  draft.minLow50 = technicals?.minLow50 ?? getRollingLow(draft, 50);
  draft.rollingHigh = draft.maxHigh20;
  draft.rollingLow = draft.minLow20;
  draft.aiScore = Math.max(
    12,
    Math.min(98, Math.round(48 + stock.changePercent * 6 + (rsi14 - 50) * 0.35 + volumeRatio * 4)),
  );
  draft.breakout = close > vwap && close > ema20 && volumeRatio > 1.12;
  draft.signal = draft.aiScore > 72 || draft.breakout ? 'BUY' : draft.aiScore < 32 ? 'SELL' : 'NEUTRAL';

  return draft;
}

export function stockToScreenerRow(stock: StockData, idx: number): ScreenerMarketRow {
  return buildScreenerRow(stock, idx, null);
}

export function loadScreenerUniverse(): ScreenerMarketRow[] {
  const cached = getCachedScreenerRows();
  if (cached.length) return cached;
  return loadExpandedStocks().map((s, i) => buildScreenerRow(s, i, null));
}

export function getQuickScanSymbolSet(type: QuickScanId, rows: ScreenerMarketRow[]): Set<string> {
  const filtered = rows.filter((row) => {
    switch (type) {
      case 'volume':
        return row.volumeRatio > 1.35;
      case 'oi':
        return row.oiChange > 3;
      case 'momentum':
        return row.changePercent > 1.2 && row.rsi14 > 55;
      case 'gapup':
        return row.gapPercent > 0.8;
      case 'gapdown':
        return row.gapPercent < -0.8;
      case 'vwap':
        return row.price > row.vwap && row.changePercent > 0;
      case 'delivery':
        return row.delivery > 40;
      case 'intraday':
        return Math.abs(row.changePercent) > 1.5;
      case 'priceaction':
        return row.dayRangePercent > 2.5;
      case 'gamma':
        return row.isFno && row.volumeRatio > 1.2;
      default:
        return true;
    }
  });
  return new Set(filtered.map((r) => r.symbol));
}

export function isScreenerLive(): boolean {
  const mode = getScreenerFeedStatus().mode;
  return mode === 'live' || mode === 'mixed';
}

export { refreshScreenerFeedAsync, getScreenerFeedStatus };
