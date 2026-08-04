/** Proof screenshots are re-encoded to JPEG so the upload stays small and predictable. */
const MAX_INPUT_BYTES = 14 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const QUALITY = 0.78;

/** Broad accept — phones often return empty MIME or HEIC. */
export const ACCESS_PROOF_ACCEPT = 'image/*,image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a valid image'));
    img.src = src;
  });
}

function looksLikeHeic(file: File) {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return (
    type.includes('heic') ||
    type.includes('heif') ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

export async function prepareAccessProof(file: File): Promise<string> {
  if (!file || file.size <= 0) {
    throw new Error('Choose a screenshot image first');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image too large (max 14 MB)');
  }
  if (looksLikeHeic(file)) {
    throw new Error('iPhone HEIC not supported — take a Screenshot or export as JPG/PNG, then upload');
  }

  const type = (file.type || '').toLowerCase();
  // Some Android galleries send an empty MIME; still try to decode by bytes.
  if (type && !type.startsWith('image/') && type !== 'application/octet-stream') {
    throw new Error('Upload an image (PNG, JPG or WebP)');
  }

  const dataUrl = await readAsDataUrl(file);
  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    throw new Error('Could not open that file as an image. Use PNG, JPG or WebP.');
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (dataUrl.startsWith('data:image/')) return dataUrl;
    throw new Error('Could not process that image on this device');
  }

  ctx.fillStyle = '#0b0e17';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  let out = canvas.toDataURL('image/jpeg', QUALITY);
  // Keep under server 4 MB decoded limit (~3 MB data-url is safe).
  if (out.length > 3_500_000) {
    out = canvas.toDataURL('image/jpeg', 0.62);
  }
  if (out.length > 3_500_000) {
    out = canvas.toDataURL('image/jpeg', 0.48);
  }
  return out;
}
