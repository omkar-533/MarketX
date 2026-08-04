/**
 * Compact swing / BOS / CHOCH tape for Wolf AI so structure questions get
 * real labels (HH/HL/LH/LL) on the chart instead of a default supply/demand box.
 */
import { fetchOhlc } from '../market/provider.mjs';

const STRUCTURE_RE =
  /\b(hh|hl|lh|ll|higher\s*high|higher\s*low|lower\s*high|lower\s*low|bos|choch|c'?ho'?ch|change\s*of\s*character|break\s*of\s*structure|market\s*structure|swing\s*(high|low|point)?s?|structure)\b/i;

export function wantsStructureMarkup(text) {
  return STRUCTURE_RE.test(String(text || ''));
}

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

/**
 * Walk confirmed pivots and tag each as HH/HL/LH/LL vs the prior same-side swing.
 */
function labelSwings(bars) {
  const swings = [];
  for (let i = 2; i < bars.length - 2; i += 1) {
    if (pivotHigh(bars, i)) {
      swings.push({ kind: 'high', price: bars[i].high, index: i, barsAgo: bars.length - 1 - i });
    } else if (pivotLow(bars, i)) {
      swings.push({ kind: 'low', price: bars[i].low, index: i, barsAgo: bars.length - 1 - i });
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

function detectEvents(swings, lastClose) {
  const events = [];
  if (swings.length < 3) return events;

  const highs = swings.filter((s) => s.kind === 'high');
  const lows = swings.filter((s) => s.kind === 'low');
  const lastHigh = highs[highs.length - 1];
  const prevHigh = highs[highs.length - 2];
  const lastLow = lows[lows.length - 1];
  const prevLow = lows[lows.length - 2];

  // Recent structure events from the last few swings + last close.
  if (lastHigh && prevHigh && lastHigh.price > prevHigh.price && lastClose > prevHigh.price) {
    events.push({
      label: lastLow && prevLow && lastLow.price > prevLow.price ? 'Bull BOS' : 'Bull CHOCH?',
      price: prevHigh.price,
      barsAgo: lastHigh.barsAgo,
    });
  }
  if (lastLow && prevLow && lastLow.price < prevLow.price && lastClose < prevLow.price) {
    events.push({
      label: lastHigh && prevHigh && lastHigh.price < prevHigh.price ? 'Bear BOS' : 'Bear CHOCH?',
      price: prevLow.price,
      barsAgo: lastLow.barsAgo,
    });
  }
  return events.slice(0, 2);
}

function pickSymbol(message, chartHint) {
  const open = /CHART OPEN BESIDE THIS CHAT:\s*([A-Z0-9:._-]+)/i.exec(String(message || ''));
  if (open?.[1]) {
    const raw = open[1].toUpperCase();
    return raw.includes(':') ? raw.split(':').pop() : raw;
  }
  if (chartHint) return chartHint;
  if (/\bbank\s*nifty|banknifty\b/i.test(message || '')) return 'BANKNIFTY';
  if (/\bnifty\b/i.test(message || '')) return 'NIFTY';
  return 'NIFTY';
}

function pickInterval(message) {
  const open = /CHART OPEN BESIDE THIS CHAT:[^·\n]*·\s*([0-9]+)/i.exec(String(message || ''));
  if (open?.[1]) {
    const n = open[1];
    if (n === '60') return '1h';
    if (n === '240') return '4h';
    if (n === '1D' || n === 'D') return '1d';
    return `${n}m`;
  }
  if (/\b(1h|60m|hourly)\b/i.test(message || '')) return '1h';
  if (/\b(5m|5\s*min)\b/i.test(message || '')) return '5m';
  if (/\b(15m|15\s*min)\b/i.test(message || '')) return '15m';
  return '15m';
}

const EMPTY = {
  block: '',
  symbol: '',
  interval: '',
  swings: [],
  events: [],
  lastClose: 0,
};

/**
 * @param {string} message
 * @param {{ force?: boolean }} [opts] force=true builds tape even without structure keywords
 *   (needed for "marking kr do" / chart-open auto-draw).
 * @returns {Promise<{
 *   block: string,
 *   symbol: string,
 *   interval: string,
 *   swings: Array<{ label: string, price: number, kind: string, barsAgo: number }>,
 *   events: Array<{ label: string, price: number, barsAgo: number }>,
 *   lastClose: number,
 * }>}
 */
export async function buildStructureContext(message, opts = {}) {
  if (!opts.force && !wantsStructureMarkup(message)) {
    return { ...EMPTY };
  }

  const symbol = pickSymbol(message);
  const interval = pickInterval(message);

  try {
    const data = await fetchOhlc(symbol, interval);
    const bars = Array.isArray(data?.bars) ? data.bars : [];
    if (bars.length < 20) return { ...EMPTY, symbol, interval };

    const recent = bars.slice(-80);
    const swings = labelSwings(recent).slice(-8);
    if (!swings.length) return { ...EMPTY, symbol, interval };

    const lastClose = recent[recent.length - 1]?.close ?? 0;
    const events = detectEvents(swings, lastClose);

    const swingLines = swings.map(
      (s) =>
        `- ${s.label} ${s.price.toFixed(2)} (${s.kind}) barsAgo=${s.barsAgo} → {"type":"label","p1":${s.price.toFixed(2)},"x1":-${s.barsAgo},"label":"${s.label}","tone":"${s.kind === 'high' ? 'bear' : 'bull'}"}`,
    );
    const eventLines = events.map(
      (e) =>
        `- ${e.label} ${e.price.toFixed(2)} barsAgo=${e.barsAgo} → {"type":"vline","x1":-${e.barsAgo},"label":"${e.label.includes('CHOCH') ? 'CHOCH' : 'BOS'}","tone":"${e.label.startsWith('Bull') ? 'bull' : 'bear'}"} and {"type":"label","p1":${e.price.toFixed(2)},"x1":-${e.barsAgo},"label":"${e.label.includes('CHOCH') ? 'CHOCH' : 'BOS'}"}`,
    );

    const bias =
      swings.filter((s) => s.label === 'HH' || s.label === 'HL').length >=
      swings.filter((s) => s.label === 'LH' || s.label === 'LL').length
        ? 'recent swings lean bullish (HH/HL more common)'
        : 'recent swings lean bearish (LH/LL more common)';

    const block = [
      `STRUCTURE TAPE (${symbol} ${interval} — confirmed pivots from live OHLC; MARK THESE, not supply/demand unless asked):`,
      ...swingLines,
      ...(eventLines.length ? ['Events:', ...eventLines] : []),
      `Desk bias read: ${bias}.`,
      'For the wolfchart block: put each HH/HL/LH/LL as {"type":"label","p1":<price>,"label":"HH"} (or HL/LH/LL). Put BOS/CHOCH as {"type":"vline","x1":-<barsAgo>,"label":"BOS"} plus a label at the broken level. Do NOT replace this with Supply/Demand zones.',
    ].join('\n');

    return { block, symbol, interval, swings, events, lastClose };
  } catch (err) {
    console.warn('[Wolf AI] structure context failed:', err?.message || err);
    return { ...EMPTY, symbol, interval };
  }
}
