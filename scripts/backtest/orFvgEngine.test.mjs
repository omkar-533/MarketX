import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CONFIG, openingRangeLevels, runDay } from './orFvgEngine.mjs';

const OPEN = Date.parse('2026-08-03T09:15:00+05:30');
const STEP = 5 * 60_000;

function bar(i, o, h, l, c) {
  return { t: OPEN + i * STEP, o, h, l, c, v: 1000 };
}

/** Twelve 5m bars that aggregate to open 100, high 105, low 99, close 104. */
function openingHour() {
  const out = [];
  for (let i = 0; i < 9; i++) out.push(bar(i, 100, 100, 100, 100));
  out.push(bar(9, 100, 105, 100, 100));
  out.push(bar(10, 100, 100, 99, 100));
  out.push(bar(11, 100, 104, 100, 104));
  return out;
}

function longSetupBars() {
  return [
    bar(12, 104.5, 106.2, 104.4, 106.0), // breakout: green close above 105
    bar(13, 106.0, 108.5, 105.9, 108.0), // gap candle 2
    bar(14, 108.2, 109.5, 106.5, 109.0), // gap candle 3: low 106.5 > 106.2
    bar(15, 107.5, 107.6, 106.4, 106.8), // taps the gap, closes red -> no entry
    bar(16, 106.9, 108.1, 106.8, 108.0), // bullish, tiny upper wick -> ENTRY at 108.0
  ];
}

function longSetup(extra, cfg = {}) {
  const day = runDay([...openingHour(), ...longSetupBars(), ...extra], { ...cfg });
  assert.equal(day.ok, true, day.reason);
  return day.setups.find((s) => s.side === 'long');
}

describe('opening range wick rule', () => {
  it('calls a wick smaller than half the body a zone, and a bigger wick a line', () => {
    const levels = openingRangeLevels({ o: 100, h: 112, l: 99, c: 110 }, DEFAULT_CONFIG);
    // body 10, upper wick 2, lower wick 1 — both under half the body.
    assert.equal(levels.upperKind, 'ZONE');
    assert.equal(levels.lowerKind, 'ZONE');
    assert.deepEqual(levels.upperZone, [110, 112]);
    assert.deepEqual(levels.lowerZone, [99, 100]);

    const wicky = openingRangeLevels({ o: 100, h: 120, l: 90, c: 110 }, DEFAULT_CONFIG);
    assert.equal(wicky.upperKind, 'LINE');
    assert.equal(wicky.lowerKind, 'LINE');
  });

  it('has no half-body to compare against on a doji, so both sides are lines', () => {
    const levels = openingRangeLevels({ o: 100, h: 101, l: 99, c: 100 }, DEFAULT_CONFIG);
    assert.equal(levels.upperKind, 'LINE');
    assert.equal(levels.lowerKind, 'LINE');
  });

  it('arms the breakout at the outer or the inner edge of a zone as configured', () => {
    const hour = { o: 100, h: 112, l: 99, c: 110 };
    assert.equal(openingRangeLevels(hour, { ...DEFAULT_CONFIG, zoneEdge: 'outer' }).upperTrigger, 112);
    assert.equal(openingRangeLevels(hour, { ...DEFAULT_CONFIG, zoneEdge: 'inner' }).upperTrigger, 110);
    // A line ignores the setting entirely.
    const wicky = { o: 100, h: 120, l: 90, c: 110 };
    assert.equal(openingRangeLevels(wicky, { ...DEFAULT_CONFIG, zoneEdge: 'inner' }).upperTrigger, 120);
  });
});

describe('breakout', () => {
  it('ignores a wick through the level when the candle closes back inside', () => {
    const day = runDay([...openingHour(), bar(12, 104.5, 106.5, 104.4, 104.8)], {});
    assert.equal(day.setups.find((s) => s.side === 'long').stage, 'NO_BREAKOUT');
  });

  it('ignores a red candle even when it closes above the level', () => {
    const day = runDay([...openingHour(), bar(12, 107.0, 107.2, 105.5, 106.0)], {});
    assert.equal(day.setups.find((s) => s.side === 'long').stage, 'NO_BREAKOUT');
  });
});

describe('fair value gap and retest', () => {
  it('takes the first gap after the breakout and waits for a tap plus a bullish close', () => {
    const setup = longSetup([bar(17, 108.0, 112.5, 107.9, 112.0)]);
    assert.equal(setup.stage, 'TRADE');
    assert.equal(setup.fvgLower, 106.2);
    assert.equal(setup.fvgUpper, 106.5);
    assert.equal(setup.entry, 108.0);
    assert.equal(setup.touchedAt, OPEN + 15 * STEP);
    assert.equal(setup.entryAt, OPEN + 16 * STEP);
  });

  it('refuses a confirmation candle whose upper wick is at least half its body', () => {
    const bars = [...openingHour(), ...longSetupBars().slice(0, 4), bar(16, 106.9, 110.0, 106.8, 107.4)];
    const day = runDay(bars, {});
    const setup = day.setups.find((s) => s.side === 'long');
    // Bullish close but the upper wick (2.6) dwarfs the body (0.5).
    assert.equal(setup.stage, 'NO_CONFIRM');
  });

  it('kills the gap when a candle closes back through its lower edge', () => {
    const bars = [
      ...openingHour(),
      ...longSetupBars().slice(0, 3),
      bar(15, 107.0, 107.1, 105.0, 105.5), // closes under 106.2
      bar(16, 105.6, 108.5, 105.5, 108.4),
    ];
    const day = runDay(bars, {});
    assert.equal(day.setups.find((s) => s.side === 'long').stage, 'FVG_INVALIDATED');
  });

  it('does not read a gap that formed before the breakout', () => {
    const day = runDay([...openingHour(), ...longSetupBars()], { fvgMaxBarsAfterBreakout: 0 });
    const setup = day.setups.find((s) => s.side === 'long');
    // The gap completes two bars after the breakout, outside the window.
    assert.equal(setup.stage, 'NO_FVG');
  });
});

describe('stops and targets', () => {
  it('puts Model A at the far edge of the gap and Model B under the entry wick', () => {
    const runner = [bar(17, 108.0, 112.5, 107.9, 112.0)];
    assert.equal(longSetup(runner, { stopModel: 'A' }).stop, 106.2);
    // Entry bar low 106.8 minus one tick.
    assert.equal(longSetup(runner, { stopModel: 'B' }).stop.toFixed(2), '106.75');
  });

  it('books the near targets and stops out of the far ones', () => {
    const setup = longSetup([
      bar(17, 108.0, 112.5, 107.9, 112.0), // reaches 1R (109.8) and 2R (111.6)
      bar(18, 112.0, 112.0, 105.0, 106.0), // sweeps the 106.2 stop
    ]);
    assert.equal(setup.risk.toFixed(2), '1.80');
    assert.equal(setup.results[1].result, 'WIN');
    assert.equal(setup.results[2].result, 'WIN');
    assert.equal(setup.results[3].result, 'LOSS');
    assert.equal(setup.results[10].result, 'LOSS');
  });

  it('calls a bar that spans both the stop and the target a loss', () => {
    const setup = longSetup([bar(17, 108.0, 112.0, 105.0, 111.0)]);
    assert.equal(setup.results[1].result, 'LOSS');
    assert.equal(setup.results[1].ambiguous, true);
  });

  it('marks an unresolved trade out at the close instead of scoring it a win', () => {
    const setup = longSetup([bar(17, 108.0, 108.6, 107.8, 108.5)]);
    assert.equal(setup.results[3].result, 'TIME');
    assert.equal(setup.results[3].r.toFixed(3), (0.5 / 1.8).toFixed(3));
  });

  it('skips a signal whose risk is a rounding error', () => {
    const setup = longSetup([bar(17, 108.0, 112.5, 107.9, 112.0)], { minRiskPct: 0.05 });
    assert.equal(setup.stage, 'SKIP_RISK');
  });
});

describe('short side', () => {
  it('mirrors the whole sequence below the range', () => {
    const bars = [
      ...openingHour(),
      bar(12, 99.5, 99.6, 98.0, 98.2), // red close below 99
      bar(13, 98.2, 98.3, 96.0, 96.5),
      bar(14, 96.4, 97.5, 95.5, 96.0), // c3 high 97.5 < c1 low 98.0 -> gap 97.5..98.0
      bar(15, 96.5, 97.6, 96.4, 97.4), // taps the gap, closes green -> no entry
      bar(16, 97.4, 97.5, 96.0, 96.1), // bearish, tiny lower wick -> ENTRY at 96.1
      bar(17, 96.1, 96.2, 92.0, 92.5),
    ];
    const setup = runDay(bars, {}).setups.find((s) => s.side === 'short');
    assert.equal(setup.stage, 'TRADE');
    assert.equal(setup.fvgLower, 97.5);
    assert.equal(setup.fvgUpper, 98.0);
    assert.equal(setup.entry, 96.1);
    assert.equal(setup.stop, 98.0);
    assert.equal(setup.results[1].result, 'WIN');
  });
});

describe('session guards', () => {
  it('refuses a day whose opening hour is missing bars instead of guessing', () => {
    const day = runDay([...openingHour().slice(0, 10), bar(12, 104, 106, 104, 106)], {});
    assert.equal(day.ok, false);
    assert.match(day.reason, /opening hour has 10\/12/);
  });

  it('will not open a trade after the entry cutoff', () => {
    const setup = longSetup([bar(17, 108.0, 112.5, 107.9, 112.0)], { lastEntryMin: 10 * 60 });
    assert.equal(setup.stage, 'NO_BREAKOUT');
  });
});
