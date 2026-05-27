/**
 * Builds NSE + BSE equity JSON from official/list sources.
 * Run: node scripts/build-equity-universe.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'src', 'data');

function parseNseCsv(text) {
  const lines = text.split(/\r?\n/).slice(1).filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (!line.includes(',EQ,')) continue;
    const parts = line.split(',');
    const symbol = parts[0]?.trim();
    const name = parts[1]?.trim();
    if (!symbol || !name) continue;
    out.push({ s: symbol, n: name, e: 'NSE' });
  }
  return out;
}

function parseBseJson(text) {
  const arr = JSON.parse(text);
  const out = [];
  const seen = new Set();
  for (const row of arr) {
    const symbol = (row.scrip_id || row.SCRIP_CD || '').toString().trim().toUpperCase();
    const name = (row.Scrip_Name || row.Issuer_Name || symbol).trim();
    if (!symbol || symbol.length > 20) continue;
    const key = `BSE:${symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ s: symbol, n: name, e: 'BSE' });
  }
  return out.sort((a, b) => a.s.localeCompare(b.s));
}

const nseCsv = fs.readFileSync(path.join(__dirname, 'EQUITY_L.csv'), 'utf8');
const bseJson = fs.readFileSync(path.join(__dirname, 'bse_scrips.json'), 'utf8');

const nse = parseNseCsv(nseCsv);
const bse = parseBseJson(bseJson);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'nseEquity.json'), JSON.stringify(nse));
fs.writeFileSync(path.join(outDir, 'bseEquity.json'), JSON.stringify(bse));

console.log(`NSE equities: ${nse.length}`);
console.log(`BSE equities: ${bse.length}`);
console.log(`Written to ${outDir}`);
