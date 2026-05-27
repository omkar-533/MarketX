export type ChartTimeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D' | '1W';

export type ChartType = 'candle' | 'heikin' | 'line' | 'area';

export type ChartIndicator = 'ema20' | 'ema50' | 'sma20' | 'rsi' | 'bb' | 'vwap';

/** Where OHLCV is fetched from — extend with real broker adapters */
export type ChartDataSource = 'platform' | 'broker';

export interface ChartBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartSeriesBundle {
  bars: ChartBar[];
  symbol: string;
  timeframe: ChartTimeframe;
  source: ChartDataSource;
  lastUpdate: string;
}
