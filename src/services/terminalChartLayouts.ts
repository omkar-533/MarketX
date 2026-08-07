/** Multi-chart layout presets for Wolf Terminal. */

export const TERMINAL_CHART_COUNTS = [1, 2, 3, 4, 6, 8, 10, 12, 16] as const;

export type TerminalChartCount = (typeof TERMINAL_CHART_COUNTS)[number];

export function isTerminalChartCount(n: unknown): n is TerminalChartCount {
  return typeof n === 'number' && (TERMINAL_CHART_COUNTS as readonly number[]).includes(n);
}

/** CSS grid columns for each pane count. */
export function chartLayoutCols(count: TerminalChartCount): number {
  switch (count) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return 3;
    case 4:
      return 2;
    case 6:
      return 3;
    case 8:
      return 4;
    case 10:
      return 5;
    case 12:
      return 4;
    case 16:
      return 4;
    default:
      return 1;
  }
}

export function chartLayoutRows(count: TerminalChartCount): number {
  return Math.ceil(count / chartLayoutCols(count));
}

/** Visual mini-grid cells for the layout picker button. */
export function chartLayoutPreview(count: TerminalChartCount): { cols: number; rows: number } {
  return { cols: chartLayoutCols(count), rows: chartLayoutRows(count) };
}

/**
 * Ensure `symbols` length === count, filling from watchlist / active symbol.
 */
export function resizeChartSymbols(
  symbols: string[],
  count: TerminalChartCount,
  fillFrom: string[],
  activeSymbol: string,
): string[] {
  const next = symbols.slice(0, count).map((s) => String(s || '').trim()).filter(Boolean);
  const pool = [
    activeSymbol,
    ...fillFrom,
    'NSE:NIFTY',
    'NSE:BANKNIFTY',
    'BINANCE:BTCUSDT',
    'OANDA:XAUUSD',
  ]
    .map(String)
    .filter(Boolean);

  let i = 0;
  while (next.length < count) {
    const candidate = pool[i % pool.length] || activeSymbol || 'NSE:NIFTY';
    // Prefer unused symbols when possible
    const unused = pool.find((s) => !next.includes(s));
    next.push(unused || candidate);
    i += 1;
  }
  return next;
}
