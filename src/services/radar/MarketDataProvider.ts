import type { Candle, RadarMarket, RadarTimeframe, RadarUniverse } from './radarTypes';

/**
 * MarketDataProvider — vendor-agnostic market data interface.
 * Swap MockMarketDataProvider → Licensed / Broker adapters later
 * without rewriting the scanner UI.
 */
export interface MarketDataProvider {
  readonly id: string;
  readonly label: string;
  /** True when this provider serves DEMO / simulated data only */
  readonly isDemo: boolean;

  getQuote(symbol: string): Promise<{ symbol: string; price: number; changePercent: number }>;
  getCandles(symbol: string, timeframe: RadarTimeframe, bars?: number): Promise<Candle[]>;
  getSymbols(universe: RadarUniverse, market?: RadarMarket): Promise<string[]>;
}

export type ProviderRegistry = {
  active: MarketDataProvider;
};
