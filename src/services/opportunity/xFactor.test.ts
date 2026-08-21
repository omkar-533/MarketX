import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatXFactor, showsXFactor, xFactorOf } from './xFactor';

const hit = (scannerId: string, meta?: Record<string, number>) =>
  ({ scannerId, meta }) as never;

describe('X Factor', () => {
  it('is shown only on the volume-driven cards', () => {
    assert.equal(showsXFactor('morning_sprint'), true);
    assert.equal(showsXFactor('opening_drive'), true);
    assert.equal(showsXFactor('wolf_prime'), false);
    assert.equal(showsXFactor('options_flow'), false);
  });

  it('reads the relative volume carried on the hit', () => {
    assert.equal(xFactorOf(hit('morning_sprint', { xFactor: 2.35 })), 2.35);
    assert.equal(xFactorOf(hit('opening_drive', { xFactor: 1.1 })), 1.1);
  });

  it('falls back to no value on an older row instead of inventing one', () => {
    assert.equal(xFactorOf(hit('morning_sprint')), null);
    assert.equal(xFactorOf(hit('morning_sprint', { xFactor: 0 })), null);
    assert.equal(xFactorOf(hit('morning_sprint', { xFactor: Number.NaN })), null);
  });

  it('never reports a value for a card that does not carry it', () => {
    assert.equal(xFactorOf(hit('trend_rider', { xFactor: 3 })), null);
  });

  it('prints one decimal with the multiple sign', () => {
    assert.equal(formatXFactor(2.35), '2.4×');
    assert.equal(formatXFactor(1), '1.0×');
  });
});
