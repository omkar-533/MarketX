/**
 * Wolf Terminal — local workspace state (symbol, TF, studies, watchlist, panels).
 */

import type { TvChartStyle, TvInterval } from '../utils/tradingViewSymbols';
import {
  isTerminalChartCount,
  resizeChartSymbols,
  type TerminalChartCount,
} from './terminalChartLayouts';

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
  /** How many charts to show in the desk grid. */
  chartCount: TerminalChartCount;
  /** Symbol per grid pane (length matches chartCount when multi). */
  chartSymbols: string[];
  /** Which grid pane receives top-bar symbol / timeframe edits. */
  activeChartIndex: number;
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
    chartCount: 1,
    chartSymbols: ['NSE:NIFTY'],
    activeChartIndex: 0,
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
    const chartCount = isTerminalChartCount(Number(parsed.chartCount))
      ? (Number(parsed.chartCount) as TerminalChartCount)
      : base.chartCount;
    const symbol = String(parsed.symbol || base.symbol);
    const watchlist =
      Array.isArray(parsed.watchlist) && parsed.watchlist.length
        ? parsed.watchlist.map(String)
        : base.watchlist;
    const chartSymbols = resizeChartSymbols(
      Array.isArray(parsed.chartSymbols) ? parsed.chartSymbols.map(String) : [symbol],
      chartCount,
      watchlist,
      symbol,
    );
    const activeChartIndex = Math.min(
      Math.max(0, Number(parsed.activeChartIndex) || 0),
      Math.max(0, chartCount - 1),
    );
    return {
      ...base,
      ...parsed,
      symbol,
      interval: (parsed.interval || base.interval) as TvInterval,
      study: String(parsed.study ?? base.study),
      chartStyle: (parsed.chartStyle || base.chartStyle) as TvChartStyle,
      watchlist,
      rightPanel,
      activeRange: String(parsed.activeRange || base.activeRange),
      logScale: Boolean(parsed.logScale),
      chartCount,
      chartSymbols,
      activeChartIndex,
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
