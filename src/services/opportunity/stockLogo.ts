/**
 * Public company marks for Opportunity tiles.
 * Never invents prices — logos are display-only. Missing mark → initials.
 */

const INDEX_FAVICON: Record<string, string> = {
  NIFTY: 'www.nseindia.com',
  NIFTY50: 'www.nseindia.com',
  BANKNIFTY: 'www.nseindia.com',
  FINNIFTY: 'www.nseindia.com',
  MIDCPNIFTY: 'www.nseindia.com',
  SENSEX: 'www.nseindia.com',
};

function gstaticFavicon(domain: string): string {
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${encodeURIComponent(domain)}&size=128`;
}

export function nseLogoSymbol(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/^(NSE:|BSE:|NFO:)/, '');
}

export function stockLogoInitials(raw: string): string {
  const s = nseLogoSymbol(raw);
  if (s === 'BANKNIFTY') return 'BN';
  if (s === 'FINNIFTY') return 'FN';
  if (s === 'MIDCPNIFTY') return 'MN';
  if (s === 'SENSEX') return 'SX';
  if (s.startsWith('NIFTY')) return 'N';
  const compact = s.replace(/[^A-Z0-9]/g, '');
  if (!compact) return '?';
  if (compact.length <= 2) return compact;
  return compact.slice(0, 2);
}

/** Ordered CDN candidates. First that loads wins. */
export function stockLogoSources(raw: string): string[] {
  const symbol = nseLogoSymbol(raw);
  if (!symbol) return [];
  const out: string[] = [];
  const domain = INDEX_FAVICON[symbol];
  if (domain) out.push(gstaticFavicon(domain));
  const code = encodeURIComponent(symbol);
  out.push(`https://assets-netstorage.groww.in/stock-assets/logos2/${code}.webp`);
  if (!domain) {
    out.push(`https://financialmodelingprep.com/image-stock/${code}.NS.png`);
  }
  return out;
}
