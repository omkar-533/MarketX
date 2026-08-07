/**
 * Encrypt Pine Script at rest. Members never receive plaintext (API omits it);
 * admins get decrypted source only via admin endpoints.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';

function keyMaterial() {
  const secret =
    process.env.PINE_SOURCE_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'wolf-pine-dev-key-change-me';
  return createHash('sha256').update(secret).digest();
}

/** Store-ready ciphertext (or empty). Idempotent if already encrypted. */
export function encryptPineSource(plain) {
  const text = String(plain ?? '').trim();
  if (!text) return '';
  if (text.startsWith(PREFIX)) return text;
  const iv = randomBytes(12);
  const key = keyMaterial();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

/** Plain Pine for settings parse / admin editor. Legacy plaintext passes through. */
export function decryptPineSource(stored) {
  const raw = String(stored ?? '').trim();
  if (!raw) return '';
  if (!raw.startsWith(PREFIX)) return raw;
  try {
    const parts = raw.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return '';
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const data = Buffer.from(dataB64, 'base64url');
    const key = keyMaterial();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function isEncryptedPineSource(stored) {
  return String(stored ?? '').startsWith(PREFIX);
}
