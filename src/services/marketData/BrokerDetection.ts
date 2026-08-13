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

const NONE_CAPS: CatalogProvider['capabilities'] = {
  historicalCandles: false,
  liveQuotes: false,
  bidAsk: false,
  marketDepth: false,
  instrumentList: false,
  marketStatus: false,
  orderExecution: false,
};

function locked(id: string, name: string, notes?: string): CatalogProvider {
  return {
    id,
    name,
    authenticationType: 'unavailable',
    supportedExchanges: ['NSE', 'BSE'],
    supportedTimeframes: [],
    capabilities: NONE_CAPS,
    isDemo: false,
    enabled: false,
    notes: notes || 'No official market-data connection in WOLF yet.',
  };
}

/** Indian-market brokers shown in DETECT. Only INDstocks is connectable today. */
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
    notes: 'Connect with an official access token from indstocks.com.',
  },
  locked('zerodha', 'Zerodha Kite', 'Kite Connect OAuth is not enabled in this build.'),
  locked('groww', 'Groww', 'No official WOLF market-data API yet.'),
  locked('upstox', 'Upstox', 'Official OAuth is not enabled in this build.'),
  locked('angelone', 'Angel One', 'No official WOLF market-data API yet.'),
  locked('dhan', 'Dhan', 'No official WOLF market-data API yet.'),
  locked('fyers', 'Fyers', 'No official WOLF market-data API yet.'),
  locked('5paisa', '5paisa', 'No official WOLF market-data API yet.'),
  locked('aliceblue', 'Alice Blue', 'No official WOLF market-data API yet.'),
  locked('motilal', 'Motilal Oswal', 'No official WOLF market-data API yet.'),
  locked('icicidirect', 'ICICI Direct', 'No official WOLF market-data API yet.'),
  locked('hdfcsec', 'HDFC Securities', 'No official WOLF market-data API yet.'),
  locked('kotaksec', 'Kotak Securities', 'No official WOLF market-data API yet.'),
  locked('sharekhan', 'Sharekhan', 'No official WOLF market-data API yet.'),
  locked('iifl', 'IIFL Securities', 'No official WOLF market-data API yet.'),
  locked('paytmmoney', 'Paytm Money', 'No official WOLF market-data API yet.'),
  locked('samco', 'SAMCO', 'No official WOLF market-data API yet.'),
  locked('axisdirect', 'Axis Direct', 'No official WOLF market-data API yet.'),
  locked('sbisec', 'SBI Securities', 'No official WOLF market-data API yet.'),
  locked('mstock', 'm.Stock (Mirae)', 'No official WOLF market-data API yet.'),
  locked('shoonya', 'Shoonya', 'No official WOLF market-data API yet.'),
  locked('geojit', 'Geojit', 'No official WOLF market-data API yet.'),
  locked('choice', 'Choice Broking', 'No official WOLF market-data API yet.'),
  locked('nuvama', 'Nuvama', 'No official WOLF market-data API yet.'),
  locked('anandrathi', 'Anand Rathi', 'No official WOLF market-data API yet.'),
  locked('nirmalbang', 'Nirmal Bang', 'No official WOLF market-data API yet.'),
  locked('ventura', 'Ventura', 'No official WOLF market-data API yet.'),
  locked('adityabirla', 'Aditya Birla Money', 'No official WOLF market-data API yet.'),
  locked('bajajsec', 'Bajaj Broking', 'No official WOLF market-data API yet.'),
  locked('yessec', 'YES Securities', 'No official WOLF market-data API yet.'),
  locked('religare', 'Religare Broking', 'No official WOLF market-data API yet.'),
  locked('smc', 'SMC Global', 'No official WOLF market-data API yet.'),
  locked('mastertrust', 'MasterTrust', 'No official WOLF market-data API yet.'),
  locked('tradejini', 'Tradejini', 'No official WOLF market-data API yet.'),
  locked('pocketful', 'Pocketful', 'No official WOLF market-data API yet.'),
  locked('sahi', 'Sahi', 'Unsupported — no official public market-data API.'),
  locked('jainam', 'Jainam Broking', 'No official WOLF market-data API yet.'),
  locked('bigul', 'Bigul', 'No official WOLF market-data API yet.'),
  locked('navia', 'Navia (Tradeplus)', 'No official WOLF market-data API yet.'),
  locked('flattrade', 'FlatTrade', 'No official WOLF market-data API yet.'),
  locked('enrich', 'Enrich Money', 'No official WOLF market-data API yet.'),
  locked('zebu', 'Zebu', 'No official WOLF market-data API yet.'),
  locked('wisdom', 'Wisdom Capital', 'No official WOLF market-data API yet.'),
  locked('profitmart', 'Profitmart', 'No official WOLF market-data API yet.'),
  locked('definedge', 'Definedge', 'No official WOLF market-data API yet.'),
  locked('jmfinancial', 'JM Financial', 'No official WOLF market-data API yet.'),
  locked('dhani', 'Dhani Stocks', 'No official WOLF market-data API yet.'),
  locked('globecap', 'Globe Capital', 'No official WOLF market-data API yet.'),
  locked('emkay', 'Emkay Global', 'No official WOLF market-data API yet.'),
  locked('shareindia', 'Share India', 'No official WOLF market-data API yet.'),
  locked('monarch', 'Monarch Networth', 'No official WOLF market-data API yet.'),
  locked('arihant', 'Arihant Capital', 'No official WOLF market-data API yet.'),
  locked('bonanza', 'Bonanza Portfolio', 'No official WOLF market-data API yet.'),
  locked('reliancesec', 'Reliance Securities', 'No official WOLF market-data API yet.'),
  locked('tradesmart', 'TradeSmart', 'No official WOLF market-data API yet.'),
  locked('marwadi', 'Marwadi Shares', 'No official WOLF market-data API yet.'),
  locked('swastika', 'Swastika Investmart', 'No official WOLF market-data API yet.'),
  locked('prabhudas', 'Prabhudas Lilladher', 'No official WOLF market-data API yet.'),
  locked('phillipcap', 'PhillipCapital', 'No official WOLF market-data API yet.'),
  locked('incred', 'InCred', 'No official WOLF market-data API yet.'),
  locked('njindia', 'NJ India Invest', 'No official WOLF market-data API yet.'),
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
    merged.push({ ...extra, enabled: false, isDemo: false });
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

  const brokers = mergeIndianCatalog(fromApi);
  const lastPreferredId = loadPreferredBrokerId();
  const connectable = brokers.filter((b) => b.enabled && !isDemoProvider(b));

  return {
    brokers,
    lastPreferredId,
    connectable,
    detectedLiveBrokerLogin: false,
    message:
      'Showing Indian-market brokers. Only officially supported sources can authorize. Other-tab logins are never read.',
  };
}
