/**
 * Re-export MarketDataProvider from marketData (single source of truth).
 * Radar / scanner keep importing from this path for compatibility.
 */
export type {
  MarketDataProvider,
  ProviderRegistry,
  QuoteSubscriptionCallback,
} from '../marketData/MarketDataProvider';
export {
  getActiveMarketDataProvider,
  setActiveMarketDataProvider,
  requireActiveOrDemo,
  DEFAULT_DEMO_CAPABILITIES,
  ALL_WOLF_TIMEFRAMES,
} from '../marketData/MarketDataProvider';
