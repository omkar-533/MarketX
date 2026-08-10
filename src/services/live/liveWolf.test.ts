/**
 * LIVE WOLF unit tests — candle builder + MTF analysis (no LLM).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LiveCandleBuilder } from './LiveCandleBuilder';
import { analyzeMultiTimeframe } from './MultiTimeframeAnalysisService';
import { mockMarketDataProvider } from '../radar/MockMarketDataProvider';
import type { Candle } from '../radar/radarTypes';

function seedCandles(n = 40): Candle[] {
  const out: Candle[] = [];
  let p = 100;
  const now = Date.now();
  for (let i = n; i >= 0; i--) {
    const open = p;
    const close = p + (i % 4 === 0 ? -0.4 : 0.35);
    out.push({
      symbol: 'TEST',
      exchange: 'NSE',
      timeframe: '5m',
      timestamp: now - i * 300_000,
      open,
      high: Math.max(open, close) + 0.2,
      low: Math.min(open, close) - 0.2,
      close,
      volume: 1000 + i,
    });
    p = close;
  }
  return out;
}

describe('LiveCandleBuilder', () => {
  it('updates forming candle without duplicating', () => {
    const hist = seedCandles(30);
    const builder = new LiveCandleBuilder('TEST', '5m', hist);
    const before = builder.getCandles().length;
    const r1 = builder.applyQuote(hist[hist.length - 1].close + 0.1);
    assert.ok(r1);
    assert.equal(builder.getCandles().length, before);
    assert.ok(r1.updated.close > hist[hist.length - 1].close - 1);
  });

  it('rejects absurd ticks', () => {
    const hist = seedCandles(20);
    const builder = new LiveCandleBuilder('TEST', '5m', hist);
    const bad = builder.applyQuote(hist[hist.length - 1].close * 2);
    assert.equal(bad, null);
  });
});

describe('MultiTimeframeAnalysisService', () => {
  it('returns WAIT when history is short', () => {
    const { snapshot } = analyzeMultiTimeframe({
      symbol: 'X',
      exchange: 'NSE',
      timeframe: '5m',
      ltf: seedCandles(5),
      htf: seedCandles(5),
      price: 100,
      dataMode: 'DEMO',
    });
    assert.equal(snapshot.waiting, true);
    assert.ok(snapshot.explanation.toLowerCase().includes('watching') || snapshot.status === 'WAIT');
  });

  it('analyzes demo candles without throwing', async () => {
    const ltf = await mockMarketDataProvider.getCandles('RELIANCE', '5m', 80);
    const htf = await mockMarketDataProvider.getCandles('RELIANCE', '1h', 80);
    const { snapshot } = analyzeMultiTimeframe({
      symbol: 'RELIANCE',
      exchange: 'NSE',
      timeframe: '5m',
      ltf,
      htf,
      price: ltf.at(-1)?.close || 0,
      dataMode: 'DEMO',
    });
    assert.ok(snapshot.analyzedAt > 0);
    assert.ok(snapshot.structure);
  });
});
