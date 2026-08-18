import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Candle } from '../radar/radarTypes';
import { decideMarketTrend, emptyMarketTrend } from './marketTrend';

function bars(kind: 'up' | 'down' | 'chop', n = 80, tf: Candle['timeframe'] = '15m'): Candle[] {
  const out: Candle[] = [];
  let px = 24_000;
  for (let i = 0; i < n; i++) {
    if (kind === 'up') px += 18 + (i % 5 === 0 ? 6 : 0);
    else if (kind === 'down') px -= 18 + (i % 5 === 0 ? 6 : 0);
    else px += i % 6 < 3 ? 8 : -8;
    const close = px;
    const open = kind === 'chop' ? px + (i % 2 ? 4 : -4) : kind === 'up' ? px - 10 : px + 10;
    const high = Math.max(open, close) + 6;
    const low = Math.min(open, close) - 6;
    out.push({
      symbol: 'NIFTY',
      exchange: 'NSE',
      timeframe: tf,
      timestamp: 1_700_000_000_000 + i * 900_000,
      open,
      high,
      low,
      close,
      volume: 12_000 + i * 10,
    });
  }
  return out;
}

const q = (symbol: string, changePercent: number, price = 24_000) => ({
  symbol,
  price,
  changePercent,
});

describe('decideMarketTrend', () => {
  it('stays unavailable when quotes and candles are missing', () => {
    const out = decideMarketTrend({ quotes: [], niftyIntraday: null, niftyDaily: null });
    assert.equal(out.available, false);
    assert.equal(out.label, '—');
    assert.equal(out.bias, 'neutral');
  });

  it('calls the market bullish when all three indices are up', () => {
    const out = decideMarketTrend({
      quotes: [q('NIFTY', 0.82), q('BANKNIFTY', 0.61), q('SENSEX', 0.55)],
      niftyIntraday: null,
      niftyDaily: null,
    });
    assert.equal(out.available, true);
    assert.equal(out.bias, 'bullish');
    assert.equal(out.label, 'Bullish');
  });

  it('calls the market bearish when all three indices are down', () => {
    const out = decideMarketTrend({
      quotes: [q('NIFTY', -0.9), q('BANKNIFTY', -0.7), q('SENSEX', -0.5)],
      niftyIntraday: null,
      niftyDaily: null,
    });
    assert.equal(out.bias, 'bearish');
    assert.equal(out.label, 'Bearish');
  });

  it('stays neutral when NIFTY and BANKNIFTY day moves conflict', () => {
    const out = decideMarketTrend({
      quotes: [q('NIFTY', 0.8), q('BANKNIFTY', -0.7), q('SENSEX', 0.1)],
      niftyIntraday: null,
      niftyDaily: null,
    });
    assert.equal(out.available, true);
    assert.equal(out.bias, 'neutral');
  });

  it('stays neutral on tiny mixed day moves', () => {
    const out = decideMarketTrend({
      quotes: [q('NIFTY', 0.08), q('BANKNIFTY', -0.05), q('SENSEX', 0.02)],
      niftyIntraday: null,
      niftyDaily: null,
    });
    assert.equal(out.bias, 'neutral');
  });

  it('does not invent a trend from a zero-price quote', () => {
    const out = decideMarketTrend({
      quotes: [{ symbol: 'NIFTY', price: 0, changePercent: 1.2 }],
      niftyIntraday: [],
      niftyDaily: null,
    });
    assert.equal(out.available, false);
    assert.equal(out.reason, emptyMarketTrend().reason);
  });

  it('uses NIFTY candles when day change is flat', () => {
    const out = decideMarketTrend({
      quotes: [q('NIFTY', 0.04), q('BANKNIFTY', 0.01), q('SENSEX', -0.02)],
      niftyIntraday: bars('up', 80, '15m'),
      niftyDaily: bars('up', 80, '1D'),
    });
    assert.equal(out.available, true);
    assert.equal(out.bias, 'bullish');
  });

  it('calls bearish from a falling NIFTY structure', () => {
    const out = decideMarketTrend({
      quotes: [q('NIFTY', -0.05)],
      niftyIntraday: bars('down', 80, '15m'),
      niftyDaily: bars('down', 80, '1D'),
    });
    assert.equal(out.bias, 'bearish');
  });
});
