import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFeatureSnapshot, cardQuote, previousTradingDayClose } from './featureSnapshot';

function c(ts: number, close: number) {
  return {
    timestamp: ts,
    open: close,
    high: close + 0.2,
    low: close - 0.2,
    close,
    volume: 2000,
  };
}

describe('opportunity card quote', () => {
  it('takes the last close of the previous NSE day', () => {
    const candles = [
      c(Date.parse('2026-08-18T09:15:00+05:30'), 370),
      c(Date.parse('2026-08-18T15:25:00+05:30'), 372.55),
      c(Date.parse('2026-08-19T09:15:00+05:30'), 371),
    ];
    assert.equal(previousTradingDayClose(candles, '2026-08-19'), 372.55);
  });

  it('uses prev close → last, never 20-bar drift', () => {
    const q = cardQuote({
      tech: { last: 370.65 } as never,
      prevClose: 372.55,
      sessionChangePct: 2.4,
    });
    assert.equal(q.price, 370.65);
    assert.ok(Math.abs(q.changePercent - ((370.65 - 372.55) / 372.55) * 100) < 1e-9);
  });

  it('falls back to session open→last when prev close is missing', () => {
    const q = cardQuote({
      tech: { last: 101.2 } as never,
      prevClose: null,
      sessionChangePct: 1.4,
    });
    assert.equal(q.changePercent, 1.4);
  });

  it('snapshot last is the 15:30 print and prevClose is yesterday last', () => {
    const start18 = Date.parse('2026-08-18T09:15:00+05:30');
    const start19 = Date.parse('2026-08-19T09:15:00+05:30');
    const candles = [];
    for (let i = 0; i < 20; i += 1) candles.push(c(start18 + i * 300_000, 360 + i * 0.1));
    candles.push(c(Date.parse('2026-08-18T15:25:00+05:30'), 372.55));
    for (let i = 0; i < 10; i += 1) candles.push(c(start19 + i * 300_000, 370 + i * 0.05));
    candles.push(c(Date.parse('2026-08-19T15:30:00+05:30'), 370.1));
    const f = buildFeatureSnapshot('PFC', 'NSE', '5m', candles);
    assert.ok(f);
    assert.equal(f.prevClose, 372.55);
    assert.equal(f.tech.last, 370.1);
    const q = cardQuote(f);
    assert.equal(q.price, 370.1);
    assert.ok(Math.abs(q.changePercent - ((370.1 - 372.55) / 372.55) * 100) < 1e-9);
  });
});
