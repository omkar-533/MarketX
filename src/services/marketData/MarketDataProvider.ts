/**
 * MarketDataProvider — READ-ONLY vendor-agnostic interface.
 * Scanner / Radar MUST only depend on this contract.
 * DO NOT add placeOrder / modifyOrder / cancelOrder / executeTrade.
 */
import type { Candle, RadarMarket, RadarTimeframe, RadarUniverse } from '../radar/radarTypes';
import type {
  MarketStatusInfo,
  NormalizedInstrument,
  NormalizedQuote,
  ProviderCapabilities,
  WolfTimeframe,
} from './types';
import { DEFAULT_DEMO_CAPABILITIES, ALL_WOLF_TIMEFRAMES } from './types';

export type QuoteSubscriptionCallback = (quote: NormalizedQuote) => void;

export interface MarketDataProvider {
  readonly id: string;
  readonly label: string;
  /** True when this provider serves DEMO / simulated data only */
  readonly isDemo: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  getQuote(symbol: string): Promise<NormalizedQuote>;
  getHistoricalCandles(
    symbol: string,
    timeframe: RadarTimeframe | WolfTimeframe,
    from: number,
    to: number,
  ): Promise<Candle[]>;
  /** Convenience used by scanner — bars count instead of from/to */
  getCandles(symbol: string, timeframe: RadarTimeframe, bars?: number): Promise<Candle[]>;

  getInstrumentList(): Promise<NormalizedInstrument[]>;
  getSymbols(universe: RadarUniverse, market?: RadarMarket): Promise<string[]>;
  getMarketStatus(exchange?: string): Promise<MarketStatusInfo>;

  subscribeQuotes(symbols: string[], callback: QuoteSubscriptionCallback): Promise<string>;
  unsubscribeQuotes(subscriptionId: string): Promise<void>;

  getSupportedTimeframes(): WolfTimeframe[];
  getCapabilities(): ProviderCapabilities;
}

export type ProviderRegistry = {
  active: MarketDataProvider;
};

let activeProvider: MarketDataProvider | null = null;

export function getActiveMarketDataProvider(): MarketDataProvider | null {
  return activeProvider;
}

export function setActiveMarketDataProvider(provider: MarketDataProvider | null): void {
  activeProvider = provider;
}

export function requireActiveOrDemo(fallback: MarketDataProvider): MarketDataProvider {
  return activeProvider ?? fallback;
}

export { DEFAULT_DEMO_CAPABILITIES, ALL_WOLF_TIMEFRAMES };
