import { useEffect, useRef } from 'react';
import { Activity, Target, TrendingDown, TrendingUp } from 'lucide-react';
import type { ScenarioRow, StrategyPayoffSummary } from '../../services/strategyPayoffCalc';

interface StrategyPayoffTableProps {
  rows: ScenarioRow[];
  summary: StrategyPayoffSummary;
  spot: number;
  daysToExpiry: number;
  symbol: string;
  lastUpdated?: string;
}

function fmtINR(v: number, showSign = true) {
  const abs = Math.abs(v);
  const sign = v >= 0 ? '+' : '-';
  const prefix = showSign ? sign : '';
  if (abs >= 1e7) return `${prefix}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${prefix}₹${(abs / 1e5).toFixed(2)}L`;
  return `${prefix}₹${abs.toLocaleString('en-IN')}`;
}

function OutcomeBadge({ outcome }: { outcome: ScenarioRow['expiryOutcome'] }) {
  const styles =
    outcome === 'Profit'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : outcome === 'Loss'
        ? 'bg-red-500/15 text-red-400 border-red-500/30'
        : 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  const Icon = outcome === 'Profit' ? TrendingUp : outcome === 'Loss' ? TrendingDown : Target;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${styles}`}>
      <Icon className="w-2.5 h-2.5" />
      {outcome}
    </span>
  );
}

export default function StrategyPayoffTable({
  rows,
  summary,
  spot,
  daysToExpiry,
  symbol,
  lastUpdated,
}: StrategyPayoffTableProps) {
  const highlightRef = useRef<HTMLTableRowElement>(null);
  const futures = summary.futuresPrediction;

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [spot, rows.length]);

  if (!rows.length) {
    return (
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-6 text-center text-sm text-slate-500">
        Add strategy legs — profit/loss at each market price will appear here (Sensibull-style list)
      </div>
    );
  }

  return (
    <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
      {/* Header — futures prediction + summary */}
      <div className="px-4 py-3 border-b border-[#1a1f2e] bg-gradient-to-r from-[#121520] to-[#0b0e17]">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#d4af37] flex items-center gap-2">
              <Activity className="w-4 h-4" />
              If Market Reaches This Price — Profit or Loss?
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {symbol} · Live Spot {spot.toLocaleString('en-IN')} · {daysToExpiry} days left · Black-Scholes calc
              {lastUpdated ? ` · Updated ${new Date(lastUpdated).toLocaleTimeString('en-IN')}` : ''}
            </p>
          </div>

          {futures && (
            <div className="flex flex-wrap gap-2 text-[10px]">
              <div className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/25">
                <span className="text-slate-500 block">Futures (Live)</span>
                <span className="text-blue-300 font-bold">{futures.futuresPrice.toLocaleString('en-IN')}</span>
                <span className="text-slate-500 ml-1">({futures.basis >= 0 ? '+' : ''}{futures.basis.toFixed(0)})</span>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/25">
                <span className="text-slate-500 block">Expiry Prediction</span>
                <span className="text-violet-300 font-bold">{futures.predictedExpiryPrice.toLocaleString('en-IN')}</span>
                <span className={`ml-1 font-bold ${futures.bias === 'Bullish' ? 'text-emerald-400' : futures.bias === 'Bearish' ? 'text-red-400' : 'text-slate-400'}`}>
                  {futures.bias}
                </span>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-[#121520] border border-[#1a1f2e] max-w-xs">
                <span className="text-slate-500 block">{futures.signal}</span>
                <span className="text-slate-300 leading-tight">{futures.narrative}</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-[10px]">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1.5">
            <span className="text-slate-500">Max Profit @ Expiry</span>
            <div className="text-emerald-400 font-bold">{summary.maxProfit > 1e6 ? 'Unlimited' : fmtINR(summary.maxProfit)}</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1.5">
            <span className="text-slate-500">Max Loss @ Expiry</span>
            <div className="text-red-400 font-bold">{summary.maxLoss < -1e6 ? 'Unlimited' : fmtINR(summary.maxLoss)}</div>
          </div>
          <div className="bg-[#121520] border border-[#1a1f2e] rounded-lg px-2 py-1.5 col-span-2">
            <span className="text-slate-500">Breakeven Prices</span>
            <div className="text-amber-400 font-bold truncate">
              {summary.breakevens.length ? summary.breakevens.map((b) => b.toLocaleString('en-IN')).join(' · ') : '—'}
            </div>
          </div>
          <div className="bg-[#121520] border border-[#1a1f2e] rounded-lg px-2 py-1.5">
            <span className="text-slate-500">Now (Today P&L)</span>
            <div className={`font-bold ${summary.currentTodayPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtINR(summary.currentTodayPnl)}
            </div>
          </div>
          <div className="bg-[#121520] border border-[#1a1f2e] rounded-lg px-2 py-1.5">
            <span className="text-slate-500">Now (Expiry P&L)</span>
            <div className={`font-bold ${summary.currentExpiryPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtINR(summary.currentExpiryPnl)}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable table — Sensibull bottom list style */}
      <div className="max-h-[340px] overflow-y-auto overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="sticky top-0 z-10 bg-[#0d111c]">
            <tr className="text-[9px] uppercase tracking-wider text-slate-500 border-b border-[#1a1f2e]">
              <th className="px-3 py-2.5 text-left font-bold w-8">#</th>
              <th className="px-3 py-2.5 text-left font-bold">Market Price</th>
              <th className="px-2 py-2.5 text-right font-bold">vs Spot %</th>
              <th className="px-3 py-2.5 text-right font-bold">P&L @ Expiry</th>
              <th className="px-3 py-2.5 text-center font-bold">Expiry</th>
              <th className="px-3 py-2.5 text-right font-bold">P&L Today</th>
              <th className="px-3 py-2.5 text-center font-bold">Today</th>
              <th className="px-3 py-2.5 text-left font-bold min-w-[200px]">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const rowBg = row.tag === 'spot'
                ? 'bg-[#d4af37]/15 border-l-[3px] border-l-[#d4af37]'
                : row.tag === 'futures'
                  ? 'bg-violet-500/12 border-l-[3px] border-l-violet-400'
                  : row.tag === 'maxpain'
                    ? 'bg-orange-500/10 border-l-[3px] border-l-orange-400'
                    : row.tag === 'breakeven'
                      ? 'bg-amber-500/8 border-l-[3px] border-l-amber-500/70'
                      : row.expiryPnl > 0
                        ? 'bg-emerald-500/[0.03]'
                        : row.expiryPnl < 0
                          ? 'bg-red-500/[0.03]'
                          : '';

              return (
                <tr
                  key={row.id}
                  ref={row.tag === 'spot' ? highlightRef : undefined}
                  className={`border-b border-[#1a1f2e]/50 hover:bg-[#121520]/80 ${rowBg}`}
                >
                  <td className="px-3 py-2 text-[10px] text-slate-600 tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white tabular-nums">
                        {row.marketPrice.toLocaleString('en-IN')}
                      </span>
                      {row.tagLabel && (
                        <span
                          className={`text-[8px] font-bold px-1 py-0.5 rounded uppercase ${
                            row.tag === 'spot'
                              ? 'bg-[#d4af37]/20 text-[#d4af37]'
                              : row.tag === 'futures'
                                ? 'bg-violet-500/20 text-violet-300'
                                : row.tag === 'maxpain'
                                  ? 'bg-orange-500/20 text-orange-300'
                                  : 'bg-slate-600/30 text-slate-400'
                          }`}
                        >
                          {row.tagLabel}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        row.pctFromSpot > 0 ? 'text-emerald-400' : row.pctFromSpot < 0 ? 'text-red-400' : 'text-slate-400'
                      }`}
                    >
                      {row.pctFromSpot > 0 ? '+' : ''}
                      {row.pctFromSpot.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        row.expiryPnl > 0 ? 'text-emerald-400' : row.expiryPnl < 0 ? 'text-red-400' : 'text-slate-400'
                      }`}
                    >
                      {fmtINR(row.expiryPnl)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <OutcomeBadge outcome={row.expiryOutcome} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        row.todayPnl > 0 ? 'text-emerald-400' : row.todayPnl < 0 ? 'text-red-400' : 'text-slate-400'
                      }`}
                    >
                      {fmtINR(row.todayPnl)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <OutcomeBadge outcome={row.todayOutcome} />
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-[10px] text-slate-400 leading-snug">{row.expiryMessage}</p>
                    <p className="text-[9px] text-slate-600 mt-0.5">{row.todayMessage}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-[#1a1f2e] flex flex-wrap gap-4 text-[9px] text-slate-500">
        <span><span className="inline-block w-2 h-2 rounded-full bg-[#d4af37] mr-1" />Live Spot</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-violet-400 mr-1" />Futures Prediction</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1" />Max Pain</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />Breakeven</span>
        <span className="text-slate-600">Expiry = intrinsic only · Today = Black-Scholes + live IV</span>
      </div>
    </div>
  );
}
