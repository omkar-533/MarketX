import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeScannerHits, nextScannerHits, istCalendarDay, nseBoardDay, msUntilNextSessionOpen, retainBoardsForDay } from './opportunityDayBoard.mjs';

describe('opportunity day board merge', () => {
  it('keeps the morning print when a later scan posts a 2nd signal', () => {
    const day = '2026-08-17';
    const morning = Date.parse('2026-08-17T10:25:00+05:30');
    const later = Date.parse('2026-08-17T14:10:00+05:30');
    const first = mergeScannerHits(
      [],
      [{ scannerId: 'breakout_radar', symbol: 'INFY', score: 70, detectedAt: morning, timeframe: '5m' }],
      day,
    );
    const merged = mergeScannerHits(
      first,
      [{ scannerId: 'breakout_radar', symbol: 'INFY', score: 81, detectedAt: later, timeframe: '5m' }],
      day,
    );
    assert.deepEqual(
      merged.map((h) => h.detectedAt).sort((a, b) => a - b),
      [morning, later],
    );
    assert.equal(istCalendarDay(morning), day);
  });

  it('does not restamp an existing print when the same bar is posted again', () => {
    const day = '2026-08-17';
    const t = Date.parse('2026-08-17T10:25:00+05:30');
    const first = mergeScannerHits(
      [],
      [{ scannerId: 'breakout_radar', symbol: 'INFY', score: 70, detectedAt: t, timeframe: '5m' }],
      day,
    );
    const merged = mergeScannerHits(
      first,
      [{ scannerId: 'breakout_radar', symbol: 'INFY', score: 90, detectedAt: t, timeframe: '5m' }],
      day,
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].detectedAt, t);
    assert.equal(merged[0].score, 90);
  });

  it('keeps an afternoon name after 80 morning names already sit on the board', () => {
    const day = '2026-08-17';
    const morning = Date.parse('2026-08-17T10:25:00+05:30');
    const late = Date.parse('2026-08-17T14:55:00+05:30');
    const prev = Array.from({ length: 80 }, (_, i) => ({
      scannerId: 'breakout_radar',
      symbol: `M${i}`,
      score: 90,
      detectedAt: morning,
      timeframe: '5m',
    }));
    const first = mergeScannerHits([], prev, day);
    const merged = mergeScannerHits(
      first,
      [{ scannerId: 'breakout_radar', symbol: 'PREMIERENE', score: 62, detectedAt: late, timeframe: '5m' }],
      day,
    );
    assert.equal(first.length, 80);
    assert.ok(merged.some((h) => h.symbol === 'PREMIERENE' && h.detectedAt === late));
    assert.equal(merged.length, 81);
  });

  it('keeps Monday after the bell and drops it when Tuesday\'s first 5m bar closes', () => {
    const afterClose = Date.parse('2026-08-17T18:05:00+05:30');
    const beforeFirstBar = Date.parse('2026-08-18T09:16:00+05:30');
    const afterFirstBar = Date.parse('2026-08-18T09:20:00+05:30');
    assert.equal(nseBoardDay(afterClose), '2026-08-17');
    assert.equal(nseBoardDay(beforeFirstBar), '2026-08-17');
    assert.equal(nseBoardDay(afterFirstBar), '2026-08-18');
    const kept = retainBoardsForDay(
      { boards: { '2026-08-17|F&O|5m': { day: '2026-08-17' }, '2026-08-18|F&O|5m': { day: '2026-08-18' } } },
      nseBoardDay(afterFirstBar),
    );
    assert.deepEqual(Object.keys(kept.boards), ['2026-08-18|F&O|5m']);
  });

  it('keeps a 1D midnight stamp on the board day', () => {
    const day = '2026-08-17';
    const midnight = Date.parse('2026-08-17T00:00:00+05:30');
    const hits = mergeScannerHits(
      [],
      [{ scannerId: 'breakout_radar', symbol: 'INFY', score: 70, detectedAt: midnight, timeframe: '1D' }],
      day,
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0].timeframe, '1D');
  });

  it('does not wipe a 15m board when the next scan posts zero hits', () => {
    const day = '2026-08-17';
    const t = Date.parse('2026-08-17T10:00:00+05:30');
    const prev = mergeScannerHits(
      [],
      [{ scannerId: 'breakout_radar', symbol: 'INFY', score: 70, detectedAt: t, timeframe: '15m' }],
      day,
    );
    const kept = nextScannerHits(prev, [], day);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].symbol, 'INFY');
  });

  it('lists only the names Morning Sprint still holds and clears on an empty scan', () => {
    const day = '2026-08-17';
    const t1 = Date.parse('2026-08-17T09:20:00+05:30');
    const t2 = Date.parse('2026-08-17T09:25:00+05:30');
    const prev = mergeScannerHits(
      [],
      [{ scannerId: 'morning_sprint', symbol: 'INFY', score: 72, detectedAt: t1, timeframe: '5m' }],
      day,
      true,
    );
    // INFY broke the rule, so the next scan only carries TCS.
    const next = nextScannerHits(
      prev,
      [{ scannerId: 'morning_sprint', symbol: 'TCS', score: 75, detectedAt: t2, timeframe: '5m' }],
      day,
      true,
      { keepOnEmpty: false, replace: true },
    );
    assert.equal(next.some((h) => h.symbol === 'INFY'), false);
    assert.equal(next.some((h) => h.symbol === 'TCS'), true);

    // Nothing holding the rule empties the card rather than replaying old names.
    const empty = nextScannerHits(next, [], day, true, { keepOnEmpty: false, replace: true });
    assert.equal(empty.length, 0);
  });

  it('does not wipe in-memory prints when the disk file is missing', () => {
    const day = '2026-08-17';
    const kept = retainBoardsForDay(
      { boards: { [`${day}|F&O|5m`]: { day, hitsByScanner: { breakout_radar: [{ symbol: 'INFY' }] } } } },
      day,
    );
    assert.equal(Object.keys(kept.boards).length, 1);
    assert.equal(kept.day, day);
  });
});
