import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateOpportunityFromCandleMap } from './opportunityEvaluate';
import { DEFAULT_OPPORTUNITY_FILTERS } from './opportunityTypes';

const FIVE = 300_000;
const PREV_OPEN = Date.parse('2026-08-20T09:15:00+05:30');
const OPEN = Date.parse('2026-08-21T09:15:00+05:30');
const AS_OF = Date.parse('2026-08-21T11:00:00+05:30');

type Bar = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function bar(timestamp: number, base: number, low = base): Bar {
  return { timestamp, open: base, high: base + 0.4, low, close: base + 0.3, volume: 1_000 };
}

/** Prior session so ATR / prevClose exist before today's first print. */
function priorDay(): Bar[] {
  return Array.from({ length: 40 }, (_, i) => bar(PREV_OPEN + i * FIVE, 99.5));
}

/**
 * Today rises from 100, so the session low equals the session open.
 * `breakAt` sends one bar below the open, permanently killing the rule.
 */
function session(bars: number, breakAt?: number): Bar[] {
  return Array.from({ length: bars }, (_, i) => {
    const base = 100 + i * 0.5;
    return bar(OPEN + i * FIVE, base, i === breakAt ? 99 : base);
  });
}

function evaluate(candleMapAll: Record<string, Bar[]>) {
  return evaluateOpportunityFromCandleMap({
    filters: { ...DEFAULT_OPPORTUNITY_FILTERS, timeframe: '5m' },
    symbols: Object.keys(candleMapAll),
    asOf: AS_OF,
    dataMode: 'LIVE',
    shared: true,
    candleMapAll: candleMapAll as never,
  });
}

function sprintHits(cards: { scannerId: string; hits: { symbol: string; detectedAt: number }[] }[]) {
  return cards.find((c) => c.scannerId === 'morning_sprint')?.hits ?? [];
}

function istClock(ms: number) {
  return new Date(ms).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
}

describe('Morning Sprint listing', () => {
  it('stamps the first listing at 9:20, not 9:25', async () => {
    const { cards } = await evaluate({ HOLDER: [...priorDay(), ...session(20)] });
    const hits = sprintHits(cards);
    assert.equal(hits.length, 1);
    assert.equal(istClock(hits[0].detectedAt), '09:20');
  });

  it('drops the symbol on the bar that breaks Open = Low', async () => {
    const { cards } = await evaluate({ BREAKER: [...priorDay(), ...session(20, 6)] });
    assert.deepEqual(sprintHits(cards), []);
  });

  it('keeps a holder listed and removes a breaker in the same scan', async () => {
    const { cards } = await evaluate({
      HOLDER: [...priorDay(), ...session(20)],
      BREAKER: [...priorDay(), ...session(20, 6)],
    });
    assert.deepEqual(
      sprintHits(cards).map((h) => h.symbol),
      ['HOLDER'],
    );
  });

  it('lists one row per symbol, not a print for every bar it held', async () => {
    const { cards } = await evaluate({ HOLDER: [...priorDay(), ...session(20)] });
    assert.equal(sprintHits(cards).filter((h) => h.symbol === 'HOLDER').length, 1);
  });
});
