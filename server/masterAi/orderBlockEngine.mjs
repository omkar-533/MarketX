/**
 * Institutional-grade Order Block engine.
 *
 * Rules (strict):
 * - No BOS/CHoCH confirmation → no Order Block
 * - Not “last opposite candle before any move”
 * - Displacement must show institutional strength
 * - Liquidity sweep + FVG raise confidence; they do not create OBs alone
 * - FVG is confirmation only — never mark every FVG as an OB
 */

import { fetchOhlc } from '../market/provider.mjs';

export const ZONE_MODE = Object.freeze({
  BODY: 'body',
  FULL: 'full',
  HYBRID: 'hybrid',
});

const TF_PRIORITY = Object.freeze({
  '1m': 1,
  '5m': 2,
  '15m': 3,
  '30m': 4,
  '1h': 5,
  '4h': 7,
  '1d': 9,
  '1w': 11,
  '1M': 13,
  '1mo': 13,
});

const SCORE_WEIGHTS = Object.freeze({
  bos: 25,
  liquiditySweep: 20,
  displacement: 20,
  fvg: 15,
  volume: 10,
  htfAlign: 10,
});

function barsAgoOf(bars, index) {
  return bars.length - 1 - index;
}

function bodyOf(b) {
  return Math.abs(Number(b.close) - Number(b.open));
}

function rangeOf(b) {
  return Math.max(1e-9, Number(b.high) - Number(b.low));
}

function isBull(b) {
  return Number(b.close) > Number(b.open);
}

function isBear(b) {
  return Number(b.close) < Number(b.open);
}

function atrLike(bars, endIndex, len = 14) {
  if (endIndex < len) return rangeOf(bars[endIndex]);
  let sum = 0;
  for (let i = endIndex - len + 1; i <= endIndex; i += 1) {
    const prev = bars[i - 1]?.close ?? bars[i].open;
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prev),
      Math.abs(bars[i].low - prev),
    );
    sum += tr;
  }
  return sum / len || rangeOf(bars[endIndex]);
}

function avgBody(bars, endIndex, len = 20) {
  const start = Math.max(0, endIndex - len + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= endIndex; i += 1) {
    sum += bodyOf(bars[i]);
    n += 1;
  }
  return n ? sum / n : bodyOf(bars[endIndex]);
}

function avgVolume(bars, endIndex, len = 20) {
  const start = Math.max(0, endIndex - len + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= endIndex; i += 1) {
    const v = Number(bars[i].volume) || 0;
    if (v > 0) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

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

/** Confirmed swing highs/lows with HH/HL/LH/LL labels. */
export function detectSwings(bars, left = 3, right = 3) {
  const swings = [];
  for (let i = left; i < bars.length - right; i += 1) {
    if (pivotHigh(bars, i, left, right)) {
      swings.push({
        kind: 'high',
        price: bars[i].high,
        index: i,
        barsAgo: barsAgoOf(bars, i),
      });
    } else if (pivotLow(bars, i, left, right)) {
      swings.push({
        kind: 'low',
        price: bars[i].low,
        index: i,
        barsAgo: barsAgoOf(bars, i),
      });
    }
  }
  let lastHigh = null;
  let lastLow = null;
  for (const s of swings) {
    if (s.kind === 'high') {
      s.label = lastHigh == null ? 'SH' : s.price > lastHigh.price ? 'HH' : 'LH';
      lastHigh = s;
    } else {
      s.label = lastLow == null ? 'SL' : s.price < lastLow.price ? 'LL' : 'HL';
      lastLow = s;
    }
  }
  return swings;
}

/**
 * Structure bias from swings up to (exclusive) index.
 * @returns {'bull'|'bear'|'neutral'}
 */
function biasBefore(swings, index) {
  const recent = swings.filter((s) => s.index < index).slice(-6);
  if (recent.length < 2) return 'neutral';
  const bull = recent.filter((s) => s.label === 'HH' || s.label === 'HL').length;
  const bear = recent.filter((s) => s.label === 'LH' || s.label === 'LL').length;
  if (bull > bear + 0) return 'bull';
  if (bear > bull + 0) return 'bear';
  return 'neutral';
}

/**
 * Confirmed BOS / CHoCH — close beyond a prior swing.
 * First close beyond each swing counts once.
 */
export function detectBosChoCh(bars, swings) {
  const events = [];
  const highs = swings.filter((s) => s.kind === 'high');
  const lows = swings.filter((s) => s.kind === 'low');
  const brokenHigh = new Set();
  const brokenLow = new Set();

  for (let i = 1; i < bars.length; i += 1) {
    const close = bars[i].close;
    for (const sh of highs) {
      if (sh.index >= i || brokenHigh.has(sh.index)) continue;
      if (close > sh.price) {
        brokenHigh.add(sh.index);
        const bias = biasBefore(swings, i);
        events.push({
          side: 'bull',
          type: bias === 'bear' ? 'choch' : 'bos',
          breakIndex: i,
          brokenSwing: sh,
          price: sh.price,
          barsAgo: barsAgoOf(bars, i),
        });
        break;
      }
    }
    for (const sl of lows) {
      if (sl.index >= i || brokenLow.has(sl.index)) continue;
      if (close < sl.price) {
        brokenLow.add(sl.index);
        const bias = biasBefore(swings, i);
        events.push({
          side: 'bear',
          type: bias === 'bull' ? 'choch' : 'bos',
          breakIndex: i,
          brokenSwing: sl,
          price: sl.price,
          barsAgo: barsAgoOf(bars, i),
        });
        break;
      }
    }
  }
  return events;
}

/** Classic 3-candle FVG. Confirmation only — never an OB by itself. */
export function detectFvgs(bars, from = 2, to = bars.length - 1) {
  const gaps = [];
  const start = Math.max(2, from);
  const end = Math.min(bars.length - 1, to);
  for (let i = start; i <= end; i += 1) {
    const a = bars[i - 2];
    const c = bars[i];
    if (a.high < c.low) {
      gaps.push({
        side: 'bull',
        top: c.low,
        bottom: a.high,
        index: i,
        barsAgo: barsAgoOf(bars, i),
      });
    } else if (a.low > c.high) {
      gaps.push({
        side: 'bear',
        top: a.low,
        bottom: c.high,
        index: i,
        barsAgo: barsAgoOf(bars, i),
      });
    }
  }
  return gaps;
}

/**
 * Meaningful OB candle — reject dojis, tiny bodies, low-volume, passive insides.
 */
export function isValidObCandle(bars, index, opts = {}) {
  const b = bars[index];
  if (!b) return false;
  const body = bodyOf(b);
  const range = rangeOf(b);
  const avg = opts.avgBody ?? avgBody(bars, index);
  const meanVol = opts.avgVol ?? avgVolume(bars, index);

  // Doji / indecision
  if (body / range < 0.18) return false;
  // Very small body vs recent average
  if (body < avg * 0.35) return false;
  // Low volume when volume series exists
  const vol = Number(b.volume) || 0;
  if (meanVol > 0 && vol > 0 && vol < meanVol * 0.45) return false;

  // Inside candle only allowed if it starts the next impulse (caller decides);
  // by default reject pure insides.
  if (opts.allowInside !== true && index > 0) {
    const prev = bars[index - 1];
    const inside = b.high <= prev.high && b.low >= prev.low;
    if (inside && body < avg * 0.8) return false;
  }
  return true;
}

function zoneFromCandle(bar, side, mode = ZONE_MODE.HYBRID) {
  const bodyTop = Math.max(bar.open, bar.close);
  const bodyBot = Math.min(bar.open, bar.close);
  const body = Math.max(1e-9, bodyTop - bodyBot);

  if (mode === ZONE_MODE.BODY) {
    return { high: bodyTop, low: bodyBot };
  }
  if (mode === ZONE_MODE.FULL) {
    return { high: bar.high, low: bar.low };
  }
  // Hybrid: body default; expand wick if it participated in rejection
  if (side === 'bull') {
    const lowerWick = bodyBot - bar.low;
    if (lowerWick >= body * 0.45) return { high: bodyTop, low: bar.low };
    return { high: bodyTop, low: bodyBot };
  }
  const upperWick = bar.high - bodyTop;
  if (upperWick >= body * 0.45) return { high: bar.high, low: bodyBot };
  return { high: bodyTop, low: bodyBot };
}

/**
 * Displacement quality from legStart..breakIndex.
 * Requires institutional strength — weak candles never qualify.
 */
export function measureDisplacement(bars, legStart, breakIndex, side) {
  if (legStart < 0 || breakIndex <= legStart || breakIndex >= bars.length) {
    return { ok: false, scorePart: 0, impulseCount: 0, atrExpand: false, volumeOk: false };
  }
  const atr = atrLike(bars, breakIndex);
  const meanBody = avgBody(bars, breakIndex);
  const meanVol = avgVolume(bars, breakIndex);
  let impulseCount = 0;
  let strongBody = 0;
  let volHits = 0;
  let maxRange = 0;

  for (let i = legStart; i <= breakIndex; i += 1) {
    const b = bars[i];
    const body = bodyOf(b);
    const range = rangeOf(b);
    maxRange = Math.max(maxRange, range);
    const dirOk = side === 'bull' ? isBull(b) : isBear(b);
    const bodyRatio = body / range;
    const oppositeWick =
      side === 'bull' ? b.high - Math.max(b.open, b.close) : Math.min(b.open, b.close) - b.low;
    const smallOpposite = oppositeWick <= body * 0.55;
    if (dirOk && bodyRatio >= 0.55 && body >= meanBody * 0.9 && smallOpposite) {
      impulseCount += 1;
      strongBody += body;
    }
    const vol = Number(b.volume) || 0;
    if (meanVol > 0 && vol >= meanVol * 1.25) volHits += 1;
  }

  const move =
    side === 'bull'
      ? bars[breakIndex].close - bars[legStart].low
      : bars[legStart].high - bars[breakIndex].close;
  const atrExpand = maxRange >= atr * 1.35;
  const momentumOk = move >= atr * 1.15;
  const consecutiveOk = impulseCount >= 1 && (impulseCount >= 2 || atrExpand);
  const ok = consecutiveOk && momentumOk && strongBody >= meanBody * 1.1;
  const volumeOk = volHits >= 1 || meanVol === 0;

  let scorePart = 0;
  if (ok) {
    scorePart = SCORE_WEIGHTS.displacement * 0.55;
    if (atrExpand) scorePart += SCORE_WEIGHTS.displacement * 0.2;
    if (impulseCount >= 2) scorePart += SCORE_WEIGHTS.displacement * 0.15;
    if (volumeOk && meanVol > 0) scorePart += SCORE_WEIGHTS.displacement * 0.1;
    scorePart = Math.min(SCORE_WEIGHTS.displacement, scorePart);
  }
  return { ok, scorePart, impulseCount, atrExpand, volumeOk, move, atr };
}

/**
 * Liquidity sweep just before displacement: pierce prior swing then reject.
 */
export function findLiquiditySweep(bars, swings, side, beforeIndex, lookback = 12) {
  const from = Math.max(0, beforeIndex - lookback);
  if (side === 'bull') {
    const priorLows = swings.filter((s) => s.kind === 'low' && s.index < beforeIndex).slice(-5);
    for (const sl of priorLows) {
      for (let i = Math.max(from, sl.index + 1); i < beforeIndex; i += 1) {
        const b = bars[i];
        if (b.low < sl.price && b.close > sl.price) {
          // rejection after sweep
          const next = bars[i + 1];
          const rejected =
            isBull(b) || (next && (isBull(next) || next.close > b.close));
          if (rejected) {
            return {
              swept: true,
              price: sl.price,
              index: i,
              barsAgo: barsAgoOf(bars, i),
            };
          }
        }
      }
    }
  } else {
    const priorHighs = swings.filter((s) => s.kind === 'high' && s.index < beforeIndex).slice(-5);
    for (const sh of priorHighs) {
      for (let i = Math.max(from, sh.index + 1); i < beforeIndex; i += 1) {
        const b = bars[i];
        if (b.high > sh.price && b.close < sh.price) {
          const next = bars[i + 1];
          const rejected =
            isBear(b) || (next && (isBear(next) || next.close < b.close));
          if (rejected) {
            return {
              swept: true,
              price: sh.price,
              index: i,
              barsAgo: barsAgoOf(bars, i),
            };
          }
        }
      }
    }
  }
  return { swept: false };
}

function findObCandleIndex(bars, side, displacementStart) {
  const meanBody = avgBody(bars, displacementStart);
  const meanVol = avgVolume(bars, displacementStart);
  // Last opposite candle before displacement; allow inside only if it initiates move
  for (let i = displacementStart - 1; i >= Math.max(0, displacementStart - 8); i -= 1) {
    const opposite = side === 'bull' ? isBear(bars[i]) : isBull(bars[i]);
    if (!opposite) continue;
    const initiates =
      i + 1 === displacementStart ||
      (side === 'bull' ? isBull(bars[i + 1]) : isBear(bars[i + 1]));
    if (
      isValidObCandle(bars, i, {
        avgBody: meanBody,
        avgVol: meanVol,
        allowInside: initiates,
      })
    ) {
      return i;
    }
  }
  return -1;
}

function findDisplacementStart(bars, breakIndex, side) {
  // Walk back while candles remain impulsive in the break direction
  let start = breakIndex;
  const atr = atrLike(bars, breakIndex);
  for (let i = breakIndex; i >= Math.max(1, breakIndex - 10); i -= 1) {
    const b = bars[i];
    const dirOk = side === 'bull' ? isBull(b) : isBear(b);
    const strong = bodyOf(b) / rangeOf(b) >= 0.5 && rangeOf(b) >= atr * 0.55;
    if (dirOk && strong) {
      start = i;
      continue;
    }
    if (i < breakIndex) break;
  }
  // Include one more bar if it is the ignition candle
  if (start > 0) {
    const prev = bars[start - 1];
    const dirOk = side === 'bull' ? isBull(prev) : isBear(prev);
    if (dirOk && bodyOf(prev) / rangeOf(prev) >= 0.55) start -= 1;
  }
  return start;
}

/**
 * Mitigation / invalidation / touch count after OB forms.
 */
export function evaluateMitigation(bars, obIndex, high, low, side) {
  let touches = 0;
  let inside = false;
  let status = 'active';
  let firstTouchIndex = null;
  let fullyMitigated = false;

  for (let i = obIndex + 1; i < bars.length; i += 1) {
    const b = bars[i];
    const overlaps = b.low <= high && b.high >= low;

    if (side === 'bull' && b.close < low) {
      status = 'invalid';
      return { status, touches, firstTouchIndex, fullyMitigated, invalidIndex: i };
    }
    if (side === 'bear' && b.close > high) {
      status = 'invalid';
      return { status, touches, firstTouchIndex, fullyMitigated, invalidIndex: i };
    }

    if (overlaps) {
      if (!inside) {
        touches += 1;
        if (firstTouchIndex == null) firstTouchIndex = i;
        inside = true;
      }
      // Full mitigation: traded through the far side of the zone
      if (side === 'bull' && b.low <= low && b.high >= high) fullyMitigated = true;
      if (side === 'bear' && b.high >= high && b.low <= low) fullyMitigated = true;
    } else {
      inside = false;
    }
  }

  if (fullyMitigated) status = 'mitigated';
  else if (touches >= 1) status = 'mitigating';

  const touchLabel =
    touches <= 0 ? 'untouched' : touches === 1 ? 'first_touch' : touches === 2 ? 'second_touch' : 'multiple_touches';

  return { status, touches, touchLabel, firstTouchIndex, fullyMitigated, invalidIndex: null };
}

function scoreOrderBlock({
  event,
  displacement,
  sweep,
  hasFvg,
  volumeOk,
  htfBias,
  side,
}) {
  let score = 0;
  // BOS required — CHoCH also confirms structure change
  if (event.type === 'bos' || event.type === 'choch') {
    score += SCORE_WEIGHTS.bos;
    if (event.type === 'choch') score -= 3; // slight discount vs clean continuation BOS
  }
  if (sweep?.swept) score += SCORE_WEIGHTS.liquiditySweep;
  score += displacement.scorePart || 0;
  if (hasFvg) score += SCORE_WEIGHTS.fvg;
  if (volumeOk) score += SCORE_WEIGHTS.volume;
  if (htfBias && htfBias !== 'neutral') {
    if ((side === 'bull' && htfBias === 'bull') || (side === 'bear' && htfBias === 'bear')) {
      score += SCORE_WEIGHTS.htfAlign;
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function classifyKind(ob) {
  const tags = [];
  if (ob.score >= 70 && ob.confirmations.bos && ob.confirmations.displacement) {
    if (ob.confirmations.sweep || ob.confirmations.fvg) tags.push('institutional');
  }
  if (ob.confirmations.volume) tags.push('volume');
  if (ob.status === 'mitigated' || ob.status === 'mitigating') tags.push('mitigation');
  if (ob.refined) tags.push('refined');
  if (ob.nested) tags.push('nested');
  if (ob.breaker) tags.push('breaker');
  if (ob.flip) tags.push('flip');
  if (!tags.length) tags.push('standard');
  return tags;
}

function labelFor(ob) {
  const side = ob.side === 'bull' ? 'Demand OB' : 'Supply OB';
  if (ob.breaker) return ob.side === 'bull' ? 'Bullish Breaker' : 'Bearish Breaker';
  if (ob.flip) return ob.side === 'bull' ? 'Flip Demand' : 'Flip Supply';
  if (ob.kinds?.includes('institutional')) return `Institutional ${side}`;
  if (ob.kinds?.includes('refined')) return `Refined ${side}`;
  if (ob.kinds?.includes('mitigation')) return `Mitigation ${side}`;
  return side;
}

/**
 * Merge overlapping same-side zones — keep strongest, union bounds lightly.
 */
export function mergeOverlappingBlocks(blocks, overlapRatio = 0.45) {
  const sorted = [...blocks].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const ob of sorted) {
    let merged = false;
    for (const k of kept) {
      if (k.side !== ob.side) continue;
      if (k.timeframe && ob.timeframe && k.timeframe !== ob.timeframe) continue;
      const overlap = Math.min(k.high, ob.high) - Math.max(k.low, ob.low);
      const span = Math.max(k.high - k.low, ob.high - ob.low) || 1;
      if (overlap / span >= overlapRatio) {
        k.high = Math.max(k.high, ob.high);
        k.low = Math.min(k.low, ob.low);
        k.score = Math.max(k.score, ob.score);
        k.mergedFrom = (k.mergedFrom || 1) + 1;
        if (ob.nested || (ob.high < k.high && ob.low > k.low)) k.nested = true;
        merged = true;
        break;
      }
    }
    if (!merged) kept.push({ ...ob });
  }
  return kept.sort((a, b) => b.score - a.score);
}

/**
 * Detect Order Blocks on a single OHLC series.
 * @param {Array<{time:number,open:number,high:number,low:number,close:number,volume?:number}>} bars
 * @param {{
 *   zoneMode?: 'body'|'full'|'hybrid',
 *   htfBias?: 'bull'|'bear'|'neutral',
 *   timeframe?: string,
 *   minScore?: number,
 *   maxBlocks?: number,
 *   includeInvalid?: boolean,
 * }} [opts]
 */
export function detectOrderBlocks(bars, opts = {}) {
  const zoneMode = opts.zoneMode || ZONE_MODE.HYBRID;
  const htfBias = opts.htfBias || 'neutral';
  const timeframe = opts.timeframe || '';
  const minScore = opts.minScore ?? 45;
  const maxBlocks = opts.maxBlocks ?? 8;
  const includeInvalid = Boolean(opts.includeInvalid);

  if (!Array.isArray(bars) || bars.length < 30) return [];

  const swings = detectSwings(bars);
  const events = detectBosChoCh(bars, swings);
  if (!events.length) return []; // No BOS = No Order Block

  const raw = [];
  const seenOb = new Set();

  for (const event of events) {
    const side = event.side;
    const breakIndex = event.breakIndex;
    const legStart = findDisplacementStart(bars, breakIndex, side);
    const displacement = measureDisplacement(bars, legStart, breakIndex, side);
    if (!displacement.ok) continue; // Weak candles must not create OBs

    const obIndex = findObCandleIndex(bars, side, legStart);
    if (obIndex < 0) continue;

    const key = `${side}:${obIndex}:${event.type}`;
    if (seenOb.has(key)) continue;
    seenOb.add(key);

    const sweep = findLiquiditySweep(bars, swings, side, obIndex + 1);
    const fvgWindow = detectFvgs(bars, legStart, Math.min(bars.length - 1, breakIndex + 2));
    const hasFvg = fvgWindow.some((f) => f.side === side);
    const volumeOk = displacement.volumeOk;

    const zone = zoneFromCandle(bars[obIndex], side, zoneMode);
    // Refined = body-only nested inside hybrid/full
    const bodyZone = zoneFromCandle(bars[obIndex], side, ZONE_MODE.BODY);
    const refined =
      zoneMode !== ZONE_MODE.BODY &&
      bodyZone.high < zone.high + 1e-9 &&
      bodyZone.low > zone.low - 1e-9 &&
      bodyZone.high - bodyZone.low < zone.high - zone.low;

    const mitigation = evaluateMitigation(bars, obIndex, zone.high, zone.low, side);

    const score = scoreOrderBlock({
      event,
      displacement,
      sweep,
      hasFvg,
      volumeOk,
      htfBias,
      side,
    });

    // Breaker / flip: invalidated OB that later traded back through as opposite role
    let breaker = false;
    let flip = false;
    if (mitigation.status === 'invalid' && mitigation.invalidIndex != null) {
      for (let i = mitigation.invalidIndex + 1; i < bars.length; i += 1) {
        const b = bars[i];
        if (side === 'bull' && b.close > zone.high) {
          // Former demand broken → may act as supply (bearish breaker)
          breaker = true;
          flip = true;
          break;
        }
        if (side === 'bear' && b.close < zone.low) {
          breaker = true;
          flip = true;
          break;
        }
      }
    }

    const tfBoost = TF_PRIORITY[timeframe] ? Math.min(8, TF_PRIORITY[timeframe]) : 0;
    const finalScore = Math.min(100, score + (tfBoost > 5 ? 2 : 0));

    if (finalScore < minScore && mitigation.status !== 'active') continue;
    if (!includeInvalid && mitigation.status === 'invalid' && !breaker) continue;

    const ob = {
      side,
      high: Number(zone.high.toFixed(4)),
      low: Number(zone.low.toFixed(4)),
      p1: Number(zone.high.toFixed(4)),
      p2: Number(zone.low.toFixed(4)),
      obIndex,
      barsAgo: barsAgoOf(bars, obIndex),
      x1: -barsAgoOf(bars, obIndex),
      breakIndex,
      eventType: event.type,
      eventPrice: event.price,
      score: finalScore,
      status: breaker ? 'breaker' : mitigation.status,
      touches: mitigation.touches,
      touchLabel: mitigation.touchLabel,
      timeframe,
      zoneMode,
      refined,
      nested: false,
      breaker,
      flip: flip ? (side === 'bull' ? 'supply' : 'demand') : null,
      confirmations: {
        bos: true,
        eventType: event.type,
        sweep: Boolean(sweep.swept),
        displacement: true,
        fvg: hasFvg,
        volume: volumeOk,
        htfAlign:
          (side === 'bull' && htfBias === 'bull') || (side === 'bear' && htfBias === 'bear'),
      },
      sweepPrice: sweep.swept ? sweep.price : null,
      displacement: {
        impulseCount: displacement.impulseCount,
        atrExpand: displacement.atrExpand,
        move: Number((displacement.move || 0).toFixed(4)),
      },
      bodyHigh: Number(bodyZone.high.toFixed(4)),
      bodyLow: Number(bodyZone.low.toFixed(4)),
    };
    ob.kinds = classifyKind(ob);
    ob.label = labelFor(ob);
    ob.tone = side === 'bull' ? 'bull' : 'bear';
    raw.push(ob);
  }

  // Nested: mark smaller active blocks inside larger same-side blocks
  for (const a of raw) {
    for (const b of raw) {
      if (a === b || a.side !== b.side) continue;
      if (a.high <= b.high && a.low >= b.low && a.high - a.low < b.high - b.low) {
        a.nested = true;
        if (!a.kinds.includes('nested')) a.kinds.push('nested');
        a.label = labelFor(a);
      }
    }
  }

  const merged = mergeOverlappingBlocks(raw);
  // Prefer active / mitigating / breaker; rank by score then HTF priority
  const rank = (o) => {
    const st =
      o.status === 'active' ? 3 : o.status === 'mitigating' ? 2 : o.status === 'breaker' ? 2 : 1;
    return st * 1000 + o.score;
  };
  return merged.sort((a, b) => rank(b) - rank(a)).slice(0, maxBlocks);
}

/**
 * Multi-timeframe detection. Higher TF blocks get priority in ranking.
 * @param {Record<string, Array>} barsByTf
 */
export function detectOrderBlocksMultiTf(barsByTf, opts = {}) {
  const all = [];
  for (const [tf, bars] of Object.entries(barsByTf || {})) {
    if (!Array.isArray(bars) || bars.length < 30) continue;
    const blocks = detectOrderBlocks(bars, {
      ...opts,
      timeframe: tf,
      htfBias: opts.htfBiasByTf?.[tf] || opts.htfBias || 'neutral',
    });
    for (const ob of blocks) {
      ob.tfPriority = TF_PRIORITY[tf] || 1;
      // HTF priority boost (max +10 already partly in score weights via align)
      ob.score = Math.min(100, ob.score + Math.min(10, Math.max(0, (ob.tfPriority || 1) - 3)));
      all.push(ob);
    }
  }
  // Cross-TF overlap: keep strongest; HTF wins ties
  const sorted = all.sort(
    (a, b) => b.score - a.score || (b.tfPriority || 0) - (a.tfPriority || 0),
  );
  return mergeOverlappingBlocks(sorted, 0.35).slice(0, opts.maxBlocks ?? 10);
}

/** Wolfchart zone shapes from engine output. */
export function orderBlocksToShapes(orderBlocks, opts = {}) {
  const max = opts.max ?? 3;
  const list = (orderBlocks || [])
    .filter((o) => o.status === 'active' || o.status === 'mitigating' || o.status === 'breaker')
    .slice(0, max);
  return list.map((o) => ({
    type: 'zone',
    p1: o.high,
    p2: o.low,
    x1: o.x1 ?? -o.barsAgo,
    tone: o.status === 'breaker' || o.status === 'invalid' ? 'neutral' : o.tone,
    label: `${o.label} · ${o.score}`,
  }));
}

export function formatObTape(orderBlocks, symbol = '', interval = '') {
  const rows = orderBlocks || [];
  if (!rows.length) {
    return `ORDER BLOCK TAPE (${symbol} ${interval}): none — no BOS-confirmed institutional OB on window.`;
  }
  const lines = [
    `ORDER BLOCK TAPE (${symbol} ${interval}) — institutional engine; No BOS = No OB:`,
    ...rows.slice(0, 6).map((o) => {
      const conf = [
        o.confirmations.bos ? `BOS/${o.eventType}` : null,
        o.confirmations.sweep ? 'Sweep' : null,
        o.confirmations.displacement ? 'Disp' : null,
        o.confirmations.fvg ? 'FVG' : null,
        o.confirmations.volume ? 'Vol' : null,
        o.confirmations.htfAlign ? 'HTF' : null,
      ]
        .filter(Boolean)
        .join('+');
      return `- ${o.label} ${o.low.toFixed(2)}-${o.high.toFixed(2)} score=${o.score} status=${o.status} touches=${o.touches}(${o.touchLabel}) [${conf}] barsAgo=${o.barsAgo}${o.timeframe ? ` tf=${o.timeframe}` : ''} → {"type":"zone","p1":${o.high},"p2":${o.low},"x1":${o.x1},"tone":"${o.tone}","label":"${o.label}"}`;
    }),
    'Draw ONLY these zones for OB asks. Do NOT invent random last-opposite-candle blocks. No Entry/Stop/Target.',
  ];
  return lines.join('\n');
}

/**
 * Fetch OHLC and run the engine for chat / markup.
 */
export async function buildOrderBlockContext(message, opts = {}) {
  const symbol =
    opts.symbol ||
    (/CHART OPEN BESIDE THIS CHAT:\s*([A-Z0-9:._-]+)/i.exec(String(message || ''))?.[1] || '')
      .toUpperCase()
      .split(':')
      .pop() ||
    'NIFTY';
  const openTf = /CHART OPEN BESIDE THIS CHAT:[^·\n]*·\s*([0-9A-Za-z]+)/i.exec(
    String(message || ''),
  )?.[1];
  let interval = opts.interval || '15m';
  if (!opts.interval && openTf) {
    if (openTf === '60' || openTf === '1H') interval = '1h';
    else if (openTf === '240' || openTf === '4H') interval = '4h';
    else if (openTf === '1D' || openTf === 'D') interval = '1d';
    else if (/^\d+$/.test(openTf)) interval = `${openTf}m`;
  }

  try {
    const mtf = Boolean(opts.mtf);
    if (mtf) {
      const tfs = opts.timeframes || ['1d', '4h', '1h', '15m', '5m'];
      const packs = await Promise.all(
        tfs.map(async (tf) => {
          try {
            const data = await fetchOhlc(symbol, tf);
            return [tf, Array.isArray(data?.bars) ? data.bars.slice(-220) : []];
          } catch {
            return [tf, []];
          }
        }),
      );
      const barsByTf = Object.fromEntries(packs);
      const dBars = barsByTf['1d'] || [];
      const dSwings = dBars.length >= 30 ? detectSwings(dBars) : [];
      const htfBias =
        biasBefore(dSwings, dBars.length) === 'neutral'
          ? biasBefore(detectSwings(barsByTf['4h'] || []), (barsByTf['4h'] || []).length)
          : biasBefore(dSwings, dBars.length);
      const orderBlocks = detectOrderBlocksMultiTf(barsByTf, {
        zoneMode: opts.zoneMode || ZONE_MODE.HYBRID,
        htfBias,
        maxBlocks: opts.maxBlocks ?? 8,
      });
      return {
        block: formatObTape(orderBlocks, symbol, 'MTF'),
        orderBlocks,
        symbol,
        interval,
        htfBias,
      };
    }

    const data = await fetchOhlc(symbol, interval);
    const bars = Array.isArray(data?.bars) ? data.bars.slice(-220) : [];
    let htfBias = opts.htfBias || 'neutral';
    if (!opts.htfBias) {
      try {
        const d1 = await fetchOhlc(symbol, '1d');
        const dBars = Array.isArray(d1?.bars) ? d1.bars.slice(-120) : [];
        htfBias = biasBefore(detectSwings(dBars), dBars.length);
      } catch {
        htfBias = 'neutral';
      }
    }
    const orderBlocks = detectOrderBlocks(bars, {
      zoneMode: opts.zoneMode || ZONE_MODE.HYBRID,
      htfBias,
      timeframe: interval,
      maxBlocks: opts.maxBlocks ?? 6,
      minScore: opts.minScore ?? 45,
    });
    return {
      block: formatObTape(orderBlocks, symbol, interval),
      orderBlocks,
      symbol,
      interval,
      htfBias,
    };
  } catch (err) {
    console.warn('[Wolf AI] order block context failed:', err?.message || err);
    return { block: '', orderBlocks: [], symbol, interval, htfBias: 'neutral' };
  }
}

export function wantsOrderBlockMarkup(text) {
  return /\b(order\s*blocks?|orderblocks?|\bob\b|breaker\s*blocks?|mitigation\s*blocks?|supply\s*zone|demand\s*zone|institutional\s*ob)\b/i.test(
    String(text || ''),
  );
}
