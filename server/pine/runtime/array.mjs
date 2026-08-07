/**
 * Pine array.* runtime (subset used by SMC-style scripts).
 * Supports both array.fn(id, …) and instance id.fn(…).
 */

import { isFiniteNum, nan } from '../util.mjs';

let nextId = 1;

export function createArrayRuntime(ctx) {
  const store = new Map();

  function make(type, initial = []) {
    const id = `arr_${nextId++}`;
    const obj = {
      __pine: 'array',
      id,
      type,
      data: Array.isArray(initial) ? initial.slice() : [],
    };
    store.set(id, obj);
    return obj;
  }

  function resolve(ref) {
    if (!ref) return null;
    if (ref.__pine === 'array') return ref;
    if (typeof ref === 'string' && store.has(ref)) return store.get(ref);
    return null;
  }

  const api = {
    new(size = 0, init = nan()) {
      return api.new_float(size, init);
    },
    new_float(size = 0, init = nan()) {
      const n = Math.max(0, Math.floor(Number(size) || 0));
      return make('float', Array(n).fill(Number(init)));
    },
    new_int(size = 0, init = 0) {
      const n = Math.max(0, Math.floor(Number(size) || 0));
      return make('int', Array(n).fill(Math.floor(Number(init) || 0)));
    },
    new_bool(size = 0, init = false) {
      const n = Math.max(0, Math.floor(Number(size) || 0));
      return make('bool', Array(n).fill(!!init));
    },
    new_string(size = 0, init = '') {
      const n = Math.max(0, Math.floor(Number(size) || 0));
      return make('string', Array(n).fill(String(init ?? '')));
    },
    new_line(size = 0) {
      return make('line', Array(Math.max(0, Math.floor(Number(size) || 0))).fill(null));
    },
    new_box(size = 0) {
      return make('box', Array(Math.max(0, Math.floor(Number(size) || 0))).fill(null));
    },
    new_label(size = 0) {
      return make('label', Array(Math.max(0, Math.floor(Number(size) || 0))).fill(null));
    },
    from(...vals) {
      return make('mixed', vals);
    },
    push(ref, v) {
      const a = resolve(ref);
      if (!a) return 0;
      a.data.push(v);
      return a.data.length;
    },
    unshift(ref, v) {
      const a = resolve(ref);
      if (!a) return 0;
      a.data.unshift(v);
      return a.data.length;
    },
    insert(ref, idx, v) {
      const a = resolve(ref);
      if (!a) return;
      const i = Math.max(0, Math.floor(Number(idx) || 0));
      a.data.splice(i, 0, v);
    },
    get(ref, idx) {
      const a = resolve(ref);
      if (!a) return nan();
      const i = Math.floor(Number(idx));
      if (i < 0 || i >= a.data.length) return nan();
      return a.data[i];
    },
    set(ref, idx, v) {
      const a = resolve(ref);
      if (!a) return;
      const i = Math.floor(Number(idx));
      if (i < 0) return;
      while (a.data.length <= i) a.data.push(nan());
      a.data[i] = v;
    },
    size(ref) {
      const a = resolve(ref);
      return a ? a.data.length : 0;
    },
    clear(ref) {
      const a = resolve(ref);
      if (a) a.data.length = 0;
    },
    pop(ref) {
      const a = resolve(ref);
      if (!a || !a.data.length) return nan();
      return a.data.pop();
    },
    shift(ref) {
      const a = resolve(ref);
      if (!a || !a.data.length) return nan();
      return a.data.shift();
    },
    remove(ref, idx) {
      const a = resolve(ref);
      if (!a) return nan();
      const i = Math.floor(Number(idx));
      if (i < 0 || i >= a.data.length) return nan();
      return a.data.splice(i, 1)[0];
    },
    includes(ref, v) {
      const a = resolve(ref);
      return a ? a.data.includes(v) : false;
    },
    first(ref) {
      return api.get(ref, 0);
    },
    last(ref) {
      const a = resolve(ref);
      if (!a || !a.data.length) return nan();
      return a.data[a.data.length - 1];
    },
    indexof(ref, v) {
      const a = resolve(ref);
      if (!a) return -1;
      return a.data.indexOf(v);
    },
    reverse(ref) {
      const a = resolve(ref);
      if (!a) return null;
      a.data.reverse();
      return a;
    },
    copy(ref) {
      const a = resolve(ref);
      if (!a) return make('mixed', []);
      return make(a.type, a.data.slice());
    },
    avg(ref) {
      const a = resolve(ref);
      if (!a || !a.data.length) return nan();
      let s = 0;
      let n = 0;
      for (const v of a.data) {
        if (isFiniteNum(v)) {
          s += v;
          n += 1;
        }
      }
      return n ? s / n : nan();
    },
    sum(ref) {
      const a = resolve(ref);
      if (!a) return nan();
      let s = 0;
      for (const v of a.data) if (isFiniteNum(v)) s += v;
      return s;
    },
    max(ref) {
      const a = resolve(ref);
      if (!a || !a.data.length) return nan();
      let m = -Infinity;
      for (const v of a.data) if (isFiniteNum(v) && v > m) m = v;
      return m === -Infinity ? nan() : m;
    },
    min(ref) {
      const a = resolve(ref);
      if (!a || !a.data.length) return nan();
      let m = Infinity;
      for (const v of a.data) if (isFiniteNum(v) && v < m) m = v;
      return m === Infinity ? nan() : m;
    },
    resolve,
    store,
  };

  ctx.arrays = api;
  return api;
}

export function callArray(ctx, name, args) {
  const api = ctx.arrays;
  if (!api) return null;
  // array.new<float>() already stripped to array.new
  let fnName = name;
  if (fnName === 'new_float' || fnName === 'new_int' || fnName === 'new_bool' || fnName === 'new_string') {
    /* keep */
  } else if (fnName.startsWith('new_')) {
    // array.new_line etc.
  }
  const fn = api[fnName];
  if (typeof fn !== 'function') {
    if (ctx.warnings.length < 40) ctx.warnings.push(`array.${name} not implemented`);
    return null;
  }
  return fn(...args);
}
