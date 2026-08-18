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
  if (p[3] < 200) return true;
  const min = Math.min(p[0], p[1], p[2]);
  const max = Math.max(p[0], p[1], p[2]);
  return min >= 238 && max - min <= 22;
}

function cornerDelta(pixels: ArrayLike<number>[], avg: number[]): number {
  let max = 0;
  for (const p of pixels) {
    const d = Math.abs(p[0] - avg[0]) + Math.abs(p[1] - avg[1]) + Math.abs(p[2] - avg[2]);
    if (d > max) max = d;
  }
  return max;
}

function averageRgb(pixels: ArrayLike<number>[]): string {
  const avg = [0, 0, 0];
  for (const p of pixels) {
    avg[0] += p[0];
    avg[1] += p[1];
    avg[2] += p[2];
  }
  const n = pixels.length;
  return `rgb(${Math.round(avg[0] / n)}, ${Math.round(avg[1] / n)}, ${Math.round(avg[2] / n)})`;
}

/**
 * Find the inner solid square (ALKEM blue box on a white canvas).
 * Round / transparent marks return null so the disc stays unchanged.
 */
export function inspectLogoBoxPixels(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { fill: string; box: { x: number; y: number; w: number; h: number } } | null {
  if (!(w >= 8 && h >= 8) || data.length < w * h * 4) return null;

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

  const inset = Math.max(1, Math.round(Math.min(bw, bh) * 0.08));
  const spots: Array<[number, number]> = [
    [minX + inset, minY + inset],
    [maxX - inset, minY + inset],
    [minX + inset, maxY - inset],
    [maxX - inset, maxY - inset],
  ];
  const pixels = spots.map(([x, y]) => readPx(data, w, x, y));
  // Circle / irregular mark: bounding-box corners are still canvas padding.
  if (pixels.some((p) => isLogoCanvasPadding(p))) return null;
  const avg = [0, 0, 0];
  for (const p of pixels) {
    avg[0] += p[0];
    avg[1] += p[1];
    avg[2] += p[2];
  }
  avg[0] /= 4;
  avg[1] /= 4;
  avg[2] /= 4;
  if (cornerDelta(pixels, avg) > 42) return null;
  // Do not treat a white canvas as the brand square.
  if (isLogoCanvasPadding([avg[0], avg[1], avg[2], 255])) return null;

  return {
    fill: averageRgb(pixels),
    box: { x: minX, y: minY, w: bw, h: bh },
  };
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
): LogoBoxFill | null {
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
    const found = inspectLogoBoxPixels(ctx.getImageData(0, 0, w, h).data, w, h);
    if (!found) return null;
    return {
      fill: found.fill,
      box: found.box,
      cropSrc: cropBoxToDataUrl(img, found.box),
    };
  } catch {
    return null;
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
