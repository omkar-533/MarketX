import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  closedBarIndex,
  firstConsecutiveHitTime,
  currentRunStartOfIstDay,
  firstHitTimeOfIstDay,
  keepDisplaySetupTime,
  keepFirstSetupTime,
  lastClosedBarCloseMs,
  lastBarStamp,
  nseTradingDay,
  readCandleTimeMs,
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

  it('does not skip an isolated morning print when a later run is on the board', () => {
    const now = Date.parse('2026-08-14T14:32:00+05:30');
    const start = Date.parse('2026-08-14T09:15:00+05:30');
    const candles = Array.from({ length: 64 }, (_, i) => bar(start + i * FIVE));
    const morning = 7;
    const afternoon = 50;
    const created = firstHitTimeOfIstDay(
      candles,
      '5m',
      (i) => i === morning || i >= afternoon,
      now,
    );
    assert.equal(created, start + morning * FIVE + FIVE);
  });

  it('Created uses the current run, not a dead 9:20 print', () => {
    const now = Date.parse('2026-08-14T14:32:00+05:30');
    const start = Date.parse('2026-08-14T09:15:00+05:30');
    const candles = Array.from({ length: 64 }, (_, i) => bar(start + i * FIVE));
    const morning = 7;
    const afternoon = 50;
    const created = currentRunStartOfIstDay(
      candles,
      '5m',
      (i) => i === morning || i >= afternoon,
      now,
    );
    assert.equal(created, start + afternoon * FIVE + FIVE);
  });

  it('skips the 9:15 opening print so Created is not stuck at 9:20', () => {
    const now = Date.parse('2026-08-14T12:28:00+05:30');
    const start = Date.parse('2026-08-14T09:15:00+05:30');
    const candles = Array.from({ length: 40 }, (_, i) => bar(start + i * FIVE));
    const created = currentRunStartOfIstDay(
      candles,
      '5m',
      () => true,
      now,
    );
    assert.equal(created, start + FIVE + FIVE);
  });

  it('never uses Date.now as a fallback', () => {
    const now = Date.parse('2026-08-14T15:17:00+05:30');
    const ts = Date.parse('2026-08-14T10:20:00+05:30');
    const t = setupCreatedAtMs(ts, '5m', now);
    assert.ok(Math.abs(t - now) > 60_000);
    assert.equal(t, ts + FIVE);
  });

  it('returns 0 when today\'s IST session is not in the series', () => {
    const now = Date.parse('2026-08-14T14:32:00+05:30');
    const start = Date.parse('2026-08-13T14:00:00+05:30');
    const candles = Array.from({ length: 10 }, (_, i) => bar(start + i * FIVE));
    assert.equal(firstHitTimeOfIstDay(candles, '5m', (i) => i >= 2, now), 0);
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

  it('keeps the earlier print today and drops yesterday', () => {
    const now = Date.parse('2026-08-14T16:00:00+05:30');
    const morning = Date.parse('2026-08-14T10:20:00+05:30');
    const afternoon = Date.parse('2026-08-14T14:35:00+05:30');
    const yesterday = Date.parse('2026-08-13T14:35:00+05:30');
    assert.equal(keepFirstSetupTime(afternoon, morning, now), morning);
    assert.equal(keepFirstSetupTime(yesterday, morning, now), morning);
    assert.equal(keepFirstSetupTime(yesterday, 0, now), 0);
  });

  it('1h last bar stamps 3:30pm, never 4:15pm after the close', () => {
    const now = Date.parse('2026-08-14T21:25:00+05:30');
    const open = Date.parse('2026-08-14T15:15:00+05:30');
    const closeBell = Date.parse('2026-08-14T15:30:00+05:30');
    assert.equal(setupCreatedAtMs(open, '1h', now), closeBell);
    const fake415 = Date.parse('2026-08-14T16:15:00+05:30');
    assert.equal(keepFirstSetupTime(fake415, 0, now), closeBell);
  });

  it('weekend Created uses Friday\'s first print, not a blank Saturday', () => {
    const sat = Date.parse('2026-08-15T13:56:00+05:30');
    assert.equal(nseTradingDay(sat), '2026-08-14');
    const start = Date.parse('2026-08-14T09:15:00+05:30');
    const candles = Array.from({ length: 64 }, (_, i) => bar(start + i * FIVE));
    const firstHit = 6;
    const created = firstHitTimeOfIstDay(
      candles,
      '5m',
      (i) => i >= firstHit,
      sat,
    );
    assert.equal(created, start + firstHit * FIVE + FIVE);
    const fridayMorning = Date.parse('2026-08-14T10:20:00+05:30');
    const thursday = Date.parse('2026-08-13T14:35:00+05:30');
    assert.equal(keepFirstSetupTime(0, fridayMorning, sat), fridayMorning);
    assert.equal(keepFirstSetupTime(thursday, 0, sat), 0);
  });

  it('reads ChartBar time (sec) when timestamp is 0', () => {
    const open = Date.parse('2026-08-14T10:20:00+05:30');
    const sec = Math.floor(open / 1000);
    assert.equal(readCandleTimeMs({ timestamp: 0, time: sec }), open);
    assert.equal(readCandleTimeMs({ timestamp: 0, ts: sec }), open);
    const now = Date.parse('2026-08-15T15:14:00+05:30');
    const candles = [
      { timestamp: 0, time: sec - 300 },
      { timestamp: 0, time: sec },
    ];
    assert.equal(setupCreatedAtFromCandles(candles, '5m', now), open + FIVE);
    assert.ok(lastBarStamp(candles, '5m', now) > 0);
  });

  it('keeps Friday seconds-epoch stamps on Saturday', () => {
    const sat = Date.parse('2026-08-15T15:14:00+05:30');
    const fridayMorning = Date.parse('2026-08-14T10:20:00+05:30');
    const sec = Math.floor(fridayMorning / 1000);
    assert.equal(keepFirstSetupTime(0, sec, sat), fridayMorning);
  });

  it('displays a weekday session stamp when it is not the active trading day', () => {
    const sat = Date.parse('2026-08-15T16:16:00+05:30');
    const thursday = Date.parse('2026-08-13T14:35:00+05:30');
    const saturdayNow = sat;
    assert.equal(keepDisplaySetupTime(thursday, sat), thursday);
    assert.equal(keepDisplaySetupTime(saturdayNow, sat), 0);
    assert.equal(keepFirstSetupTime(0, thursday, sat) || keepDisplaySetupTime(thursday, sat), thursday);
  });

  it('does not stamp the forming 5m bar close while that candle is still open', () => {
    const now = Date.parse('2026-08-17T11:42:47+05:30');
    const lastClose = Date.parse('2026-08-17T11:40:00+05:30');
    const formingClose = Date.parse('2026-08-17T11:45:00+05:30');
    assert.equal(lastClosedBarCloseMs('5m', now), lastClose);
    assert.ok(lastClosedBarCloseMs('5m', now) < formingClose);
    assert.ok(lastClosedBarCloseMs('5m', now) <= now);
  });

  it('after 15:30 still stamps the last session bar, not blank', () => {
    const now = Date.parse('2026-08-17T16:22:00+05:30');
    const open = Date.parse('2026-08-17T15:25:00+05:30');
    const candles = [bar(open - FIVE), bar(open)];
    assert.equal(lastBarStamp(candles, '5m', now), Date.parse('2026-08-17T15:30:00+05:30'));
    assert.equal(keepDisplaySetupTime(lastBarStamp(candles, '5m', now), now), Date.parse('2026-08-17T15:30:00+05:30'));
  });
});
