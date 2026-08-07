/**
 * Smoke-run SMC pine + fixtures against the in-house engine.
 * Usage: node server/pine/smoke.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPineScript } from './index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

function synthBars(n = 200) {
  const bars = [];
  let px = 100;
  const t0 = Math.floor(Date.now() / 1000) - n * 3600;
  for (let i = 0; i < n; i += 1) {
    const drift = Math.sin(i / 9) * 1.2 + (i % 7 === 0 ? 2.5 : 0) - (i % 11 === 0 ? 2.2 : 0);
    const open = px;
    const close = px + drift + (Math.random() - 0.5) * 0.8;
    const high = Math.max(open, close) + Math.random() * 0.6;
    const low = Math.min(open, close) - Math.random() * 0.6;
    bars.push({
      time: t0 + i * 3600,
      open,
      high,
      low,
      close,
      volume: 1000 + (i % 50) * 10,
    });
    px = close;
  }
  return bars;
}

function runFixture(name, source, bars) {
  const t0 = Date.now();
  const result = runPineScript(source, bars, {}, { timeLimitMs: 20000, maxBars: 5000 });
  const ms = Date.now() - t0;
  const plots = result.plots?.length || 0;
  const drawings = result.drawings?.length || 0;
  const warns = result.warnings || [];
  console.log(`\n=== ${name} (${ms}ms) ===`);
  console.log(`plots=${plots} drawings=${drawings} warnings=${warns.length}`);
  if (warns.length) {
    console.log('first warnings:');
    for (const w of warns.slice(0, 12)) console.log(`  - ${w}`);
  }
  return { name, ms, plots, drawings, warns, ok: plots > 0 || drawings > 0 || name.includes('SMC') };
}

const bars = synthBars(240);
const fixturesDir = path.join(__dirname, 'fixtures');

for (const file of ['sma.pine', 'fvg-if-box.pine', 'mini-structure.pine']) {
  const src = fs.readFileSync(path.join(fixturesDir, file), 'utf8');
  const r = runFixture(file, src, bars);
  if (file === 'sma.pine' && r.plots < 1) {
    console.error('FAIL: SMA fixture produced no plots');
    process.exitCode = 1;
  }
  if (file === 'fvg-if-box.pine' && r.drawings < 1) {
    console.error('WARN: FVG fixture produced no drawings');
  }
}

const smcPath = path.join(root, 'data/pine/professional-smart-money-concepts.pine');
if (fs.existsSync(smcPath)) {
  const src = fs.readFileSync(smcPath, 'utf8');
  console.log(`\nSMC source length: ${src.length}`);
  runFixture('professional-smart-money-concepts.pine', src, bars);
} else {
  console.log('\n(SMC pine file missing — skip)');
}

console.log('\nSmoke done.');
