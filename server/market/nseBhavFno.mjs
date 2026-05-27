import { execSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { platform } from 'os';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function yyyymmdd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function bhavUrl(dateKey) {
  return `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${dateKey}_F_0000.csv.zip`;
}

function extractZip(zipBuf) {
  const dir = mkdtempSync(join(tmpdir(), 'nse-bhav-'));
  const zipPath = join(dir, 'bhav.zip');
  const outDir = join(dir, 'out');
  writeFileSync(zipPath, zipBuf);
  try {
    if (platform() === 'win32') {
      const esc = (p) => p.replace(/'/g, "''");
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${esc(zipPath)}' -DestinationPath '${esc(outDir)}' -Force"`,
        { stdio: 'pipe' },
      );
    } else {
      execSync(`unzip -o -q "${zipPath}" -d "${outDir}"`, { stdio: 'pipe' });
    }
    const csvPath = execSync(
      platform() === 'win32'
        ? `powershell -NoProfile -Command "(Get-ChildItem '${outDir.replace(/'/g, "''")}' -Filter *.csv | Select-Object -First 1).FullName"`
        : `find "${outDir}" -maxdepth 1 -name '*.csv' | head -1`,
      { encoding: 'utf8' },
    ).trim();
    return readFileSync(csvPath, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseBhavCsv(csv, symbol) {
  const sym = String(symbol).trim().toUpperCase();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;

  const header = lines[0].split(',');
  const idx = (name) => header.indexOf(name);
  const iSym = idx('TckrSymb');
  const iType = idx('FinInstrmTp');
  const iOi = idx('OpnIntrst');
  const iOiChg = idx('ChngInOpnIntrst');
  const iClose = idx('ClsPric');
  const iVol = idx('TtlTradgVol');
  const iDate = idx('TradDt');
  const iOpt = idx('OptnTp');
  const iStrike = idx('StrkPric');

  if (iSym < 0 || iType < 0 || iOi < 0) return null;

  let totalOi = 0;
  let oiChange = 0;
  let volume = 0;
  let futClose = 0;
  let maxOi = 0;
  let tradeDate = '';

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols[iSym] !== sym) continue;
    const tp = cols[iType];
    if (tp !== 'IDF' && tp !== 'STF') continue;
    if (iOpt >= 0 && cols[iOpt]) continue;
    if (iStrike >= 0 && cols[iStrike]) continue;

    const oi = Number(cols[iOi] || 0);
    const chg = Number(cols[iOiChg] || 0);
    const vol = Number(cols[iVol] || 0);
    const close = Number(cols[iClose] || 0);
    if (!oi) continue;

    totalOi += oi;
    oiChange += chg;
    volume += vol;
    if (oi >= maxOi) {
      maxOi = oi;
      futClose = close || futClose;
    }
    if (!tradeDate && iDate >= 0) tradeDate = cols[iDate];
  }

  if (!totalOi) return null;

  return {
    date: tradeDate || new Date().toISOString().split('T')[0],
    symbol: sym,
    totalOi: Math.floor(totalOi),
    oiChange: Math.floor(oiChange),
    volume: Math.floor(volume),
    futClose: futClose || undefined,
  };
}

const cache = new Map();

/** Latest NSE FO bhavcopy snapshot (real OI + day change) when live NSE API is down */
export async function fetchBhavFnoSnapshot(symbol) {
  const sym = String(symbol).trim().toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < 300_000) return hit.data;

  const today = new Date();
  for (let offset = 0; offset < 8; offset += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const key = yyyymmdd(d);
    try {
      const res = await fetch(bhavUrl(key), { headers: { 'User-Agent': UA } });
      if (!res.ok) continue;
      const csv = extractZip(Buffer.from(await res.arrayBuffer()));
      const snap = parseBhavCsv(csv, sym);
      if (snap) {
        const data = { ...snap, source: 'nse-bhav', fetchedAt: new Date().toISOString() };
        cache.set(sym, { at: Date.now(), data });
        return data;
      }
    } catch {
      /* try previous day */
    }
  }

  return null;
}
