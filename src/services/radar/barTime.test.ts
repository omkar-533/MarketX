import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  closedBarIndex,
  firstConsecutiveHitTime,
  firstHitTimeOfIstDay,
  sessionBarsNeeded,
  setupCreatedAtFromCandles,
  setupCreatedAtMs,
} from './barTime';

const MIN = 60_000;
const FIVE = 5 * MIN;

function bar(ts: number) {
  return { timestamp: ts };
}

describe('barTime', () => {
  it('uses last fully closed 5m bar, not the forming candle', () => {
    const now = Date.parse('2026-08-14T10:03:00+05:30');
    const openForming = Date.parse('2026-08-14T10:00:00+05:30');
    const openClosed = Date.parse('2026-08-14T09:55:00+05:30');
    const candles = [bar(openClosed - FIVE), bar(openClosed), bar(openForming)];
    assert.equal(closedBarIndex(candles, '5m', now), 1);
    assert.equal(setupCreatedAtFromCandles(candles, '5m', now), openClosed + FIVE);
  });

  it('does not return a future close when ts is already the close', () => {
    const now = Date.parse('2026-08-14T10:02:00+05:30');
    const closeTs = Date.parse('2026-08-14T10:00:00+05:30');
    assert.equal(setupCreatedAtMs(closeTs, '5m', now), closeTs);
  });

  it('walks back to the first bar of the current hit', () => {
    const now = Date.parse('2026-08-14T14:02:00+05:30');
    const start = Date.parse('2026-08-14T09:15:00+05:30');
    const candles = Array.from({ length: 60 }, (_, i) => bar(start + i * FIVE));
    const hitFrom = 36;
    const created = firstConsecutiveHitTime(
      candles,
      '5m',
      (i) => i >= hitFrom,
      now,
    );
    assert.equal(created, start + hitFrom * FIVE + FIVE);
  });

  it('stamps the first hit of the IST session even if the setup reprints later', () => {
    const now = Date.parse('2026-08-14T14:32:00+05:30');
    const start = Date.parse('2026-08-14T09:15:00+05:30');
    const candles = Array.from({ length: 64 }, (_, i) => bar(start + i * FIVE));
    const firstHit = 6;
    const secondHit = 50;
    const created = firstHitTimeOfIstDay(
      candles,
      '5m',
      (i) => (i >= firstHit && i <= 12) || i >= secondHit,
      now,
    );
    assert.equal(created, start + firstHit * FIVE + FIVE);
  });

  it('never uses Date.now as a fallback', () => {
    const now = Date.parse('2026-08-14T15:17:00+05:30');
    const ts = Date.parse('2026-08-14T10:20:00+05:30');
    const t = setupCreatedAtMs(ts, '5m', now);
    assert.ok(Math.abs(t - now) > 60_000);
    assert.equal(t, ts + FIVE);
  });

  it('walks the whole window when 09:15 is not in the series', () => {
    const now = Date.parse('2026-08-14T14:32:00+05:30');
    const start = Date.parse('2026-08-13T14:00:00+05:30');
    const candles = Array.from({ length: 10 }, (_, i) => bar(start + i * FIVE));
    const created = firstHitTimeOfIstDay(candles, '5m', (i) => i >= 2, now);
    assert.equal(created, start + 2 * FIVE + FIVE);
  });

  it('returns 0 when the setup never printed in the window', () => {
    const now = Date.parse('2026-08-14T14:32:00+05:30');
    const start = Date.parse('2026-08-14T09:15:00+05:30');
    const candles = Array.from({ length: 20 }, (_, i) => bar(start + i * FIVE));
    assert.equal(firstHitTimeOfIstDay(candles, '5m', () => false, now), 0);
  });

  it('fetches a full NSE 5m session plus lookback, not an 80-bar tail', () => {
    const afterClose = Date.parse('2026-08-14T16:00:00+05:30');
    assert.ok(sessionBarsNeeded('5m', afterClose) >= 115);
    assert.ok(sessionBarsNeeded('1m', afterClose) >= 400);
  });
});
