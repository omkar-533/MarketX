import type { FilterField, FilterGroup, FilterRule, Operator, Timeframe, TimeOffset } from '../types/screener';
import type { ScreenerMarketRow } from './screenerDataService';
import {
  detectCross,
  getHistoricalNumeric,
  getRollingHigh,
  getRollingLow,
} from './screenerHistory';

export type FieldCategory =
  | 'price'
  | 'volume'
  | 'moving_avg'
  | 'momentum'
  | 'volatility'
  | 'trend'
  | 'pivot'
  | 'fundamental'
  | 'segment'
  | 'meta';

export interface ChartinkFieldDef {
  value: FilterField;
  label: string;
  category: FieldCategory;
  type: 'number' | 'string' | 'boolean';
  description?: string;
}

export const TIME_FRAMES: { value: Timeframe; label: string }[] = [
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minute' },
  { value: '15m', label: '15 minute' },
  { value: '30m', label: '30 minute' },
  { value: '1h', label: '1 hour' },
  { value: '1D', label: 'Daily' },
  { value: '1W', label: 'Weekly' },
];

export const TIME_OFFSETS: { value: TimeOffset; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'prev1', label: '1 candle ago' },
  { value: 'prev5', label: '5 candles ago' },
  { value: 'prev20', label: '20 candles ago' },
];

export const CHARTINK_FIELD_CATALOG: ChartinkFieldDef[] = [
  { value: 'close', label: 'Close', category: 'price', type: 'number' },
  { value: 'open', label: 'Open', category: 'price', type: 'number' },
  { value: 'high', label: 'High', category: 'price', type: 'number' },
  { value: 'low', label: 'Low', category: 'price', type: 'number' },
  { value: 'price', label: 'LTP', category: 'price', type: 'number' },
  { value: 'changePercent', label: '% Change', category: 'price', type: 'number' },
  { value: 'vwap', label: 'VWAP', category: 'price', type: 'number' },
  { value: 'hl2', label: 'HL2', category: 'price', type: 'number' },
  { value: 'hlc3', label: 'HLC3', category: 'price', type: 'number' },
  { value: 'ohlc4', label: 'OHLC4', category: 'price', type: 'number' },
  { value: 'haOpen', label: 'HA-Open', category: 'price', type: 'number' },
  { value: 'haHigh', label: 'HA-High', category: 'price', type: 'number' },
  { value: 'haLow', label: 'HA-Low', category: 'price', type: 'number' },
  { value: 'haClose', label: 'HA-Close', category: 'price', type: 'number' },
  { value: 'gapPercent', label: 'Gap %', category: 'price', type: 'number' },
  { value: 'dayRangePercent', label: 'Day range %', category: 'price', type: 'number' },
  { value: 'priceVsVwap', label: 'Price vs VWAP', category: 'price', type: 'number' },

  { value: 'volume', label: 'Volume', category: 'volume', type: 'number' },
  { value: 'avgVolume', label: 'Avg volume', category: 'volume', type: 'number' },
  { value: 'volumeRatio', label: 'Volume ratio', category: 'volume', type: 'number' },
  { value: 'oi', label: 'Open Interest', category: 'volume', type: 'number' },
  { value: 'oiChange', label: 'OI change %', category: 'volume', type: 'number' },
  { value: 'obv', label: 'OBV', category: 'volume', type: 'number' },
  { value: 'fnoLotSize', label: 'F&O lot size', category: 'volume', type: 'number' },

  { value: 'sma5', label: 'SMA 5', category: 'moving_avg', type: 'number' },
  { value: 'sma10', label: 'SMA 10', category: 'moving_avg', type: 'number' },
  { value: 'sma20', label: 'SMA 20', category: 'moving_avg', type: 'number' },
  { value: 'sma50', label: 'SMA 50', category: 'moving_avg', type: 'number' },
  { value: 'sma200', label: 'SMA 200', category: 'moving_avg', type: 'number' },
  { value: 'ema9', label: 'EMA 9', category: 'moving_avg', type: 'number' },
  { value: 'ema20', label: 'EMA 20', category: 'moving_avg', type: 'number' },
  { value: 'ema50', label: 'EMA 50', category: 'moving_avg', type: 'number' },
  { value: 'wma20', label: 'WMA 20', category: 'moving_avg', type: 'number' },
  { value: 'tema20', label: 'TEMA 20', category: 'moving_avg', type: 'number' },
  { value: 'hma20', label: 'HMA 20', category: 'moving_avg', type: 'number' },
  { value: 'vwma20', label: 'VWMA 20', category: 'moving_avg', type: 'number' },

  { value: 'rsi', label: 'RSI', category: 'momentum', type: 'number' },
  { value: 'rsi14', label: 'RSI 14', category: 'momentum', type: 'number' },
  { value: 'stochRsi', label: 'Stoch RSI', category: 'momentum', type: 'number' },
  { value: 'macd', label: 'MACD line', category: 'momentum', type: 'number' },
  { value: 'macdSignal', label: 'MACD signal', category: 'momentum', type: 'number' },
  { value: 'macdHist', label: 'MACD histogram', category: 'momentum', type: 'number' },
  { value: 'stochK', label: 'Stochastic %K', category: 'momentum', type: 'number' },
  { value: 'stochD', label: 'Stochastic %D', category: 'momentum', type: 'number' },
  { value: 'slowStochK', label: 'Slow Stoch %K', category: 'momentum', type: 'number' },
  { value: 'slowStochD', label: 'Slow Stoch %D', category: 'momentum', type: 'number' },
  { value: 'cci', label: 'CCI', category: 'momentum', type: 'number' },
  { value: 'cmf', label: 'CMF', category: 'momentum', type: 'number' },
  { value: 'mfi', label: 'MFI', category: 'momentum', type: 'number' },
  { value: 'williamsR', label: 'Williams %R', category: 'momentum', type: 'number' },

  { value: 'atr', label: 'ATR', category: 'volatility', type: 'number' },
  { value: 'trueRange', label: 'True Range', category: 'volatility', type: 'number' },
  { value: 'upperBB', label: 'Upper Bollinger', category: 'volatility', type: 'number' },
  { value: 'lowerBB', label: 'Lower Bollinger', category: 'volatility', type: 'number' },
  { value: 'bbPercentB', label: 'BB %b', category: 'volatility', type: 'number' },

  { value: 'adx', label: 'ADX', category: 'trend', type: 'number' },
  { value: 'adxDiPlus', label: 'ADX DI+', category: 'trend', type: 'number' },
  { value: 'adxDiMinus', label: 'ADX DI-', category: 'trend', type: 'number' },
  { value: 'supertrend', label: 'Supertrend', category: 'trend', type: 'number' },
  { value: 'parabolicSar', label: 'Parabolic SAR', category: 'trend', type: 'number' },
  { value: 'aroonUp', label: 'Aroon Up', category: 'trend', type: 'number' },
  { value: 'aroonDown', label: 'Aroon Down', category: 'trend', type: 'number' },
  { value: 'ichimokuBase', label: 'Ichimoku Base', category: 'trend', type: 'number' },
  { value: 'ichimokuConversion', label: 'Ichimoku Conversion', category: 'trend', type: 'number' },

  { value: 'pivot', label: 'Pivot', category: 'pivot', type: 'number' },
  { value: 'pivotR1', label: 'Pivot R1', category: 'pivot', type: 'number' },
  { value: 'pivotR2', label: 'Pivot R2', category: 'pivot', type: 'number' },
  { value: 'pivotS1', label: 'Pivot S1', category: 'pivot', type: 'number' },
  { value: 'pivotS2', label: 'Pivot S2', category: 'pivot', type: 'number' },

  { value: 'marketCap', label: 'Market cap', category: 'fundamental', type: 'number' },
  { value: 'marketCapName', label: 'Market cap name', category: 'fundamental', type: 'string' },
  { value: 'pe', label: 'P/E', category: 'fundamental', type: 'number' },
  { value: 'ttmPe', label: 'TTM P/E', category: 'fundamental', type: 'number' },
  { value: 'ttmEps', label: 'TTM EPS', category: 'fundamental', type: 'number' },
  { value: 'bookValue', label: 'Book value', category: 'fundamental', type: 'number' },
  { value: 'priceToBook', label: 'Price to book', category: 'fundamental', type: 'number' },
  { value: 'ttmSales', label: 'TTM Sales', category: 'fundamental', type: 'number' },
  { value: 'delivery', label: 'Delivery %', category: 'fundamental', type: 'number' },

  { value: 'inNifty50', label: 'In Nifty 50', category: 'segment', type: 'boolean' },
  { value: 'inNifty500', label: 'In Nifty 500', category: 'segment', type: 'boolean' },
  { value: 'inBankNifty', label: 'In Bank Nifty', category: 'segment', type: 'boolean' },
  { value: 'isFno', label: 'F&O stock', category: 'segment', type: 'boolean' },

  { value: 'sector', label: 'Sector', category: 'meta', type: 'string' },
  { value: 'industry', label: 'Industry', category: 'meta', type: 'string' },
  { value: 'symbol', label: 'Symbol', category: 'meta', type: 'string' },
  { value: 'signal', label: 'Signal', category: 'meta', type: 'string' },
  { value: 'pattern', label: 'Pattern', category: 'meta', type: 'string' },
  { value: 'breakout', label: 'Breakout', category: 'meta', type: 'boolean' },
  { value: 'aiScore', label: 'AI score', category: 'meta', type: 'number' },
  { value: 'rollingHigh', label: 'Rolling high', category: 'meta', type: 'number' },
  { value: 'rollingLow', label: 'Rolling low', category: 'meta', type: 'number' },
];

export const FIELD_BY_CATEGORY = CHARTINK_FIELD_CATALOG.reduce(
  (acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  },
  {} as Record<FieldCategory, ChartinkFieldDef[]>,
);

export const CATEGORY_LABELS: Record<FieldCategory, string> = {
  price: 'Price / OHLC',
  volume: 'Volume & OI',
  moving_avg: 'Moving averages',
  momentum: 'Momentum',
  volatility: 'Volatility',
  trend: 'Trend',
  pivot: 'Pivots',
  fundamental: 'Fundamentals',
  segment: 'Index / Segment',
  meta: 'Sector & meta',
};

const OHLC_FIELDS = new Set<FilterField>([
  'close', 'open', 'high', 'low', 'price', 'hl2', 'hlc3', 'ohlc4',
  'haOpen', 'haHigh', 'haLow', 'haClose', 'volume', 'changePercent', 'gapPercent',
]);

function applyArithmetic(val: number, op: FilterRule['arithmeticOp'], n?: number): number {
  if (!op || op === 'none' || n == null) return val;
  switch (op) {
    case 'add': return val + n;
    case 'subtract': return val - n;
    case 'multiply': return val * n;
    case 'divide': return n !== 0 ? val / n : val;
    default: return val;
  }
}

export function getFieldValue(
  stock: ScreenerMarketRow,
  field: FilterField,
  offset: TimeOffset = 'latest',
  timeframe: Timeframe = '1D',
): number | string | boolean {
  const row = stock as ScreenerMarketRow & Record<string, unknown>;

  if (OHLC_FIELDS.has(field)) {
    const v = getHistoricalNumeric(stock, field, timeframe, offset);
    return typeof v === 'number' ? v : v;
  }

  const snap: Record<string, number | string | boolean> = {
    price: stock.close,
    close: stock.close,
    vwap: stock.vwap,
    changePercent: stock.changePercent,
    gapPercent: stock.gapPercent,
    dayRangePercent: stock.dayRangePercent,
    priceVsVwap: stock.priceVsVwap,
    volume: stock.volume,
    avgVolume: stock.avgVolume,
    volumeRatio: stock.volumeRatio,
    oi: stock.oi,
    oiChange: stock.oiChange,
    obv: (row.obv as number) ?? stock.volume * 0.1,
    fnoLotSize: (row.fnoLotSize as number) ?? (stock.isFno ? 1 : 0),
    sma5: stock.sma5,
    sma10: stock.sma10,
    sma20: stock.sma20,
    sma50: stock.sma50,
    sma200: stock.sma200,
    ema9: stock.ema9,
    ema20: stock.ema20,
    ema50: stock.ema50,
    wma20: (row.wma20 as number) ?? stock.sma20,
    tema20: (row.tema20 as number) ?? stock.ema20,
    hma20: (row.hma20 as number) ?? stock.ema20,
    vwma20: (row.vwma20 as number) ?? stock.vwap,
    rsi: stock.rsi,
    rsi14: stock.rsi14,
    stochRsi: (row.stochRsi as number) ?? stock.rsi,
    macd: stock.macd,
    macdSignal: stock.macdSignal,
    macdHist: stock.macdHist,
    stochK: stock.stochK,
    stochD: stock.stochD,
    slowStochK: (row.slowStochK as number) ?? stock.stochK,
    slowStochD: (row.slowStochD as number) ?? stock.stochD,
    cci: stock.cci,
    cmf: (row.cmf as number) ?? 0,
    mfi: stock.mfi,
    williamsR: stock.williamsR,
    atr: stock.atr,
    trueRange: (row.trueRange as number) ?? stock.atr,
    upperBB: stock.upperBB,
    lowerBB: stock.lowerBB,
    bbPercentB: stock.bbPercentB,
    adx: stock.adx,
    adxDiPlus: (row.adxDiPlus as number) ?? stock.adx * 0.6,
    adxDiMinus: (row.adxDiMinus as number) ?? stock.adx * 0.4,
    supertrend: stock.supertrend,
    parabolicSar: stock.parabolicSar,
    aroonUp: (row.aroonUp as number) ?? 50,
    aroonDown: (row.aroonDown as number) ?? 50,
    ichimokuBase: (row.ichimokuBase as number) ?? stock.sma20,
    ichimokuConversion: (row.ichimokuConversion as number) ?? stock.ema9,
    pivot: (row.pivot as number) ?? stock.hl2,
    pivotR1: (row.pivotR1 as number) ?? stock.high,
    pivotR2: (row.pivotR2 as number) ?? stock.high * 1.02,
    pivotS1: (row.pivotS1 as number) ?? stock.low,
    pivotS2: (row.pivotS2 as number) ?? stock.low * 0.98,
    marketCap: stock.marketCap,
    marketCapName: (row.marketCapName as string) ?? 'Large Cap',
    pe: stock.pe,
    ttmPe: (row.ttmPe as number) ?? stock.pe,
    ttmEps: (row.ttmEps as number) ?? stock.pe / 10,
    bookValue: (row.bookValue as number) ?? stock.close * 0.4,
    priceToBook: (row.priceToBook as number) ?? stock.pe / 3,
    ttmSales: (row.ttmSales as number) ?? stock.marketCap,
    delivery: stock.delivery,
    inNifty50: stock.inNifty50 ?? false,
    inNifty500: stock.inNifty500 ?? false,
    inBankNifty: stock.inBankNifty ?? false,
    isFno: stock.isFno ?? false,
    sector: stock.sector,
    industry: stock.industry,
    symbol: stock.symbol,
    signal: stock.signal,
    pattern: stock.pattern,
    breakout: stock.breakout,
    aiScore: stock.aiScore,
    maxHigh20: stock.maxHigh20,
    minLow20: stock.minLow20,
    maxHigh50: stock.maxHigh50,
    minLow50: stock.minLow50,
    rollingHigh: stock.rollingHigh ?? stock.maxHigh20,
    rollingLow: stock.rollingLow ?? stock.minLow20,
  };

  return snap[field] ?? stock.close;
}

function compareNumbers(left: number, op: Operator, right: number, second?: number): boolean {
  switch (op) {
    case '>': return left > right;
    case '<': return left < right;
    case '=': return Math.abs(left - right) < 0.0001;
    case '!=': return Math.abs(left - right) >= 0.0001;
    case 'between': return second !== undefined && left >= right && left <= second;
    default: return false;
  }
}

export function matchChartinkRule(stock: ScreenerMarketRow, rule: FilterRule): boolean {
  const tf = rule.timeframe ?? '1D';
  const off = rule.offset ?? 'latest';

  if (rule.ruleType === 'max' && typeof rule.period === 'number') {
    const maxVal = getRollingHigh(stock, rule.period, tf);
    const close = getFieldValue(stock, 'close', off, tf) as number;
    if (rule.operator === '>') return close >= maxVal * 0.998;
    if (rule.operator === '<') return close < maxVal;
    return close >= maxVal * 0.995;
  }

  if (rule.ruleType === 'min' && typeof rule.period === 'number') {
    const minVal = getRollingLow(stock, rule.period, tf);
    const close = getFieldValue(stock, 'close', off, tf) as number;
    if (rule.operator === '<') return close <= minVal * 1.002;
    if (rule.operator === '>') return close > minVal;
    return close <= minVal * 1.005;
  }

  if (rule.ruleType === 'greatest' && rule.extraFields?.length) {
    const vals = [rule.field, ...rule.extraFields].map((f) => getFieldValue(stock, f, off, tf) as number);
    const g = Math.max(...vals);
    return compareNumbers(g, rule.operator, rule.value as number);
  }

  if (rule.ruleType === 'least' && rule.extraFields?.length) {
    const vals = [rule.field, ...rule.extraFields].map((f) => getFieldValue(stock, f, off, tf) as number);
    const l = Math.min(...vals);
    return compareNumbers(l, rule.operator, rule.value as number);
  }

  if (rule.ruleType === 'count' || rule.ruleType === 'countstreak') {
    const period = rule.period ?? 5;
    let hits = 0;
    for (let i = 0; i < period; i++) {
      const o: TimeOffset = i === 0 ? 'latest' : i === 1 ? 'prev1' : 'prev5';
      const sub = { ...rule, ruleType: 'simple' as const, offset: o };
      if (matchChartinkRule(stock, sub)) hits++;
    }
    const need = rule.ruleType === 'countstreak' ? period : Math.ceil(period / 2);
    return compareNumbers(hits, rule.operator, need);
  }

  if (rule.operator === 'crosses_above' || rule.operator === 'crosses_below') {
    const rhs =
      rule.compareTarget === 'field' && rule.compareField
        ? rule.compareField
        : (rule.value as number);
    return detectCross(stock, rule.field, rhs, rule.operator, tf, off, rule.compareField);
  }

  let left = getFieldValue(stock, rule.field, off, tf);
  if (typeof left === 'number') {
    left = applyArithmetic(left, rule.arithmeticOp, rule.arithmeticValue);
  }

  if (rule.compareTarget === 'field' && rule.compareField) {
    const right = getFieldValue(stock, rule.compareField, rule.compareOffset ?? 'latest', rule.compareTimeframe ?? tf);
    if (typeof left !== 'number' || typeof right !== 'number') return false;
    return compareNumbers(left, rule.operator, right);
  }

  if (rule.operator === 'between') {
    return typeof left === 'number' && typeof rule.value === 'number' && typeof rule.secondValue === 'number' &&
      compareNumbers(left, 'between', rule.value, rule.secondValue);
  }

  if (rule.operator === 'contains' && typeof left === 'string') {
    return String(left).toLowerCase().includes(String(rule.value).toLowerCase());
  }

  if (rule.operator === 'not contains' && typeof left === 'string') {
    return !String(left).toLowerCase().includes(String(rule.value).toLowerCase());
  }

  if (rule.operator === '=' || rule.operator === '!=') {
    if (typeof left === 'string') {
      const eq = String(left).toLowerCase() === String(rule.value).toLowerCase();
      return rule.operator === '=' ? eq : !eq;
    }
    if (typeof left === 'boolean') {
      return rule.operator === '=' ? left === rule.value : left !== rule.value;
    }
  }

  if (typeof left === 'number' && typeof rule.value === 'number') {
    return compareNumbers(left, rule.operator, rule.value, rule.secondValue as number | undefined);
  }

  return false;
}

export function evaluateChartinkGroup(group: FilterGroup, stock: ScreenerMarketRow): boolean {
  const evalRules = (): boolean => {
    if (!group.rules.length) return true;
    return group.rules.reduce((acc, rule, idx) => {
      const r = matchChartinkRule(stock, rule);
      if (idx === 0) return r;
      return rule.logic === 'AND' ? acc && r : acc || r;
    }, matchChartinkRule(stock, group.rules[0]));
  };

  const base = evalRules();
  const childResults = group.children.map((child) => evaluateChartinkGroup(child, stock));
  if (!childResults.length) return base;

  const nested = group.logic === 'AND' ? childResults.every(Boolean) : childResults.some(Boolean);
  return group.logic === 'AND' ? base && nested : base || nested;
}

export function evaluateChartinkFilters(
  groups: FilterGroup[],
  stock: ScreenerMarketRow,
  topLevelLogic: 'AND' | 'OR' = 'AND',
): boolean {
  if (!groups.length) return true;
  const results = groups.map((g) => evaluateChartinkGroup(g, stock));
  return topLevelLogic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

export function createDefaultChartinkRule(id: string): FilterRule {
  return {
    id,
    field: 'close',
    offset: 'latest',
    timeframe: '1D',
    operator: '>',
    value: 0,
    compareTarget: 'field',
    compareField: 'sma20',
    compareOffset: 'latest',
    logic: 'AND',
    ruleType: 'simple',
    arithmeticOp: 'none',
  };
}

export function createDefaultChartinkGroup(id: string, name: string): FilterGroup {
  return {
    id,
    name,
    logic: 'AND',
    rules: [createDefaultChartinkRule(`${id}-r1`)],
    children: [],
  };
}

export const CHARTINK_SCAN_PRESETS: { label: string; description: string; groups: FilterGroup[] }[] = [
  {
    label: 'Overbought',
    description: 'RSI above 70',
    groups: [{ id: 'p-ob', name: 'Overbought', logic: 'AND', children: [], rules: [{ id: 'p-ob-1', field: 'rsi14', operator: '>', value: 70, logic: 'AND', ruleType: 'simple' }] }],
  },
  {
    label: 'Oversold',
    description: 'RSI below 30',
    groups: [{ id: 'p-os', name: 'Oversold', logic: 'AND', children: [], rules: [{ id: 'p-os-1', field: 'rsi14', operator: '<', value: 30, logic: 'AND', ruleType: 'simple' }] }],
  },
  {
    label: 'MACD cross up',
    description: 'MACD crosses above signal',
    groups: [{
      id: 'p-macd-x',
      name: 'MACD cross',
      logic: 'AND',
      children: [],
      rules: [{ id: 'p-macd-x-1', field: 'macd', operator: 'crosses_above', value: 0, compareTarget: 'field', compareField: 'macdSignal', logic: 'AND', ruleType: 'simple' }],
    }],
  },
  {
    label: 'Close cross SMA20',
    description: 'Price crosses above SMA 20',
    groups: [{
      id: 'p-sma-x',
      name: 'SMA cross',
      logic: 'AND',
      children: [],
      rules: [{ id: 'p-sma-x-1', field: 'close', operator: 'crosses_above', value: 0, compareTarget: 'field', compareField: 'sma20', logic: 'AND', ruleType: 'simple' }],
    }],
  },
  {
    label: 'Gap Up',
    description: 'Opened above previous close',
    groups: [{ id: 'p-gapu', name: 'Gap up', logic: 'AND', children: [], rules: [{ id: 'p-gapu-1', field: 'gapPercent', operator: '>', value: 1, logic: 'AND', ruleType: 'simple' }] }],
  },
  {
    label: 'Gap Down',
    description: 'Opened below previous close',
    groups: [{ id: 'p-gapd', name: 'Gap down', logic: 'AND', children: [], rules: [{ id: 'p-gapd-1', field: 'gapPercent', operator: '<', value: -1, logic: 'AND', ruleType: 'simple' }] }],
  },
  {
    label: 'Bullish day',
    description: 'Close > Open and Close > SMA20',
    groups: [{
      id: 'p-bull',
      name: 'Bullish',
      logic: 'AND',
      children: [],
      rules: [
        { id: 'p-bull-1', field: 'close', operator: '>', value: 0, compareTarget: 'field', compareField: 'open', logic: 'AND', ruleType: 'simple' },
        { id: 'p-bull-2', field: 'close', operator: '>', value: 0, compareTarget: 'field', compareField: 'sma20', logic: 'AND', ruleType: 'simple' },
      ],
    }],
  },
  {
    label: 'Volume spike',
    description: 'Volume > 1.5x average',
    groups: [{ id: 'p-vol', name: 'Volume', logic: 'AND', children: [], rules: [{ id: 'p-vol-1', field: 'volumeRatio', operator: '>', value: 1.5, logic: 'AND', ruleType: 'simple' }] }],
  },
  {
    label: 'Above VWAP',
    description: 'Price above VWAP',
    groups: [{ id: 'p-vwap', name: 'VWAP', logic: 'AND', children: [], rules: [{ id: 'p-vwap-1', field: 'priceVsVwap', operator: '>', value: 0, logic: 'AND', ruleType: 'simple' }] }],
  },
  {
    label: '20-day high',
    description: 'Close near 20-period high',
    groups: [{ id: 'p-hi20', name: '20d high', logic: 'AND', children: [], rules: [{ id: 'p-hi20-1', field: 'close', operator: '>', value: 20, period: 20, logic: 'AND', ruleType: 'max' }] }],
  },
  {
    label: 'Nifty 50 only',
    description: 'Index segment filter',
    groups: [{ id: 'p-n50', name: 'Nifty 50', logic: 'AND', children: [], rules: [{ id: 'p-n50-1', field: 'inNifty50', operator: '=', value: true, logic: 'AND', ruleType: 'simple' }] }],
  },
  {
    label: 'Banking sector',
    description: 'Bank Nifty / banking names',
    groups: [{ id: 'p-bank', name: 'Banking', logic: 'AND', children: [], rules: [{ id: 'p-bank-1', field: 'sector', operator: 'contains', value: 'bank', logic: 'AND', ruleType: 'simple' }] }],
  },
  {
    label: 'F&O stocks',
    description: 'Derivatives eligible',
    groups: [{ id: 'p-fno', name: 'F&O', logic: 'AND', children: [], rules: [{ id: 'p-fno-1', field: 'isFno', operator: '=', value: true, logic: 'AND', ruleType: 'simple' }] }],
  },
  {
    label: 'Heikin Ashi bullish',
    description: 'HA close > HA open',
    groups: [{
      id: 'p-ha',
      name: 'HA bullish',
      logic: 'AND',
      children: [],
      rules: [{ id: 'p-ha-1', field: 'haClose', operator: '>', value: 0, compareTarget: 'field', compareField: 'haOpen', logic: 'AND', ruleType: 'simple' }],
    }],
  },
];
