/**
 * Broker catalog — READ-ONLY / MARKET-DATA placeholders.
 * No password forms. No order methods. Official OAuth only when Phase 12 enables a broker.
 */
import type { ProviderDescriptor } from '../marketData/types';

export type BrokerId = 'zerodha' | 'angelone' | 'upstox' | 'fyers';

const UNAVAILABLE_CAPS = {
  historicalCandles: false,
  liveQuotes: false,
  bidAsk: false,
  marketDepth: false,
  instrumentList: false,
  marketStatus: false,
  orderExecution: false as const,
};

/** Future broker slots — enabled:false until official API adapter ships. */
export const BROKER_PROVIDER_CATALOG: ProviderDescriptor[] = [
  {
    id: 'zerodha',
    name: 'Zerodha Kite Connect',
    authenticationType: 'unavailable',
    supportedExchanges: ['NSE', 'BSE', 'NFO'],
    supportedTimeframes: ['1m', '3m', '5m', '15m', '30m', '1h', '1D'],
    capabilities: { ...UNAVAILABLE_CAPS },
    isDemo: false,
    enabled: false,
    notes: 'Not enabled. Official Kite Connect integration planned — no fake connect.',
  },
  {
    id: 'upstox',
    name: 'Upstox',
    authenticationType: 'unavailable',
    supportedExchanges: ['NSE', 'BSE', 'NFO'],
    supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '1D'],
    capabilities: { ...UNAVAILABLE_CAPS },
    isDemo: false,
    enabled: false,
    notes: 'Not enabled. Official API only when configured.',
  },
  {
    id: 'angelone',
    name: 'Angel One',
    authenticationType: 'unavailable',
    supportedExchanges: ['NSE', 'BSE', 'NFO'],
    supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '1D'],
    capabilities: { ...UNAVAILABLE_CAPS },
    isDemo: false,
    enabled: false,
    notes: 'Not enabled.',
  },
  {
    id: 'fyers',
    name: 'Fyers',
    authenticationType: 'unavailable',
    supportedExchanges: ['NSE', 'BSE', 'NFO'],
    supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '1D'],
    capabilities: { ...UNAVAILABLE_CAPS },
    isDemo: false,
    enabled: false,
    notes: 'Not enabled. Legacy session hooks are not Radar live data.',
  },
];

export const DEMO_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'mock-demo',
  name: 'Demo Market Data',
  authenticationType: 'none',
  supportedExchanges: ['NSE', 'BSE'],
  supportedTimeframes: ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'],
  capabilities: {
    historicalCandles: true,
    liveQuotes: false,
    bidAsk: false,
    marketDepth: false,
    instrumentList: true,
    marketStatus: true,
    orderExecution: false,
  },
  isDemo: true,
  enabled: true,
  notes: 'Simulated data for Radar development. Never labeled LIVE.',
};
