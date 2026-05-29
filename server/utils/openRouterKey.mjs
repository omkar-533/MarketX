import { getOpenRouterApiKey } from '../loadEnv.mjs';

export function resolveOpenRouterKey(req) {
  const raw = req?.headers?.['x-openrouter-key'];
  const fromHeader =
    typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] || '').trim() : '';
  return fromHeader || getOpenRouterApiKey();
}
