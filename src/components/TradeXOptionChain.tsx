import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  Download,
  Layers,
  RefreshCw,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FNO_INDICES, FNO_STOCKS, getFnoInstrument, getStrikeIntervalForSpot } from '../data/fnoUniverse';
import { calculateMaxPain } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { getLiveQuote } from '../services/symbolLiveService';
import {
  fetchOptionChainLive,
  daysToExpiry,
  exportChainCsv,
  getOiChartData,
  type EnhancedOptionRow,
  type OiBuildup,
} from '../services/optionChainEngine';

const fmtK = (v: number) =>
  Math.abs(v) >= 100_000 ? `${(v / 100_000).toFixed(2)}L` : `${(v / 1000).toFixed(1)}K`;
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const fmtPrice = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GREEK_NAMES = ['Delta', 'Gamma', 'Theta', 'Vega', 'Rho'] as const;
const QUOTE_COLS = 7; // OI, Chg, Vol, IV, Bid, Ask, LTP

const INDEX_CHIPS = FNO_INDICES.map((i) => i.symbol);
const STOCK_OPTIONS = FNO_STOCKS.slice(0, 24);

const BUILDUP_STYLE: Record<OiBuildup, string> = {
  'Long Buildup': 'text-emerald-400 bg-emerald-500/15',
  'Short Buildup': 'text-red-400 bg-red-500/15',
  'Short Covering': 'text-blue-400 bg-blue-500/15',
  'Long Unwinding': 'text-orange-400 bg-orange-500/15',
  Neutral: 'text-slate-500 bg-slate-500/10',
};

type TabId = 'chain' | 'oi' | 'analytics';
type StrikeRange = 'ALL' | 'ATM5' | 'ATM10' | 'ATM15';
type StrikeFilter = 'ALL' | 'ITM' | 'ATM' | 'OTM';

function fmtGreek(v: number, name: (typeof GREEK_NAMES)[number]) {
  if (name === 'Gamma') return v.toFixed(4);
  if (name === 'Rho') return v.toFixed(3);
  return v.toFixed(2);
}

function greekVal(row: EnhancedOptionRow, side: 'CE' | 'PE', name: (typeof GREEK_NAMES)[number]) {
  if (side === 'CE') {
    return { Delta: row.ceDelta, Gamma: row.ceGamma, Theta: row.ceTheta, Vega: row.ceVega, Rho: row.ceRho }[name];
  }
  return { Delta: row.peDelta, Gamma: row.peGamma, Theta: row.peTheta, Vega: row.peVega, Rho: row.peRho }[name];
}

function greekClass(name: (typeof GREEK_NAMES)[number]) {
  if (name === 'Theta') return 'text-red-400/90';
  if (name === 'Vega') return 'text-blue-300/90';
  if (name === 'Gamma') return 'text-purple-300/90';
  if (name === 'Rho') return 'text-cyan-300/90';
  return 'text-slate-400';
}

function BuildupPill({ label }: { label: OiBuildup }) {
  if (label === 'Neutral') return <span className="text-[8px] text-dark-muted">—</span>;
  return (
    <span className={`text-[8px] font-bold px-1 py-0.5 rounded whitespace-nowrap ${BUILDUP_STYLE[label]}`}>
      {label.replace(' ', '')}
    </span>
  );
}

function OiBar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = Math.min((value / max) * 100, 100);
  return (
    <div className="h-0.5 w-10 bg-dark-border rounded-full mt-0.5 ml-auto">
      <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: color }} />
    </div>
  );
}

export default function TradeXOptionChain() {
  const [apiExpiries, setApiExpiries] = useState<string[]>([]);
  const expiries = apiExpiries;
  const [symbol, setSymbol] = useState('NIFTY');
  const [expiry, setExpiry] = useState('');
  const [strikes, setStrikes] = useState<EnhancedOptionRow[]>([]);
  const [spotPrice, setSpotPrice] = useState(0);
  const [spotChangePct, setSpotChangePct] = useState(0);
  const [searchStrike, setSearchStrike] = useState('');
  const [showGreeks, setShowGreeks] = useState(true);
  const [showBuildup, setShowBuildup] = useState(true);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>('chain');
  const [strikeRange, setStrikeRange] = useState<StrikeRange>('ATM10');
  const [strikeFilter, setStrikeFilter] = useState<StrikeFilter>('ALL');
  const [heatmap, setHeatmap] = useState(true);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState('');
  const [chainSource, setChainSource] = useState('');
  const atmRowRef = useRef<HTMLTableRowElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const windowSize =
    strikeRange === 'ALL'
      ? 0
      : strikeRange === 'ATM5'
        ? 11
        : strikeRange === 'ATM10'
          ? 21
          : strikeRange === 'ATM15'
            ? 31
            : 51;

  const inst = getFnoInstrument(symbol);
  const interval = getStrikeIntervalForSpot(spotPrice || (inst?.basePrice ?? 24580), inst);

  const refresh = useCallback(
    (opts?: { force?: boolean }) => {
      setChainLoading(true);
      setChainError('');
      void fetchOptionChainLive(symbol, expiry, {
        force: opts?.force === true,
        strikeWindow: windowSize,
      })
        .then((snap) => {
          const quote = getLiveQuote(symbol);
          const spot = snap?.spot || quote?.price || inst?.basePrice || 0;
          setSpotPrice(spot);
          setSpotChangePct(quote?.changePercent ?? 0);
          if (snap?.expiries?.length) {
            setApiExpiries(snap.expiries);
            const exp = snap.expiry || snap.expiries[0];
            if (exp && (!expiry || !snap.expiries.includes(expiry))) {
              setExpiry(exp);
            }
          }
          if (!snap?.rows.length || snap?.source === 'error') {
            setChainError(
              snap?.error ||
                'Live data nahi mila — Profile se connect karein, phir Refresh.',
            );
            setStrikes([]);
            setChainSource('');
            return;
          }
          setChainSource(
            snap.source?.startsWith('fyers')
              ? `TradeX${snap.error || snap.source.includes('cached') ? ' (cache)' : ''}`
              : snap.source,
          );
          setStrikes(snap.rows);
          if (!snap.rows.length) {
            setChainError('Option chain khali — 30s wait karke Refresh dabayein.');
          }
        })
        .catch(() => {
          setChainError('Load failed — live server slow ho sakta hai, 30s wait karke Refresh dabayein.');
          setStrikes([]);
        })
        .finally(() => setChainLoading(false));
    },
    [symbol, expiry, windowSize, inst?.basePrice],
  );

  useEffect(() => {
    refresh({ force: true });
  }, [symbol, expiry, windowSize]);

  useAutoRefresh(() => refresh());

  useEffect(() => {
    setSelectedStrike(null);
  }, [symbol, expiry]);

  useEffect(() => {
    if (tab !== 'chain') return;
    const t = window.setTimeout(() => {
      atmRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [symbol, expiry, tab, strikes.length]);

  const atmStrike = Math.round(spotPrice / interval) * interval;
  const dte = daysToExpiry(expiry);

  const filtered = useMemo(() => {
    let rows = strikes;
    if (searchStrike.trim()) {
      rows = rows.filter((r) => r.strike.toString().includes(searchStrike.trim()));
    }
    if (strikeFilter === 'ATM') return rows.filter((r) => r.strike === atmStrike);
    if (strikeFilter === 'ITM') return rows.filter((r) => r.strike < spotPrice);
    if (strikeFilter === 'OTM') return rows.filter((r) => r.strike > spotPrice);
    return rows;
  }, [strikes, searchStrike, strikeFilter, atmStrike, spotPrice]);

  const spotInsertAfter = useMemo(() => {
    for (let i = 0; i < filtered.length - 1; i++) {
      if (filtered[i].strike < spotPrice && filtered[i + 1].strike >= spotPrice) return filtered[i].strike;
    }
    return null;
  }, [filtered, spotPrice]);

  const totals = useMemo(
    () =>
      strikes.reduce(
        (a, r) => ({
          ceOi: a.ceOi + r.ceOi,
          peOi: a.peOi + r.peOi,
          ceOiChg: a.ceOiChg + r.ceOiChg,
          peOiChg: a.peOiChg + r.peOiChg,
          ceVol: a.ceVol + r.ceVolume,
          peVol: a.peVol + r.peVolume,
        }),
        { ceOi: 0, peOi: 0, ceOiChg: 0, peOiChg: 0, ceVol: 0, peVol: 0 },
      ),
    [strikes],
  );

  const maxPain = useMemo(() => calculateMaxPain(strikes), [strikes]);
  const maxCeOi = Math.max(1, ...strikes.map((r) => r.ceOi));
  const maxPeOi = Math.max(1, ...strikes.map((r) => r.peOi));
  const maxCeStrike = strikes.find((r) => r.ceOi === maxCeOi)?.strike ?? 0;
  const maxPeStrike = strikes.find((r) => r.peOi === maxPeOi)?.strike ?? 0;
  const pcr = totals.peOi / Math.max(totals.ceOi, 1);
  const oiChart = useMemo(() => getOiChartData(strikes), [strikes]);
  const ivSkew = useMemo(
    () => strikes.map((r) => ({ strike: r.strike, ceIv: r.ceIv, peIv: r.peIv })),
    [strikes],
  );
  const selected = strikes.find((r) => r.strike === selectedStrike) ?? null;
  const bias = pcr > 1.2 ? 'Bullish' : pcr < 0.85 ? 'Bearish' : 'Neutral';

  const greekCols = showGreeks ? GREEK_NAMES.length : 0;
  const ceCols = QUOTE_COLS + greekCols + (showBuildup ? 1 : 0);
  const strikeCols = 2;
  const peCols = (showBuildup ? 1 : 0) + greekCols + QUOTE_COLS;
  const totalCols = ceCols + strikeCols + peCols;
  const tableMinW = showGreeks ? 2280 : 1520;

  return (
    <div className="option-chain-page flex flex-col gap-2 h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden -m-1 sm:m-0">
      {/* Toolbar */}
      <div className="shrink-0 app-card px-3 py-2.5 border-gold/20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 min-w-0 mr-1">
            <Layers className="w-4 h-4 text-gold shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-gold leading-tight">Option Chain</h2>
              <p className="text-[10px] text-dark-muted truncate">{inst?.name ?? symbol}</p>
            </div>
          </div>

          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="tf-field text-xs rounded-lg border px-2 py-1.5 max-w-[140px]"
          >
            <optgroup label="Indices">
              {FNO_INDICES.map((i) => (
                <option key={i.symbol} value={i.symbol}>
                  {i.symbol}
                </option>
              ))}
            </optgroup>
            <optgroup label="F&O Stocks">
              {STOCK_OPTIONS.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol}
                </option>
              ))}
            </optgroup>
          </select>

          <div className="hidden sm:flex flex-wrap gap-1">
            {INDEX_CHIPS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSymbol(s)}
                className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors ${
                  symbol === s
                    ? 'bg-gold text-dark-surface border-gold'
                    : 'border-dark-border text-dark-muted hover:border-gold/40'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            disabled={!expiries.length}
            className="tf-field text-xs rounded-lg border px-2 py-1.5 disabled:opacity-50"
          >
            {expiries.length ? (
              expiries.map((d) => (
                <option key={d} value={d}>
                  {d} ({daysToExpiry(d)}D)
                </option>
              ))
            ) : (
              <option value="">Loading expiries…</option>
            )}
          </select>

          <div className="ml-auto flex items-center gap-2 px-2.5 py-1 rounded-lg bg-dark-elevated border border-dark-border">
            <div>
              <div className="text-[9px] text-dark-muted uppercase">Spot</div>
              <div className="text-sm font-bold tabular-nums text-slate-100">{fmtPrice(spotPrice)}</div>
            </div>
            <span
              className={`text-xs font-bold flex items-center gap-0.5 ${
                spotChangePct >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {spotChangePct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {fmtPct(spotChangePct)}
            </span>
            <button
              type="button"
              onClick={() => refresh({ force: true })}
              disabled={chainLoading}
              className="p-1.5 rounded border border-dark-border text-dark-muted hover:text-gold disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${chainLoading ? 'animate-spin' : ''}`} />
            </button>
            {chainSource ? (
              <span className="text-[9px] text-emerald-400/90 uppercase">{chainSource}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-dark-border">
          <select
            value={strikeRange}
            onChange={(e) => setStrikeRange(e.target.value as StrikeRange)}
            className="tf-field text-[11px] rounded-lg border px-2 py-1"
          >
            <option value="ATM5">±5</option>
            <option value="ATM10">±10</option>
            <option value="ATM15">±15</option>
            <option value="ALL">All</option>
          </select>
          <select
            value={strikeFilter}
            onChange={(e) => setStrikeFilter(e.target.value as StrikeFilter)}
            className="tf-field text-[11px] rounded-lg border px-2 py-1"
          >
            <option value="ALL">All strikes</option>
            <option value="ITM">ITM (below spot)</option>
            <option value="ATM">ATM only</option>
            <option value="OTM">OTM (above spot)</option>
          </select>
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-dark-muted" />
            <input
              value={searchStrike}
              onChange={(e) => setSearchStrike(e.target.value)}
              placeholder="Strike"
              className="tf-field text-[11px] rounded-lg border pl-6 pr-2 py-1 w-20"
            />
          </div>
          {(
            [
              ['Greeks', showGreeks, () => setShowGreeks((v) => !v)],
              ['Buildup', showBuildup, () => setShowBuildup((v) => !v)],
              ['Heatmap', heatmap, () => setHeatmap((v) => !v)],
            ] as const
          ).map(([label, on, toggle]) => (
            <button
              key={label}
              type="button"
              onClick={toggle}
              className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                on ? 'bg-gold/15 border-gold/40 text-gold' : 'border-dark-border text-dark-muted'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => exportChainCsv(strikes, symbol, expiry)}
            className="p-1.5 rounded-lg border border-dark-border text-dark-muted hover:text-gold ml-auto"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="shrink-0 flex gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
        {[
          { l: 'PCR', v: pcr.toFixed(2), c: pcr > 1 ? 'text-emerald-400' : 'text-red-400' },
          { l: 'Bias', v: bias, c: bias === 'Bullish' ? 'text-emerald-400' : bias === 'Bearish' ? 'text-red-400' : 'text-slate-400' },
          { l: 'Max Pain', v: String(maxPain.maxPainStrike), c: 'text-gold' },
          { l: 'ATM', v: String(atmStrike), c: 'text-blue-300' },
          { l: 'DTE', v: `${dte}d`, c: 'text-slate-300' },
          { l: 'Max CE OI', v: String(maxCeStrike), c: 'text-red-400' },
          { l: 'Max PE OI', v: String(maxPeStrike), c: 'text-emerald-400' },
          { l: 'CE OI', v: fmtK(totals.ceOi), c: 'text-red-300' },
          { l: 'PE OI', v: fmtK(totals.peOi), c: 'text-emerald-300' },
          { l: 'Lot', v: String(inst?.lotSize ?? '—'), c: 'text-slate-400' },
        ].map((x) => (
          <div key={x.l} className="app-card px-3 py-1.5 shrink-0 min-w-[72px]">
            <div className="text-[8px] text-dark-muted uppercase font-bold">{x.l}</div>
            <div className={`text-xs font-bold tabular-nums ${x.c}`}>{x.v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-1 p-0.5 rounded-lg bg-dark-elevated border border-dark-border w-fit">
        {(
          [
            { id: 'chain' as const, label: 'Chain', icon: Layers },
            { id: 'oi' as const, label: 'OI', icon: BarChart3 },
            { id: 'analytics' as const, label: 'Analytics', icon: Target },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-md ${
              tab === id ? 'bg-gold text-dark-surface' : 'text-dark-muted'
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
        {tab === 'chain' && (
          <span className="text-[10px] text-dark-muted self-center ml-2 hidden md:inline">
            {filtered.length} strikes · scroll → for Greeks
          </span>
        )}
      </div>

      {/* Main panel */}
      <div className="flex-1 min-h-0 flex flex-col app-card overflow-hidden p-0 relative">
        {tab === 'chain' && (
          <>
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 h-48 px-4 text-center">
                  {chainLoading ? (
                    <>
                      <RefreshCw className="w-8 h-8 text-gold animate-spin" />
                      <p className="text-sm text-dark-muted">Option chain load ho rahi hai…</p>
                    </>
                  ) : chainError || strikes.length === 0 ? (
                    <>
                      <p className="text-sm text-amber-200/90 max-w-md">{chainError || 'Data nahi mila.'}</p>
                      <button
                        type="button"
                        onClick={() => refresh({ force: true })}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gold text-dark-surface"
                      >
                        Refresh
                      </button>
                      <p className="text-[10px] text-dark-muted">
                        TradeX live data — Profile se connect karein. Rate limit par 30s wait.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-dark-muted">
                      Filter se koi strike nahi — range ya ITM/OTM reset karein.
                    </p>
                  )}
                </div>
              ) : (
                <table
                  className="w-full text-[11px] border-collapse"
                  style={{ minWidth: tableMinW }}
                >
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-dark-elevated text-[10px] uppercase text-dark-muted">
                      <th colSpan={ceCols} className="py-1.5 text-right text-red-400 border-b border-dark-border pr-2">
                        CALLS (CE)
                      </th>
                      <th
                        colSpan={strikeCols}
                        className="py-1.5 text-center text-gold border-b border-x-2 border-gold/30 bg-dark-surface"
                      >
                        STRIKE
                      </th>
                      <th colSpan={peCols} className="py-1.5 text-left text-emerald-400 border-b border-dark-border pl-2">
                        PUTS (PE)
                      </th>
                    </tr>
                    <tr className="bg-dark-bg text-[9px] uppercase text-dark-muted whitespace-nowrap">
                      <th className="px-1.5 py-1 text-right">OI</th>
                      <th className="px-1.5 py-1 text-right">Chg OI</th>
                      <th className="px-1.5 py-1 text-right">Vol</th>
                      <th className="px-1.5 py-1 text-right">IV%</th>
                      <th className="px-1.5 py-1 text-right">Bid</th>
                      <th className="px-1.5 py-1 text-right">Ask</th>
                      <th className="px-1.5 py-1 text-right">LTP</th>
                      {showGreeks &&
                        GREEK_NAMES.map((g) => (
                          <th key={`ce-h-${g}`} className="px-1 py-1 text-right text-amber-200/80">
                            {g}
                          </th>
                        ))}
                      {showBuildup && <th className="px-1 py-1 text-right">Buildup</th>}
                      <th className="px-2 py-1 text-center text-gold bg-dark-surface border-x-2 border-gold/30">
                        Strike
                      </th>
                      <th className="px-1.5 py-1 text-center">PCR</th>
                      {showBuildup && <th className="px-1 py-1 text-left">Buildup</th>}
                      {showGreeks &&
                        [...GREEK_NAMES].reverse().map((g) => (
                          <th key={`pe-h-${g}`} className="px-1 py-1 text-left text-amber-200/80">
                            {g}
                          </th>
                        ))}
                      <th className="px-1.5 py-1 text-left">LTP</th>
                      <th className="px-1.5 py-1 text-left">Bid</th>
                      <th className="px-1.5 py-1 text-left">Ask</th>
                      <th className="px-1.5 py-1 text-left">IV%</th>
                      <th className="px-1.5 py-1 text-left">Vol</th>
                      <th className="px-1.5 py-1 text-left">Chg OI</th>
                      <th className="px-1.5 py-1 text-left">OI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const isAtm = row.strike === atmStrike;
                      const isSel = selectedStrike === row.strike;
                      const ceMax = row.ceOi === maxCeOi;
                      const peMax = row.peOi === maxPeOi;
                      const ceHeat = heatmap ? row.ceOi / maxCeOi : 0;
                      const peHeat = heatmap ? row.peOi / maxPeOi : 0;
                      const showSpotLine = spotInsertAfter === row.strike;

                      return (
                        <Fragment key={row.strike}>
                          <tr
                            ref={isAtm ? atmRowRef : undefined}
                            onClick={() => setSelectedStrike((s) => (s === row.strike ? null : row.strike))}
                            className={`border-b border-dark-border/50 cursor-pointer ${
                              isSel ? 'bg-gold/12' : 'hover:bg-dark-elevated/70'
                            } ${isAtm ? 'bg-gold/5' : ''}`}
                          >
                            <td
                              className={`px-1.5 py-0.5 text-right ${ceMax ? 'text-red-300 font-bold' : ''}`}
                              style={heatmap ? { backgroundColor: `rgba(239,68,68,${ceHeat * 0.3})` } : undefined}
                            >
                              <div>{fmtK(row.ceOi)}</div>
                              <OiBar value={row.ceOi} max={maxCeOi} color="#ef4444" />
                            </td>
                            <td
                              className={`px-1.5 py-0.5 text-right tabular-nums ${
                                row.ceOiChg >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {row.ceOiChg >= 0 ? '+' : ''}
                              {fmtK(row.ceOiChg)}
                            </td>
                            <td className="px-1.5 py-0.5 text-right text-dark-muted">{fmtK(row.ceVolume)}</td>
                            <td className="px-1.5 py-0.5 text-right text-dark-muted">{row.ceIv}</td>
                            <td className="px-1.5 py-0.5 text-right text-slate-500 tabular-nums">{row.ceBid}</td>
                            <td className="px-1.5 py-0.5 text-right text-slate-500 tabular-nums">{row.ceAsk}</td>
                            <td className="px-1.5 py-0.5 text-right text-red-300 font-bold tabular-nums">
                              {row.ceLtp.toFixed(2)}
                            </td>
                            {showGreeks &&
                              GREEK_NAMES.map((g) => (
                                <td
                                  key={`ce-${row.strike}-${g}`}
                                  className={`px-1 py-0.5 text-right tabular-nums ${greekClass(g)}`}
                                >
                                  {fmtGreek(greekVal(row, 'CE', g), g)}
                                </td>
                              ))}
                            {showBuildup && (
                              <td className="px-1 py-0.5 text-right">
                                <BuildupPill label={row.ceBuildup} />
                              </td>
                            )}
                            <td
                              className={`px-2 py-0.5 text-center font-black border-x-2 border-gold/25 bg-dark-surface/80 ${
                                isAtm ? 'text-gold bg-gold/15' : 'text-slate-100'
                              }`}
                            >
                              {row.strike}
                              {isAtm && <div className="text-[7px] text-gold/80 font-bold">ATM</div>}
                            </td>
                            <td
                              className={`px-1.5 py-0.5 text-center font-bold tabular-nums ${
                                row.strikePcr > 1 ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {row.strikePcr.toFixed(2)}
                            </td>
                            {showBuildup && (
                              <td className="px-1 py-0.5 text-left">
                                <BuildupPill label={row.peBuildup} />
                              </td>
                            )}
                            {showGreeks &&
                              [...GREEK_NAMES].reverse().map((g) => (
                                <td
                                  key={`pe-${row.strike}-${g}`}
                                  className={`px-1 py-0.5 text-left tabular-nums ${greekClass(g)}`}
                                >
                                  {fmtGreek(greekVal(row, 'PE', g), g)}
                                </td>
                              ))}
                            <td className="px-1.5 py-0.5 text-left text-emerald-300 font-bold tabular-nums">
                              {row.peLtp.toFixed(2)}
                            </td>
                            <td className="px-1.5 py-0.5 text-left text-slate-500 tabular-nums">{row.peBid}</td>
                            <td className="px-1.5 py-0.5 text-left text-slate-500 tabular-nums">{row.peAsk}</td>
                            <td className="px-1.5 py-0.5 text-left text-dark-muted">{row.peIv}</td>
                            <td className="px-1.5 py-0.5 text-left text-dark-muted">{fmtK(row.peVolume)}</td>
                            <td
                              className={`px-1.5 py-0.5 text-left tabular-nums ${
                                row.peOiChg >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {row.peOiChg >= 0 ? '+' : ''}
                              {fmtK(row.peOiChg)}
                            </td>
                            <td
                              className={`px-1.5 py-0.5 text-left ${peMax ? 'text-emerald-300 font-bold' : ''}`}
                              style={heatmap ? { backgroundColor: `rgba(16,185,129,${peHeat * 0.3})` } : undefined}
                            >
                              <div>{fmtK(row.peOi)}</div>
                              <OiBar value={row.peOi} max={maxPeOi} color="#10b981" />
                            </td>
                          </tr>
                          {showSpotLine && (
                            <tr className="bg-blue-500/10 border-y border-blue-500/40">
                              <td colSpan={totalCols} className="py-0.5 text-center">
                                <span className="text-[10px] font-bold text-blue-300 inline-flex items-center gap-1">
                                  <ChevronDown className="w-3 h-3" />
                                  Spot {fmtPrice(spotPrice)} · {fmtPct(spotChangePct)}
                                </span>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10 bg-dark-elevated border-t-2 border-gold/40 text-[10px] font-bold">
                    <tr>
                      <td colSpan={ceCols} className="px-2 py-1.5 text-right text-red-300">
                        CE {fmtK(totals.ceOi)} · Δ {fmtK(totals.ceOiChg)} · Vol {fmtK(totals.ceVol)}
                      </td>
                      <td colSpan={strikeCols} className="px-2 py-1.5 text-center text-gold border-x-2 border-gold/30">
                        PCR {pcr.toFixed(2)} · ATM {atmStrike}
                      </td>
                      <td colSpan={peCols} className="px-2 py-1.5 text-left text-emerald-300">
                        PE {fmtK(totals.peOi)} · Δ {fmtK(totals.peOiChg)} · Vol {fmtK(totals.peVol)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {selected && (
              <div className="absolute inset-x-0 bottom-0 z-30 app-card border-t-2 border-gold/40 shadow-2xl max-h-[42%] overflow-y-auto p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-gold">Strike {selected.strike}</h3>
                    <p className="text-[10px] text-dark-muted">
                      Straddle ₹{(selected.ceLtp + selected.peLtp).toFixed(2)} · PCR {selected.strikePcr.toFixed(2)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedStrike(null)}
                    className="p-1 rounded border border-dark-border text-dark-muted hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-2 text-[10px]">
                  {(['CE', 'PE'] as const).map((side) => (
                    <div
                      key={side}
                      className={`p-2 rounded-lg border ${
                        side === 'CE'
                          ? 'bg-red-500/10 border-red-500/25'
                          : 'bg-emerald-500/10 border-emerald-500/25'
                      }`}
                    >
                      <div className="flex justify-between font-bold mb-1">
                        <span className={side === 'CE' ? 'text-red-400' : 'text-emerald-400'}>{side}</span>
                        <span className="text-slate-100">
                          ₹{(side === 'CE' ? selected.ceLtp : selected.peLtp).toFixed(2)}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {GREEK_NAMES.map((g) => (
                          <div key={`${side}-${g}`} className="text-center p-1 rounded bg-dark-bg/90">
                            <div className="text-[8px] text-dark-muted">{g}</div>
                            <div className="font-bold tabular-nums">
                              {fmtGreek(greekVal(selected, side, g), g)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'oi' && (
          <div className="flex-1 min-h-0 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={oiChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                <XAxis dataKey="strike" tick={{ fontSize: 10 }} stroke="#64748b" />
                <YAxis tick={{ fontSize: 10 }} stroke="#64748b" tickFormatter={(v) => fmtK(v)} />
                <Tooltip
                  contentStyle={{ background: '#121520', border: '1px solid #1a1f2e', fontSize: 11 }}
                  formatter={(v) => fmtK(Number(v))}
                />
                <Bar dataKey="ceOi" name="CE OI" fill="#ef4444" radius={[2, 2, 0, 0]} />
                <Bar dataKey="peOi" name="PE OI" fill="#10b981" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {tab === 'analytics' && (
          <div className="flex-1 min-h-0 p-3 grid md:grid-cols-2 gap-3 overflow-auto">
            <div className="min-h-[200px]">
              <p className="text-xs font-bold text-dark-muted mb-2">IV Skew</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={ivSkew}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                  <XAxis dataKey="strike" tick={{ fontSize: 9 }} stroke="#64748b" />
                  <YAxis tick={{ fontSize: 9 }} stroke="#64748b" />
                  <Tooltip contentStyle={{ background: '#121520', border: '1px solid #1a1f2e', fontSize: 11 }} />
                  <Line type="monotone" dataKey="ceIv" stroke="#ef4444" dot={false} strokeWidth={2} name="CE IV" />
                  <Line type="monotone" dataKey="peIv" stroke="#10b981" dot={false} strokeWidth={2} name="PE IV" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="min-h-[200px]">
              <p className="text-xs font-bold text-dark-muted mb-2">PCR by Strike</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={oiChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                  <XAxis dataKey="strike" tick={{ fontSize: 9 }} stroke="#64748b" />
                  <YAxis tick={{ fontSize: 9 }} stroke="#64748b" />
                  <Tooltip contentStyle={{ background: '#121520', border: '1px solid #1a1f2e', fontSize: 11 }} />
                  <Line type="monotone" dataKey="pcr" stroke="#d4af37" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
