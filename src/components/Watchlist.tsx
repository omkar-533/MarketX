import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Plus, X, GripVertical, Crown } from 'lucide-react';
import { getWatchlist, type WatchlistItem } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [newSymbol, setNewSymbol] = useState('');

  const load = () => setItems(getWatchlist());

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(load);

  const removeItem = (symbol: string) => setItems(items.filter(i => i.symbol !== symbol));
  const addItem = () => { if (newSymbol) { setNewSymbol(''); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2"><Crown className="w-5 h-5" />Watchlist</h2>
          <p className="text-sm text-slate-600">Track your favorite stocks in real-time</p>
        </div>
        <div className="flex gap-2">
          <input type="text" placeholder="Add symbol..." value={newSymbol} onChange={e => setNewSymbol(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()}
            className="bg-[#121520] border border-[#1a1f2e] text-slate-200 text-sm rounded-lg px-3 py-2 w-40 focus:outline-none focus:border-[#d4af37]" />
          <button onClick={addItem} className="px-3 py-2 bg-[#d4af37]/10 text-[#d4af37] rounded-lg border border-[#d4af37]/30 hover:bg-[#d4af37]/20 transition-colors"><Plus className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#080a12] text-slate-600 text-[10px] uppercase tracking-wider">
              <th className="py-3 px-4"></th>
              <th className="py-3 px-4 text-left">Symbol</th>
              <th className="py-3 px-4 text-right">Price</th>
              <th className="py-3 px-4 text-right">Change</th>
              <th className="py-3 px-4 text-right">% Change</th>
              <th className="py-3 px-4 text-center">Mini Chart</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <motion.tr key={item.symbol} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                className="border-b border-[#1a1f2e]/40 hover:bg-[#121520] transition-colors">
                <td className="py-2.5 px-4"><GripVertical className="w-4 h-4 text-slate-700 cursor-grab" /></td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2">
                    <Bookmark className="w-3.5 h-3.5 text-[#d4af37]" />
                    <div><div className="text-sm font-bold text-slate-200">{item.symbol}</div><div className="text-[10px] text-slate-600">{item.name}</div></div>
                  </div>
                </td>
                <td className="py-2.5 px-4 text-right font-bold text-slate-200">₹{item.price}</td>
                <td className={`py-2.5 px-4 text-right font-medium ${item.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{item.change >= 0 ? '+' : ''}{item.change}</td>
                <td className={`py-2.5 px-4 text-right font-bold ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{item.changePercent >= 0 ? '+' : ''}{item.changePercent}%</td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center justify-center gap-0.5 h-8">
                    {item.chart.map((v, i) => (
                      <div key={i} className="w-1 rounded-full" style={{ height: `${((v - Math.min(...item.chart)) / (Math.max(...item.chart) - Math.min(...item.chart))) * 100}%`, backgroundColor: item.changePercent >= 0 ? '#10b981' : '#ef4444', opacity: 0.6 + (i / item.chart.length) * 0.4 }} />
                    ))}
                  </div>
                </td>
                <td className="py-2.5 px-4"><button onClick={() => removeItem(item.symbol)} className="p-1 text-slate-700 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button></td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
