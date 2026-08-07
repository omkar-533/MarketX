/**
 * line / box / label drawing pool → chart IR.
 */

import { colorToHex, isFiniteNum, namedOrPos, splitArgs, stripQuotes } from '../util.mjs';

let nextId = 1;

function toneFromColor(hex) {
  const h = String(hex || '').toLowerCase();
  if (/#(ef5350|f23645|e53935|c62828|ff5252)/.test(h)) return 'bear';
  if (/#(26a69a|089981|43a047|00c853|4caf50)/.test(h)) return 'bull';
  return 'neutral';
}

export function createDrawingPool(ctx) {
  const lines = new Map();
  const boxes = new Map();
  const labels = new Map();
  const cap = ctx.maxDrawings || 200;
  let fifo = [];

  function touch(id) {
    fifo = fifo.filter((x) => x !== id);
    fifo.push(id);
    while (fifo.length > cap) {
      const old = fifo.shift();
      lines.delete(old);
      boxes.delete(old);
      labels.delete(old);
    }
  }

  function barTime(i) {
    const idx = Math.max(0, Math.min(ctx.n - 1, Math.floor(Number(i) || 0)));
    return ctx.time[idx] || idx;
  }

  function parseCoord(raw, fallback = NaN) {
    if (raw == null || raw === '') return fallback;
    const s = String(raw).trim();
    if (!s || s === 'na' || s === 'NaN' || s === 'null' || s === 'undefined') return fallback;
    const n = Number(s);
    return isFiniteNum(n) ? n : fallback;
  }

  function resolveBarIndex(x) {
    const n = Number(x);
    if (!isFiniteNum(n)) return ctx.barIndex;
    // Bar-index style: small integers / near chart length — clamp, do NOT treat as unix time
    if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-9) {
      const i = Math.round(n);
      // Future extend (b.n+50) & past clamp
      if (i >= ctx.n) return ctx.n - 1;
      if (i < 0) return 0;
      // Prefer bar-index when magnitude looks like an index (not unix ms/s)
      if (Math.abs(i) < 1e7) return i;
    }
    // time value (unix seconds / ms)
    const t = n > 1e12 ? Math.floor(n / 1000) : n;
    let best = ctx.barIndex;
    let bestD = Infinity;
    for (let i = 0; i < ctx.n; i += 1) {
      const d = Math.abs((ctx.time[i] || i) - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  const api = {
    line: {
      new(...rawArgs) {
        const args = rawArgs.map(String);
        // Prefer named: x1,y1,x2,y2,color
        const x1 = namedOrPos(args, 'x1', 0);
        const y1 = namedOrPos(args, 'y1', 1);
        const x2 = namedOrPos(args, 'x2', 2);
        const y2 = namedOrPos(args, 'y2', 3);
        const color = namedOrPos(args, 'color', 4) || 'color.yellow';
        const id = `line_${nextId++}`;
        const cx1 = parseCoord(x1, NaN);
        const cx2 = parseCoord(x2, NaN);
        const i1 = resolveBarIndex(isFiniteNum(cx1) ? cx1 : ctx.barIndex);
        const i2 = resolveBarIndex(isFiniteNum(cx2) ? cx2 : ctx.barIndex);
        const obj = {
          __pine: 'line',
          id,
          i1,
          i2,
          y1: parseCoord(y1, NaN),
          y2: parseCoord(y2, NaN),
          color: colorToHex(color),
          extend: namedOrPos(args, 'extend', -1) || '',
          style: namedOrPos(args, 'style', -1) || '',
          width: Number(namedOrPos(args, 'width', -1) || 1),
        };
        lines.set(id, obj);
        touch(id);
        return obj;
      },
      set_xy1(ref, x, y) {
        const o = lines.get(ref?.id || ref);
        if (!o) return;
        o.i1 = resolveBarIndex(parseCoord(x, ctx.barIndex));
        o.y1 = parseCoord(y, NaN);
      },
      set_xy2(ref, x, y) {
        const o = lines.get(ref?.id || ref);
        if (!o) return;
        o.i2 = resolveBarIndex(parseCoord(x, ctx.barIndex));
        o.y2 = parseCoord(y, NaN);
      },
      set_x1(ref, x) {
        const o = lines.get(ref?.id || ref);
        if (o) o.i1 = resolveBarIndex(parseCoord(x, ctx.barIndex));
      },
      set_x2(ref, x) {
        const o = lines.get(ref?.id || ref);
        if (o) o.i2 = resolveBarIndex(parseCoord(x, ctx.barIndex));
      },
      set_y1(ref, y) {
        const o = lines.get(ref?.id || ref);
        if (o) o.y1 = parseCoord(y, NaN);
      },
      set_y2(ref, y) {
        const o = lines.get(ref?.id || ref);
        if (o) o.y2 = parseCoord(y, NaN);
      },
      set_color(ref, c) {
        const o = lines.get(ref?.id || ref);
        if (o) o.color = colorToHex(c);
      },
      delete(ref) {
        const id = ref?.id || ref;
        lines.delete(id);
        fifo = fifo.filter((x) => x !== id);
      },
      get_x1(ref) {
        return lines.get(ref?.id || ref)?.i1 ?? NaN;
      },
      get_x2(ref) {
        return lines.get(ref?.id || ref)?.i2 ?? NaN;
      },
      get_y1(ref) {
        return lines.get(ref?.id || ref)?.y1 ?? NaN;
      },
      get_y2(ref) {
        return lines.get(ref?.id || ref)?.y2 ?? NaN;
      },
    },
    box: {
      new(...rawArgs) {
        const args = rawArgs.map(String);
        const left = namedOrPos(args, 'left', 0);
        const top = namedOrPos(args, 'top', 1);
        const right = namedOrPos(args, 'right', 2);
        const bottom = namedOrPos(args, 'bottom', 3);
        const borderRaw = namedOrPos(args, 'border_color', 4) || namedOrPos(args, 'color', 4);
        const border = borderRaw && borderRaw !== 'na' && borderRaw !== 'NaN' ? borderRaw : 'color.blue';
        const bgRaw = namedOrPos(args, 'bgcolor', 5);
        const bg = bgRaw && bgRaw !== 'na' && bgRaw !== 'NaN' ? bgRaw : border;
        const id = `box_${nextId++}`;
        // Pine: box.new(na,…) creates a handle; coordinates filled later via setters.
        // Never coerce na → barIndex for x (that collapses boxes to a zero-width stub).
        const lx = parseCoord(left, NaN);
        const rx = parseCoord(right, NaN);
        const i1 = isFiniteNum(lx) ? resolveBarIndex(lx) : ctx.barIndex;
        const i2 = isFiniteNum(rx) ? resolveBarIndex(rx) : ctx.barIndex;
        const obj = {
          __pine: 'box',
          id,
          i1,
          i2,
          top: parseCoord(top, NaN),
          bottom: parseCoord(bottom, NaN),
          color: colorToHex(border),
          bgcolor: colorToHex(bg),
          text: stripQuotes(namedOrPos(args, 'text', -1) || ''),
        };
        boxes.set(id, obj);
        touch(id);
        return obj;
      },
      set_lefttop(ref, x, y) {
        const o = boxes.get(ref?.id || ref);
        if (!o) return;
        o.i1 = resolveBarIndex(parseCoord(x, ctx.barIndex));
        o.top = parseCoord(y, NaN);
      },
      set_rightbottom(ref, x, y) {
        const o = boxes.get(ref?.id || ref);
        if (!o) return;
        o.i2 = resolveBarIndex(parseCoord(x, ctx.barIndex));
        o.bottom = parseCoord(y, NaN);
      },
      set_left(ref, x) {
        const o = boxes.get(ref?.id || ref);
        if (o) o.i1 = resolveBarIndex(parseCoord(x, ctx.barIndex));
      },
      set_right(ref, x) {
        const o = boxes.get(ref?.id || ref);
        if (o) o.i2 = resolveBarIndex(parseCoord(x, ctx.barIndex));
      },
      set_top(ref, y) {
        const o = boxes.get(ref?.id || ref);
        if (o) o.top = parseCoord(y, NaN);
      },
      set_bottom(ref, y) {
        const o = boxes.get(ref?.id || ref);
        if (o) o.bottom = parseCoord(y, NaN);
      },
      set_bgcolor(ref, c) {
        const o = boxes.get(ref?.id || ref);
        if (o) o.bgcolor = colorToHex(c);
      },
      set_border_color(ref, c) {
        const o = boxes.get(ref?.id || ref);
        if (o) o.color = colorToHex(c);
      },
      set_text(ref, t) {
        const o = boxes.get(ref?.id || ref);
        if (o) o.text = stripQuotes(String(t ?? ''));
      },
      set_text_size() {
        /* visual-only */
      },
      set_text_halign() {
        /* visual-only */
      },
      set_text_color(ref, c) {
        const o = boxes.get(ref?.id || ref);
        if (o && c != null) o.color = colorToHex(c);
      },
      delete(ref) {
        const id = ref?.id || ref;
        boxes.delete(id);
        fifo = fifo.filter((x) => x !== id);
      },
      get_left(ref) {
        return boxes.get(ref?.id || ref)?.i1 ?? NaN;
      },
      get_right(ref) {
        return boxes.get(ref?.id || ref)?.i2 ?? NaN;
      },
      get_top(ref) {
        return boxes.get(ref?.id || ref)?.top ?? NaN;
      },
      get_bottom(ref) {
        return boxes.get(ref?.id || ref)?.bottom ?? NaN;
      },
    },
    label: {
      new(...rawArgs) {
        const args = rawArgs.map(String);
        const x = namedOrPos(args, 'x', 0);
        const y = namedOrPos(args, 'y', 1);
        const text = stripQuotes(namedOrPos(args, 'text', 2) || '');
        const color = namedOrPos(args, 'color', 3) || 'color.blue';
        const id = `label_${nextId++}`;
        const cx = parseCoord(x, NaN);
        const i1 = isFiniteNum(cx) ? resolveBarIndex(cx) : ctx.barIndex;
        const obj = {
          __pine: 'label',
          id,
          i1,
          y: parseCoord(y, NaN),
          text,
          color: colorToHex(color),
          style: namedOrPos(args, 'style', -1) || '',
        };
        labels.set(id, obj);
        touch(id);
        return obj;
      },
      set_xy(ref, x, y) {
        const o = labels.get(ref?.id || ref);
        if (!o) return;
        o.i1 = resolveBarIndex(parseCoord(x, ctx.barIndex));
        o.y = parseCoord(y, NaN);
      },
      set_x(ref, x) {
        const o = labels.get(ref?.id || ref);
        if (o) o.i1 = resolveBarIndex(parseCoord(x, ctx.barIndex));
      },
      set_y(ref, y) {
        const o = labels.get(ref?.id || ref);
        if (o) o.y = parseCoord(y, NaN);
      },
      set_text(ref, t) {
        const o = labels.get(ref?.id || ref);
        if (o) o.text = stripQuotes(String(t));
      },
      set_color(ref, c) {
        const o = labels.get(ref?.id || ref);
        if (o) o.color = colorToHex(c);
      },
      delete(ref) {
        const id = ref?.id || ref;
        labels.delete(id);
        fifo = fifo.filter((x) => x !== id);
      },
    },
    table: {
      new() {
        return { __pine: 'table', id: `table_${nextId++}`, cells: {} };
      },
      cell() {
        return null;
      },
      merge_cells() {
        return null;
      },
      cell_set_text_color() {
        return null;
      },
      cell_set_bgcolor() {
        return null;
      },
      cell_set_text() {
        return null;
      },
      clear() {
        return null;
      },
      delete() {
        return null;
      },
    },
    toIR() {
      const drawings = [];
      for (const o of lines.values()) {
        if (!isFiniteNum(o.y1) && !isFiniteNum(o.y2)) continue;
        const flat =
          isFiniteNum(o.y1) && isFiniteNum(o.y2) && Math.abs(o.y1 - o.y2) < 1e-9 * Math.max(1, Math.abs(o.y1));
        const extendRight = /right/i.test(String(o.extend || ''));
        // Horizontal + extend.right → hray (TV liquidity / BOS style); else trend.
        if (flat || extendRight) {
          drawings.push({
            type: 'hray',
            tone: toneFromColor(o.color),
            label: '',
            p1: isFiniteNum(o.y1) ? o.y1 : o.y2,
            p2: isFiniteNum(o.y1) ? o.y1 : o.y2,
            i1: o.i1,
            i2: o.i2,
            color: o.color,
            lineStyle: /dash|dot/i.test(String(o.style || '')) ? 'dotted' : 'solid',
          });
        } else {
          drawings.push({
            type: 'trend',
            tone: toneFromColor(o.color),
            label: '',
            p1: o.y1,
            p2: o.y2,
            i1: o.i1,
            i2: o.i2,
            color: o.color,
          });
        }
      }
      for (const o of boxes.values()) {
        if (!isFiniteNum(o.top) || !isFiniteNum(o.bottom)) continue;
        drawings.push({
          type: 'zone',
          tone: toneFromColor(o.bgcolor || o.color),
          label: o.text || '',
          p1: o.top,
          p2: o.bottom,
          i1: Math.min(o.i1, o.i2),
          i2: Math.max(o.i1, o.i2),
          color: o.color,
          borderColor: o.color,
          fillColor: o.bgcolor,
          bgcolor: o.bgcolor,
        });
      }
      for (const o of labels.values()) {
        if (!isFiniteNum(o.y)) continue;
        drawings.push({
          type: 'label',
          tone: toneFromColor(o.color),
          label: o.text || '',
          p1: o.y,
          p2: o.y,
          i1: o.i1,
          i2: o.i1,
          color: o.color,
        });
      }
      return drawings;
    },
    lines,
    boxes,
    labels,
  };

  ctx.drawings = api;
  return api;
}

export function callDrawing(ctx, ns, method, args) {
  const pool = ctx.drawings;
  if (!pool?.[ns]?.[method]) {
    // Silent stubs for table UI helpers
    if (ns === 'table') return null;
    if (ctx.warnings.length < 40) ctx.warnings.push(`${ns}.${method} not implemented`);
    return null;
  }
  return pool[ns][method](...args);
}

/** Parse call like box.new(...) from raw arg strings after eval. */
export function parseDrawingCallArgs(rawInside) {
  return splitArgs(rawInside);
}
