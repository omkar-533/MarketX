/**
 * Always-on Opportunity day-board job.
 * Every 60s: pick a LIVE INDstocks token, fetch the shared F&O snapshot,
 * evaluate with the same scanners as the website, persist to Supabase.
 * Website does not need to stay open. After hours: freeze + heartbeat persist.
 */
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { listLiveIndstocksAccessTokens } from './credentialStore.mjs';
import {
  nseCashSessionIsOpen,
  awaitOpportunitySnapshot,
} from './opportunitySnapshot.mjs';
import {
  mergeOpportunityDayBoard,
  persistOpportunityDayBoard,
} from './opportunityDayBoard.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EVAL_PATH = resolve(root, 'server/marketData/generated/opportunityEval.mjs');
const TICK_MS = 60_000;
const UNIVERSES = ['F&O'];

/** @type {((snap: object) => Promise<{ cards: object[], hits: object[], complete: boolean }>) | null} */
let evaluateSnapshot = null;
/** @type {Promise<void> | null} */
let tickLock = null;
let tickN = 0;
let tokenCursor = 0;
let started = false;
let lastNoTokenLog = 0;

export function planOpportunityBoardTick(now = Date.now(), n = 0) {
  const open = nseCashSessionIsOpen(now);
  if (!open) return { hunt: false, persist: true, timeframes: [], universes: [] };
  const timeframes = ['5m'];
  if (n % 5 === 0) timeframes.push('15m');
  if (n % 15 === 0) timeframes.push('1h');
  if (n % 30 === 0) timeframes.push('1D');
  return { hunt: true, persist: true, timeframes, universes: [...UNIVERSES] };
}

function runBundleScript() {
  return new Promise((resolveDone) => {
    const script = resolve(root, 'scripts/bundle-opportunity-eval.mjs');
    if (!existsSync(script)) {
      resolveDone(false);
      return;
    }
    const child = spawn(process.execPath, [script], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => resolveDone(code === 0 && existsSync(EVAL_PATH)));
    child.on('error', () => resolveDone(false));
  });
}

async function loadEvaluator() {
  if (evaluateSnapshot) return evaluateSnapshot;
  if (!existsSync(EVAL_PATH)) {
    const built = await runBundleScript();
    if (!built) return null;
  }
  const mod = await import(pathToFileURL(EVAL_PATH).href);
  if (typeof mod.evaluateOpportunitySnapshot !== 'function') return null;
  evaluateSnapshot = mod.evaluateOpportunitySnapshot;
  return evaluateSnapshot;
}

async function pickLiveToken() {
  const list = await listLiveIndstocksAccessTokens();
  if (!list.length) return null;
  const start = tokenCursor % list.length;
  tokenCursor += 1;
  return list[start];
}

async function huntTimeframe(accessToken, universe, timeframe) {
  const snap = await awaitOpportunitySnapshot(accessToken, universe, timeframe, {
    force: true,
    timeoutMs: 480_000,
  });
  if (!snap?.ready || !snap.candlesBySymbol) {
    throw new Error(`${universe} ${timeframe} snapshot not ready`);
  }
  const evalFn = await loadEvaluator();
  if (!evalFn) throw new Error('Opportunity eval bundle missing');
  const out = await evalFn({
    symbols: snap.symbols,
    candlesBySymbol: snap.candlesBySymbol,
    timeframe,
    universe,
    asOf: snap.asOf,
    builtAt: snap.builtAt,
  });
  const board = await mergeOpportunityDayBoard(
    universe,
    timeframe,
    out.cards || [],
    snap.cacheKey,
  );
  return { hits: board.hits || 0, complete: Boolean(out.complete) };
}

async function runTick() {
  const plan = planOpportunityBoardTick(Date.now(), tickN);
  tickN += 1;
  if (!plan.hunt) {
    if (plan.persist) await persistOpportunityDayBoard();
    return;
  }
  const live = await pickLiveToken();
  if (!live) {
    await persistOpportunityDayBoard();
    const now = Date.now();
    if (now - lastNoTokenLog > 10 * 60_000) {
      lastNoTokenLog = now;
      console.warn('[opportunity-board-job] waiting for a LIVE INDstocks connection');
    }
    return;
  }
  const evalFn = await loadEvaluator();
  if (!evalFn) {
    await persistOpportunityDayBoard();
    console.warn('[opportunity-board-job] eval bundle missing — run npm run build');
    return;
  }
  for (const universe of plan.universes) {
    for (const tf of plan.timeframes) {
      try {
        const result = await huntTimeframe(live.accessToken, universe, tf);
        console.log(
          `[opportunity-board-job] saved ${universe} ${tf} hits=${result.hits}${result.complete ? '' : ' (partial)'}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err || 'hunt failed');
        console.warn(`[opportunity-board-job] ${universe} ${tf} skip`, message);
        try {
          const next = await pickLiveToken();
          if (next && next.accessToken !== live.accessToken) {
            const result = await huntTimeframe(next.accessToken, universe, tf);
            console.log(
              `[opportunity-board-job] saved ${universe} ${tf} hits=${result.hits} (fallback user)`,
            );
          }
        } catch (retryErr) {
          console.warn(
            `[opportunity-board-job] ${universe} ${tf} fallback skip`,
            retryErr instanceof Error ? retryErr.message : retryErr,
          );
        }
      }
    }
  }
}

let tickQueued = false;

function enqueueTick() {
  if (tickLock) {
    tickQueued = true;
    return;
  }
  tickLock = runTick()
    .catch((err) => {
      console.warn('[opportunity-board-job] tick failed', err?.message || err);
    })
    .finally(() => {
      tickLock = null;
      if (tickQueued) {
        tickQueued = false;
        enqueueTick();
      }
    });
}

export function startOpportunityBoardJob() {
  if (started) return;
  started = true;
  void loadEvaluator().then((fn) => {
    if (fn) console.log('[opportunity-board-job] eval ready — 1-minute autosave armed');
    else console.warn('[opportunity-board-job] eval bundle missing until npm run build');
  });
  setTimeout(enqueueTick, 4_000);
  setInterval(enqueueTick, TICK_MS);
}
