/**
 * Broker catalog — READ-ONLY / MARKET-DATA.
 * No password forms. No order methods.
 */
import type { ProviderDescriptor } from '../marketData/types';

export type BrokerId = 'indstocks' | 'sahi' | 'zerodha' | 'upstox' | 'fyers';

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
  notes: 'Simulated data. Never labeled LIVE.',
};

export const BROKER_PROVIDER_CATALOG: ProviderDescriptor[] = [
  {
    id: 'indstocks',
    name: 'INDstocks (INDMoney)',
    authenticationType: 'api_key_session',
    supportedExchanges: ['NSE', 'BSE', 'NFO'],
    supportedTimeframes: ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'],
    capabilities: {
      historicalCandles: true,
      liveQuotes: true,
      bidAsk: true,
      marketDepth: false,
      instrumentList: true,
      marketStatus: false,
      orderExecution: false,
    },
    isDemo: false,
    enabled: true,
    notes: 'Official market-data API via dashboard access token. No MPIN/OTP in WOLF.',
  },
  {
    id: 'sahi',
    name: 'Sahi',
    authenticationType: 'unavailable',
    supportedExchanges: ['NSE', 'BSE', 'NFO'],
    supportedTimeframes: [],
    capabilities: {
      historicalCandles: false,
      liveQuotes: false,
      bidAsk: false,
      marketDepth: false,
      instrumentList: false,
      marketStatus: false,
      orderExecution: false,
    },
    isDemo: false,
    enabled: false,
    notes: 'No public developer API — cannot connect.',
  },
];
