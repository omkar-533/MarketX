import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Crown } from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { getPortfolio, type PortfolioItem } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function Portfolio() {
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);

  const load = () => setPortfolio(getPortfolio());

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(load);

  const totalInvested = portfolio.reduce((s, p) => s + p.invested, 0);
  const totalCurrent = portfolio.reduce((s, p) => s + p.current, 0);
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPercent = (totalPnl / totalInvested) * 100;

  const sectorData = portfolio.map(p => ({ name: p.symbol, value: p.current, pnl: p.pnl }));
  const pieData = portfolio.map(p => ({ name: p.symbol, value: p.current }));
  const COLORS = ['#d4af37', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2"><Crown className="w-5 h-5" />Portfolio</h2>
        <p className="text-sm text-slate-600">Track your holdings, P&L and analytics</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
          <div className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Total Invested</div>
          <div className="text-xl font-bold text-slate-200">₹{(totalInvested / 100000).toFixed(2)}L</div>
        </div>
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
          <div className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Current Value</div>
          <div className="text-xl font-bold text-[#d4af37]">₹{(totalCurrent / 100000).toFixed(2)}L</div>
        </div>
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
          <div className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Total P&L</div>
          <div className={`text-xl font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totalPnl >= 0 ? '+' : ''}₹{(totalPnl / 1000).toFixed(1)}K</div>
        </div>
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
          <div className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">P&L %</div>
          <div className={`text-xl font-bold ${totalPnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Holdings Table */}
        <div className="lg:col-span-2 bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#080a12] text-slate-600 text-[10px] uppercase tracking-wider">
                <th className="py-3 px-4 text-left">Symbol</th>
                <th className="py-3 px-4 text-right">Qty</th>
                <th className="py-3 px-4 text-right">Avg</th>
                <th className="py-3 px-4 text-right">LTP</th>
                <th className="py-3 px-4 text-right">Invested</th>
                <th className="py-3 px-4 text-right">Current</th>
                <th className="py-3 px-4 text-right">P&L</th>
                <th className="py-3 px-4 text-right">P&L %</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map((p, idx) => (
                <motion.tr key={p.symbol} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                  className="border-b border-[#1a1f2e]/40 hover:bg-[#121520] transition-colors">
                  <td className="py-2.5 px-4"><div className="text-sm font-bold text-slate-200">{p.symbol}</div><div className="text-[10px] text-slate-600">{p.name}</div></td>
                  <td className="py-2.5 px-4 text-right text-slate-300">{p.qty}</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">{p.avgPrice}</td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-200">{p.ltp}</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">₹{(p.invested / 1000).toFixed(1)}K</td>
                  <td className="py-2.5 px-4 text-right font-bold text-[#d4af37]">₹{(p.current / 1000).toFixed(1)}K</td>
                  <td className={`py-2.5 px-4 text-right font-bold ${p.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.pnl >= 0 ? '+' : ''}₹{(p.pnl / 1000).toFixed(1)}K</td>
                  <td className={`py-2.5 px-4 text-right font-bold ${p.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.pnlPercent >= 0 ? '+' : ''}{p.pnlPercent.toFixed(2)}%</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Charts */}
        <div className="space-y-4">
          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
            <h3 className="text-xs font-bold text-[#d4af37] mb-3 flex items-center gap-1.5"><PieChart className="w-3.5 h-3.5" />Allocation</h3>
            <ResponsiveContainer width="100%" height={200}>
              <RePieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }} />
              </RePieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
            <h3 className="text-xs font-bold text-[#d4af37] mb-3">P&L by Stock</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={sectorData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="pnl" fill="#d4af37" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
