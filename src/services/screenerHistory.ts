import type { FilterField, Timeframe, TimeOffset } from '../types/screener';
import type { ScreenerMarketRow } from './screenerDataService';

export interface BarHistory {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

const cache = new Map<string, BarHistory>();
const realCache = new Map<string, BarHistory>();

export function setRealBarHistory(symbol: string, timeframe: Timeframe, hist: BarHistory): void {
  realCache.set(`${symbol}:${timeframe}`, hist);
  cache.set(`${symbol}:${timeframe}`, hist);
}

function seedFromSymbol(symbol: string): number {
  let s = 0;
  for (let i = 0; i < symbol.length; i++) s = (s * 31 + symbol.charCodeAt(i)) >>> 0;
  return s;
}

function barsForTimeframe(tf: Timeframe): number {
  switch (tf) {
    case '1m':
      return 60;
    case '5m':
      return 48;
    case '15m':
      return 40;
    case '30m':
      return 32;
    case '1h':
      return 28;
    case '1W':
      return 52;
    default:
      return 30;
  }
}

/** Deterministic OHLC history per symbol for offsets & crosses */
export function getBarHistory(row: ScreenerMarketRow, timeframe: Timeframe = '1D'): BarHistory {
  const key = `${row.symbol}:${timeframe}`;
  const real = realCache.get(key);
  if (real && real.close.length >= 10) return real;
  const cached = cache.get(key);
  if (cached && realCache.has(key)) return cached;

  const n = barsForTimeframe(timeframe);
  const seed = seedFromSymbol(row.symbol);
  const close: number[] = [];
  const open: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const volume: number[] = [];

  let price = row.close * (0.92 + (seed % 8) * 0.01);
  for (let i = 0; i < n; i++) {
    const rnd = Math.sin(seed * 0.17 + i * 0.41) * 0.012 + Math.cos(i * 0.23 + seed) * 0.008;
    const o = price;
    const c = price * (1 + rnd);
    const h = Math.max(o, c) * (1.002 + (i % 3) * 0.001);
    const l = Math.min(o, c) * (0.998 - (i % 4) * 0.001);
    open.push(Number(o.toFixed(2)));
    close.push(Number(c.toFixed(2)));
    high.push(Number(h.toFixed(2)));
    low.push(Number(l.toFixed(2)));
    volume.push(Math.floor(row.volume * (0.7 + (i % 10) * 0.03)));
    price = c;
  }

  // Last bar = current row
  const last = n - 1;
  open[last] = row.open;
  high[last] = row.high;
  low[last] = row.low;
  close[last] = row.close;
  volume[last] = row.volume;

  const hist = { open, high, low, close, volume };
  cache.set(key, hist);
  return hist;
}

function offsetIndex(offset: TimeOffset, len: number): number {
  switch (offset) {
    case 'prev1':
      return Math.max(0, len - 2);
    case 'prev5':
      return Math.max(0, len - 6);
    case 'prev20':
      return Math.max(0, len - 21);
    default:
      return len - 1;
  }
}

function prevOffsetIndex(offset: TimeOffset, len: number): number {
  const cur = offsetIndex(offset, len);
  return Math.max(0, cur - 1);
}

export function getHistoricalNumeric(
  row: ScreenerMarketRow,
  field: FilterField,
  timeframe: Timeframe = '1D',
  offset: TimeOffset = 'latest',
): number {
  const hist = getBarHistory(row, timeframe);
  const idx = offsetIndex(offset, hist.close.length);
  const c = hist.close[idx];
  const o = hist.open[idx];
  const h = hist.high[idx];
  const l = hist.low[idx];
  const v = hist.volume[idx];

  const haClose = (o + h + l + c) / 4;
  const haOpen = idx > 0 ? (hist.open[idx - 1] + hist.close[idx - 1]) / 2 : (o + c) / 2;

  switch (field) {
    case 'close':
    case 'price':
      return c;
    case 'open':
      return o;
    case 'high':
      return h;
    case 'low':
      return l;
    case 'volume':
      return v;
    case 'hl2':
      return (h + l) / 2;
    case 'hlc3':
      return (h + l + c) / 3;
    case 'ohlc4':
      return (o + h + l + c) / 4;
    case 'haClose':
      return haClose;
    case 'haOpen':
      return haOpen;
    case 'haHigh':
      return Math.max(h, haOpen, haClose);
    case 'haLow':
      return Math.min(l, haOpen, haClose);
    case 'vwap':
      return row.vwap;
    case 'changePercent':
      return idx > 0 ? ((c - hist.close[idx - 1]) / hist.close[idx - 1]) * 100 : row.changePercent;
    case 'gapPercent':
      return idx > 0 ? ((o - hist.close[idx - 1]) / hist.close[idx - 1]) * 100 : row.gapPercent;
    default:
      return c;
  }
}

export function getRollingHigh(row: ScreenerMarketRow, period: number, timeframe: Timeframe = '1D'): number {
  const hist = getBarHistory(row, timeframe);
  const slice = hist.high.slice(-period);
  return Math.max(...slice, row.high);
}

export function getRollingLow(row: ScreenerMarketRow, period: number, timeframe: Timeframe = '1D'): number {
  const hist = getBarHistory(row, timeframe);
  const slice = hist.low.slice(-period);
  return Math.min(...slice, row.low);
}

export function detectCross(
  row: ScreenerMarketRow,
  leftField: FilterField,
  right: number | FilterField,
  direction: 'crosses_above' | 'crosses_below',
  timeframe: Timeframe = '1D',
  offset: TimeOffset = 'latest',
  compareField?: FilterField,
): boolean {
  const hist = getBarHistory(row, timeframe);
  const prevIdx = prevOffsetIndex(offset, hist.close.length);

  const leftCur = getHistoricalNumeric(row, leftField, timeframe, offset);
  const leftPrev = getHistoricalNumeric(
    { ...row, close: hist.close[prevIdx], open: hist.open[prevIdx], high: hist.high[prevIdx], low: hist.low[prevIdx] } as ScreenerMarketRow,
    leftField,
    timeframe,
    offset === 'latest' ? 'prev1' : offset,
  );

  let rightCur: number;
  let rightPrev: number;
  if (typeof right === 'number') {
    rightCur = right;
    rightPrev = right;
  } else {
    const rf = compareField ?? right;
    rightCur = getHistoricalNumeric(row, rf, timeframe, offset);
    rightPrev = getHistoricalNumeric(
      { ...row, close: hist.close[prevIdx], open: hist.open[prevIdx], high: hist.high[prevIdx], low: hist.low[prevIdx] } as ScreenerMarketRow,
      rf,
      timeframe,
      'prev1',
    );
  }

  if (direction === 'crosses_above') {
    return leftPrev <= rightPrev && leftCur > rightCur;
  }
  return leftPrev >= rightPrev && leftCur < rightCur;
}
