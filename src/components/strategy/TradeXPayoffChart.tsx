import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildTradeXChartData,
  getVolatilityBands,
  type SimLeg,
} from '../../services/optionSimulatorEngine';

function fmtINR(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
}

function fmtK(v: number) {
  if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
}

interface TradeXPayoffChartProps {
  legs: SimLeg[];
  spot: number;
  interval: number;
  contractSize: number;
  daysToExpiry: number;
  iv: number;
  breakevens?: number[];
  height?: number;
  compact?: boolean;
}

export default function TradeXPayoffChart({
  legs,
  spot,
  interval,
  contractSize,
  daysToExpiry,
  iv,
  breakevens = [],
  height = 380,
  compact = false,
}: TradeXPayoffChartProps) {
  const chartData = useMemo(
    () => (legs.length ? buildTradeXChartData(legs, spot, interval, daysToExpiry, iv, contractSize, compact ? 41 : 61) : []),
    [legs, spot, interval, daysToExpiry, iv, contractSize, compact],
  );

  const bands = useMemo(() => getVolatilityBands(spot, iv, daysToExpiry), [spot, iv, daysToExpiry]);

  const yDomain = useMemo(() => {
    if (!chartData.length) return [-5000, 5000];
    const vals = chartData.flatMap((d) => [d.expiry, d.t0, d.profit, d.loss]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max(500, (max - min) * 0.12);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [chartData]);

  if (!legs.length) {
    return (
      <div className="flex items-center justify-center text-slate-500 text-sm" style={{ height }}>
        Add strategy legs to view payoff chart
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 8, bottom: compact ? 4 : 8 }}>
          <defs>
            <linearGradient id="tradexProfitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ade80" stopOpacity={0.65} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.2} />
            </linearGradient>
            <linearGradient id="tradexLossFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fdba74" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0.65} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

          {/* SD bands — TradeX style grey zones */}
          <ReferenceArea x1={bands.sd2Low} x2={bands.sd1Low} fill="#475569" fillOpacity={0.12} />
          <ReferenceArea x1={bands.sd1Low} x2={bands.sd1High} fill="#64748b" fillOpacity={0.08} />
          <ReferenceArea x1={bands.sd1High} x2={bands.sd2High} fill="#475569" fillOpacity={0.12} />

          <XAxis
            dataKey="spot"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: compact ? 9 : 10, fill: '#94a3b8' }}
            tickFormatter={(v) => (compact ? fmtK(v) : v.toLocaleString('en-IN'))}
            label={
              compact
                ? undefined
                : { value: 'Underlying Price', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 11 }
            }
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: compact ? 9 : 10, fill: '#94a3b8' }}
            tickFormatter={fmtK}
            label={
              compact
                ? undefined
                : { value: 'Profit / Loss', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }
            }
          />

          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(l) => `Spot: ${Number(l).toLocaleString('en-IN')}`}
            formatter={(value, name) => {
              const n = typeof value === 'number' ? value : Number(value);
              const labels: Record<string, string> = {
                expiry: 'At Expiry',
                t0: 'T+0 (Today)',
                profit: 'Profit zone',
                loss: 'Loss zone',
              };
              return [fmtINR(Number.isFinite(n) ? n : 0), labels[String(name)] ?? String(name)];
            }}
          />

          <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />

          {/* Spot price */}
          <ReferenceLine
            x={spot}
            stroke="#1e293b"
            strokeWidth={2}
            strokeDasharray="4 4"
            label={
              compact
                ? undefined
                : { value: `Spot ${spot.toLocaleString('en-IN')}`, fill: '#cbd5e1', fontSize: 10, position: 'top' }
            }
          />

          {breakevens.map((be) => (
            <ReferenceLine key={be} x={be} stroke="#60a5fa" strokeDasharray="3 3" strokeWidth={1} />
          ))}

          {/* Green profit area (above zero) */}
          <Area
            type="monotone"
            dataKey="profit"
            stroke="none"
            fill="url(#tradexProfitFill)"
            fillOpacity={1}
            baseLine={0}
            isAnimationActive={false}
          />

          {/* Orange loss area (below zero) */}
          <Area
            type="monotone"
            dataKey="loss"
            stroke="none"
            fill="url(#tradexLossFill)"
            fillOpacity={1}
            baseLine={0}
            isAnimationActive={false}
          />

          {/* T+0 dashed purple */}
          <Line
            type="monotone"
            dataKey="t0"
            stroke="#a855f7"
            strokeWidth={compact ? 1.5 : 2}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
            name="t0"
          />

          {/* Expiry solid blue */}
          <Line
            type="monotone"
            dataKey="expiry"
            stroke="#2563eb"
            strokeWidth={compact ? 2 : 2.5}
            dot={false}
            isAnimationActive={false}
            name="expiry"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {!compact && (
        <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#2563eb] rounded" /> At Expiry
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-[#a855f7] rounded border-dashed" style={{ borderTop: '2px dashed #a855f7', height: 0 }} /> T+0
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500/50" /> Profit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-orange-500/50" /> Loss
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="w-3 h-3 bg-slate-600/30 rounded-sm" /> ±1σ / ±2σ
          </span>
        </div>
      )}
    </div>
  );
}
