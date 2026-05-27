let sessionCookies = '';
let sessionAt = 0;
const SESSION_TTL_MS = 5 * 60 * 1000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function ensureNseSession() {
  if (sessionCookies && Date.now() - sessionAt < SESSION_TTL_MS) return sessionCookies;

  const res = await fetch('https://www.nseindia.com/', {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    sessionCookies = setCookie.map((c) => c.split(';')[0]).join('; ');
  } else {
    const raw = res.headers.get('set-cookie');
    if (raw) sessionCookies = raw.split(',').map((c) => c.split(';')[0].trim()).join('; ');
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
      Cookie: cookies,
    },
  });
  if (!res.ok) throw new Error(`NSE HTTP ${res.status}`);
  return res.json();
}
