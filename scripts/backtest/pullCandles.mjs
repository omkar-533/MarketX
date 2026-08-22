/**
 * Pull raw intraday history for the OR+FVG backtest and park it on disk.
 *
 * Nothing here cleans or patches the series — the report is responsible for
 * auditing gaps and bad bars, and it can only do that on untouched data.
 *
 *   $env:INDSTOCKS_ACCESS_TOKEN="..."
 *   node scripts/backtest/pullCandles.mjs --symbols=NIFTY,BANKNIFTY --tf=5m --bars=2500
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  ensureInstrumentMap,
  fetchIndstocksCandles,
  resolveScripCode,
  resolveScripCodeCandidates,
} from '../../server/marketData/indstocksClient.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = resolve(root, 'data', 'backtest');

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
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
  const symbols = arg('symbols', 'NIFTY,BANKNIFTY').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const timeframes = arg('tf', '3m,5m').split(',').map((s) => s.trim()).filter(Boolean);
  const bars = Number(arg('bars', '2500'));

  mkdirSync(outDir, { recursive: true });
  try {
    await ensureInstrumentMap(token);
  } catch (err) {
    console.warn(`instrument map unavailable, falling back to known scrip codes: ${err?.message || err}`);
  }

  for (const symbol of symbols) {
    for (const tf of timeframes) {
      process.stdout.write(`${symbol} ${tf} ... `);
      const { scrip, rows, tried } = await pullOne(token, symbol, tf, bars);
      if (!rows.length) {
        console.log(`EMPTY (tried ${tried.join(', ') || 'nothing'})`);
        continue;
      }
      const file = resolve(outDir, `${symbol}_${tf}.json`);
      writeFileSync(
        file,
        JSON.stringify({ symbol, timeframe: tf, scrip, pulledAt: Date.now(), candles: rows }, null, 0),
      );
      const first = new Date(rows[0].timestamp).toISOString();
      const last = new Date(rows[rows.length - 1].timestamp).toISOString();
      console.log(`${rows.length} bars  ${first} → ${last}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
