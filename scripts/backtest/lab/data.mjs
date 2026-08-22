/**
 * Loads the parked candle files once and hangs every indicator the lab needs
 * off the same arrays, so a search over thousands of configs never recomputes
 * them. Indicators run on the continuous series (an EMA does not reset at
 * 09:15) while VWAP and the opening range are anchored per session.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { atr, confirmedSwings, ema, relativeVolume, rsi, sessionVwap } from './indicators.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DATA_DIR = resolve(root, 'data', 'backtest');
export const OUT_DIR = resolve(DATA_DIR, 'lab');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istParts(ms) {
  const d = new Date(ms + IST_OFFSET_MS);
  return {
    ymd: d.toISOString().slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}

const SESSION_START = 9 * 60 + 15;
const SESSION_END = 15 * 60 + 30;

/**
 * One symbol, flattened into parallel arrays plus day boundaries.
 * Bars outside the regular session are dropped rather than repaired.
 */
function buildSymbol(name, raw, tfMinutes) {
  const bars = [];
  for (const c of raw.candles || []) {
    const t = Number(c.timestamp);
    const { ymd, minutes } = istParts(t);
    if (minutes < SESSION_START || minutes >= SESSION_END) continue;
    const o = +c.open;
    const h = +c.high;
    const l = +c.low;
    const cl = +c.close;
    if (!(o > 0 && h > 0 && l > 0 && cl > 0)) continue;
    if (h < l || h < o || h < cl || l > o || l > cl) continue;
    bars.push({ t, ymd, minutes, o, h, l, c: cl, v: +c.volume || 0 });
  }
  bars.sort((a, b) => a.t - b.t);
  // Drop duplicate timestamps, keeping the first.
  const clean = [];
  let prevT = -1;
  for (const b of bars) {
    if (b.t === prevT) continue;
    clean.push(b);
    prevT = b.t;
  }
  const n = clean.length;
  if (n < 200) return null;

  const t = new Float64Array(n);
  const o = new Float64Array(n);
  const h = new Float64Array(n);
  const l = new Float64Array(n);
  const c = new Float64Array(n);
  const v = new Float64Array(n);
  const minutes = new Int32Array(n);
  const dayStart = new Uint8Array(n);
  const barOfDay = new Int32Array(n);
  const dayIdx = new Int32Array(n);

  const days = [];
  let prevYmd = '';
  for (let i = 0; i < n; i++) {
    const b = clean[i];
    t[i] = b.t;
    o[i] = b.o;
    h[i] = b.h;
    l[i] = b.l;
    c[i] = b.c;
    v[i] = b.v;
    minutes[i] = b.minutes;
    if (b.ymd !== prevYmd) {
      dayStart[i] = 1;
      days.push({ ymd: b.ymd, from: i, to: i });
      prevYmd = b.ymd;
    } else {
      days[days.length - 1].to = i;
    }
    dayIdx[i] = days.length - 1;
    barOfDay[i] = Math.round((b.minutes - SESSION_START) / tfMinutes);
  }

  const barsPerDay = Math.round((SESSION_END - SESSION_START) / tfMinutes);

  // Previous-session levels, available from the first bar of the next day.
  const prevHigh = new Float64Array(n).fill(NaN);
  const prevLow = new Float64Array(n).fill(NaN);
  const prevClose = new Float64Array(n).fill(NaN);
  for (let d = 1; d < days.length; d++) {
    const p = days[d - 1];
    let ph = -Infinity;
    let pl = Infinity;
    for (let i = p.from; i <= p.to; i++) {
      if (h[i] > ph) ph = h[i];
      if (l[i] < pl) pl = l[i];
    }
    const pc = c[p.to];
    for (let i = days[d].from; i <= days[d].to; i++) {
      prevHigh[i] = ph;
      prevLow[i] = pl;
      prevClose[i] = pc;
    }
  }

  // Opening range, sealed once the window closes.
  const mk = (windowMin) => {
    const hi = new Float64Array(n).fill(NaN);
    const lo = new Float64Array(n).fill(NaN);
    for (const day of days) {
      let rh = -Infinity;
      let rl = Infinity;
      let sealedAt = -1;
      for (let i = day.from; i <= day.to; i++) {
        if (minutes[i] < SESSION_START + windowMin) {
          if (h[i] > rh) rh = h[i];
          if (l[i] < rl) rl = l[i];
        } else {
          if (sealedAt < 0) sealedAt = i;
          hi[i] = rh;
          lo[i] = rl;
        }
      }
    }
    return { hi, lo };
  };

  const closes = c;
  return {
    symbol: name,
    n,
    t,
    o,
    h,
    l,
    c,
    v,
    minutes,
    dayStart,
    barOfDay,
    dayIdx,
    days,
    barsPerDay,
    prevHigh,
    prevLow,
    prevClose,
    or15: mk(15),
    or30: mk(30),
    or60: mk(60),
    ema9: ema(closes, 9),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    rsi14: rsi(closes, 14),
    atr14: atr(h, l, closes, 14),
    vwap: sessionVwap(h, l, closes, v, dayStart),
    rvol: relativeVolume(v, barOfDay, barsPerDay, 10),
    swing2: confirmedSwings(h, l, 2, 2),
    swing3: confirmedSwings(h, l, 3, 3),
    swing5: confirmedSwings(h, l, 5, 5),
  };
}

/**
 * Hang the index's state off every symbol, aligned bar for bar.
 *
 * A stock breaking out while the index is rolling over is a different trade
 * from the same break with the whole market behind it, and a strategy cannot
 * tell them apart while it only ever looks at one series. `mktUp` is the
 * index's own trend at that moment; `rs` is how much the stock has outrun the
 * index since the open, which is what "relative strength" actually means.
 */
function attachMarket(universe, indexName) {
  const index = universe.find((s) => s.symbol === indexName);
  if (!index) return;

  const up = new Map();
  const idxMove = new Map();
  let dayOpen = NaN;
  for (let i = 0; i < index.n; i++) {
    if (index.dayStart[i]) dayOpen = index.o[i];
    const w = index.vwap[i];
    const e = index.ema20[i];
    const trend = Number.isFinite(w) && Number.isFinite(e) ? (index.c[i] > w && index.c[i] > e ? 1 : index.c[i] < w && index.c[i] < e ? -1 : 0) : 0;
    up.set(index.t[i], trend);
    idxMove.set(index.t[i], dayOpen > 0 ? (index.c[i] - dayOpen) / dayOpen : 0);
  }

  for (const S of universe) {
    const mktUp = new Int8Array(S.n);
    const rs = new Float64Array(S.n).fill(0);
    let open = NaN;
    for (let i = 0; i < S.n; i++) {
      if (S.dayStart[i]) open = S.o[i];
      const stamp = S.t[i];
      mktUp[i] = up.has(stamp) ? up.get(stamp) : 0;
      const move = open > 0 ? (S.c[i] - open) / open : 0;
      rs[i] = move - (idxMove.get(stamp) ?? 0);
    }
    S.mktUp = mktUp;
    S.rs = rs;
  }
}

export function loadUniverse(tf = '5m', limit = 0, indexName = 'NIFTY') {
  const tfMinutes = Number(tf.replace('m', ''));
  const suffix = `_${tf}.json`;
  if (!existsSync(DATA_DIR)) return [];
  let files = readdirSync(DATA_DIR).filter((f) => f.endsWith(suffix));
  files.sort();
  // The index has to survive the limit, otherwise the market filters go blind.
  if (limit > 0) {
    const idxFile = `${indexName}${suffix}`;
    const kept = files.slice(0, limit);
    if (files.includes(idxFile) && !kept.includes(idxFile)) kept.push(idxFile);
    files = kept;
  }
  const out = [];
  for (const f of files) {
    const raw = JSON.parse(readFileSync(resolve(DATA_DIR, f), 'utf8'));
    const built = buildSymbol(f.slice(0, -suffix.length), raw, tfMinutes);
    if (built) out.push(built);
  }
  attachMarket(out, indexName);
  return out;
}

export function allDates(universe) {
  const set = new Set();
  for (const s of universe) for (const d of s.days) set.add(d.ymd);
  return [...set].sort();
}

/**
 * Three slices by calendar date. Anything picked on `train` is checked on
 * `test`, and only what survives both is allowed near `holdout`.
 */
export function splitDates(dates, trainPct = 0.4, testPct = 0.3) {
  const a = Math.floor(dates.length * trainPct);
  const b = a + Math.floor(dates.length * testPct);
  return {
    train: new Set(dates.slice(0, a)),
    test: new Set(dates.slice(a, b)),
    holdout: new Set(dates.slice(b)),
    bounds: { trainEnd: dates[a - 1], testEnd: dates[b - 1], last: dates[dates.length - 1] },
  };
}
