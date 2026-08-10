/**
 * BrokerDetection — catalog + preference hints ONLY.
 *
 * NEVER scrapes broker cookies / localStorage / other-tab sessions.
 * Detection is NOT authorization.
 */
import type { CatalogProvider } from './marketDataApi';
import { fetchMarketDataProviders } from './marketDataApi';

const LAST_BROKER_KEY = 'wolf_md_last_broker_v1';

export type DetectionResult = {
  /** Supported + unsupported catalog entries */
  brokers: CatalogProvider[];
  /** Previously chosen provider id (preference only) */
  lastPreferredId: string | null;
  /** Brokers WOLF can actually authorize today */
  connectable: CatalogProvider[];
  /** Explicit: we did NOT detect a live broker website login */
  detectedLiveBrokerLogin: false;
  message: string;
};

export function rememberPreferredBroker(providerId: string): void {
  try {
    localStorage.setItem(LAST_BROKER_KEY, providerId);
  } catch {
    /* ignore */
  }
}

export function loadPreferredBrokerId(): string | null {
  try {
    return localStorage.getItem(LAST_BROKER_KEY);
  } catch {
    return null;
  }
}

export async function detectSupportedBrokers(): Promise<DetectionResult> {
  let brokers: CatalogProvider[] = [];
  try {
    brokers = await fetchMarketDataProviders();
  } catch {
    brokers = FALLBACK_CATALOG;
  }

  const lastPreferredId = loadPreferredBrokerId();
  const connectable = brokers.filter((b) => b.enabled);

  return {
    brokers,
    lastPreferredId,
    connectable,
    detectedLiveBrokerLogin: false,
    message:
      'Showing WOLF-supported market-data sources. Other-tab broker logins are never read or reused.',
  };
}

const FALLBACK_CATALOG: CatalogProvider[] = [
  {
    id: 'mock-demo',
    name: 'Demo Market Data',
    authenticationType: 'none',
    supportedExchanges: ['NSE', 'BSE'],
    supportedTimeframes: ['1m', '5m', '15m', '1h', '1D'],
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
    notes: 'Simulated — not live market data.',
  },
  {
    id: 'indstocks',
    name: 'INDstocks (INDMoney)',
    authenticationType: 'api_key_session',
    supportedExchanges: ['NSE', 'BSE', 'NFO'],
    supportedTimeframes: ['1m', '5m', '15m', '1h', '1D'],
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
    notes: 'Official dashboard access-token flow.',
  },
  {
    id: 'sahi',
    name: 'Sahi',
    authenticationType: 'unavailable',
    supportedExchanges: [],
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
    notes: 'Unsupported — no official public market-data API.',
  },
];
