/** Normalize user/admin-pasted http(s) URLs for safe external navigation. */
export function normalizeExternalUrl(raw: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
    const u = new URL(withProtocol);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Open an external URL outside the SPA.
 * `target=_blank` alone often fails in iOS/Android installed PWAs — force open.
 */
export function openExternalUrl(raw: string): boolean {
  const href = normalizeExternalUrl(raw);
  if (!href) return false;

  const win = window.open(href, '_blank', 'noopener,noreferrer');
  if (win) return true;

  try {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    window.location.assign(href);
    return true;
  }
}
