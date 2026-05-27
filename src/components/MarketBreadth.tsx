import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Activity, BarChart3, Crown } from 'lucide-react';
import { 
  PieChart as RePieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { getMarketBreadth, getStocks } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function MarketBreadth() {
  const [breadth, setBreadth] = useState(getMarketBreadth());
  const [stocks, setStocks] = useState(getStocks());

  const load = () => {
    setBreadth(getMarketBreadth());
    setStocks(getStocks());
  };

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(load);

  const total = breadth.advances + breadth.declines + breadth.unchanged;
  
  const pieData = [
    { name: 'Advances', value: breadth.advances, color: '#10b981' },
    { name: 'Declines', value: breadth.declines, color: '#ef4444' },
    { name: 'Unchanged', value: breadth.unchanged, color: '#475569' },
  ];

  const sectorData = [
    { sector: 'Banking', advances: 8, declines: 4 },
    { sector: 'IT', advances: 6, declines: 3 },
    { sector: 'Auto', advances: 5, declines: 2 },
    { sector: 'Pharma', advances: 4, declines: 3 },
    { sector: 'FMCG', advances: 7, declines: 2 },
    { sector: 'Energy', advances: 3, declines: 4 },
    { sector: 'Infra', advances: 5, declines: 3 },
    { sector: 'Metal', advances: 3, declines: 5 },
  ];

  const gainers = [...stocks].sort((a, b) => b.changePercent - a.changePercent).slice(0, 10);
  const losers = [...stocks].sort((a, b) => a.changePercent - b.changePercent).slice(0, 10);

  return (
    <div className="p-4 max-w-[1600px] mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gold flex items-center gap-2">
          <Crown className="w-5 h-5" />
          Market Breadth
        </h2>
        <p className="text-sm text-slate-500">Overall market health & sector analysis</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-500 font-medium">Advances</span>
          </div>
          <div className="text-3xl font-bold text-emerald-400">{breadth.advances}</div>
          <div className="text-xs text-slate-500 mt-1">{((breadth.advances / total) * 100).toFixed(1)}% of total</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span className="text-xs text-slate-500 font-medium">Declines</span>
          </div>
          <div className="text-3xl font-bold text-red-400">{breadth.declines}</div>
          <div className="text-xs text-slate-500 mt-1">{((breadth.declines / total) * 100).toFixed(1)}% of total</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-2">
            <Minus className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">Unchanged</span>
          </div>
          <div className="text-3xl font-bold text-slate-400">{breadth.unchanged}</div>
          <div className="text-xs text-slate-500 mt-1">{((breadth.unchanged / total) * 100).toFixed(1)}% of total</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-gold" />
            <span className="text-xs text-slate-500 font-medium">A/D Ratio</span>
          </div>
          <div className={`text-3xl font-bold ${breadth.advanceDeclineRatio > 1 ? 'text-emerald-400' : 'text-red-400'}`}>
            {breadth.advanceDeclineRatio.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {breadth.advanceDeclineRatio > 1 ? 'Bullish breadth' : 'Bearish breadth'}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie Chart */}
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gold mb-4">Market Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RePieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              />
              <Legend />
            </RePieChart>
          </ResponsiveContainer>
        </div>

        {/* Sector Performance */}
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gold mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Sector-wise Advances/Declines
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sectorData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" stroke="#475569" fontSize={11} tickLine={false} />
              <YAxis dataKey="sector" type="category" stroke="#475569" fontSize={11} tickLine={false} width={70} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              />
              <Legend />
              <Bar dataKey="advances" name="Advances" fill="#10b981" radius={[0, 4, 4, 0]} />
              <Bar dataKey="declines" name="Declines" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DMA Stats */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gold mb-4">Moving Average Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Above 20 DMA', value: breadth.above20DMA, color: 'bg-emerald-500' },
            { label: 'Above 50 DMA', value: breadth.above50DMA, color: 'bg-blue-500' },
            { label: 'Above 200 DMA', value: breadth.above200DMA, color: 'bg-gold' },
          ].map(item => (
            <div key={item.label} className="bg-[#0d1220] rounded-lg p-4 border border-[#1e293b]/50">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-slate-300 font-medium">{item.label}</span>
                <span className="text-lg font-bold text-gold">{item.value}%</span>
              </div>
              <div className="h-3 bg-[#1e293b] rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${item.value}%` }}
                  transition={{ duration: 1 }}
                  className={`${item.color} h-full rounded-full`}
                />
              </div>
              <div className="text-xs text-slate-500 mt-2">
                {item.value > 60 ? 'Strong trend' : item.value > 40 ? 'Mixed' : 'Weak trend'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Gainers & Losers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Top 10 Gainers
          </h3>
          <div className="space-y-1.5">
            {gainers.map((stock, i) => (
              <div key={stock.symbol} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#1e293b]/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gold-dark w-4 font-bold">{i + 1}</span>
                  <span className="text-sm font-bold text-slate-200">{stock.symbol}</span>
                  <span className="text-[10px] text-slate-500">{stock.sector}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-200 font-bold">₹{stock.price}</div>
                  <div className="text-xs text-emerald-400 font-semibold">+{stock.changePercent}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gold mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4" />
            Top 10 Losers
          </h3>
          <div className="space-y-1.5">
            {losers.map((stock, i) => (
              <div key={stock.symbol} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[#1e293b]/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gold-dark w-4 font-bold">{i + 1}</span>
                  <span className="text-sm font-bold text-slate-200">{stock.symbol}</span>
                  <span className="text-[10px] text-slate-500">{stock.sector}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-200 font-bold">₹{stock.price}</div>
                  <div className="text-xs text-red-400 font-semibold">{stock.changePercent}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
