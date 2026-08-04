/**
 * When the model forgets the wolfchart fence, synthesize one from live tape /
 * structure pivots so "mark it" never leaves a blank chart.
 */

export function replyHasWolfchart(reply) {
  const text = String(reply || '');
  if (/```\s*wolfchart/i.test(text)) return true;
  // Bare JSON at the end (some models drop the fence).
  return /\{[^{}]*"(?:levels|shapes)"\s*:\s*\[[\s\S]*?\][\s\S]*?\}\s*$/i.test(text.trim());
}

function roundPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100) / 100;
}

/**
 * @param {{
 *   symbol?: string,
 *   interval?: string,
 *   quote?: { symbol?: string, price?: number, high?: number, low?: number },
 *   swings?: Array<{ label: string, price: number, kind: string, barsAgo: number }>,
 *   events?: Array<{ label: string, price: number, barsAgo: number }>,
 * }} meta
 */
export function synthesizeWolfchart(meta = {}) {
  const symbol = String(meta.symbol || meta.quote?.symbol || 'NIFTY')
    .toUpperCase()
    .replace(/^NSE:|^BSE:|^BINANCE:/, '');
  const tf = String(meta.interval || '15m').replace(/^(\d+)$/, '$1m');

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

  const q = meta.quote;
  if (q) {
    addLevel(q.high, 'resistance', 'Day High');
    addLevel(q.low, 'support', 'Day Low');
    addLevel(q.price, 'pivot', 'LTP');
    const high = roundPrice(q.high);
    const low = roundPrice(q.low);
    const ltp = roundPrice(q.price);
    if (high != null) {
      shapes.push({ type: 'hline', p1: high, label: 'Day High', tone: 'bear' });
    }
    if (low != null) {
      shapes.push({ type: 'hline', p1: low, label: 'Day Low', tone: 'bull' });
    }
    if (ltp != null) {
      shapes.push({ type: 'hray', p1: ltp, x1: -8, label: 'LTP', tone: 'neutral' });
    }
  }

  for (const s of (meta.swings || []).slice(-6)) {
    const p = roundPrice(s.price);
    if (p == null) continue;
    shapes.push({
      type: 'label',
      p1: p,
      x1: -Math.abs(Number(s.barsAgo) || 0),
      label: String(s.label || 'SW').slice(0, 12),
      tone: s.kind === 'high' ? 'bear' : 'bull',
    });
  }

  for (const e of (meta.events || []).slice(0, 2)) {
    const tag = /choch/i.test(e.label || '') ? 'CHOCH' : 'BOS';
    shapes.push({
      type: 'vline',
      x1: -Math.abs(Number(e.barsAgo) || 0),
      label: tag,
      tone: /^bull/i.test(e.label || '') ? 'bull' : 'bear',
    });
    const p = roundPrice(e.price);
    if (p != null) {
      shapes.push({
        type: 'label',
        p1: p,
        x1: -Math.abs(Number(e.barsAgo) || 0),
        label: tag,
        tone: /^bull/i.test(e.label || '') ? 'bull' : 'bear',
      });
    }
  }

  if (!levels.length && !shapes.length) return null;

  const payload = JSON.stringify({
    symbol,
    tf,
    levels: levels.slice(0, 8),
    shapes: shapes.slice(0, 14),
  });
  return `\n\n\`\`\`wolfchart\n${payload}\n\`\`\``;
}

/**
 * Append a synthesized wolfchart when the model omitted one.
 * @returns {string} reply (possibly with block appended)
 */
export function ensureWolfchartReply(reply, meta) {
  const text = String(reply || '').trim();
  if (!text || replyHasWolfchart(text)) return text;
  const block = synthesizeWolfchart(meta);
  if (!block) return text;
  console.info('[Wolf AI] injected fallback wolfchart (model omitted markup)');
  return `${text}${block}`;
}
