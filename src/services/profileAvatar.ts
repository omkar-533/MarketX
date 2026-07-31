const KEY_PREFIX = 'wolf_profile_avatar:';
const MAX_EDGE = 384;
const JPEG_QUALITY = 0.82;

function storageKey(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

/** Load saved profile photo for this account (data URL). */
export function loadProfileAvatar(userId: string | undefined | null): string | undefined {
  if (!userId || typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw || !raw.startsWith('data:image/')) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

export function saveProfileAvatar(userId: string, dataUrl: string) {
  localStorage.setItem(storageKey(userId), dataUrl);
}

export function clearProfileAvatar(userId: string) {
  localStorage.removeItem(storageKey(userId));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid image'));
    img.src = src;
  });
}

/** Resize + compress so avatars stay small in localStorage. */
export async function compressProfileImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG, WebP).');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Image is too large — keep it under 8 MB.');
  }

  const raw = await readFileAsDataUrl(file);
  const img = await loadImage(raw);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image');
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Could not compress image');
  }
  return dataUrl;
}
