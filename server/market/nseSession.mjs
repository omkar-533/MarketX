let sessionCookies = '';
let sessionAt = 0;
const SESSION_TTL_MS = 5 * 60 * 1000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function mergeSetCookie(res) {
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    const next = setCookie.map((c) => c.split(';')[0]);
    const map = new Map();
    for (const part of (sessionCookies ? sessionCookies.split('; ') : []).concat(next)) {
      const [k, ...rest] = part.split('=');
      if (k) map.set(k.trim(), rest.join('='));
    }
    sessionCookies = [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    return;
  }
  const raw = res.headers.get('set-cookie');
  if (raw) {
    const pieces = raw.split(/,(?=\s*[^;]+=)/).map((c) => c.split(';')[0].trim());
    const map = new Map();
    for (const part of (sessionCookies ? sessionCookies.split('; ') : []).concat(pieces)) {
      const [k, ...rest] = part.split('=');
      if (k) map.set(k.trim(), rest.join('='));
    }
    sessionCookies = [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

export async function ensureNseSession() {
  if (sessionCookies && Date.now() - sessionAt < SESSION_TTL_MS) return sessionCookies;

  // Warm cookies from home + option-chain page (NSE Akamai often needs both)
  for (const url of ['https://www.nseindia.com/', 'https://www.nseindia.com/option-chain']) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    mergeSetCookie(res);
  }

  sessionAt = Date.now();
  return sessionCookies;
}

export async function nseGetJson(path, referer = 'https://www.nseindia.com/') {
  const cookies = await ensureNseSession();
  const url = path.startsWith('http') ? path : `https://www.nseindia.com${path}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: referer,
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookies,
    },
  });
  mergeSetCookie(res);
  if (!res.ok) throw new Error(`NSE HTTP ${res.status}`);
  return res.json();
}
