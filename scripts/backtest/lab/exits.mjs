/**
 * Entry filters and the exit simulator.
 *
 * The stop follows the rule you set: only a candle that CLOSES beyond the level
 * takes the trade out, and the fill is that candle's close, so a loss is free to
 * run past 1R. Because a close is the last print of its bar, a target touched in
 * the same bar necessarily happened first and wins — no coin flip is needed.
 *
 * One walk answers every target at once. The stop path (including breakeven and
 * trailing) is the same whatever target is attached, so the only thing that
 * differs per target is which take-profit level gets touched first. Doing this
 * once instead of once per target is what makes a search this wide affordable.
 */

const SQUARE_OFF = 15 * 60 + 15;
const LAST_ENTRY = 14 * 60 + 45;

export const FILTERS = {
  none: () => true,
  with_vwap: (S, i, side) => (side === 'long' ? S.c[i] > S.vwap[i] : S.c[i] < S.vwap[i]),
  against_vwap: (S, i, side) => (side === 'long' ? S.c[i] < S.vwap[i] : S.c[i] > S.vwap[i]),
  with_ema200: (S, i, side) => (side === 'long' ? S.c[i] > S.ema200[i] : S.c[i] < S.ema200[i]),
  rvol_12: (S, i) => S.rvol[i] >= 1.2,
  rvol_15: (S, i) => S.rvol[i] >= 1.5,
  atr_wide: (S, i) => S.atr14[i] / S.c[i] >= 0.004,
  morning: (S, i) => S.minutes[i] < 11 * 60,
  midday: (S, i) => S.minutes[i] >= 11 * 60 && S.minutes[i] < 13 * 60 + 30,
  afternoon: (S, i) => S.minutes[i] >= 13 * 60 + 30,
  after_first_hour: (S, i) => S.minutes[i] >= 10 * 60 + 15,
  longs_only: (S, i, side) => side === 'long',
  shorts_only: (S, i, side) => side === 'short',
  // Trade with the index, not into it.
  market_with: (S, i, side) => (side === 'long' ? S.mktUp[i] > 0 : S.mktUp[i] < 0),
  market_not_against: (S, i, side) => (side === 'long' ? S.mktUp[i] >= 0 : S.mktUp[i] <= 0),
  // Only the names actually outrunning the index today.
  rs_strong: (S, i, side) => (side === 'long' ? S.rs[i] > 0.002 : S.rs[i] < -0.002),
};

function stopLevel(S, i, side, ex) {
  const a = S.atr14[i];
  const long = side === 'long';
  let level;
  switch (ex.stop) {
    case 'bar':
      level = long ? S.l[i] : S.h[i];
      break;
    case 'bar2': {
      const j = Math.max(0, i - 1);
      level = long ? Math.min(S.l[i], S.l[j]) : Math.max(S.h[i], S.h[j]);
      break;
    }
    case 'atr':
      level = long ? S.c[i] - ex.atrMult * a : S.c[i] + ex.atrMult * a;
      break;
    case 'swing': {
      const sw = S.swing3;
      const s = long ? sw.swingLow[i] : sw.swingHigh[i];
      level = Number.isFinite(s) ? s : long ? S.l[i] : S.h[i];
      break;
    }
    default:
      level = long ? S.l[i] : S.h[i];
  }
  if (!Number.isFinite(level)) return NaN;
  const pad = Number.isFinite(a) ? ex.padAtr * a : 0;
  return long ? level - pad : level + pad;
}

/**
 * Walk one trade to the end of the session, recording the outcome for every
 * target in `targets`.
 */
function walkTrade(S, i, side, ex, targets) {
  const long = side === 'long';
  const entry = S.c[i];
  const rawStop = stopLevel(S, i, side, ex);
  if (!Number.isFinite(rawStop)) return null;

  let risk = long ? entry - rawStop : rawStop - entry;
  if (!(risk > 0)) return null;
  // Widening a hair-thin stop keeps the setup but stops percentage costs from
  // eating the whole R.
  risk = Math.max(risk, ex.stopMinPct * entry);
  const riskPct = risk / entry;
  if (riskPct < ex.minRiskPct) return null;
  if (ex.maxRiskPct > 0 && riskPct > ex.maxRiskPct) return null;

  let stop = long ? entry - risk : entry + risk;
  const pending = new Set(targets);
  const byTarget = new Map();
  let best = 0;
  const dayEnd = S.days[S.dayIdx[i]].to;

  // Scaling out is what lets a strategy be right often and still catch a big
  // move: book part of the position at a level price reaches frequently, then
  // ride the rest with nothing left to lose.
  const scaling = ex.partialAt > 0 && ex.partialPct > 0;
  const partialPrice = long ? entry + ex.partialAt * risk : entry - ex.partialAt * risk;
  let partialFilled = false;
  const bookedR = () => (partialFilled ? ex.partialPct * ex.partialAt : 0);
  const runnerSize = () => (partialFilled ? 1 - ex.partialPct : 1);

  for (let k = i + 1; k <= dayEnd && pending.size; k++) {
    const fav = long ? (S.h[k] - entry) / risk : (entry - S.l[k]) / risk;
    if (fav > best) best = fav;

    // The scale-out is a resting order, so an intrabar touch fills it before
    // that same bar's close can do anything.
    if (scaling && !partialFilled && (long ? S.h[k] >= partialPrice : S.l[k] <= partialPrice)) {
      partialFilled = true;
      if (ex.beAfterPartial) stop = long ? Math.max(stop, entry) : Math.min(stop, entry);
    }

    const closedOut = ex.stopTrigger === 'close'
      ? long
        ? S.c[k] <= stop
        : S.c[k] >= stop
      : long
        ? S.l[k] <= stop
        : S.h[k] >= stop;
    const stopR = ex.stopTrigger === 'close'
      ? (long ? S.c[k] - entry : entry - S.c[k]) / risk
      : (long ? stop - entry : entry - stop) / risk;

    for (const target of [...pending]) {
      const tp = long ? entry + target * risk : entry - target * risk;
      const hitTp = long ? S.h[k] >= tp : S.l[k] <= tp;
      if (hitTp) {
        byTarget.set(target, { r: bookedR() + runnerSize() * target, how: 'TARGET', bars: k - i });
        pending.delete(target);
      } else if (closedOut) {
        const how = partialFilled ? 'PARTIAL' : 'STOP';
        byTarget.set(target, { r: bookedR() + runnerSize() * stopR, how, bars: k - i });
        pending.delete(target);
      }
    }
    if (!pending.size) break;

    // The stop only moves after the bar has been judged, never before.
    if (ex.breakeven > 0 && best >= ex.breakeven) {
      stop = long ? Math.max(stop, entry) : Math.min(stop, entry);
    }
    if (ex.trailAtr > 0) {
      const a = S.atr14[k];
      if (Number.isFinite(a)) {
        const trail = long ? S.c[k] - ex.trailAtr * a : S.c[k] + ex.trailAtr * a;
        stop = long ? Math.max(stop, trail) : Math.min(stop, trail);
      }
    }

    if (S.minutes[k] >= SQUARE_OFF) {
      const r = bookedR() + runnerSize() * ((long ? S.c[k] - entry : entry - S.c[k]) / risk);
      for (const target of pending) byTarget.set(target, { r, how: 'TIME', bars: k - i });
      pending.clear();
      break;
    }
  }

  if (pending.size) {
    const r = bookedR() + runnerSize() * ((long ? S.c[dayEnd] - entry : entry - S.c[dayEnd]) / risk);
    for (const target of pending) byTarget.set(target, { r, how: 'TIME', bars: dayEnd - i });
  }

  return { entry, risk, riskPct, mfe: best, byTarget };
}

export const DEFAULT_EXIT = {
  stop: 'bar',
  padAtr: 0.1,
  atrMult: 1,
  stopMinPct: 0,
  minRiskPct: 0.0005,
  maxRiskPct: 0.03,
  stopTrigger: 'close',
  breakeven: 0,
  trailAtr: 0,
  maxPerDay: 2,
  /** Book `partialPct` of the position once price travels `partialAt` R. 0 disables it. */
  partialAt: 0,
  partialPct: 0.5,
  beAfterPartial: true,
};

/**
 * Evaluate every signal on one symbol. Returns raw candidates in time order;
 * overlap is resolved later, per target, because a 1R trade and a 5R trade free
 * the book up at different times.
 */
export function evaluateSymbol(S, signals, ex, filterFns, targets) {
  const out = [];
  for (const sig of signals) {
    const { i, side } = sig;
    if (S.minutes[i] > LAST_ENTRY) continue;
    let pass = true;
    for (const fn of filterFns) {
      if (!fn(S, i, side)) {
        pass = false;
        break;
      }
    }
    if (!pass) continue;
    const walk = walkTrade(S, i, side, ex, targets);
    if (!walk) continue;
    out.push({
      symbol: S.symbol,
      dayIdx: S.dayIdx[i],
      ymd: S.days[S.dayIdx[i]].ymd,
      i,
      minutes: S.minutes[i],
      side,
      ...walk,
    });
  }
  return out;
}

/**
 * Pick the trades actually taken for one target: chronological, never holding
 * two positions in the same symbol, capped per day.
 */
export function sequence(candidates, target, maxPerDay) {
  const trades = [];
  let freeFrom = -1;
  let dayOf = -1;
  let takenToday = 0;
  for (const cand of candidates) {
    if (cand.i <= freeFrom) continue;
    if (cand.dayIdx !== dayOf) {
      dayOf = cand.dayIdx;
      takenToday = 0;
    }
    if (takenToday >= maxPerDay) continue;
    const res = cand.byTarget.get(target);
    if (!res) continue;
    takenToday += 1;
    freeFrom = cand.i + res.bars;
    trades.push({
      symbol: cand.symbol,
      ymd: cand.ymd,
      minutes: cand.minutes,
      side: cand.side,
      entry: cand.entry,
      riskPct: cand.riskPct,
      mfe: cand.mfe,
      r: res.r,
      how: res.how,
      bars: res.bars,
    });
  }
  return trades;
}
