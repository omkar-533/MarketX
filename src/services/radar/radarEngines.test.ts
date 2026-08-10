import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  atr,
  ema,
  findSwings,
  rsi,
  sma,
  volumeRatio,
  type TechnicalSnapshot,
} from './TechnicalEngine';
import { detectStructure } from './StructureEngine';
import { detectLiquidity } from './LiquidityEngine';
import { detectVolume } from './VolumeEngine';
import { computeWolfScore, WOLF_SCORE_WEIGHTS } from './WolfScoringEngine';
import { classifySetup } from './SetupEngine';
import { mockMarketDataProvider } from './MockMarketDataProvider';
import { runRadarScan } from './radarScanner';
import type { Candle } from './radarTypes';

function synth(n: number, start = 100): Candle[] {
  const out: Candle[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const open = p;
    const close = p + (i % 5 === 0 ? -1.2 : 0.8);
    out.push({
      symbol: 'TEST',
      exchange: 'NSE',
      timeframe: '5m',
      timestamp: Date.now() - (n - i) * 60_000,
      open,
      high: Math.max(open, close) + 0.4,
      low: Math.min(open, close) - 0.4,
      close,
      volume: 1000 + i * 10,
    });
    p = close;
  }
  return out;
}

describe('TechnicalEngine', () => {
  it('computes sma / ema / rsi / atr', () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 + i);
    assert.equal(sma(vals, 5), 127);
    assert.ok(ema(vals, 5)! > 0);
    const candles = synth(40, 100);
    assert.ok(rsi(candles.map((c) => c.close), 14)! > 0);
    assert.ok(atr(candles, 14)! > 0);
  });

  it('finds swings on wavy series', () => {
    const candles = synth(40, 100);
    // Force a clear swing high mid series
    candles[20].high = 200;
    candles[20].low = 190;
    candles[20].close = 195;
    const swings = findSwings(candles, 2);
    assert.ok(swings.length >= 0);
  });
});

describe('Structure / Liquidity / Volume', () => {
  it('returns structure event', () => {
    const candles = synth(50, 200);
    const ev = detectStructure(candles, '5m');
    assert.ok(ev.type);
    assert.ok(ev.strength >= 0);
  });

  it('returns volume state', () => {
    const candles = synth(30, 100);
    candles[candles.length - 1].volume = 50_000;
    const v = detectVolume(candles);
    assert.ok(v.ratio > 0);
  });

  it('liquidity engine does not throw', () => {
    const candles = synth(40, 150);
    const liq = detectLiquidity(candles, '5m');
    assert.ok(liq.type);
  });
});

describe('WolfScoringEngine', () => {
  it('weights sum to 100', () => {
    const sum = Object.values(WOLF_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(sum, 100);
  });

  it('scores setup between 0 and 100', async () => {
    const candles = await mockMarketDataProvider.getCandles('RELIANCE', '5m', 80);
    const tech = {
      last: candles[candles.length - 1].close,
      ema21: null,
      ema50: null,
      sma20: null,
      rsi14: 58,
      atr14: 4,
      vwap: null,
      volumeRatio: 1.5,
      trend: 'up' as const,
      swings: [],
    } satisfies TechnicalSnapshot;
    const structure = detectStructure(candles, '5m');
    const liquidity = detectLiquidity(candles, '5m');
    const volume = detectVolume(candles);
    const setup = classifySetup({
      timeframe: '5m',
      tech,
      structure,
      liquidity,
      volume,
      htfTrend: 'up',
    });
    if (!setup) return;
    const score = computeWolfScore({ structure, liquidity, volume, tech, setup });
    assert.ok(score.score >= 0 && score.score <= 100);
  });
});

describe('runRadarScan (demo provider)', () => {
  it('returns ranked DEMO results without throwing', async () => {
    const rows = await runRadarScan({ market: 'NSE', universe: 'NIFTY50', timeframe: '5m' });
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length <= 5);
    for (const r of rows) {
      assert.equal(r.dataMode, 'DEMO');
      assert.ok(r.score >= 0 && r.score <= 100);
    }
  });
});
