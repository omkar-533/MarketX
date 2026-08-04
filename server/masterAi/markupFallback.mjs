/**
 * When the model forgets the wolfchart fence, synthesize one from live tape /
 * structure pivots so "mark it" never leaves a blank chart.
 *
 * S/R rule (desk): RESISTANCE = nearest real high ABOVE LTP,
 * SUPPORT = nearest real low BELOW LTP. Never mark resistance under price.
 */

export function replyHasWolfchart(reply) {
  const text = String(reply || '');
  if (/```\s*wolfchart/i.test(text)) return true;
  return /\{[^{}]*"(?:levels|shapes)"\s*:\s*\[[\s\S]*?\][\s\S]*?\}\s*$/i.test(text.trim());
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

/**
 * Generic mark fallback — still prefers LTP-sided S/R when swings exist.
 */
export function synthesizeWolfchart(meta = {}) {
  if (meta.style === 'sr') return synthesizeSrWolfchart(meta);

  const sr = synthesizeSrWolfchart(meta);
  if (sr) return sr;

  const symbol = resolveSymbol(meta);
  const tf = resolveTf(meta);
  const q = meta.quote;
  const levels = [];
  const shapes = [];
  if (q?.high) {
    const p = roundPrice(q.high);
    if (p != null) {
      levels.push({ price: p, kind: 'resistance', label: 'Day High' });
      shapes.push({ type: 'hline', p1: p, label: 'Day High', tone: 'bear' });
    }
  }
  if (q?.low) {
    const p = roundPrice(q.low);
    if (p != null) {
      levels.push({ price: p, kind: 'support', label: 'Day Low' });
      shapes.push({ type: 'hline', p1: p, label: 'Day Low', tone: 'bull' });
    }
  }
  if (!levels.length) return null;
  return fence({ symbol, tf, levels, shapes });
}

/**
 * Append or replace wolfchart so S/R asks always get SUPPORT/RESISTANCE hlines.
 */
export function ensureWolfchartReply(reply, meta) {
  const text = String(reply || '').trim();
  if (!text) return text;

  if (meta?.style === 'sr') {
    const block = synthesizeSrWolfchart(meta);
    if (!block) return text;
    console.info('[Wolf AI] enforced LTP-sided SUPPORT/RESISTANCE hlines');
    return `${stripWolfchart(text)}${block}`;
  }

  if (replyHasWolfchart(text)) return text;
  const block = synthesizeWolfchart(meta);
  if (!block) return text;
  console.info('[Wolf AI] injected fallback wolfchart (model omitted markup)');
  return `${text}${block}`;
}
