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

function evaluate(
  candleMapAll: Record<string, Bar[]>,
  extra?: { asOf?: number; rsiBySymbol?: Record<string, unknown> },
) {
  return evaluateOpportunityFromCandleMap({
    filters: { ...DEFAULT_OPPORTUNITY_FILTERS, timeframe: '5m' },
    symbols: Object.keys(candleMapAll),
    asOf: extra?.asOf ?? AS_OF,
    dataMode: 'LIVE',
    shared: true,
    candleMapAll: candleMapAll as never,
    rsiBySymbol: extra?.rsiBySymbol as never,
  });
}

/** Flat RSI stamped before the session, so every bar reads the same value. */
function rsiFeed(m5: number, m30: number, h2: number) {
  return {
    m5: [[PREV_OPEN, m5]],
    m30: [[PREV_OPEN, m30]],
    h2: [[PREV_OPEN, h2]],
  };
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

describe('Boosters listing', () => {
  const EARLY = Date.parse('2026-08-21T09:26:00+05:30');
  const boosterHits = (
    cards: { scannerId: string; hits: { symbol: string; detectedAt: number }[] }[],
  ) => cards.find((c) => c.scannerId === 'opening_drive')?.hits ?? [];

  it('can print on the first closed bar of the day, at 9:20', async () => {
    const { cards } = await evaluate(
      { RUNNER: [...priorDay(), ...session(2)] },
      { asOf: EARLY, rsiBySymbol: { RUNNER: rsiFeed(70, 70, 60) } },
    );
    const stamps = boosterHits(cards).map((h) => istClock(h.detectedAt));
    assert.ok(stamps.length > 0, 'Boosters produced no hit');
    assert.equal(stamps.sort()[0], '09:20');
  });

  it('stays silent without the higher-timeframe RSI instead of guessing', async () => {
    const { cards } = await evaluate(
      { RUNNER: [...priorDay(), ...session(2)] },
      { asOf: EARLY },
    );
    assert.deepEqual(boosterHits(cards), []);
  });

  it('does not print the long side when the 2h RSI is against it', async () => {
    const { cards } = await evaluate(
      { RUNNER: [...priorDay(), ...session(2)] },
      { asOf: EARLY, rsiBySymbol: { RUNNER: rsiFeed(70, 70, 40) } },
    );
    assert.deepEqual(boosterHits(cards), []);
  });
});
