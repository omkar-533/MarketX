import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scanCompressionBreak } from './opportunityScanners';

function ctx(over: Record<string, unknown> = {}) {
  return {
    timeframe: '5m' as const,
    dataMode: 'LIVE' as const,
    quotePrice: 100,
    f: {
      symbol: 'TCS',
      exchange: 'NSE',
      tech: { last: 100, trend: 'up', sma20: 98 },
      volume: { ratio: 1.2, state: 'NORMAL' },
      changePercent: 0.4,
      rangePct: 0.5,
      atrCompression: 0.7,
      high20: 110,
      low20: 90,
      dayHigh: 110,
      setupAt: 1,
      ...over,
    } as never,
  };
}

describe('scanCompressionBreak', () => {
  it('does not list a coil that has not left the range', () => {
    assert.equal(scanCompressionBreak(ctx()), null);
  });

  it('lists after price leaves the 20-bar range', () => {
    const hit = scanCompressionBreak(
      ctx({
        tech: { last: 112, trend: 'up', sma20: 98 },
        volume: { ratio: 1.5, state: 'EXPANDING' },
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.direction, 'bullish');
    assert.equal(hit?.stateLabel, 'BREAKOUT ACTIVE');
  });
});
