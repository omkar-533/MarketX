import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_EXIT, evaluateSymbol, sequence } from './exits.mjs';

const DAY = '2026-08-03';
const OPEN_MS = Date.parse(`${DAY}T09:15:00+05:30`);

/** Minimal symbol shaped like the loader's output, one session of 5m bars. */
function symbolOf(bars) {
  const n = bars.length;
  const arr = (pick) => Float64Array.from(bars.map(pick));
  return {
    symbol: 'TEST',
    n,
    t: Float64Array.from(bars.map((_, i) => OPEN_MS + i * 300000)),
    o: arr((b) => b.o),
    h: arr((b) => b.h),
    l: arr((b) => b.l),
    c: arr((b) => b.c),
    v: Float64Array.from(bars.map(() => 1000)),
    minutes: Int32Array.from(bars.map((_, i) => 9 * 60 + 15 + i * 5)),
    dayIdx: Int32Array.from(bars.map(() => 0)),
    days: [{ ymd: DAY, from: 0, to: n - 1 }],
    atr14: Float64Array.from(bars.map(() => 1)),
    vwap: arr((b) => b.c),
    ema200: arr((b) => b.c),
    rvol: Float64Array.from(bars.map(() => 2)),
    swing3: { swingLow: Float64Array.from(bars.map(() => NaN)), swingHigh: Float64Array.from(bars.map(() => NaN)) },
  };
}

const bar = (o, h, l, c) => ({ o, h, l, c });

/**
 * Entry closes at 100 with the bar low at 98, so a `bar` stop with no padding
 * puts risk at 2.00 and 1R at 102.
 */
function run(rest, exitOverrides = {}, target = 3) {
  const S = symbolOf([bar(100, 100, 98, 100), ...rest]);
  const ex = { ...DEFAULT_EXIT, padAtr: 0, minRiskPct: 0, ...exitOverrides };
  const cands = evaluateSymbol(S, [{ i: 0, side: 'long' }], ex, [], [target]);
  return sequence(cands, target, 9)[0];
}

describe('close-based stop', () => {
  it('ignores a wick through the stop and exits only on a close beyond it', () => {
    const t = run([bar(100, 100, 90, 99), bar(99, 106, 99, 106)], {}, 3);
    assert.equal(t.how, 'TARGET');
    assert.equal(t.r, 3);
  });

  it('books the loss at the closing price, so it can be worse than 1R', () => {
    const t = run([bar(100, 100, 94, 94)]);
    assert.equal(t.how, 'STOP');
    assert.equal(t.r, -3); // (94 - 100) / 2
  });

  it('gives a bar that reaches the target and then collapses to the target', () => {
    const t = run([bar(100, 106, 90, 90)], {}, 3);
    assert.equal(t.how, 'TARGET');
    assert.equal(t.r, 3);
  });
});

describe('scaling out', () => {
  const SCALE = { partialAt: 1, partialPct: 0.5, beAfterPartial: true };

  it('turns a trade that tags 1R and returns to entry into a small win', () => {
    // Touches 102 (1R), then closes back under the breakeven stop at 100.
    const t = run([bar(100, 102, 100, 101), bar(101, 101, 99, 99)], SCALE, 3);
    assert.equal(t.how, 'PARTIAL');
    // Half booked at +1R, half out at (99-100)/2 = -0.5R.
    assert.equal(t.r, 0.5 * 1 + 0.5 * -0.5);
    assert.ok(t.r > 0, 'a scaled-out trade that gives the rest back still counts as a win');
  });

  it('leaves a full loss alone when price never reaches the scale-out', () => {
    const t = run([bar(100, 101, 94, 94)], SCALE, 3);
    assert.equal(t.how, 'STOP');
    assert.equal(t.r, -3);
  });

  it('takes a smaller total when the runner reaches the target', () => {
    const full = run([bar(100, 106, 99, 106)], {}, 3);
    const scaled = run([bar(100, 106, 99, 106)], SCALE, 3);
    assert.equal(full.r, 3);
    assert.equal(scaled.r, 0.5 * 1 + 0.5 * 3); // 2R — accuracy is bought with upside
    assert.ok(scaled.r < full.r);
  });

  it('keeps the original stop when breakeven is switched off', () => {
    const t = run([bar(100, 102, 100, 101), bar(101, 101, 99, 99), bar(99, 99, 94, 94)], {
      ...SCALE,
      beAfterPartial: false,
    }, 3);
    assert.equal(t.how, 'PARTIAL');
    assert.equal(t.r, 0.5 * 1 + 0.5 * -3);
  });

  it('scales out at 2R when asked to', () => {
    const t = run([bar(100, 104, 100, 104), bar(104, 104, 99, 99)], { partialAt: 2, partialPct: 0.5, beAfterPartial: true }, 5);
    assert.equal(t.r, 0.5 * 2 + 0.5 * -0.5);
  });
});

describe('position bookkeeping', () => {
  it('never holds two positions in the same symbol at once', () => {
    const S = symbolOf([
      bar(100, 100, 98, 100),
      bar(100, 101, 99, 100),
      bar(100, 101, 99, 100),
      bar(100, 107, 99, 107),
    ]);
    const ex = { ...DEFAULT_EXIT, padAtr: 0, minRiskPct: 0 };
    const cands = evaluateSymbol(S, [{ i: 0, side: 'long' }, { i: 1, side: 'long' }], ex, [], [3]);
    const taken = sequence(cands, 3, 9);
    assert.equal(taken.length, 1, 'the second signal fires while the first is still open');
  });

  it('respects the per-day cap', () => {
    const S = symbolOf([
      bar(100, 100, 98, 100),
      bar(100, 100, 94, 94),
      bar(94, 94, 92, 94),
      bar(94, 94, 88, 88),
      bar(88, 88, 86, 88),
      bar(88, 88, 82, 82),
    ]);
    const ex = { ...DEFAULT_EXIT, padAtr: 0, minRiskPct: 0, maxPerDay: 2 };
    const signals = [0, 2, 4].map((i) => ({ i, side: 'long' }));
    const cands = evaluateSymbol(S, signals, ex, [], [3]);
    assert.equal(sequence(cands, 3, 2).length, 2);
  });
});
