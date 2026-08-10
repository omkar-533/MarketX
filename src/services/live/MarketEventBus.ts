/**
 * Tiny typed event bus for LIVE WOLF subscribers (chart, panel, timeline).
 * Not a replacement for Radar — selected-symbol events only.
 */
import type { MarketEvent } from './liveTypes';

type Handler<T> = (payload: T) => void;

class SimpleBus<T> {
  private handlers = new Set<Handler<T>>();

  subscribe(fn: Handler<T>): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  publish(payload: T) {
    for (const h of this.handlers) {
      try {
        h(payload);
      } catch {
        /* isolate subscribers */
      }
    }
  }

  clear() {
    this.handlers.clear();
  }
}

export const liveMarketEventBus = new SimpleBus<MarketEvent>();
export const liveAnalysisBus = new SimpleBus<import('./liveTypes').LiveAnalysisSnapshot>();
export const liveFeedStatusBus = new SimpleBus<import('./liveTypes').LiveSessionState>();
