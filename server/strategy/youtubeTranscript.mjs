/**
 * Public YouTube captions for Strategy Lab (NotebookLM-style).
 * Never downloads the video file. Never invents prices.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const TRANSCRIPT_CAP = 16_000;

export function extractYouTubeVideoId(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;
  const fromUrl = (href) => {
    try {
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      if (host === 'youtu.be') {
        const id = u.pathname.split('/').filter(Boolean)[0];
        return id && /^[\w-]{11}$/.test(id) ? id : null;
      }
      if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
        const v = u.searchParams.get('v');
        if (v && /^[\w-]{11}$/.test(v)) return v;
        const parts = u.pathname.split('/').filter(Boolean);
        const i = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live' || p === 'v');
        if (i >= 0 && parts[i + 1] && /^[\w-]{11}$/.test(parts[i + 1])) return parts[i + 1];
      }
    } catch {
      return null;
    }
    return null;
  };
  if (/^https?:\/\//i.test(s)) return fromUrl(s);
  const prefixed = fromUrl(`https://${s.replace(/^\/+/, '')}`);
  if (prefixed) return prefixed;
  const m = s.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/i,
  );
  return m ? m[1] : null;
}

export function extractYouTubeUrlFromText(text) {
  const s = String(text || '');
  const m = s.match(
    /https?:\/\/(?:www\.)?(?:youtube\.com\/[^\s]+|youtu\.be\/[^\s]+)/i,
  ) || s.match(/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+)/i);
  return m ? m[0].replace(/[),.;]+$/, '') : null;
}

export function stripYoutubeUrls(text) {
  return String(text || '')
    .replace(/https?:\/\/(?:www\.)?(?:youtube\.com\/\S+|youtu\.be\/\S+)/gi, ' ')
    .replace(/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeCaptionEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/<[^>]+>/g, ' ');
}

export function parseTimedTextXml(xml) {
  const chunks = [];
  const re = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    const line = decodeCaptionEntities(m[1]).replace(/\s+/g, ' ').trim();
    if (line) chunks.push(line);
  }
  return chunks.join(' ');
}

export function parseJson3Captions(json) {
  const events = Array.isArray(json?.events) ? json.events : [];
  const chunks = [];
  for (const ev of events) {
    const segs = Array.isArray(ev?.segs) ? ev.segs : [];
    for (const seg of segs) {
      const line = decodeCaptionEntities(seg?.utf8 || '').replace(/\s+/g, ' ').trim();
      if (line && line !== '\n') chunks.push(line);
    }
  }
  return chunks.join(' ').replace(/\s+/g, ' ').trim();
}

function pickCaptionTrack(tracks) {
  const list = Array.isArray(tracks) ? tracks : [];
  const score = (t) => {
    const lang = String(t?.languageCode || '').toLowerCase();
    const asr = String(t?.kind || '').toLowerCase() === 'asr';
    let n = 1;
    if (lang === 'en' || lang.startsWith('en-')) n = asr ? 4 : 5;
    else if (lang === 'hi' || lang.startsWith('hi-')) n = asr ? 2 : 3;
    else if (asr) n = 1;
    return n;
  };
  return [...list].sort((a, b) => score(b) - score(a))[0] || null;
}

export function capTranscript(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= TRANSCRIPT_CAP) return t;
  return `${t.slice(0, TRANSCRIPT_CAP)}…`;
}

async function fetchCaptionBody(baseUrl) {
  const url = new URL(baseUrl);
  if (!url.searchParams.get('fmt')) url.searchParams.set('fmt', 'json3');
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8' },
  });
  if (!res.ok) return '';
  const raw = await res.text();
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      return parseJson3Captions(JSON.parse(trimmed));
    } catch {
      return '';
    }
  }
  return parseTimedTextXml(raw);
}

async function innertubeTracks(videoId) {
  const clients = [
    { clientName: 'WEB', clientVersion: '2.20240815.00.00' },
    { clientName: 'ANDROID', clientVersion: '19.29.37' },
  ];
  for (const client of clients) {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
      },
      body: JSON.stringify({
        videoId,
        context: { client: { ...client, hl: 'en', gl: 'IN' } },
      }),
    });
    if (!res.ok) continue;
    const json = await res.json().catch(() => ({}));
    const tracks = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (tracks.length) return tracks;
  }
  return [];
}

async function fetchTimedTextFallbacks(videoId) {
  const langs = ['en', 'en-US', 'hi', 'hi-IN'];
  const kinds = ['', 'asr'];
  for (const lang of langs) {
    for (const kind of kinds) {
      const url = new URL('https://www.youtube.com/api/timedtext');
      url.searchParams.set('v', videoId);
      url.searchParams.set('lang', lang);
      url.searchParams.set('fmt', 'json3');
      if (kind) url.searchParams.set('kind', kind);
      const text = capTranscript(await fetchCaptionBody(url.toString()));
      if (text.length >= 80) {
        return { videoId, language: lang, text, via: kind === 'asr' ? 'asr' : 'timedtext' };
      }
    }
  }
  return null;
}

/**
 * @returns {{ videoId: string, language: string, text: string, via?: string } | null}
 */
export async function fetchYouTubeTranscript(videoIdOrUrl) {
  const videoId = extractYouTubeVideoId(videoIdOrUrl);
  if (!videoId) return null;
  const tracks = await innertubeTracks(videoId);
  const track = pickCaptionTrack(tracks);
  if (track?.baseUrl) {
    const text = capTranscript(await fetchCaptionBody(track.baseUrl));
    if (text.length >= 80) {
      return {
        videoId,
        language: String(track.languageCode || ''),
        text,
        via: String(track.kind || '') === 'asr' ? 'asr' : 'captions',
      };
    }
  }
  return fetchTimedTextFallbacks(videoId);
}
