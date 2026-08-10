/**
 * RateLimitManager — provider-aware token bucket (verified limits later).
 * Demo defaults are conservative placeholders, not broker docs.
 */
import type { RateLimitConfig } from './types';

export const DEMO_RATE_LIMITS: RateLimitConfig = {
  requestsPerSecond: 20,
  requestsPerMinute: 600,
  maxSubscriptions: 50,
  historicalRequestLimit: 120,
};

export class RateLimitManager {
  private tokens: number;
  private minuteWindowStart = Date.now();
  private minuteCount = 0;
  private lastRefill = Date.now();

  constructor(private readonly config: RateLimitConfig = DEMO_RATE_LIMITS) {
    this.tokens = config.requestsPerSecond;
  }

  async acquire(kind: 'quote' | 'historical' | 'subscribe' = 'quote'): Promise<void> {
    if (kind === 'historical' && this.minuteCount >= this.config.historicalRequestLimit) {
      const wait = 60_000 - (Date.now() - this.minuteWindowStart);
      await sleep(Math.max(50, wait));
      this.resetMinuteIfNeeded(true);
    }

    this.refill();
    this.resetMinuteIfNeeded();

    if (this.tokens < 1) {
      const waitMs = Math.ceil(1000 / Math.max(1, this.config.requestsPerSecond));
      await sleep(waitMs);
      this.refill();
    }

    this.tokens = Math.max(0, this.tokens - 1);
    this.minuteCount += 1;
  }

  canSubscribe(current: number): boolean {
    return current < this.config.maxSubscriptions;
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.tokens = Math.min(
      this.config.requestsPerSecond,
      this.tokens + elapsed * this.config.requestsPerSecond,
    );
    this.lastRefill = now;
  }

  private resetMinuteIfNeeded(force = false) {
    const now = Date.now();
    if (force || now - this.minuteWindowStart >= 60_000) {
      this.minuteWindowStart = now;
      this.minuteCount = 0;
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const demoRateLimitManager = new RateLimitManager(DEMO_RATE_LIMITS);
