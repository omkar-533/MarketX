/**
 * LiveMarketDataService — subscription + connection state shell.
 * Demo provider does NOT claim live streams.
 */
import type { MarketDataProvider, QuoteSubscriptionCallback } from './MarketDataProvider';
import type { LiveConnectionState, NormalizedQuote } from './types';
import { demoRateLimitManager } from './RateLimitManager';

export class LiveMarketDataService {
  private state: LiveConnectionState = 'DISCONNECTED';
  private subscriptions = new Map<string, { symbols: string[]; callback: QuoteSubscriptionCallback }>();
  private listeners = new Set<(s: LiveConnectionState) => void>();

  constructor(private provider: MarketDataProvider) {}

  setProvider(provider: MarketDataProvider) {
    this.provider = provider;
  }

  getState(): LiveConnectionState {
    return this.state;
  }

  onStateChange(fn: (s: LiveConnectionState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setState(s: LiveConnectionState) {
    this.state = s;
    for (const l of this.listeners) l(s);
  }

  async connect(): Promise<void> {
    if (this.state === 'CONNECTED' || this.state === 'CONNECTING') return;
    this.setState('CONNECTING');
    try {
      await this.provider.connect();
      const caps = this.provider.getCapabilities();
      // Demo has liveQuotes:false — stay connected for polls, never claim websocket live
      this.setState(caps.liveQuotes && !this.provider.isDemo ? 'CONNECTED' : 'CONNECTED');
    } catch {
      this.setState('ERROR');
      throw new Error('Market data connection failed');
    }
  }

  async disconnect(): Promise<void> {
    for (const id of [...this.subscriptions.keys()]) {
      await this.unsubscribe(id).catch(() => undefined);
    }
    await this.provider.disconnect();
    this.setState('DISCONNECTED');
  }

  async subscribe(symbols: string[], callback: QuoteSubscriptionCallback): Promise<string> {
    const caps = this.provider.getCapabilities();
    if (!caps.liveQuotes) {
      throw new Error('Live quotes not supported by this data source');
    }
    if (!demoRateLimitManager.canSubscribe(this.subscriptions.size)) {
      throw new Error('Subscription limit reached');
    }
    const id = await this.provider.subscribeQuotes(symbols, callback);
    this.subscriptions.set(id, { symbols, callback });
    return id;
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    await this.provider.unsubscribeQuotes(subscriptionId);
    this.subscriptions.delete(subscriptionId);
  }

  /** Polling fallback for DEMO / non-streaming providers */
  async pollQuotes(symbols: string[]): Promise<NormalizedQuote[]> {
    const out: NormalizedQuote[] = [];
    for (const s of symbols) {
      await demoRateLimitManager.acquire('quote');
      out.push(await this.provider.getQuote(s));
    }
    return out;
  }
}
