/**
 * Stress-test a single strategy.
 *
 * A positive average can hide almost anything: three lucky trades, one symbol
 * carrying the book, or a single good week. This re-runs one config over the
 * whole sample and asks the questions that usually break a backtest —
 * how concentrated is the profit, does it survive losing its best trades, and
 * is any of it distinguishable from noise.
 *
 *   node scripts/backtest/lab/verify.mjs --tf=5m --cost=0.10
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { OUT_DIR, allDates, loadUniverse, splitDates } from './data.mjs';
import { DEFAULT_EXIT, FILTERS, evaluateSymbol, sequence } from './exits.mjs';
import { FAMILIES } from './signals.mjs';

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const TF = arg('tf', '5m');
const COST_PCT = Number(arg('cost', '0.10'));

/** The survivor cluster from the search, plus the two runners-up for contrast. */
const CANDIDATES = [
  {
    name: 'Structure break, in trend, on real volume — target 1:5',
    family: 'structure_break',
    params: { swing: 3, side: 'both' },
    filters: ['with_vwap', 'atr_wide', 'rvol_12'],
    exit: { stop: 'swing', padAtr: 0.1, stopMinPct: 0.003, trailAtr: 2, breakeven: 0 },
    target: 5,
  },
  {
    name: 'Structure break, in trend, on real volume — target 1:3',
    family: 'structure_break',
    params: { swing: 3, side: 'both' },
    filters: ['with_vwap', 'atr_wide', 'rvol_12'],
    exit: { stop: 'swing', padAtr: 0.1, stopMinPct: 0.003, trailAtr: 2, breakeven: 0 },
    target: 3,
  },
  {
    name: 'Structure break, volume only (no VWAP filter) — target 1:5',
    family: 'structure_break',
    params: { swing: 3, side: 'both' },
    filters: ['atr_wide', 'rvol_12'],
    exit: { stop: 'swing', padAtr: 0.1, stopMinPct: 0.003, trailAtr: 2, breakeven: 0 },
    target: 5,
  },
  {
    name: 'RSI reversal, in trend, after the first hour — target 1:5',
    family: 'rsi_reversal',
    params: { low: 30, high: 70, side: 'both' },
    filters: ['with_vwap', 'after_first_hour'],
    exit: { stop: 'atr', atrMult: 1.5, padAtr: 0, stopMinPct: 0.006, trailAtr: 2, breakeven: 0 },
    target: 5,
  },
];

const UNIVERSE = loadUniverse(TF);
const DATES = allDates(UNIVERSE);
const SPLIT = splitDates(DATES);

function costR(t) {
  return t.riskPct > 0 ? COST_PCT / 100 / t.riskPct : 0;
}

function run(cand) {
  const ex = { ...DEFAULT_EXIT, ...cand.exit };
  const filterFns = cand.filters.map((f) => FILTERS[f]);
  const gen = FAMILIES[cand.family].gen;
  const trades = [];
  for (const S of UNIVERSE) {
    const cands = evaluateSymbol(S, gen(S, cand.params), ex, filterFns, [cand.target]);
    trades.push(...sequence(cands, cand.target, ex.maxPerDay));
  }
  trades.sort((a, b) => (a.ymd === b.ymd ? a.minutes - b.minutes : a.ymd < b.ymd ? -1 : 1));
  return trades.map((t) => ({ ...t, net: t.r - costR(t) }));
}

function summary(trades) {
  const n = trades.length;
  if (!n) return null;
  const net = trades.reduce((a, b) => a + b.net, 0);
  const wins = trades.filter((t) => t.r > 0);
  const mean = net / n;
  const sd = Math.sqrt(trades.reduce((a, b) => a + (b.net - mean) ** 2, 0) / Math.max(1, n - 1));
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of trades) {
    equity += t.net;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }
  const profit = trades.filter((t) => t.net > 0).reduce((a, b) => a + b.net, 0);
  const loss = -trades.filter((t) => t.net <= 0).reduce((a, b) => a + b.net, 0);
  return {
    n,
    winRate: (wins.length / n) * 100,
    netR: net,
    exp: mean,
    sd,
    t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0,
    pf: loss > 0 ? profit / loss : Infinity,
    maxDd,
  };
}

const out = [];
const say = (s = '') => {
  out.push(s);
  console.log(s);
};

say(`# Stress test — ${TF}, cost ${COST_PCT}% round trip`);
say(`${UNIVERSE.length} symbols, ${DATES.length} sessions (${DATES[0]} → ${DATES[DATES.length - 1]})`);
say('');

for (const cand of CANDIDATES) {
  const trades = run(cand);
  const all = summary(trades);
  say(`## ${cand.name}`);
  if (!all) {
    say('no trades');
    say('');
    continue;
  }
  say(
    `${all.n} trades · ${all.winRate.toFixed(1)}% win · ${all.exp >= 0 ? '+' : ''}${all.exp.toFixed(3)}R per trade · ` +
      `net ${all.netR.toFixed(1)}R · PF ${all.pf.toFixed(2)} · max drawdown ${all.maxDd.toFixed(1)}R · t=${all.t.toFixed(2)}`,
  );

  // Is the profit the strategy, or is it a handful of trades?
  const sorted = [...trades].sort((a, b) => b.net - a.net);
  for (const drop of [1, 3, 5, 10]) {
    const without = summary(sorted.slice(drop));
    say(
      `  minus its best ${String(drop).padStart(2)} trades: ${without.exp >= 0 ? '+' : ''}${without.exp.toFixed(3)}R per trade, net ${without.netR.toFixed(1)}R`,
    );
  }

  // Is one symbol or one week carrying it?
  const bySymbol = new Map();
  for (const t of trades) bySymbol.set(t.symbol, (bySymbol.get(t.symbol) || 0) + t.net);
  const symbols = [...bySymbol].sort((a, b) => b[1] - a[1]);
  const topSymbolShare = all.netR > 0 ? (symbols[0][1] / all.netR) * 100 : 0;
  say(`  ${symbols.length} symbols traded; best one contributed ${topSymbolShare.toFixed(0)}% of net R`);

  const byDay = new Map();
  for (const t of trades) byDay.set(t.ymd, (byDay.get(t.ymd) || 0) + t.net);
  const days = [...byDay].sort((a, b) => b[1] - a[1]);
  const greenDays = days.filter(([, v]) => v > 0).length;
  const topDayShare = all.netR > 0 ? (days[0][1] / all.netR) * 100 : 0;
  say(`  ${greenDays}/${days.length} sessions green; best session contributed ${topDayShare.toFixed(0)}% of net R`);

  const longs = summary(trades.filter((t) => t.side === 'long'));
  const shorts = summary(trades.filter((t) => t.side === 'short'));
  if (longs) say(`  longs  ${String(longs.n).padStart(4)} · ${longs.winRate.toFixed(1)}% win · ${longs.exp >= 0 ? '+' : ''}${longs.exp.toFixed(3)}R`);
  if (shorts) say(`  shorts ${String(shorts.n).padStart(4)} · ${shorts.winRate.toFixed(1)}% win · ${shorts.exp >= 0 ? '+' : ''}${shorts.exp.toFixed(3)}R`);

  for (const [label, set] of [['train', SPLIT.train], ['test', SPLIT.test], ['holdout', SPLIT.holdout]]) {
    const s = summary(trades.filter((t) => set.has(t.ymd)));
    if (s) say(`  ${label.padEnd(8)} ${String(s.n).padStart(4)} trades · ${s.winRate.toFixed(1)}% win · ${s.exp >= 0 ? '+' : ''}${s.exp.toFixed(3)}R · PF ${s.pf.toFixed(2)}`);
  }

  const avgRiskPct = trades.reduce((a, b) => a + b.riskPct, 0) / trades.length;
  const avgCost = trades.reduce((a, b) => a + costR(b), 0) / trades.length;
  say(`  average stop distance ${(avgRiskPct * 100).toFixed(2)}% of price, so costs eat ${avgCost.toFixed(2)}R per trade`);
  say('');
}

writeFileSync(resolve(OUT_DIR, `verify-${TF}.txt`), out.join('\n'));
console.log(`wrote ${resolve(OUT_DIR, `verify-${TF}.txt`)}`);
