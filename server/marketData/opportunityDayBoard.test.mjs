import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeScannerHits, istCalendarDay } from './opportunityDayBoard.mjs';

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
});
