/**
 * Wolf Pine runtime — executes TradingView-style Pine (@version 3–6+) on OHLCV bars.
 * Supports common indicator scripts: input.*, ta.*, math.*, plot/plotshape/hline,
 * series history [], ternary, arithmetic.
 * LuxAlgo-class SMC (box.new / line.new / heavy if-blocks) is handled on Terminal by the
 * native Wolf SMC pack (structure / BOS / FVG / OB) so those charts still trade the same
 * concepts without requiring a full TradingView VM.
 */

function nan() {
  return Number.NaN;
}

function seriesFrom(bars, pick) {
  const out = new Array(bars.length);
  for (let i = 0; i < bars.length; i += 1) out[i] = pick(bars[i], i);
  return out;
}

function constSeries(n, value) {
  return Array.from({ length: n }, () => value);
}

function isSeries(v) {
  return Array.isArray(v);
}

function at(series, i) {
  if (!isSeries(series)) return Number(series);
  const v = series[i];
  return typeof v === 'number' ? v : nan();
}

function map2(a, b, n, fn) {
  const out = new Array(n);
  const aS = isSeries(a);
  const bS = isSeries(b);
  for (let i = 0; i < n; i += 1) {
    const av = aS ? a[i] : Number(a);
    const bv = bS ? b[i] : Number(b);
    out[i] = fn(av, bv, i);
  }
  return out;
}

function map1(a, n, fn) {
  if (!isSeries(a)) return constSeries(n, fn(Number(a), 0));
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) out[i] = fn(a[i], i);
  return out;
}

function nz(v, repl = 0) {
  return Number.isFinite(v) ? v : repl;
}

function sma(src, length, n) {
  const len = Math.max(1, Math.floor(Number(length) || 1));
  const out = new Array(n).fill(nan());
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const v = nz(at(src, i), 0);
    sum += v;
    if (i >= len) sum -= nz(at(src, i - len), 0);
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

function ema(src, length, n) {
  const len = Math.max(1, Math.floor(Number(length) || 1));
  const k = 2 / (len + 1);
  const out = new Array(n).fill(nan());
  let prev = nan();
  for (let i = 0; i < n; i += 1) {
    const v = at(src, i);
    if (!Number.isFinite(v)) {
      out[i] = prev;
      continue;
    }
    prev = Number.isFinite(prev) ? v * k + prev * (1 - k) : v;
    out[i] = prev;
  }
  return out;
}

function rma(src, length, n) {
  const len = Math.max(1, Math.floor(Number(length) || 1));
  const out = new Array(n).fill(nan());
  let prev = nan();
  let seed = 0;
  for (let i = 0; i < n; i += 1) {
    const v = nz(at(src, i), 0);
    if (i < len) {
      seed += v;
      if (i === len - 1) {
        prev = seed / len;
        out[i] = prev;
      }
      continue;
    }
    prev = (prev * (len - 1) + v) / len;
    out[i] = prev;
  }
  return out;
}

function rsi(src, length, n) {
  const len = Math.max(1, Math.floor(Number(length) || 14));
  const gains = new Array(n).fill(0);
  const losses = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const d = at(src, i) - at(src, i - 1);
    gains[i] = d > 0 ? d : 0;
    losses[i] = d < 0 ? -d : 0;
  }
  const avgG = rma(gains, len, n);
  const avgL = rma(losses, len, n);
  const out = new Array(n).fill(nan());
  for (let i = 0; i < n; i += 1) {
    const g = avgG[i];
    const l = avgL[i];
    if (!Number.isFinite(g) || !Number.isFinite(l)) continue;
    if (l === 0) out[i] = 100;
    else out[i] = 100 - 100 / (1 + g / l);
  }
  return out;
}

function atr(high, low, close, length, n) {
  const tr = new Array(n).fill(nan());
  for (let i = 0; i < n; i += 1) {
    const h = at(high, i);
    const l = at(low, i);
    const c1 = i > 0 ? at(close, i - 1) : at(close, i);
    tr[i] = Math.max(h - l, Math.abs(h - c1), Math.abs(l - c1));
  }
  return rma(tr, length, n);
}

function highest(src, length, n) {
  const len = Math.max(1, Math.floor(Number(length) || 1));
  const out = new Array(n).fill(nan());
  for (let i = 0; i < n; i += 1) {
    let m = -Infinity;
    for (let j = Math.max(0, i - len + 1); j <= i; j += 1) {
      const v = at(src, j);
      if (Number.isFinite(v) && v > m) m = v;
    }
    out[i] = m === -Infinity ? nan() : m;
  }
  return out;
}

function lowest(src, length, n) {
  const len = Math.max(1, Math.floor(Number(length) || 1));
  const out = new Array(n).fill(nan());
  for (let i = 0; i < n; i += 1) {
    let m = Infinity;
    for (let j = Math.max(0, i - len + 1); j <= i; j += 1) {
      const v = at(src, j);
      if (Number.isFinite(v) && v < m) m = v;
    }
    out[i] = m === Infinity ? nan() : m;
  }
  return out;
}

function change(src, length, n) {
  const len = Math.max(1, Math.floor(Number(length) || 1));
  return map1(src, n, (v, i) => (i >= len ? v - at(src, i - len) : nan()));
}

function crossover(a, b, n) {
  const out = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    out[i] = at(a, i - 1) <= at(b, i - 1) && at(a, i) > at(b, i) ? 1 : 0;
  }
  return out;
}

function crossunder(a, b, n) {
  const out = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    out[i] = at(a, i - 1) >= at(b, i - 1) && at(a, i) < at(b, i) ? 1 : 0;
  }
  return out;
}

function stdev(src, length, n) {
  const len = Math.max(1, Math.floor(Number(length) || 1));
  const mean = sma(src, len, n);
  const out = new Array(n).fill(nan());
  for (let i = len - 1; i < n; i += 1) {
    let acc = 0;
    for (let j = i - len + 1; j <= i; j += 1) {
      const d = at(src, j) - mean[i];
      acc += d * d;
    }
    out[i] = Math.sqrt(acc / len);
  }
  return out;
}

function stripComments(src) {
  return String(src || '')
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .replace(/\/\/[^\n]*/g, '');
}

function detectVersion(src) {
  const m = /\/\/\s*@version\s*=\s*(\d+)/i.exec(String(src || ''));
  return m ? Number(m[1]) : 5;
}

function stripQuotes(s) {
  const t = String(s || '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseInputDefaults(src) {
  const fields = {};
  const re =
    /([A-Za-z_][\w]*)\s*=\s*input\.(int|float|bool|string|color|source|timeframe)\s*\(([\s\S]*?)\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[1];
    const type = m[2];
    const args = m[3];
    const first = args.split(',')[0]?.trim() || '';
    let value;
    if (type === 'bool') value = /true/i.test(first);
    else if (type === 'int' || type === 'float') value = Number(first);
    else value = stripQuotes(first);
    // defval=
    const def = /defval\s*=\s*([^,\)]+)/i.exec(args);
    if (def) {
      const raw = def[1].trim();
      if (type === 'bool') value = /true/i.test(raw);
      else if (type === 'int' || type === 'float') value = Number(raw);
      else value = stripQuotes(raw);
    }
    fields[key] = value;
  }
  // legacy input(14, "Length")
  const legacy =
    /([A-Za-z_][\w]*)\s*=\s*input\s*\(\s*([^,\)]+)\s*(?:,|\))/g;
  while ((m = legacy.exec(src)) !== null) {
    if (fields[m[1]] !== undefined) continue;
    const raw = m[2].trim();
    const num = Number(raw);
    fields[m[1]] = Number.isFinite(num) ? num : stripQuotes(raw);
  }
  return fields;
}

function extractStatements(src) {
  const cleaned = stripComments(src)
    .replace(/\bindicator\s*\([\s\S]*?\)\s*/gi, '\n')
    .replace(/\bstrategy\s*\([\s\S]*?\)\s*/gi, '\n')
    .replace(/\blibrary\s*\([\s\S]*?\)\s*/gi, '\n');
  return cleaned
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\/\/\s*@version/i.test(l));
}

function colorToHex(name) {
  const map = {
    'color.red': '#ef5350',
    'color.green': '#26a69a',
    'color.blue': '#42a5f5',
    'color.orange': '#ff9800',
    'color.purple': '#ab47bc',
    'color.yellow': '#f0b90b',
    'color.white': '#e2e8f0',
    'color.black': '#0b0e17',
    'color.gray': '#94a3b8',
    'color.aqua': '#00bcd4',
    'color.teal': '#009688',
    'color.lime': '#c6ff00',
    'color.maroon': '#880e4f',
    'color.navy': '#1a237e',
    'color.olive': '#808000',
    'color.silver': '#c0c0c0',
    'color.fuchsia': '#e040fb',
  };
  const k = String(name || '').trim().toLowerCase();
  if (map[k]) return map[k];
  if (/^#[0-9a-f]{6,8}$/i.test(k)) return k.slice(0, 7);
  const m = /color\.new\s*\(\s*(color\.\w+|#[0-9a-f]+)/i.exec(k);
  if (m) return colorToHex(m[1]);
  return '#f0b90b';
}

/**
 * @param {string} source
 * @param {Array<{time:number,open:number,high:number,low:number,close:number,volume?:number}>} bars
 * @param {Record<string, string|number|boolean>} [inputOverrides]
 */
export function runPineScript(source, bars, inputOverrides = {}) {
  const warnings = [];
  const n = Array.isArray(bars) ? bars.length : 0;
  if (!n) {
    return { version: detectVersion(source), plots: [], hlines: [], shapes: [], warnings: ['No bars'] };
  }

  const version = detectVersion(source);
  if (version < 3 || version > 6) {
    warnings.push(`@version=${version} accepted — engine targets Pine v3–v6 syntax`);
  }
  const scriptOverlay =
    /overlay\s*=\s*true/i.test(source) || !/overlay\s*=\s*false/i.test(source);

  const open = seriesFrom(bars, (b) => Number(b.open));
  const high = seriesFrom(bars, (b) => Number(b.high));
  const low = seriesFrom(bars, (b) => Number(b.low));
  const close = seriesFrom(bars, (b) => Number(b.close));
  const volume = seriesFrom(bars, (b) => Number(b.volume) || 0);
  const hl2 = map2(high, low, n, (h, l) => (h + l) / 2);
  const hlc3 = new Array(n);
  const ohlc4 = new Array(n);
  for (let i = 0; i < n; i += 1) {
    hlc3[i] = (high[i] + low[i] + close[i]) / 3;
    ohlc4[i] = (open[i] + high[i] + low[i] + close[i]) / 4;
  }

  const inputs = { ...parseInputDefaults(source), ...inputOverrides };
  const env = {
    open,
    high,
    low,
    close,
    volume,
    hl2,
    hlc3,
    ohlc4,
    true: 1,
    false: 0,
    na: nan(),
  };

  for (const [k, v] of Object.entries(inputs)) {
    if (typeof v === 'boolean') env[k] = v ? 1 : 0;
    else if (typeof v === 'number') env[k] = v;
    else if (typeof v === 'string' && /^(open|high|low|close|hl2|hlc3|ohlc4|volume)$/i.test(v)) {
      env[k] = env[v.toLowerCase()];
    } else env[k] = v;
  }

  const plots = [];
  const hlines = [];
  const shapes = [];

  const history = (series, offset) => {
    const off = Math.max(0, Math.floor(Number(offset) || 0));
    if (!isSeries(series)) return constSeries(n, Number(series));
    const out = new Array(n).fill(nan());
    for (let i = off; i < n; i += 1) out[i] = series[i - off];
    return out;
  };

  function callTaFixed(name, args) {
    const fn = String(name || '').toLowerCase();
    const a0 = args[0];
    const a1 = args[1];
    if (fn === 'sma') return sma(a0, a1, n);
    if (fn === 'ema') return ema(a0, a1, n);
    if (fn === 'rma' || fn === 'wilders') return rma(a0, a1, n);
    if (fn === 'rsi') return rsi(a0, a1 ?? 14, n);
    if (fn === 'atr') return atr(high, low, close, Number(a0) || 14, n);
    if (fn === 'highest') return highest(a0, a1, n);
    if (fn === 'lowest') return lowest(a0, a1, n);
    if (fn === 'change') return change(a0, a1 ?? 1, n);
    if (fn === 'stdev') return stdev(a0, a1, n);
    if (fn === 'crossover') return crossover(a0, a1, n);
    if (fn === 'crossunder') return crossunder(a0, a1, n);
    if (fn === 'vwma') {
      const pv = map2(a0, volume, n, (p, v) => p * v);
      const num = sma(pv, a1, n);
      const den = sma(volume, a1, n);
      return map2(num, den, n, (x, y) => (y ? x / y : nan()));
    }
    if (fn === 'linreg') return ema(a0, a1 ?? 14, n);
    if (fn === 'cum') {
      const out = new Array(n).fill(nan());
      let s = 0;
      for (let i = 0; i < n; i += 1) {
        s += nz(at(a0, i), 0);
        out[i] = s;
      }
      return out;
    }
    if (fn === 'barssince') {
      const out = new Array(n).fill(nan());
      let last = -1;
      for (let i = 0; i < n; i += 1) {
        if (at(a0, i)) last = i;
        out[i] = last < 0 ? nan() : i - last;
      }
      return out;
    }
    if (fn === 'rising') {
      const len = Math.max(1, Math.floor(Number(a1) || 1));
      return map1(a0, n, (v, i) => (i >= len && v > at(a0, i - len) ? 1 : 0));
    }
    if (fn === 'falling') {
      const len = Math.max(1, Math.floor(Number(a1) || 1));
      return map1(a0, n, (v, i) => (i >= len && v < at(a0, i - len) ? 1 : 0));
    }
    warnings.push(`ta.${fn} not fully modelled — approximated or skipped`);
    return isSeries(a0) ? a0 : constSeries(n, Number(a0));
  }

  const evalExpr = (expr) =>
    evaluateExpression(expr, env, n, { history, callTa: callTaFixed, warnings });

  const statements = extractStatements(source);
  for (const rawLine of statements) {
    let line = rawLine
      .replace(/\bvar\s+/g, '')
      .replace(/\bvarip\s+/g, '')
      .replace(/\bconst\s+/g, '')
      .trim();
    if (!line || line.startsWith('import ')) {
      if (line.startsWith('import ')) warnings.push('import/library skipped');
      continue;
    }
    if (/^(if|for|while|switch|type|method|export)\b/i.test(line)) {
      warnings.push(`Control flow not fully executed: ${line.slice(0, 40)}…`);
      continue;
    }

    // plot / plotshape / hline
    const plotM = /^plot\s*\(([\s\S]*)\)\s*$/i.exec(line);
    if (plotM) {
      const args = splitArgs(plotM[1]);
      const series = evalExpr(args[0] || 'na');
      const titleArg = args.find((a) => /^\s*title\s*=/i.test(a));
      const positionalTitle = args[1] && !/^\s*\w+\s*=/.test(args[1]) ? args[1] : '';
      const title = titleArg
        ? stripQuotes(titleArg.replace(/^\s*title\s*=\s*/i, ''))
        : positionalTitle
          ? stripQuotes(positionalTitle)
          : `Plot ${plots.length + 1}`;
      const colorArg = args.find((a) => /color\s*=/.test(a)) || (args[2] && !/^\s*\w+\s*=/.test(args[2]) ? args[2] : '');
      const color = colorArg ? colorToHex(String(colorArg).replace(/^color\s*=\s*/i, '')) : '#f0b90b';
      const values = isSeries(series) ? series : constSeries(n, Number(series));
      plots.push({ title, values, color, overlay: scriptOverlay });
      continue;
    }
    const shapeM = /^plotshape\s*\(([\s\S]*)\)\s*$/i.exec(line);
    if (shapeM) {
      const args = splitArgs(shapeM[1]);
      const cond = evalExpr(args[0] || 'false');
      shapes.push({
        title: 'shape',
        flags: isSeries(cond) ? cond.map((v) => (v ? 1 : 0)) : constSeries(n, cond ? 1 : 0),
      });
      continue;
    }
    const hlineM = /^hline\s*\(([\s\S]*)\)\s*$/i.exec(line);
    if (hlineM) {
      const args = splitArgs(hlineM[1]);
      const price = Number(evalExpr(args[0] || '0'));
      hlines.push({ price, color: '#94a3b8' });
      continue;
    }

    // assignment := or =
    const asg = /^([A-Za-z_][\w]*)\s*(?::=|=)\s*([\s\S]+)$/.exec(line);
    if (asg) {
      const name = asg[1];
      if (/^input\./i.test(asg[2]) || /^input\s*\(/i.test(asg[2])) continue; // already in env
      try {
        env[name] = evalExpr(asg[2]);
      } catch (err) {
        warnings.push(`Assign ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
    }
  }

  // If script never called plot but computed a last series named like plot/out/signal — still show close SMA fallback? No — respect “as written”.
  if (!plots.length && !warnings.length) {
    warnings.push('No plot() calls detected — add plot(series) in your Pine to draw on chart');
  }

  return { version, plots, hlines, shapes, warnings };
}

function splitArgs(raw) {
  const args = [];
  let cur = '';
  let depth = 0;
  let quote = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
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
    if (ch === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function evaluateExpression(expr, env, n, api) {
  const s = String(expr || '').trim();
  if (!s) return nan();

  // ternary
  const q = findTernary(s);
  if (q) {
    const cond = evaluateExpression(q.cond, env, n, api);
    const a = evaluateExpression(q.a, env, n, api);
    const b = evaluateExpression(q.b, env, n, api);
    return map2(cond, map2(a, b, n, (x, y) => x), n, (c, av, i) => (at(c, i) ? at(a, i) : at(b, i)));
  }

  // comparisons / arithmetic — shunting yard simplified via recursive splitters
  return evalOr(s, env, n, api);
}

function findTernary(s) {
  let depth = 0;
  let q = -1;
  let colon = -1;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === '?' && depth === 0 && q < 0) q = i;
    else if (ch === ':' && depth === 0 && q >= 0) {
      colon = i;
      break;
    }
  }
  if (q < 0 || colon < 0) return null;
  return {
    cond: s.slice(0, q).trim(),
    a: s.slice(q + 1, colon).trim(),
    b: s.slice(colon + 1).trim(),
  };
}

function splitTop(s, ops) {
  let depth = 0;
  let quote = '';
  for (let i = s.length - 1; i >= 0; i -= 1) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ')') depth += 1;
    else if (ch === '(') depth -= 1;
    if (depth !== 0) continue;
    for (const op of ops) {
      if (s.slice(i - op.length + 1, i + 1) === op) {
        // avoid matching = inside ==
        if (op === '=' && (s[i - 1] === '=' || s[i + 1] === '=' || s[i - 1] === '!' || s[i - 1] === '<' || s[i - 1] === '>')) {
          continue;
        }
        return { left: s.slice(0, i - op.length + 1).trim(), op, right: s.slice(i + 1).trim() };
      }
    }
  }
  return null;
}

function evalOr(s, env, n, api) {
  const sp = splitTop(s, [' or ']);
  if (sp) {
    return map2(evalOr(sp.left, env, n, api), evalAnd(sp.right, env, n, api), n, (a, b) => (a || b ? 1 : 0));
  }
  return evalAnd(s, env, n, api);
}

function evalAnd(s, env, n, api) {
  const sp = splitTop(s, [' and ']);
  if (sp) {
    return map2(evalAnd(sp.left, env, n, api), evalCmp(sp.right, env, n, api), n, (a, b) => (a && b ? 1 : 0));
  }
  return evalCmp(s, env, n, api);
}

function evalCmp(s, env, n, api) {
  for (const op of ['==', '!=', '>=', '<=', '>', '<']) {
    const sp = splitTop(s, [op]);
    if (!sp) continue;
    const L = evalAdd(sp.left, env, n, api);
    const R = evalAdd(sp.right, env, n, api);
    return map2(L, R, n, (a, b) => {
      if (op === '==') return a === b ? 1 : 0;
      if (op === '!=') return a !== b ? 1 : 0;
      if (op === '>=') return a >= b ? 1 : 0;
      if (op === '<=') return a <= b ? 1 : 0;
      if (op === '>') return a > b ? 1 : 0;
      return a < b ? 1 : 0;
    });
  }
  return evalAdd(s, env, n, api);
}

function evalAdd(s, env, n, api) {
  const sp = splitTop(s, ['+', '-']);
  if (sp && sp.left) {
    const L = evalAdd(sp.left, env, n, api);
    const R = evalMul(sp.right, env, n, api);
    return map2(L, R, n, (a, b) => (sp.op === '+' ? a + b : a - b));
  }
  return evalMul(s, env, n, api);
}

function evalMul(s, env, n, api) {
  const sp = splitTop(s, ['*', '/', '%']);
  if (sp && sp.left) {
    const L = evalMul(sp.left, env, n, api);
    const R = evalUnary(sp.right, env, n, api);
    return map2(L, R, n, (a, b) => {
      if (sp.op === '*') return a * b;
      if (sp.op === '/') return b === 0 ? nan() : a / b;
      return b === 0 ? nan() : a % b;
    });
  }
  return evalUnary(s, env, n, api);
}

function evalUnary(s, env, n, api) {
  const t = s.trim();
  if (t.startsWith('not ')) {
    return map1(evaluateExpression(t.slice(4), env, n, api), n, (v) => (v ? 0 : 1));
  }
  if (t.startsWith('-') && !/^-?\d/.test(t)) {
    return map1(evaluateExpression(t.slice(1), env, n, api), n, (v) => -v);
  }
  return evalPrimary(t, env, n, api);
}

function evalPrimary(s, env, n, api) {
  let t = s.trim();
  if (t.startsWith('(') && t.endsWith(')')) {
    return evaluateExpression(t.slice(1, -1), env, n, api);
  }

  // history src[1]
  const hist = /^([A-Za-z_][\w]*)\s*\[\s*([^\]]+)\s*\]$/.exec(t);
  if (hist) {
    const base = env[hist[1]];
    const off = evaluateExpression(hist[2], env, n, api);
    const offset = isSeries(off) ? at(off, n - 1) : Number(off);
    return api.history(base ?? nan(), offset);
  }

  // ta.fn(...)
  const taf = /^(ta|math|str|color)\.([A-Za-z_][\w]*)\s*\(([\s\S]*)\)$/.exec(t);
  if (taf) {
    const ns = taf[1];
    const fn = taf[2];
    const args = splitArgs(taf[3]).map((a) => evaluateExpression(a, env, n, api));
    if (ns === 'ta') return api.callTa(fn, args);
    if (ns === 'math') {
      if (fn === 'abs') return map1(args[0], n, (v) => Math.abs(v));
      if (fn === 'max') return map2(args[0], args[1], n, (a, b) => Math.max(a, b));
      if (fn === 'min') return map2(args[0], args[1], n, (a, b) => Math.min(a, b));
      if (fn === 'avg') return map2(args[0], args[1], n, (a, b) => (a + b) / 2);
      if (fn === 'sqrt') return map1(args[0], n, (v) => Math.sqrt(Math.max(0, v)));
      if (fn === 'pow') return map2(args[0], args[1], n, (a, b) => a ** b);
      if (fn === 'round') return map1(args[0], n, (v) => Math.round(v));
      if (fn === 'floor') return map1(args[0], n, (v) => Math.floor(v));
      if (fn === 'ceil') return map1(args[0], n, (v) => Math.ceil(v));
      if (fn === 'sign') return map1(args[0], n, (v) => Math.sign(v));
    }
    api.warnings.push(`${ns}.${fn} stubbed`);
    return args[0] ?? constSeries(n, nan());
  }

  // nz(x, y)
  const nzM = /^nz\s*\(([\s\S]*)\)$/i.exec(t);
  if (nzM) {
    const args = splitArgs(nzM[1]).map((a) => evaluateExpression(a, env, n, api));
    return map2(args[0], args[1] ?? 0, n, (a, b) => (Number.isFinite(a) ? a : Number(b) || 0));
  }

  // fixnan
  const fix = /^fixnan\s*\(([\s\S]*)\)$/i.exec(t);
  if (fix) {
    const inner = evaluateExpression(fix[1], env, n, api);
    const out = new Array(n);
    let last = 0;
    for (let i = 0; i < n; i += 1) {
      const v = at(inner, i);
      if (Number.isFinite(v)) last = v;
      out[i] = Number.isFinite(v) ? v : last;
    }
    return out;
  }

  if (/^na$/i.test(t)) return constSeries(n, nan());
  if (/^true$/i.test(t)) return 1;
  if (/^false$/i.test(t)) return 0;
  if (/^color\./i.test(t) || /^#/.test(t)) return t;

  const num = Number(t);
  if (Number.isFinite(num) && /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return num;

  if (Object.prototype.hasOwnProperty.call(env, t)) return env[t];

  // size.tiny etc.
  if (/^(size|shape|location|display)\./i.test(t)) return t;

  api.warnings.push(`Unknown identifier: ${t}`);
  return constSeries(n, nan());
}

export function pineVersionLabel(source) {
  return `v${detectVersion(source)}`;
}
