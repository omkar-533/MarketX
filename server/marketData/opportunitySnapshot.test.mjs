import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nseCashSessionIsOpen, nseLastClosedBarCloseMs, msUntilNextNseBar, snapshotCacheKey } from './opportunitySnapshot.mjs';

describe('opportunity snapshot key', () => {
  it('is identical for two clients in the same NSE 5m bar', () => {
    const a = Date.parse('2026-08-17T12:11:00+05:30');
    const b = Date.parse('2026-08-17T12:14:00+05:30');
    assert.equal(snapshotCacheKey('F&O', '5m', a), snapshotCacheKey('F&O', '5m', b));
  });

  it('changes when the NSE 5m bar closes', () => {
    const before = Date.parse('2026-08-17T12:14:00+05:30');
    const after = Date.parse('2026-08-17T12:16:00+05:30');
    assert.notEqual(snapshotCacheKey('F&O', '5m', before), snapshotCacheKey('F&O', '5m', after));
  });

  it('stamps the 12:10 close while the 12:10–12:15 bar is still open', () => {
    const now = Date.parse('2026-08-17T12:11:45+05:30');
    assert.equal(nseLastClosedBarCloseMs('5m', now), Date.parse('2026-08-17T12:10:00+05:30'));
  });

  it('after the bell still keys the 15:30 close', () => {
    const now = Date.parse('2026-08-17T16:22:00+05:30');
    assert.equal(nseLastClosedBarCloseMs('5m', now), Date.parse('2026-08-17T15:30:00+05:30'));
  });

  it('does not schedule an 8s rebuild after the cash session', () => {
    const now = Date.parse('2026-08-17T16:22:00+05:30');
    assert.equal(nseCashSessionIsOpen(now), false);
    assert.ok(msUntilNextNseBar('5m', now) > 60 * 60_000);
  });

  it('keeps the same cache key across after-hours minutes', () => {
    const a = Date.parse('2026-08-17T16:22:00+05:30');
    const b = Date.parse('2026-08-17T16:37:00+05:30');
    assert.equal(snapshotCacheKey('F&O', '5m', a), snapshotCacheKey('F&O', '5m', b));
  });

  it('keeps yesterday\'s 15:30 key while the first 5m bar is still forming', () => {
    const a = Date.parse('2026-08-18T09:16:00+05:30');
    const b = Date.parse('2026-08-18T09:19:30+05:30');
    const priorClose = Date.parse('2026-08-17T15:30:00+05:30');
    assert.equal(nseLastClosedBarCloseMs('5m', a), priorClose);
    assert.equal(nseLastClosedBarCloseMs('5m', b), priorClose);
    assert.equal(snapshotCacheKey('F&O', '5m', a), snapshotCacheKey('F&O', '5m', b));
    assert.equal(snapshotCacheKey('F&O', '5m', a), `F&O|5m|${priorClose}`);
  });

  it('flips the 5m key at the 09:20 close, not at the 09:15 bell', () => {
    const forming = Date.parse('2026-08-18T09:19:30+05:30');
    const closed = Date.parse('2026-08-18T09:20:00+05:30');
    assert.notEqual(snapshotCacheKey('F&O', '5m', forming), snapshotCacheKey('F&O', '5m', closed));
    assert.equal(nseLastClosedBarCloseMs('5m', closed), Date.parse('2026-08-18T09:20:00+05:30'));
  });

  it('waits for the first 5m close instead of an 8s rebuild after 09:15', () => {
    const now = Date.parse('2026-08-18T09:16:00+05:30');
    const wait = msUntilNextNseBar('5m', now);
    assert.ok(wait > 3 * 60_000 && wait < 5 * 60_000, `wait=${wait}`);
  });

  it('waits for the next 5m close during the session, not the next day', () => {
    const now = Date.parse('2026-08-17T12:11:00+05:30');
    const wait = msUntilNextNseBar('5m', now);
    assert.ok(wait > 3 * 60_000 && wait < 5 * 60_000, `wait=${wait}`);
  });

  it('keeps the 1D key still during the cash session', () => {
    const a = Date.parse('2026-08-18T09:16:00+05:30');
    const b = Date.parse('2026-08-18T14:05:00+05:30');
    assert.equal(snapshotCacheKey('F&O', '1D', a), snapshotCacheKey('F&O', '1D', b));
    assert.equal(nseLastClosedBarCloseMs('1D', a), Date.parse('2026-08-17T15:30:00+05:30'));
  });
});
