/** Live tick subscriptions removed. */

export function subscribeLiveSymbols(_symbols: string[]): () => void {
  return () => undefined;
}

export function ensureMarketTickStream(): void {}
