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

/** Brokers WOLF can actually authorize today. Locked/demo sources are never listed. */
export const INDIAN_BROKER_CATALOG: CatalogProvider[] = [
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
    notes: 'Official live market-data API. Connect with an access token from indstocks.com.',
  },
];

function isDemoProvider(b: CatalogProvider) {
  return b.isDemo || b.id === 'mock-demo' || /demo/i.test(b.name);
}

function mergeIndianCatalog(fromApi: CatalogProvider[]): CatalogProvider[] {
  const api = fromApi.filter((b) => !isDemoProvider(b));
  const apiById = new Map(api.map((b) => [b.id, b]));
  const merged = INDIAN_BROKER_CATALOG.map((local) => {
    const remote = apiById.get(local.id);
    if (!remote) return local;
    return {
      ...local,
      ...remote,
      name: remote.name || local.name,
      enabled: local.enabled,
      isDemo: false,
    };
  });
  const known = new Set(INDIAN_BROKER_CATALOG.map((b) => b.id));
  for (const extra of api) {
    if (known.has(extra.id)) continue;
    if (!extra.enabled || isDemoProvider(extra)) continue;
    merged.push({ ...extra, isDemo: false });
  }
  return merged;
}

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
  let fromApi: CatalogProvider[] = [];
  try {
    fromApi = await fetchMarketDataProviders();
  } catch {
    fromApi = [];
  }

  const merged = mergeIndianCatalog(fromApi);
  const lastPreferredId = loadPreferredBrokerId();
  const connectable = merged.filter((b) => b.enabled && !isDemoProvider(b));

  return {
    brokers: connectable,
    lastPreferredId,
    connectable,
    detectedLiveBrokerLogin: false,
    message:
      'Only live market-data APIs that WOLF already supports are listed. Other-tab broker logins are never read.',
  };
}
