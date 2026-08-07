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

  function resolveBarIndex(x) {
    if (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < ctx.n) return x;
    // time value
    const t = Number(x);
    if (!isFiniteNum(t)) return ctx.barIndex;
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
        const i1 = resolveBarIndex(Number(x1) || ctx.barIndex);
        const i2 = resolveBarIndex(Number(x2) || ctx.barIndex);
        const obj = {
          __pine: 'line',
          id,
          i1,
          i2,
          y1: Number(y1),
          y2: Number(y2),
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
        o.i1 = resolveBarIndex(Number(x));
        o.y1 = Number(y);
      },
      set_xy2(ref, x, y) {
        const o = lines.get(ref?.id || ref);
        if (!o) return;
        o.i2 = resolveBarIndex(Number(x));
        o.y2 = Number(y);
      },
      set_x1(ref, x) {
        const o = lines.get(ref?.id || ref);
        if (o) o.i1 = resolveBarIndex(Number(x));
      },
      set_x2(ref, x) {
        const o = lines.get(ref?.id || ref);
        if (o) o.i2 = resolveBarIndex(Number(x));
      },
      set_y1(ref, y) {
        const o = lines.get(ref?.id || ref);
        if (o) o.y1 = Number(y);
      },
      set_y2(ref, y) {
        const o = lines.get(ref?.id || ref);
        if (o) o.y2 = Number(y);
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
        const border = namedOrPos(args, 'border_color', 4) || namedOrPos(args, 'color', 4) || 'color.blue';
        const bg = namedOrPos(args, 'bgcolor', 5) || border;
        const id = `box_${nextId++}`;
        const i1 = resolveBarIndex(Number(left) || ctx.barIndex);
        const i2 = resolveBarIndex(Number(right) || ctx.barIndex);
        const obj = {
          __pine: 'box',
          id,
          i1,
          i2,
          top: Number(top),
          bottom: Number(bottom),
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
        o.i1 = resolveBarIndex(Number(x));
        o.top = Number(y);
      },
      set_rightbottom(ref, x, y) {
        const o = boxes.get(ref?.id || ref);
        if (!o) return;
        o.i2 = resolveBarIndex(Number(x));
        o.bottom = Number(y);
      },
      set_left(ref, x) {
        const o = boxes.get(ref?.id || ref);
        if (o) o.i1 = resolveBarIndex(Number(x));
      },
      set_right(ref, x) {
        const o = boxes.get(ref?.id || ref);
        if (o) o.i2 = resolveBarIndex(Number(x));
      },
      set_top(ref, y) {
        const o = boxes.get(ref?.id || ref);
        if (o) o.top = Number(y);
      },
      set_bottom(ref, y) {
        const o = boxes.get(ref?.id || ref);
        if (o) o.bottom = Number(y);
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
        if (o) o.text = stripQuotes(String(t));
      },
      delete(ref) {
        const id = ref?.id || ref;
        boxes.delete(id);
        fifo = fifo.filter((x) => x !== id);
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
        const i1 = resolveBarIndex(Number(x) || ctx.barIndex);
        const obj = {
          __pine: 'label',
          id,
          i1,
          y: Number(y),
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
        o.i1 = resolveBarIndex(Number(x));
        o.y = Number(y);
      },
      set_x(ref, x) {
        const o = labels.get(ref?.id || ref);
        if (o) o.i1 = resolveBarIndex(Number(x));
      },
      set_y(ref, y) {
        const o = labels.get(ref?.id || ref);
        if (o) o.y = Number(y);
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
      for (const o of boxes.values()) {
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
