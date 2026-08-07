/**
 * Shared helpers for Wolf Pine engine.
 */

export function nan() {
  return Number.NaN;
}

export function nz(v, repl = 0) {
  return Number.isFinite(v) ? v : repl;
}

export function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

export function stripQuotes(s) {
  const t = String(s ?? '').trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

export function detectVersion(source) {
  const m = /\/\/\s*@version\s*=\s*(\d+)/i.exec(String(source || ''));
  return m ? Number(m[1]) : 5;
}

export function colorToHex(name) {
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
    'color.silver': '#c0c0c0',
    'color.aqua': '#00bcd4',
    'color.teal': '#009688',
    'color.lime': '#c6ff00',
    'color.maroon': '#880e4f',
    'color.navy': '#1a237e',
    'color.olive': '#808000',
    'color.fuchsia': '#e040fb',
  };
  const k = String(name || '').trim().toLowerCase();
  if (map[k]) return map[k];
  if (/^#[0-9a-f]{6,8}$/i.test(k)) return k.slice(0, 7);
  const m = /color\.new\s*\(\s*(color\.\w+|#[0-9a-f]+)/i.exec(k);
  if (m) return colorToHex(m[1]);
  const named = /#?(089981|f23645)/i.exec(k);
  if (named) return named[1].toLowerCase() === '089981' ? '#089981' : '#f23645';
  return '#f0b90b';
}

export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
  const h = (v) => clamp(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex) {
  const h = colorToHex(hex).replace('#', '');
  if (h.length < 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Split top-level comma args respecting (), [], quotes. */
export function splitArgs(raw) {
  const args = [];
  let cur = '';
  let depth = 0;
  let quote = '';
  const s = String(raw || '');
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

export function namedOrPos(args, name, index) {
  const hit = args.find((a) => new RegExp(`^\\s*${name}\\s*=`, 'i').test(a));
  if (hit) return hit.replace(new RegExp(`^\\s*${name}\\s*=\\s*`, 'i'), '').trim();
  return args[index] && !/^\s*\w+\s*=/.test(args[index]) ? args[index] : '';
}

export function parseInputDefaults(source) {
  const fields = {};
  const src = String(source || '');
  const re =
    /([A-Za-z_][\w]*)\s*=\s*input\.(int|float|bool|string|color|source|timeframe|session)\s*\(([\s\S]*?)\)\s*(?:\n|$)/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[1];
    const type = m[2].toLowerCase();
    const args = m[3];
    const first = args.split(',')[0]?.trim() || '';
    let value;
    if (type === 'bool') value = /true/i.test(first);
    else if (type === 'int' || type === 'float') value = Number(first);
    else value = stripQuotes(first);
    const def = /defval\s*=\s*([^,\)]+)/i.exec(args);
    if (def) {
      const raw = def[1].trim();
      if (type === 'bool') value = /true/i.test(raw);
      else if (type === 'int' || type === 'float') value = Number(raw);
      else value = stripQuotes(raw);
    }
    fields[key] = value;
  }
  const legacy = /([A-Za-z_][\w]*)\s*=\s*input\s*\(\s*([^,\)]+)\s*(?:,|\))/g;
  while ((m = legacy.exec(src)) !== null) {
    if (fields[m[1]] !== undefined) continue;
    const raw = m[2].trim();
    const num = Number(raw);
    fields[m[1]] = Number.isFinite(num) ? num : stripQuotes(raw);
  }
  return fields;
}
