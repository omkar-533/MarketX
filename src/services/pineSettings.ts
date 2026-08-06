/**
 * Client-side Pine `input.*` parser (mirrors server/auth/pineSettings.mjs).
 * Members never receive pine source — only these settings objects from the API.
 */

export type PineSettingType = 'int' | 'float' | 'bool' | 'string' | 'color' | 'source';

export type PineSettingField = {
  key: string;
  label: string;
  type: PineSettingType;
  defaultValue: string | number | boolean;
  min?: number;
  max?: number;
  options?: string[];
  group?: string;
  tooltip?: string;
};

function stripQuotes(s: string) {
  const t = String(s || '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseNumber(raw: string) {
  const n = Number(String(raw || '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseBool(raw: string) {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'true') return true;
  if (t === 'false') return false;
  return null;
}

function readNamedArg(args: string, name: string) {
  const re = new RegExp(`(?:^|,)\\s*${name}\\s*=\\s*([^,]+)`, 'i');
  const m = re.exec(args);
  return m ? m[1].trim() : null;
}

function readOptions(args: string) {
  const m = /options\s*=\s*\[([^\]]*)\]/i.exec(args);
  if (!m) return undefined;
  return m[1]
    .split(',')
    .map((part) => stripQuotes(part.trim().replace(/^size\./, '').replace(/^color\./, '')))
    .filter(Boolean);
}

export function parsePineSettings(pineSource: string): PineSettingField[] {
  const src = String(pineSource || '');
  if (!src.trim()) return [];

  const fields: PineSettingField[] = [];
  const seen = new Set<string>();

  const re =
    /^\s*(?:(?:var|const)\s+)?([A-Za-z_][\w]*)\s*=\s*input\.(int|float|bool|string|color|source|timeframe)\s*\(([\s\S]*?)\)\s*(?:\/\/[^\n]*)?$/gm;

  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    const key = match[1];
    if (seen.has(key)) continue;
    const typeRaw = match[2].toLowerCase();
    const args = match[3];

    const type: PineSettingType =
      typeRaw === 'int'
        ? 'int'
        : typeRaw === 'float'
          ? 'float'
          : typeRaw === 'bool'
            ? 'bool'
            : typeRaw === 'color'
              ? 'color'
              : typeRaw === 'source'
                ? 'source'
                : 'string';

    const positional: string[] = [];
    let buf = '';
    let depth = 0;
    let inStr: string | null = null;
    for (let i = 0; i < args.length; i += 1) {
      const ch = args[i];
      if (inStr) {
        buf += ch;
        if (ch === inStr && args[i - 1] !== '\\') inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        buf += ch;
        continue;
      }
      if (ch === '(' || ch === '[') depth += 1;
      if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) {
        positional.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) positional.push(buf.trim());

    const defRaw = positional[0] || '';
    let label = key;
    const titlePos = positional.find((p, idx) => idx > 0 && /^["']/.test(p.trim()));
    if (titlePos) label = stripQuotes(titlePos);
    else {
      const titleNamed = readNamedArg(args, 'title');
      if (titleNamed) label = stripQuotes(titleNamed);
    }

    let defaultValue: string | number | boolean;
    if (type === 'bool') {
      defaultValue = parseBool(defRaw) ?? false;
    } else if (type === 'int' || type === 'float') {
      defaultValue = parseNumber(defRaw.replace(/_/g, '')) ?? 0;
    } else {
      defaultValue = stripQuotes(defRaw.replace(/^size\./, '').replace(/^color\./, ''));
    }

    const minRaw = readNamedArg(args, 'minval');
    const maxRaw = readNamedArg(args, 'maxval');
    const groupRaw = readNamedArg(args, 'group');
    const tipRaw = readNamedArg(args, 'tooltip');

    const field: PineSettingField = { key, label, type, defaultValue };
    const min = minRaw != null ? parseNumber(minRaw) : null;
    const max = maxRaw != null ? parseNumber(maxRaw) : null;
    if (min != null) field.min = min;
    if (max != null) field.max = max;
    const options = readOptions(args);
    if (options?.length) field.options = options;
    if (groupRaw) field.group = stripQuotes(groupRaw);
    if (tipRaw) field.tooltip = stripQuotes(tipRaw);

    seen.add(key);
    fields.push(field);
  }

  return fields;
}

export function defaultsFromSettings(settings: PineSettingField[]): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const field of settings || []) {
    out[field.key] = field.defaultValue;
  }
  return out;
}
