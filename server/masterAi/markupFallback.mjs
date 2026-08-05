/**
 * When the model forgets the wolfchart fence, synthesize one from live tape /
 * structure pivots so "mark it" never leaves a blank chart.
 *
 * S/R rule (desk): RESISTANCE = nearest real high ABOVE LTP,
 * SUPPORT = nearest real low BELOW LTP. Never mark resistance under price.
 */

import { looksLikeLiquidityLabel, normalizePineLiqLabel } from './liquidityEngine.mjs';
import { selectDisplayOrderBlocks } from './orderBlockEngine.mjs';

export function replyHasWolfchart(reply) {
  const text = String(reply || '');
  if (/```\s*wolfchart/i.test(text)) return true;
  return /\{[^{}]*"(?:levels|shapes)"\s*:\s*\[[\s\S]*?\][\s\S]*?\}\s*$/i.test(text.trim());
}

/** True when wolfchart exists AND has at least one drawable level/shape. */
export function wolfchartHasDrawings(reply) {
  const text = String(reply || '');
  const fenced = text.match(/```\s*wolfchart\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text.match(/(\{[^{}]*"(?:levels|shapes)"\s*:\s*\[[\s\S]*?\][\s\S]*?\})\s*$/i)?.[1];
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw.trim());
    const levels = Array.isArray(parsed?.levels) ? parsed.levels : [];
    const shapes = Array.isArray(parsed?.shapes) ? parsed.shapes : [];
    return levels.length + shapes.length > 0;
  } catch {
    return false;
  }
}

/** True when reply already has diagonal trend/ray drawings (not OB zones / S-R hrays). */
function replyHasTrendRays(reply) {
  const text = String(reply || '');
  const fenced = text.match(/```\s*wolfchart\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text.match(/(\{[^{}]*"(?:levels|shapes)"\s*:\s*\[[\s\S]*?\][\s\S]*?\})\s*$/i)?.[1];
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw.trim());
    const shapes = Array.isArray(parsed?.shapes) ? parsed.shapes : [];
    return shapes.some((s) => {
      const type = String(s?.type || '').toLowerCase();
      const label = String(s?.label || '');
      const p1 = Number(s?.p1);
      const p2 = Number(s?.p2);
      if (!(p1 > 0) || !(p2 > 0) || p1 === p2) return false;
      return type === 'trend' || type === 'ray' || /trend|channel/i.test(label);
    });
  } catch {
    return false;
  }
}

/** Pull two prices from prose like "24427.95 aur 24443.60" when engines are empty. */
function pricesFromProse(prose) {
  const text = String(prose || '');
  const pair =
    text.match(
      /(?:uptrend|downtrend|trend\s*line|channel\s*high|channel\s*low)[^0-9]{0,40}(\d{3,7}(?:\.\d+)?)(?:\s*(?:aur|and|&|,|–|-|to)\s*)(\d{3,7}(?:\.\d+)?)/i,
    ) || text.match(/(\d{4,7}(?:\.\d+)?)\s*(?:aur|and|&)\s*(\d{4,7}(?:\.\d+)?)/i);
  if (!pair) return null;
  const a = Number(pair[1]);
  const b = Number(pair[2]);
  if (!(a > 0) || !(b > 0) || a === b) return null;
  return { a, b, rising: /uptrend|higher\s*low/i.test(text) || b > a };
}

function roundPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100) / 100;
}

function stripWolfchart(reply) {
  return String(reply || '')
    .replace(/```\s*wolfchart[\s\S]*?(?:```|$)/gi, '')
    .replace(/\{[^{}]*"(?:levels|shapes)"\s*:\s*\[[\s\S]*?\][\s\S]*?\}\s*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Append a wolfchart block without ever re-attaching a stripped older fence. */
function withWolfchart(prose, block, stub = 'Chart par marking kar di hai.') {
  const cleaned = stripWolfchart(prose);
  return `${cleaned || stub}${block}`;
}

function replyHasObZones(reply) {
  const text = String(reply || '');
  const fenced = text.match(/```\s*wolfchart\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text.match(/(\{[^{}]*"(?:levels|shapes)"\s*:\s*\[[\s\S]*?\][\s\S]*?\})\s*$/i)?.[1];
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw.trim());
    const shapes = Array.isArray(parsed?.shapes) ? parsed.shapes : [];
    return shapes.some((s) => {
      const type = String(s?.type || '').toLowerCase();
      const label = String(s?.label || '');
      return (
        type === 'zone' &&
        (/^(demand|supply)(\s*ob)?$/i.test(label) || /^(bullish|bearish)\s*ob\b/i.test(label))
      );
    });
  } catch {
    return false;
  }
}

function replyHasLiqRays(reply) {
  const text = String(reply || '');
  const fenced = text.match(/```\s*wolfchart\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text.match(/(\{[^{}]*"(?:levels|shapes)"\s*:\s*\[[\s\S]*?\][\s\S]*?\})\s*$/i)?.[1];
  if (!raw) return false;
  try {
    const shapes = Array.isArray(JSON.parse(raw.trim())?.shapes) ? JSON.parse(raw.trim()).shapes : [];
    return shapes.some((s) =>
      /^(BSL|SSL|PDH|PDL|PWH|PWL|PMH|PML)\b/i.test(String(s?.label || '')),
    );
  } catch {
    return false;
  }
}

function fence(payload) {
  return `\n\n\`\`\`wolfchart\n${JSON.stringify(payload)}\n\`\`\``;
}

function resolveSymbol(meta) {
  return String(meta.symbol || meta.quote?.symbol || 'NIFTY')
    .toUpperCase()
    .replace(/^NSE:|^BSE:|^BINANCE:|^OANDA:|^FX:/, '');
}

function resolveTf(meta) {
  return String(meta.interval || '15m').replace(/^(\d+)$/, '$1m');
}

/**
 * Desk S/R logic (not "nearest pivot"):
 * - RESISTANCE = structural peak ABOVE LTP (highest swing/window high still overhead)
 * - SUPPORT    = structural trough BELOW LTP (lowest swing/window low that held the move)
 * Never mark a mid-level that price already sliced through while a deeper low exists.
 */
export function pickSrPair(meta = {}) {
  const q = meta.quote;
  const px = Number(meta.lastClose) || Number(q?.price) || 0;
  const swings = Array.isArray(meta.swings) ? meta.swings : [];

  // Prefer confirmed swing pivots; window extremes fill gaps (real structural H/L).
  const highs = swings
    .filter((s) => s.kind === 'high' && Number(s.price) > 0)
    .map((s) => ({ ...s, price: Number(s.price) }));
  const lows = swings
    .filter((s) => s.kind === 'low' && Number(s.price) > 0)
    .map((s) => ({ ...s, price: Number(s.price) }));

  if (Number(meta.rangeHigh) > 0) {
    highs.push({
      price: Number(meta.rangeHigh),
      barsAgo: Number(meta.rangeHighBarsAgo) || 6,
      kind: 'high',
      label: 'RH',
    });
  }
  if (Number(meta.rangeLow) > 0) {
    lows.push({
      price: Number(meta.rangeLow),
      barsAgo: Number(meta.rangeLowBarsAgo) || 18,
      kind: 'low',
      label: 'RL',
    });
  }

  const byRecent = (a, b) => (Number(a.barsAgo) || 0) - (Number(b.barsAgo) || 0);

  if (!(px > 0)) {
    const res = highs.slice().sort((a, b) => b.price - a.price || byRecent(a, b))[0] || null;
    const sup = lows.slice().sort((a, b) => a.price - b.price || byRecent(a, b))[0] || null;
    return { res, sup, px: 0 };
  }

  const eps = Math.max(px * 0.0002, 0.5);

  // Structural resistance = clear peak still ABOVE price (not the nearest minor LH).
  let res = highs
    .filter((h) => h.price > px + eps)
    .sort((a, b) => b.price - a.price || byRecent(a, b))[0];

  // Structural support = trough BELOW price (deepest held low — not a broken mid pivot).
  let sup = lows
    .filter((l) => l.price < px - eps)
    .sort((a, b) => a.price - b.price || byRecent(a, b))[0];

  // At highs: allow day/range high sitting on/near LTP.
  if (!res) {
    const touch = highs
      .filter((h) => h.price >= px - eps)
      .sort((a, b) => b.price - a.price || byRecent(a, b))[0];
    if (touch) res = { ...touch, price: Math.max(touch.price, px) };
    else if (q?.high > px - eps) {
      res = { price: Math.max(Number(q.high), px), barsAgo: 2, kind: 'high', label: 'DH' };
    }
  }

  if (!sup) {
    const touch = lows
      .filter((l) => l.price <= px + eps)
      .sort((a, b) => a.price - b.price || byRecent(a, b))[0];
    if (touch) sup = touch;
    else if (q?.low > 0 && q.low < px + eps) {
      sup = { price: Number(q.low), barsAgo: 14, kind: 'low', label: 'DL' };
    }
  }

  if (res && res.price < px - eps) res = null;
  if (sup && sup.price > px + eps) sup = null;
  if (res && sup && res.price <= sup.price) {
    if (res.price <= px) res = null;
    else sup = null;
  }

  return { res, sup, px };
}

/** Screenshot-style SUPPORT / RESISTANCE hlines sided to LTP. */
export function synthesizeSrWolfchart(meta = {}) {
  const symbol = resolveSymbol(meta);
  const tf = resolveTf(meta);
  const { res, sup } = pickSrPair(meta);

  const levels = [];
  const shapes = [];

  // Canvas-only hrays (no "levels") so the chart does not get full-width lines
  // left of the swing — matches the TradingView reference screenshot.
  if (res) {
    const p = roundPrice(res.price);
    if (p != null) {
      shapes.push({
        type: 'hray',
        p1: p,
        x1: -Math.abs(Number(res.barsAgo) || 8),
        label: 'RESISTANCE',
        tone: 'bear',
      });
    }
  }
  if (sup) {
    const p = roundPrice(sup.price);
    if (p != null) {
      shapes.push({
        type: 'hray',
        p1: p,
        x1: -Math.abs(Number(sup.barsAgo) || 16),
        label: 'SUPPORT',
        tone: 'bull',
      });
    }
  }

  if (!shapes.length) return null;
  return fence({ symbol, tf, levels: [], shapes: shapes.slice(0, 6) });
}

function rayShape(line, fallbackLabel, tone) {
  if (!line || !(Number(line.p1) > 0) || !(Number(line.p2) > 0)) return null;
  if (Number(line.p1) === Number(line.p2)) return null;
  return {
    type: 'ray',
    p1: roundPrice(line.p1),
    p2: roundPrice(line.p2),
    x1: Number(line.x1),
    x2: Number(line.x2),
    label: String(line.label || fallbackLabel).slice(0, 28),
    tone: tone || line.tone || 'neutral',
  };
}

/**
 * Classic trendline(s): primary Uptrend/Downtrend ray first;
 * optional natural channel ray on the other side. Never SUPPORT/RESISTANCE.
 */
export function synthesizeTrendWolfchart(meta = {}) {
  const symbol = resolveSymbol(meta);
  const tf = resolveTf(meta);
  const shapes = [];

  const ch = meta.trendChannel;
  if (ch) {
    // Primary first (the real TV Trend Line tool mark).
    const primary = rayShape(
      ch.primary || (ch.rising ? ch.lower : ch.upper),
      ch.rising ? 'Uptrend line' : 'Downtrend line',
      ch.rising ? 'bull' : 'bear',
    );
    if (primary) shapes.push(primary);

    // Optional second side only when engine found a natural channel leg.
    if (ch.rising && ch.upper && ch.primary !== ch.upper) {
      const sec = rayShape(ch.upper, 'Channel high', 'bear');
      if (sec) shapes.push(sec);
    } else if (!ch.rising && ch.lower && ch.primary !== ch.lower) {
      const sec = rayShape(ch.lower, 'Channel low', 'bull');
      if (sec) shapes.push(sec);
    }

    // If primary missing but sides exist, still draw what we have.
    if (!shapes.length) {
      const lower = rayShape(ch.lower, 'Uptrend line', 'bull');
      const upper = rayShape(ch.upper, 'Downtrend line', 'bear');
      if (lower) shapes.push(lower);
      if (upper) shapes.push(upper);
    }
  }

  if (!shapes.length && meta.trendline) {
    const one = rayShape(
      meta.trendline,
      meta.trendline.tone === 'bear' ? 'Downtrend line' : 'Uptrend line',
      meta.trendline.tone,
    );
    if (one) shapes.push(one);
  }

  // Strict swing fallback: HL → uptrend, LH → downtrend (no forced opposite slope).
  if (!shapes.length) {
    const swings = Array.isArray(meta.swings) ? meta.swings : [];
    const lows = swings
      .filter((s) => s.kind === 'low' && Number(s.price) > 0)
      .map((s) => ({ price: Number(s.price), barsAgo: Math.abs(Number(s.barsAgo) || 0) }))
      .sort((a, b) => b.barsAgo - a.barsAgo);
    const highs = swings
      .filter((s) => s.kind === 'high' && Number(s.price) > 0)
      .map((s) => ({ price: Number(s.price), barsAgo: Math.abs(Number(s.barsAgo) || 0) }))
      .sort((a, b) => b.barsAgo - a.barsAgo);

    const risingPair = (pts) => {
      for (let i = 0; i < pts.length; i += 1) {
        for (let j = i + 1; j < pts.length; j += 1) {
          const a = pts[i];
          const b = pts[j];
          if (a.barsAgo - b.barsAgo >= 5 && b.price > a.price) return { a, b };
        }
      }
      return null;
    };
    const fallingPair = (pts) => {
      for (let i = 0; i < pts.length; i += 1) {
        for (let j = i + 1; j < pts.length; j += 1) {
          const a = pts[i];
          const b = pts[j];
          if (a.barsAgo - b.barsAgo >= 5 && b.price < a.price) return { a, b };
        }
      }
      return null;
    };

    const hl =
      swings.filter((s) => s.label === 'HL' || s.label === 'HH').length >=
      swings.filter((s) => s.label === 'LH' || s.label === 'LL').length;
    if (hl) {
      const p = risingPair(lows);
      if (p) {
        shapes.push({
          type: 'ray',
          p1: roundPrice(p.a.price),
          p2: roundPrice(p.b.price),
          x1: -p.a.barsAgo,
          x2: -p.b.barsAgo,
          label: 'Uptrend line',
          tone: 'bull',
        });
      }
    } else {
      const p = fallingPair(highs);
      if (p) {
        shapes.push({
          type: 'ray',
          p1: roundPrice(p.a.price),
          p2: roundPrice(p.b.price),
          x1: -p.a.barsAgo,
          x2: -p.b.barsAgo,
          label: 'Downtrend line',
          tone: 'bear',
        });
      }
    }
  }

  // Live quote / day range — structure OHLC may have timed out; still draw something real.
  if (!shapes.length) {
    const q = meta.quote || {};
    const px = Number(meta.lastClose) || Number(q.price) || 0;
    const lo =
      Number(meta.rangeLow) ||
      Number(q.low) ||
      Number(q.dayLow) ||
      (px > 0 ? roundPrice(px * 0.997) : 0);
    const hi =
      Number(meta.rangeHigh) ||
      Number(q.high) ||
      Number(q.dayHigh) ||
      (px > 0 ? roundPrice(px * 1.003) : 0);
    const loAgo = Math.max(12, Number(meta.rangeLowBarsAgo) || 36);
    const hiAgo = Math.max(10, Number(meta.rangeHighBarsAgo) || 28);
    if (px > 0 && lo > 0 && hi > lo) {
      const rising = px >= (lo + hi) / 2 || px > lo * 1.0005;
      if (rising) {
        const p2 = roundPrice(Math.min(px * 0.9992, lo + (px - lo) * 0.62));
        if (p2 && p2 > lo) {
          shapes.push({
            type: 'ray',
            p1: roundPrice(lo),
            p2,
            x1: -loAgo,
            x2: -5,
            label: 'Uptrend line',
            tone: 'bull',
          });
        }
        const hp2 = roundPrice(Math.max(px * 1.0003, hi - (hi - px) * 0.4));
        if (hp2 && hi > hp2) {
          shapes.push({
            type: 'ray',
            p1: roundPrice(hi),
            p2: hp2,
            x1: -hiAgo,
            x2: -4,
            label: 'Channel high',
            tone: 'bear',
          });
        }
      } else {
        const p2 = roundPrice(Math.max(px * 1.0008, hi - (hi - px) * 0.55));
        if (p2 && p2 < hi) {
          shapes.push({
            type: 'ray',
            p1: roundPrice(hi),
            p2,
            x1: -hiAgo,
            x2: -5,
            label: 'Downtrend line',
            tone: 'bear',
          });
        }
      }
    }
  }

  // Last resort: prices the model already named in prose.
  if (!shapes.length) {
    const fromProse = pricesFromProse(meta.prose || '');
    if (fromProse) {
      const low = Math.min(fromProse.a, fromProse.b);
      const high = Math.max(fromProse.a, fromProse.b);
      if (fromProse.rising || high > low) {
        shapes.push({
          type: 'ray',
          p1: roundPrice(low),
          p2: roundPrice(high),
          x1: -32,
          x2: -6,
          label: fromProse.rising !== false ? 'Uptrend line' : 'Downtrend line',
          tone: fromProse.rising !== false ? 'bull' : 'bear',
        });
      }
    }
  }

  if (!shapes.length) return null;
  return fence({ symbol, tf, levels: [], shapes: shapes.slice(0, 3) });
}

/** Pine liquidity hrays — BSL/SSL High Vol + PDH/PDL/PWH/PWL/PMH/PML. */
export function synthesizeLiqWolfchart(meta = {}) {
  const symbol = resolveSymbol(meta);
  const tf = resolveTf(meta);
  let pools = Array.isArray(meta.liquidityPools) ? meta.liquidityPools : [];

  // Fallback: at least the primary BSL/SSL pair if full list empty.
  if (!pools.length && meta.liquidityPair) {
    pools = [meta.liquidityPair.bsl, meta.liquidityPair.ssl].filter(Boolean);
  }

  const shapes = [];
  const seen = new Set();
  for (const lvl of pools) {
    if (!lvl) continue;
    const p = roundPrice(lvl.price);
    if (p == null) continue;
    const label = String(lvl.label || (lvl.side === 'bsl' ? 'BSL (High Vol)' : 'SSL (High Vol)')).slice(
      0,
      36,
    );
    const key = `${label}:${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const color =
      lvl.color ||
      (/^BSL/i.test(label)
        ? '#ef5350'
        : /^SSL/i.test(label)
          ? '#26a69a'
          : /^PDH|^PDL/i.test(label)
            ? '#ff9800'
            : /^PWH|^PWL/i.test(label)
              ? '#f0b90b'
              : /^PMH|^PML/i.test(label)
                ? '#2962ff'
                : undefined);
    shapes.push({
      type: 'hray',
      p1: p,
      x1: -Math.abs(Number(lvl.barsAgo) || 8),
      label,
      tone: lvl.tone || (lvl.side === 'bsl' ? 'bear' : 'bull'),
      color,
      lineStyle: 'dotted',
    });
  }
  if (!shapes.length) return null;
  return fence({ symbol, tf, levels: [], shapes: shapes.slice(0, 16) });
}

/**
 * Pine FVG high-vol OB zones (extend.right).
 * labelMode: 'ob' → Bullish OB / Bearish OB · 'zone' → Demand / Supply
 */
export function synthesizeObWolfchart(meta = {}) {
  const symbol = resolveSymbol(meta);
  const tf = resolveTf(meta);
  const blocks = Array.isArray(meta.orderBlocks) ? meta.orderBlocks : [];
  const labelMode = meta.labelMode === 'zone' ? 'zone' : 'ob';
  // Balanced mark: 1 bullish below LTP + 1 bearish above LTP — never a broken/FVG dump.
  const selected = selectDisplayOrderBlocks(blocks, {
    ltp: Number(meta.lastClose) || 0,
    maxPerSide: 1,
    maxTotal: 2,
  });

  const shapes = selected
    .map((o) => {
      const high = roundPrice(o.high ?? o.p1);
      const low = roundPrice(o.low ?? o.p2);
      if (high == null || low == null) return null;
      const bull =
        o.side === 'bull' ||
        o.tone === 'bull' ||
        /demand|bull/i.test(o.label || '');
      const label =
        labelMode === 'zone'
          ? bull
            ? 'Demand'
            : 'Supply'
          : bull
            ? 'Bullish OB'
            : 'Bearish OB';
      return {
        type: 'zone',
        p1: Math.max(high, low),
        p2: Math.min(high, low),
        x1: o.x1 ?? (o.barsAgo != null ? -o.barsAgo : undefined),
        tone: bull ? 'bull' : 'bear',
        label,
        color: o.borderColor || (bull ? '#00ff9d' : '#ff4d4d'),
        borderColor: o.borderColor || (bull ? '#00ff9d' : '#ff4d4d'),
        fillColor: o.fillColor || (bull ? 'rgba(0,255,157,0.15)' : 'rgba(255,77,77,0.15)'),
      };
    })
    .filter(Boolean);

  // Drop accidental same-tone near-duplicates after rounding
  const unique = [];
  for (const s of shapes) {
    const twin = unique.find(
      (u) =>
        u.tone === s.tone &&
        Math.abs(u.p1 - s.p1) / Math.max(Math.abs(s.p1), 1) < 0.0015 &&
        Math.abs(u.p2 - s.p2) / Math.max(Math.abs(s.p2), 1) < 0.0015,
    );
    if (!twin) unique.push(s);
  }
  if (!unique.length) return null;
  return fence({ symbol, tf, levels: [], shapes: unique.slice(0, 2) });
}

/**
 * Generic mark fallback — respect style; never force S/R onto a trend ask.
 */
export function synthesizeWolfchart(meta = {}) {
  if (meta.style === 'sr') return synthesizeSrWolfchart(meta);
  if (meta.style === 'trend') return synthesizeTrendWolfchart(meta);
  if (meta.style === 'ob') return synthesizeObWolfchart(meta);
  if (meta.style === 'liq') return synthesizeLiqWolfchart(meta);
  // Generic "mark karo" with no tool named → structural S/R is a safe default.
  return synthesizeSrWolfchart(meta) || synthesizeTrendWolfchart(meta);
}

/**
 * Append or replace wolfchart so the drawn tool matches what the user asked for.
 */
export function ensureWolfchartReply(reply, meta) {
  const text = String(reply || '').trim();
  if (!text) return text;

  if (meta?.style === 'trend') {
    const cleaned = stripWolfchart(text);
    const block = synthesizeTrendWolfchart({ ...meta, prose: cleaned });
    if (!block) {
      console.warn('[Wolf AI] trend ask but no channel pair — stripped non-trend markup');
      if (replyHasTrendRays(text)) return text;
      return cleaned || 'Trend channel tape unavailable — clean levels nahi mile, marking skip.';
    }
    console.info('[Wolf AI] enforced both-side trend channel rays');
    return withWolfchart(text, block);
  }

  if (meta?.style === 'sr') {
    const block = synthesizeSrWolfchart(meta);
    if (!block) return text;
    console.info('[Wolf AI] enforced LTP-sided SUPPORT/RESISTANCE hlines');
    return withWolfchart(text, block);
  }

  if (meta?.style === 'ob') {
    const block = synthesizeObWolfchart(meta);
    const cleaned = stripWolfchart(text);
    if (!block) {
      console.warn('[Wolf AI] OB ask but engine found no active Demand/Supply OB');
      if (replyHasObZones(text)) return text;
      return cleaned || 'Order block tape unavailable — active Demand/Supply OB nahi mila.';
    }
    console.info('[Wolf AI] enforced Demand OB / Supply OB (never FVG gap)');
    return withWolfchart(text, block);
  }

  // Model often invents "Supply FVG" / marks the gap instead of the OB candle —
  // replace with engine Demand/Supply OB when tape exists.
  if (
    replyHasWolfchart(text) &&
    Array.isArray(meta?.orderBlocks) &&
    meta.orderBlocks.length &&
    /supply\s*fvg|demand\s*fvg|bullish\s*fvg|bearish\s*fvg|"label"\s*:\s*"[^"]*fvg/i.test(text)
  ) {
    const block = synthesizeObWolfchart(meta);
    if (block) {
      console.info('[Wolf AI] replaced FVG-as-supply dump with Demand/Supply OB tape');
      return withWolfchart(text, block);
    }
  }

  if (meta?.style === 'liq') {
    const block = synthesizeLiqWolfchart(meta);
    const cleaned = stripWolfchart(text);
    if (!block) {
      console.warn('[Wolf AI] liquidity ask but no BSL/SSL pools found');
      if (replyHasLiqRays(text)) return text;
      return cleaned || 'Liquidity tape unavailable — BSL/SSL pools nahi mile.';
    }
    console.info('[Wolf AI] enforced Pine shortcut liquidity hrays');
    return withWolfchart(text, block);
  }

  // Model often invents "Resistance Liquidity (BSL)" — rewrite to Pine shortcuts,
  // or replace entirely when engine pools are available.
  if (replyHasWolfchart(text) && /liquidity|\bbsl\b|\bssl\b|\bpdh\b|\bpdl\b/i.test(text)) {
    if (Array.isArray(meta?.liquidityPools) && meta.liquidityPools.length) {
      const block = synthesizeLiqWolfchart(meta);
      if (block) {
        console.info('[Wolf AI] replaced verbose liquidity labels with Pine engine tape');
        return withWolfchart(text, block);
      }
    }
    return rewriteLiquidityLabelsInReply(text);
  }

  // Explicit / auto mark: never leave a clarifying prose-only reply or empty shapes[].
  // First "mark kar do" must draw — user should not need to ask twice.
  if (meta?.style === 'auto' || meta?.forceMark) {
    if (wolfchartHasDrawings(text)) return text;
    const block = synthesizeWolfchart({ ...meta, style: meta?.style === 'auto' ? 'auto' : meta?.style });
    const cleaned = stripWolfchart(text);
    if (!block) {
      console.warn('[Wolf AI] mark ask but no drawable levels/shapes from engines');
      return cleaned || text;
    }
    console.info('[Wolf AI] enforced first-reply mark (auto/force)');
    return withWolfchart(text, block);
  }

  if (replyHasWolfchart(text)) return text;
  const block = synthesizeWolfchart(meta);
  if (!block) return text;
  console.info('[Wolf AI] injected fallback wolfchart (model omitted markup)');
  return `${text}${block}`;
}

/** Rewrite wolfchart shape labels to Pine shortcuts (BSL/SSL/PDH…). */
export function rewriteLiquidityLabelsInReply(reply) {
  const text = String(reply || '');
  return text.replace(
    /("label"\s*:\s*")([^"]+)(")/gi,
    (full, a, label, c) => {
      if (!looksLikeLiquidityLabel(label)) return full;
      const short = normalizePineLiqLabel(label);
      // Invented names ("Internal Liquidity") → drop via empty label (client skips)
      if (!short) return `${a}${c}`;
      return `${a}${short}${c}`;
    },
  );
}
