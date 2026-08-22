/**
 * Pull raw intraday history for the OR+FVG backtest and park it on disk.
 *
 * Nothing here cleans or patches the series — the report is responsible for
 * auditing gaps and bad bars, and it can only do that on untouched data.
 *
 *   $env:INDSTOCKS_ACCESS_TOKEN="..."
 *   node scripts/backtest/pullCandles.mjs --symbols=NIFTY,BANKNIFTY --tf=5m --bars=2500
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  ensureInstrumentMap,
  fetchIndstocksCandles,
  listScannableUniverseSymbols,
  resolveScripCode,
  resolveScripCodeCandidates,
} from '../../server/marketData/indstocksClient.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = resolve(root, 'data', 'backtest');

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `--symbols=FNO` expands to whatever the instrument master can actually resolve. */
function expandSymbols(raw) {
  const asked = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const out = [];
  for (const name of asked) {
    if (name === 'FNO' || name === 'FNO_ALL') {
      out.push('NIFTY', 'BANKNIFTY', ...listScannableUniverseSymbols('fno'));
    } else {
      out.push(name);
    }
  }
  return [...new Set(out)];
}

async function pullOne(token, symbol, tf, bars) {
  const candidates = [resolveScripCode(symbol), ...resolveScripCodeCandidates(symbol)].filter(Boolean);
  const tried = [];
  for (const scrip of [...new Set(candidates)]) {
    tried.push(scrip);
    try {
      const rows = await fetchIndstocksCandles(token, scrip, tf, bars);
      if (rows.length) return { scrip, rows, tried };
    } catch (err) {
      console.warn(`  ${symbol} via ${scrip} failed: ${err?.message || err}`);
    }
  }
  return { scrip: null, rows: [], tried };
}

async function main() {
  const token = process.env.INDSTOCKS_ACCESS_TOKEN;
  if (!token) {
    console.error('INDSTOCKS_ACCESS_TOKEN is not set. Nothing was fetched.');
    process.exit(1);
  }
  const timeframes = arg('tf', '3m,5m').split(',').map((s) => s.trim()).filter(Boolean);
  const bars = Number(arg('bars', '2500'));
  const gapMs = Number(arg('gap', '350'));
  const resume = arg('resume', '1') !== '0';

  mkdirSync(outDir, { recursive: true });
  try {
    await ensureInstrumentMap(token);
  } catch (err) {
    console.warn(`instrument map unavailable, falling back to known scrip codes: ${err?.message || err}`);
  }

  const symbols = expandSymbols(arg('symbols', 'NIFTY,BANKNIFTY'));
  const total = symbols.length * timeframes.length;
  console.log(`pulling ${symbols.length} symbols × ${timeframes.length} timeframes = ${total} series`);

  let done = 0;
  let empty = 0;
  for (const symbol of symbols) {
    for (const tf of timeframes) {
      done += 1;
      const file = resolve(outDir, `${symbol}_${tf}.json`);
      const tag = `[${done}/${total}] ${symbol} ${tf}`;
      if (resume && existsSync(file)) {
        console.log(`${tag} ... cached`);
        continue;
      }
      process.stdout.write(`${tag} ... `);
      const { scrip, rows, tried } = await pullOne(token, symbol, tf, bars);
      if (!rows.length) {
        empty += 1;
        console.log(`EMPTY (tried ${tried.join(', ') || 'nothing'})`);
        continue;
      }
      writeFileSync(
        file,
        JSON.stringify({ symbol, timeframe: tf, scrip, pulledAt: Date.now(), candles: rows }, null, 0),
      );
      const first = new Date(rows[0].timestamp).toISOString().slice(0, 10);
      const last = new Date(rows[rows.length - 1].timestamp).toISOString().slice(0, 10);
      console.log(`${rows.length} bars  ${first} → ${last}`);
      await sleep(gapMs);
    }
  }
  console.log(`done — ${total - empty} series on disk, ${empty} came back empty`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
