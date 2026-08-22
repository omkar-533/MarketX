import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateOpportunityFromCandleMap } from './opportunityEvaluate';
import { DEFAULT_OPPORTUNITY_FILTERS } from './opportunityTypes';

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

function evaluate(
  candleMapAll: Record<string, Bar[]>,
  extra?: { asOf?: number; timeframe?: '5m' | '1h' },
) {
  return evaluateOpportunityFromCandleMap({
    filters: { ...DEFAULT_OPPORTUNITY_FILTERS, timeframe: extra?.timeframe ?? '1h' },
    symbols: Object.keys(candleMapAll),
    asOf: extra?.asOf ?? AS_OF,
    dataMode: 'LIVE',
    shared: true,
    candleMapAll: candleMapAll as never,
  });
}

function istClock(ms: number) {
  return new Date(ms).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
}

describe('Wolf Hunters listing', () => {
  const H1 = 3_600_000;
  /** NSE hourly slots: 09:15 through 15:15. */
  const SLOTS = [0, 1, 2, 3, 4, 5, 6];
  // Five sessions: folding the stub costs a bar a day, and the snapshot needs 25.
  const DAYS = ['2026-08-14', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20'];

  const hourBar = (timestamp: number, o: number, h: number, l: number, c: number): Bar => ({
    timestamp,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: 1_000,
  });

  /** Quiet prior sessions, so the snapshot has enough bars to read. */
  function quietDays(trimDay?: string, fromSlot = 5): Bar[] {
    const out: Bar[] = [];
    for (const day of DAYS) {
      const open = Date.parse(`${day}T09:15:00+05:30`);
      for (const n of SLOTS) {
        if (trimDay === day && n >= fromSlot) continue;
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
    // Mother is yesterday's closing candle; today's 09:15 bar sweeps it and closes back in.
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

  it("carries yesterday's folded closing candle over and stamps it at the 9:15 open", async () => {
    // 13:15 is the mother. The 14:15 bar and the 15:15 stub fold into one closing
    // candle that wicks through the mother's low and closes in its lower half, so
    // the setup is already live when today's bell rings.
    const series = [
      ...quietDays('2026-08-20', 4),
      hourBar(LAST_DAY_OPEN + 4 * H1, 100.5, 103, 98, 102.5),
      hourBar(LAST_DAY_OPEN + 5 * H1, 100, 100.8, 98.5, 99.8),
      hourBar(LAST_DAY_OPEN + 6 * H1, 99.8, 100, 97, 99.5),
    ];
    const { cards } = await evaluate(
      { CARRY: series },
      { asOf: Date.parse('2026-08-21T09:16:00+05:30'), timeframe: '1h' },
    );
    const stamps = hunterHits(cards).map((h) => istClock(h.detectedAt));
    assert.ok(stamps.includes('09:15'), `expected a 09:15 print, got ${stamps.join(', ')}`);
  });

  it('will not carry over when the stub alone would have been the hunt', async () => {
    // Same bars, except the sweep sits only in the 15-minute stub. Folded into the
    // 14:15 bar it is a single candle that opens outside the mother, so nothing prints.
    const series = [
      ...quietDays('2026-08-20', 4),
      hourBar(LAST_DAY_OPEN + 4 * H1, 100.5, 103, 98, 102.5),
      hourBar(LAST_DAY_OPEN + 5 * H1, 104, 104.5, 103.5, 104),
      hourBar(LAST_DAY_OPEN + 6 * H1, 104, 104, 97, 99.5),
    ];
    const { cards } = await evaluate(
      { STUB: series },
      { asOf: Date.parse('2026-08-21T09:16:00+05:30'), timeframe: '1h' },
    );
    assert.deepEqual(hunterHits(cards), []);
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
