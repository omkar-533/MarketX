/**
 * When the model forgets the wolfchart fence, synthesize one from live tape /
 * structure pivots so "mark it" never leaves a blank chart.
 *
 * S/R style matches desk practice: one horizontal line on the recent swing high
 * labeled RESISTANCE, one on the recent swing low labeled SUPPORT.
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

/** Latest swing high → RESISTANCE, latest swing low → SUPPORT (screenshot style). */
export function synthesizeSrWolfchart(meta = {}) {
  const symbol = resolveSymbol(meta);
  const tf = resolveTf(meta);
  const swings = Array.isArray(meta.swings) ? meta.swings : [];

  let res = null;
  let sup = null;
  for (let i = swings.length - 1; i >= 0; i -= 1) {
    const s = swings[i];
    if (!res && s.kind === 'high') res = s;
    if (!sup && s.kind === 'low') sup = s;
    if (res && sup) break;
  }

  // No pivots yet — fall back to session high/low (still labeled SUPPORT/RESISTANCE).
  const q = meta.quote;
  if (!res && q?.high) {
    res = { price: q.high, barsAgo: 12, kind: 'high', label: 'HH' };
  }
  if (!sup && q?.low) {
    sup = { price: q.low, barsAgo: 20, kind: 'low', label: 'LL' };
  }

  const levels = [];
  const shapes = [];

  if (res) {
    const p = roundPrice(res.price);
    if (p != null) {
      levels.push({ price: p, kind: 'resistance', label: 'RESISTANCE' });
      shapes.push({
        type: 'hline',
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
      levels.push({ price: p, kind: 'support', label: 'SUPPORT' });
      shapes.push({
        type: 'hline',
        p1: p,
        x1: -Math.abs(Number(sup.barsAgo) || 16),
        label: 'SUPPORT',
        tone: 'bull',
      });
    }
  }

  if (!levels.length && !shapes.length) return null;
  return fence({ symbol, tf, levels: levels.slice(0, 4), shapes: shapes.slice(0, 6) });
}

/**
 * Generic mark fallback (day range + structure tags) when the ask is not S/R.
 */
export function synthesizeWolfchart(meta = {}) {
  if (meta.style === 'sr') return synthesizeSrWolfchart(meta);

  const symbol = resolveSymbol(meta);
  const tf = resolveTf(meta);
  const levels = [];
  const shapes = [];
  const seen = new Set();

  const addLevel = (price, kind, label) => {
    const p = roundPrice(price);
    if (p == null) return;
    const key = `${kind}:${p}`;
    if (seen.has(key)) return;
    seen.add(key);
    levels.push({ price: p, kind, label });
  };

  // Prefer swing S/R lines first — closer to how traders mark a chart.
  const swings = Array.isArray(meta.swings) ? meta.swings : [];
  let res = null;
  let sup = null;
  for (let i = swings.length - 1; i >= 0; i -= 1) {
    const s = swings[i];
    if (!res && s.kind === 'high') res = s;
    if (!sup && s.kind === 'low') sup = s;
    if (res && sup) break;
  }
  if (res) {
    const p = roundPrice(res.price);
    if (p != null) {
      addLevel(p, 'resistance', 'RESISTANCE');
      shapes.push({
        type: 'hline',
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
      addLevel(p, 'support', 'SUPPORT');
      shapes.push({
        type: 'hline',
        p1: p,
        x1: -Math.abs(Number(sup.barsAgo) || 16),
        label: 'SUPPORT',
        tone: 'bull',
      });
    }
  }

  const q = meta.quote;
  if (!res && !sup && q) {
    addLevel(q.high, 'resistance', 'Day High');
    addLevel(q.low, 'support', 'Day Low');
    const high = roundPrice(q.high);
    const low = roundPrice(q.low);
    if (high != null) shapes.push({ type: 'hline', p1: high, label: 'Day High', tone: 'bear' });
    if (low != null) shapes.push({ type: 'hline', p1: low, label: 'Day Low', tone: 'bull' });
  }

  for (const e of (meta.events || []).slice(0, 2)) {
    const tag = /choch/i.test(e.label || '') ? 'CHOCH' : 'BOS';
    shapes.push({
      type: 'vline',
      x1: -Math.abs(Number(e.barsAgo) || 0),
      label: tag,
      tone: /^bull/i.test(e.label || '') ? 'bull' : 'bear',
    });
  }

  if (!levels.length && !shapes.length) return null;
  return fence({
    symbol,
    tf,
    levels: levels.slice(0, 8),
    shapes: shapes.slice(0, 14),
  });
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
    // Always enforce screenshot-style S/R for this ask.
    console.info('[Wolf AI] enforced SUPPORT/RESISTANCE hline markup');
    return `${stripWolfchart(text)}${block}`;
  }

  if (replyHasWolfchart(text)) return text;
  const block = synthesizeWolfchart(meta);
  if (!block) return text;
  console.info('[Wolf AI] injected fallback wolfchart (model omitted markup)');
  return `${text}${block}`;
}
