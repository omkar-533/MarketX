const STORAGE_KEY = 'master_openrouter_api_key';

export const OPENROUTER_KEY_UPDATED_EVENT = 'tradeflow:openrouter-key-updated';

/** Gemini AIza… · OpenRouter sk-or-… · OpenAI sk-… · ChatGPT Plus is NOT an API key */
export type MasterAiKeyProvider = 'gemini' | 'openrouter' | 'openai' | null;

export function detectMasterAiKeyProvider(key: string): MasterAiKeyProvider {
  const k = key.trim();
  if (!k) return null;
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('sk-')) return 'openai';
  if (k.startsWith('AIza') || /^AI[a-zA-Z0-9_-]{20,}$/.test(k)) return 'gemini';
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

/** Sent to server on Master AI requests (Profile-saved Gemini / OpenAI / OpenRouter key). */
export function openRouterRequestHeaders(): Record<string, string> {
  const key = loadOpenRouterApiKey();
  if (!key) return {};
  const provider = detectMasterAiKeyProvider(key);
  if (provider === 'gemini') {
    return { 'X-Gemini-Key': key, 'X-OpenRouter-Key': key };
  }
  return { 'X-OpenRouter-Key': key };
}
