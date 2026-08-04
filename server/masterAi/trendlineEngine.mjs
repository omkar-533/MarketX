/**
 * Desk trendline rules (ChartSchool / classic TA):
 * 1) Identify trend first — HH+HL = up, LH+LL = down, else range (no force).
 * 2) Uptrend line = connect rising swing LOWS (dynamic support), extend right.
 * 3) Downtrend line = connect falling swing HIGHS (dynamic resistance), extend right.
 * 4) Need ≥2 points to draw; prefer pairs with spacing + extra touches.
 * 5) Never mix highs with lows. Don't force a line in a flat range.
 */

function pivotHigh(bars, i, left = 3, right = 3) {
  const h = bars[i].high;
  for (let j = i - left; j <= i + right; j += 1) {
    if (j === i) continue;
    if (j < 0 || j >= bars.length || bars[j].high > h) return false;
  }
  return true;
}

function pivotLow(bars, i, left = 3, right = 3) {
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
  for (let i = 3; i < bars.length - 3; i += 1) {
    const barsAgo = bars.length - 1 - i;
    if (pivotHigh(bars, i)) {
      highs.push({ price: bars[i].high, index: i, barsAgo });
    } else if (pivotLow(bars, i)) {
      lows.push({ price: bars[i].low, index: i, barsAgo });
    }
  }
  return { highs, lows };
}

function classifyBias(highs, lows) {
  let hh = 0;
  let hl = 0;
  let lh = 0;
  let ll = 0;
  for (let i = 1; i < highs.length; i += 1) {
    if (highs[i].price > highs[i - 1].price) hh += 1;
    else lh += 1;
  }
  for (let i = 1; i < lows.length; i += 1) {
    if (lows[i].price > lows[i - 1].price) hl += 1;
    else ll += 1;
  }
  const bull = hh + hl;
  const bear = lh + ll;
  if (bull >= bear + 1) return 'up';
  if (bear >= bull + 1) return 'down';
  return 'range';
}

/** Price on the line at a given barsAgo (linear in bar index). */
function priceAtBarsAgo(a, b, barsAgo) {
  const x1 = -a.barsAgo;
  const x2 = -b.barsAgo;
  if (x2 === x1) return a.price;
  const t = (barsAgo * -1 - x1) / (x2 - x1);
  return a.price + (b.price - a.price) * t;
}

function scorePair(points, a, b, rising) {
  const span = a.barsAgo - b.barsAgo;
  if (span < 6) return -1; // too tight — not structural
  if (span > 160) return -1;

  if (rising) {
    if (!(b.price > a.price)) return -1;
  } else if (!(b.price < a.price)) {
    return -1;
  }

  const mid = (a.price + b.price) / 2 || 1;
  const slopePerBar = Math.abs(b.price - a.price) / span / mid;
  // Reject near-vertical noise (unsustainable "45°+" style on intraday).
  if (slopePerBar > 0.012) return -1;

  let touches = 2;
  const tol = mid * 0.0012; // ~0.12%
  for (const p of points) {
    if (p.index === a.index || p.index === b.index) continue;
    // Only count points between / near the segment window.
    if (p.barsAgo > a.barsAgo + 2 || p.barsAgo < b.barsAgo - 2) continue;
    const expected = priceAtBarsAgo(a, b, p.barsAgo);
    if (Math.abs(p.price - expected) <= tol) touches += 1;
  }

  // Prefer more touches, decent spacing, more recent second point.
  return touches * 12 + Math.min(span, 80) * 0.15 + (40 - Math.min(b.barsAgo, 40)) * 0.2;
}

function bestPair(points, rising) {
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      // points should be older → newer by barsAgo descending
      const older = a.barsAgo >= b.barsAgo ? a : b;
      const newer = a.barsAgo >= b.barsAgo ? b : a;
      const score = scorePair(points, older, newer, rising);
      if (score > bestScore) {
        bestScore = score;
        best = { a: older, b: newer, score, touches: Math.round(score / 12) };
      }
    }
  }
  return best;
}

/**
 * @param {Array<{ high: number, low: number, close?: number }>} bars
 * @returns {null | {
 *   p1: number, p2: number, x1: number, x2: number,
 *   label: string, tone: string, bias: string, touches: number
 * }}
 */
export function buildTrendlineFromBars(bars) {
  if (!Array.isArray(bars) || bars.length < 30) return null;
  const recent = bars.slice(-220);
  const { highs, lows } = collectSwings(recent);
  if (highs.length < 2 && lows.length < 2) return null;

  const bias = classifyBias(highs, lows);

  let pick = null;
  let label = 'Trendline';
  let tone = 'neutral';

  if (bias === 'up') {
    pick = bestPair(lows, true);
    label = 'Rising trendline';
    tone = 'bull';
    // Fallback: still try rising lows even if bias soft.
    if (!pick) pick = bestPair(lows, true);
  } else if (bias === 'down') {
    pick = bestPair(highs, false);
    label = 'Falling trendline';
    tone = 'bear';
    if (!pick) pick = bestPair(highs, false);
  } else {
    // Range / unclear — pick the stronger of the two valid candidates, don't force.
    const up = bestPair(lows, true);
    const down = bestPair(highs, false);
    if (up && (!down || up.score >= down.score)) {
      pick = up;
      label = 'Rising trendline';
      tone = 'bull';
    } else if (down) {
      pick = down;
      label = 'Falling trendline';
      tone = 'bear';
    }
  }

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
    bias,
    touches: pick.touches || 2,
  };
}
