import type { FnoInstrumentType } from '../data/fnoUniverse';

/** Map app symbols → TradingView exchange symbols (NSE/BSE) */
const INDEX_TV: Record<string, string> = {
  NIFTY: 'NSE:NIFTY',
  BANKNIFTY: 'NSE:BANKNIFTY',
  FINNIFTY: 'NSE:FINNIFTY',
  MIDCPNIFTY: 'NSE:MIDCPNIFTY',
  NIFTYNXT50: 'NSE:NIFTYNXT50',
  SENSEX: 'BSE:SENSEX',
  BANKEX: 'BSE:BANKEX',
};

export type TvChartStyle = '0' | '1' | '2' | '3' | '8' | '9' | '10';

export const TV_CHART_STYLES: { id: TvChartStyle; label: string }[] = [
  { id: '1', label: 'Candles' },
  { id: '8', label: 'Heikin Ashi' },
  { id: '9', label: 'Hollow Candles' },
  { id: '0', label: 'Bars' },
  { id: '2', label: 'Line' },
  { id: '3', label: 'Area' },
  { id: '10', label: 'Baseline' },
];

export type TvInterval =
  | '1'
  | '3'
  | '5'
  | '15'
  | '30'
  | '60'
  | '120'
  | '240'
  | 'D'
  | 'W'
  | 'M';

export const TV_TIMEFRAMES: { id: TvInterval; label: string }[] = [
  { id: '1', label: '1m' },
  { id: '3', label: '3m' },
  { id: '5', label: '5m' },
  { id: '15', label: '15m' },
  { id: '30', label: '30m' },
  { id: '60', label: '1H' },
  { id: '120', label: '2H' },
  { id: '240', label: '4H' },
  { id: 'D', label: '1D' },
  { id: 'W', label: '1W' },
  { id: 'M', label: '1M' },
];

export const TV_STUDY_PRESETS: { id: string; label: string; studies: string[] }[] = [
  { id: 'none', label: 'No preset', studies: [] },
  { id: 'ema', label: 'EMA', studies: ['STD;EMA@tv-basicstudies'] },
  { id: 'rsi', label: 'RSI', studies: ['STD;RSI@tv-basicstudies'] },
  { id: 'macd', label: 'MACD', studies: ['STD;MACD@tv-basicstudies'] },
  { id: 'bb', label: 'Bollinger Bands', studies: ['STD;Bollinger Bands@tv-basicstudies'] },
  { id: 'vwap', label: 'VWAP', studies: ['STD;VWAP@tv-basicstudies'] },
  { id: 'supertrend', label: 'Supertrend', studies: ['STD;Supertrend@tv-basicstudies'] },
  { id: 'ichimoku', label: 'Ichimoku', studies: ['STD;Ichimoku Cloud@tv-basicstudies'] },
  { id: 'volume', label: 'Volume', studies: ['STD;Volume@tv-basicstudies'] },
];

export function toTradingViewSymbol(symbol: string, type?: FnoInstrumentType): string {
  const sym = symbol.trim().toUpperCase();
  if (INDEX_TV[sym]) return INDEX_TV[sym];
  if (type === 'index') return `NSE:${sym}`;
  return `NSE:${sym}`;
}

/** Parse user input: NIFTY, NSE:NIFTY, RELIANCE */
export function parseTradingViewInput(input: string): string {
  const raw = input.trim().toUpperCase();
  if (!raw) return 'NSE:NIFTY';
  if (raw.includes(':')) return raw;
  return toTradingViewSymbol(raw);
}
