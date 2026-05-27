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
  return (
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.VITE_OPENROUTER_API_KEY?.trim() ||
    ''
  );
}
