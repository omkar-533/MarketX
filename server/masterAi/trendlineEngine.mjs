/**
 * TradingView-style trend CHANNEL on the *active* swing structure:
 * - Prefer the recent visible leg (not ancient broken channels)
 * - Lower ray hugs rising/falling swing lows near price
 * - Upper ray hugs swing highs of the SAME window (real highs, not a parallel copy)
 * - If price has broken the channel, rebuild on the newest leg
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

function classifyBias(highs, lows) {
  let up = 0;
  let down = 0;
  for (let i = 1; i < highs.length; i += 1) {
    if (highs[i].price > highs[i - 1].price) up += 1;
    else down += 1;
  }
  for (let i = 1; i < lows.length; i += 1) {
    if (lows[i].price > lows[i - 1].price) up += 1;
    else down += 1;
  }
  if (up >= down + 1) return 'up';
  if (down >= up + 1) return 'down';
  return 'range';
}

function priceAtBarsAgo(a, b, barsAgo) {
  const x1 = -a.barsAgo;
  const x2 = -b.barsAgo;
  if (x2 === x1) return a.price;
  const t = (-barsAgo - x1) / (x2 - x1);
  return a.price + (b.price - a.price) * t;
}

/** How tightly the line still frames live price (gold-TV "in play" look). */
function proximityBonus(a, b, lastClose, role) {
  if (!(lastClose > 0)) return 0;
  const atNow = priceAtBarsAgo(a, b, 0);
  if (!(atNow > 0)) return 0;
  const dist = (lastClose - atNow) / lastClose; // + means price above the line

  if (role === 'lower') {
    // Want price ABOVE support, not miles above, not clearly broken below.
    if (dist < -0.003) return -80; // broken
    if (dist > 0.035) return -40; // stale / left behind
    return 35 - Math.abs(dist) * 900;
  }
  // upper
  if (dist > 0.003) return -80; // broken above
  if (dist < -0.035) return -40; // stale overhead
  return 35 - Math.abs(dist) * 900;
}

function scorePair(points, a, b, rising, lastClose, role) {
  const span = a.barsAgo - b.barsAgo;
  if (span < 5) return -1;
  if (span > 90) return -1; // keep on the visible leg

  if (rising) {
    if (!(b.price > a.price * 1.00008)) return -1;
  } else if (!(b.price < a.price * 0.99992)) {
    return -1;
  }

  const mid = (a.price + b.price) / 2 || 1;
  const slopePerBar = Math.abs(b.price - a.price) / span / mid;
  // Gentle TV-style slope — reject near-vertical spikes.
  if (slopePerBar > 0.008) return -1;
  if (slopePerBar < 0.00005) return -1;

  let touches = 2;
  const tol = mid * 0.0015;
  for (const p of points) {
    if (p.index === a.index || p.index === b.index) continue;
    if (p.barsAgo > a.barsAgo + 2 || p.barsAgo < Math.max(0, b.barsAgo - 2)) continue;
    const expected = priceAtBarsAgo(a, b, p.barsAgo);
    if (Math.abs(p.price - expected) <= tol) touches += 1;
  }

  // Prefer recent anchors + lines still hugging LTP.
  const recency = (55 - Math.min(b.barsAgo, 55)) * 0.45;
  const prox = proximityBonus(a, b, lastClose, role);
  return touches * 14 + Math.min(span, 50) * 0.2 + recency + prox;
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
        best = { a: older, b: newer, score, touches: Math.max(2, Math.round(score / 14)) };
      }
    }
  }
  return bestScore > 0 ? best : null;
}

function anyRecentPair(points, rising, maxAgo = 70) {
  const pts = points.filter((p) => p.barsAgo <= maxAgo).sort((a, b) => b.barsAgo - a.barsAgo);
  if (pts.length < 2) return null;
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const a = pts[i];
      const b = pts[j];
      if (a.barsAgo - b.barsAgo < 5) continue;
      if (rising && b.price > a.price) return { a, b, score: 2, touches: 2 };
      if (!rising && b.price < a.price) return { a, b, score: 2, touches: 2 };
    }
  }
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

function channelQuality(lower, upper, lastClose) {
  if (!(lastClose > 0)) return false;
  const lo = projectNow(lower);
  const hi = projectNow(upper);

  // At least one line should still be near the tape.
  const near = (px) => px > 0 && Math.abs(lastClose - px) / lastClose <= 0.028;
  if (near(lo) || near(hi)) return true;
  // Or price still inside the channel band.
  if (lo && hi && lastClose >= lo * 0.997 && lastClose <= hi * 1.003) return true;
  return false;
}

function buildInWindow(windowBars, rising) {
  const lastClose = Number(windowBars[windowBars.length - 1]?.close) || 0;
  const { highs, lows } = collectSwings(windowBars);
  if (highs.length < 2 && lows.length < 2) return null;

  const bias = classifyBias(highs, lows);
  const useRising = rising ?? bias !== 'down';

  const lowerPick =
    bestPair(lows, useRising, lastClose, 'lower') ||
    anyRecentPair(lows, useRising) ||
    bestPair(lows, !useRising, lastClose, 'lower');
  const upperPick =
    bestPair(highs, useRising, lastClose, 'upper') ||
    anyRecentPair(highs, useRising) ||
    bestPair(highs, !useRising, lastClose, 'upper');

  // Keep both legs on a similar time window (same impulse / channel).
  let lower = toRay(lowerPick, 'Lower trendline', 'bull');
  let upper = toRay(upperPick, 'Upper trendline', 'bear');

  if (lower && upper) {
    const lowerMid = (Math.abs(lower.x1) + Math.abs(lower.x2)) / 2;
    const upperMid = (Math.abs(upper.x1) + Math.abs(upper.x2)) / 2;
    if (Math.abs(lowerMid - upperMid) > 55) {
      // Re-pick upper among highs that overlap the lower span.
      const loSpan = Math.max(Math.abs(lower.x1), Math.abs(lower.x2)) + 8;
      const hiSpan = Math.min(Math.abs(lower.x1), Math.abs(lower.x2)) - 2;
      const focused = highs.filter((h) => h.barsAgo <= loSpan && h.barsAgo >= Math.max(0, hiSpan));
      const alt =
        bestPair(focused, useRising, lastClose, 'upper') || anyRecentPair(focused, useRising, loSpan);
      const altRay = toRay(alt, 'Upper trendline', 'bear');
      if (altRay) upper = altRay;
    }
  }

  // Always try to show BOTH sides when one leg already framed.
  if (lower && !upper) {
    upper = toRay(
      anyRecentPair(highs, useRising, 85) || anyRecentPair(highs, !useRising, 85),
      'Upper trendline',
      'bear',
    );
  }
  if (upper && !lower) {
    lower = toRay(
      anyRecentPair(lows, useRising, 85) || anyRecentPair(lows, !useRising, 85),
      'Lower trendline',
      'bull',
    );
  }

  if (!lower && !upper) return null;
  return {
    bias,
    lower,
    upper,
    rising: useRising,
    lastClose,
    quality: channelQuality(lower, upper, lastClose),
  };
}

/**
 * @returns {null | { bias: string, lower: object|null, upper: object|null, rising: boolean }}
 */
export function buildTrendChannelFromBars(bars) {
  if (!Array.isArray(bars) || bars.length < 25) return null;
  const lastClose = Number(bars[bars.length - 1]?.close) || 0;

  // Tight → wider: prefer the active leg that still frames LTP (gold-TV feel).
  const windows = [55, 75, 100, 140];
  let fallback = null;

  for (const n of windows) {
    const slice = bars.slice(-Math.min(n, bars.length));
    // Try both slope directions; keep the one that hugs price.
    const up = buildInWindow(slice, true);
    const down = buildInWindow(slice, false);
    const candidates = [up, down].filter(Boolean);
    candidates.sort((a, b) => Number(b.quality) - Number(a.quality) || (b.lower?.score || 0) + (b.upper?.score || 0) - ((a.lower?.score || 0) + (a.upper?.score || 0)));
    const best = candidates[0];
    if (!best) continue;
    if (!fallback) fallback = best;
    if (best.quality) {
      return { bias: best.bias, lower: best.lower, upper: best.upper, rising: best.rising };
    }
  }

  // Broken / extended market: force the newest 50-bar leg only.
  const fresh = buildInWindow(bars.slice(-50), true) || buildInWindow(bars.slice(-50), false);
  if (fresh) {
    return { bias: fresh.bias, lower: fresh.lower, upper: fresh.upper, rising: fresh.rising };
  }

  if (!fallback) return null;
  return {
    bias: fallback.bias,
    lower: fallback.lower,
    upper: fallback.upper,
    rising: fallback.rising,
  };
}

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
