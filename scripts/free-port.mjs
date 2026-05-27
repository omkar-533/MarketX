import { execSync } from 'child_process';

const port = Number(process.argv[2] || 5000);

function freePortWin(p) {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
      { encoding: 'utf8' },
    );
    const pids = out
      .split(/\r?\n/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n !== process.pid);
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`[free-port] Stopped PID ${pid} on port ${p}`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* port free */
  }
}

function freePortUnix(p) {
  try {
    execSync(`fuser -k ${p}/tcp 2>/dev/null || lsof -ti:${p} | xargs kill -9 2>/dev/null`, {
      stdio: 'ignore',
      shell: true,
    });
  } catch {
    /* ignore */
  }
}

if (process.platform === 'win32') freePortWin(port);
else freePortUnix(port);
