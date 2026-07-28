import { getMasterAiApiKey } from '../loadEnv.mjs';

export function resolveOpenRouterKey(req) {
  const headerNames = ['x-openrouter-key', 'x-gemini-key', 'x-master-ai-key'];
  for (const name of headerNames) {
    const raw = req?.headers?.[name];
    const fromHeader =
      typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] || '').trim() : '';
    if (fromHeader) return fromHeader;
  }
  return getMasterAiApiKey();
}
