/**
 * Signal families.
 *
 * A family is a named entry trigger plus the grid of parameters worth trying.
 * Each generator returns the bars where a trade would be entered AT THE CLOSE
 * of that bar. Levels are always read at `i - 1` so a trigger never consults a
 * level that only became visible because of the bar it is triggering on.
 */

const SESSION_START = 9 * 60 + 15;

function baseGuard(S, i, warmup) {
  if (i < warmup) return false;
  if (S.dayStart[i]) return false; // needs at least one prior bar in the session
  return true;
}

function swingOf(S, key) {
  return key === 2 ? S.swing2 : key === 3 ? S.swing3 : S.swing5;
}

/* ------------------------------------------------------------------ *
 * 1. Liquidity sweep and reclaim — the "stop hunt" pattern.
 *    Price pokes through a confirmed swing where stops rest, then closes
 *    back on the original side within the same bar.
 * ------------------------------------------------------------------ */
function sweepReclaim(S, p) {
  const out = [];
  const sw = swingOf(S, p.swing);
  for (let i = 210; i < S.n; i++) {
    if (!baseGuard(S, i, 210)) continue;
    const lo = sw.swingLow[i - 1];
    const hi = sw.swingHigh[i - 1];
    const range = S.h[i] - S.l[i];
    if (!(range > 0)) continue;
    if (p.side !== 'short' && Number.isFinite(lo) && S.l[i] < lo && S.c[i] > lo) {
      const reclaim = (S.c[i] - lo) / range;
      if (reclaim >= p.reclaim) out.push({ i, side: 'long', ref: lo });
    }
    if (p.side !== 'long' && Number.isFinite(hi) && S.h[i] > hi && S.c[i] < hi) {
      const reclaim = (hi - S.c[i]) / range;
      if (reclaim >= p.reclaim) out.push({ i, side: 'short', ref: hi });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. Previous-day high/low sweep — the same idea on the level the whole
 *    market can see.
 * ------------------------------------------------------------------ */
function pdhlSweep(S, p) {
  const out = [];
  for (let i = 210; i < S.n; i++) {
    if (!baseGuard(S, i, 210)) continue;
    const ph = S.prevHigh[i];
    const pl = S.prevLow[i];
    const range = S.h[i] - S.l[i];
    if (!(range > 0)) continue;
    if (p.side !== 'short' && Number.isFinite(pl) && S.l[i] < pl && S.c[i] > pl) {
      if ((S.c[i] - pl) / range >= p.reclaim) out.push({ i, side: 'long', ref: pl });
    }
    if (p.side !== 'long' && Number.isFinite(ph) && S.h[i] > ph && S.c[i] < ph) {
      if ((ph - S.c[i]) / range >= p.reclaim) out.push({ i, side: 'short', ref: ph });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 3. VWAP reclaim — losing then regaining the session's average price.
 * ------------------------------------------------------------------ */
function vwapReclaim(S, p) {
  const out = [];
  for (let i = 210; i < S.n; i++) {
    if (!baseGuard(S, i, 210)) continue;
    const w = S.vwap[i];
    const wPrev = S.vwap[i - 1];
    if (!Number.isFinite(w) || !Number.isFinite(wPrev)) continue;
    if (p.side !== 'short' && S.c[i - 1] < wPrev && S.c[i] > w && S.l[i] <= w) {
      out.push({ i, side: 'long', ref: w });
    }
    if (p.side !== 'long' && S.c[i - 1] > wPrev && S.c[i] < w && S.h[i] >= w) {
      out.push({ i, side: 'short', ref: w });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 4. VWAP fade — price stretched away from VWAP snapping back.
 * ------------------------------------------------------------------ */
function vwapFade(S, p) {
  const out = [];
  for (let i = 210; i < S.n; i++) {
    if (!baseGuard(S, i, 210)) continue;
    const w = S.vwap[i];
    const a = S.atr14[i];
    if (!Number.isFinite(w) || !Number.isFinite(a) || a <= 0) continue;
    const stretch = (S.c[i] - w) / a;
    if (p.side !== 'long' && stretch >= p.stretch && S.c[i] < S.o[i] && S.c[i] < S.c[i - 1]) {
      out.push({ i, side: 'short', ref: w });
    }
    if (p.side !== 'short' && stretch <= -p.stretch && S.c[i] > S.o[i] && S.c[i] > S.c[i - 1]) {
      out.push({ i, side: 'long', ref: w });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 5. Trend pullback to a moving average.
 * ------------------------------------------------------------------ */
function emaPullback(S, p) {
  const out = [];
  const fast = p.ma === 9 ? S.ema9 : p.ma === 20 ? S.ema20 : S.ema50;
  for (let i = 210; i < S.n; i++) {
    if (!baseGuard(S, i, 210)) continue;
    const m = fast[i];
    const slow = S.ema50[i];
    const anchor = S.ema200[i];
    if (!Number.isFinite(m) || !Number.isFinite(slow) || !Number.isFinite(anchor)) continue;
    const up = m > slow && slow > anchor;
    const down = m < slow && slow < anchor;
    if (p.side !== 'short' && up && S.l[i] <= m && S.c[i] > m && S.c[i] > S.o[i]) {
      out.push({ i, side: 'long', ref: m });
    }
    if (p.side !== 'long' && down && S.h[i] >= m && S.c[i] < m && S.c[i] < S.o[i]) {
      out.push({ i, side: 'short', ref: m });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 6. Opening-range break, first clean close beyond the range.
 * ------------------------------------------------------------------ */
function orBreak(S, p) {
  const out = [];
  const or = p.window === 15 ? S.or15 : p.window === 30 ? S.or30 : S.or60;
  let lastDay = -1;
  let doneLong = false;
  let doneShort = false;
  for (let i = 210; i < S.n; i++) {
    if (!baseGuard(S, i, 210)) continue;
    if (S.dayIdx[i] !== lastDay) {
      lastDay = S.dayIdx[i];
      doneLong = false;
      doneShort = false;
    }
    const hi = or.hi[i];
    const lo = or.lo[i];
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) continue;
    if (p.side !== 'short' && !doneLong && S.c[i] > hi && S.c[i] > S.o[i]) {
      out.push({ i, side: 'long', ref: hi });
      doneLong = true;
    }
    if (p.side !== 'long' && !doneShort && S.c[i] < lo && S.c[i] < S.o[i]) {
      out.push({ i, side: 'short', ref: lo });
      doneShort = true;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 7. Opening-range break that fails and reverses — the range sweep.
 * ------------------------------------------------------------------ */
function orFade(S, p) {
  const out = [];
  const or = p.window === 15 ? S.or15 : p.window === 30 ? S.or30 : S.or60;
  for (let i = 210; i < S.n; i++) {
    if (!baseGuard(S, i, 210)) continue;
    const hi = or.hi[i];
    const lo = or.lo[i];
    const range = S.h[i] - S.l[i];
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || !(range > 0)) continue;
    if (p.side !== 'long' && S.h[i] > hi && S.c[i] < hi && (hi - S.c[i]) / range >= p.reclaim) {
      out.push({ i, side: 'short', ref: hi });
    }
    if (p.side !== 'short' && S.l[i] < lo && S.c[i] > lo && (S.c[i] - lo) / range >= p.reclaim) {
      out.push({ i, side: 'long', ref: lo });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 8. Range compression then expansion.
 * ------------------------------------------------------------------ */
function compression(S, p) {
  const out = [];
  for (let i = 210; i < S.n; i++) {
    if (!baseGuard(S, i, 210)) continue;
    const a = S.atr14[i - 1];
    if (!Number.isFinite(a) || a <= 0) continue;
    let hi = -Infinity;
    let lo = Infinity;
    let ok = true;
    for (let k = i - p.bars; k <= i - 1; k++) {
      if (k < 0 || S.dayIdx[k] !== S.dayIdx[i]) {
        ok = false;
        break;
      }
      if (S.h[k] > hi) hi = S.h[k];
      if (S.l[k] < lo) lo = S.l[k];
    }
    if (!ok || !(hi - lo > 0)) continue;
    if ((hi - lo) / a > p.tight) continue;
    if (p.side !== 'short' && S.c[i] > hi) out.push({ i, side: 'long', ref: hi });
    if (p.side !== 'long' && S.c[i] < lo) out.push({ i, side: 'short', ref: lo });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 9. RSI exhaustion with a reversal close.
 * ------------------------------------------------------------------ */
function rsiReversal(S, p) {
  const out = [];
  for (let i = 210; i < S.n; i++) {
    if (!baseGuard(S, i, 210)) continue;
    const r = S.rsi14[i];
    const rPrev = S.rsi14[i - 1];
    if (!Number.isFinite(r) || !Number.isFinite(rPrev)) continue;
    if (p.side !== 'short' && rPrev < p.low && r >= p.low && S.c[i] > S.o[i]) {
      out.push({ i, side: 'long', ref: S.l[i] });
    }
    if (p.side !== 'long' && rPrev > p.high && r <= p.high && S.c[i] < S.o[i]) {
      out.push({ i, side: 'short', ref: S.h[i] });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 10. Break of structure — close through the last confirmed swing in the
 *     direction of the higher-timeframe trend.
 * ------------------------------------------------------------------ */
function structureBreak(S, p) {
  const out = [];
  const sw = swingOf(S, p.swing);
  for (let i = 210; i < S.n; i++) {
    if (!baseGuard(S, i, 210)) continue;
    const hi = sw.swingHigh[i - 1];
    const lo = sw.swingLow[i - 1];
    const anchor = S.ema200[i];
    if (!Number.isFinite(anchor)) continue;
    if (p.side !== 'short' && Number.isFinite(hi) && S.c[i - 1] <= hi && S.c[i] > hi && S.c[i] > anchor) {
      out.push({ i, side: 'long', ref: hi });
    }
    if (p.side !== 'long' && Number.isFinite(lo) && S.c[i - 1] >= lo && S.c[i] < lo && S.c[i] < anchor) {
      out.push({ i, side: 'short', ref: lo });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 11. Gap continuation from the previous session's close.
 * ------------------------------------------------------------------ */
function gapGo(S, p) {
  const out = [];
  for (const day of S.days) {
    const first = day.from;
    const pc = S.prevClose[first];
    if (!Number.isFinite(pc) || pc <= 0) continue;
    const gap = (S.o[first] - pc) / pc;
    const i = first + p.wait;
    if (i >= S.n || S.dayIdx[i] !== S.dayIdx[first]) continue;
    if (i < 210) continue;
    if (p.side !== 'short' && gap >= p.gap && S.c[i] > S.o[first]) out.push({ i, side: 'long', ref: S.o[first] });
    if (p.side !== 'long' && gap <= -p.gap && S.c[i] < S.o[first]) out.push({ i, side: 'short', ref: S.o[first] });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 12. Sweep of a session extreme followed by a VWAP reclaim — two
 *     independent confirmations stacked.
 * ------------------------------------------------------------------ */
function sweepVwap(S, p) {
  const out = [];
  const sw = swingOf(S, p.swing);
  for (let i = 210; i < S.n; i++) {
    if (!baseGuard(S, i, 210)) continue;
    const w = S.vwap[i];
    if (!Number.isFinite(w)) continue;
    const lo = sw.swingLow[i - 1];
    const hi = sw.swingHigh[i - 1];
    let sweptLow = false;
    let sweptHigh = false;
    for (let k = Math.max(0, i - p.lookback); k <= i; k++) {
      if (S.dayIdx[k] !== S.dayIdx[i]) continue;
      if (Number.isFinite(lo) && S.l[k] < lo) sweptLow = true;
      if (Number.isFinite(hi) && S.h[k] > hi) sweptHigh = true;
    }
    if (p.side !== 'short' && sweptLow && S.c[i - 1] < S.vwap[i - 1] && S.c[i] > w) {
      out.push({ i, side: 'long', ref: lo });
    }
    if (p.side !== 'long' && sweptHigh && S.c[i - 1] > S.vwap[i - 1] && S.c[i] < w) {
      out.push({ i, side: 'short', ref: hi });
    }
  }
  return out;
}

export const FAMILIES = {
  sweep_reclaim: {
    gen: sweepReclaim,
    grid: { swing: [2, 3, 5], reclaim: [0, 0.3, 0.5], side: ['both'] },
  },
  pdhl_sweep: {
    gen: pdhlSweep,
    grid: { reclaim: [0, 0.3, 0.5], side: ['both'] },
  },
  vwap_reclaim: {
    gen: vwapReclaim,
    grid: { side: ['both'] },
  },
  vwap_fade: {
    gen: vwapFade,
    grid: { stretch: [1.5, 2, 3], side: ['both'] },
  },
  ema_pullback: {
    gen: emaPullback,
    grid: { ma: [9, 20, 50], side: ['both'] },
  },
  or_break: {
    gen: orBreak,
    grid: { window: [15, 30, 60], side: ['both'] },
  },
  or_fade: {
    gen: orFade,
    grid: { window: [15, 30, 60], reclaim: [0, 0.3, 0.5], side: ['both'] },
  },
  compression: {
    gen: compression,
    grid: { bars: [4, 6, 10], tight: [0.8, 1.2], side: ['both'] },
  },
  rsi_reversal: {
    gen: rsiReversal,
    grid: { low: [25, 30, 35], high: [65, 70, 75], side: ['both'] },
  },
  structure_break: {
    gen: structureBreak,
    grid: { swing: [2, 3, 5], side: ['both'] },
  },
  gap_go: {
    gen: gapGo,
    grid: { gap: [0.005, 0.01, 0.02], wait: [1, 3, 6], side: ['both'] },
  },
  sweep_vwap: {
    gen: sweepVwap,
    grid: { swing: [2, 3, 5], lookback: [3, 6, 12], side: ['both'] },
  },
};

/** Cartesian product of a parameter grid. */
export function expandGrid(grid) {
  let combos = [{}];
  for (const [key, values] of Object.entries(grid)) {
    const next = [];
    for (const base of combos) for (const v of values) next.push({ ...base, [key]: v });
    combos = next;
  }
  return combos;
}
