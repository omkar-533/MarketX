/**
 * Indent-aware lexer for Pine-like blocks.
 * Emits lines with indent measured in spaces (tabs → 4 spaces).
 */

export function stripComments(src) {
  return String(src || '')
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .replace(/(^|[^:])\/\/(?!\/\s*@version).*$/gm, '$1');
}

/**
 * @returns {{ indent: number, text: string, lineNo: number }[]}
 * indent = leading spaces (tab=4). Parser treats any deeper indent as a child block.
 */
export function lexLines(source) {
  const cleaned = stripComments(source)
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '    ');
  const raw = cleaned.split('\n');
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
    if (!line.trim()) continue;
    if (/^\s*\/\/\s*@version/i.test(line)) continue;
    const m = /^(\s*)(.*)$/.exec(line);
    const indent = m[1].length;
    let text = m[2].trim();
    if (!text) continue;
    // Join continuation: trailing operators / open paren / open ternary.
    // Do NOT join on `=>` (function/method/switch arrow) — body is indent-based.
    while (
      i + 1 < raw.length &&
      !/=>\s*$/.test(text) &&
      (/[,(\\+\-*/%=&|?:]$/.test(text) ||
        (text.match(/\(/g) || []).length > (text.match(/\)/g) || []).length ||
        (text.match(/\[/g) || []).length > (text.match(/\]/g) || []).length)
    ) {
      i += 1;
      const next = raw[i];
      if (next == null) break;
      text = `${text} ${next.trim()}`;
    }
    out.push({ indent, text, lineNo: i + 1 });
  }
  return out;
}
