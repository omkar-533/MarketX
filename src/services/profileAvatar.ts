const KEY_PREFIX = 'wolf_profile_avatar:';
const MAX_EDGE = 384;
const JPEG_QUALITY = 0.82;

export type AvatarFilterId = 'none' | 'soft' | 'vivid' | 'bw' | 'warm' | 'cool';

const FILTER_CANVAS: Record<AvatarFilterId, string> = {
  none: 'none',
  soft: 'brightness(1.06) contrast(0.92) saturate(0.9)',
  vivid: 'brightness(1.05) contrast(1.15) saturate(1.35)',
  bw: 'grayscale(1) contrast(1.05)',
  warm: 'sepia(0.28) saturate(1.15) brightness(1.03)',
  cool: 'hue-rotate(195deg) saturate(0.85) brightness(1.04)',
};

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

export function readFileAsDataUrl(file: File): Promise<string> {
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

export async function fileToEditorSrc(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG, WebP).');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Image is too large — keep it under 8 MB.');
  }
  return readFileAsDataUrl(file);
}

/** Resize + compress so avatars stay small in localStorage. */
export async function compressProfileImage(file: File): Promise<string> {
  const raw = await fileToEditorSrc(file);
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

type ExportArgs = {
  src: string;
  /** Visible square stage size in CSS pixels (editor viewport). */
  stageSize: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  filter: AvatarFilterId;
};

/**
 * Render the editor viewport (cover-fit + pan/zoom + filter) into a square JPEG.
 * Image is shown as width = stageSize * zoom, height auto, centered then offset.
 */
export async function exportEditedAvatar({
  src,
  stageSize,
  zoom,
  offsetX,
  offsetY,
  filter,
}: ExportArgs): Promise<string> {
  const img = await loadImage(src);
  const out = MAX_EDGE;
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image');

  const scale = out / Math.max(1, stageSize);
  const drawW = stageSize * zoom * scale;
  const aspect = img.height / Math.max(1, img.width);
  const drawH = drawW * aspect;
  const dx = (out - drawW) / 2 + offsetX * scale;
  const dy = (out - drawH) / 2 + offsetY * scale;

  ctx.fillStyle = '#0b0e17';
  ctx.fillRect(0, 0, out, out);
  ctx.filter = FILTER_CANVAS[filter] || 'none';
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.filter = 'none';

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Could not export photo');
  }
  return dataUrl;
}
