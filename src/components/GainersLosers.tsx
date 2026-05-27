import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, Crown } from 'lucide-react';
import { getGainers, getLosers, getMostActive, type StockData } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function GainersLosers() {
  const [gainers, setGainers] = useState<StockData[]>([]);
  const [losers, setLosers] = useState<StockData[]>([]);
  const [active, setActive] = useState<StockData[]>([]);
  const [tab, setTab] = useState<'gainers' | 'losers' | 'active'>('gainers');

  const update = () => {
    setGainers(getGainers(10));
    setLosers(getLosers(10));
    setActive(getMostActive(10));
  };

  useEffect(() => {
    update();
  }, []);

  useAutoRefresh(update);

  const data = tab === 'gainers' ? gainers : tab === 'losers' ? losers : active;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2">
          <Crown className="w-5 h-5" />
          Market Movers
        </h2>
        <p className="text-sm text-slate-500">Top gainers, losers & most active stocks</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#121520] rounded-lg border border-[#1a1f2e] overflow-hidden">
        {([
          { id: 'gainers' as const, label: 'Top Gainers', icon: TrendingUp, color: 'text-emerald-400' },
          { id: 'losers' as const, label: 'Top Losers', icon: TrendingDown, color: 'text-red-400' },
          { id: 'active' as const, label: 'Most Active', icon: Activity, color: 'text-[#d4af37]' },
        ]).map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-all ${
                tab === t.id ? `bg-[#d4af37]/10 text-[#d4af37]` : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${tab === t.id ? '' : t.color}`} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#080a12] text-slate-500 text-[10px] uppercase tracking-wider">
              <th className="py-2.5 px-4 text-left">#</th>
              <th className="py-2.5 px-4 text-left">Symbol</th>
              <th className="py-2.5 px-4 text-left">Name</th>
              <th className="py-2.5 px-4 text-right">Price</th>
              <th className="py-2.5 px-4 text-right">Change</th>
              <th className="py-2.5 px-4 text-right">% Change</th>
              <th className="py-2.5 px-4 text-right">Volume</th>
              <th className="py-2.5 px-4 text-right">High</th>
              <th className="py-2.5 px-4 text-right">Low</th>
            </tr>
          </thead>
          <tbody>
            {data.map((stock, idx) => (
              <motion.tr
                key={stock.symbol}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.03 }}
                className="border-b border-[#1a1f2e]/40 hover:bg-[#121520] transition-colors"
              >
                <td className="py-2 px-4 text-slate-600 font-bold">{idx + 1}</td>
                <td className="py-2 px-4">
                  <span className="text-sm font-bold text-slate-200">{stock.symbol}</span>
                </td>
                <td className="py-2 px-4 text-slate-400 text-xs">{stock.name}</td>
                <td className="py-2 px-4 text-right text-sm font-bold text-slate-200">₹{stock.price}</td>
                <td className={`py-2 px-4 text-right text-sm font-bold ${stock.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stock.change >= 0 ? '+' : ''}{stock.change}
                </td>
                <td className={`py-2 px-4 text-right text-sm font-bold ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                    stock.changePercent >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'
                  }`}>
                    {stock.changePercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent}%
                  </span>
                </td>
                <td className="py-2 px-4 text-right text-slate-400 text-xs">{(stock.volume / 1000000).toFixed(2)}M</td>
                <td className="py-2 px-4 text-right text-emerald-400 text-xs">{stock.high}</td>
                <td className="py-2 px-4 text-right text-red-400 text-xs">{stock.low}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
