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
  extra?: { asOf?: number; rsiBySymbol?: Record<string, unknown>; timeframe?: '5m' | '1h' },
) {
  return evaluateOpportunityFromCandleMap({
    filters: { ...DEFAULT_OPPORTUNITY_FILTERS, timeframe: extra?.timeframe ?? '5m' },
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

describe('Wolf Hunters listing', () => {
  const H1 = 3_600_000;
  /** NSE hourly slots: 09:15 through 15:15. */
  const SLOTS = [0, 1, 2, 3, 4, 5, 6];
  const DAYS = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20'];

  const hourBar = (timestamp: number, o: number, h: number, l: number, c: number): Bar => ({
    timestamp,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: 1_000,
  });

  /** Four quiet prior sessions, so the snapshot has enough bars to read. */
  function quietDays(skipLastTwoOf?: string): Bar[] {
    const out: Bar[] = [];
    for (const day of DAYS) {
      const open = Date.parse(`${day}T09:15:00+05:30`);
      for (const n of SLOTS) {
        if (skipLastTwoOf === day && n >= 5) continue;
        out.push(hourBar(open + n * H1, 100, 100.5, 99.5, 100));
      }
    }
    return out;
  }

  const LAST_DAY_OPEN = Date.parse('2026-08-20T09:15:00+05:30');
  // 14:15 mother, 15:15 close — the pair a carried-over hunt is read from.
  const yesterday1415 = hourBar(LAST_DAY_OPEN + 5 * H1, 100.5, 103, 98, 102.5);
  const todayHunt = hourBar(OPEN, 100, 100.8, 97, 99.5);

  const hunterHits = (
    cards: { scannerId: string; hits: { symbol: string; detectedAt: number; status: string }[] }[],
  ) => cards.find((c) => c.scannerId === 'wolf_hunters')?.hits ?? [];

  it('prints on the first bar of the day, at 10:15', async () => {
    // Mother is yesterday's 15:15 close; today's 09:15 bar sweeps it and closes back in.
    const series = [
      ...quietDays('2026-08-20'),
      hourBar(LAST_DAY_OPEN + 5 * H1, 100, 101, 99, 100.5),
      yesterday1415,
      todayHunt,
    ];
    const { cards } = await evaluate(
      { HUNTER: series },
      { asOf: Date.parse('2026-08-21T10:20:00+05:30'), timeframe: '1h' },
    );
    const stamps = hunterHits(cards).map((h) => istClock(h.detectedAt));
    assert.ok(stamps.includes('10:15'), `expected a 10:15 print, got ${stamps.join(', ')}`);
  });

  it('carries yesterday\'s last candle over and stamps it at the 9:15 open', async () => {
    // The 15:15 bar hunts the 14:15 bar, so the setup is already live at the bell.
    const series = [
      ...quietDays('2026-08-20'),
      hourBar(LAST_DAY_OPEN + 4 * H1, 100, 101, 99, 100.5),
      hourBar(LAST_DAY_OPEN + 5 * H1, 100.5, 103, 98, 102.5),
      hourBar(LAST_DAY_OPEN + 6 * H1, 100, 100.8, 97, 99.5),
    ];
    const { cards } = await evaluate(
      { CARRY: series },
      { asOf: Date.parse('2026-08-21T09:16:00+05:30'), timeframe: '1h' },
    );
    const stamps = hunterHits(cards).map((h) => istClock(h.detectedAt));
    assert.ok(stamps.includes('09:15'), `expected a 09:15 print, got ${stamps.join(', ')}`);
  });

  it('marks the row invalidated once an hourly close takes the stop out', async () => {
    // Hunt low is 97; the 11:15 bar closes at 96, through it.
    const series = [
      ...quietDays('2026-08-20'),
      hourBar(LAST_DAY_OPEN + 5 * H1, 100, 101, 99, 100.5),
      yesterday1415,
      todayHunt,
      hourBar(OPEN + H1, 99.5, 100, 98, 98.5),
      hourBar(OPEN + 2 * H1, 98.5, 99, 95.5, 96),
    ];
    const { cards } = await evaluate(
      { STOPPED: series },
      { asOf: Date.parse('2026-08-21T12:20:00+05:30'), timeframe: '1h' },
    );
    const hit = hunterHits(cards).find((h) => istClock(h.detectedAt) === '10:15');
    assert.ok(hit, 'the 10:15 hunt should still be listed');
    assert.equal(hit?.status, 'INVALID');
  });

  it('leaves a setup alone while price holds the stop', async () => {
    const series = [
      ...quietDays('2026-08-20'),
      hourBar(LAST_DAY_OPEN + 5 * H1, 100, 101, 99, 100.5),
      yesterday1415,
      todayHunt,
      hourBar(OPEN + H1, 99.5, 100.5, 97.5, 100),
    ];
    const { cards } = await evaluate(
      { ALIVE: series },
      { asOf: Date.parse('2026-08-21T11:20:00+05:30'), timeframe: '1h' },
    );
    const hit = hunterHits(cards).find((h) => istClock(h.detectedAt) === '10:15');
    assert.ok(hit, 'the 10:15 hunt should be listed');
    assert.notEqual(hit?.status, 'INVALID');
  });
});
