/**
 * Desk trend CHANNEL (both sides) — like the TradingView gold reference:
 * - Lower diagonal: rising/falling swing LOWS (dynamic support)
 * - Upper diagonal: rising/falling swing HIGHS (dynamic resistance)
 * Extend both as rays to the right. Never horizontal SUPPORT/RESISTANCE lines.
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

function priceAtBarsAgo(a, b, barsAgo) {
  const x1 = -a.barsAgo;
  const x2 = -b.barsAgo;
  if (x2 === x1) return a.price;
  const t = (barsAgo * -1 - x1) / (x2 - x1);
  return a.price + (b.price - a.price) * t;
}

function scorePair(points, a, b, rising) {
  const span = a.barsAgo - b.barsAgo;
  if (span < 4) return -1;
  if (span > 180) return -1;

  if (rising) {
    if (!(b.price > a.price * 1.00005)) return -1;
  } else if (!(b.price < a.price * 0.99995)) {
    return -1;
  }

  const mid = (a.price + b.price) / 2 || 1;
  const slopePerBar = Math.abs(b.price - a.price) / span / mid;
  if (slopePerBar > 0.02) return -1;

  let touches = 2;
  const tol = mid * 0.0018;
  for (const p of points) {
    if (p.index === a.index || p.index === b.index) continue;
    if (p.barsAgo > a.barsAgo + 3 || p.barsAgo < Math.max(0, b.barsAgo - 3)) continue;
    const expected = priceAtBarsAgo(a, b, p.barsAgo);
    if (Math.abs(p.price - expected) <= tol) touches += 1;
  }

  return touches * 12 + Math.min(span, 80) * 0.15 + (50 - Math.min(b.barsAgo, 50)) * 0.25;
}

function bestPair(points, rising) {
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const older = points[i].barsAgo >= points[j].barsAgo ? points[i] : points[j];
      const newer = points[i].barsAgo >= points[j].barsAgo ? points[j] : points[i];
      const score = scorePair(points, older, newer, rising);
      if (score > bestScore) {
        bestScore = score;
        best = { a: older, b: newer, score, touches: Math.max(2, Math.round(score / 12)) };
      }
    }
  }
  return best;
}

/** Last-resort: two spaced points from the list with correct slope. */
function anySlopedPair(points, rising) {
  if (points.length < 2) return null;
  const ordered = points.slice().sort((a, b) => b.barsAgo - a.barsAgo);
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i];
      const b = ordered[j];
      if (a.barsAgo - b.barsAgo < 3) continue;
      if (rising && b.price > a.price) return { a, b, score: 1, touches: 2 };
      if (!rising && b.price < a.price) return { a, b, score: 1, touches: 2 };
    }
  }
  // Absolute fallback: oldest + newest with forced labels even if flat-ish
  const a = ordered[0];
  const b = ordered[ordered.length - 1];
  if (!a || !b || a === b) return null;
  if (rising && b.price >= a.price) return { a, b, score: 0.5, touches: 2 };
  if (!rising && b.price <= a.price) return { a, b, score: 0.5, touches: 2 };
  return null;
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
  };
}

/**
 * Both-side channel rays (lower + upper), matching the user's gold TV reference.
 * @returns {null | { bias: string, lower: object|null, upper: object|null }}
 */
export function buildTrendChannelFromBars(bars) {
  if (!Array.isArray(bars) || bars.length < 25) return null;
  const recent = bars.slice(-220);
  const { highs, lows } = collectSwings(recent);
  if (highs.length < 2 && lows.length < 2) return null;

  const bias = classifyBias(highs, lows);
  const rising = bias !== 'down';

  let lowerPick =
    bestPair(lows, rising) || anySlopedPair(lows, rising) || bestPair(lows, !rising) || anySlopedPair(lows, !rising);
  let upperPick =
    bestPair(highs, rising) ||
    anySlopedPair(highs, rising) ||
    bestPair(highs, !rising) ||
    anySlopedPair(highs, !rising);

  const lower = toRay(
    lowerPick,
    rising ? 'Lower trendline' : 'Lower trendline',
    'bull',
  );
  const upper = toRay(
    upperPick,
    rising ? 'Upper trendline' : 'Upper trendline',
    'bear',
  );

  if (!lower && !upper) return null;
  return { bias, lower, upper, rising };
}

/** Single primary line (compat) — prefers lower in uptrend, upper in downtrend. */
export function buildTrendlineFromBars(bars) {
  const ch = buildTrendChannelFromBars(bars);
  if (!ch) return null;
  const primary = ch.rising ? ch.lower || ch.upper : ch.upper || ch.lower;
  if (!primary) return null;
  return {
    ...primary,
    bias: ch.bias,
    label: ch.rising ? 'Rising trendline' : 'Falling trendline',
    tone: ch.rising ? 'bull' : 'bear',
  };
}
