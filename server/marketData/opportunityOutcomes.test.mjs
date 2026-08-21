import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDayOutcomes,
  entryIndexFor,
  movePct,
  seriesStampsCloses,
  trimDays,
} from './opportunityOutcomes.mjs';

const DAY = '2026-08-20';
const OPEN = Date.parse(`${DAY}T09:15:00+05:30`);
const FIVE = 300_000;
const AFTER_CLOSE = Date.parse(`${DAY}T16:00:00+05:30`);
const MIDDAY = Date.parse(`${DAY}T11:00:00+05:30`);

/** `offset` 0 stamps bar opens, FIVE stamps bar closes. */
function series(closes, offset = 0) {
  return closes.map((close, i) => ({
    timestamp: OPEN + offset + i * FIVE,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
  }));
}

function card(hits, scannerId = 'morning_sprint') {
  return [{ scannerId, hits }];
}

function hit(overrides = {}) {
  return {
    symbol: 'INFY',
    direction: 'bullish',
    // Close of the first 5m bar.
    detectedAt: OPEN + FIVE,
    ...overrides,
  };
}

describe('opportunity outcomes', () => {
  it('reads the entry from the bar that printed, not the next one', () => {
    // Bar 0 closes 100 at 09:20, bar 1 closes 110. Entry must be 100.
    const closes = [100, 110, 121, 121, 121, 121, 121];
    const open = buildDayOutcomes(card([hit()]), { INFY: series(closes) }, '5m', DAY, MIDDAY);
    assert.equal(open.morning_sprint.h15.samples ?? open.morning_sprint.h15.n, 1);
    // +15m is three 5m bars on: 121 vs 100 = +21%.
    assert.equal(Math.round(open.morning_sprint.h15.sum), 21);
  });

  it('gives the same entry whether the feed stamps opens or closes', () => {
    const closes = [100, 110, 121, 121, 121, 121, 121];
    const asOpen = buildDayOutcomes(card([hit()]), { INFY: series(closes, 0) }, '5m', DAY, MIDDAY);
    const asClose = buildDayOutcomes(
      card([hit()]),
      { INFY: series(closes, FIVE) },
      '5m',
      DAY,
      MIDDAY,
    );
    assert.deepEqual(asOpen.morning_sprint.h15, asClose.morning_sprint.h15);
  });

  it('counts a falling price as a win for a bearish signal', () => {
    const closes = [100, 99, 98, 97, 96, 95, 94];
    const out = buildDayOutcomes(
      card([hit({ direction: 'bearish' })]),
      { INFY: series(closes) },
      '5m',
      DAY,
      MIDDAY,
    );
    assert.equal(out.morning_sprint.h15.wins, 1);
    assert.ok(out.morning_sprint.h15.sum > 0);
  });

  it('leaves a horizon pending when its bar has not printed yet', () => {
    // Only two bars exist, so neither +15m nor +30m can be scored.
    const out = buildDayOutcomes(card([hit()]), { INFY: series([100, 101]) }, '5m', DAY, MIDDAY);
    assert.equal(out.morning_sprint.signals, 1);
    assert.equal(out.morning_sprint.h15.n, 0);
    assert.equal(out.morning_sprint.h30.n, 0);
  });

  it('scores end of day only after the session has closed', () => {
    const closes = Array.from({ length: 12 }, (_, i) => 100 + i);
    const live = buildDayOutcomes(card([hit()]), { INFY: series(closes) }, '5m', DAY, MIDDAY);
    assert.equal(live.morning_sprint.eod.n, 0);
    const done = buildDayOutcomes(card([hit()]), { INFY: series(closes) }, '5m', DAY, AFTER_CLOSE);
    assert.equal(done.morning_sprint.eod.n, 1);
  });

  it('skips a hit whose candle is missing instead of inventing one', () => {
    const out = buildDayOutcomes(
      card([hit({ detectedAt: Date.parse(`${DAY}T09:22:30+05:30`) })]),
      { INFY: series([100, 101, 102, 103, 104]) },
      '5m',
      DAY,
      MIDDAY,
    );
    assert.equal(out.morning_sprint.signals, 0);
  });

  it('ignores neutral signals and unknown symbols', () => {
    const out = buildDayOutcomes(
      card([hit({ direction: 'neutral' }), hit({ symbol: 'NOSUCH' })]),
      { INFY: series([100, 101, 102, 103, 104]) },
      '5m',
      DAY,
      MIDDAY,
    );
    assert.equal(out.morning_sprint.signals, 0);
  });

  it('is a full rebuild, so replaying a tick cannot double count', () => {
    const map = { INFY: series([100, 110, 121, 121, 121, 121, 121]) };
    const once = buildDayOutcomes(card([hit()]), map, '5m', DAY, MIDDAY);
    const twice = buildDayOutcomes(card([hit()]), map, '5m', DAY, MIDDAY);
    assert.deepEqual(once, twice);
  });

  it('detects the stamping convention from the first session bar', () => {
    assert.equal(seriesStampsCloses(series([100, 101]), FIVE, DAY), false);
    assert.equal(seriesStampsCloses(series([100, 101], FIVE), FIVE, DAY), true);
    assert.equal(seriesStampsCloses([], FIVE, DAY), null);
  });

  it('resolves the entry bar for both stamping conventions', () => {
    const index = new Map([
      [OPEN, 0],
      [OPEN + FIVE, 1],
    ]);
    assert.equal(entryIndexFor(index, OPEN + FIVE, FIVE, false), 0);
    assert.equal(entryIndexFor(index, OPEN + FIVE, FIVE, true), 1);
    assert.equal(entryIndexFor(index, OPEN + 99, FIVE, false), -1);
  });

  it('flips the sign of the move for a short', () => {
    assert.equal(movePct(100, 110, 'bullish'), 10);
    assert.equal(movePct(100, 110, 'bearish'), -10);
    assert.equal(movePct(0, 110, 'bullish'), null);
  });

  it('keeps only the most recent trading days', () => {
    const days = {
      '2026-08-10': 1,
      '2026-08-11': 2,
      '2026-08-12': 3,
      '2199-01-01': 4,
    };
    const kept = trimDays(days, 2, Date.parse('2026-08-12T16:00:00+05:30'));
    assert.deepEqual(Object.keys(kept), ['2026-08-11', '2026-08-12']);
  });
});
