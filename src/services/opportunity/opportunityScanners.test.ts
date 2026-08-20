import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  scanBreakoutRadar,
  scanCompressionBreak,
  scanLiquidityHunt,
  scanMomentumSurge,
  scanMorningSprint,
  scanOpeningDrive,
  scanTopMovers,
  scanTrendRider,
  scanOptionsFlow,
  scanWolfPrime,
  stampLiveQuote,
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
  it('lists ten keepers only', () => {
    assert.deepEqual(
      OPPORTUNITY_SCANNERS.map((s) => s.id),
      ['morning_sprint', 'opening_drive', 'wolf_prime', 'momentum_surge', 'compression_break', 'breakout_radar', 'top_movers', 'liquidity_hunt', 'trend_rider', 'options_flow'],
    );
  });
});

describe('scanMorningSprint', () => {
  const sprinter = (over: Record<string, unknown> = {}) =>
    ctx({
      sessionChangePct: 1.4,
      sessionVolRatio: 1.8,
      sessionOpen: 100,
      sessionHigh: 101.4,
      sessionLow: 99.8,
      sessionMinsFromOpen: 30,
      vwap: 100.6,
      gapPct: 0.1,
      openingHigh: 101.0,
      openingLow: 99.9,
      prevDayHigh: 101.8,
      prevDayLow: 99.2,
      tech: { last: 101.2, atr14: 0.4 },
      ...over,
    });

  it('lists a bullish opening drive (GREENPANEL type)', () => {
    const hit = scanMorningSprint(sprinter());
    assert.ok(hit);
    assert.equal(hit?.direction, 'bullish');
    assert.equal(hit?.stateLabel, 'MORNING SPRINT');
    assert.ok((hit?.score ?? 0) >= 58);
  });

  it('lists a gap blast holding above the open (SHAILY type)', () => {
    const hit = scanMorningSprint(
      sprinter({ gapPct: 1.3, sessionChangePct: 0.5, sessionMinsFromOpen: 15 }),
    );
    assert.ok(hit);
    assert.equal(hit?.direction, 'bullish');
    assert.equal(hit?.stateLabel, '🔥 GAP BLAST');
  });

  it('lists a bearish morning sprint below VWAP', () => {
    const hit = scanMorningSprint(
      sprinter({
        sessionChangePct: -1.5,
        gapPct: -0.2,
        vwap: 101.6,
        sessionHigh: 101.5,
        sessionLow: 101.0,
        openingHigh: 101.3,
        openingLow: 101.15,
        tech: { last: 101.2, atr14: 0.4 },
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.direction, 'bearish');
    assert.equal(hit?.trigger, 101.0);
  });

  it('thinks on the first completed 9:15–9:20 candle', () => {
    const hit = scanMorningSprint(sprinter({ sessionMinsFromOpen: 5 }));
    assert.ok(hit);
    assert.equal(hit?.direction, 'bullish');
  });

  it('skips once the morning window is over', () => {
    assert.equal(scanMorningSprint(sprinter({ sessionMinsFromOpen: 120 })), null);
  });

  it('skips a move on dead volume', () => {
    assert.equal(
      scanMorningSprint(sprinter({ volume: { ratio: 1.0, state: 'NORMAL' }, sessionVolRatio: 1.0 })),
      null,
    );
  });

  it('skips a long that lost VWAP', () => {
    assert.equal(scanMorningSprint(sprinter({ vwap: 102.5 })), null);
  });

  it('skips a small move with no gap', () => {
    assert.equal(scanMorningSprint(sprinter({ sessionChangePct: 0.4, gapPct: 0.1 })), null);
  });

  it('watches a gap before the 0.8% blast', () => {
    const hit = scanMorningSprint(
      sprinter({ gapPct: 0.7, sessionChangePct: 0.4, sessionMinsFromOpen: 5 }),
    );
    assert.ok(hit);
    assert.equal(hit?.status, 'WATCH');
    assert.equal(hit?.direction, 'bullish');
  });

  it('prints official day % from prev close, not 20-bar drift', () => {
    const c = sprinter({
      prevClose: 100,
      changePercent: 4.76,
      sessionChangePct: 2.48,
    });
    const hit = scanMorningSprint(c);
    assert.ok(hit);
    assert.equal(hit?.price, 101.2);
    assert.ok(Math.abs((hit?.changePercent ?? 0) - 1.2) < 1e-6);
  });

  it('refreshes a morning print to the latest last and day %', () => {
    const hit = scanMorningSprint(sprinter());
    assert.ok(hit);
    hit.price = 284.6;
    hit.changePercent = 4.76;
    stampLiveQuote(hit, {
      tech: { last: 372.55 },
      prevClose: 374.45,
      sessionChangePct: 2.1,
    } as never);
    assert.equal(hit.price, 372.55);
    assert.ok(Math.abs(hit.changePercent - ((372.55 - 374.45) / 374.45) * 100) < 1e-6);
  });
});

describe('scanTopMovers', () => {
  const mover = (over: Record<string, unknown> = {}) =>
    ctx({
      sessionChangePct: 2.1,
      sessionRangePct: 2.4,
      sessionVolRatio: 1.6,
      sessionHigh: 103.4,
      sessionLow: 100.9,
      sessionMinsFromOpen: 95,
      vwap: 100.8,
      prevDayHigh: 102.5,
      prevDayLow: 99.5,
      atrPct: 0.6,
      tech: { last: 103.2, atr14: 0.6 },
      ...over,
    });

  it('lists a bullish mover above VWAP with day volume', () => {
    const hit = scanTopMovers(mover());
    assert.ok(hit);
    assert.equal(hit?.direction, 'bullish');
    assert.equal(hit?.stateLabel, '🔥 PDH BREAK');
    assert.ok((hit?.score ?? 0) >= 58);
  });

  it('lists a bearish mover below VWAP', () => {
    const hit = scanTopMovers(
      mover({
        sessionChangePct: -1.8,
        sessionHigh: 101.6,
        sessionLow: 100.85,
        vwap: 101.5,
        tech: { last: 100.9, atr14: 0.6 },
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.direction, 'bearish');
    assert.equal(hit?.trigger, 100.85);
  });

  it('skips a move that lost VWAP', () => {
    assert.equal(scanTopMovers(mover({ vwap: 104 })), null);
  });

  it('skips a small session move', () => {
    assert.equal(scanTopMovers(mover({ sessionChangePct: 0.3 })), null);
  });

  it('skips a mover on dead volume', () => {
    assert.equal(
      scanTopMovers(mover({ volume: { ratio: 1.0, state: 'NORMAL' }, sessionVolRatio: 1.0 })),
      null,
    );
  });
});

describe('scanOpeningDrive', () => {
  const drive = (over: Record<string, unknown> = {}) =>
    ctx({
      openingHigh: 101.0,
      openingLow: 100.2,
      sessionMinsFromOpen: 20,
      sessionChangePct: 0.8,
      sessionVolRatio: 1.4,
      gapPct: 0.4,
      prevClose: 100.1,
      sessionOpen: 100.5,
      candles: [bar({ open: 100.9, high: 101.5, low: 100.85, close: 101.4 })],
      tech: { last: 101.4, atr14: 0.5 },
      ...over,
    });

  it('lists a morning opening-range break with early volume', () => {
    const hit = scanOpeningDrive(drive());
    assert.ok(hit);
    assert.equal(hit?.direction, 'bullish');
    assert.equal(hit?.stateLabel, '🔥 GAP + DRIVE');
    assert.ok((hit?.score ?? 0) >= 58);
  });

  it('lists a bearish opening drive too', () => {
    const hit = scanOpeningDrive(
      drive({
        openingLow: 100.5,
        gapPct: -0.5,
        candles: [bar({ open: 100.8, high: 100.85, low: 99.9, close: 100.0 })],
        tech: { last: 100.0, atr14: 0.5 },
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.direction, 'bearish');
  });

  it('does not print after the morning window', () => {
    assert.equal(scanOpeningDrive(drive({ sessionMinsFromOpen: 200 })), null);
  });

  it('watches a poke that is still inside the opening range', () => {
    const hit = scanOpeningDrive(
      drive({
        candles: [bar({ open: 100.9, high: 101.6, low: 100.85, close: 100.9 })],
        tech: { last: 100.9, atr14: 0.5 },
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.status, 'WATCH');
    assert.equal(hit?.direction, 'bullish');
  });

  it('skips a range break on dead volume', () => {
    assert.equal(
      scanOpeningDrive(drive({ volume: { ratio: 1.0, state: 'NORMAL' }, sessionVolRatio: 1.0 })),
      null,
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
          volume: { ratio: 1.0, state: 'NORMAL' },
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

  it('skips a late chase far beyond the level', () => {
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

  it('lists a 20-bar close with volume when the prior box was not coiled', () => {
    const hit = scanBreakoutRadar(
      ctx({
        priorAtrCompression: 1.15,
        high20: 100.8,
        low20: 98.2,
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.status, 'ACTIVE');
    assert.equal(hit?.stateLabel, 'BREAKOUT + VOLUME');
  });

  it('lists a 20-bar close even when the prior box was coiled', () => {
    const hit = scanBreakoutRadar(ctx());
    assert.ok(hit);
    assert.equal(hit?.status, 'ACTIVE');
    assert.equal(hit?.stateLabel, 'BREAKOUT + VOLUME');
  });
});

describe('scanMomentumSurge', () => {
  it('skips average volume or a quiet bar with a tiny 20-bar move', () => {
    assert.equal(scanMomentumSurge(ctx({ volume: { ratio: 1.0, state: 'NORMAL' } })), null);
    assert.equal(
      scanMomentumSurge(
        ctx({
          changePercent: 0.2,
          atrPct: 0.8,
          roc5: 0.1,
          candles: [bar({ open: 101.18, high: 101.22, low: 101.16, close: 101.2 })],
          tech: { last: 101.2, atr14: 0.9 },
        }),
      ),
      null,
    );
  });

  it('still lists a 5-bar burst when the 20-bar % is small', () => {
    const hit = scanMomentumSurge(
      ctx({
        changePercent: 0.25,
        atrPct: 0.8,
        roc5: 0.8,
        volume: { ratio: 1.7, state: 'EXPANDING' },
        candles: [bar({ open: 100.7, high: 101.05, low: 100.65, close: 101.0 })],
        tech: { last: 101.0, rsi14: 48, atr14: 0.9 },
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.direction, 'bullish');
  });

  it('does not skip a stretched runner', () => {
    const hit = scanMomentumSurge(
      ctx({
        changePercent: 3.2,
        atrPct: 0.5,
        roc5: 1.4,
        volume: { ratio: 2.1, state: 'UNUSUAL' },
        candles: [bar({ open: 128, high: 131, low: 127.5, close: 130 })],
        tech: { last: 130, ema21: 100, rsi14: 78, atr14: 1.2 },
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.status, 'ACTIVE');
    assert.ok((hit?.score ?? 0) >= 68);
  });

  it('lists unusual volume plus an ATR-sized move', () => {
    const hit = scanMomentumSurge(
      ctx({
        volume: { ratio: 2.1, state: 'UNUSUAL' },
        changePercent: 1.2,
        atrPct: 0.5,
        atrCompression: 1.25,
        tech: { last: 101.2, rsi14: 50, atr14: 0.5 },
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.status, 'ACTIVE');
    assert.equal(hit?.direction, 'bullish');
  });

  it('leaves a quiet day-long move to Top Movers', () => {
    assert.equal(
      scanMomentumSurge(
        ctx({
          volume: { ratio: 1.1, state: 'NORMAL' },
          changePercent: 0.3,
          atrPct: 0.6,
          roc5: 0.1,
          sessionChangePct: 2.1,
          sessionRangePct: 2.4,
          sessionVolRatio: 1.6,
          sessionHigh: 103.4,
          sessionLow: 100.9,
          candles: [bar({ open: 101.18, high: 101.24, low: 101.14, close: 101.2 })],
          tech: { last: 101.2, rsi14: 58, atr14: 0.6 },
        }),
      ),
      null,
    );
  });

  it('watches volume expansion while price is still inside the 20-bar box', () => {
    const hit = scanMomentumSurge(
      ctx({
        volume: { ratio: 1.7, state: 'EXPANDING' },
        changePercent: 0.2,
        atrPct: 0.8,
        roc5: 0.1,
        high20: 102.4,
        low20: 99.5,
        priorAtrCompression: 1.1,
        candles: [bar({ open: 101.0, high: 101.15, low: 100.95, close: 101.1 })],
        tech: { last: 101.1, atr14: 0.8 },
      }),
    );
    assert.ok(hit);
    assert.equal(hit?.status, 'WATCH');
    assert.equal(hit?.direction, 'bullish');
  });

  it('skips a session move on dead volume', () => {
    assert.equal(
      scanMomentumSurge(
        ctx({
          volume: { ratio: 1.0, state: 'NORMAL' },
          changePercent: 0.3,
          atrPct: 0.6,
          sessionChangePct: 2.1,
          sessionRangePct: 2.4,
          sessionVolRatio: 1.0,
          candles: [bar({ open: 101.18, high: 101.24, low: 101.14, close: 101.2 })],
          tech: { last: 101.2, atr14: 0.6 },
        }),
      ),
      null,
    );
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

  it('ignores two late confirms with no early setup', () => {
    assert.equal(
      scanWolfPrime(ctx(), {
        momentum_surge: { score: 84, status: 'ACTIVE', direction: 'bullish' },
        breakout_radar: { score: 82, status: 'ACTIVE', direction: 'bullish' },
      }),
      null,
    );
  });

  it('lists when an early watch and a confirmed keeper agree', () => {
    const hit = scanWolfPrime(ctx(), {
      compression_break: { score: 80, status: 'WATCH', direction: 'bullish' },
      momentum_surge: { score: 84, status: 'ACTIVE', direction: 'bullish' },
    });
    assert.ok(hit);
    assert.equal(hit?.status, 'ACTIVE');
    assert.ok((hit?.score ?? 0) >= 80);
  });

  it('lists when three keepers agree even if all are confirmed', () => {
    const hit = scanWolfPrime(ctx(), {
      momentum_surge: { score: 84, status: 'ACTIVE', direction: 'bullish' },
      breakout_radar: { score: 82, status: 'ACTIVE', direction: 'bullish' },
      trend_rider: { score: 78, status: 'ACTIVE', direction: 'bullish' },
    });
    assert.ok(hit);
    assert.equal(hit?.status, 'ACTIVE');
  });
});

describe('scanOptionsFlow', () => {
  const live = {
    symbol: 'TCS',
    expiry: '2026-08-21',
    fetchedAt: 1,
    spot: 101.2,
    ceOi: 200_000,
    peOi: 120_000,
    ceOiChg: 20_000,
    peOiChg: 2_000,
    ceVol: 5_000,
    peVol: 2_000,
    pcr: 0.6,
    atmStrike: 100,
    atmBandCeOiChg: 12_000,
    atmBandPeOiChg: -1_000,
  };

  it('does not invent a hit without a live chain', () => {
    assert.equal(scanOptionsFlow(ctx({ prevClose: 100, sessionChangePct: 1.2 })), null);
  });

  it('lists long buildup from live CE OI add + green day', () => {
    const hit = scanOptionsFlow(ctx({ prevClose: 100, sessionChangePct: 1.2 }), live);
    assert.ok(hit);
    assert.equal(hit?.scannerId, 'options_flow');
    assert.equal(hit?.direction, 'bullish');
    assert.equal(hit?.stateLabel, '🔥 LONG BUILDUP');
    assert.ok((hit?.score ?? 0) >= 58);
  });

  it('lists last-session call-heavy when ΔOI is flat but PCR is real', () => {
    const hit = scanOptionsFlow(ctx({ prevClose: 100, sessionChangePct: 1.2 }), {
      ...live,
      ceOiChg: 0,
      peOiChg: 0,
      atmBandCeOiChg: 0,
      atmBandPeOiChg: 0,
      ceVol: 0,
      peVol: 0,
      pcr: 0.62,
    });
    assert.ok(hit);
    assert.equal(hit?.stateLabel, '🔥 CALL HEAVY');
    assert.equal(hit?.direction, 'bullish');
  });
});
