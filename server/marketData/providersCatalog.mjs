/**
 * Market-data provider catalog (server).
 * orderExecution is always false. Brokers stay disabled until official adapters ship.
 */

export const DEMO_PROVIDER = {
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
  notes: 'Simulated data for development. Never labeled LIVE.',
};

export const BROKER_PROVIDERS = [
  {
    id: 'zerodha',
    name: 'Zerodha Kite Connect',
    authenticationType: 'oauth2',
    supportedExchanges: ['NSE', 'BSE', 'NFO'],
    supportedTimeframes: ['1m', '3m', '5m', '15m', '30m', '1h', '1D'],
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
    notes: 'Not enabled yet. Official Kite Connect only — no password forms.',
  },
  {
    id: 'upstox',
    name: 'Upstox',
    authenticationType: 'oauth2',
    supportedExchanges: ['NSE', 'BSE', 'NFO'],
    supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '1D'],
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
    notes: 'Not enabled yet.',
  },
  {
    id: 'angelone',
    name: 'Angel One',
    authenticationType: 'api_key_session',
    supportedExchanges: ['NSE', 'BSE', 'NFO'],
    supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '1D'],
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
    notes: 'Not enabled yet.',
  },
  {
    id: 'fyers',
    name: 'Fyers',
    authenticationType: 'oauth2',
    supportedExchanges: ['NSE', 'BSE', 'NFO'],
    supportedTimeframes: ['1m', '5m', '15m', '30m', '1h', '1D'],
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
    notes: 'Not enabled yet.',
  },
];

export function listProviders() {
  return [DEMO_PROVIDER, ...BROKER_PROVIDERS];
}

export function getProvider(id) {
  return listProviders().find((p) => p.id === id) || null;
}
