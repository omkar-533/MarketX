import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (process.env[parsed.key] === undefined || process.env[parsed.key] === '') {
      process.env[parsed.key] = parsed.value;
    }
  }
}

/** Load .env files for Node server (Vite does not pass VITE_* to server.mjs) */
export function loadServerEnv() {
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    loadEnvFile(resolve(root, name));
  }
}

export function getOpenRouterApiKey() {
  return getMasterAiApiKey();
}

function isGeminiKey(key) {
  const k = String(key || '').trim();
  return k.startsWith('AQ.') || k.startsWith('AIza') || /^AI[a-zA-Z0-9_-]{20,}$/.test(k);
}

/** All non-empty AI key env candidates (may include mislabeled sk-or in GEMINI_*). */
export function listMasterAiKeyCandidates() {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GOOGLE_AI_API_KEY,
    process.env.VITE_GEMINI_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.VITE_OPENROUTER_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.VITE_OPENAI_API_KEY,
  ]
    .map((c) => String(c || '').trim())
    .filter(Boolean);
}

/**
 * Prefer a real Gemini key when present.
 * Do not treat sk-or keys stored in GEMINI_* as Gemini — those are OpenRouter.
 */
export function getMasterAiApiKey() {
  const candidates = listMasterAiKeyCandidates();
  for (const k of candidates) {
    if (isGeminiKey(k)) return k;
  }
  // Skip OpenRouter keys parked in GEMINI_* when a dedicated OPENROUTER_* exists later —
  // still return first usable key so the server stays configured.
  for (const k of candidates) {
    if (k) return k;
  }
  return '';
}
