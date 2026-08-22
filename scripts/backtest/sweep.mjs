/**
 * Variant sweep for the OR+FVG idea.
 *
 * Every lever is measured on an early slice and then re-measured on a later
 * slice the variant was never chosen on. A lever that only works on the first
 * half is curve fitting, and the table is built so that shows up immediately.
 *
 * Expectancy is reported gross and net of a round-trip cost, because a stop
 * this tight turns a small percentage cost into a large slice of R.
 *
 *   node scripts/backtest/sweep.mjs --tf=5m --stop=B --target=2 --cost=0.10
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_CONFIG, istParts, runDay } from './orFvgEngine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = resolve(root, 'data', 'backtest');

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const tf = arg('tf', '5m');
const tfMinutes = Number(tf.replace('m', ''));
const stopModel = arg('stop', 'B');
const target = Number(arg('target', '2'));
const costPct = Number(arg('cost', '0.10'));

function loadAll() {
  const suffix = `_${tf}.json`;
  const out = [];
  if (!existsSync(dataDir)) return out;
  for (const f of readdirSync(dataDir).filter((x) => x.endsWith(suffix))) {
    const raw = JSON.parse(readFileSync(resolve(dataDir, f), 'utf8'));
    const byDay = new Map();
    for (const c of raw.candles || []) {
      const bar = { t: Number(c.timestamp), o: +c.open, h: +c.high, l: +c.low, c: +c.close, v: +c.volume || 0 };
      const { ymd } = istParts(bar.t);
      const day = byDay.get(ymd) || [];
      day.push(bar);
      byDay.set(ymd, day);
    }
    out.push({ symbol: f.slice(0, -suffix.length), byDay });
  }
  return out;
}

const SERIES = loadAll();
const ALL_DAYS = [...new Set(SERIES.flatMap((s) => [...s.byDay.keys()]))].sort();
const CUT = ALL_DAYS[Math.floor(ALL_DAYS.length / 2)];

function collect(cfgIn) {
  const cfg = { ...DEFAULT_CONFIG, tfMinutes, stopModel, ...cfgIn };
  const trades = [];
  for (const { symbol, byDay } of SERIES) {
    for (const [ymd, bars] of byDay) {
      const day = runDay(bars, cfg);
      if (!day.ok) continue;
      for (const s of day.setups) {
        if (s.stage !== 'TRADE') continue;
        trades.push({ symbol, ymd, side: s.side, entry: s.entry, risk: s.risk, entryAt: s.entryAt, results: s.results });
      }
    }
  }
  return trades;
}

function score(trades) {
  const rows = trades.map((t) => {
    const res = t.results[target];
    const costR = t.risk > 0 ? (costPct / 100) * t.entry / t.risk : 0;
    return { r: res ? res.r : 0, net: (res ? res.r : 0) - costR, win: res ? res.r > 0 : false };
  });
  const n = rows.length;
  if (!n) return null;
  const gross = rows.reduce((a, b) => a + b.r, 0);
  const net = rows.reduce((a, b) => a + b.net, 0);
  const wins = rows.filter((r) => r.win).length;
  const mean = gross / n;
  const sd = Math.sqrt(rows.reduce((a, b) => a + (b.r - mean) ** 2, 0) / Math.max(1, n - 1));
  return {
    n,
    winRate: (wins / n) * 100,
    grossExp: mean,
    netExp: net / n,
    netR: net,
    t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0,
  };
}

const VARIANTS = [
  ['baseline (your rules)', {}, null],
  ['zone breakout at inner edge', { zoneEdge: 'inner' }, null],
  ['confirmation: strong body OR small wick', { confirmationRule: 'either' }, null],
  ['confirmation: any directional close', { confirmationRule: 'plain' }, null],
  ['FVG window 3 bars', { fvgMaxBarsAfterBreakout: 3 }, null],
  ['FVG window 20 bars', { fvgMaxBarsAfterBreakout: 20 }, null],
  ['FVG allowed inside the range', { requireFvgBeyondRange: false }, null],
  ['breakout must clear by 2 ticks', { breakoutBufferTicks: 2 }, null],
  ['risk floor 0.30%', { minRiskPct: 0.003 }, null],
  ['risk floor 0.50%', { minRiskPct: 0.005 }, null],
  ['risk floor 0.75%', { minRiskPct: 0.0075 }, null],
  ['stop widened to 0.30% floor', { stopMinPct: 0.003 }, null],
  ['stop widened to 0.50% floor', { stopMinPct: 0.005 }, null],
  ['stop widened to 0.75% floor', { stopMinPct: 0.0075 }, null],
  ['stop widened to 1.00% floor', { stopMinPct: 0.01 }, null],
  ['longs only', {}, (t) => t.side === 'long'],
  ['shorts only', {}, (t) => t.side === 'short'],
  ['entry before 12:00 only', {}, (t) => istParts(t.entryAt).minutes < 720],
  ['entry after 12:00 only', {}, (t) => istParts(t.entryAt).minutes >= 720],
  ['risk floor 0.50% + longs only', { minRiskPct: 0.005 }, (t) => t.side === 'long'],
  ['longs only + after 12:00', {}, (t) => t.side === 'long' && istParts(t.entryAt).minutes >= 720],
  ['after 12:00 + stop floor 0.75%', { stopMinPct: 0.0075 }, (t) => istParts(t.entryAt).minutes >= 720],
  ['longs only + stop floor 0.75%', { stopMinPct: 0.0075 }, (t) => t.side === 'long'],
  [
    'longs + after 12:00 + stop floor 0.75%',
    { stopMinPct: 0.0075 },
    (t) => t.side === 'long' && istParts(t.entryAt).minutes >= 720,
  ],
];

function fmt(n, d = 2) {
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}

console.log(`${tf} · stop model ${stopModel} · target 1:${target} · cost ${costPct}% round trip`);
console.log(`train ${ALL_DAYS[0]} → before ${CUT}   |   test ${CUT} → ${ALL_DAYS[ALL_DAYS.length - 1]}`);
console.log('');
const header = ['Variant', 'n', 'Win%', 'GrossExp', 'NetExp', 't', 'n', 'Win%', 'GrossExp', 'NetExp', 't'];
console.log(`| ${header.join(' | ')} |`);
console.log(`| ${header.map(() => '---').join(' | ')} |`);

for (const [label, cfg, filter] of VARIANTS) {
  const all = collect(cfg);
  const kept = filter ? all.filter(filter) : all;
  const train = score(kept.filter((t) => t.ymd < CUT));
  const test = score(kept.filter((t) => t.ymd >= CUT));
  const cells = [label];
  for (const s of [train, test]) {
    if (!s) {
      cells.push('0', '—', '—', '—', '—');
      continue;
    }
    cells.push(String(s.n), fmt(s.winRate, 1), fmt(s.grossExp, 3), fmt(s.netExp, 3), fmt(s.t, 2));
  }
  console.log(`| ${cells.join(' | ')} |`);
}
