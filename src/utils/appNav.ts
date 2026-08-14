/**
 * Hash routes the SPA already honors (`#live-wolf`, `#wolf-radar?…`).
 * Real hrefs unlock the browser's native Open in new tab / middle-click.
 */

export type AppNavQuery = Record<string, string | number | undefined | null>;

export function tabHref(tab: string, query?: AppNavQuery): string {
  const id = String(tab || '').trim();
  if (!id) return '#wolf-opportunity';
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value == null || value === '') continue;
      params.set(key, String(value));
    }
  }
  const q = params.toString();
  return q ? `#${id}?${q}` : `#${id}`;
}

export function parseHashQuery(hash = window.location.hash): URLSearchParams {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const cut = raw.search(/[?&]/);
  if (cut < 0) return new URLSearchParams();
  const rest = raw.slice(cut);
  return new URLSearchParams(rest.startsWith('?') ? rest : `?${rest.replace(/^&/, '')}`);
}

export function liveWolfQuery(hit: {
  symbol: string;
  exchange?: string;
  timeframe?: string;
}): AppNavQuery {
  return {
    symbol: hit.symbol,
    exchange: hit.exchange || 'NSE',
    tf: hit.timeframe || '5m',
  };
}

export function isPlainLeftClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
