/**
 * Deep intraday history puller.
 *
 * One INDstocks call reaches back about six weeks on a 5m series, so anything
 * longer has to be paged: fetch a window, take its oldest bar, ask again for
 * whatever sits before it, and merge. Progress is written after every page, so
 * a run that dies to a rate limit or an expired token resumes where it stopped
 * instead of starting the universe again.
 *
 * Nothing is cleaned here. Gaps, odd bars and duplicate stamps are the
 * analysis step's problem to report, and it can only do that on raw data.
 *
 *   node scripts/backtest/pullHistory.mjs --symbols=FNO --tf=5m --from=2026-02-01
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readToken() {
  if (process.env.INDSTOCKS_ACCESS_TOKEN) return process.env.INDSTOCKS_ACCESS_TOKEN.trim();
  const file = resolve(root, '.backtest-token');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  return '';
}

function expandSymbols(raw) {
  const asked = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const out = [];
  for (const name of asked) {
    if (name === 'FNO' || name === 'FNO_ALL') out.push('NIFTY', 'BANKNIFTY', ...listScannableUniverseSymbols('fno'));
    else out.push(name);
  }
  return [...new Set(out)];
}

function loadExisting(file) {
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed?.candles) ? parsed : null;
  } catch {
    return null;
  }
}

/** Merge by timestamp, oldest first, so repeated pages cannot duplicate a bar. */
function merge(existing, incoming) {
  const byTs = new Map();
  for (const c of existing) byTs.set(Number(c.timestamp), c);
  let added = 0;
  for (const c of incoming) {
    const ts = Number(c.timestamp);
    if (!(ts > 0) || byTs.has(ts)) continue;
    byTs.set(ts, c);
    added += 1;
  }
  return { candles: [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp), added };
}

async function resolveCandidates(symbol) {
  return [...new Set([resolveScripCode(symbol), ...resolveScripCodeCandidates(symbol)].filter(Boolean))];
}

async function pullDeep(token, symbol, tf, fromMs, pageBars, gapMs, maxPages, file) {
  const existingDoc = loadExisting(file);
  let candles = existingDoc?.candles ? [...existingDoc.candles] : [];
  let scrip = existingDoc?.scrip || null;

  const candidates = scrip ? [scrip] : await resolveCandidates(symbol);
  if (!candidates.length) return { candles, scrip: null, pages: 0, note: 'no scrip code' };

  // Start paging from whatever we already hold, otherwise from now.
  let cursor = candles.length ? Number(candles[0].timestamp) : 0;
  let pages = 0;

  for (; pages < maxPages; pages++) {
    if (cursor && cursor <= fromMs) break;

    let rows = [];
    for (const code of candidates) {
      try {
        rows = await fetchIndstocksCandles(token, code, tf, pageBars, cursor ? { beforeMs: cursor } : {});
      } catch (err) {
        const msg = err?.message || String(err);
        if (/401|403|unauth|expired/i.test(msg)) throw new Error(`token rejected: ${msg}`);
        rows = [];
      }
      if (rows.length) {
        scrip = code;
        break;
      }
    }
    if (!rows.length) break;

    const merged = merge(candles, rows);
    candles = merged.candles;
    const oldest = Number(candles[0].timestamp);
    // No new ground covered means the API has nothing older to give.
    if (!merged.added || (cursor && oldest >= cursor)) break;
    cursor = oldest;

    writeFileSync(file, JSON.stringify({ symbol, timeframe: tf, scrip, pulledAt: Date.now(), candles }, null, 0));
    await sleep(gapMs);
  }

  return { candles, scrip, pages, note: '' };
}

async function main() {
  const token = readToken();
  if (!token) {
    console.error('No token. Drop one into .backtest-token (it is gitignored). Nothing was fetched.');
    process.exit(1);
  }

  const outDir = resolve(root, arg('dir', 'data/backtest'));
  const timeframes = arg('tf', '5m').split(',').map((s) => s.trim()).filter(Boolean);
  const fromMs = Date.parse(`${arg('from', '2026-02-01')}T00:00:00+05:30`);
  const pageBars = Number(arg('bars', '2500'));
  const gapMs = Number(arg('gap', '400'));
  const maxPages = Number(arg('pages', '8'));

  mkdirSync(outDir, { recursive: true });
  try {
    await ensureInstrumentMap(token);
  } catch (err) {
    console.warn(`instrument map unavailable, using known scrip codes: ${err?.message || err}`);
  }

  const symbols = expandSymbols(arg('symbols', 'NIFTY,BANKNIFTY'));
  const total = symbols.length * timeframes.length;
  console.log(`deep pull: ${symbols.length} symbols × ${timeframes.join(',')} back to ${arg('from', '2026-02-01')}`);
  console.log(`up to ${maxPages} pages per series, ${gapMs}ms between calls`);

  let done = 0;
  let failed = 0;
  const started = Date.now();
  for (const symbol of symbols) {
    for (const tf of timeframes) {
      done += 1;
      const file = resolve(outDir, `${symbol}_${tf}.json`);
      const before = loadExisting(file)?.candles?.length || 0;
      process.stdout.write(`[${done}/${total}] ${symbol} ${tf} (have ${before}) ... `);
      try {
        const res = await pullDeep(token, symbol, tf, fromMs, pageBars, gapMs, maxPages, file);
        if (!res.candles.length) {
          failed += 1;
          console.log(`EMPTY ${res.note}`);
          continue;
        }
        const first = new Date(Number(res.candles[0].timestamp)).toISOString().slice(0, 10);
        const last = new Date(Number(res.candles[res.candles.length - 1].timestamp)).toISOString().slice(0, 10);
        console.log(`${res.candles.length} bars  ${first} → ${last}  (+${res.pages} pages)`);
      } catch (err) {
        console.log(`STOPPED: ${err?.message || err}`);
        console.error('\nAborting: the token looks dead. Refresh .backtest-token and re-run — progress is kept.');
        process.exit(2);
      }
    }
  }
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`done in ${mins} min — ${total - failed} series on disk, ${failed} empty`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
