/**
 * Market-data provider catalog (server).
 * orderExecution is always false. Only enabled providers can connect.
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

export const INDSTOCKS_PROVIDER = {
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
  notes:
    'Connect with an access token from indstocks.com/app/api-trading/access-tokens. WOLF never asks for MPIN/OTP/TOTP. Official market-data API only — no order calls.',
};

export const BROKER_PROVIDERS = [
  INDSTOCKS_PROVIDER,
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
    notes: 'No public developer API published — cannot connect safely. Coming soon if Sahi opens official market-data APIs.',
  },
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
    notes: 'Not enabled in this build.',
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
    notes: 'Not enabled in this build.',
  },
];

export function listProviders() {
  return [DEMO_PROVIDER, ...BROKER_PROVIDERS];
}

export function getProvider(id) {
  return listProviders().find((p) => p.id === id) || null;
}
