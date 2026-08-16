import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { snapshotCacheKey } from './opportunitySnapshot.mjs';

describe('opportunity snapshot key', () => {
  it('is identical for two clients in the same 5m bucket', () => {
    const now = Date.parse('2026-08-16T16:17:00Z');
    assert.equal(snapshotCacheKey('F&O', '5m', now), snapshotCacheKey('F&O', '5m', now + 10_000));
  });

  it('changes after the 5m bar rolls', () => {
    const bucket = 300_000;
    const nearEnd = bucket * 1000 - 1_000;
    assert.notEqual(snapshotCacheKey('F&O', '5m', nearEnd), snapshotCacheKey('F&O', '5m', nearEnd + 2_000));
  });
});
