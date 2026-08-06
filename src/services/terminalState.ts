/**
 * Wolf Terminal — local workspace state (symbol, TF, studies, watchlist, panels).
 */

import type { TvChartStyle, TvInterval } from '../utils/tradingViewSymbols';

export type TerminalRightPanel =
  | 'watchlist'
  | 'alerts'
  | 'screeners'
  | 'calendar'
  | 'news'
  | 'notifications'
  | null;

export type TerminalState = {
  symbol: string;
  interval: TvInterval;
  study: string;
  chartStyle: TvChartStyle;
  watchlist: string[];
  /** Right dock open panel (`null` = chrome only). */
  rightPanel: TerminalRightPanel;
  activeRange: string;
  logScale: boolean;
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

const RIGHT_PANELS = new Set([
  'watchlist',
  'alerts',
  'screeners',
  'calendar',
  'news',
  'notifications',
]);

export function defaultTerminalState(): TerminalState {
  return {
    symbol: 'NSE:NIFTY',
    interval: '5',
    study: 'ema,rsi,volume',
    chartStyle: '1',
    watchlist: [...DEFAULT_WATCHLIST],
    rightPanel: 'watchlist',
    activeRange: '1D',
    logScale: false,
  };
}

function parseRightPanel(raw: unknown, fallback: TerminalRightPanel): TerminalRightPanel {
  if (raw === null) return null;
  if (typeof raw === 'string' && RIGHT_PANELS.has(raw)) {
    return raw as Exclude<TerminalRightPanel, null>;
  }
  return fallback;
}

export function loadTerminalState(): TerminalState {
  const base = defaultTerminalState();
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<TerminalState> & { watchlistOpen?: boolean };
    let rightPanel = parseRightPanel(parsed.rightPanel, base.rightPanel);
    if (parsed.rightPanel === undefined && parsed.watchlistOpen === false) {
      rightPanel = null;
    }
    return {
      ...base,
      ...parsed,
      symbol: String(parsed.symbol || base.symbol),
      interval: (parsed.interval || base.interval) as TvInterval,
      study: String(parsed.study ?? base.study),
      chartStyle: (parsed.chartStyle || base.chartStyle) as TvChartStyle,
      watchlist:
        Array.isArray(parsed.watchlist) && parsed.watchlist.length
          ? parsed.watchlist.map(String)
          : base.watchlist,
      rightPanel,
      activeRange: String(parsed.activeRange || base.activeRange),
      logScale: Boolean(parsed.logScale),
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
