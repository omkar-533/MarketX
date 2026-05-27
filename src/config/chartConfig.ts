import type { ChartIndicator, ChartTimeframe, ChartType } from '../types/chart';

export const CHART_TIMEFRAMES: { id: ChartTimeframe; label: string; seconds: number }[] = [
  { id: '1m', label: '1m', seconds: 60 },
  { id: '3m', label: '3m', seconds: 180 },
  { id: '5m', label: '5m', seconds: 300 },
  { id: '15m', label: '15m', seconds: 900 },
  { id: '30m', label: '30m', seconds: 1800 },
  { id: '1H', label: '1H', seconds: 3600 },
  { id: '4H', label: '4H', seconds: 14400 },
  { id: '1D', label: '1D', seconds: 86400 },
  { id: '1W', label: '1W', seconds: 604800 },
];

export const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: 'candle', label: 'Candles' },
  { id: 'heikin', label: 'Heikin Ashi' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
];

export const CHART_INDICATORS: { id: ChartIndicator; label: string }[] = [
  { id: 'ema20', label: 'EMA 20' },
  { id: 'ema50', label: 'EMA 50' },
  { id: 'sma20', label: 'SMA 20' },
  { id: 'vwap', label: 'VWAP' },
  { id: 'bb', label: 'Bollinger' },
  { id: 'rsi', label: 'RSI 14' },
];

export const CHART_DATA_SOURCES = [
  { id: 'platform' as const, label: 'Platform Live', description: 'Master TradeX live quotes + history' },
  { id: 'broker' as const, label: 'Broker / API', description: 'Your broker feed (configure API)' },
];

export function timeframeSeconds(tf: ChartTimeframe): number {
  return CHART_TIMEFRAMES.find((t) => t.id === tf)?.seconds ?? 900;
}
