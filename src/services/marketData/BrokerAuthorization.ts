/**
 * BrokerAuthorization — official auth only.
 *
 * Priority:
 * 1) OAuth / official API token handoff
 * 2) Broker-provided browser extension (none available yet)
 * 3) Explicit Connect wizard for official token mechanisms
 *
 * NEVER: passwords, OTP, PIN, TOTP, cookie scrape, private APIs.
 */
import {
  connectDemoMarketData,
  connectIndstocksMarketData,
  disconnectMarketData,
  type CatalogProvider,
  type ServerConnectionStatus,
} from './marketDataApi';
import { rememberPreferredBroker } from './BrokerDetection';
import { initMarketDataService } from './MarketDataService';
import { mockMarketDataProvider } from '../radar/MockMarketDataProvider';
import { serverMarketDataProvider } from './ServerMarketDataProvider';

export type AuthMechanism =
  | 'none'
  | 'oauth2'
  | 'official_access_token'
  | 'browser_extension'
  | 'unavailable';

export type AuthorizationPlan = {
  providerId: string;
  name: string;
  mechanism: AuthMechanism;
  canAuthorize: boolean;
  steps: string[];
  docsUrl?: string;
  tokenPortalUrl?: string;
  unsupportedReason?: string;
};

export function planAuthorization(provider: CatalogProvider): AuthorizationPlan {
  if (provider.id === 'mock-demo' || provider.isDemo) {
    return {
      providerId: provider.id,
      name: provider.name,
      mechanism: 'none',
      canAuthorize: true,
      steps: ['Activate DEMO market data (simulated — never labeled LIVE).'],
    };
  }

  if (provider.id === 'indstocks' && provider.enabled) {
    return {
      providerId: 'indstocks',
      name: provider.name,
      mechanism: 'official_access_token',
      canAuthorize: true,
      docsUrl: 'https://api-docs.indstocks.com/',
      tokenPortalUrl: 'https://indstocks.com/app/api-trading/access-tokens',
      steps: [
        'Open the official INDstocks Access Tokens page (new tab).',
        'Generate a token using their official flow while logged into INDstocks.',
        'Paste that access token into WOLF once — it is sent to WOLF server only.',
        'WOLF never collects MPIN, OTP, or TOTP.',
      ],
    };
  }

  if (provider.authenticationType === 'oauth2' && provider.enabled) {
    return {
      providerId: provider.id,
      name: provider.name,
      mechanism: 'oauth2',
      canAuthorize: false,
      unsupportedReason: 'OAuth redirect is not configured for this broker yet.',
      steps: ['Official OAuth will open the broker authorization page when enabled.'],
    };
  }

  return {
    providerId: provider.id,
    name: provider.name,
    mechanism: 'unavailable',
    canAuthorize: false,
    unsupportedReason:
      provider.notes ||
      'No officially supported market-data authorization mechanism is available.',
    steps: ['Marked unsupported — waiting for an official API / OAuth / extension.'],
  };
}

export type AuthorizeResult = {
  ok: boolean;
  status: ServerConnectionStatus;
  error?: string;
};

/**
 * Run official authorization. Detection must already have selected a provider.
 * `accessToken` only for brokers whose official mechanism is dashboard token paste.
 */
export async function authorizeMarketData(
  provider: CatalogProvider,
  opts?: { accessToken?: string },
): Promise<AuthorizeResult> {
  const plan = planAuthorization(provider);
  if (!plan.canAuthorize) {
    return {
      ok: false,
      status: disconnectedStatus(),
      error: plan.unsupportedReason || 'Broker unsupported',
    };
  }

  if (plan.mechanism === 'none') {
    try {
      const status = await connectDemoMarketData();
      const svc = initMarketDataService(mockMarketDataProvider);
      await svc.authenticate();
      rememberPreferredBroker(provider.id);
      return { ok: true, status };
    } catch {
      const svc = initMarketDataService(mockMarketDataProvider);
      await svc.authenticate();
      rememberPreferredBroker(provider.id);
      return {
        ok: true,
        status: {
          status: 'CONNECTED',
          providerId: 'mock-demo',
          providerName: 'Demo Market Data',
          mode: 'DEMO',
          historical: true,
          liveQuotes: false,
          orderAccess: 'NOT ENABLED',
          message: 'DEMO MARKET DATA',
        },
      };
    }
  }

  if (plan.mechanism === 'official_access_token' && provider.id === 'indstocks') {
    const token = String(opts?.accessToken || '').trim();
    if (token.length < 12) {
      return {
        ok: false,
        status: disconnectedStatus(),
        error: 'Paste the official INDstocks access token to continue.',
      };
    }
    try {
      const status = await connectIndstocksMarketData(token);
      const svc = initMarketDataService(serverMarketDataProvider);
      await svc.authenticate();
      rememberPreferredBroker('indstocks');
      return { ok: true, status };
    } catch (e) {
      return {
        ok: false,
        status: disconnectedStatus(),
        error: e instanceof Error ? e.message : 'Authorization failed',
      };
    }
  }

  return {
    ok: false,
    status: disconnectedStatus(),
    error: 'No official authorization path available.',
  };
}

export async function revokeMarketDataAuthorization(): Promise<ServerConnectionStatus> {
  try {
    const status = await disconnectMarketData();
    try {
      const svc = initMarketDataService(mockMarketDataProvider);
      await svc.disconnect();
    } catch {
      /* ignore */
    }
    return status;
  } catch {
    return disconnectedStatus();
  }
}

function disconnectedStatus(): ServerConnectionStatus {
  return {
    status: 'DISCONNECTED',
    providerId: null,
    providerName: null,
    mode: null,
    historical: false,
    liveQuotes: false,
    orderAccess: 'NOT ENABLED',
    message: 'MARKET DATA DISCONNECTED',
  };
}
