import { getFiveYearOIData, type HistoricalOIData } from '../data/marketData';
export type SymbolKey = string;

export type OiTimeframeId =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1H'
  | '4H'
  | '1D'
  | '1W'
  | '1M';

export interface OiTimeframeMeta {
  id: OiTimeframeId;
  label: string;
  minutes: number;
  group: 'intraday' | 'daily' | 'higher';
}

export const OI_TIMEFRAMES: OiTimeframeMeta[] = [
  { id: '1m', label: '1m', minutes: 1, group: 'intraday' },
  { id: '3m', label: '3m', minutes: 3, group: 'intraday' },
  { id: '5m', label: '5m', minutes: 5, group: 'intraday' },
  { id: '15m', label: '15m', minutes: 15, group: 'intraday' },
  { id: '30m', label: '30m', minutes: 30, group: 'intraday' },
  { id: '1H', label: '1H', minutes: 60, group: 'intraday' },
  { id: '4H', label: '4H', minutes: 240, group: 'intraday' },
  { id: '1D', label: '1D', minutes: 375, group: 'daily' },
  { id: '1W', label: '1W', minutes: 375 * 5, group: 'higher' },
  { id: '1M', label: '1M', minutes: 375 * 22, group: 'higher' },
];

/** Unified bar for charts + backtest (compatible with HistoricalOIData) */
export interface OiBar {
  date: string;
  time: string;
  label: string;
  symbol: string;
  spotPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  pcr: number;
  maxPain: number;
  totalCE_OI: number;
  totalPE_OI: number;
  volume: number;
}

const SESSION_MINUTES = 375; // 9:15–15:30

function seededRand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function getOiDateBounds(symbol: string): { min: string; max: string; count: number } {
  const data = getFiveYearOIData(symbol);
  if (!data.length) return { min: '', max: '', count: 0 };
  return { min: data[0].date, max: data[data.length - 1].date, count: data.length };
}

export function loadOiDailyHistory(symbol: string): HistoricalOIData[] {
  return getFiveYearOIData(symbol);
}

export function filterOiByDateRange(
  data: HistoricalOIData[],
  startDate?: string,
  endDate?: string,
): HistoricalOIData[] {
  let out = data;
  if (startDate) out = out.filter((d) => d.date >= startDate);
  if (endDate) out = out.filter((d) => d.date <= endDate);
  return out;
}

function dailyToBar(d: HistoricalOIData): OiBar {
  const c = d.spotPrice;
  return {
    date: d.date,
    time: '15:30',
    label: d.date,
    symbol: d.symbol,
    spotPrice: c,
    open: Math.round(c * 0.999),
    high: Math.round(c * 1.004),
    low: Math.round(c * 0.996),
    close: c,
    pcr: d.pcr,
    maxPain: d.maxPain,
    totalCE_OI: d.totalCE_OI,
    totalPE_OI: d.totalPE_OI,
    volume: d.volume,
  };
}

function expandDayIntraday(day: HistoricalOIData, intervalMin: number): OiBar[] {
  const bars: OiBar[] = [];
  const count = Math.max(1, Math.floor(SESSION_MINUTES / intervalMin));
  const close = day.spotPrice;
  let price = close * (0.997 + seededRand(day.date.charCodeAt(0)) * 0.006);

  for (let i = 0; i < count; i++) {
    const totalMin = 9 * 60 + 15 + i * intervalMin;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const seed = day.date.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + i;
    const drift = (close - price) / Math.max(1, count - i);
    const move = price * (seededRand(seed) - 0.48) * 0.003 + drift * 0.3;
    const open = price;
    price = Math.max(1, price + move);
    const high = Math.max(open, price) * (1 + seededRand(seed + 1) * 0.001);
    const low = Math.min(open, price) * (1 - seededRand(seed + 2) * 0.001);
    const slice = (i + 1) / count;

    bars.push({
      date: day.date,
      time,
      label: `${day.date} ${time}`,
      symbol: day.symbol,
      spotPrice: Math.round(price),
      open: Math.round(open),
      high: Math.round(high),
      low: Math.round(low),
      close: Math.round(price),
      pcr: Math.round((day.pcr + (slice - 0.5) * 0.04) * 100) / 100,
      maxPain: day.maxPain,
      totalCE_OI: Math.floor(day.totalCE_OI * (0.92 + slice * 0.08)),
      totalPE_OI: Math.floor(day.totalPE_OI * (0.92 + slice * 0.08)),
      volume: Math.floor(day.volume / count),
    });
  }

  if (bars.length) {
    bars[bars.length - 1].close = close;
    bars[bars.length - 1].spotPrice = close;
  }
  return bars;
}

function aggregateBars(bars: OiBar[], periodKey: (b: OiBar) => string): OiBar[] {
  const groups = new Map<string, OiBar[]>();
  bars.forEach((b) => {
    const k = periodKey(b);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(b);
  });

  return [...groups.entries()].map(([key, g]) => {
    const first = g[0];
    const last = g[g.length - 1];
    return {
      date: last.date,
      time: last.time,
      label: key,
      symbol: first.symbol,
      spotPrice: last.close,
      open: first.open,
      high: Math.max(...g.map((x) => x.high)),
      low: Math.min(...g.map((x) => x.low)),
      close: last.close,
      pcr: Math.round((g.reduce((s, x) => s + x.pcr, 0) / g.length) * 100) / 100,
      maxPain: last.maxPain,
      totalCE_OI: Math.floor(g.reduce((s, x) => s + x.totalCE_OI, 0) / g.length),
      totalPE_OI: Math.floor(g.reduce((s, x) => s + x.totalPE_OI, 0) / g.length),
      volume: g.reduce((s, x) => s + x.volume, 0),
    };
  });
}

export function resampleOiToTimeframe(
  daily: HistoricalOIData[],
  timeframe: OiTimeframeId,
  maxBars = 8000,
): OiBar[] {
  if (!daily.length) return [];

  const meta = OI_TIMEFRAMES.find((t) => t.id === timeframe)!;
  let bars: OiBar[] = [];

  if (timeframe === '1D') {
    bars = daily.map(dailyToBar);
  } else if (['1m', '3m', '5m', '15m', '30m', '1H', '4H'].includes(timeframe)) {
    daily.forEach((d) => bars.push(...expandDayIntraday(d, meta.minutes)));
  } else if (timeframe === '1W') {
    const dailyBars = daily.map(dailyToBar);
    bars = aggregateBars(dailyBars, (b) => {
      const dt = new Date(b.date);
      const onejan = new Date(dt.getFullYear(), 0, 1);
      const week = Math.ceil(((dt.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
      return `${dt.getFullYear()}-W${week}`;
    });
  } else if (timeframe === '1M') {
    const dailyBars = daily.map(dailyToBar);
    bars = aggregateBars(dailyBars, (b) => b.date.slice(0, 7));
  }

  if (bars.length > maxBars) {
    const step = Math.ceil(bars.length / maxBars);
    bars = bars.filter((_, i) => i % step === 0);
  }

  return bars;
}

/** Convert holding days to bar count for selected timeframe */
export function holdingDaysToBars(holdingDays: number, timeframe: OiTimeframeId): number {
  const barsPerDay: Record<OiTimeframeId, number> = {
    '1m': 375,
    '3m': 125,
    '5m': 75,
    '15m': 25,
    '30m': 13,
    '1H': 7,
    '4H': 2,
    '1D': 1,
    '1W': 1 / 5,
    '1M': 1 / 22,
  };
  return Math.max(1, Math.round(holdingDays * (barsPerDay[timeframe] || 1)));
}

export function oiBarToHistorical(bar: OiBar): HistoricalOIData {
  const [y, m] = bar.date.split('-').map(Number);
  return {
    date: bar.date,
    year: y,
    month: m,
    symbol: bar.symbol,
    totalCE_OI: bar.totalCE_OI,
    totalPE_OI: bar.totalPE_OI,
    pcr: bar.pcr,
    maxPain: bar.maxPain,
    spotPrice: bar.close,
    volume: bar.volume,
  };
}

export function prepareOiSeries(
  symbol: string,
  timeframe: OiTimeframeId,
  startDate?: string,
  endDate?: string,
  lookbackDays = 0,
): { bars: OiBar[]; daily: HistoricalOIData[] } {
  let daily = loadOiDailyHistory(symbol);
  if (startDate || endDate) {
    daily = filterOiByDateRange(daily, startDate, endDate);
  } else if (lookbackDays > 0) {
    daily = daily.slice(-lookbackDays);
  }
  const bars = resampleOiToTimeframe(daily, timeframe);
  return { bars, daily };
}

/** Downsample for chart rendering */
export function downsampleChartBars<T>(data: T[], maxPoints = 400): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0);
}
