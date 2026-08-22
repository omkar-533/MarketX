/**
 * OR+FVG backtest report.
 *
 * Reads the parked candle files, audits them, replays the strategy day by day
 * and prints a quantitative report plus a full trade log.
 *
 *   node scripts/backtest/report.mjs --symbols=NIFTY,BANKNIFTY --tf=3m,5m
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_CONFIG, istClock, istParts, runDay } from './orFvgEngine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = resolve(root, 'data', 'backtest');
const outDir = resolve(dataDir, 'out');

const TARGETS = DEFAULT_CONFIG.targets;
const SESSION_MINUTES = 375;

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** Every symbol that actually has a parked file for this timeframe. */
function discoverSymbols(tf) {
  if (!existsSync(dataDir)) return [];
  const suffix = `_${tf}.json`;
  return readdirSync(dataDir)
    .filter((f) => f.endsWith(suffix))
    .map((f) => f.slice(0, -suffix.length))
    .sort();
}

function loadSeries(symbol, tf) {
  const file = resolve(dataDir, `${symbol}_${tf}.json`);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const candles = (raw.candles || []).map((c) => ({
    t: Number(c.timestamp),
    o: Number(c.open),
    h: Number(c.high),
    l: Number(c.low),
    c: Number(c.close),
    v: Number(c.volume) || 0,
  }));
  return { ...raw, candles };
}

function auditSeries(series, tfMinutes) {
  const bars = series.candles;
  const seen = new Set();
  const issues = {
    duplicates: 0,
    badOhlc: 0,
    offGrid: 0,
    outOfSession: 0,
    nonPositive: 0,
    unsorted: 0,
  };
  const byDay = new Map();

  let prev = 0;
  for (const b of bars) {
    if (b.t <= prev) issues.unsorted += 1;
    prev = b.t;
    if (seen.has(b.t)) issues.duplicates += 1;
    seen.add(b.t);

    if (!(b.o > 0 && b.h > 0 && b.l > 0 && b.c > 0)) issues.nonPositive += 1;
    if (b.h < b.l || b.h < Math.max(b.o, b.c) || b.l > Math.min(b.o, b.c)) issues.badOhlc += 1;

    const { ymd, minutes } = istParts(b.t);
    if (minutes < 9 * 60 + 15 || minutes >= 15 * 60 + 30) {
      issues.outOfSession += 1;
      continue;
    }
    if ((minutes - (9 * 60 + 15)) % tfMinutes !== 0) issues.offGrid += 1;
    const day = byDay.get(ymd) || [];
    day.push(b);
    byDay.set(ymd, day);
  }

  const expectedPerDay = Math.floor(SESSION_MINUTES / tfMinutes);
  const shortDays = [];
  for (const [ymd, day] of byDay) {
    if (day.length !== expectedPerDay) shortDays.push({ ymd, bars: day.length, expected: expectedPerDay });
  }
  return { issues, byDay, expectedPerDay, shortDays };
}

/** Day shape from session bars only — used for the market-condition split. */
function dayProfile(bars) {
  let h = -Infinity;
  let l = Infinity;
  for (const b of bars) {
    if (b.h > h) h = b.h;
    if (b.l < l) l = b.l;
  }
  const o = bars[0].o;
  const c = bars[bars.length - 1].c;
  const range = h - l;
  return {
    open: o,
    close: c,
    high: h,
    low: l,
    range,
    rangePct: o > 0 ? range / o : 0,
    /** How much of the day's range the close-to-open move consumed. */
    directionality: range > 0 ? Math.abs(c - o) / range : 0,
  };
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function statsFrom(rows, target) {
  const scored = rows.map((r) => r.results[target]).filter(Boolean);
  const n = scored.length;
  if (!n) return null;

  const wins = scored.filter((s) => s.r > 0);
  const losses = scored.filter((s) => s.r < 0);
  const flat = scored.filter((s) => s.r === 0);
  const grossWin = wins.reduce((a, s) => a + s.r, 0);
  const grossLoss = Math.abs(losses.reduce((a, s) => a + s.r, 0));
  const netR = scored.reduce((a, s) => a + s.r, 0);

  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  let curLoss = 0;
  let curWin = 0;
  let maxLossStreak = 0;
  let maxWinStreak = 0;
  for (const s of scored) {
    equity += s.r;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDd) maxDd = peak - equity;
    if (s.r > 0) {
      curWin += 1;
      curLoss = 0;
    } else if (s.r < 0) {
      curLoss += 1;
      curWin = 0;
    }
    if (curLoss > maxLossStreak) maxLossStreak = curLoss;
    if (curWin > maxWinStreak) maxWinStreak = curWin;
  }

  const holdMinutes = rows
    .map((r) => (r.results[target] ? (r.results[target].exitAt - r.entryAt) / 60_000 : null))
    .filter((m) => Number.isFinite(m) && m >= 0);

  return {
    trades: n,
    wins: wins.length,
    losses: losses.length,
    flat: flat.length,
    timeExits: scored.filter((s) => s.result === 'TIME').length,
    ambiguous: scored.filter((s) => s.ambiguous).length,
    winRate: (wins.length / n) * 100,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    avgR: netR / n,
    netR,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : Infinity,
    maxDrawdown: maxDd,
    maxLossStreak,
    maxWinStreak,
    expectancy: netR / n,
    avgHoldMin: holdMinutes.length ? holdMinutes.reduce((a, b) => a + b, 0) / holdMinutes.length : 0,
  };
}

function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) return '∞';
  return n.toFixed(digits);
}

function table(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}`;
}

function runConfig(byDay, cfg, symbol) {
  const trades = [];
  const funnel = { days: 0, skippedDays: 0, breakouts: 0, fvgs: 0, retests: 0, entries: 0, riskSkips: 0 };
  const dayShape = new Map();

  for (const [ymd, bars] of [...byDay.entries()].sort()) {
    const day = runDay(bars, cfg);
    if (!day.ok) {
      funnel.skippedDays += 1;
      continue;
    }
    funnel.days += 1;
    dayShape.set(ymd, dayProfile(bars));

    for (const setup of day.setups) {
      if (setup.stage === 'NO_BREAKOUT') continue;
      funnel.breakouts += 1;
      if (setup.stage === 'NO_FVG') continue;
      funnel.fvgs += 1;
      if (setup.touchedAt) funnel.retests += 1;
      if (setup.stage === 'SKIP_RISK') {
        funnel.riskSkips += 1;
        continue;
      }
      if (setup.stage !== 'TRADE') continue;
      funnel.entries += 1;
      trades.push({ ...setup, ymd, symbol, hour: day.hour, levels: day.levels });
    }
  }
  return { trades, funnel, dayShape };
}

function bucketOf(entryAt) {
  const m = istParts(entryAt).minutes;
  if (m < 10 * 60) return '09:15–10:00';
  if (m < 11 * 60) return '10:00–11:00';
  if (m < 12 * 60) return '11:00–12:00';
  if (m < 13 * 60) return '12:00–13:00';
  if (m < 14 * 60) return '13:00–14:00';
  return '14:00–15:30';
}

function section(title) {
  return `\n\n## ${title}\n`;
}

function main() {
  const symbolArg = arg('symbols', '').trim().toUpperCase();
  const symbols = ['', 'ALL', 'FNO'].includes(symbolArg)
    ? []
    : symbolArg.split(',').map((s) => s.trim()).filter(Boolean);
  const timeframes = arg('tf', '3m,5m').split(',').map((s) => s.trim()).filter(Boolean);
  const headline = Number(arg('headline', '2'));
  const zoneEdge = arg('zoneEdge', 'outer');

  mkdirSync(outDir, { recursive: true });
  const out = [];
  const logRows = [
    [
      'Date', 'Symbol', 'TF', 'StopModel', 'Direction', '1H High', '1H Low', 'UpperKind', 'LowerKind',
      'Breakout Time', 'Breakout Price', 'FVG Time', 'FVG High', 'FVG Low', 'Retest Time',
      'Entry Time', 'Entry', 'SL', 'Risk',
      ...TARGETS.map((t) => `1:${t}`),
      'ExitTime@1:2', 'ExitPrice@1:2', 'R@1:2', 'Hold(min)@1:2',
    ],
  ];

  out.push('# 1H Opening Range + FVG retest — baseline backtest');
  out.push('');
  out.push(`Generated ${new Date().toISOString()}`);
  out.push('');
  out.push('Rules as executed (nothing here was optimised):');
  out.push('');
  out.push(
    table(
      ['Rule', 'Setting'],
      [
        ['Session', '09:15–15:30 IST, opening range = 09:15–10:15'],
        ['Opening-range wick', 'wick < half the body → ZONE, otherwise LINE (doji → LINE)'],
        ['Breakout level for a zone', zoneEdge === 'inner' ? 'inner edge (body)' : 'outer edge (1H high/low)'],
        ['Breakout', `a green/red close strictly beyond the level, buffer ${DEFAULT_CONFIG.breakoutBufferTicks} tick(s)`],
        ['FVG window', `third candle within ${DEFAULT_CONFIG.fvgMaxBarsAfterBreakout} bars of the breakout; first qualifying gap only`],
        ['FVG placement', DEFAULT_CONFIG.requireFvgBeyondRange ? 'must sit beyond the opening-range level' : 'anywhere'],
        ['FVG death', 'a candle CLOSES back through the far edge'],
        ['Confirmation', `${DEFAULT_CONFIG.confirmationRule} — directional close with the far wick under half the body`],
        ['Entry', 'at the close of that candle, no second confirmation'],
        ['Setups per day', 'one long and one short at most, first qualifying gap per side'],
        ['Risk floor', `${(DEFAULT_CONFIG.minRiskPct * 100).toFixed(2)}% of entry price`],
        ['Same-bar SL and TP', 'scored as a loss'],
        ['Cut-off', `no new entry after ${Math.floor(DEFAULT_CONFIG.lastEntryMin / 60)}:${String(DEFAULT_CONFIG.lastEntryMin % 60).padStart(2, '0')}, open trades marked out at 15:15`],
        ['Costs', 'none — gross R only'],
      ],
    ),
  );

  const missing = [];
  const allRuns = [];

  for (const tf of timeframes) {
    const tfMinutes = Number(tf.replace('m', ''));
    const names = symbols.length ? symbols : discoverSymbols(tf);
    const audits = [];

    for (const symbol of names) {
      const series = loadSeries(symbol, tf);
      if (!series || !series.candles.length) {
        missing.push(`${symbol} ${tf}`);
        continue;
      }
      const audit = auditSeries(series, tfMinutes);
      audits.push({ symbol, series, audit });

      for (const stopModel of ['A', 'B']) {
        const cfg = { ...DEFAULT_CONFIG, tfMinutes, stopModel, zoneEdge };
        const run = runConfig(audit.byDay, cfg, symbol);
        allRuns.push({ symbol, tf, stopModel, ...run });

        for (const t of run.trades) {
          const r2 = t.results[headline];
          logRows.push([
            t.ymd, t.symbol, tf, stopModel, t.side.toUpperCase(),
            fmt(t.levels.high), fmt(t.levels.low), t.levels.upperKind, t.levels.lowerKind,
            istClock(t.breakoutAt), fmt(t.breakoutPrice),
            istClock(t.fvgAt), fmt(t.fvgUpper), fmt(t.fvgLower),
            t.touchedAt ? istClock(t.touchedAt) : '',
            istClock(t.entryAt), fmt(t.entry), fmt(t.stop), fmt(t.risk),
            ...TARGETS.map((x) => t.results[x]?.result || ''),
            r2 ? istClock(r2.exitAt) : '', r2 ? fmt(r2.exit) : '', r2 ? fmt(r2.r) : '',
            r2 ? fmt((r2.exitAt - t.entryAt) / 60_000, 0) : '',
          ]);
        }
      }
    }

    if (audits.length) {
      const totals = audits.reduce(
        (a, x) => ({
          bars: a.bars + x.series.candles.length,
          duplicates: a.duplicates + x.audit.issues.duplicates,
          unsorted: a.unsorted + x.audit.issues.unsorted,
          badOhlc: a.badOhlc + x.audit.issues.badOhlc,
          nonPositive: a.nonPositive + x.audit.issues.nonPositive,
          offGrid: a.offGrid + x.audit.issues.offGrid,
          outOfSession: a.outOfSession + x.audit.issues.outOfSession,
          sessions: a.sessions + x.audit.byDay.size,
          shortDays: a.shortDays + x.audit.shortDays.length,
        }),
        { bars: 0, duplicates: 0, unsorted: 0, badOhlc: 0, nonPositive: 0, offGrid: 0, outOfSession: 0, sessions: 0, shortDays: 0 },
      );
      const spans = audits.flatMap((x) => x.series.candles.length ? [x.series.candles[0].t, x.series.candles[x.series.candles.length - 1].t] : []);
      out.push(section(`Data quality — ${tf} (${audits.length} symbols)`));
      out.push(
        table(
          ['Check', 'Result'],
          [
            ['Symbols loaded', String(audits.length)],
            ['Total bars', String(totals.bars)],
            ['Earliest bar (IST)', spans.length ? istParts(Math.min(...spans)).ymd : '—'],
            ['Latest bar (IST)', spans.length ? istParts(Math.max(...spans)).ymd : '—'],
            ['Symbol-sessions', String(totals.sessions)],
            ['Duplicate timestamps', String(totals.duplicates)],
            ['Out-of-order bars', String(totals.unsorted)],
            ['Abnormal OHLC (h<l, h<body, l>body)', String(totals.badOhlc)],
            ['Non-positive prices', String(totals.nonPositive)],
            ['Off the IST bar grid', String(totals.offGrid)],
            ['Outside 09:15–15:30 IST', String(totals.outOfSession)],
            ['Symbol-sessions with missing bars', String(totals.shortDays)],
          ],
        ),
      );
      out.push('');
      out.push(
        'Nothing above was patched. A session is dropped from the replay only when the opening hour itself ' +
          'is short, because the 1H range would otherwise be built from a partial candle. Note that the ' +
          'transport layer keys candles by timestamp, so duplicates are collapsed before this audit sees them — ' +
          'the meaningful signal here is missing bars, not duplicates.',
      );
      const worst = audits
        .map((x) => ({ symbol: x.symbol, bad: x.audit.issues.badOhlc + x.audit.issues.offGrid, short: x.audit.shortDays.length, sessions: x.audit.byDay.size }))
        .filter((x) => x.bad > 0 || x.short > 0)
        .sort((a, b) => b.bad + b.short - (a.bad + a.short))
        .slice(0, 15);
      if (worst.length) {
        out.push('');
        out.push('Symbols worth a look before trusting their rows:');
        out.push('');
        out.push(
          table(
            ['Symbol', 'Bad/off-grid bars', 'Short sessions', 'Sessions'],
            worst.map((w) => [w.symbol, String(w.bad), String(w.short), String(w.sessions)]),
          ),
        );
      }
    }
  }

  if (missing.length) {
    out.push(section('Missing data'));
    out.push(`No candle file for: ${missing.join(', ')}. Pull it first with scripts/backtest/pullCandles.mjs.`);
  }

  if (!allRuns.length) {
    out.push('');
    out.push('**No series could be loaded, so no results were produced.**');
    console.log(out.join('\n'));
    return;
  }

  for (const tf of timeframes) {
    for (const stopModel of ['A', 'B']) {
      const runs = allRuns.filter((r) => r.tf === tf && r.stopModel === stopModel);
      if (!runs.length) continue;
      const trades = runs.flatMap((r) => r.trades);
      const funnel = runs.reduce(
        (a, r) => ({
          days: a.days + r.funnel.days,
          skippedDays: a.skippedDays + r.funnel.skippedDays,
          breakouts: a.breakouts + r.funnel.breakouts,
          fvgs: a.fvgs + r.funnel.fvgs,
          retests: a.retests + r.funnel.retests,
          entries: a.entries + r.funnel.entries,
          riskSkips: a.riskSkips + r.funnel.riskSkips,
        }),
        { days: 0, skippedDays: 0, breakouts: 0, fvgs: 0, retests: 0, entries: 0, riskSkips: 0 },
      );

      out.push(section(`${tf} · Stop model ${stopModel} — funnel`));
      out.push(
        table(
          ['Stage', 'Count'],
          [
            ['Trading days replayed', String(funnel.days)],
            ['Days dropped (bad opening hour)', String(funnel.skippedDays)],
            ['Breakouts / breakdowns', String(funnel.breakouts)],
            ['…that produced a qualifying FVG', String(funnel.fvgs)],
            ['…that were retested', String(funnel.retests)],
            ['…that confirmed and entered', String(funnel.entries)],
            ['Signals skipped on risk floor', String(funnel.riskSkips)],
          ],
        ),
      );

      if (!trades.length) {
        out.push('');
        out.push('No trades were generated for this combination.');
        continue;
      }

      const base = statsFrom(trades, headline);
      out.push(section(`${tf} · Stop model ${stopModel} — headline (target 1:${headline})`));
      out.push(
        table(
          ['Metric', 'Value'],
          [
            ['Total trades', String(base.trades)],
            ['Long trades', String(trades.filter((t) => t.side === 'long').length)],
            ['Short trades', String(trades.filter((t) => t.side === 'short').length)],
            ['Winners', String(base.wins)],
            ['Losers', String(base.losses)],
            ['Timed out at square-off', String(base.timeExits)],
            ['Same-bar SL+TP (scored as loss)', String(base.ambiguous)],
            ['Win rate', `${fmt(base.winRate)}%`],
            ['Average win (R)', fmt(base.avgWin)],
            ['Average loss (R)', fmt(base.avgLoss)],
            ['Average R', fmt(base.avgR)],
            ['Net R', fmt(base.netR)],
            ['Profit factor', fmt(base.profitFactor)],
            ['Max drawdown (R)', fmt(base.maxDrawdown)],
            ['Max consecutive losses', String(base.maxLossStreak)],
            ['Max consecutive wins', String(base.maxWinStreak)],
            ['Expectancy per trade (R)', fmt(base.expectancy)],
            ['Average holding time (min)', fmt(base.avgHoldMin, 0)],
          ],
        ),
      );

      const byDayR = new Map();
      for (const t of trades) {
        const r = t.results[headline]?.r || 0;
        byDayR.set(t.ymd, (byDayR.get(t.ymd) || 0) + r);
      }
      const ranked = [...byDayR.entries()].sort((a, b) => b[1] - a[1]);
      if (ranked.length) {
        out.push('');
        out.push(`Best day: ${ranked[0][0]} (${fmt(ranked[0][1])}R) · Worst day: ${ranked[ranked.length - 1][0]} (${fmt(ranked[ranked.length - 1][1])}R)`);
      }

      out.push(section(`${tf} · Stop model ${stopModel} — target comparison`));
      out.push(
        table(
          ['Target', 'Trades', 'Win %', 'Loss %', 'Net R', 'PF', 'Max DD (R)', 'Expectancy', 'Avg R', 'Max cons. losses', 'Avg hold (min)'],
          TARGETS.map((t) => {
            const s = statsFrom(trades, t);
            return [
              `1:${t}`, String(s.trades), fmt(s.winRate), fmt((s.losses / s.trades) * 100),
              fmt(s.netR), fmt(s.profitFactor), fmt(s.maxDrawdown), fmt(s.expectancy),
              fmt(s.avgR), String(s.maxLossStreak), fmt(s.avgHoldMin, 0),
            ];
          }),
        ),
      );

      out.push(section(`${tf} · Stop model ${stopModel} — long vs short (target 1:${headline})`));
      out.push(
        table(
          ['Side', 'Trades', 'Win %', 'Net R', 'PF', 'Expectancy', 'Max DD (R)'],
          ['long', 'short'].map((side) => {
            const s = statsFrom(trades.filter((t) => t.side === side), headline);
            if (!s) return [side.toUpperCase(), '0', '—', '—', '—', '—', '—'];
            return [side.toUpperCase(), String(s.trades), fmt(s.winRate), fmt(s.netR), fmt(s.profitFactor), fmt(s.expectancy), fmt(s.maxDrawdown)];
          }),
        ),
      );

      out.push(section(`${tf} · Stop model ${stopModel} — entry time (target 1:${headline})`));
      const buckets = new Map();
      for (const t of trades) {
        const b = bucketOf(t.entryAt);
        const list = buckets.get(b) || [];
        list.push(t);
        buckets.set(b, list);
      }
      out.push(
        table(
          ['Window', 'Trades', 'Win %', 'Net R', 'Expectancy'],
          [...buckets.entries()].sort().map(([b, list]) => {
            const s = statsFrom(list, headline);
            return [b, String(s.trades), fmt(s.winRate), fmt(s.netR), fmt(s.expectancy)];
          }),
        ),
      );

      const shapes = runs.flatMap((r) => [...r.dayShape.entries()]);
      const medRange = median(shapes.map(([, s]) => s.rangePct));
      out.push(section(`${tf} · Stop model ${stopModel} — market condition (target 1:${headline})`));
      out.push(
        `Definitions: a day is **trending** when |close − open| ≥ 60% of the day's high−low, **range-bound** when ≤ 30%, ` +
          `and **mixed** in between. **High volatility** means the day's (high−low)/open sits above the sample median of ` +
          `${fmt(medRange * 100)}%, low volatility below it.`,
      );
      const shapeBy = new Map(shapes);
      const classOf = (t) => {
        const s = shapeBy.get(t.ymd);
        if (!s) return null;
        const trend = s.directionality >= 0.6 ? 'Trending' : s.directionality <= 0.3 ? 'Range-bound' : 'Mixed';
        const vol = s.rangePct > medRange ? 'High vol' : 'Low vol';
        return { trend, vol };
      };
      const groups = new Map();
      for (const t of trades) {
        const k = classOf(t);
        if (!k) continue;
        for (const label of [k.trend, k.vol]) {
          const list = groups.get(label) || [];
          list.push(t);
          groups.set(label, list);
        }
      }
      out.push('');
      out.push(
        table(
          ['Condition', 'Trades', 'Win %', 'Net R', 'Expectancy'],
          [...groups.entries()].map(([label, list]) => {
            const s = statsFrom(list, headline);
            return [label, String(s.trades), fmt(s.winRate), fmt(s.netR), fmt(s.expectancy)];
          }),
        ),
      );
    }
  }

  const csv = logRows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const csvPath = resolve(outDir, 'trade-log.csv');
  writeFileSync(csvPath, csv);
  const mdPath = resolve(outDir, 'report.md');
  const text = out.join('\n');
  writeFileSync(mdPath, text);

  console.log(text);
  console.log(`\n\nTrade log: ${csvPath} (${logRows.length - 1} rows)`);
  console.log(`Report:    ${mdPath}`);
}

main();
