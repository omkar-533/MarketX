/**
 * Market intelligence pack for Wolf AI Mentor:
 * structure · liquidity · SMC proxies · volume · MTF · detective brief.
 * Compact text for prompts + JSON card for the client UI.
 */
import { fetchOhlc } from '../market/provider.mjs';
import { fetchQuotes } from '../market/provider.mjs';
import { detectOrderBlocks } from './orderBlockEngine.mjs';

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

function equalLevels(swings, kind, tolPct = 0.0008) {
  const rows = swings.filter((s) => s.kind === kind).slice(-8);
  const pools = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i].price;
      const b = rows[j].price;
      if (Math.abs(a - b) / a <= tolPct) {
        pools.push({
          kind: kind === 'high' ? 'EQH' : 'EQL',
          price: Number(((a + b) / 2).toFixed(2)),
        });
      }
    }
  }
  const seen = new Set();
  return pools.filter((p) => {
    const k = `${p.kind}:${p.price}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);
}

function atrLike(bars, len = 14) {
  if (bars.length < len + 1) return 0;
  let sum = 0;
  for (let i = bars.length - len; i < bars.length; i += 1) {
    const prev = bars[i - 1]?.close ?? bars[i].open;
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prev),
      Math.abs(bars[i].low - prev),
    );
    sum += tr;
  }
  return sum / len;
}

function findFvgs(bars) {
  const gaps = [];
  for (let i = 2; i < bars.length; i += 1) {
    const a = bars[i - 2];
    const c = bars[i];
    if (a.high < c.low) {
      gaps.push({
        side: 'bull',
        top: c.low,
        bottom: a.high,
        barsAgo: bars.length - 1 - i,
      });
    } else if (a.low > c.high) {
      gaps.push({
        side: 'bear',
        top: a.low,
        bottom: c.high,
        barsAgo: bars.length - 1 - i,
      });
    }
  }
  return gaps.slice(-3);
}

/** Map institutional OB engine → intel tape rows (replaces simplistic displacement proxy). */
function institutionalObZones(bars, htfBias = 'neutral', timeframe = '') {
  const blocks = detectOrderBlocks(bars, {
    timeframe,
    maxBlocks: 6,
  });
  return blocks.map((o) => ({
    label: o.label,
    tone: o.tone,
    p1: o.high,
    p2: o.low,
    barsAgo: o.barsAgo,
    score: o.score,
    status: o.status,
    kinds: o.kinds,
    confirmations: o.confirmations,
    borderColor: o.borderColor,
    fillColor: o.fillColor,
  }));
}

function volumeIntel(bars) {
  const recent = bars.slice(-20);
  if (recent.length < 5) return { spike: false, weakBreakout: false, pressure: 'balanced' };
  const vols = recent.map((b) => Number(b.volume) || 0);
  const avg = vols.reduce((a, b) => a + b, 0) / vols.length || 1;
  const last = recent[recent.length - 1];
  const spike = (Number(last.volume) || 0) > avg * 1.8;
  const range = last.high - last.low || 1;
  const body = Math.abs(last.close - last.open);
  const weakBreakout = spike && body / range < 0.35;
  const up = recent.filter((b) => b.close >= b.open).length;
  const pressure = up >= 13 ? 'buying' : up <= 7 ? 'selling' : 'balanced';
  return { spike, weakBreakout, pressure, relVol: Number(((Number(last.volume) || 0) / avg).toFixed(2)) };
}

function trendStrength(swings) {
  const hh = swings.filter((s) => s.label === 'HH' || s.label === 'HL').length;
  const lh = swings.filter((s) => s.label === 'LH' || s.label === 'LL').length;
  if (hh > lh + 1) return { lean: 'bullish', score: Math.min(90, 55 + hh * 5) };
  if (lh > hh + 1) return { lean: 'bearish', score: Math.min(90, 55 + lh * 5) };
  return { lean: 'range', score: 45 };
}

function premiumDiscount(close, dayHigh, dayLow) {
  if (!(dayHigh > dayLow)) return 'mid';
  const pos = (close - dayLow) / (dayHigh - dayLow);
  if (pos >= 0.7) return 'premium';
  if (pos <= 0.3) return 'discount';
  return 'equilibrium';
}

export function pickSymbolFromMessage(message, fallback = 'NIFTY') {
  const open = /CHART OPEN BESIDE THIS CHAT:\s*([A-Z0-9:._-]+)/i.exec(String(message || ''));
  if (open?.[1]) {
    const raw = open[1].toUpperCase();
    return raw.includes(':') ? raw.split(':').pop() : raw;
  }
  if (/\bbank\s*nifty|banknifty\b/i.test(message || '')) return 'BANKNIFTY';
  if (/\bnifty\b/i.test(message || '')) return 'NIFTY';
  if (/\bbtc|bitcoin\b/i.test(message || '')) return 'BTC';
  return fallback;
}

export function pickIntervalFromMessage(message, fallback = '15m') {
  const open = /CHART OPEN BESIDE THIS CHAT:[^·\n]*·\s*([0-9A-Za-z]+)/i.exec(String(message || ''));
  if (open?.[1]) {
    const n = open[1];
    if (n === '60' || n === '1H') return '1h';
    if (n === '240' || n === '4H') return '4h';
    if (n === '1D' || n === 'D') return '1d';
    if (/^\d+$/.test(n)) return `${n}m`;
  }
  if (/\b(1h|60m|hourly)\b/i.test(message || '')) return '1h';
  if (/\b(5m|5\s*min)\b/i.test(message || '')) return '5m';
  if (/\b(15m|15\s*min)\b/i.test(message || '')) return '15m';
  return fallback;
}

async function analyzeTf(symbol, interval) {
  const data = await fetchOhlc(symbol, interval);
  const bars = Array.isArray(data?.bars) ? data.bars : [];
  if (bars.length < 20) return null;
  const recent = bars.slice(-80);
  const swings = labelSwings(recent).slice(-8);
  const last = recent[recent.length - 1];
  const events = detectEvents(swings, last.close);
  const strength = trendStrength(swings);
  const dayHigh = Math.max(...recent.slice(-40).map((b) => b.high));
  const dayLow = Math.min(...recent.slice(-40).map((b) => b.low));
  const atr = atrLike(recent);
  const atrSma = atrLike(recent.slice(0, -5).concat(recent.slice(-5)), 14) || atr;
  const vol = volumeIntel(recent);
  const pools = [...equalLevels(swings, 'high'), ...equalLevels(swings, 'low')];
  const fvgs = findFvgs(recent);
  const obs = institutionalObZones(recent, 'neutral', interval);
  const zone = premiumDiscount(last.close, dayHigh, dayLow);
  return {
    interval,
    close: last.close,
    dayHigh,
    dayLow,
    swings,
    events,
    strength,
    atr,
    atrActive: atr > atrSma * 1.05,
    vol,
    pools,
    fvgs,
    obs,
    zone,
  };
}

function processAction(tf) {
  if (!tf) return 'Wait — insufficient data';
  if (tf.zone === 'premium' && tf.strength.lean !== 'bearish') {
    return 'Wait for pullback / confirmation — price in premium';
  }
  if (tf.zone === 'discount' && tf.strength.lean !== 'bullish') {
    return 'Wait for confirmation — price in discount vs structure';
  }
  if (tf.vol.weakBreakout) return 'Treat breakout as weak — wait for acceptance';
  if (tf.events.some((e) => /CHOCH/i.test(e.label))) {
    return 'Monitor structure shift — confirmation still required';
  }
  return 'Map levels and wait for clear acceptance / rejection';
}

/**
 * Full intel for chat injection + detective UI card.
 */
export async function buildIntelPack(message, opts = {}) {
  const symbol = opts.symbol || pickSymbolFromMessage(message);
  const interval = opts.interval || pickIntervalFromMessage(message);
  try {
    const [primary, h1, d1, quotes] = await Promise.all([
      analyzeTf(symbol, interval),
      analyzeTf(symbol, '1h').catch(() => null),
      analyzeTf(symbol, '1d').catch(() => null),
      fetchQuotes([symbol], { fast: true }).catch(() => null),
    ]);
    if (!primary) {
      return { block: '', detective: null, symbol, interval };
    }

    const q = Array.isArray(quotes?.quotes) ? quotes.quotes[0] : null;
    const ltp = q?.price || primary.close;
    const confidence = Math.round(
      (primary.strength.score * 0.55 +
        (primary.atrActive ? 12 : 6) +
        (primary.events.length ? 10 : 0) +
        (primary.vol.spike ? 8 : 4) +
        (h1 ? 8 : 0)) ,
    );

    const detective = {
      symbol,
      interval,
      trend: primary.strength.lean,
      trendScore: primary.strength.score,
      liquidity:
        primary.pools.find((p) => p.kind === 'EQH')
          ? 'Buy-side liquidity near equal highs'
          : primary.pools.find((p) => p.kind === 'EQL')
            ? 'Sell-side liquidity near equal lows'
            : 'No clear equal H/L cluster',
      institutionalZone: primary.obs[0]
        ? `${primary.obs[0].p2.toFixed(1)}-${primary.obs[0].p1.toFixed(1)} (${primary.obs[0].label})`
        : primary.fvgs[0]
          ? `FVG ${primary.fvgs[0].bottom.toFixed(1)}-${primary.fvgs[0].top.toFixed(1)}`
          : `${primary.dayLow.toFixed(1)}-${primary.dayHigh.toFixed(1)} session range`,
      volatility: primary.atrActive ? 'Elevated' : 'Quiet / compressing',
      zone: primary.zone,
      bestAction: processAction(primary),
      confidence: Math.max(35, Math.min(88, confidence)),
      ltp,
      events: primary.events.map((e) => e.label),
      /** Historical structure for Wolf Mentor quizzes + chart markup */
      swings: primary.swings.slice(-8).map((s) => ({
        label: s.label,
        price: Number(s.price.toFixed(2)),
        barsAgo: s.barsAgo,
        kind: s.kind,
      })),
      eventDetails: primary.events.map((e) => ({
        label: e.label,
        price: Number(e.price.toFixed(2)),
        barsAgo: e.barsAgo,
      })),
      dayHigh: Number(primary.dayHigh.toFixed(2)),
      dayLow: Number(primary.dayLow.toFixed(2)),
      mtf: {
        daily: d1?.strength.lean || 'n/a',
        h1: h1?.strength.lean || 'n/a',
        entryTf: primary.strength.lean,
      },
      volumePressure: primary.vol.pressure,
      weakBreakout: primary.vol.weakBreakout,
    };

    const lines = [
      `MARKET INTEL TAPE (${symbol} ${interval} — process coaching only, NEVER Entry/Stop/Target/Buy/Sell):`,
      `LTP ${Number(ltp).toFixed(2)} · session H/L ${primary.dayHigh.toFixed(2)}/${primary.dayLow.toFixed(2)} · zone ${primary.zone}`,
      `Structure lean: ${primary.strength.lean} (strength ~${primary.strength.score})`,
      primary.swings.length
        ? `Swings: ${primary.swings
            .slice(-6)
            .map((s) => `${s.label} ${s.price.toFixed(2)}`)
            .join(' · ')}`
        : '',
      primary.events.length
        ? `Events: ${primary.events.map((e) => `${e.label} @ ${e.price.toFixed(2)}`).join(' · ')}`
        : '',
      primary.pools.length
        ? `Liquidity pools: ${primary.pools.map((p) => `${p.kind} ${p.price}`).join(' · ')}`
        : 'Liquidity pools: none clustered',
      primary.obs.length
        ? `Institutional OBs: ${primary.obs
            .map(
              (z) =>
                `${z.label} ${z.p2.toFixed(1)}-${z.p1.toFixed(1)} score=${z.score ?? '?'} (${z.status || 'active'})`,
            )
            .join(' · ')}`
        : 'Institutional OBs: none (no BOS-confirmed block)',
      primary.fvgs.length
        ? `FVG: ${primary.fvgs
            .map((f) => `${f.side} ${f.bottom.toFixed(1)}-${f.top.toFixed(1)}`)
            .join(' · ')}`
        : '',
      `Volume: pressure ${primary.vol.pressure}${primary.vol.spike ? ' · spike' : ''}${
        primary.vol.weakBreakout ? ' · weak breakout risk' : ''
      }`,
      `MTF: Daily ${detective.mtf.daily} · 1H ${detective.mtf.h1} · ${interval} ${detective.mtf.entryTf}`,
      `Process action: ${detective.bestAction}`,
      `Confidence (structure evidence only): ${detective.confidence}% — not a win-rate claim.`,
      'If marking the chart: use STRUCTURE labels/vlines and optional OB/FVG zones from this tape — match the user question.',
      'Scenario discipline: when analyzing, give Scenario 1 + Scenario 2 with rough probabilities that sum near 100%.',
    ].filter(Boolean);

    return { block: lines.join('\n'), detective, symbol, interval, primary };
  } catch (err) {
    console.warn('[Wolf AI] intel pack failed:', err?.message || err);
    return { block: '', detective: null, symbol, interval };
  }
}

export async function buildDetectiveOnly(symbol, interval = '15m') {
  const pack = await buildIntelPack(`CHART OPEN BESIDE THIS CHAT: ${symbol} · ${String(interval).replace(/m$/i, '')}`, {
    symbol,
    interval: interval.includes('m') || interval.includes('h') || interval.includes('d')
      ? interval
      : `${interval}m`,
  });
  return pack.detective;
}
