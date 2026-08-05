/**
 * Liquidity engine — logic extracted from Pine Script:
 *
 *   len = 5, volMult = 1.5, avgVol = SMA(volume, 20)
 *   pivothigh / pivotlow (len, len)
 *   volume[pivot] > avgVol * volMult → BSL (High Vol) / SSL (High Vol)
 *   Prev D/W/M high[1]/low[1] → PDH PDL PWH PWL PMH PML
 *   Mitigation: high >= lvl and low <= lvl → remove
 *
 * Chart marks = S/R-style horizontal rays (hray) with those exact labels.
 */

import { fetchOhlc } from '../market/provider.mjs';

const DEFAULT_SWING_LEN = 5;
const DEFAULT_VOL_MULT = 1.5;
const VOL_SMA = 20;

function barsAgoOf(bars, index) {
  return bars.length - 1 - index;
}

function smaVolume(bars, index, len = VOL_SMA) {
  const start = Math.max(0, index - len + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= index; i += 1) {
    sum += Number(bars[i].volume) || 0;
    n += 1;
  }
  return n ? sum / n : 0;
}

function isPivotHigh(bars, i, len) {
  if (i - len < 0 || i + len >= bars.length) return false;
  const h = bars[i].high;
  for (let j = i - len; j <= i + len; j += 1) {
    if (j !== i && bars[j].high > h) return false;
  }
  return true;
}

function isPivotLow(bars, i, len) {
  if (i - len < 0 || i + len >= bars.length) return false;
  const l = bars[i].low;
  for (let j = i - len; j <= i + len; j += 1) {
    if (j !== i && bars[j].low < l) return false;
  }
  return true;
}

function toneFor(label) {
  if (/^BSL/i.test(label)) return 'bear';
  if (/^SSL/i.test(label)) return 'bull';
  if (/PDH|PWH|PMH/i.test(label)) return 'bear';
  if (/PDL|PWL|PML/i.test(label)) return 'bull';
  return 'neutral';
}

/** Pine Script palette: red / green / orange / yellow / blue. */
export function colorForLiqLabel(label) {
  const short = normalizePineLiqLabel(label) || String(label || '');
  if (/^BSL/i.test(short)) return '#ef5350'; // color.red
  if (/^SSL/i.test(short)) return '#26a69a'; // color.green
  if (/^PDH|^PDL/i.test(short)) return '#ff9800'; // color.orange
  if (/^PWH|^PWL/i.test(short)) return '#f0b90b'; // color.yellow
  if (/^PMH|^PML/i.test(short)) return '#2962ff'; // color.blue
  return '#787b86';
}

/**
 * Force Pine shortcut labels only — never "Resistance Liquidity (BSL)" etc.
 * Returns null to drop invented junk like "Internal Liquidity".
 */
export function normalizePineLiqLabel(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  // Already exact Pine shortcuts
  if (/^BSL \(High Vol\)$/i.test(t)) return 'BSL (High Vol)';
  if (/^SSL \(High Vol\)$/i.test(t)) return 'SSL (High Vol)';
  if (/^(PDH|PDL|PWH|PWL|PMH|PML)$/i.test(t)) return t.toUpperCase();

  // HTF shortcuts (allow "Prev Day High" → PDH etc.)
  if (/\bpmh\b|prev(?:ious)?\s*month(?:ly)?\s*high/i.test(t)) return 'PMH';
  if (/\bpml\b|prev(?:ious)?\s*month(?:ly)?\s*low/i.test(t)) return 'PML';
  if (/\bpwh\b|prev(?:ious)?\s*week(?:ly)?\s*high/i.test(t)) return 'PWH';
  if (/\bpwl\b|prev(?:ious)?\s*week(?:ly)?\s*low/i.test(t)) return 'PWL';
  if (/\bpdh\b|prev(?:ious)?\s*day\s*high|daily\s*high/i.test(t)) return 'PDH';
  if (/\bpdl\b|prev(?:ious)?\s*day\s*low|daily\s*low/i.test(t)) return 'PDL';

  // High-vol / buy-sell side → exact Pine strings
  if (/\bbsl\b|buy[\s-]*side|resistance\s*liquidity|liquidity\s*\(?\s*bsl/i.test(t)) {
    return 'BSL (High Vol)';
  }
  if (/\bssl\b|sell[\s-]*side|support\s*liquidity|liquidity\s*\(?\s*ssl/i.test(t)) {
    return 'SSL (High Vol)';
  }

  // Invented filler — drop
  if (/internal\s*liquidity|external\s*liquidity|liquidity\s*level/i.test(t)) return null;

  return null;
}

export function looksLikeLiquidityLabel(raw) {
  const t = String(raw || '');
  return /liquidity|\bbsl\b|\bssl\b|\bpdh\b|\bpdl\b|\bpwh\b|\bpwl\b|\bpmh\b|\bpml\b/i.test(t);
}

function sideFor(label) {
  if (/BSL|PDH|PWH|PMH/i.test(label)) return 'bsl';
  return 'ssl';
}

/** True if any bar after birth trades through the level (Pine mitigation). */
function isMitigated(bars, birth, price) {
  for (let i = Math.max(0, birth); i < bars.length; i += 1) {
    if (bars[i].high >= price && bars[i].low <= price) return true;
  }
  return false;
}

/**
 * @param {Array} bars chart TF OHLC (+ volume)
 * @param {{ swingLength?: number, volMult?: number, htf?: object }} opts
 */
export function detectLiquidity(bars, opts = {}) {
  const len = Number(opts.swingLength) > 0 ? Number(opts.swingLength) : DEFAULT_SWING_LEN;
  const volMult = Number(opts.volMult) > 0 ? Number(opts.volMult) : DEFAULT_VOL_MULT;
  if (!Array.isArray(bars) || bars.length < len * 2 + 5) return [];

  /** @type {Array<{ price: number, label: string, birth: number }>} */
  const candidates = [];
  const push = (price, label, birth) => {
    const p = Number(price);
    if (!(p > 0)) return;
    if (candidates.some((c) => c.label === label && Math.abs(c.price - p) < 1e-6)) return;
    candidates.push({ price: p, label, birth: Math.max(0, birth) });
  };

  const htf = opts.htf || {};
  const last = bars[bars.length - 1];
  // Pine: on period change, add only if still outside (high < dHigh / low > dLow)
  const htfBirth = Math.max(0, bars.length - 40);
  if (htf.pdh != null && last.high < htf.pdh) push(htf.pdh, 'PDH', htfBirth);
  if (htf.pdl != null && last.low > htf.pdl) push(htf.pdl, 'PDL', htfBirth);
  if (htf.pwh != null && last.high < htf.pwh) push(htf.pwh, 'PWH', htfBirth);
  if (htf.pwl != null && last.low > htf.pwl) push(htf.pwl, 'PWL', htfBirth);
  if (htf.pmh != null && last.high < htf.pmh) push(htf.pmh, 'PMH', htfBirth);
  if (htf.pml != null && last.low > htf.pml) push(htf.pml, 'PML', htfBirth);

  // High-volume swings — Pine volume[len] at confirm = volume at pivot bar
  for (let pivot = len; pivot < bars.length - len; pivot += 1) {
    if (isPivotHigh(bars, pivot, len)) {
      const avgVol = smaVolume(bars, pivot, VOL_SMA);
      const vol = Number(bars[pivot].volume) || 0;
      if (avgVol > 0 && vol > avgVol * volMult) {
        push(bars[pivot].high, 'BSL (High Vol)', pivot);
      }
    }
    if (isPivotLow(bars, pivot, len)) {
      const avgVol = smaVolume(bars, pivot, VOL_SMA);
      const vol = Number(bars[pivot].volume) || 0;
      if (avgVol > 0 && vol > avgVol * volMult) {
        push(bars[pivot].low, 'SSL (High Vol)', pivot);
      }
    }
  }

  const live = candidates.filter((c) => !isMitigated(bars, c.birth + 1, c.price));

  const rank = (label) =>
    ({ PMH: 6, PML: 6, PWH: 5, PWL: 5, PDH: 4, PDL: 4, 'BSL (High Vol)': 3, 'SSL (High Vol)': 3 }[
      label
    ] || 1);

  return live
    .map((l) => ({
      side: sideFor(l.label),
      kind: /High Vol/i.test(l.label) ? 'high_vol_swing' : 'htf',
      price: Number(l.price.toFixed(4)),
      barsAgo: barsAgoOf(bars, Math.min(l.birth, bars.length - 1)),
      x1: -barsAgoOf(bars, Math.min(l.birth, bars.length - 1)),
      label: l.label,
      tone: toneFor(l.label),
      color: colorForLiqLabel(l.label),
      lineStyle: 'dotted',
      swept: false,
      score: /High Vol/i.test(l.label) ? 80 : 75,
      count: 1,
    }))
    .sort((a, b) => rank(b.label) - rank(a.label) || a.barsAgo - b.barsAgo);
}

function prevCandleHL(htfBars) {
  if (!Array.isArray(htfBars) || htfBars.length < 2) return null;
  const prev = htfBars[htfBars.length - 2];
  return { high: Number(prev.high), low: Number(prev.low) };
}

export function pickLiquidityPair(pools, ltp) {
  const px = Number(ltp) || 0;
  const eps = px > 0 ? Math.max(px * 0.00015, 0.25) : 0;
  const bsl =
    (pools || [])
      .filter((p) => p.side === 'bsl' && p.price > px + eps)
      .sort((a, b) => a.price - b.price)[0] || null;
  const ssl =
    (pools || [])
      .filter((p) => p.side === 'ssl' && p.price < px - eps)
      .sort((a, b) => b.price - a.price)[0] || null;
  return { bsl, ssl, px };
}

export function formatLiquidityTape(pools, symbol = '', interval = '', ltp = 0) {
  const rows = pools || [];
  const lines = [
    `LIQUIDITY TAPE (${symbol} ${interval}) — Pine logic: swing len=5 · vol > SMA20×1.5 → BSL/SSL (High Vol) · PDH/PDL/PWH/PWL/PMH/PML · touch mitigates:`,
  ];
  if (!rows.length) {
    lines.push('- No active unmitigated liquidity levels.');
  } else {
    for (const p of rows.slice(0, 16)) {
      lines.push(
        `- ${p.label} ${p.price.toFixed(2)} barsAgo=${p.barsAgo} → {"type":"hray","p1":${p.price},"x1":${p.x1},"label":"${p.label}","tone":"${p.tone}","color":"${p.color}","lineStyle":"dotted"}`,
      );
    }
  }
  if (ltp > 0) lines.push(`LTP ref ${Number(ltp).toFixed(2)}`);
  lines.push(
    'Draw EVERY tape level as hray. Exact labels only. NOT Support/Resistance. levels:[]. No Entry/Stop/Target.',
  );
  return lines.join('\n');
}

export function wantsLiquidityMarkup(text) {
  return /\b(liquidity|liquidty|liq\b|buy[\s-]*side\s*liq|sell[\s-]*side\s*liq|bsl|ssl|pdh|pdl|pwh|pwl|pmh|pml|high\s*vol|liquidity\s*(pool|zone|level|mark|draw))\b/i.test(
    String(text || ''),
  );
}

export async function buildLiquidityContext(message, opts = {}) {
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
    const ohlcOpts = { timeoutMs: 12_000 };
    const [chartPack, dPack, wPack, mPack] = await Promise.all([
      fetchOhlc(symbol, interval, undefined, ohlcOpts),
      fetchOhlc(symbol, '1d', undefined, ohlcOpts).catch(() => null),
      fetchOhlc(symbol, '1w', undefined, ohlcOpts).catch(() => null),
      fetchOhlc(symbol, '1M', undefined, ohlcOpts).catch(() => null),
    ]);
    const bars = Array.isArray(chartPack?.bars) ? chartPack.bars.slice(-300) : [];
    const dHL = prevCandleHL(dPack?.bars);
    const wHL = prevCandleHL(wPack?.bars);
    const mHL = prevCandleHL(mPack?.bars);
    const htf = {
      pdh: dHL?.high,
      pdl: dHL?.low,
      pwh: wHL?.high,
      pwl: wHL?.low,
      pmh: mHL?.high,
      pml: mHL?.low,
    };
    const ltp = Number(opts.ltp) || Number(bars[bars.length - 1]?.close) || 0;
    const pools = detectLiquidity(bars, {
      swingLength: DEFAULT_SWING_LEN,
      volMult: DEFAULT_VOL_MULT,
      htf,
    });
    return {
      block: formatLiquidityTape(pools, symbol, interval, ltp),
      pools,
      pair: pickLiquidityPair(pools, ltp),
      symbol,
      interval,
      ltp,
      htf,
    };
  } catch (err) {
    console.warn('[Wolf AI] liquidity context failed:', err?.message || err);
    return { block: '', pools: [], pair: { bsl: null, ssl: null, px: 0 }, symbol, interval, ltp: 0 };
  }
}
