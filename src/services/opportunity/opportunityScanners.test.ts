import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  scanBreakoutRadar,
  scanCompressionBreak,
  scanLiquidityHunt,
  scanMomentumSurge,
  scanTrendRider,
  scanWolfPrime,
} from './opportunityScanners';
import { OPPORTUNITY_SCANNERS } from './opportunityTypes';

function bar(over: Record<string, number> = {}) {
  return {
    open: 100.7,
    high: 101.4,
    low: 100.6,
    close: 101.2,
    volume: 2000,
    timestamp: 1,
    ...over,
  };
}

function ctx(over: Record<string, unknown> = {}) {
  const techOver = (over.tech && typeof over.tech === 'object' ? over.tech : {}) as Record<string, unknown>;
  const volOver = (over.volume && typeof over.volume === 'object' ? over.volume : {}) as Record<string, unknown>;
  const rest = { ...over };
  delete rest.tech;
  delete rest.volume;
  return {
    timeframe: '5m' as const,
    dataMode: 'LIVE' as const,
    quotePrice: 101.2,
    f: {
      symbol: 'TCS',
      exchange: 'NSE',
      candles: [bar({ close: 100.9, high: 101, low: 100.7 }), bar()],
      tech: {
        last: 101.2,
        trend: 'up',
        sma20: 100.4,
        ema21: 100.5,
        ema50: 99.8,
        rsi14: 62,
        atr14: 0.4,
        ...techOver,
      },
      volume: { ratio: 1.6, state: 'EXPANDING', ...volOver },
      structure: { strength: 40 },
      liquidity: { type: 'NONE', direction: 'neutral', level: 0, confirmed: false },
      changePercent: 1.1,
      rangePct: 0.8,
      atrPct: 0.4,
      atrCompression: 1.2,
      priorAtrCompression: 0.75,
      high10: 101,
      high20: 100.8,
      low10: 99.9,
      low20: 100,
      swingHigh: 101,
      swingLow: 100,
      dayHigh: 101.4,
      setupAt: 1,
      ...rest,
    } as never,
  };
}

describe('Opportunity desk scanners', () => {
  it('lists six keepers only', () => {
    assert.deepEqual(
      OPPORTUNITY_SCANNERS.map((s) => s.id),
      ['wolf_prime', 'compression_break', 'breakout_radar', 'liquidity_hunt', 'momentum_surge', 'trend_rider'],
    );
  });
});

describe('scanCompressionBreak', () => {
  it('does not list a coil that has not left the range', () => {
    assert.equal(
      scanCompressionBreak(
        ctx({
          candles: [bar({ open: 100.2, high: 100.5, low: 100.1, close: 100.3 })],
          tech: { last: 100.3, atr14: 0.4 },
        }),
      ),
      null,
    );
  });

  it('does not list a 20-bar break that was not coiled', () => {
    assert.equal(
      scanCompressionBreak(
        ctx({
          high20: 110,
          low20: 90,
          priorAtrCompression: 1.05,
          tech: { last: 112, atr14: 0.4 },
          candles: [bar({ open: 110, high: 112.4, low: 109.8, close: 112 })],
        }),
      ),
      null,
    );
  });

  it('does not list a coil break without volume', () => {
    assert.equal(
      scanCompressionBreak(
        ctx({
          volume: { ratio: 1.2, state: 'NORMAL' },
        }),
      ),
      null,
    );
  });

  it('lists after a volume close leaves a coiled 20-bar box', () => {
    const hit = scanCompressionBreak(ctx());
    assert.ok(hit);
    assert.equal(hit?.direction, 'bullish');
    assert.equal(hit?.status, 'ACTIVE');
    assert.equal(hit?.stateLabel, 'COMPRESSION BREAK');
  });
});

describe('scanBreakoutRadar', () => {
  it('ignores a 10-bar poke that has not closed beyond the 20-bar high', () => {
    assert.equal(
      scanBreakoutRadar(
        ctx({
          high10: 100.5,
          high20: 102,
          candles: [bar({ open: 100.6, high: 101.2, low: 100.5, close: 101 })],
          tech: { last: 101, atr14: 0.4 },
        }),
      ),
      null,
    );
  });

  it('skips a late chase more than 1.2 ATR beyond the level', () => {
    assert.equal(
      scanBreakoutRadar(
        ctx({
          high20: 100,
          candles: [bar({ open: 102, high: 103.2, low: 101.8, close: 103 })],
          tech: { last: 103, atr14: 0.4 },
        }),
      ),
      null,
    );
  });

  it('lists a 20-bar close with volume', () => {
    const hit = scanBreakoutRadar(ctx());
    assert.ok(hit);
    assert.equal(hit?.status, 'ACTIVE');
    assert.equal(hit?.stateLabel, 'BREAKOUT + VOLUME');
  });
});

describe('scanMomentumSurge', () => {
  it('skips average volume or a sub-ATR drift', () => {
    assert.equal(scanMomentumSurge(ctx({ volume: { ratio: 1.4, state: 'EXPANDING' } })), null);
    assert.equal(scanMomentumSurge(ctx({ changePercent: 0.2, atrPct: 0.8 })), null);
  });

  it('skips when RSI disagrees with the move', () => {
    assert.equal(scanMomentumSurge(ctx({ tech: { last: 101.2, rsi14: 50, atr14: 0.4 } })), null);
  });

  it('lists unusual volume plus an ATR-sized move', () => {
    const hit = scanMomentumSurge(
      ctx({
        volume: { ratio: 2.1, state: 'UNUSUAL' },
        changePercent: 1.2,
        atrPct: 0.5,
        atrCompression: 1.25,
        tech: { last: 101.2, rsi14: 62, atr14: 0.5 },
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.status, 'ACTIVE');
    assert.equal(hit?.direction, 'bullish');
  });
});

describe('scanLiquidityHunt', () => {
  it('skips equal-pool resting liquidity without a reclaim', () => {
    assert.equal(
      scanLiquidityHunt(
        ctx({
          liquidity: { type: 'EQUAL_LOWS', direction: 'neutral', level: 100, confirmed: true },
          swingLow: 100,
          candles: [bar({ open: 100.2, high: 100.4, low: 100.05, close: 100.3 }), bar({ open: 100.3, high: 100.5, low: 100.1, close: 100.4 })],
        }),
      ),
      null,
    );
  });

  it('lists a stop-hunt wick with close back through the level', () => {
    const hit = scanLiquidityHunt(
      ctx({
        swingLow: 100,
        volume: { ratio: 1.4, state: 'EXPANDING' },
        tech: { last: 100.4, atr14: 1 },
        candles: [
          bar({ open: 100.2, high: 100.5, low: 99.5, close: 100.1 }),
          bar({ open: 100.1, high: 100.6, low: 99.6, close: 100.4 }),
        ],
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.status, 'CONFIRM');
    assert.equal(hit?.direction, 'bullish');
  });
});

describe('scanTrendRider', () => {
  it('skips a stacked trend that is stretched away from EMA21', () => {
    assert.equal(
      scanTrendRider(
        ctx({
          tech: { last: 104, ema21: 100, ema50: 98, rsi14: 62, atr14: 1 },
          candles: [bar({ open: 103, high: 104.2, low: 102.8, close: 104 })],
          volume: { ratio: 1.1, state: 'NORMAL' },
        }),
      ),
      null,
    );
  });

  it('lists a pullback hold on a stacked EMA with RSI agreement', () => {
    const hit = scanTrendRider(
      ctx({
        tech: { last: 100.4, ema21: 100, ema50: 98.5, rsi14: 58, atr14: 1 },
        volume: { ratio: 1.05, state: 'NORMAL' },
        candles: [
          bar({ open: 100.6, high: 100.8, low: 99.95, close: 100.2 }),
          bar({ open: 100.2, high: 100.7, low: 100.1, close: 100.4 }),
        ],
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.status, 'ACTIVE');
    assert.equal(hit?.direction, 'bullish');
  });
});

describe('scanWolfPrime', () => {
  it('ignores parked scanners and trend+hunt without a volume keeper', () => {
    assert.equal(
      scanWolfPrime(ctx(), { momentum_fade: 90, reversal_hunter: 90, flow_shift: 90 }),
      null,
    );
    assert.equal(
      scanWolfPrime(ctx(), { trend_rider: 90, liquidity_hunt: 90 }),
      null,
    );
  });

  it('lists when two keepers agree and one is volume-based', () => {
    const hit = scanWolfPrime(ctx(), { momentum_surge: 84, breakout_radar: 82 });
    assert.ok(hit);
    assert.equal(hit?.status, 'ACTIVE');
    assert.ok((hit?.score ?? 0) >= 80);
  });
});
