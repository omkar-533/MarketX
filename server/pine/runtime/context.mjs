/**
 * Series history + scopes for bar-by-bar execution.
 */

import { isFiniteNum, nan } from '../util.mjs';

export class SeriesBuf {
  constructor(cap = 512) {
    this.cap = Math.max(64, cap);
    this.data = [];
  }

  push(v) {
    this.data.push(v);
    if (this.data.length > this.cap) this.data.shift();
  }

  /** Current bar value (last). */
  cur() {
    return this.data.length ? this.data[this.data.length - 1] : nan();
  }

  /** History: [0]=current, [1]=prev … Pine-style. */
  get(offset = 0) {
    const i = this.data.length - 1 - offset;
    if (i < 0 || i >= this.data.length) return nan();
    return this.data[i];
  }

  size() {
    return this.data.length;
  }
}

export function createContext(bars, opts = {}) {
  const maxBars = Math.min(bars.length, opts.maxBars || 5000);
  const slice = bars.slice(-maxBars);
  const open = slice.map((b) => Number(b.open ?? b.o));
  const high = slice.map((b) => Number(b.high ?? b.h));
  const low = slice.map((b) => Number(b.low ?? b.l));
  const close = slice.map((b) => Number(b.close ?? b.c));
  const volume = slice.map((b) => Number(b.volume ?? b.v ?? 0));
  const time = slice.map((b) => {
    const t = b.time ?? b.t;
    if (typeof t === 'number') return t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
    return 0;
  });

  return {
    bars: slice,
    n: slice.length,
    barIndex: 0,
    open,
    high,
    low,
    close,
    volume,
    time,
    series: new Map(), // name -> SeriesBuf
    vars: new Map(), // var name -> value (persisted)
    varip: new Map(),
    locals: new Map(), // current-bar locals
    types: new Map(), // type name -> { fields, methods }
    functions: new Map(),
    inputs: { ...(opts.inputs || {}) },
    warnings: opts.warnings || [],
    drawings: null, // set by engine
    arrays: null,
    securityCache: new Map(),
    plotSeries: new Map(), // title -> number[]
    hlines: [],
    maxDrawings: opts.maxDrawings || 200,
    startedAt: opts.startedAt || Date.now(),
    timeLimitMs: opts.timeLimitMs || 5000,

    ensureSeries(name) {
      if (!this.series.has(name)) this.series.set(name, new SeriesBuf(Math.min(2048, this.n + 8)));
      return this.series.get(name);
    },

    setLocal(name, value) {
      this.locals.set(name, value);
      const buf = this.ensureSeries(name);
      // overwrite current bar slot
      if (buf.data.length === this.barIndex + 1) buf.data[buf.data.length - 1] = value;
      else {
        while (buf.data.length < this.barIndex) buf.push(nan());
        buf.push(value);
      }
    },

    getSeries(name, offset = 0) {
      if (this.locals.has(name) && offset === 0) return this.locals.get(name);
      const buf = this.series.get(name);
      if (!buf) return nan();
      return buf.get(offset);
    },

    ohlc(field) {
      const arr = this[field];
      return arr?.[this.barIndex] ?? nan();
    },

    checkTime() {
      if (Date.now() - this.startedAt > this.timeLimitMs) {
        throw new Error('Pine run exceeded time limit');
      }
    },
  };
}

export function rollBar(ctx) {
  ctx.locals.clear();
}
