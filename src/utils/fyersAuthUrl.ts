/** Fyers auth_code is a one-time JWT-like string (not the callback URL). */
export function isPlausibleFyersAuthCode(code: string): boolean {
  const c = code.trim();
  if (!c || c.length < 40) return false;
  if (/^https?:\/\//i.test(c)) return false;
  if (c.includes('/api/fyers/callback') && !c.includes('auth_code')) return false;
  return /^eyJ[\w-]*\.[\w-]*\.[\w-]*/.test(c) || c.length >= 80;
}

/** Strip trailing &state= from pasted auth_code JWT */
export function stripAuthCodeSuffix(raw: string): string {
  let s = raw.trim();
  const stateIdx = s.indexOf('&state=');
  if (stateIdx > 0 && /^eyJ/i.test(s)) s = s.slice(0, stateIdx);
  return s;
}

export function normalizeFyersAuthInput(raw: string): string {
  const trimmed = stripAuthCodeSuffix(raw);
  if (!trimmed) return '';
  const extracted = extractFyersAuthCode(
    trimmed.includes('auth_code') ? trimmed : `http://local/?auth_code=${trimmed}`,
  );
  if (extracted && isPlausibleFyersAuthCode(extracted)) return extracted;
  if (isPlausibleFyersAuthCode(trimmed)) return trimmed;
  return '';
}

/** Extract Fyers OAuth auth_code from current page URL (query or hash). */
export function extractFyersAuthCode(href = window.location.href): string {
  try {
    const url = new URL(href);
    const keys = ['auth_code', 'code', 'authCode'];
    for (const key of keys) {
      const fromQuery = url.searchParams.get(key);
      if (fromQuery?.trim()) return fromQuery.trim();
    }
    const hash = url.hash.replace(/^#/, '');
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      for (const key of keys) {
        const fromHash = hashParams.get(key);
        if (fromHash?.trim()) return fromHash.trim();
      }
      // auth_code=eyJ... without leading ?
      const m = hash.match(/(?:^|&)auth_code=([^&]+)/i);
      if (m?.[1]) return decodeURIComponent(m[1]).trim();
    }
    // Pasted full redirect URL
    const pasted = href.match(/[?&#]auth_code=([^&#]+)/i);
    if (pasted?.[1]) return decodeURIComponent(pasted[1]).trim();
  } catch {
    /* ignore */
  }
  return '';
}

export function clearFyersAuthFromUrl(): void {
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of ['auth_code', 'code', 'authCode']) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (url.hash) {
    const hp = new URLSearchParams(url.hash.replace(/^#/, ''));
    for (const key of ['auth_code', 'code', 'authCode']) {
      hp.delete(key);
    }
    const nextHash = hp.toString();
    url.hash = nextHash ? `#${nextHash}` : '';
    changed = true;
  }
  if (changed) {
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }
}
