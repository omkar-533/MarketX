import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatXFactor, xFactorOf } from './xFactor';

const hit = (meta?: Record<string, number>) => ({ meta }) as never;

describe('X Factor', () => {
  it('reads the relative volume carried on the hit', () => {
    assert.equal(xFactorOf(hit({ xFactor: 2.35 })), 2.35);
    assert.equal(xFactorOf(hit({ xFactor: 1.1 })), 1.1);
  });

  it('does not care which card the hit came from', () => {
    // baseHit stamps every scanner, so the display rule needs no allowlist and a
    // card added later shows X Factor without touching this file.
    assert.equal(xFactorOf({ scannerId: 'wolf_hunters', meta: { xFactor: 3 } } as never), 3);
    assert.equal(xFactorOf({ scannerId: 'anything_new', meta: { xFactor: 3 } } as never), 3);
  });

  it('falls back to no value instead of inventing one', () => {
    assert.equal(xFactorOf(hit()), null);
    assert.equal(xFactorOf(hit({ xFactor: 0 })), null);
    assert.equal(xFactorOf(hit({ xFactor: Number.NaN })), null);
  });

  it('prints one decimal with the multiple sign', () => {
    assert.equal(formatXFactor(2.35), '2.4×');
    assert.equal(formatXFactor(1), '1.0×');
  });
});
