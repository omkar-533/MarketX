/**
 * 1H Opening Range + FVG retest — strategy engine.
 *
 * Pure and chronological: every decision at bar i reads bars 0..i only. Nothing
 * here fetches, caches or mutates global state, so the same input always
 * produces the same trades.
 *
 * Every rule that the written strategy left open is a named config field with a
 * documented default, so a report can print exactly what it ran.
 */

const IST_OFFSET_MS = 5.5 * 3600_000;
const SESSION_OPEN_MIN = 9 * 60 + 15;
const SESSION_CLOSE_MIN = 15 * 60 + 30;

export const DEFAULT_CONFIG = {
  /** Execution timeframe in minutes. 3 or 5 per the strategy. */
  tfMinutes: 5,
  /** NSE tick. Used for "cleanly beyond" and for the Model B stop buffer. */
  tick: 0.05,
  /**
   * Which edge of an opening-range ZONE arms the breakout.
   * 'outer' — close beyond the 1H high/low (a zone then behaves like a line).
   * 'inner' — close beyond the body edge, i.e. the near side of the wick zone.
   * A LINE level always triggers on the 1H high/low.
   */
  zoneEdge: 'outer',
  /** Breakout close must clear the level by this many ticks. 0 = strictly beyond. */
  breakoutBufferTicks: 0,
  /** "Immediately after": the FVG's third candle must close within N bars of the breakout bar. */
  fvgMaxBarsAfterBreakout: 10,
  /** Require the gap to sit beyond the opening-range level, i.e. in breakout territory. */
  requireFvgBeyondRange: true,
  /** A bullish gap dies when a bar CLOSES below its lower edge (wick through it is not enough). */
  invalidateOnCloseOnly: true,
  /** Confirmation body test. 'strict' = small wick only. 'either' = strong body OR small wick. */
  confirmationRule: 'strict',
  /** For 'either': body must be at least this share of the bar's range. */
  strongBodyRatio: 0.5,
  /** Last bar open time (IST minutes) that may open a trade. */
  lastEntryMin: 14 * 60 + 45,
  /** Open positions are marked out at this bar's close. */
  squareOffMin: 15 * 60 + 15,
  /** Stop model: 'A' = far edge of the FVG, 'B' = beyond the confirmation bar's wick. */
  stopModel: 'A',
  /**
   * What actually stops the trade out.
   * 'close' — only a bar that CLOSES beyond the level; a wick through it is ignored,
   *           and the exit is that bar's close, so a loss can run past 1R.
   * 'touch' — the level is a resting order and any wick through it fills at the level.
   */
  stopTrigger: 'close',
  /** Model B pads the stop past the wick by this many ticks. */
  stopBufferTicks: 1,
  /** Skip a signal whose risk is below this share of entry price — R would be noise. */
  minRiskPct: 0.001,
  /**
   * Push a stop that sits closer than this share of entry price out to the floor
   * instead of skipping the trade. Costs are a percentage of price, so a stop
   * this tight hands most of R to the broker; widening it keeps the setup and
   * makes each R worth more than the round trip. 0 leaves the stop untouched.
   */
  stopMinPct: 0,
  /** Both a long and a short setup may run on one day (one trade per side). */
  allowBothSides: true,
  /** R multiples simulated independently from the same entry. */
  targets: [1, 2, 3, 4, 5, 6, 8, 10],
};

export function istParts(ms) {
  const d = new Date(ms + IST_OFFSET_MS);
  return {
    ymd: d.toISOString().slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

export function istClock(ms) {
  const d = new Date(ms + IST_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function bodyOf(bar) {
  return Math.abs(bar.c - bar.o);
}

function upperWickOf(bar) {
  return bar.h - Math.max(bar.o, bar.c);
}

function lowerWickOf(bar) {
  return Math.min(bar.o, bar.c) - bar.l;
}

/**
 * Wick rule from the strategy: a wick SMALLER than half the body is a zone
 * (the whole wick is the area); a wick at least half the body is a plain line.
 * A zero body has no half to compare against, so it can only be a line.
 */
export function openingRangeLevels(hour, cfg = DEFAULT_CONFIG) {
  const body = bodyOf(hour);
  const bodyTop = Math.max(hour.o, hour.c);
  const bodyBot = Math.min(hour.o, hour.c);
  const upperWick = upperWickOf(hour);
  const lowerWick = lowerWickOf(hour);

  const upperIsZone = body > 0 && upperWick < body / 2;
  const lowerIsZone = body > 0 && lowerWick < body / 2;

  const upperTrigger = upperIsZone && cfg.zoneEdge === 'inner' ? bodyTop : hour.h;
  const lowerTrigger = lowerIsZone && cfg.zoneEdge === 'inner' ? bodyBot : hour.l;

  return {
    high: hour.h,
    low: hour.l,
    open: hour.o,
    close: hour.c,
    body,
    upperKind: upperIsZone ? 'ZONE' : 'LINE',
    lowerKind: lowerIsZone ? 'ZONE' : 'LINE',
    upperZone: upperIsZone ? [bodyTop, hour.h] : null,
    lowerZone: lowerIsZone ? [hour.l, bodyBot] : null,
    upperTrigger,
    lowerTrigger,
  };
}

/** Aggregate execution bars whose open time falls inside [fromMin, toMin). */
export function buildRangeCandle(bars) {
  if (!bars.length) return null;
  let h = -Infinity;
  let l = Infinity;
  let v = 0;
  for (const b of bars) {
    if (b.h > h) h = b.h;
    if (b.l < l) l = b.l;
    v += Number(b.v) || 0;
  }
  return { t: bars[0].t, o: bars[0].o, h, l, c: bars[bars.length - 1].c, v };
}

function isConfirmation(bar, side, cfg) {
  const body = bodyOf(bar);
  if (body <= 0) return false;
  if (side === 'long' && bar.c <= bar.o) return false;
  if (side === 'short' && bar.c >= bar.o) return false;

  const wick = side === 'long' ? upperWickOf(bar) : lowerWickOf(bar);
  const smallWick = wick < body / 2;
  if (cfg.confirmationRule === 'plain') return true;
  if (cfg.confirmationRule === 'strict') return smallWick;

  const range = bar.h - bar.l;
  const strongBody = range > 0 && body / range >= cfg.strongBodyRatio;
  return smallWick || strongBody;
}

/**
 * First gap that qualifies for `side`, searched strictly forward from the
 * breakout. The third candle may be the breakout bar itself ("during the
 * breakout") or up to `fvgMaxBarsAfterBreakout` bars later.
 */
function findFvg(bars, breakoutIdx, side, level, cfg) {
  const last = Math.min(bars.length - 1, breakoutIdx + cfg.fvgMaxBarsAfterBreakout);
  for (let i = Math.max(2, breakoutIdx); i <= last; i++) {
    const c1 = bars[i - 2];
    const c3 = bars[i];
    if (side === 'long') {
      if (!(c3.l > c1.h)) continue;
      if (cfg.requireFvgBeyondRange && c1.h < level) continue;
      return { idx: i, lower: c1.h, upper: c3.l, formedAt: c3.t };
    }
    if (!(c3.h < c1.l)) continue;
    if (cfg.requireFvgBeyondRange && c1.l > level) continue;
    return { idx: i, lower: c3.h, upper: c1.l, formedAt: c3.t };
  }
  return null;
}

function fvgDead(bar, fvg, side, cfg) {
  if (side === 'long') {
    return cfg.invalidateOnCloseOnly ? bar.c < fvg.lower : bar.l < fvg.lower;
  }
  return cfg.invalidateOnCloseOnly ? bar.c > fvg.upper : bar.h > fvg.upper;
}

function touchedFvg(bar, fvg, side) {
  return side === 'long' ? bar.l <= fvg.upper : bar.h >= fvg.lower;
}

/**
 * Hunt one side of one day. Returns a setup record even when it never reaches
 * an entry, so the report can show where setups die.
 */
function huntSide(bars, side, levels, cfg) {
  const level = side === 'long' ? levels.upperTrigger : levels.lowerTrigger;
  const buffer = cfg.breakoutBufferTicks * cfg.tick;

  let breakoutIdx = -1;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (istParts(bar.t).minutes > cfg.lastEntryMin) break;
    const green = bar.c > bar.o;
    const red = bar.c < bar.o;
    if (side === 'long' && green && bar.c > level + buffer) {
      breakoutIdx = i;
      break;
    }
    if (side === 'short' && red && bar.c < level - buffer) {
      breakoutIdx = i;
      break;
    }
  }
  if (breakoutIdx < 0) return { side, stage: 'NO_BREAKOUT' };

  const breakout = bars[breakoutIdx];
  const fvg = findFvg(bars, breakoutIdx, side, level, cfg);
  if (!fvg) {
    return { side, stage: 'NO_FVG', breakoutAt: breakout.t, breakoutPrice: breakout.c };
  }

  const base = {
    side,
    breakoutAt: breakout.t,
    breakoutPrice: breakout.c,
    fvgAt: fvg.formedAt,
    fvgLower: fvg.lower,
    fvgUpper: fvg.upper,
  };

  let touchedAt = null;
  for (let i = fvg.idx + 1; i < bars.length; i++) {
    const bar = bars[i];
    const min = istParts(bar.t).minutes;
    if (min > cfg.lastEntryMin) return { ...base, stage: touchedAt ? 'NO_CONFIRM' : 'NO_RETEST', touchedAt };

    const touchedNow = touchedFvg(bar, fvg, side);
    if (touchedNow && touchedAt === null) touchedAt = bar.t;

    if (touchedAt !== null && isConfirmation(bar, side, cfg)) {
      return { ...base, stage: 'ENTRY', touchedAt, entryIdx: i, entryBar: bar };
    }
    // A gap that gets closed through is gone, but only after this bar had its
    // chance to confirm — both events read the same close.
    if (fvgDead(bar, fvg, side, cfg)) {
      return { ...base, stage: 'FVG_INVALIDATED', touchedAt };
    }
  }
  return { ...base, stage: touchedAt ? 'NO_CONFIRM' : 'NO_RETEST', touchedAt };
}

function simulate(bars, setup, cfg) {
  const entryBar = setup.entryBar;
  const entry = entryBar.c;
  const long = setup.side === 'long';
  const pad = cfg.stopBufferTicks * cfg.tick;

  const rawStop =
    cfg.stopModel === 'A'
      ? long
        ? setup.fvgLower
        : setup.fvgUpper
      : long
        ? entryBar.l - pad
        : entryBar.h + pad;

  const rawRisk = long ? entry - rawStop : rawStop - entry;
  if (!(rawRisk > 0)) return { ...setup, stage: 'SKIP_RISK', reason: 'stop on the wrong side of entry' };
  if (rawRisk < cfg.minRiskPct * entry) return { ...setup, stage: 'SKIP_RISK', reason: 'risk below floor' };

  const risk = Math.max(rawRisk, cfg.stopMinPct * entry);
  const stop = long ? entry - risk : entry + risk;

  const results = {};
  for (const target of cfg.targets) {
    const tp = long ? entry + target * risk : entry - target * risk;
    let outcome = null;

    for (let i = setup.entryIdx + 1; i < bars.length; i++) {
      const bar = bars[i];
      const min = istParts(bar.t).minutes;
      const hitTp = long ? bar.h >= tp : bar.l <= tp;
      const stopped = cfg.stopTrigger === 'close'
        ? (long ? bar.c <= stop : bar.c >= stop)
        : (long ? bar.l <= stop : bar.h >= stop);

      if (cfg.stopTrigger === 'close') {
        // A close is the last print of the bar, so any target touch inside the same
        // bar necessarily happened first. No assumption needed to order them.
        if (hitTp) {
          outcome = { result: 'WIN', r: target, exit: tp, exitAt: bar.t, ambiguous: false };
          break;
        }
        if (stopped) {
          // The exit is the close, not the level — that is what a close-based stop costs.
          const r = (long ? bar.c - entry : entry - bar.c) / risk;
          outcome = { result: 'LOSS', r, exit: bar.c, exitAt: bar.t, ambiguous: false };
          break;
        }
      } else {
        if (stopped && hitTp) {
          // Same bar touched both and this timeframe cannot order them.
          outcome = { result: 'LOSS', r: -1, exit: stop, exitAt: bar.t, ambiguous: true };
          break;
        }
        if (stopped) {
          outcome = { result: 'LOSS', r: -1, exit: stop, exitAt: bar.t, ambiguous: false };
          break;
        }
        if (hitTp) {
          outcome = { result: 'WIN', r: target, exit: tp, exitAt: bar.t, ambiguous: false };
          break;
        }
      }
      if (min >= cfg.squareOffMin) {
        const r = (long ? bar.c - entry : entry - bar.c) / risk;
        outcome = { result: 'TIME', r, exit: bar.c, exitAt: bar.t, ambiguous: false };
        break;
      }
    }

    if (!outcome) {
      const lastBar = bars[bars.length - 1];
      const r = (long ? lastBar.c - entry : entry - lastBar.c) / risk;
      outcome = { result: 'TIME', r, exit: lastBar.c, exitAt: lastBar.t, ambiguous: false };
    }
    results[target] = outcome;
  }

  return {
    ...setup,
    stage: 'TRADE',
    entryAt: entryBar.t,
    entry,
    stop,
    risk,
    entryBar,
    results,
  };
}

/**
 * One IST day. `bars` must be that day's session bars only, sorted ascending.
 * Returns the opening range, both side attempts and any trades.
 */
export function runDay(bars, cfgIn = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...cfgIn };
  const session = bars.filter((b) => {
    const { minutes } = istParts(b.t);
    return minutes >= SESSION_OPEN_MIN && minutes < SESSION_CLOSE_MIN;
  });
  if (!session.length) return { ok: false, reason: 'no session bars' };

  const orBars = session.filter((b) => istParts(b.t).minutes < SESSION_OPEN_MIN + 60);
  const expected = 60 / cfg.tfMinutes;
  if (orBars.length !== expected) {
    return { ok: false, reason: `opening hour has ${orBars.length}/${expected} bars` };
  }

  const hour = buildRangeCandle(orBars);
  const levels = openingRangeLevels(hour, cfg);
  const after = session.filter((b) => istParts(b.t).minutes >= SESSION_OPEN_MIN + 60);
  if (!after.length) return { ok: false, reason: 'nothing after the opening hour' };

  const sides = cfg.allowBothSides ? ['long', 'short'] : ['long', 'short'];
  const setups = [];
  for (const side of sides) {
    const found = huntSide(after, side, levels, cfg);
    setups.push(found.stage === 'ENTRY' ? simulate(after, found, cfg) : found);
  }

  if (!cfg.allowBothSides) {
    const traded = setups.filter((s) => s.stage === 'TRADE').sort((a, b) => a.entryAt - b.entryAt);
    if (traded.length > 1) {
      const keep = traded[0];
      return { ok: true, hour, levels, setups: setups.filter((s) => s.stage !== 'TRADE' || s === keep) };
    }
  }

  return { ok: true, hour, levels, setups };
}
