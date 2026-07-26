const STORAGE_KEY = 'master_openrouter_api_key';

export const OPENROUTER_KEY_UPDATED_EVENT = 'tradeflow:openrouter-key-updated';

/** OpenRouter: sk-or-… · OpenAI API (platform.openai.com): sk-… · ChatGPT Plus is NOT an API key */
export type MasterAiKeyProvider = 'openrouter' | 'openai' | null;

export function detectMasterAiKeyProvider(key: string): MasterAiKeyProvider {
  const k = key.trim();
  if (!k) return null;
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}

export function isValidMasterAiKey(key: string): boolean {
  return detectMasterAiKeyProvider(key) !== null;
}

export function loadOpenRouterApiKey(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY)?.trim() || '';
}

export function saveOpenRouterApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = key.trim();
  if (trimmed) window.localStorage.setItem(STORAGE_KEY, trimmed);
  else window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(OPENROUTER_KEY_UPDATED_EVENT));
}

export function clearOpenRouterApiKey(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function maskOpenRouterApiKey(key: string): string {
  if (!key) return '';
  if (key.length < 12) return '••••••••';
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}

/** Sent to server on Master AI requests (Profile-saved OpenAI or OpenRouter key). */
export function openRouterRequestHeaders(): Record<string, string> {
  const key = loadOpenRouterApiKey();
  return key ? { 'X-OpenRouter-Key': key } : {};
}
