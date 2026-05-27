/** Chart screenshot upload — JPEG, PNG, WebP, GIF, BMP, HEIC, AVIF, SVG */
export const MASTER_AI_IMAGE_ACCEPT =
  'image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic,.heif,.avif,.svg';

const ALLOWED_EXT = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'heic',
  'heif',
  'avif',
  'svg',
]);

export const MASTER_AI_MAX_IMAGE_BYTES = 14 * 1024 * 1024;

export function isSupportedChartImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';
  return Boolean(ext && ALLOWED_EXT.has(ext));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid image data'));
    img.src = src;
  });
}

/** Resize/compress large charts so vision API stays fast */
async function compressDataUrl(dataUrl: string, maxDim = 2048, quality = 0.88): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl;
  if (dataUrl.startsWith('data:image/svg')) return dataUrl;

  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale >= 1 && dataUrl.length < 2_000_000) return dataUrl;

  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/jpeg', quality);
  return out.length < dataUrl.length ? out : dataUrl;
}

export async function prepareChartImageForAi(
  file: File,
): Promise<{ dataUrl: string; fileName: string }> {
  if (!isSupportedChartImage(file)) {
    throw new Error('Unsupported format. Use JPG, PNG, WebP, GIF, BMP, HEIC, AVIF, or SVG.');
  }
  if (file.size > MASTER_AI_MAX_IMAGE_BYTES) {
    throw new Error('Image too large (max 14 MB). Try a smaller screenshot.');
  }

  let dataUrl = await readFileAsDataUrl(file);
  if (file.size > 900_000) {
    dataUrl = await compressDataUrl(dataUrl);
  }

  return { dataUrl, fileName: file.name };
}
