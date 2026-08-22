/**
 * Wolf Terminal — local workspace state (symbol, TF, studies, watchlist).
 */

import type { TvChartStyle, TvInterval } from '../utils/tradingViewSymbols';

export type TerminalState = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  watchlist: string[];
  watchlistOpen: boolean;
};

const STORAGE = 'wolf.terminal.state';

const DEFAULT_WATCHLIST = [
  'NSE:NIFTY',
  'NSE:BANKNIFTY',
  'NSE:RELIANCE',
  'NSE:HDFCBANK',
  'NSE:TCS',
  'NSE:INFY',
  'BINANCE:BTCUSDT',
  'OANDA:XAUUSD',
];

export function defaultTerminalState(): TerminalState {
  return {
    symbol: 'NSE:NIFTY',
    interval: '5',
    study: 'ema,rsi',
    chartStyle: '1',
    watchlist: [...DEFAULT_WATCHLIST],
    watchlistOpen: true,
  };
}

export function loadTerminalState(): TerminalState {
  const base = defaultTerminalState();
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<TerminalState>;
    return {
      ...base,
      ...parsed,
      symbol: String(parsed.symbol || base.symbol),
      interval: (parsed.interval || base.interval) as TvInterval,
      study: String(parsed.study ?? base.study),
      chartStyle: (parsed.chartStyle || base.chartStyle) as TvChartStyle,
      watchlist: Array.isArray(parsed.watchlist) && parsed.watchlist.length
        ? parsed.watchlist.map(String)
        : base.watchlist,
      watchlistOpen: parsed.watchlistOpen !== false,
    };
  } catch {
    return base;
  }
}

export function saveTerminalState(state: TerminalState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}
