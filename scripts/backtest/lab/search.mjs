/**
 * Two-stage strategy search.
 *
 * Stage 1 scores every signal family and parameter set on a plain exit, and
 * keeps only the ones whose edge shows up on BOTH the train and the test slice.
 * Stage 2 takes those survivors and grids filters, stop models and targets
 * around them. A holdout slice is scored throughout but never used to choose
 * anything — it is the only number that has not been fitted.
 *
 *   node scripts/backtest/lab/search.mjs --tf=5m --cost=0.10 --symbols=0
 */
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { OUT_DIR, allDates, loadUniverse, splitDates } from './data.mjs';
import { DEFAULT_EXIT, FILTERS, evaluateSymbol, sequence } from './exits.mjs';
import { FAMILIES, expandGrid } from './signals.mjs';

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const TF = arg('tf', '5m');
const COST_PCT = Number(arg('cost', '0.10'));
const SYMBOL_LIMIT = Number(arg('symbols', '0'));
const TARGETS = [0.5, 1, 1.5, 2, 3, 5];
/** A slice with fewer trades than this cannot tell you anything, so it is not scored. */
const MIN_TRADES = Number(arg('minTrades', '80'));
const SEEDS_PER_FAMILY = Number(arg('seedsPerFamily', '2'));

const log = (...a) => console.log(...a);

log(`loading ${TF} universe…`);
const UNIVERSE = loadUniverse(TF, SYMBOL_LIMIT);
const DATES = allDates(UNIVERSE);
const SPLIT = splitDates(DATES);
log(`${UNIVERSE.length} symbols, ${DATES.length} sessions`);
log(`train ≤ ${SPLIT.bounds.trainEnd} | test ≤ ${SPLIT.bounds.testEnd} | holdout ≤ ${SPLIT.bounds.last}`);

/** Cost of a round trip expressed in R, which depends on how wide the stop is. */
function costR(trade) {
  return trade.riskPct > 0 ? COST_PCT / 100 / trade.riskPct : 0;
}

function score(trades) {
  const n = trades.length;
  if (!n) return null;
  let wins = 0;
  let gross = 0;
  let net = 0;
  let profit = 0;
  let lossSum = 0;
  let sumSq = 0;
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const t of trades) {
    const c = costR(t);
    const nr = t.r - c;
    if (t.r > 0) wins += 1;
    gross += t.r;
    net += nr;
    if (nr > 0) profit += nr;
    else lossSum -= nr;
    equity += nr;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }
  const meanNet = net / n;
  for (const t of trades) sumSq += (t.r - costR(t) - meanNet) ** 2;
  const sd = Math.sqrt(sumSq / Math.max(1, n - 1));
  return {
    n,
    winRate: (wins / n) * 100,
    grossExp: gross / n,
    netExp: meanNet,
    netR: net,
    pf: lossSum > 0 ? profit / lossSum : profit > 0 ? Infinity : 0,
    maxDd,
    t: sd > 0 ? meanNet / (sd / Math.sqrt(n)) : 0,
  };
}

function sliceBy(trades, set) {
  return trades.filter((t) => set.has(t.ymd));
}

/* ------------------------------------------------------------------ *
 * Stage 1 — which raw signals are worth dressing up?
 * ------------------------------------------------------------------ */
const SIGNAL_CACHE = new Map();

function signalsFor(familyName, params) {
  const key = `${familyName}|${JSON.stringify(params)}`;
  let cached = SIGNAL_CACHE.get(key);
  if (!cached) {
    const gen = FAMILIES[familyName].gen;
    cached = UNIVERSE.map((S) => gen(S, params));
    SIGNAL_CACHE.set(key, cached);
  }
  return cached;
}

function runConfig(familyName, params, filterNames, exitOverrides) {
  const ex = { ...DEFAULT_EXIT, ...exitOverrides };
  const filterFns = filterNames.map((f) => FILTERS[f]);
  const perSymbol = signalsFor(familyName, params);
  const all = [];
  for (let s = 0; s < UNIVERSE.length; s++) {
    const cands = evaluateSymbol(UNIVERSE[s], perSymbol[s], ex, filterFns, TARGETS);
    if (cands.length) all.push(cands);
  }
  const byTarget = new Map();
  for (const target of TARGETS) {
    const trades = [];
    for (const cands of all) trades.push(...sequence(cands, target, ex.maxPerDay));
    byTarget.set(target, trades);
  }
  return byTarget;
}

const STAGE1_EXITS = [
  { label: 'stop=bar', stop: 'bar', padAtr: 0.1 },
  { label: 'stop=atr1', stop: 'atr', atrMult: 1, padAtr: 0 },
  { label: 'stop=swing', stop: 'swing', padAtr: 0.1 },
];

log('\nstage 1 — scoring raw signals…');
const stage1 = [];
let s1count = 0;
for (const [familyName, family] of Object.entries(FAMILIES)) {
  for (const params of expandGrid(family.grid)) {
    for (const exitCfg of STAGE1_EXITS) {
      const byTarget = runConfig(familyName, params, [], exitCfg);
      for (const target of TARGETS) {
        const trades = byTarget.get(target);
        const tr = score(sliceBy(trades, SPLIT.train));
        const te = score(sliceBy(trades, SPLIT.test));
        s1count += 1;
        if (!tr || !te || tr.n < MIN_TRADES || te.n < MIN_TRADES) continue;
        stage1.push({ familyName, params, exitCfg, target, tr, te });
      }
    }
  }
  log(`  ${familyName} done (${s1count} configs so far)`);
}

// A signal survives only if it points the same way on data it was not picked on.
const survivors = stage1
  .filter((r) => r.tr.grossExp > 0 && r.te.grossExp > 0)
  .sort((a, b) => Math.min(b.tr.grossExp, b.te.grossExp) - Math.min(a.tr.grossExp, a.te.grossExp));

log(`\nstage 1: ${s1count} configs scored, ${stage1.length} had enough trades, ${survivors.length} positive on both slices`);

/* Every family gets into stage 2, whether or not it cleared stage 1 on the
 * plain exits. A liquidity sweep judged with a stop parked at the bar low is
 * being judged on the wrong exit, not on whether the idea works — killing it
 * here would mean never finding that out. Families that did clear stage 1 get a
 * second parameter set as well. */
const bestPerFamily = new Map();
for (const r of stage1) {
  const key = `${r.familyName}|${JSON.stringify(r.params)}`;
  const rank = Math.min(r.tr.grossExp, r.te.grossExp);
  const list = bestPerFamily.get(r.familyName) || [];
  if (!list.some((x) => x.key === key)) list.push({ key, rank, r });
  else {
    const found = list.find((x) => x.key === key);
    if (rank > found.rank) found.rank = rank;
  }
  bestPerFamily.set(r.familyName, list);
}

const seeds = [];
for (const [familyName, list] of bestPerFamily) {
  list.sort((a, b) => b.rank - a.rank);
  const take = survivors.some((s) => s.familyName === familyName) ? SEEDS_PER_FAMILY : 1;
  for (const entry of list.slice(0, take)) seeds.push(entry.r);
}
log(`stage 2 seeds (${seeds.length}):\n${seeds.map((s) => `  ${s.familyName} ${JSON.stringify(s.params)}`).join('\n') || '  (none)'}`);

// Stage 1 cached the signal list of every config it scored. Stage 2 only ever
// asks for the seeds, and on a multi-month universe the rest is hundreds of
// megabytes of dead weight.
const keep = new Set(seeds.map((s) => `${s.familyName}|${JSON.stringify(s.params)}`));
for (const key of [...SIGNAL_CACHE.keys()]) if (!keep.has(key)) SIGNAL_CACHE.delete(key);
if (global.gc) global.gc();

/* ------------------------------------------------------------------ *
 * Stage 2 — filters, stops and targets around the survivors.
 * ------------------------------------------------------------------ */
const FILTER_SETS = [
  [],
  ['with_vwap'],
  ['with_ema200'],
  ['rvol_12'],
  ['rvol_15'],
  ['atr_wide'],
  ['after_first_hour'],
  ['morning'],
  ['afternoon'],
  ['longs_only'],
  ['shorts_only'],
  ['with_vwap', 'rvol_12'],
  ['with_vwap', 'after_first_hour'],
  ['with_ema200', 'rvol_12'],
  ['atr_wide', 'rvol_12'],
  ['with_vwap', 'atr_wide', 'rvol_12'],
  ['market_with'],
  ['market_not_against'],
  ['rs_strong'],
  ['market_with', 'rs_strong'],
  ['with_vwap', 'market_with'],
  ['with_vwap', 'rs_strong', 'rvol_12'],
  ['with_vwap', 'atr_wide', 'rvol_12', 'market_not_against'],
];

const SCALE_OUTS = [
  { label: 'all-or-nothing', partialAt: 0 },
  { label: 'book 50% @1R, rest breakeven', partialAt: 1, partialPct: 0.5, beAfterPartial: true },
  { label: 'book 50% @1R, stop stays', partialAt: 1, partialPct: 0.5, beAfterPartial: false },
  { label: 'book 50% @2R, rest breakeven', partialAt: 2, partialPct: 0.5, beAfterPartial: true },
];

const STOP_SETS = [];
for (const stop of ['bar', 'bar2', 'atr', 'swing']) {
  for (const stopMinPct of [0, 0.003]) {
    for (const trail of [
      { breakeven: 0, trailAtr: 0 },
      { trailAtr: 2, breakeven: 0 },
    ]) {
      for (const scale of SCALE_OUTS) {
        STOP_SETS.push({
          label: `${stop}/min${(stopMinPct * 100).toFixed(1)}%/${trail.trailAtr ? 'trail2atr' : 'fixed'}/${scale.label}`,
          stop,
          atrMult: 1.5,
          padAtr: stop === 'atr' ? 0 : 0.1,
          stopMinPct,
          ...trail,
          ...scale,
        });
      }
    }
  }
}

log(`\nstage 2 — ${seeds.length} seeds × ${FILTER_SETS.length} filter sets × ${STOP_SETS.length} stop models × ${TARGETS.length} targets`);
log(`= ${seeds.length * FILTER_SETS.length * STOP_SETS.length * TARGETS.length} strategy variants`);

const FILTER_NAMES = Object.keys(FILTERS);

function taggedWalk(familyName, params, exitOverrides) {
  const ex = { ...DEFAULT_EXIT, ...exitOverrides };
  const perSymbol = signalsFor(familyName, params);
  const all = [];
  for (let s = 0; s < UNIVERSE.length; s++) {
    const S = UNIVERSE[s];
    const cands = evaluateSymbol(S, perSymbol[s], ex, [], TARGETS);
    if (!cands.length) continue;
    for (const c of cands) {
      const flags = {};
      for (const name of FILTER_NAMES) flags[name] = FILTERS[name](S, c.i, c.side);
      c.flags = flags;
    }
    all.push(cands);
  }
  return { all, maxPerDay: ex.maxPerDay };
}

function filteredTrades(all, filterNames, target, maxPerDay) {
  const trades = [];
  for (const cands of all) {
    const kept = filterNames.length ? cands.filter((c) => filterNames.every((f) => c.flags[f])) : cands;
    if (kept.length) trades.push(...sequence(kept, target, maxPerDay));
  }
  return trades;
}

const results = [];
let done = 0;
for (const seed of seeds) {
  for (const stopCfg of STOP_SETS) {
    const { all, maxPerDay } = taggedWalk(seed.familyName, seed.params, stopCfg);
    for (const filters of FILTER_SETS) {
      for (const target of TARGETS) {
        const trades = filteredTrades(all, filters, target, maxPerDay);
        const tr = score(sliceBy(trades, SPLIT.train));
        const te = score(sliceBy(trades, SPLIT.test));
        const ho = score(sliceBy(trades, SPLIT.holdout));
        done += 1;
        if (!tr || !te || !ho) continue;
        if (tr.n < MIN_TRADES || te.n < MIN_TRADES || ho.n < MIN_TRADES) continue;
        results.push({
          family: seed.familyName,
          params: seed.params,
          filters: filters.join('+') || 'none',
          stop: stopCfg.label,
          target,
          tr,
          te,
          ho,
        });
      }
    }
  }
  log(`  seed ${seed.familyName} done (${done} variants)`);
}

log(`\nstage 2: ${done} variants run, ${results.length} with enough trades in all three slices`);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  resolve(OUT_DIR, `search-${TF}.json`),
  JSON.stringify({ tf: TF, cost: COST_PCT, split: SPLIT.bounds, tested: s1count + done, results }, null, 1),
);

const lines = [];
const say = (s = '') => {
  lines.push(s);
  log(s);
};

function row(r) {
  return [
    `${r.family} ${JSON.stringify(r.params)}`,
    r.filters,
    r.stop,
    `1:${r.target}`,
    r.tr.n,
    r.tr.winRate.toFixed(1),
    r.tr.netExp.toFixed(3),
    r.te.n,
    r.te.winRate.toFixed(1),
    r.te.netExp.toFixed(3),
    r.ho.n,
    r.ho.winRate.toFixed(1),
    r.ho.netExp.toFixed(3),
    r.ho.pf.toFixed(2),
  ].join(' | ');
}

const head =
  'strategy | filters | stop | tgt | n(tr) | win% | net(tr) | n(te) | win% | net(te) | n(ho) | win% | net(ho) | PF(ho)';

/* The only honest out-of-sample number: choose using train and test, then look
 * at holdout exactly once. Sorting the whole table by holdout and quoting the
 * top row is just fitting the holdout too. */
const pickable = results.filter((r) => r.tr.netExp > 0 && r.te.netExp > 0);
const honest = [...pickable].sort(
  (a, b) => Math.min(b.tr.netExp, b.te.netExp) - Math.min(a.tr.netExp, a.te.netExp),
)[0];

say('=== the honest pick: chosen on train+test, then scored once on holdout ===');
if (!honest) {
  say('nothing was net positive on both train and test.');
} else {
  say(head);
  say(row(honest));
  say('');
  say(
    `holdout: ${honest.ho.n} trades, ${honest.ho.winRate.toFixed(1)}% win, ` +
      `${honest.ho.netExp.toFixed(3)}R per trade, PF ${honest.ho.pf.toFixed(2)}, t=${honest.ho.t.toFixed(2)}`,
  );
}

say('');
say('=== accuracy frontier: the best holdout win rate reachable at each target ===');
say('This is the trade-off. Small targets buy accuracy, big targets spend it.');
say('target | best win% (holdout) | that variant net R/trade | best net R/trade | its win%');
for (const target of TARGETS) {
  const at = results.filter((r) => r.target === target);
  if (!at.length) {
    say(`1:${target} | — | — | — | —`);
    continue;
  }
  const byWin = [...at].sort((a, b) => b.ho.winRate - a.ho.winRate)[0];
  const byExp = [...at].sort((a, b) => b.ho.netExp - a.ho.netExp)[0];
  say(
    `1:${target} | ${byWin.ho.winRate.toFixed(1)}% | ${byWin.ho.netExp.toFixed(3)} | ` +
      `${byExp.ho.netExp.toFixed(3)} | ${byExp.ho.winRate.toFixed(1)}%`,
  );
}

say('');
const robust = results.filter((r) => r.tr.netExp > 0 && r.te.netExp > 0 && r.ho.netExp > 0);
say(`=== net positive on all three slices: ${robust.length} of ${results.length} variants ===`);
// With this many variants, a pile of them clear three slices on luck alone.
say(`(pure chance would clear three slices about ${(results.length / 8).toFixed(0)} times)`);
say(head);
for (const r of robust.sort((a, b) => Math.min(a.tr.netExp, a.te.netExp, a.ho.netExp) < Math.min(b.tr.netExp, b.te.netExp, b.ho.netExp) ? 1 : -1).slice(0, 25))
  say(row(r));

say('');
say('=== highest holdout win rate overall (accuracy only, ignore profitability) ===');
say(head);
for (const r of [...results].sort((a, b) => b.ho.winRate - a.ho.winRate).slice(0, 15)) say(row(r));

writeFileSync(resolve(OUT_DIR, `search-${TF}.txt`), lines.join('\n'));
log(`\nwrote ${resolve(OUT_DIR, `search-${TF}.json`)}`);
log(`wrote ${resolve(OUT_DIR, `search-${TF}.txt`)}`);
