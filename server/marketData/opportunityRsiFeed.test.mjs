import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { foldTwoHour, normalizeBars, wilderRsiSeries } from './opportunityRsiFeed.mjs';

const H = 3_600_000;

function hourBars(day, count, startHourIst = 9.25) {
  const base = Date.parse(`${day}T09:15:00+05:30`);
  return Array.from({ length: count }, (_, i) => ({
    timestamp: base + Math.round((startHourIst - 9.25) * H) + i * H,
    close: 100 + i,
  }));
}

describe('opportunity RSI feed', () => {
  it('drops rows without a usable time or close', () => {
    const bars = normalizeBars([
      { timestamp: 0, close: 100 },
      { timestamp: 1_787_000_000_000, close: 0 },
      { timestamp: 1_787_000_000_000, close: 101 },
      { time: 1_787_000_300, close: 102 },
    ]);
    assert.equal(bars.length, 2);
    assert.deepEqual(
      bars.map((b) => b.close),
      [101, 102],
    );
  });

  it('accepts second-precision stamps and keeps rows ascending', () => {
    const bars = normalizeBars([
      { time: 1_787_000_600, close: 103 },
      { time: 1_787_000_300, close: 102 },
    ]);
    assert.deepEqual(
      bars.map((b) => b.close),
      [102, 103],
    );
  });

  it('folds 60m bars into NSE 2h buckets and keeps the stub bar', () => {
    // 09:15, 10:15, 11:15, 12:15, 13:15, 14:15, 15:15 → 4 two-hour prints.
    const folded = foldTwoHour(hourBars('2026-08-20', 7));
    assert.equal(folded.length, 4);
    assert.deepEqual(
      folded.map((b) => b.close),
      [101, 103, 105, 106],
    );
  });

  it('restarts the 2h pairing every session', () => {
    const twoDays = [...hourBars('2026-08-20', 7), ...hourBars('2026-08-21', 7)];
    const folded = foldTwoHour(twoDays);
    assert.equal(folded.length, 8);
  });

  it('returns nothing until there are more bars than the RSI period', () => {
    const bars = Array.from({ length: 14 }, (_, i) => ({ timestamp: i + 1, close: 100 + i }));
    assert.deepEqual(wilderRsiSeries(bars), []);
  });

  it('prints 100 for an unbroken advance and 0 for an unbroken decline', () => {
    const up = Array.from({ length: 30 }, (_, i) => ({ timestamp: i + 1, close: 100 + i }));
    const down = Array.from({ length: 30 }, (_, i) => ({ timestamp: i + 1, close: 200 - i }));
    const upLast = wilderRsiSeries(up).at(-1)[1];
    const downLast = wilderRsiSeries(down).at(-1)[1];
    assert.equal(upLast, 100);
    assert.ok(downLast < 0.01, `expected ~0, got ${downLast}`);
  });

  it('matches a hand-computed Wilder RSI and stamps each bar close', () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28, 46.28,
    ];
    const bars = closes.map((close, i) => ({ timestamp: (i + 1) * 60_000, close }));
    const series = wilderRsiSeries(bars);
    // 15 closes, period 14 → exactly one print, stamped at the last bar.
    assert.equal(series.length, 1);
    assert.equal(series[0][0], 15 * 60_000);
    assert.ok(Math.abs(series[0][1] - 70.46) < 0.1, `got ${series[0][1]}`);
  });

  it('keeps Wilder smoothing — later bars carry earlier averages', () => {
    const bars = Array.from({ length: 40 }, (_, i) => ({
      timestamp: (i + 1) * 60_000,
      close: 100 + Math.sin(i / 3) * 5,
    }));
    const series = wilderRsiSeries(bars);
    assert.equal(series.length, 40 - 14);
    for (const [t, v] of series) {
      assert.ok(t > 0);
      assert.ok(v >= 0 && v <= 100, `rsi out of range: ${v}`);
    }
  });
});
