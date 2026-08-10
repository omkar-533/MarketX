/**
 * MarketDataService — facade used by Radar / Analysis (never broker-specific).
 */
import type { MarketDataProvider } from './MarketDataProvider';
import {
  getActiveMarketDataProvider,
  setActiveMarketDataProvider,
} from './MarketDataProvider';
import { HistoricalMarketDataService } from './HistoricalMarketDataService';
import { LiveMarketDataService } from './LiveMarketDataService';
import { UniverseService } from './UniverseService';
import type {
  ConnectionStatus,
  MarketDataMode,
  ProviderCapabilities,
  WolfTimeframe,
} from './types';

export type MarketDataConnectionView = {
  status: ConnectionStatus;
  providerId: string;
  providerName: string;
  mode: MarketDataMode;
  historical: boolean;
  liveQuotes: boolean;
  /** Intentional product line — WOLF never enables orders */
  orderAccess: 'NOT ENABLED';
  message: string;
};

export class MarketDataService {
  readonly historical: HistoricalMarketDataService;
  readonly live: LiveMarketDataService;
  readonly universe: UniverseService;
  private status: ConnectionStatus = 'DISCONNECTED';

  constructor(private provider: MarketDataProvider) {
    this.historical = new HistoricalMarketDataService(provider);
    this.live = new LiveMarketDataService(provider);
    this.universe = new UniverseService(provider);
  }

  getProvider(): MarketDataProvider {
    return this.provider;
  }

  getMode(): MarketDataMode {
    return this.provider.isDemo ? 'DEMO' : 'LIVE';
  }

  getCapabilities(): ProviderCapabilities {
    return this.provider.getCapabilities();
  }

  getSupportedTimeframes(): WolfTimeframe[] {
    return this.provider.getSupportedTimeframes();
  }

  getConnectionView(): MarketDataConnectionView {
    const caps = this.getCapabilities();
    return {
      status: this.status,
      providerId: this.provider.id,
      providerName: this.provider.label,
      mode: this.getMode(),
      historical: caps.historicalCandles,
      liveQuotes: caps.liveQuotes,
      orderAccess: 'NOT ENABLED',
      message:
        this.status === 'CONNECTED'
          ? this.provider.isDemo
            ? 'DEMO MARKET DATA'
            : 'MARKET DATA CONNECTED'
          : this.status === 'CONNECTING'
            ? 'Connecting market data…'
            : 'MARKET DATA DISCONNECTED',
    };
  }

  async connect(): Promise<MarketDataConnectionView> {
    this.status = 'CONNECTING';
    try {
      await this.provider.connect();
      setActiveMarketDataProvider(this.provider);
      this.historical.setProvider(this.provider);
      this.live.setProvider(this.provider);
      this.universe.setProvider(this.provider);
      this.status = 'CONNECTED';
      return this.getConnectionView();
    } catch (e) {
      this.status = 'ERROR';
      throw e;
    }
  }

  async disconnect(): Promise<MarketDataConnectionView> {
    await this.live.disconnect().catch(() => undefined);
    await this.provider.disconnect();
    if (getActiveMarketDataProvider()?.id === this.provider.id) {
      setActiveMarketDataProvider(null);
    }
    this.status = 'DISCONNECTED';
    return this.getConnectionView();
  }

  useProvider(provider: MarketDataProvider) {
    this.provider = provider;
    this.historical.setProvider(provider);
    this.live.setProvider(provider);
    this.universe.setProvider(provider);
    this.status = 'DISCONNECTED';
  }
}

let singleton: MarketDataService | null = null;

export function getMarketDataService(provider?: MarketDataProvider): MarketDataService {
  if (provider) {
    if (!singleton) singleton = new MarketDataService(provider);
    else singleton.useProvider(provider);
  }
  if (!singleton) {
    throw new Error('MarketDataService not initialized — pass a provider once');
  }
  return singleton;
}

export function initMarketDataService(provider: MarketDataProvider): MarketDataService {
  singleton = new MarketDataService(provider);
  return singleton;
}
