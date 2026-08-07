/**
 * Clean indicator list blurbs — TradingView community scripts often stuff
 * markdown docs / title banners into `description`. Strip that for UI display.
 */

export function stripMarkdownNoise(raw: string): string {
  let text = String(raw || '')
    .replace(/\r\n/g, '\n')
    // HTML / markdown headings
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Pine / TV banner leftovers
    .replace(/\/\/\s*@version[^\n]*/gi, '')
    .replace(/indicator\s*\([^)]*\)/gi, '');

  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text;
}

/** Short one-line blurb for Indicators modal rows. */
export function sanitizeIndicatorDescription(
  raw: string | null | undefined,
  fallback = 'Plots on Terminal chart',
): string {
  const cleaned = stripMarkdownNoise(raw || '');
  if (!cleaned) return fallback;
  // Drop lines that are still just branding headers
  if (/^wolf trade ai\b/i.test(cleaned) && cleaned.length < 80) return fallback;
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}…` : cleaned;
}

/** True when description looks like pasted Pine/markdown docs, not a short blurb. */
export function looksLikePastedScriptDocs(raw: string | null | undefined): boolean {
  const s = String(raw || '');
  if (s.length > 280) return true;
  if (/^#{1,3}\s/m.test(s)) return true;
  if (/\*\*[^*]+\*\*/.test(s) && s.includes('##')) return true;
  if (/\/\/\s*@version/i.test(s)) return true;
  return false;
}
