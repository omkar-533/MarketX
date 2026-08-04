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

  // Deduplicate near-identical boxes (keep newest)
  const deduped = [];
  for (let i = active.length - 1; i >= 0; i -= 1) {
    const ob = active[i];
    const twin = deduped.find(
      (d) =>
        d.side === ob.side &&
        Math.abs(d.high - ob.high) / Math.max(ob.high, 1) < 0.0003 &&
        Math.abs(d.low - ob.low) / Math.max(ob.low, 1) < 0.0003,
    );
    if (!twin) deduped.push(ob);
  }
  deduped.reverse();

  return deduped.slice(-maxBlocks).map((ob) => {
    const bull = ob.side === 'bull';
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
      label: bull ? 'Bull OB' : 'Bear OB',
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

export function detectOrderBlocksMultiTf(barsByTf, opts = {}) {
  const all = [];
  for (const [tf, bars] of Object.entries(barsByTf || {})) {
    if (!Array.isArray(bars) || bars.length < 10) continue;
    for (const ob of detectOrderBlocks(bars, { ...opts, timeframe: tf })) {
      all.push(ob);
    }
  }
  return all
    .sort((a, b) => a.barsAgo - b.barsAgo)
    .slice(0, opts.maxBlocks ?? 12);
}

export function orderBlocksToShapes(orderBlocks, opts = {}) {
  const max = opts.max ?? 10;
  return (orderBlocks || [])
    .filter((o) => o && o.status === 'active')
    .slice(0, max)
    .map((o) => ({
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

export function formatObTape(orderBlocks, symbol = '', interval = '') {
  const rows = orderBlocks || [];
  if (!rows.length) {
    return `ORDER BLOCK TAPE (${symbol} ${interval}): none — no high-vol FVG Order Blocks (Pine: FVG + vol>SMA20×1.5, unmitigated).`;
  }
  const lines = [
    `ORDER BLOCK TAPE (${symbol} ${interval}) — Pine FVG OB: bullFVG=low>high[2] · bearFVG=high<low[2] · vol[2]>SMA20×1.5 · OB=candle[2] full range · mitigate bull low<=top / bear high>=bottom:`,
    ...rows.slice(0, 12).map(
      (o) =>
        `- ${o.label} ${o.low.toFixed(2)}-${o.high.toFixed(2)} barsAgo=${o.barsAgo} → {"type":"zone","p1":${o.high},"p2":${o.low},"x1":${o.x1},"tone":"${o.tone}","label":"${o.label}","borderColor":"${o.borderColor}","fillColor":"${o.fillColor}"}`,
    ),
    'Draw ALL tape zones (extend right). Exact Pine colors. No Entry/Stop/Target.',
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
      const orderBlocks = detectOrderBlocksMultiTf(Object.fromEntries(packs), {
        maxBlocks: opts.maxBlocks ?? 12,
      });
      return {
        block: formatObTape(orderBlocks, symbol, 'MTF'),
        orderBlocks,
        symbol,
        interval,
        htfBias: 'neutral',
      };
    }

    const data = await fetchOhlc(symbol, interval);
    const bars = Array.isArray(data?.bars) ? data.bars.slice(-300) : [];
    const orderBlocks = detectOrderBlocks(bars, {
      timeframe: interval,
      maxBlocks: opts.maxBlocks ?? 12,
      volLen: DEFAULT_VOL_LEN,
      volMult: DEFAULT_VOL_MULT,
    });
    return {
      block: formatObTape(orderBlocks, symbol, interval),
      orderBlocks,
      symbol,
      interval,
      htfBias: 'neutral',
    };
  } catch (err) {
    console.warn('[Wolf AI] order block context failed:', err?.message || err);
    return { block: '', orderBlocks: [], symbol, interval, htfBias: 'neutral' };
  }
}

export function wantsOrderBlockMarkup(text) {
  return /\b(order\s*blocks?|orderblocks?|\bob\b|breaker\s*blocks?|mitigation\s*blocks?|supply\s*zone|demand\s*zone|fvg\s*ob|institutional\s*ob)\b/i.test(
    String(text || ''),
  );
}
