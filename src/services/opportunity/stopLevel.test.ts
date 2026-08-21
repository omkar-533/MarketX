import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stopLevelOf, stoppedAtOf } from './stopLevel';

describe('stop level', () => {
  it('reads the level a scanner stamped on the hit', () => {
    assert.equal(stopLevelOf({ meta: { stopLevel: 2695.4 } }), 2695.4);
  });

  it('does not care which card the hit came from', () => {
    assert.equal(stopLevelOf({ meta: { stopLevel: 101.5, pattern: 'anything' } }), 101.5);
  });

  it('shows nothing instead of guessing a level', () => {
    assert.equal(stopLevelOf({ meta: {} }), null);
    assert.equal(stopLevelOf({ meta: undefined }), null);
    assert.equal(stopLevelOf({ meta: { stopLevel: 0 } }), null);
    assert.equal(stopLevelOf({ meta: { stopLevel: Number.NaN } }), null);
  });

  it('reports when the stop was taken out', () => {
    assert.equal(stoppedAtOf({ meta: { stoppedAt: 1_787_211_900_000 } }), 1_787_211_900_000);
    assert.equal(stoppedAtOf({ meta: {} }), null);
  });
});
