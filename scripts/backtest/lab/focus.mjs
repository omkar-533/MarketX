/**
 * Reads a finished search and answers the two questions that matter:
 * which variant is the best big-target strategy, and which is the best
 * high-accuracy one, counting only variants that stayed positive on all
 * three slices.
 *
 * It also checks the neighbourhood. A single winning cell surrounded by
 * losers is a fluke; a winner whose neighbours also work is a setting.
 *
 *   node scripts/backtest/lab/focus.mjs --tf=5m
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { OUT_DIR } from './data.mjs';

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const TF = arg('tf', '5m');
const doc = JSON.parse(readFileSync(resolve(OUT_DIR, `search-${TF}.json`), 'utf8'));
const results = doc.results;

const id = (r) => `${r.family} ${JSON.stringify(r.params)} | ${r.filters}`;
const line = (r) =>
  `${id(r)} | ${r.stop} | 1:${r.target}\n` +
  `    train ${String(r.tr.n).padStart(4)} trades  ${r.tr.winRate.toFixed(1)}% win  ${r.tr.netExp >= 0 ? '+' : ''}${r.tr.netExp.toFixed(3)}R\n` +
  `    test  ${String(r.te.n).padStart(4)} trades  ${r.te.winRate.toFixed(1)}% win  ${r.te.netExp >= 0 ? '+' : ''}${r.te.netExp.toFixed(3)}R\n` +
  `    hold  ${String(r.ho.n).padStart(4)} trades  ${r.ho.winRate.toFixed(1)}% win  ${r.ho.netExp >= 0 ? '+' : ''}${r.ho.netExp.toFixed(3)}R  PF ${r.ho.pf.toFixed(2)}  maxDD ${r.ho.maxDd.toFixed(1)}R`;

const robust = results.filter((r) => r.tr.netExp > 0 && r.te.netExp > 0 && r.ho.netExp > 0);

console.log(`${TF}: ${results.length} scored variants, ${robust.length} positive on all three slices\n`);

/* Which family and filter combination produced the survivors? A survivor whose
 * siblings also survived is far more believable than a lone cell. */
const groups = new Map();
for (const r of robust) {
  const key = id(r);
  const g = groups.get(key) || [];
  g.push(r);
  groups.set(key, g);
}
console.log('survivor clusters (a cluster of one is probably luck):');
for (const [key, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
  const totalInGroup = results.filter((r) => id(r) === key).length;
  console.log(`  ${list.length}/${totalInGroup} settings survived — ${key}`);
}

const combined = (r) => (r.tr.netExp * r.tr.n + r.te.netExp * r.te.n + r.ho.netExp * r.ho.n) / (r.tr.n + r.te.n + r.ho.n);
const totalN = (r) => r.tr.n + r.te.n + r.ho.n;

console.log('\n=== best BIG TARGET strategy (target 1:3 or wider, positive everywhere) ===');
const big = robust.filter((r) => r.target >= 3).sort((a, b) => combined(b) - combined(a));
if (!big.length) console.log('none');
else {
  for (const r of big.slice(0, 5)) console.log(`${line(r)}\n    all slices: ${totalN(r)} trades, ${combined(r) >= 0 ? '+' : ''}${combined(r).toFixed(3)}R per trade\n`);
}

console.log('=== best HIGH ACCURACY strategy (positive everywhere, ranked by worst-slice win rate) ===');
const acc = [...robust].sort(
  (a, b) => Math.min(b.tr.winRate, b.te.winRate, b.ho.winRate) - Math.min(a.tr.winRate, a.te.winRate, a.ho.winRate),
);
if (!acc.length) console.log('none');
else {
  for (const r of acc.slice(0, 5)) console.log(`${line(r)}\n    worst-slice win rate: ${Math.min(r.tr.winRate, r.te.winRate, r.ho.winRate).toFixed(1)}%\n`);
}

console.log('=== what accuracy costs: every target, averaged over all variants ===');
console.log('target | variants | median win% | median net R | best net R that is positive on all 3');
for (const target of [...new Set(results.map((r) => r.target))].sort((a, b) => a - b)) {
  const at = results.filter((r) => r.target === target);
  const wins = at.map((r) => r.ho.winRate).sort((a, b) => a - b);
  const nets = at.map((r) => r.ho.netExp).sort((a, b) => a - b);
  const med = (arr) => arr[Math.floor(arr.length / 2)];
  const bestRobust = robust.filter((r) => r.target === target).sort((a, b) => combined(b) - combined(a))[0];
  console.log(
    `1:${target} | ${at.length} | ${med(wins).toFixed(1)}% | ${med(nets).toFixed(3)} | ` +
      (bestRobust ? `${combined(bestRobust).toFixed(3)}R @ ${bestRobust.ho.winRate.toFixed(1)}% win` : '—'),
  );
}
