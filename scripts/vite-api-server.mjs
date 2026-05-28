/**
 * Vite dev plugin — auto-starts Node API (server.mjs) on port 5000 when you run npm run dev.
 */
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_URL = 'http://127.0.0.1:5000/api/health';

let apiChild = null;
let shuttingDown = false;
let watchTimer = null;

function loadEnvIntoProcess() {
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === '') process.env[key] = val;
    }
  }
}

async function isApiUp() {
  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(1200) });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

function stopApi() {
  if (!apiChild || apiChild.killed) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(apiChild.pid), '/f', '/t'], { stdio: 'ignore', shell: true });
    } else {
      apiChild.kill('SIGTERM');
    }
  } catch {
    /* ignore */
  }
  apiChild = null;
}

function startApi() {
  if (apiChild) return;
  loadEnvIntoProcess();
  apiChild = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  apiChild.on('exit', (code) => {
    apiChild = null;
    if (!shuttingDown) {
      console.warn(`[vite-api] API server exited (code ${code ?? 0}) — restarting in 2s…`);
      setTimeout(() => {
        if (!shuttingDown) void ensureApiRunning();
      }, 2000);
    }
  });
}

async function ensureApiRunning() {
  if (await isApiUp()) return true;
  console.log('[vite-api] Starting API on http://127.0.0.1:5000 …');
  startApi();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isApiUp()) {
      console.log('[vite-api] API ready ✓ (Fyers login will work)');
      return true;
    }
  }
  console.error('[vite-api] API failed to start — run: npm run server');
  return false;
}

function bindShutdown() {
  const stop = () => {
    shuttingDown = true;
    stopApi();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.once('exit', stop);
}

export function apiServerPlugin() {
  return {
    name: 'vite-api-server',
    apply: 'serve',
    async configureServer() {
      bindShutdown();
      await ensureApiRunning();
      watchTimer = setInterval(() => {
        if (!shuttingDown) void ensureApiRunning();
      }, 20_000);
    },
  };
}
