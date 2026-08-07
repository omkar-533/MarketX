/**
 * Wolf Pine bar-by-bar driver + expression evaluator.
 */

import { detectVersion, isFiniteNum, nan, nz, parseInputDefaults, splitArgs, stripQuotes, colorToHex, hexToRgb, rgbToHex, namedOrPos } from './util.mjs';
import { parseProgram } from './parser.mjs';
import { createContext, rollBar } from './runtime/context.mjs';
import { callTa } from './runtime/ta.mjs';
import { createArrayRuntime, callArray } from './runtime/array.mjs';
import { createDrawingPool, callDrawing } from './runtime/drawings.mjs';
import { requestSecurity } from './runtime/security.mjs';

const MAX_WARN = 40;

function warn(ctx, msg) {
  if (ctx.warnings.length >= MAX_WARN) return;
  if (!ctx.warnings.includes(msg)) ctx.warnings.push(msg);
}

function truthy(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
  if (v == null) return false;
  if (typeof v === 'object') return true;
  if (typeof v === 'string') return v.length > 0 && v !== 'na' && v !== 'false';
  return !!v;
}

/** True only for a complete quoted string token — not `"a" + "b"`. */
function isStringLiteral(expr) {
  const s = String(expr || '').trim();
  if (s.length < 2) return false;
  const q = s[0];
  if (q !== '"' && q !== "'") return false;
  let i = 1;
  while (i < s.length) {
    if (s[i] === '\\') {
      i += 2;
      continue;
    }
    if (s[i] === q) return i === s.length - 1;
    i += 1;
  }
  return false;
}

function resolveIdent(ctx, name) {
  if (name === 'close') return ctx.ohlc('close');
  if (name === 'open') return ctx.ohlc('open');
  if (name === 'high') return ctx.ohlc('high');
  if (name === 'low') return ctx.ohlc('low');
  if (name === 'volume') return ctx.ohlc('volume');
  if (name === 'time') return ctx.time[ctx.barIndex] ?? ctx.barIndex;
  if (name === 'bar_index') return ctx.barIndex;
  if (name === 'last_bar_index') return ctx.n - 1;
  if (name === 'hl2') return (ctx.ohlc('high') + ctx.ohlc('low')) / 2;
  if (name === 'hlc3') return (ctx.ohlc('high') + ctx.ohlc('low') + ctx.ohlc('close')) / 3;
  if (name === 'ohlc4') {
    return (ctx.ohlc('open') + ctx.ohlc('high') + ctx.ohlc('low') + ctx.ohlc('close')) / 4;
  }
  if (name === 'true') return true;
  if (name === 'false') return false;
  if (name === 'na' || name === 'na') return nan();
  if (name === 'syminfo.tickerid' || name === 'syminfo.ticker') return 'CHART';
  if (name === 'timeframe.period') return 'chart';

  // barstate.* — critical for SMC last-bar zones / first-bar OB pools
  if (name === 'barstate.islast') return ctx.barIndex === ctx.n - 1;
  if (name === 'barstate.isfirst') return ctx.barIndex === 0;
  if (name === 'barstate.ishistory') return ctx.barIndex < ctx.n - 1;
  if (name === 'barstate.isrealtime') return false;
  if (name === 'barstate.isnew') return true;
  if (name === 'barstate.isconfirmed') return true;
  if (name === 'barstate.islastconfirmedhistory') return ctx.barIndex === ctx.n - 1;

  if (ctx.inputs[name] !== undefined) {
    const v = ctx.inputs[name];
    if (typeof v === 'string' && /^(open|high|low|close|hl2|hlc3|ohlc4|volume)$/i.test(v)) {
      return resolveIdent(ctx, v.toLowerCase());
    }
    return v;
  }
  if (ctx.locals.has(name)) return ctx.locals.get(name);
  if (ctx.vars.has(name)) return ctx.vars.get(name);
  if (ctx.varip.has(name)) return ctx.varip.get(name);
  // Functions/methods swap vars — still resolve script-level globals (phl, b, …)
  if (ctx.globalVars?.has(name)) return ctx.globalVars.get(name);
  if (ctx.globalVarip?.has(name)) return ctx.globalVarip.get(name);
  return ctx.getSeries(name, 0);
}

function getProp(obj, key) {
  if (obj == null) return nan();
  if (typeof obj === 'object' && key in obj) return obj[key];
  return nan();
}

function setProp(obj, key, val) {
  if (obj && typeof obj === 'object' && obj.__pine === 'udt') {
    obj[key] = val;
    return true;
  }
  return false;
}

/**
 * Evaluate a Pine-like expression at current bar.
 */
export function evalExpr(ctx, exprRaw) {
  let expr = String(exprRaw || '').trim();
  if (!expr) return nan();

  // color literals
  if (/^color\.\w+$/i.test(expr) || /^#[0-9a-fA-F]{6,8}$/.test(expr)) {
    return colorToHex(expr);
  }
  // Only a true single string token — NOT greedy /^".*"$/ which eats `"a" + "b"`.
  if (isStringLiteral(expr)) return stripQuotes(expr);

  // Comma sequence: f(), g(), h()  (depth-aware)
  {
    const parts = splitTop(expr, [',']);
    if (parts.length > 1) {
      // Avoid treating single call-with-args as sequence — if whole looks like one call, keep going
      const asCall = parseCall(expr);
      if (!asCall) {
        let last = null;
        for (const p of parts) last = evalExpr(ctx, p);
        return last;
      }
    }
  }

  // Array / tuple literals
  if (expr.startsWith('[') && expr.endsWith(']')) {
    const inner = expr.slice(1, -1).trim();
    return splitArgs(inner).map((a) => evalExpr(ctx, a));
  }

  // Ternary
  const q = findTernary(expr);
  if (q) {
    return truthy(evalExpr(ctx, q.cond)) ? evalExpr(ctx, q.then) : evalExpr(ctx, q.else);
  }

  // Logical or / and
  {
    const parts = splitTop(expr, [' or ', '||']);
    if (parts.length > 1) {
      for (const p of parts) if (truthy(evalExpr(ctx, p))) return true;
      return false;
    }
  }
  {
    const parts = splitTop(expr, [' and ', '&&']);
    if (parts.length > 1) {
      for (const p of parts) if (!truthy(evalExpr(ctx, p))) return false;
      return true;
    }
  }

  // Calls BEFORE comparisons — otherwise array.new<float>() is parsed as `<`/`>`
  // Also normalize whitespace around `.` so `draw.mL .eL(` parses as a call.
  {
    const normalized = expr.replace(/\s*\.\s*/g, '.');
    const call = parseCall(normalized);
    if (call) return evalCall(ctx, call.callee, call.args);
  }

  // Comparisons
  for (const op of ['==', '!=', '>=', '<=', '>', '<']) {
    const parts = splitTop(expr, [op]);
    if (parts.length === 2) {
      // Skip if looks like leftover generic (e.g. float>() )
      if (/^[A-Za-z_][\w]*\s*\(/.test(parts[1]) && parts[0].includes('.')) {
        /* allow normal compare */
      }
      const a = evalExpr(ctx, parts[0]);
      const b = evalExpr(ctx, parts[1]);
      if (op === '==') return a === b || (Number(a) === Number(b) && isFiniteNum(Number(a)));
      if (op === '!=') return a !== b && Number(a) !== Number(b);
      const an = Number(a);
      const bn = Number(b);
      if (!isFiniteNum(an) || !isFiniteNum(bn)) return false;
      if (op === '>=') return an >= bn;
      if (op === '<=') return an <= bn;
      if (op === '>') return an > bn;
      if (op === '<') return an < bn;
    }
  }

  // + -
  {
    const parts = splitTopBinary(expr, ['+', '-']);
    if (parts) {
      let acc = evalExpr(ctx, parts[0].term);
      for (let i = 1; i < parts.length; i += 1) {
        const v = evalExpr(ctx, parts[i].term);
        if (parts[i].op === '+') {
          if (typeof acc === 'string' || typeof v === 'string') acc = String(acc) + String(v);
          else acc = Number(acc) + Number(v);
        } else acc = Number(acc) - Number(v);
      }
      return acc;
    }
  }

  // * / %
  {
    const parts = splitTopBinary(expr, ['*', '/', '%']);
    if (parts) {
      let acc = Number(evalExpr(ctx, parts[0].term));
      for (let i = 1; i < parts.length; i += 1) {
        const v = Number(evalExpr(ctx, parts[i].term));
        if (parts[i].op === '*') acc *= v;
        else if (parts[i].op === '/') acc = v === 0 ? nan() : acc / v;
        else acc = acc % v;
      }
      return acc;
    }
  }

  // Unary
  if (expr.startsWith('not ') || expr.startsWith('!')) {
    const rest = expr.startsWith('not ') ? expr.slice(4) : expr.slice(1);
    return !truthy(evalExpr(ctx, rest));
  }
  if (expr.startsWith('-') && !/^-?\d/.test(expr)) {
    return -Number(evalExpr(ctx, expr.slice(1)));
  }

  // Parens
  if (expr.startsWith('(') && expr.endsWith(')')) {
    if (balanced(expr.slice(1, -1))) return evalExpr(ctx, expr.slice(1, -1));
  }

  // History: foo[n] / obj.field[n] (allow whitespace before bracket)
  {
    const hm = /^(.+?)\s*\[\s*(.+)\s*\]$/.exec(expr);
    if (hm && balanced(hm[1]) !== false) {
      const off = Math.max(0, Math.floor(Number(evalExpr(ctx, hm[2])) || 0));
      const base = hm[1].trim();
      if (/^(open|high|low|close|volume)$/i.test(base)) {
        const arr = ctx[base.toLowerCase()];
        const i = ctx.barIndex - off;
        return i >= 0 ? arr[i] : nan();
      }
      if (base === 'bar_index' || base === 'n') {
        return base === 'n' && ctx.locals.has('n')
          ? Number(ctx.locals.get('n')) - off
          : ctx.barIndex - off;
      }
      // b.c[n] / b.h[n] aliases
      const bm = /^b\.(c|o|h|l|v|t|n)$/i.exec(base);
      if (bm) {
        const key =
          bm[1].toLowerCase() === 'c'
            ? 'close'
            : bm[1].toLowerCase() === 'o'
              ? 'open'
              : bm[1].toLowerCase() === 'h'
                ? 'high'
                : bm[1].toLowerCase() === 'l'
                  ? 'low'
                  : bm[1].toLowerCase() === 'v'
                    ? 'volume'
                    : bm[1].toLowerCase() === 't'
                      ? 'time'
                      : 'bar_index';
        if (key === 'bar_index') return ctx.barIndex - off;
        const arr = key === 'time' ? ctx.time : ctx[key];
        const i = ctx.barIndex - off;
        return i >= 0 && arr ? arr[i] : nan();
      }
      // obj.field[n]
      if (base.includes('.')) {
        return ctx.getSeries(base, off);
      }
      if (/^[A-Za-z_][\w]*$/.test(base)) {
        if (ctx.locals.has(base) && off === 0) return ctx.locals.get(base);
        const v0 = resolveIdent(ctx, base);
        if (off === 0) return v0;
        return ctx.getSeries(base, off);
      }
    }
  }

  // Function / method calls (also handled early above; keep for nested after history)
  {
    const call = parseCall(expr);
    if (call) return evalCall(ctx, call.callee, call.args);
  }

  // Member access obj.field / nested obj.a.b (not call)
  {
    if (/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)+$/.test(expr) && !expr.includes('(')) {
      const parts = expr.split('.');
      // Enum-like namespaces
      if (parts[0] === 'color') {
        if (parts[1] === 't' || parts[1] === 'r' || parts[1] === 'g' || parts[1] === 'b') return 0;
        return colorToHex(`color.${parts[1]}`);
      }
      if (parts[0] === 'line' && parts[1]?.startsWith('style_')) return parts[1];
      if (parts[0] === 'extend') return parts[1];
      if (parts[0] === 'xloc' || parts[0] === 'yloc') return parts[1];
      if (parts[0] === 'size') return parts[1];
      if (parts[0] === 'label' && parts[1]?.startsWith('style_')) return parts[1];
      if (parts[0] === 'shape' || parts[0] === 'location' || parts[0] === 'display') return parts[1];
      if (parts[0] === 'format' || parts[0] === 'barmerge') return parts[1];
      if (parts[0] === 'position') return parts[1];
      if (parts[0] === 'text') return parts[1];
      if (parts[0] === 'font') return parts[1];
      if (parts[0] === 'chart') return parts[1] === 'bg_color' ? '#0b0e17' : '#e2e8f0';
      if (parts[0] === 'hline' && parts[1]?.startsWith('style_')) return parts[1];
      if (parts[0] === 'barstate') {
        return resolveIdent(ctx, `barstate.${parts[1]}`);
      }

      let cur = resolveIdent(ctx, parts[0]);
      for (let i = 1; i < parts.length; i += 1) {
        if (cur && typeof cur === 'object') {
          if (cur.__pine === 'array' && parts[i] === 'size') {
            cur = cur.data.length;
            continue;
          }
          cur = getProp(cur, parts[i]);
        } else {
          cur = nan();
          break;
        }
      }
      return cur;
    }
  }

  // Number
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(expr)) return Number(expr);

  // Identifier
  if (/^[A-Za-z_][\w.]*$/.test(expr)) {
    // dotted color / enums already handled; try nested resolve
    if (expr.includes('.')) {
      const [a, b] = expr.split('.');
      const obj = resolveIdent(ctx, a);
      if (obj && typeof obj === 'object') return getProp(obj, b);
    }
    return resolveIdent(ctx, expr);
  }

  // Skip dangling option fragments from imperfect switch/input parse
  if (/^=\s*/.test(expr)) return stripQuotes(expr.replace(/^=\s*/, '')) || nan();

  warn(ctx, `Could not evaluate: ${expr.slice(0, 80)}`);
  return nan();
}

function balanced(s) {
  let d = 0;
  let q = '';
  for (const ch of s) {
    if (q) {
      if (ch === q) q = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      continue;
    }
    if (ch === '(') d += 1;
    if (ch === ')') d -= 1;
    if (d < 0) return false;
  }
  return d === 0;
}

function findTernary(expr) {
  let depth = 0;
  let q = '';
  let qPos = -1;
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (q) {
      if (ch === q) q = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === '?' && depth === 0) qPos = i;
    else if (ch === ':' && depth === 0 && qPos >= 0) {
      return {
        cond: expr.slice(0, qPos).trim(),
        then: expr.slice(qPos + 1, i).trim(),
        else: expr.slice(i + 1).trim(),
      };
    }
  }
  return null;
}

function splitTop(expr, seps) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let quote = '';
  const s = expr;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[') {
      depth += 1;
      cur += ch;
      continue;
    }
    if (ch === ')' || ch === ']') {
      depth -= 1;
      cur += ch;
      continue;
    }
    if (depth === 0) {
      let hit = null;
      for (const sep of seps) {
        if (s.slice(i, i + sep.length).toLowerCase() === sep.toLowerCase()) {
          hit = sep;
          break;
        }
      }
      if (hit) {
        parts.push(cur.trim());
        cur = '';
        i += hit.length - 1;
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function splitTopBinary(expr, ops) {
  // Find leftmost op at depth 0 (left-associative rebuild)
  const tokens = [];
  let cur = '';
  let depth = 0;
  let quote = '';
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[') {
      depth += 1;
      cur += ch;
      continue;
    }
    if (ch === ')' || ch === ']') {
      depth -= 1;
      cur += ch;
      continue;
    }
    if (depth === 0 && ops.includes(ch)) {
      // don't split unary minus at start of term
      if (ch === '-' || ch === '+') {
        const prev = cur.trim();
        if (!prev) {
          cur += ch;
          continue;
        }
      }
      tokens.push({ term: cur.trim(), op: null });
      tokens.push({ term: null, op: ch });
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (!tokens.length) return null;
  tokens.push({ term: cur.trim(), op: null });
  if (tokens.length < 3) return null;
  const parts = [{ term: tokens[0].term, op: null }];
  for (let i = 1; i < tokens.length; i += 2) {
    parts.push({ op: tokens[i].op, term: tokens[i + 1]?.term });
  }
  return parts;
}

function parseCall(expr) {
  const m = /^([\w.]+(?:<[^>]+>)?)\s*\((.*)\)\s*$/s.exec(expr);
  if (!m) return null;
  if (!balanced(m[2])) return null;
  const callee = m[1].replace(/<[^>]+>/g, '');
  return { callee, args: splitArgs(m[2]) };
}

function evalArgList(ctx, args) {
  return args.map((a) => {
    const named = /^\s*(\w+)\s*=\s*(.+)$/s.exec(a);
    if (named) return evalExpr(ctx, named[2]);
    return evalExpr(ctx, a);
  });
}

function evalCall(ctx, callee, argStrs) {
  const name = String(callee);
  const args = evalArgList(ctx, argStrs);

  // math.*
  if (name.startsWith('math.')) {
    const fn = name.slice(5);
    const a = Number(args[0]);
    const b = Number(args[1]);
    if (fn === 'abs') return Math.abs(a);
    if (fn === 'max') return Math.max(a, b);
    if (fn === 'min') return Math.min(a, b);
    if (fn === 'sqrt') return Math.sqrt(a);
    if (fn === 'log') return Math.log(a);
    if (fn === 'pow') return Math.pow(a, b);
    if (fn === 'round') {
      const d = Number(args[1]);
      if (Number.isFinite(d) && d > 0) {
        const f = 10 ** Math.min(8, Math.floor(d));
        return Math.round(a * f) / f;
      }
      return Math.round(a);
    }
    if (fn === 'floor') return Math.floor(a);
    if (fn === 'ceil') return Math.ceil(a);
    if (fn === 'sign') return Math.sign(a);
    if (fn === 'avg') return (a + b) / 2;
    warn(ctx, `math.${fn} stub`);
    return a;
  }

  // str.*
  if (name.startsWith('str.')) {
    const fn = name.slice(4);
    if (fn === 'tostring') {
      const v = args[0];
      const fmt = String(args[1] ?? '').toLowerCase();
      if (fmt.includes('volume')) {
        const n = Number(v);
        if (!Number.isFinite(n)) return '0';
        const a = Math.abs(n);
        if (a >= 1e9) return `${(n / 1e9).toFixed(3)}B`;
        if (a >= 1e6) return `${(n / 1e6).toFixed(3)}M`;
        if (a >= 1e3) return `${(n / 1e3).toFixed(3)}K`;
        return String(Math.round(n));
      }
      return String(v ?? '');
    }
    if (fn === 'format') return String(args[0] ?? '');
    return String(args[0] ?? '');
  }

  // ta.* — keep series paths as strings so history (crossover / pivots) works.
  if (name.startsWith('ta.')) {
    const taArgs = argStrs.map((raw, i) => {
      const named = /^\s*\w+\s*=\s*(.+)$/s.exec(raw);
      const e = (named ? named[1] : raw).trim();
      if (/^(open|high|low|close|volume|hl2|hlc3|ohlc4)$/i.test(e)) return e.toLowerCase();
      // `b.c`, `up.p.first()` stays evaluated; plain / dotted series ids stay strings.
      if (/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/.test(e) && !e.includes('(')) return e;
      return args[i];
    });
    return callTa(ctx, name.slice(3), taArgs);
  }

  // array.*
  if (name.startsWith('array.')) {
    return callArray(ctx, name.slice(6), args);
  }

  // line/box/label/table
  for (const ns of ['line', 'box', 'label', 'table']) {
    if (name === `${ns}.new`) return callDrawing(ctx, ns, 'new', mapDrawingArgs(ctx, ns, argStrs, args));
    if (name.startsWith(`${ns}.`)) {
      return callDrawing(ctx, ns, name.slice(ns.length + 1), args);
    }
  }

  // color.t(…) transparency helper / color.new / color.rgb
  if (name === 'color.new') {
    // Preserve base color; transparency is visual-only for IR (fill still maps)
    const base = args[0] != null ? String(args[0]) : String(argStrs[0] || 'color.yellow');
    return colorToHex(base.replace(/^\s*color\.new\s*\(\s*/i, '').split(',')[0] || base);
  }
  if (name === 'color.rgb') {
    return rgbToHex(args[0], args[1], args[2]);
  }
  if (name === 'color.r' || name === 'color.g' || name === 'color.b' || name === 'color.t') {
    const rgb = hexToRgb(args[0]);
    if (name === 'color.r') return rgb.r;
    if (name === 'color.g') return rgb.g;
    if (name === 'color.b') return rgb.b;
    return Number(args[1]) || 0;
  }

  // request.security — tf may be a variable (fvg_tf); expr stays raw when it's a call
  if (name === 'request.security') {
    const ticker = args[0];
    let tfRaw = namedOrPos(argStrs, 'timeframe', 1) || namedOrPos(argStrs, 'resolution', 1) || argStrs[1] || '';
    tfRaw = String(tfRaw).replace(/^\s*\w+\s*=\s*/, '').trim();
    let tf = stripQuotes(tfRaw);
    // Resolve identifier timeframe vars
    if (tf && /^[A-Za-z_][\w]*$/.test(tf) && !/^\d/.test(tf)) {
      const resolved = evalExpr(ctx, tf);
      if (resolved != null && resolved !== '' && (typeof resolved === 'string' || typeof resolved === 'number')) {
        tf = String(resolved);
      }
    }
    if (!tf || tf === 'undefined' || tf === 'na' || tf === 'NaN' || tf === 'null') tf = '';
    if (tf === 'nan' || !Number.isNaN(Number(tf)) && Number.isNaN(Number(tf))) tf = '';
    // NaN from unresolved var
    if (typeof args[1] === 'number' && Number.isNaN(args[1])) tf = '';
    const exprRaw = argStrs[2]
      ? stripQuotes(String(argStrs[2]).replace(/^\s*\w+\s*=\s*/, ''))
      : 'close';
    return requestSecurity(ctx, ticker, tf, exprRaw);
  }

  // input.* — resolved from parsed defaults / overrides
  if (name.startsWith('input.')) {
    // When called as RHS of `len = input.int(...)`, caller assigns; return default from first arg
    const first = args[0];
    if (name.includes('bool')) return truthy(first);
    if (name.includes('int') || name.includes('float')) return Number(first);
    return first;
  }

  // nz / na helpers
  if (name === 'nz') return nz(args[0], args[1] ?? 0);
  if (name === 'na') {
    if (!args.length) return nan();
    const v = args[0];
    if (v == null) return true;
    if (typeof v === 'number') return !Number.isFinite(v);
    return false;
  }
  if (name === 'alertcondition' || name === 'alert') return null;
  if (name === 'timeframe.change' || name === 'timeframe.isintraday') return false;
  if (name === 'barcolor') return null;
  if (name === 'input') return args[0];
  if (name === 'fix') return !!args[0];
  if (name === 'int') return Math.floor(Number(args[0]) || 0);
  if (name === 'float') return Number(args[0]);
  if (name === 'bool') return truthy(args[0]);
  if (name === 'timestamp') return Number(args[0]) || 0;

  // table.* stubs — never crash
  if (name.startsWith('table.')) {
    if (name === 'table.new') return callDrawing(ctx, 'table', 'new', args);
    return null;
  }

  // polyline stub
  if (name.startsWith('polyline.')) {
    return null;
  }

  // plot / hline / plotshape as side-effecting "calls" when used as statements
  if (name === 'plot' || name === 'plotshape' || name === 'hline' || name === 'bgcolor' || name === 'fill' || name === 'plotcandle') {
    return handlePlotLike(ctx, name, argStrs, args);
  }
  if (name === 'barcolor' || name === 'fill' || name === 'bgcolor') {
    return null;
  }
  if (name === 'timeframe.change' || name === 'timeframe.isintraday') {
    return false;
  }
  // bare input() legacy
  if (name === 'input') {
    return args[0];
  }

  // Type.new() — UDT constructor (must be explicit `.new`, never bare TypeName())
  if (/\.new$/i.test(name) || name.toLowerCase().endsWith('.new')) {
    const typeName = name.replace(/\.new$/i, '');
    const tdef = ctx.types.get(typeName);
    if (tdef) {
      const obj = { __pine: 'udt', __type: typeName };
      const fieldNames = [];
      for (const f of tdef.fields || []) {
        const fname = f.name || f.target;
        if (!fname) continue;
        fieldNames.push(fname);
        obj[fname] = f.def ? evalExpr(ctx, f.def) : nan();
      }
      args.forEach((v, i) => {
        if (fieldNames[i]) obj[fieldNames[i]] = v;
      });
      // also support named field=value args
      argStrs.forEach((raw, i) => {
        const named = /^\s*(\w+)\s*=\s*(.+)$/s.exec(raw);
        if (named && named[1] in obj && named[1] !== '__pine' && named[1] !== '__type') {
          obj[named[1]] = args[i];
        }
      });
      return obj;
    }
  }

  // method call: receiver.method(args) — supports nested receiver.field.method
  {
    const lastDot = name.lastIndexOf('.');
    if (lastDot > 0) {
      const recvExpr = name.slice(0, lastDot);
      const method = name.slice(lastDot + 1);
      const recv = evalExpr(ctx, recvExpr);
      if (recv && recv.__pine === 'line') return callDrawing(ctx, 'line', method, [recv, ...args]);
      if (recv && recv.__pine === 'box') return callDrawing(ctx, 'box', method, [recv, ...args]);
      if (recv && recv.__pine === 'label') return callDrawing(ctx, 'label', method, [recv, ...args]);
      if (recv && recv.__pine === 'array') {
        const mdef =
          ctx.typedMethods?.get('array')?.get(method) ||
          ctx.typedMethods?.get('box[]')?.get(method) ||
          ctx.typedMethods?.get('line[]')?.get(method) ||
          ctx.typedMethods?.get('label[]')?.get(method);
        if (mdef) return runMethod(ctx, mdef, recv, args);
        return callArray(ctx, method, [recv, ...args]);
      }
      if (recv && recv.__pine === 'udt') {
        const tdef = ctx.types.get(recv.__type);
        const mdef = tdef?.methods?.get(method) || ctx.typedMethods?.get(recv.__type)?.get(method);
        if (mdef) return runMethod(ctx, mdef, recv, args);
        return getProp(recv, method);
      }
      // color / bool method dispatch: css.darkcss() / bull_ob.drawVOB()
      if (typeof recv === 'string' || typeof recv === 'number') {
        const mdef = ctx.typedMethods?.get('color')?.get(method);
        if (mdef) return runMethod(ctx, mdef, recv, args);
      }
      if (typeof recv === 'boolean') {
        const mdef = ctx.typedMethods?.get('bool')?.get(method);
        if (mdef) return runMethod(ctx, mdef, recv, args);
      }
    }
  }

  // Global methods registered without receiver (fallback)
  if (ctx.functions.has(name)) {
    return runFunction(ctx, ctx.functions.get(name), args);
  }
  if (ctx.globalMethods?.has(name)) {
    return runFunction(ctx, ctx.globalMethods.get(name), args);
  }

  warn(ctx, `Unknown call ${name}`);
  return nan();
}

function mapDrawingArgs(ctx, ns, argStrs, evaled) {
  // Prefer evaluating bar_index / prices; keep naming for drawings.new
  // drawings pool expects mix of numbers — pass evaluated scalars where possible
  // Also re-parse named from strings using eval
  if (ns === 'box' || ns === 'line' || ns === 'label') {
    return argStrs.map((raw, i) => {
      const named = /^\s*(\w+)\s*=\s*(.+)$/s.exec(raw);
      if (named) return `${named[1]}=${evalExpr(ctx, named[2])}`;
      return String(evaled[i]);
    });
  }
  return evaled;
}

function handlePlotLike(ctx, name, argStrs, args) {
  if (name === 'plot') {
    const title = stripQuotes(namedOrPos(argStrs, 'title', 1) || `Plot${ctx.plotSeries.size + 1}`);
    const color = colorToHex(namedOrPos(argStrs, 'color', 2) || args[2] || '#f0b90b');
    const val = Number(args[0]);
    if (!ctx.plotSeries.has(title)) {
      ctx.plotSeries.set(title, { color, values: Array(ctx.n).fill(null) });
    }
    const slot = ctx.plotSeries.get(title);
    slot.values[ctx.barIndex] = isFiniteNum(val) ? val : null;
    return val;
  }
  if (name === 'hline') {
    const price = Number(args[0]);
    if (isFiniteNum(price) && ctx.barIndex === ctx.n - 1) {
      ctx.hlines.push({ price, color: colorToHex(String(args[1] || '#94a3b8')) });
    }
    return price;
  }
  if (name === 'plotshape') {
    // Skip detailed shapes for now
    return null;
  }
  return null;
}

function runMethod(ctx, method, self, args) {
  // Method-local `var` must persist across bars — key by method + first params so
  // bull/bear/swing drawVOB pools do not clobber each other.
  if (!ctx.fnState) ctx.fnState = new Map();
  const sid =
    typeof self === 'boolean' || typeof self === 'number' || typeof self === 'string'
      ? String(self)
      : self?.id || self?.__pine || 'obj';
  const hint = args
    .slice(0, 2)
    .map((a) => (typeof a === 'boolean' || typeof a === 'number' ? String(a) : ''))
    .join(':');
  const mKey = `method:${method.name || 'anon'}:${sid}:${hint}`;
  if (!ctx.fnState.has(mKey)) ctx.fnState.set(mKey, { vars: new Map(), varip: new Map() });
  const state = ctx.fnState.get(mKey);

  const savedLocals = ctx.locals;
  const savedVars = ctx.vars;
  const savedVarip = ctx.varip;
  const prevReturn = ctx.__return;

  ctx.locals = new Map(savedLocals);
  ctx.vars = state.vars;
  ctx.varip = state.varip;
  ctx.__return = undefined;
  ctx.locals.set('this', self);
  for (const [k, v] of ctx.vars) ctx.locals.set(k, v);
  for (const [k, v] of ctx.varip) ctx.locals.set(k, v);

  const params = method.params || [];
  let ai = 0;
  for (let i = 0; i < params.length; i += 1) {
    const p = params[i];
    if (i === 0) {
      ctx.locals.set(p, self);
      continue;
    }
    ctx.locals.set(p, args[ai++]);
  }
  let ret = null;
  try {
    ret = execBlock(ctx, method.body);
    for (const [k] of ctx.vars) {
      if (ctx.locals.has(k)) ctx.vars.set(k, ctx.locals.get(k));
    }
    for (const [k] of ctx.varip) {
      if (ctx.locals.has(k)) ctx.varip.set(k, ctx.locals.get(k));
    }
    if (ctx.__return !== undefined) ret = ctx.__return;
  } finally {
    ctx.locals = savedLocals;
    ctx.vars = savedVars;
    ctx.varip = savedVarip;
    ctx.__return = prevReturn;
  }
  return ret;
}

function runFunction(ctx, fn, args) {
  const fnKey = fn.name || 'anon';
  if (!ctx.fnState) ctx.fnState = new Map();
  if (!ctx.fnState.has(fnKey)) ctx.fnState.set(fnKey, { vars: new Map(), varip: new Map() });
  const state = ctx.fnState.get(fnKey);

  const savedLocals = ctx.locals;
  const savedVars = ctx.vars;
  const savedVarip = ctx.varip;
  const prevReturn = ctx.__return;

  ctx.locals = new Map();
  ctx.vars = state.vars;
  ctx.varip = state.varip;
  ctx.__return = undefined;

  (fn.params || []).forEach((p, i) => ctx.locals.set(p, args[i]));
  for (const [k, v] of ctx.vars) ctx.locals.set(k, v);
  for (const [k, v] of ctx.varip) ctx.locals.set(k, v);

  try {
    let ret = execBlock(ctx, fn.body);
    for (const [k] of ctx.vars) {
      if (ctx.locals.has(k)) ctx.vars.set(k, ctx.locals.get(k));
    }
    for (const [k] of ctx.varip) {
      if (ctx.locals.has(k)) ctx.varip.set(k, ctx.locals.get(k));
    }
    if (ctx.__return !== undefined) ret = ctx.__return;
    return ret;
  } finally {
    ctx.locals = savedLocals;
    ctx.vars = savedVars;
    ctx.varip = savedVarip;
    ctx.__return = prevReturn;
  }
}

function assignTarget(ctx, target, value) {
  // obj.field
  const fm = /^([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)$/.exec(target);
  if (fm) {
    const obj = resolveIdent(ctx, fm[1]);
    if (setProp(obj, fm[2], value)) {
      ctx.setLocal(`${fm[1]}.${fm[2]}`, value);
      return;
    }
  }
  if (ctx.vars.has(target) || target.startsWith('var ')) {
    ctx.vars.set(target, value);
  }
  if (ctx.globalVars?.has(target)) ctx.globalVars.set(target, value);
  ctx.setLocal(target, value);
  if (ctx.vars.has(target)) ctx.vars.set(target, value);
  // UDT: also track field series for history (b.h[n])
  if (value && typeof value === 'object' && value.__pine === 'udt') {
    for (const k of Object.keys(value)) {
      if (k.startsWith('__')) continue;
      ctx.setLocal(`${target}.${k}`, value[k]);
    }
  }
}

export function execBlock(ctx, body) {
  if (!body || !body.length) return null;
  let last = null;
  for (const st of body) {
    last = execStmt(ctx, st);
    if (ctx.__return !== undefined) return ctx.__return;
  }
  return last;
}

function execStmt(ctx, st) {
  if (!st) return null;
  ctx.checkTime();

  switch (st.kind) {
    case 'var': {
      const mode = st.mode === 'varip' ? 'varip' : 'vars';
      const map = ctx[mode];
      if (!map.has(st.name)) {
        const v = evalExpr(ctx, st.expr);
        map.set(st.name, v);
        ctx.setLocal(st.name, v);
      } else {
        ctx.setLocal(st.name, map.get(st.name));
      }
      return map.get(st.name);
    }
    case 'assign': {
      let v;
      if (st.switchExpr != null || st.cases) {
        // RHS switch expression: tg = switch x \n "a" => …
        const swSt = {
          kind: 'switch',
          expr: st.switchExpr || '',
          isConditionSwitch: !(st.switchExpr || '').trim(),
          cases: st.cases || [],
          defaultBody: st.defaultBody,
        };
        v = execStmt(ctx, swSt);
      } else {
        v = evalExpr(ctx, st.expr);
      }
      const op = st.op || '=';
      if (op === '+=' || op === '-=' || op === '*=' || op === '/=') {
        const cur = Number(evalExpr(ctx, st.target)) || 0;
        const n = Number(v) || 0;
        if (op === '+=') v = cur + n;
        else if (op === '-=') v = cur - n;
        else if (op === '*=') v = cur * n;
        else v = n === 0 ? nan() : cur / n;
      }
      if (ctx.vars.has(st.target)) ctx.vars.set(st.target, v);
      if (ctx.varip.has(st.target)) ctx.varip.set(st.target, v);
      assignTarget(ctx, st.target, v);
      return v;
    }
    case 'if': {
      if (truthy(evalExpr(ctx, st.cond))) return execBlock(ctx, st.then);
      for (const e of st.elseIfs || []) {
        if (truthy(evalExpr(ctx, e.cond))) return execBlock(ctx, e.body);
      }
      if (st.else) return execBlock(ctx, st.else);
      return null;
    }
    case 'for': {
      const from = Math.floor(Number(evalExpr(ctx, st.from)) || 0);
      const to = Math.floor(Number(evalExpr(ctx, st.to)) || 0);
      const step = from <= to ? 1 : -1;
      let last = null;
      for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
        ctx.checkTime();
        ctx.locals.set(st.iter, i);
        last = execBlock(ctx, st.body);
      }
      return last;
    }
    case 'forin': {
      const iter = evalExpr(ctx, st.iterExpr);
      let data = [];
      if (iter && iter.__pine === 'array') data = iter.data;
      else if (Array.isArray(iter)) data = iter;
      let last = null;
      for (let i = 0; i < data.length; i += 1) {
        ctx.checkTime();
        if (st.idx) ctx.locals.set(st.idx, i);
        ctx.locals.set(st.val, data[i]);
        last = execBlock(ctx, st.body);
      }
      return last;
    }
    case 'while': {
      let guard = 0;
      let last = null;
      while (truthy(evalExpr(ctx, st.cond)) && guard++ < 10000) {
        ctx.checkTime();
        last = execBlock(ctx, st.body);
      }
      return last;
    }
    case 'switch': {
      if (st.isConditionSwitch || !st.expr) {
        for (const c of st.cases || []) {
          if (truthy(evalExpr(ctx, c.match))) return execBlock(ctx, c.body);
        }
        if (st.defaultBody) return execBlock(ctx, st.defaultBody);
        return null;
      }
      const v = evalExpr(ctx, st.expr);
      for (const c of st.cases || []) {
        const m = evalExpr(ctx, c.match);
        if (m === v || String(m) === String(v) || (truthy(m) && m === true && truthy(v))) {
          return execBlock(ctx, c.body);
        }
      }
      if (st.defaultBody) return execBlock(ctx, st.defaultBody);
      return null;
    }
    case 'type': {
      // Registered in preamble
      return null;
    }
    case 'method': {
      return null;
    }
    case 'func': {
      return null;
    }
    case 'destructure': {
      const v = evalExpr(ctx, st.expr);
      const arr = Array.isArray(v) ? v : [v];
      (st.names || []).forEach((name, i) => {
        if (name === '_') return;
        const val = arr[i] !== undefined ? arr[i] : nan();
        if (ctx.vars.has(name)) ctx.vars.set(name, val);
        assignTarget(ctx, name, val);
      });
      return v;
    }
    case 'expr': {
      // return x
      const rm = /^return\s+(.+)$/i.exec(st.text || '');
      if (rm) {
        ctx.__return = evalExpr(ctx, rm[1]);
        return ctx.__return;
      }
      return evalExpr(ctx, st.text);
    }
    default:
      return null;
  }
}

function registerPreamble(ctx, program) {
  ctx.typedMethods = new Map();
  ctx.globalMethods = new Map();
  ctx.fnState = new Map();

  for (const st of program.body || []) {
    if (st.kind === 'type') {
      const fields = st.fields || [];
      const methods = new Map();
      ctx.types.set(st.name, { fields, methods });
    }
    if (st.kind === 'method') {
      const params = st.params || [];
      const paramTypes = st.paramTypes || [];
      let attached = false;
      const recvType = (paramTypes[0] || '').replace(/\s/g, '');
      if (recvType) {
        if (!ctx.typedMethods.has(recvType)) ctx.typedMethods.set(recvType, new Map());
        ctx.typedMethods.get(recvType).set(st.name, st);
        // Also map box[] / line[] → array
        if (recvType.endsWith('[]')) {
          if (!ctx.typedMethods.has('array')) ctx.typedMethods.set('array', new Map());
          ctx.typedMethods.get('array').set(st.name, st);
        }
        attached = true;
      }
      for (const [tname, tdef] of ctx.types) {
        if (params.some((p) => p === tname) || recvType === tname) {
          tdef.methods.set(st.name, st);
          attached = true;
        }
      }
      ctx.globalMethods.set(st.name, st);
      if (!attached) ctx.functions.set(st.name, st);
    }
    if (st.kind === 'func') {
      ctx.functions.set(st.name, st);
    }
  }
}

/**
 * @param {string} source
 * @param {Array} bars
 * @param {Record<string, any>} inputOverrides
 * @param {{ maxBars?: number, timeLimitMs?: number, maxDrawings?: number }} [opts]
 */
export function runEngine(source, bars, inputOverrides = {}, opts = {}) {
  const warnings = [];
  const version = detectVersion(source);
  if (!Array.isArray(bars) || !bars.length) {
    return { version, plots: [], hlines: [], shapes: [], drawings: [], warnings: ['No bars'] };
  }

  const inputs = { ...parseInputDefaults(source), ...inputOverrides };
  const ctx = createContext(bars, {
    inputs,
    warnings,
    maxBars: opts.maxBars || 5000,
    timeLimitMs: opts.timeLimitMs || 5000,
    maxDrawings: opts.maxDrawings || 200,
    startedAt: Date.now(),
    __debug: opts.debug || false,
  });

  createArrayRuntime(ctx);
  createDrawingPool(ctx);
  // Script-level var store — remain reachable from functions/methods after scope swap
  ctx.globalVars = ctx.vars;
  ctx.globalVarip = ctx.varip;
  if (opts.debug) ctx.__debug = true;

  let program;
  try {
    program = parseProgram(source);
  } catch (err) {
    return {
      version,
      plots: [],
      hlines: [],
      shapes: [],
      drawings: [],
      warnings: [`Parse error: ${err.message || err}`],
    };
  }

  registerPreamble(ctx, program);

  // Filter executable body: skip indicator()/strategy() headers, type/method defs
  const execBody = (program.body || []).filter((st) => {
    if (st.kind === 'type' || st.kind === 'method' || st.kind === 'func') return false;
    if (st.kind === 'expr') {
      const t = st.text || '';
      if (/^(indicator|strategy|library)\s*\(/i.test(t)) return false;
      if (/^import\s+/i.test(t)) {
        warn(ctx, 'import not supported');
        return false;
      }
      if (/^export\s+/i.test(t)) return false;
    }
    return true;
  });

  try {
    for (let i = 0; i < ctx.n; i += 1) {
      ctx.barIndex = i;
      rollBar(ctx);
      ctx.__return = undefined;
      // Re-bind var values into locals each bar
      for (const [k, v] of ctx.vars) ctx.locals.set(k, v);
      for (const [k, v] of ctx.varip) ctx.locals.set(k, v);
      execBlock(ctx, execBody);
      // Sync var from locals if assigned
      for (const [k] of ctx.vars) {
        if (ctx.locals.has(k)) ctx.vars.set(k, ctx.locals.get(k));
      }
      for (const [k] of ctx.varip) {
        if (ctx.locals.has(k)) ctx.varip.set(k, ctx.locals.get(k));
      }
    }
  } catch (err) {
    warn(ctx, String(err.message || err));
  }

  const plots = [];
  for (const [title, slot] of ctx.plotSeries) {
    plots.push({ title, color: slot.color, values: slot.values });
  }

  const drawings = ctx.drawings ? ctx.drawings.toIR() : [];

  return {
    version,
    plots,
    hlines: ctx.hlines,
    shapes: [],
    drawings,
    warnings: ctx.warnings.slice(0, MAX_WARN),
  };
}
