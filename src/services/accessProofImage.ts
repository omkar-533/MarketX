/** Proof screenshots are re-encoded to JPEG so the upload stays small and predictable. */
const MAX_INPUT_BYTES = 14 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const QUALITY = 0.82;

export const ACCESS_PROOF_ACCEPT = 'image/png,image/jpeg,image/webp';

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

export async function prepareAccessProof(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Upload an image (PNG, JPG or WebP)');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image too large (max 14 MB)');
  }

  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', QUALITY);
}
