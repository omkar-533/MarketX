import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const PORTS_TO_FREE = [5000, 5173, 5174, 5175, 5176];

console.log('Freeing ports (API + old Vite instances)…');
for (const port of PORTS_TO_FREE) {
  try {
    execSync(`node scripts/free-port.mjs ${port}`, { cwd: root, stdio: 'inherit' });
  } catch {
    /* continue */
  }
}

const children = [];

function run(name, script) {
  const child = spawn(npmCmd, ['run', script], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code) => {
    console.log(`[${name}] stopped (code ${code ?? 0})`);
  });
  children.push(child);
  return child;
}

console.log('\nStarting API server (port 5000) + Vite (port 5173)…\n');
console.log('  App:  http://localhost:5173');
console.log('  API:  http://localhost:5000');
console.log('  Fyers: Profile → Connect (if not connected)');
console.log('  Press Ctrl+C to stop both.\n');

run('server', 'server');
setTimeout(() => run('vite', 'dev'), 1500);

function shutdown() {
  for (const c of children) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
