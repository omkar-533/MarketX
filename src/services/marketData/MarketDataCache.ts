/**
 * MarketDataCache — short TTL in-memory cache.
 * Never labels cached DEMO data as LIVE.
 */
import type { CachedEnvelope, MarketDataMode } from './types';

type Entry = CachedEnvelope<unknown>;

export class MarketDataCache {
  private readonly store = new Map<string, Entry>();

  constructor(private readonly defaultTtlMs = 15_000) {}

  get<T>(key: string): CachedEnvelope<T> | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() - hit.timestamp > hit.freshnessMs) {
      this.store.delete(key);
      return null;
    }
    return hit as CachedEnvelope<T>;
  }

  set<T>(
    key: string,
    data: T,
    opts: { source: string; mode: MarketDataMode; ttlMs?: number },
  ): CachedEnvelope<T> {
    const freshnessMs = opts.ttlMs ?? this.defaultTtlMs;
    const envelope: CachedEnvelope<T> = {
      data,
      timestamp: Date.now(),
      source: opts.source,
      freshnessMs,
      mode: opts.mode,
    };
    this.store.set(key, envelope as Entry);
    return envelope;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export const marketDataCache = new MarketDataCache();
