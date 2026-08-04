/**
 * ICT / SMC liquidity engine.
 *
 * Buy-side liquidity (BSL)  = resting ABOVE swing highs / EQH (buy-stops).
 * Sell-side liquidity (SSL) = resting BELOW swing lows / EQL (sell-stops).
 *
 * Chart mark style matches S/R: horizontal rays (hray), not zones.
 * Equal highs/lows rank above lone swings. Swept pools are de-prioritized.
 */

import { fetchOhlc } from '../market/provider.mjs';
import { detectSwings } from './orderBlockEngine.mjs';

function barsAgoOf(bars, index) {
  return bars.length - 1 - index;
}

function atrLike(bars, len = 14) {
  if (!bars.length) return 0;
  const end = bars.length - 1;
  const start = Math.max(1, end - len + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= end; i += 1) {
    const prev = bars[i - 1]?.close ?? bars[i].open;
    sum += Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prev),
      Math.abs(bars[i].low - prev),
    );
    n += 1;
  }
  return n ? sum / n : bars[end].high - bars[end].low;
}

/**
 * Cluster swing prices within tolerance → equal highs / equal lows.
 */
function clusterEquals(swings, tol) {
  const sorted = [...swings].sort((a, b) => a.price - b.price);
  const clusters = [];
  for (const s of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(s.price - last.price) <= tol) {
      last.members.push(s);
      last.price =
        last.members.reduce((a, m) => a + m.price, 0) / last.members.length;
      last.barsAgo = Math.min(last.barsAgo, s.barsAgo);
      last.index = Math.max(last.index, s.index);
    } else {
      clusters.push({
        price: s.price,
        barsAgo: s.barsAgo,
        index: s.index,
        members: [s],
      });
    }
  }
  return clusters.map((c) => ({
    price: c.price,
    barsAgo: c.barsAgo,
    index: c.index,
    count: c.members.length,
    members: c.members,
  }));
}

/** High pierced after the pool formed → buy-side liquidity taken. */
function isSweptHigh(bars, fromIndex, price, eps) {
  for (let i = fromIndex + 1; i < bars.length; i += 1) {
    if (bars[i].high > price + eps) return true;
  }
  return false;
}

/** Low pierced after the pool formed → sell-side liquidity taken. */
function isSweptLow(bars, fromIndex, price, eps) {
  for (let i = fromIndex + 1; i < bars.length; i += 1) {
    if (bars[i].low < price - eps) return true;
  }
  return false;
}

function scorePool({ kind, count, swept, barsAgo, distPct, side, pxSideOk }) {
  let score = 20;
  if (kind === 'eqh' || kind === 'eql') score += 35 + Math.min(15, (count - 2) * 5);
  else if (kind === 'session') score += 22;
  else score += 12; // single swing
  if (!swept) score += 25;
  else score -= 18;
  // Prefer pools still on the correct side of LTP
  if (pxSideOk) score += 10;
  // Fresher pools slightly preferred
  if (barsAgo <= 40) score += 8;
  else if (barsAgo <= 80) score += 4;
  // Not absurdly far from price
  if (distPct <= 0.008) score += 8;
  else if (distPct <= 0.02) score += 4;
  else if (distPct > 0.05) score -= 10;
  if (side === 'bsl' || side === 'ssl') {
    /* keep */
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function labelFor(pool) {
  if (pool.kind === 'eqh') return pool.swept ? 'EQH SWEPT' : 'BUY-SIDE LIQ';
  if (pool.kind === 'eql') return pool.swept ? 'EQL SWEPT' : 'SELL-SIDE LIQ';
  if (pool.kind === 'session' && pool.side === 'bsl') {
    return pool.swept ? 'PDH SWEPT' : 'BUY-SIDE LIQ';
  }
  if (pool.kind === 'session' && pool.side === 'ssl') {
    return pool.swept ? 'PDL SWEPT' : 'SELL-SIDE LIQ';
  }
  if (pool.side === 'bsl') return pool.swept ? 'BSL SWEPT' : 'BUY-SIDE LIQ';
  return pool.swept ? 'SSL SWEPT' : 'SELL-SIDE LIQ';
}

/**
 * Detect ICT/SMC liquidity pools on OHLC.
 * @returns {Array<{
 *   side:'bsl'|'ssl', kind:string, price:number, barsAgo:number,
 *   score:number, swept:boolean, label:string, count:number, tone:string
 * }>}
 */
export function detectLiquidity(bars, opts = {}) {
  if (!Array.isArray(bars) || bars.length < 30) return [];
  const recent = bars.slice(-(opts.window || 220));
  const last = recent[recent.length - 1];
  const px = Number(opts.ltp) || Number(last.close) || 0;
  if (!(px > 0)) return [];

  const atr = atrLike(recent);
  const tol = Math.max(px * 0.0008, atr * 0.12, 0.5);
  const eps = Math.max(px * 0.00015, 0.25);
  const swings = detectSwings(recent);
  const highs = swings.filter((s) => s.kind === 'high');
  const lows = swings.filter((s) => s.kind === 'low');

  const eqh = clusterEquals(highs, tol);
  const eql = clusterEquals(lows, tol);
  const pools = [];
  const seen = new Set();

  const pushPool = (row) => {
    const key = `${row.side}:${row.price.toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    pools.push(row);
  };

  for (const c of eqh) {
    const kind = c.count >= 2 ? 'eqh' : 'swing';
    const swept = isSweptHigh(recent, c.index, c.price, eps);
    const pxSideOk = c.price > px + eps;
    const distPct = Math.abs(c.price - px) / px;
    const side = 'bsl';
    const score = scorePool({
      kind,
      count: c.count,
      swept,
      barsAgo: c.barsAgo,
      distPct,
      side,
      pxSideOk,
    });
    const pool = {
      side,
      kind,
      price: Number(c.price.toFixed(4)),
      barsAgo: c.barsAgo,
      x1: -c.barsAgo,
      count: c.count,
      swept,
      score,
      tone: swept ? 'neutral' : 'bear',
    };
    pool.label = labelFor(pool);
    pushPool(pool);
  }

  for (const c of eql) {
    const kind = c.count >= 2 ? 'eql' : 'swing';
    const swept = isSweptLow(recent, c.index, c.price, eps);
    const pxSideOk = c.price < px - eps;
    const distPct = Math.abs(c.price - px) / px;
    const side = 'ssl';
    const score = scorePool({
      kind,
      count: c.count,
      swept,
      barsAgo: c.barsAgo,
      distPct,
      side,
      pxSideOk,
    });
    const pool = {
      side,
      kind,
      price: Number(c.price.toFixed(4)),
      barsAgo: c.barsAgo,
      x1: -c.barsAgo,
      count: c.count,
      swept,
      score,
      tone: swept ? 'neutral' : 'bull',
    };
    pool.label = labelFor(pool);
    pushPool(pool);
  }

  // Session / range extremes as external liquidity (PDH/PDL proxy on window).
  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  let rangeHighIdx = 0;
  let rangeLowIdx = 0;
  const sess = recent.slice(-Math.min(80, recent.length));
  const sessOffset = recent.length - sess.length;
  for (let i = 0; i < sess.length; i += 1) {
    if (sess[i].high >= rangeHigh) {
      rangeHigh = sess[i].high;
      rangeHighIdx = sessOffset + i;
    }
    if (sess[i].low <= rangeLow) {
      rangeLow = sess[i].low;
      rangeLowIdx = sessOffset + i;
    }
  }
  if (Number.isFinite(rangeHigh) && rangeHigh > px + eps) {
    const swept = isSweptHigh(recent, rangeHighIdx, rangeHigh, eps);
    const pool = {
      side: 'bsl',
      kind: 'session',
      price: Number(rangeHigh.toFixed(4)),
      barsAgo: barsAgoOf(recent, rangeHighIdx),
      x1: -barsAgoOf(recent, rangeHighIdx),
      count: 1,
      swept,
      score: scorePool({
        kind: 'session',
        count: 1,
        swept,
        barsAgo: barsAgoOf(recent, rangeHighIdx),
        distPct: (rangeHigh - px) / px,
        side: 'bsl',
        pxSideOk: true,
      }),
      tone: swept ? 'neutral' : 'bear',
    };
    pool.label = labelFor(pool);
    pushPool(pool);
  }
  if (Number.isFinite(rangeLow) && rangeLow < px - eps) {
    const swept = isSweptLow(recent, rangeLowIdx, rangeLow, eps);
    const pool = {
      side: 'ssl',
      kind: 'session',
      price: Number(rangeLow.toFixed(4)),
      barsAgo: barsAgoOf(recent, rangeLowIdx),
      x1: -barsAgoOf(recent, rangeLowIdx),
      count: 1,
      swept,
      score: scorePool({
        kind: 'session',
        count: 1,
        swept,
        barsAgo: barsAgoOf(recent, rangeLowIdx),
        distPct: (px - rangeLow) / px,
        side: 'ssl',
        pxSideOk: true,
      }),
      tone: swept ? 'neutral' : 'bull',
    };
    pool.label = labelFor(pool);
    pushPool(pool);
  }

  return pools.sort((a, b) => b.score - a.score);
}

/**
 * S/R-style pair: strongest untouched BSL above LTP + SSL below LTP.
 * Falls back to best available (including swept) if needed.
 */
export function pickLiquidityPair(pools, ltp) {
  const px = Number(ltp) || 0;
  const eps = px > 0 ? Math.max(px * 0.0002, 0.5) : 0;
  const bsl = (pools || []).filter((p) => p.side === 'bsl' && p.price > px + eps);
  const ssl = (pools || []).filter((p) => p.side === 'ssl' && p.price < px - eps);

  const rank = (a, b) => {
    // Untouched first, then EQH/EQL, then score
    const au = a.swept ? 0 : 1;
    const bu = b.swept ? 0 : 1;
    if (bu !== au) return bu - au;
    const ak = a.kind === 'eqh' || a.kind === 'eql' ? 1 : 0;
    const bk = b.kind === 'eqh' || b.kind === 'eql' ? 1 : 0;
    if (bk !== ak) return bk - ak;
    return b.score - a.score;
  };

  const buy = bsl.slice().sort(rank)[0] || null;
  const sell = ssl.slice().sort(rank)[0] || null;
  return { bsl: buy, ssl: sell, px };
}

export function formatLiquidityTape(pools, symbol = '', interval = '', ltp = 0) {
  const { bsl, ssl } = pickLiquidityPair(pools, ltp);
  const lines = [
    `LIQUIDITY TAPE (${symbol} ${interval}) — ICT/SMC: BSL above highs · SSL below lows · EQH/EQL preferred:`,
  ];
  if (bsl) {
    lines.push(
      `- BSL ${bsl.price.toFixed(2)} score=${bsl.score} kind=${bsl.kind} swept=${bsl.swept ? 'yes' : 'no'} barsAgo=${bsl.barsAgo} → {"type":"hray","p1":${bsl.price},"x1":${bsl.x1},"label":"${bsl.label}","tone":"${bsl.tone}"}`,
    );
  } else {
    lines.push('- BSL: none clear above LTP');
  }
  if (ssl) {
    lines.push(
      `- SSL ${ssl.price.toFixed(2)} score=${ssl.score} kind=${ssl.kind} swept=${ssl.swept ? 'yes' : 'no'} barsAgo=${ssl.barsAgo} → {"type":"hray","p1":${ssl.price},"x1":${ssl.x1},"label":"${ssl.label}","tone":"${ssl.tone}"}`,
    );
  } else {
    lines.push('- SSL: none clear below LTP');
  }
  const extras = (pools || [])
    .filter((p) => p !== bsl && p !== ssl && (p.kind === 'eqh' || p.kind === 'eql') && !p.swept)
    .slice(0, 2);
  for (const p of extras) {
    lines.push(
      `- Extra ${p.side.toUpperCase()} ${p.price.toFixed(2)} (${p.kind}) score=${p.score}`,
    );
  }
  lines.push(
    'Draw ONLY hray liquidity levels from this tape (labels BUY-SIDE LIQ / SELL-SIDE LIQ). NOT Support/Resistance labels. levels:[]. No Entry/Stop/Target.',
  );
  return lines.join('\n');
}

export function wantsLiquidityMarkup(text) {
  return /\b(liquidity|liquidty|liq\b|buy[\s-]*side\s*liq|sell[\s-]*side\s*liq|bsl|ssl|eqh|eql|equal\s*highs?|equal\s*lows?|stop\s*hunt|liquidity\s*(pool|zone|level|mark|draw))\b/i.test(
    String(text || ''),
  );
}

/**
 * Fetch OHLC and build liquidity tape for chat / markup fallback.
 */
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
    const data = await fetchOhlc(symbol, interval);
    const bars = Array.isArray(data?.bars) ? data.bars.slice(-220) : [];
    const ltp = Number(opts.ltp) || Number(bars[bars.length - 1]?.close) || 0;
    const pools = detectLiquidity(bars, { ltp });
    const pair = pickLiquidityPair(pools, ltp);
    return {
      block: formatLiquidityTape(pools, symbol, interval, ltp),
      pools,
      pair,
      symbol,
      interval,
      ltp,
    };
  } catch (err) {
    console.warn('[Wolf AI] liquidity context failed:', err?.message || err);
    return { block: '', pools: [], pair: { bsl: null, ssl: null, px: 0 }, symbol, interval, ltp: 0 };
  }
}
