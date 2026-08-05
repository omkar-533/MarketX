/**
 * Order Block engine — logic extracted from Pine:
 *
 *   bullFVG = low > high[2]
 *   bearFVG = high < low[2]
 *   highVol = volume[2] > SMA(volume,20) * 1.5
 *   OB candle = first candle of the FVG (index i-2) → top=high[2], bottom=low[2]
 *   Bull mitigate / cleanup: low <= box.top
 *   Bear mitigate / cleanup: high >= box.bottom
 *   Box extend.right with bull #00ff9d / bear #ff4d4d
 */

import { fetchOhlc } from '../market/provider.mjs';

export const ZONE_MODE = Object.freeze({
  BODY: 'body',
  FULL: 'full',
  HYBRID: 'hybrid',
});

/** Pine color inputs */
export const OB_PINE_COLORS = Object.freeze({
  bullBorder: '#00ff9d',
  bullBg: 'rgba(0,255,157,0.15)', // color.new(#00ff9d, 85) ≈ 15% opacity
  bearBorder: '#ff4d4d',
  bearBg: 'rgba(255,77,77,0.15)',
});

const DEFAULT_VOL_LEN = 20;
const DEFAULT_VOL_MULT = 1.5;

function barsAgoOf(bars, index) {
  return bars.length - 1 - index;
}

function smaVolume(bars, index, len = DEFAULT_VOL_LEN) {
  const start = Math.max(0, index - len + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= index; i += 1) {
    sum += Number(bars[i].volume) || 0;
    n += 1;
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

/** Kept for liquidityEngine + structure helpers. */
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
 * Pine FVG + high-volume Order Blocks.
 * @param {Array} bars
 * @param {{ volLen?: number, volMult?: number, maxBlocks?: number, timeframe?: string }} [opts]
 */
export function detectOrderBlocks(bars, opts = {}) {
  const volLen = Number(opts.volLen) > 0 ? Number(opts.volLen) : DEFAULT_VOL_LEN;
  const volMult = Number(opts.volMult) > 0 ? Number(opts.volMult) : DEFAULT_VOL_MULT;
  const maxBlocks = opts.maxBlocks ?? 12;
  const timeframe = opts.timeframe || '';

  if (!Array.isArray(bars) || bars.length < 5) return [];

  /** @type {Array<{ side: string, high: number, low: number, birth: number }>} */
  const active = [];

  for (let i = 2; i < bars.length; i += 1) {
    const c0 = bars[i];
    const c2 = bars[i - 2];
    const avgVol = smaVolume(bars, i, volLen);
    const highVol = avgVol > 0 && Number(c2.volume || 0) > avgVol * volMult;

    const bullFVG = c0.low > c2.high;
    const bearFVG = c0.high < c2.low;

    // Cleanup existing (Pine: every bar)
    for (let k = active.length - 1; k >= 0; k -= 1) {
      const ob = active[k];
      if (ob.side === 'bull' && c0.low <= ob.high) {
        active.splice(k, 1);
        continue;
      }
      if (ob.side === 'bear' && c0.high >= ob.low) {
        active.splice(k, 1);
      }
    }

    if (bullFVG && highVol) {
      const top = c2.high;
      const bottom = c2.low;
      // Pine: mitigated = low <= top at formation bar
      if (!(c0.low <= top)) {
        active.push({
          side: 'bull',
          high: top,
          low: bottom,
          birth: i - 2,
          formIndex: i,
        });
      }
    }

    if (bearFVG && highVol) {
      const top = c2.high;
      const bottom = c2.low;
      if (!(c0.high >= bottom)) {
        active.push({
          side: 'bear',
          high: top,
          low: bottom,
          birth: i - 2,
          formIndex: i,
        });
      }
    }
  }

  // Overlap merge — near-identical / nested same-side boxes collapse (keep newest).
  const deduped = mergeOverlappingOrderBlocks(
    active.map((ob) => ({
      side: ob.side,
      high: ob.high,
      low: ob.low,
      birth: ob.birth,
      formIndex: ob.formIndex,
      barsAgo: barsAgoOf(bars, ob.birth),
    })),
  );

  return deduped.slice(-maxBlocks).map((ob) => {
    const bull = ob.side === 'bull';
    // Training labels (Module 3 Part 4 + Module 7 Part 4):
    // Demand OB = bullish OB (origin of up expansion). Supply OB = bearish OB.
    // Never label the FVG gap itself as Supply/Demand.
    return {
      side: ob.side,
      high: Number(ob.high.toFixed(4)),
      low: Number(ob.low.toFixed(4)),
      p1: Number(ob.high.toFixed(4)),
      p2: Number(ob.low.toFixed(4)),
      obIndex: ob.birth,
      barsAgo: barsAgoOf(bars, ob.birth),
      x1: -barsAgoOf(bars, ob.birth),
      // Pine box right starts at form bar then extend.right
      x2: undefined,
      formBarsAgo: barsAgoOf(bars, ob.formIndex),
      status: 'active',
      score: 80,
      touches: 0,
      touchLabel: 'untouched',
      timeframe,
      label: bull ? 'Demand OB' : 'Supply OB',
      tone: bull ? 'bull' : 'bear',
      borderColor: bull ? OB_PINE_COLORS.bullBorder : OB_PINE_COLORS.bearBorder,
      fillColor: bull ? OB_PINE_COLORS.bullBg : OB_PINE_COLORS.bearBg,
      kinds: ['fvg_high_vol'],
      confirmations: {
        bos: false,
        fvg: true,
        volume: true,
        displacement: false,
        sweep: false,
        htfAlign: false,
        eventType: 'fvg',
      },
    };
  });
}

/** True when two boxes share most of their price range (same visual band). */
export function zonesOverlap(a, b, minRatio = 0.45) {
  const aHi = Math.max(Number(a.high ?? a.p1), Number(a.low ?? a.p2));
  const aLo = Math.min(Number(a.high ?? a.p1), Number(a.low ?? a.p2));
  const bHi = Math.max(Number(b.high ?? b.p1), Number(b.low ?? b.p2));
  const bLo = Math.min(Number(b.high ?? b.p1), Number(b.low ?? b.p2));
  if (![aHi, aLo, bHi, bLo].every((n) => Number.isFinite(n))) return false;
  const overlap = Math.max(0, Math.min(aHi, bHi) - Math.max(aLo, bLo));
  if (overlap <= 0) return false;
  const smaller = Math.min(aHi - aLo, bHi - bLo) || 1;
  return overlap / smaller >= minRatio;
}

/** Collapse overlapping same-side boxes — keep the newest (smallest barsAgo). */
export function mergeOverlappingOrderBlocks(blocks) {
  const list = [...(blocks || [])].sort(
    (a, b) => (Number(a.barsAgo) || 0) - (Number(b.barsAgo) || 0),
  );
  const out = [];
  for (const ob of list) {
    const twinIdx = out.findIndex(
      (d) =>
        (d.side || d.tone) === (ob.side || ob.tone) &&
        zonesOverlap(d, ob, 0.4),
    );
    if (twinIdx < 0) {
      out.push(ob);
      continue;
    }
    // Prefer fresher (smaller barsAgo); tighter box only as tie-breaker
    const prev = out[twinIdx];
    const a = Number(ob.barsAgo) || 0;
    const b = Number(prev.barsAgo) || 0;
    const tighter =
      Math.abs(Number(ob.high) - Number(ob.low)) < Math.abs(Number(prev.high) - Number(prev.low));
    if (a < b || (a === b && tighter)) out[twinIdx] = ob;
  }
  return out;
}

/**
 * Training invalidation (Module 3 Part 4):
 * Demand — strong close below zone. Supply — strong close above zone.
 * Also keep LTP-sided relevance: Demand below (or testing), Supply above (or testing).
 */
export function isObStillRelevant(o, ltp) {
  if (!o || o.status === 'mitigated') return false;
  const hi = Math.max(Number(o.high), Number(o.low));
  const lo = Math.min(Number(o.high), Number(o.low));
  if (![hi, lo].every((n) => Number.isFinite(n))) return false;
  const bull = o.side === 'bull' || o.tone === 'bull' || /demand|bull/i.test(o.label || '');
  if (!(ltp > 0)) return true;
  // Closed through → drop (do not mark broken Supply as active overhead)
  if (bull && ltp < lo) return false;
  if (!bull && ltp > hi) return false;
  return true;
}

/**
 * For chart marks: at most one Demand OB (below LTP) + one Supply OB (above LTP).
 * Never dumps a stack of same-side twins, never marks FVG gaps, never keeps broken supply.
 */
export function selectDisplayOrderBlocks(orderBlocks, opts = {}) {
  const ltp = Number(opts.ltp) || 0;
  const maxPerSide = Math.max(1, Number(opts.maxPerSide) || 1);
  const maxTotal = Math.max(1, Number(opts.maxTotal) || maxPerSide * 2);
  const active = mergeOverlappingOrderBlocks(
    (orderBlocks || []).filter((o) => isObStillRelevant(o, ltp)),
  );

  const score = (o) => {
    const mid = (Number(o.high) + Number(o.low)) / 2;
    const dist = ltp > 0 ? Math.abs(mid - ltp) / ltp : Number(o.barsAgo) || 0;
    // Prefer closer to LTP, then fresher
    return dist * 1000 + (Number(o.barsAgo) || 0) * 0.01;
  };

  // Demand = support side (at/below LTP). Supply = resistance side (at/above LTP).
  const bulls = active
    .filter((o) => {
      const bull = o.side === 'bull' || o.tone === 'bull' || /demand|bull/i.test(o.label || '');
      if (!bull) return false;
      if (!(ltp > 0)) return true;
      const hi = Math.max(Number(o.high), Number(o.low));
      return hi <= ltp * 1.001; // at or below LTP (allow tiny float/test)
    })
    .sort((a, b) => score(a) - score(b))
    .slice(0, maxPerSide);
  const bears = active
    .filter((o) => {
      const bear = o.side === 'bear' || o.tone === 'bear' || /supply|bear/i.test(o.label || '');
      if (!bear) return false;
      if (!(ltp > 0)) return true;
      const lo = Math.min(Number(o.high), Number(o.low));
      return lo >= ltp * 0.999; // at or above LTP
    })
    .sort((a, b) => score(a) - score(b))
    .slice(0, maxPerSide);

  const picked = [...bulls, ...bears].sort((a, b) => score(a) - score(b)).slice(0, maxTotal);
  // Keep visual order: supply above / demand below
  return picked.sort((a, b) => Number(b.high) - Number(a.high));
}

export function detectOrderBlocksMultiTf(barsByTf, opts = {}) {
  const all = [];
  for (const [tf, bars] of Object.entries(barsByTf || {})) {
    if (!Array.isArray(bars) || bars.length < 10) continue;
    for (const ob of detectOrderBlocks(bars, { ...opts, timeframe: tf, maxBlocks: 8 })) {
      all.push(ob);
    }
  }
  const merged = mergeOverlappingOrderBlocks(all);
  return merged
    .sort((a, b) => a.barsAgo - b.barsAgo)
    .slice(0, opts.maxBlocks ?? 12);
}

export function orderBlocksToShapes(orderBlocks, opts = {}) {
  const max = opts.max ?? 4;
  const selected = opts.balanced
    ? selectDisplayOrderBlocks(orderBlocks, {
        ltp: opts.ltp,
        maxPerSide: opts.maxPerSide ?? 1,
        maxTotal: max,
      })
    : (orderBlocks || []).filter((o) => o && o.status === 'active').slice(0, max);
  return selected.map((o) => ({
    type: 'zone',
    p1: o.high,
    p2: o.low,
    x1: o.x1 ?? -o.barsAgo,
    tone: o.tone,
    label: o.label,
    color: o.borderColor,
    borderColor: o.borderColor,
    fillColor: o.fillColor,
  }));
}

export function formatObTape(orderBlocks, symbol = '', interval = '', opts = {}) {
  const rows = orderBlocks || [];
  if (!rows.length) {
    return `ORDER BLOCK TAPE (${symbol} ${interval}): none — no high-vol FVG Order Blocks (Pine: FVG + vol>SMA20×1.5, unmitigated).`;
  }
  const bullN = rows.filter((o) => o.side === 'bull' || o.tone === 'bull').length;
  const bearN = rows.filter((o) => o.side === 'bear' || o.tone === 'bear').length;
  const lines = [
    `ORDER BLOCK TAPE (${symbol} ${interval}) — display set (bull=${bullN}, bear=${bearN}). Pine FVG OB: bullFVG=low>high[2] · bearFVG=high<low[2] · vol[2]>SMA20×1.5 · OB=candle[2] full range:`,
    ...rows.slice(0, 6).map(
      (o) =>
        `- ${o.label} ${o.low.toFixed(2)}-${o.high.toFixed(2)} barsAgo=${o.barsAgo} → {"type":"zone","p1":${o.high},"p2":${o.low},"x1":${o.x1},"tone":"${o.tone}","label":"${o.label}","borderColor":"${o.borderColor}","fillColor":"${o.fillColor}"}`,
    ),
    opts.markMode
      ? 'Draw ONLY these tape zones (max 1 Demand OB below LTP + 1 Supply OB above LTP). OB = candle[2] full range — NEVER mark the FVG gap as Supply/Demand. Labels exactly "Demand OB" / "Supply OB". Exact Pine colors. No Entry/Stop/Target.'
      : 'Draw ONLY the listed tape zones (already de-duplicated). Labels Demand OB / Supply OB. Never Supply FVG. Exact Pine colors. No Entry/Stop/Target.',
  ];
  return lines.join('\n');
}

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
    if (opts.mtf) {
      const tfs = opts.timeframes || ['1h', '15m', '5m'];
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
      const raw = detectOrderBlocksMultiTf(Object.fromEntries(packs), {
        maxBlocks: opts.maxBlocks ?? 12,
      });
      const mtfBars = packs.find(([, b]) => Array.isArray(b) && b.length)?.[1] || [];
      const ltp =
        Number(opts.ltp) || Number(mtfBars[mtfBars.length - 1]?.close) || 0;
      const orderBlocks = opts.markMode
        ? selectDisplayOrderBlocks(raw, { ltp, maxPerSide: 1, maxTotal: 2 })
        : selectDisplayOrderBlocks(raw, { ltp, maxPerSide: 2, maxTotal: 4 });
      return {
        block: formatObTape(orderBlocks, symbol, 'MTF', { markMode: Boolean(opts.markMode) }),
        orderBlocks,
        symbol,
        interval,
        htfBias: 'neutral',
        lastClose: ltp,
      };
    }

    const data = await fetchOhlc(symbol, interval);
    const bars = Array.isArray(data?.bars) ? data.bars.slice(-300) : [];
    const raw = detectOrderBlocks(bars, {
      timeframe: interval,
      maxBlocks: opts.maxBlocks ?? 12,
      volLen: DEFAULT_VOL_LEN,
      volMult: DEFAULT_VOL_MULT,
    });
    const ltp = Number(opts.ltp) || Number(bars[bars.length - 1]?.close) || 0;
    const orderBlocks = opts.markMode
      ? selectDisplayOrderBlocks(raw, { ltp, maxPerSide: 1, maxTotal: 2 })
      : selectDisplayOrderBlocks(raw, { ltp, maxPerSide: 2, maxTotal: 4 });
    return {
      block: formatObTape(orderBlocks, symbol, interval, { markMode: Boolean(opts.markMode) }),
      orderBlocks,
      symbol,
      interval,
      htfBias: 'neutral',
      lastClose: ltp,
    };
  } catch (err) {
    console.warn('[Wolf AI] order block context failed:', err?.message || err);
    return { block: '', orderBlocks: [], symbol, interval, htfBias: 'neutral' };
  }
}

export function wantsOrderBlockMarkup(text) {
  return /\b(order\s*blocks?|orderblocks?|\bob\b|breaker\s*blocks?|mitigation\s*blocks?|supply\s*\/?\s*demand|demand\s*\/?\s*supply|supply\s*zone|demand\s*zone|supply\s*ob|demand\s*ob|fvg\s*ob|institutional\s*ob)\b|\b(supply|demand)\b/i.test(
    String(text || ''),
  );
}
