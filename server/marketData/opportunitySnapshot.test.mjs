import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nseLastClosedBarCloseMs, snapshotCacheKey } from './opportunitySnapshot.mjs';

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
});
