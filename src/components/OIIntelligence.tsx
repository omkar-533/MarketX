import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Brain, Radar, Target, TrendingUp, Zap, Activity, PieChart as PieIcon } from 'lucide-react';
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  type FuturesOIData,
  type OIAlert,
  type OIIntelligenceData,
  type OIScannerRow,
} from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import {
  getLiveFuturesOIForSymbol,
  getLiveFuturesOIData,
  getLiveOIAlerts,
  getLiveOIIntelligence,
  getLiveOIIntradayScanner,
  getOiIntelFeedStatus,
  refreshOiIntelligenceLive,
} from '../services/oiIntelligenceLiveService';
import type { LiveSymbolQuote } from '../services/symbolLiveService';
import SymbolMarketPicker from './strategy/SymbolMarketPicker';
import OITradingSidebar from './oi/OITradingSidebar';

type OITab = 'overview' | 'writing' | 'scanner' | 'alerts';

interface OIIntelligenceProps {
  onNavigate?: (tab: string) => void;
}

const signalStyle: Record<string, string> = {
  'Long Buildup': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  'Short Buildup': 'text-red-400 bg-red-500/10 border-red-500/25',
  'Short Covering': 'text-blue-400 bg-blue-500/10 border-blue-500/25',
  'Long Unwinding': 'text-orange-400 bg-orange-500/10 border-orange-500/25',
  'Smart Money Activity': 'text-[#d4af37] bg-[#d4af37]/10 border-[#d4af37]/25',
  'Trap Formation': 'text-pink-400 bg-pink-500/10 border-pink-500/25',
  'OI Spike': 'text-purple-400 bg-purple-500/10 border-purple-500/25',
  'Volume + OI Confirmation': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
  Neutral: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
};

function formatL(value: number) {
  return `${(value / 100000).toFixed(2)}L`;
}

function formatK(value: number) {
  return `${(value / 1000).toFixed(0)}K`;
}

export default function OIIntelligence({ onNavigate }: OIIntelligenceProps) {
  const [symbol, setSymbol] = useState('NIFTY');
  const [tab, setTab] = useState<OITab>('overview');
  const [data, setData] = useState<OIIntelligenceData>(() => getLiveOIIntelligence('NIFTY'));
  const [futures, setFutures] = useState<FuturesOIData[]>(() => getLiveFuturesOIData());
  const [scanner, setScanner] = useState<OIScannerRow[]>(() => getLiveOIIntradayScanner());
  const [alerts, setAlerts] = useState<OIAlert[]>(() => getLiveOIAlerts());
  const [feedLabel, setFeedLabel] = useState(() => getOiIntelFeedStatus().message);
  const [feedMode, setFeedMode] = useState(() => getOiIntelFeedStatus().mode);

  const update = () => {
    void refreshOiIntelligenceLive().then(() => {
      setData(getLiveOIIntelligence(symbol));
      setFutures(getLiveFuturesOIData());
      setScanner(getLiveOIIntradayScanner());
      setAlerts(getLiveOIAlerts());
      const status = getOiIntelFeedStatus();
      setFeedLabel(status.message);
      setFeedMode(status.mode);
    });
  };

  useEffect(() => {
    update();
  }, [symbol]);

  useAutoRefresh(update);

  const selectedFuture = useMemo(
    () => futures.find((item) => item.symbol === symbol) ?? getLiveFuturesOIForSymbol(symbol),
    [futures, symbol],
  );

  const oiDistribution = useMemo(() => [
    { name: 'Call OI', value: data.totalCeOi, color: '#ef4444' },
    { name: 'Put OI', value: data.totalPeOi, color: '#10b981' },
  ], [data]);

  const writingChart = useMemo(() => {
    const strikes = Array.from(new Set([...data.callWriting, ...data.putWriting].map((item) => item.strike))).sort((a, b) => a - b);
    return strikes.map((strike) => ({
      strike,
      callWriting: Math.abs(data.callWriting.find((item) => item.strike === strike)?.change || 0) / 1000,
      putWriting: Math.abs(data.putWriting.find((item) => item.strike === strike)?.change || 0) / 1000,
    }));
  }, [data]);

  const smartMoneyScore = useMemo(() => {
    const pcrScore = Math.min(35, Math.abs(data.overallPcr - 1) * 55);
    const positioningScore = data.institutionalPositioning === 'Active' ? 35 : 12;
    const trapPenalty = data.oiTrapRisk > 60 ? -12 : 0;
    return Math.max(0, Math.min(100, Math.round(30 + pcrScore + positioningScore + trapPenalty)));
  }, [data]);

  const indexMatrix = useMemo(() => futures.map((row) => ({
    ...row,
    oiChangePct: (row.futuresOiChange / row.futuresOi) * 100,
  })), [futures]);

  const sidebar = (
    <OITradingSidebar
      data={data}
      future={selectedFuture}
      smartMoneyScore={smartMoneyScore}
      alerts={alerts}
      onOpenChain={onNavigate ? () => onNavigate('optionchain') : undefined}
      onOpenStrategy={onNavigate ? () => onNavigate('strategy') : undefined}
    />
  );

  return (
    <div className="flex flex-col xl:flex-row gap-6 animate-in fade-in duration-500">
      <div className="flex-1 min-w-0 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0b0e17] p-4 rounded-xl border border-[#1a1f2e]">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-[#d4af37]/10 rounded-lg border border-[#d4af37]/20">
              <Brain className="w-6 h-6 text-[#d4af37]" />
            </div>
            OI Intelligence
          </h2>
          <p className="text-sm text-slate-500 mt-1">Smart money tracking, buildup analysis, and institutional positioning</p>
          <p className="text-[10px] mt-1">
            <span
              className={`font-bold px-2 py-0.5 rounded border ${
                feedMode === 'live'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : feedMode === 'mixed'
                    ? 'border-gold/30 bg-gold/10 text-gold'
                    : 'border-slate-600 text-slate-500'
              }`}
            >
              {feedLabel}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SymbolMarketPicker
            selectedSymbol={symbol}
            onSelect={(quote: LiveSymbolQuote) => setSymbol(quote.symbol)}
          />
          <div className="flex bg-[#121520] rounded-lg border border-[#1a1f2e] p-1">
            {([
              ['overview', 'Overview'],
              ['writing', 'Writing Zones'],
              ['scanner', 'OI Scanner'],
              ['alerts', 'Alerts'],
            ] as [OITab, string][]).map(([id, label]) => (
              <button 
                key={id} 
                onClick={() => setTab(id)} 
                className={`px-4 py-2 rounded-md text-xs font-bold uppercase transition-all ${tab === id ? 'bg-[#d4af37] text-[#0b0e17]' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
        {[
          { label: 'Spot Price', value: data.spotPrice.toFixed(2), color: 'text-white' },
          { label: 'ATM Strike', value: data.atmStrike, color: 'text-blue-400' },
          { label: 'Overall PCR', value: data.overallPcr.toFixed(2), color: data.overallPcr >= 1 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'ATM PCR', value: data.atmPcr.toFixed(2), color: data.atmPcr >= 1 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Max Pain', value: data.maxPain, color: 'text-[#d4af37]' },
          { label: 'Strong Support', value: data.strongestSupport, color: 'text-emerald-400' },
          { label: 'Strong Resistance', value: data.strongestResistance, color: 'text-red-400' },
          { label: 'Market Bias', value: data.marketBias, color: data.marketBias.includes('Bullish') ? 'text-emerald-400' : data.marketBias.includes('Bearish') ? 'text-red-400' : 'text-slate-200' },
        ].map((card) => (
          <motion.div 
            key={card.label} 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 hover:border-[#d4af37]/30 transition-colors"
          >
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">{card.label}</div>
            <div className={`text-lg font-black ${card.color}`}>{card.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* OI Distribution Chart */}
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><PieIcon className="w-4 h-4 text-[#d4af37]" />OI Concentration</h3>
                <span className="text-[10px] text-slate-500 bg-[#121520] px-2 py-1 rounded">CE {formatL(data.totalCeOi)} / PE {formatL(data.totalPeOi)}</span>
              </div>
              <div className="relative h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={oiDistribution} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                      {oiDistribution.map((entry) => <Cell key={entry.name} fill={entry.color} stroke="none" />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: 8, color: '#fff' }} formatter={(value) => [formatL(value as number), 'Open Interest']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] text-slate-500 uppercase">Total OI</span>
                  <span className="text-xl font-black text-white">{formatL(data.totalCeOi + data.totalPeOi)}</span>
                </div>
              </div>
              <div className="flex justify-center gap-6 mt-4">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"></div><span className="text-xs text-slate-400">Call OI ({((data.totalCeOi / (data.totalCeOi + data.totalPeOi)) * 100).toFixed(1)}%)</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div><span className="text-xs text-slate-400">Put OI ({((data.totalPeOi / (data.totalCeOi + data.totalPeOi)) * 100).toFixed(1)}%)</span></div>
              </div>
            </motion.div>

            {/* Smart Money Score */}
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Radar className="w-4 h-4 text-[#d4af37]" />AI Smart Money Analysis</h3>
                <span className="text-[10px] text-[#d4af37] bg-[#d4af37]/10 px-2 py-1 rounded border border-[#d4af37]/20">AI-POWERED</span>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="relative w-40 h-40 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="80" cy="80" r="70" stroke="#1a1f2e" strokeWidth="12" fill="none" />
                    <circle cx="80" cy="80" r="70" stroke="#d4af37" strokeWidth="12" fill="none" strokeDasharray={`${smartMoneyScore * 4.4} 440`} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black text-white">{smartMoneyScore}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest">Score</span>
                  </div>
                </div>
                <div className="flex-1 space-y-4 w-full">
                  <div className="p-4 bg-[#121520] rounded-lg border border-[#1a1f2e]">
                    <div className="text-[10px] text-slate-500 uppercase mb-1 font-bold">AI Insight</div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Market PCR is <span className={`font-bold ${data.overallPcr >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>{data.overallPcr.toFixed(2)}</span> indicating a {data.overallPcr >= 1 ? 'Bullish' : 'Bearish'} bias. 
                      Max Pain at <span className="text-[#d4af37] font-bold">{data.maxPain}</span> suggests magnetic attraction. 
                      Institutional positioning is detected as <span className="text-blue-400 font-bold">{data.institutionalPositioning}</span>. 
                      {data.oiTrapRisk > 60 ? ' Warning: High probability of OI Trap formation.' : ' Trend appears sustainable.'}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e] text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Reversal Risk</div>
                      <div className="text-lg font-bold text-orange-400">{data.reversalProbability}%</div>
                    </div>
                    <div className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e] text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Fake BO</div>
                      <div className="text-lg font-bold text-red-400">{data.fakeBreakoutRisk}%</div>
                    </div>
                    <div className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e] text-center">
                      <div className="text-[10px] text-slate-500 uppercase">Trap Risk</div>
                      <div className="text-lg font-bold text-pink-400">{data.oiTrapRisk}%</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Index Futures OI Matrix */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[#1a1f2e] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Index Futures OI Matrix</h3>
              <span className="text-[10px] text-slate-500 flex items-center gap-1"><Activity className="w-3 h-3" /> Live Updates</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#121520] text-slate-500 text-[10px] uppercase tracking-wider">
                    <th className="py-3 px-4 text-left">Symbol</th>
                    <th className="py-3 px-4 text-right">Price Chg</th>
                    <th className="py-3 px-4 text-right">Fut OI</th>
                    <th className="py-3 px-4 text-right">OI Chg</th>
                    <th className="py-3 px-4 text-right">OI Chg %</th>
                    <th className="py-3 px-4 text-right">Premium</th>
                    <th className="py-3 px-4 text-center">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {indexMatrix.map((row) => (
                    <tr key={row.symbol} className="border-b border-[#1a1f2e]/40 hover:bg-[#121520]/50 transition-colors">
                      <td className="py-3 px-4 font-bold text-white">{row.symbol}</td>
                      <td className={`py-3 px-4 text-right font-bold ${row.priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{row.priceChange}%</td>
                      <td className="py-3 px-4 text-right text-slate-400">{(row.futuresOi / 1000000).toFixed(2)}M</td>
                      <td className={`py-3 px-4 text-right font-bold ${row.futuresOiChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatK(row.futuresOiChange)}</td>
                      <td className={`py-3 px-4 text-right font-bold ${row.oiChangePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{row.oiChangePct.toFixed(2)}%</td>
                      <td className={`py-3 px-4 text-right font-bold ${row.premiumDiscount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{row.premiumDiscount}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${signalStyle[row.signal] || signalStyle.Neutral}`}>
                          {row.signal}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      )}

      {tab === 'writing' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-6">
            <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#d4af37]" />Call Writing vs Put Writing</h3>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={writingChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" vertical={false} />
                <XAxis dataKey="strike" stroke="#475569" fontSize={10} tickLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: 8, color: '#fff' }} />
                <Legend />
                <Bar dataKey="callWriting" name="Call Writing" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="putWriting" name="Put Writing" fill="#10b981" radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { title: 'Call Writing', rows: data.callWriting, color: 'text-red-400', bg: 'bg-red-500/10' },
              { title: 'Put Writing', rows: data.putWriting, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { title: 'Call Unwinding', rows: data.callUnwinding, color: 'text-orange-400', bg: 'bg-orange-500/10' },
              { title: 'Put Unwinding', rows: data.putUnwinding, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            ].map((block) => (
              <motion.div key={block.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
                <h3 className={`text-xs font-bold mb-3 uppercase tracking-wider ${block.color}`}>{block.title}</h3>
                <div className="space-y-2">
                  {block.rows.slice(0, 4).map((row) => (
                    <div key={`${block.title}-${row.strike}`} className="flex items-center justify-between p-2 bg-[#121520] rounded-lg border border-[#1a1f2e]">
                      <span className="text-xs font-bold text-white">{row.strike}</span>
                      <span className="text-[10px] text-slate-500">OI: {formatK(row.oi)}</span>
                      <span className={`text-xs font-bold ${row.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{row.change >= 0 ? '+' : ''}{formatK(row.change)}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="xl:col-span-2 bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-6">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-[#d4af37]" />Support, Resistance and Expiry Zones</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.expiryZones.map((zone) => (
                <div key={zone.label} className="p-4 bg-[#121520] rounded-xl border border-[#1a1f2e] flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">{zone.label}</div>
                    <div className="text-2xl font-black text-white">{zone.strike}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500">Strength</div>
                    <div className="text-lg font-bold text-[#d4af37]">{zone.strength}%</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {tab === 'scanner' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#1a1f2e]">
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Zap className="w-4 h-4 text-[#d4af37]" />Intraday OI Scanner</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#121520] text-slate-500 text-[10px] uppercase tracking-wider">
                  <th className="py-3 px-4 text-left">Symbol</th>
                  <th className="py-3 px-4 text-right">Price</th>
                  <th className="py-3 px-4 text-right">Price Chg</th>
                  <th className="py-3 px-4 text-right">OI Chg</th>
                  <th className="py-3 px-4 text-right">Volume</th>
                  <th className="py-3 px-4 text-right">VWAP</th>
                  <th className="py-3 px-4 text-center">Signal</th>
                  <th className="py-3 px-4 text-right">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {scanner.map((row) => (
                  <tr key={row.symbol} className="border-b border-[#1a1f2e]/40 hover:bg-[#121520]/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{row.symbol}</div>
                      <div className="text-[10px] text-slate-500">{row.name}</div>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300 font-mono">{row.price}</td>
                    <td className={`py-3 px-4 text-right font-bold ${row.priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{row.priceChange}%</td>
                    <td className={`py-3 px-4 text-right font-bold ${row.oiChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatK(row.oiChange)}</td>
                    <td className="py-3 px-4 text-right text-slate-400 font-mono">{(row.volume / 1000000).toFixed(2)}M</td>
                    <td className="py-3 px-4 text-right text-slate-400 font-mono">{row.vwap}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${signalStyle[row.signal] || signalStyle.Neutral}`}>
                        {row.signal}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden">
                          <div className="h-full bg-[#d4af37] rounded-full" style={{ width: `${row.confidence}%` }} />
                        </div>
                        <span className="text-[#d4af37] font-bold text-xs">{row.confidence}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {tab === 'alerts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {alerts.map((alert, index) => (
            <motion.div 
              key={alert.id} 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className={`bg-[#0b0e17] border rounded-xl p-5 hover:translate-y-[-2px] transition-transform ${alert.severity === 'High' ? 'border-red-500/30 bg-red-500/5' : alert.severity === 'Medium' ? 'border-[#d4af37]/30 bg-[#d4af37]/5' : 'border-[#1a1f2e]'}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${alert.severity === 'High' ? 'text-red-400' : 'text-[#d4af37]'}`} />
                  <span className="text-[10px] text-slate-500 font-mono">{alert.time}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${alert.severity === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-[#d4af37]/10 text-[#d4af37] border-[#d4af37]/20'}`}>
                  {alert.severity}
                </span>
              </div>
              <div className="text-base font-bold text-white mb-1">{alert.symbol}</div>
              <div className="text-xs font-bold text-[#d4af37] mb-3">{alert.alertType}</div>
              <p className="text-xs text-slate-400 leading-relaxed">{alert.message}</p>
            </motion.div>
          ))}
        </div>
      )}
      </div>

      <div className="xl:w-[300px] shrink-0 hidden xl:block">{sidebar}</div>
      <div className="xl:hidden">{sidebar}</div>
    </div>
  );
}