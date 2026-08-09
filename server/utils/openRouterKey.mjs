import { getMasterAiApiKey, listMasterAiKeyCandidates } from '../loadEnv.mjs';

function detectProvider(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return null;
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-')) return 'openai';
  if (key.startsWith('AQ.') || key.startsWith('AIza') || /^AI[a-zA-Z0-9_-]{20,}$/.test(key)) {
    return 'gemini';
  }
  return null;
}

function readHeader(req, name) {
  const raw = req?.headers?.[name];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return '';
}

/**
 * Collect every usable AI key from request + env.
 * Priority: Gemini keys ALWAYS beat OpenRouter/OpenAI keys — Profile may still
 * hold an old free sk-or key while a Gemini key sits in Render env (or vice versa).
 */
export function collectAiKeys(req) {
  const seen = new Set();
  const out = [];
  const add = (raw, source) => {
    const key = String(raw || '').trim();
    if (!key || seen.has(key)) return;
    const provider = detectProvider(key);
    if (!provider) return;
    seen.add(key);
    out.push({ key, provider, source });
  };

  add(readHeader(req, 'x-gemini-key'), 'header-gemini');
  add(readHeader(req, 'x-master-ai-key'), 'header-master');
  add(readHeader(req, 'x-openrouter-key'), 'header-openrouter');

  for (const envKey of listMasterAiKeyCandidates()) {
    add(envKey, 'env');
  }
  // Backward-compatible single getter (may duplicate; add() dedupes).
  add(getMasterAiApiKey(), 'env');

  const gemini = out.filter((k) => k.provider === 'gemini');
  const rest = out.filter((k) => k.provider !== 'gemini');
  return [...gemini, ...rest];
}

/** Primary key for a request — Gemini preferred when available. */
export function resolveOpenRouterKey(req) {
  return collectAiKeys(req)[0]?.key || '';
}

/** Ordered fallback chain (Gemini first, then others). */
export function resolveAiKeyChain(req) {
  return collectAiKeys(req).map((k) => k.key);
}

export function isAiCreditError(err) {
  const status = err?.status ?? err?.statusCode;
  if (status === 402) return true;
  const msg = String(err?.message ?? err ?? '');
  return /402|Prompt tokens limit|sufficient credits|upgrade to a paid|max.?prompt tokens/i.test(msg);
}
