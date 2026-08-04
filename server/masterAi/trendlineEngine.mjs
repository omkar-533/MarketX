/**
 * Classic TradingView Trend Line rules (desk curriculum):
 *
 * UPTREND line  — market making Higher Lows → connect ≥2 rising swing LOWS
 *                 (line drawn from BELOW price). 3rd touch confirms.
 * DOWNTREND line — market making Lower Highs → connect ≥2 falling swing HIGHS
 *                 (line drawn from ABOVE price). 3rd touch confirms.
 *
 * Use wicks consistently. Never force a line. Never horizontal SUPPORT/RESISTANCE.
 * Optional opposite ray only when highs/lows naturally form a channel on the same leg.
 */

function pivotHigh(bars, i, left = 2, right = 2) {
  const h = bars[i].high;
  for (let j = i - left; j <= i + right; j += 1) {
    if (j === i) continue;
    if (j < 0 || j >= bars.length || bars[j].high > h) return false;
  }
  return true;
}

function pivotLow(bars, i, left = 2, right = 2) {
  const l = bars[i].low;
  for (let j = i - left; j <= i + right; j += 1) {
    if (j === i) continue;
    if (j < 0 || j >= bars.length || bars[j].low < l) return false;
  }
  return true;
}

function collectSwings(bars) {
  const highs = [];
  const lows = [];
  for (let i = 2; i < bars.length - 2; i += 1) {
    const barsAgo = bars.length - 1 - i;
    if (pivotHigh(bars, i)) highs.push({ price: bars[i].high, index: i, barsAgo });
    else if (pivotLow(bars, i)) lows.push({ price: bars[i].low, index: i, barsAgo });
  }
  return { highs, lows };
}

/** Strict structure bias from swing sequence. */
function classifyBias(highs, lows) {
  let hl = 0;
  let ll = 0;
  let hh = 0;
  let lh = 0;
  for (let i = 1; i < lows.length; i += 1) {
    if (lows[i].price > lows[i - 1].price) hl += 1;
    else ll += 1;
  }
  for (let i = 1; i < highs.length; i += 1) {
    if (highs[i].price > highs[i - 1].price) hh += 1;
    else lh += 1;
  }
  // Uptrend needs higher lows; downtrend needs lower highs.
  if (hl >= 2 && hl >= ll) return 'up';
  if (lh >= 2 && lh >= hh) return 'down';
  if (hl > ll && hh >= lh) return 'up';
  if (lh > hh && ll >= hl) return 'down';
  return 'range';
}

function priceAtBarsAgo(a, b, barsAgo) {
  const x1 = -a.barsAgo;
  const x2 = -b.barsAgo;
  if (x2 === x1) return a.price;
  const t = (-barsAgo - x1) / (x2 - x1);
  return a.price + (b.price - a.price) * t;
}

function proximityBonus(a, b, lastClose, role) {
  if (!(lastClose > 0)) return 0;
  const atNow = priceAtBarsAgo(a, b, 0);
  if (!(atNow > 0)) return 0;
  const dist = (lastClose - atNow) / lastClose;

  if (role === 'lower') {
    if (dist < -0.0025) return -90; // price broke below — don't keep dead line
    if (dist > 0.03) return -35; // left far below
    return 40 - Math.abs(dist) * 1000; // respect / hug
  }
  if (dist > 0.0025) return -90;
  if (dist < -0.03) return -35;
  return 40 - Math.abs(dist) * 1000;
}

/**
 * Score a candidate trendline through two wick pivots.
 * rising=true → Higher Lows (uptrend). rising=false → Lower Highs (downtrend).
 */
function scorePair(points, a, b, rising, lastClose, role) {
  const span = a.barsAgo - b.barsAgo;
  if (span < 5) return -1;
  if (span > 85) return -1;

  // Rule: uptrend lows must rise; downtrend highs must fall. No force.
  if (rising) {
    if (!(b.price > a.price * 1.0001)) return -1;
  } else if (!(b.price < a.price * 0.9999)) {
    return -1;
  }

  const mid = (a.price + b.price) / 2 || 1;
  const slopePerBar = Math.abs(b.price - a.price) / span / mid;
  if (slopePerBar > 0.0075) return -1; // too steep = forced
  if (slopePerBar < 0.00004) return -1;

  // Count wick touches (3rd touch confirms — Rule 2).
  let touches = 2;
  const tol = mid * 0.0014;
  for (const p of points) {
    if (p.index === a.index || p.index === b.index) continue;
    if (p.barsAgo > a.barsAgo + 2 || p.barsAgo < Math.max(0, b.barsAgo - 2)) continue;
    const expected = priceAtBarsAgo(a, b, p.barsAgo);
    if (Math.abs(p.price - expected) <= tol) touches += 1;
  }

  const confirmBonus = touches >= 3 ? 28 : 0; // 3rd touch confirmation
  const recency = (50 - Math.min(b.barsAgo, 50)) * 0.5;
  const prox = proximityBonus(a, b, lastClose, role);
  return touches * 16 + confirmBonus + Math.min(span, 45) * 0.25 + recency + prox;
}

function bestPair(points, rising, lastClose, role) {
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const older = points[i].barsAgo >= points[j].barsAgo ? points[i] : points[j];
      const newer = points[i].barsAgo >= points[j].barsAgo ? points[j] : points[i];
      const score = scorePair(points, older, newer, rising, lastClose, role);
      if (score > bestScore) {
        bestScore = score;
        best = { a: older, b: newer, score, touches: Math.max(2, Math.round((score - 28) / 16)) };
      }
    }
  }
  // Don't ship a weak / forced line (Rule 4).
  return bestScore >= 8 ? best : null;
}

function toRay(pick, label, tone) {
  if (!pick) return null;
  const p1 = Math.round(pick.a.price * 100) / 100;
  const p2 = Math.round(pick.b.price * 100) / 100;
  if (!(p1 > 0) || !(p2 > 0) || p1 === p2) return null;
  return {
    p1,
    p2,
    x1: -Math.abs(pick.a.barsAgo),
    x2: -Math.abs(pick.b.barsAgo),
    label,
    tone,
    touches: pick.touches || 2,
    score: pick.score || 0,
  };
}

function projectNow(ray) {
  if (!ray) return null;
  return priceAtBarsAgo(
    { barsAgo: Math.abs(ray.x1), price: ray.p1 },
    { barsAgo: Math.abs(ray.x2), price: ray.p2 },
    0,
  );
}

function isPrimaryAlive(ray, lastClose, role) {
  const at = projectNow(ray);
  if (!(at > 0) || !(lastClose > 0)) return false;
  const dist = (lastClose - at) / lastClose;
  if (role === 'lower') return dist >= -0.004 && dist <= 0.032;
  return dist <= 0.004 && dist >= -0.032;
}

function buildInWindow(windowBars) {
  const lastClose = Number(windowBars[windowBars.length - 1]?.close) || 0;
  const { highs, lows } = collectSwings(windowBars);
  const bias = classifyBias(highs, lows);

  let primary = null;
  let secondary = null;
  let rising = bias === 'up';

  if (bias === 'up') {
    // Rule: Uptrend line under Higher Lows.
    const pick = bestPair(lows, true, lastClose, 'lower');
    primary = toRay(pick, 'Uptrend line', 'bull');
    rising = true;
    // Optional channel top — only natural rising highs on same leg (don't force).
    const hiPick = bestPair(highs, true, lastClose, 'upper');
    secondary = toRay(hiPick, 'Channel high', 'bear');
  } else if (bias === 'down') {
    // Rule: Downtrend line over Lower Highs.
    const pick = bestPair(highs, false, lastClose, 'upper');
    primary = toRay(pick, 'Downtrend line', 'bear');
    rising = false;
    const loPick = bestPair(lows, false, lastClose, 'lower');
    secondary = toRay(loPick, 'Channel low', 'bull');
  } else {
    // Range — try whichever natural line exists; never invent.
    const upPick = bestPair(lows, true, lastClose, 'lower');
    const dnPick = bestPair(highs, false, lastClose, 'upper');
    if (upPick && (!dnPick || upPick.score >= dnPick.score)) {
      primary = toRay(upPick, 'Uptrend line', 'bull');
      rising = true;
      secondary = toRay(bestPair(highs, true, lastClose, 'upper'), 'Channel high', 'bear');
    } else if (dnPick) {
      primary = toRay(dnPick, 'Downtrend line', 'bear');
      rising = false;
      secondary = toRay(bestPair(lows, false, lastClose, 'lower'), 'Channel low', 'bull');
    }
  }

  if (primary && !isPrimaryAlive(primary, lastClose, rising ? 'lower' : 'upper')) {
    // Broken primary → reject this window (try tighter/fresh window).
    return null;
  }

  if (!primary && !secondary) return null;

  // Map to lower/upper for existing synthesizer.
  const lower = rising ? primary : secondary;
  const upper = rising ? secondary : primary;

  return {
    bias,
    rising,
    primary,
    lower: lower || null,
    upper: upper || null,
    quality: primary ? isPrimaryAlive(primary, lastClose, rising ? 'lower' : 'upper') : false,
  };
}

/**
 * @returns {null | { bias: string, lower: object|null, upper: object|null, rising: boolean, primary: object|null }}
 */
export function buildTrendChannelFromBars(bars) {
  if (!Array.isArray(bars) || bars.length < 25) return null;

  // Tight → wider active legs (visible structure first).
  for (const n of [60, 80, 110, 150]) {
    const slice = bars.slice(-Math.min(n, bars.length));
    const built = buildInWindow(slice);
    if (built?.primary && built.quality) {
      return {
        bias: built.bias,
        lower: built.lower,
        upper: built.upper,
        rising: built.rising,
        primary: built.primary,
      };
    }
  }

  // Fresh leg after breakout.
  const fresh = buildInWindow(bars.slice(-45));
  if (fresh?.primary) {
    return {
      bias: fresh.bias,
      lower: fresh.lower,
      upper: fresh.upper,
      rising: fresh.rising,
      primary: fresh.primary,
    };
  }

  return null;
}

export function buildTrendlineFromBars(bars) {
  const ch = buildTrendChannelFromBars(bars);
  if (!ch?.primary) return null;
  return {
    ...ch.primary,
    bias: ch.bias,
    label: ch.rising ? 'Uptrend line' : 'Downtrend line',
    tone: ch.rising ? 'bull' : 'bear',
  };
}
