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

export type LogoBoxFill = {
  fill: string;
  cropSrc: string | null;
  box: { x: number; y: number; w: number; h: number };
};

const boxFillCache = new Map<string, LogoBoxFill | null>();

function readPx(data: Uint8ClampedArray, w: number, x: number, y: number): [number, number, number, number] {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

/** White / light-gray canvas or fully transparent — not the brand square. */
export function isLogoCanvasPadding(p: ArrayLike<number>): boolean {
  if (p[3] < 168) return true;
  const min = Math.min(p[0], p[1], p[2]);
  const max = Math.max(p[0], p[1], p[2]);
  return min >= 228 && max - min <= 28;
}

function contentBox(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isLogoCanvasPadding(readPx(data, w, x, y))) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  if (bw < 6 || bh < 6) return null;
  const aspect = bw / bh;
  if (aspect < 0.62 || aspect > 1.62) return null;
  return { x: minX, y: minY, w: bw, h: bh };
}

function boxCoverage(
  data: Uint8ClampedArray,
  w: number,
  box: { x: number; y: number; w: number; h: number },
): number {
  let filled = 0;
  const x1 = box.x + box.w;
  const y1 = box.y + box.h;
  for (let y = box.y; y < y1; y++) {
    for (let x = box.x; x < x1; x++) {
      if (!isLogoCanvasPadding(readPx(data, w, x, y))) filled++;
    }
  }
  return filled / (box.w * box.h);
}

/** Solid square (NMDC / ALKEM) fills its bbox; a circle is ~0.785. */
const SQUARE_COVERAGE = 0.84;

function dominantBorderFill(
  data: Uint8ClampedArray,
  w: number,
  box: { x: number; y: number; w: number; h: number },
): string | null {
  const inset = Math.max(1, Math.round(Math.min(box.w, box.h) * 0.08));
  const x0 = box.x + inset;
  const y0 = box.y + inset;
  const x1 = box.x + box.w - 1 - inset;
  const y1 = box.y + box.h - 1 - inset;
  if (x1 <= x0 || y1 <= y0) return null;

  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  const add = (x: number, y: number) => {
    const p = readPx(data, w, x, y);
    if (isLogoCanvasPadding(p)) return;
    total++;
    const key = ((p[0] >> 4) << 8) | ((p[1] >> 4) << 4) | (p[2] >> 4);
    const cur = buckets.get(key);
    if (cur) {
      cur.n++;
      cur.r += p[0];
      cur.g += p[1];
      cur.b += p[2];
    } else {
      buckets.set(key, { n: 1, r: p[0], g: p[1], b: p[2] });
    }
  };
  for (let x = x0; x <= x1; x++) {
    add(x, y0);
    add(x, y1);
  }
  for (let y = y0 + 1; y < y1; y++) {
    add(x0, y);
    add(x1, y);
  }
  if (total < 8) return null;
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const b of buckets.values()) {
    if (!best || b.n > best.n) best = b;
  }
  if (!best || best.n / total < 0.42) return null;
  const fill = [
    Math.round(best.r / best.n),
    Math.round(best.g / best.n),
    Math.round(best.b / best.n),
    255,
  ];
  if (isLogoCanvasPadding(fill)) return null;
  return `rgb(${fill[0]}, ${fill[1]}, ${fill[2]})`;
}

/**
 * Find the inner solid square (ALKEM blue box, NMDC rounded square on a white canvas).
 * Round / transparent marks return null so the disc stays unchanged.
 */
export function inspectLogoBoxPixels(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { fill: string; box: { x: number; y: number; w: number; h: number } } | null {
  if (!(w >= 8 && h >= 8) || data.length < w * h * 4) return null;
  const box = contentBox(data, w, h);
  if (!box) return null;
  if (boxCoverage(data, w, box) < SQUARE_COVERAGE) return null;
  const fill = dominantBorderFill(data, w, box);
  if (!fill) return null;
  return { fill, box };
}

function cropBoxToDataUrl(
  img: CanvasImageSource,
  box: { x: number; y: number; w: number; h: number },
): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = box.w;
    canvas.height = box.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function inspectLogoBox(
  img: { naturalWidth: number; naturalHeight: number } & CanvasImageSource,
): LogoBoxFill | null | undefined {
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!(w >= 8 && h >= 8)) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    let pixels: ImageData;
    try {
      pixels = ctx.getImageData(0, 0, w, h);
    } catch {
      return undefined;
    }
    const found = inspectLogoBoxPixels(pixels.data, w, h);
    if (!found) return null;
    return {
      fill: found.fill,
      box: found.box,
      cropSrc: cropBoxToDataUrl(img, found.box),
    };
  } catch {
    return undefined;
  }
}

export function readCachedLogoBoxFill(src: string): LogoBoxFill | null | undefined {
  if (!src) return null;
  return boxFillCache.has(src) ? boxFillCache.get(src) : undefined;
}

export function rememberLogoBoxFill(src: string, value: LogoBoxFill | null): void {
  if (src) boxFillCache.set(src, value);
}

export function probeLogoBoxFill(src: string): Promise<LogoBoxFill | null> {
  const cached = readCachedLogoBoxFill(src);
  if (cached !== undefined) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.referrerPolicy = 'no-referrer';
    probe.onload = () => {
      const found = inspectLogoBox(probe);
      if (found === undefined) {
        resolve(null);
        return;
      }
      rememberLogoBoxFill(src, found);
      resolve(found);
    };
    probe.onerror = () => {
      rememberLogoBoxFill(src, null);
      resolve(null);
    };
    probe.src = src;
  });
}
