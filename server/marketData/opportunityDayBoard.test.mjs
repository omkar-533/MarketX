import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeScannerHits, istCalendarDay, nseBoardDay, msUntilNextSessionOpen, retainBoardsForDay } from './opportunityDayBoard.mjs';

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

  it('keeps Monday after the bell and drops it when Tuesday session opens', () => {
    const afterClose = Date.parse('2026-08-17T18:05:00+05:30');
    const nextOpen = Date.parse('2026-08-18T09:16:00+05:30');
    assert.equal(nseBoardDay(afterClose), '2026-08-17');
    assert.equal(nseBoardDay(nextOpen), '2026-08-18');
    const kept = retainBoardsForDay(
      { boards: { '2026-08-17|F&O|5m': { day: '2026-08-17' }, '2026-08-18|F&O|5m': { day: '2026-08-18' } } },
      nseBoardDay(nextOpen),
    );
    assert.deepEqual(Object.keys(kept.boards), ['2026-08-18|F&O|5m']);
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
