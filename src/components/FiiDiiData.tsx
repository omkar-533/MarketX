import { useState, useEffect } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { motion } from 'framer-motion';
import { BarChart3, Activity, Crown } from 'lucide-react';
import { 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ComposedChart,
  Line,
  Legend
} from 'recharts';
import { getFiiDiiData } from '../data/marketData';

export default function FiiDiiData() {
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [data, setData] = useState(getFiiDiiData(30));
  const load = () => setData(getFiiDiiData(30));
  useEffect(() => load(), []);
  useAutoRefresh(load);

  const totals = data.reduce((acc, d) => ({
    fiiCashNet: acc.fiiCashNet + d.fiiCashNet,
    fiiFuturesNet: acc.fiiFuturesNet + d.fiiFuturesNet,
    fiiOptionsNet: acc.fiiOptionsNet + d.fiiOptionsNet,
    diiCashNet: acc.diiCashNet + d.diiCashNet,
  }), { fiiCashNet: 0, fiiFuturesNet: 0, fiiOptionsNet: 0, diiCashNet: 0 });

  const recentData = data.slice(-5);

  return (
    <div className="p-4 max-w-[1600px] mx-auto space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gold flex items-center gap-2">
            <Crown className="w-5 h-5" />
            FII / DII Activity
          </h2>
          <p className="text-sm text-slate-500">Institutional investor flow analysis</p>
        </div>
        
        <div className="flex bg-[#111827] rounded-lg border border-[#334155] overflow-hidden">
          {(['daily', 'weekly', 'monthly'] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-4 py-2 text-sm capitalize transition-all ${
                timeframe === tf ? 'bg-gold-15 text-gold' : 'text-slate-400 hover:text-gold-light'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">FII Cash Net (30D)</div>
          <div className={`text-2xl font-bold ${totals.fiiCashNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totals.fiiCashNet >= 0 ? '+' : ''}₹{(totals.fiiCashNet / 100).toFixed(0)}Cr
          </div>
          <div className="text-xs text-slate-500 mt-1">Foreign Institutional Investors</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">FII Futures Net (30D)</div>
          <div className={`text-2xl font-bold ${totals.fiiFuturesNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totals.fiiFuturesNet >= 0 ? '+' : ''}₹{(totals.fiiFuturesNet / 100).toFixed(0)}Cr
          </div>
          <div className="text-xs text-slate-500 mt-1">Index & Stock Futures</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">FII Options Net (30D)</div>
          <div className={`text-2xl font-bold ${totals.fiiOptionsNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totals.fiiOptionsNet >= 0 ? '+' : ''}₹{(totals.fiiOptionsNet / 100).toFixed(0)}Cr
          </div>
          <div className="text-xs text-slate-500 mt-1">Index & Stock Options</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">DII Cash Net (30D)</div>
          <div className={`text-2xl font-bold ${totals.diiCashNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totals.diiCashNet >= 0 ? '+' : ''}₹{(totals.diiCashNet / 100).toFixed(0)}Cr
          </div>
          <div className="text-xs text-slate-500 mt-1">Domestic Institutional Investors</div>
        </motion.div>
      </div>

      {/* FII Cash Chart */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gold mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          FII Cash Market Activity (₹ Cr)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} angle={-45} textAnchor="end" height={60} />
            <YAxis stroke="#475569" fontSize={11} tickLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value) => [`₹${((value as number) / 100).toFixed(0)}Cr`, '']}
            />
            <Legend />
            <Bar dataKey="fiiCashBuy" name="FII Buy" fill="#10b981" opacity={0.7} />
            <Bar dataKey="fiiCashSell" name="FII Sell" fill="#ef4444" opacity={0.7} />
            <Line type="monotone" dataKey="fiiCashNet" name="FII Net" stroke="#d4af37" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* FII Derivatives Chart */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gold mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          FII Derivatives Net Position (₹ Cr)
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} angle={-45} textAnchor="end" height={60} />
            <YAxis stroke="#475569" fontSize={11} tickLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value) => [`₹${((value as number) / 100).toFixed(0)}Cr`, '']}
            />
            <Legend />
            <Bar dataKey="fiiFuturesNet" name="Futures Net" fill="#8b5cf6" opacity={0.6} />
            <Bar dataKey="fiiOptionsNet" name="Options Net" fill="#f59e0b" opacity={0.6} />
            <Line type="monotone" dataKey="diiCashNet" name="DII Cash Net" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Data Table */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[#1e293b]/50">
          <h3 className="text-sm font-bold text-gold">Recent Activity (Last 5 Sessions)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0d1220] text-slate-500 text-xs uppercase">
                <th className="py-3 px-4 text-left font-bold">Date</th>
                <th className="py-3 px-4 text-right font-bold">FII Cash Buy</th>
                <th className="py-3 px-4 text-right font-bold">FII Cash Sell</th>
                <th className="py-3 px-4 text-right font-bold">FII Cash Net</th>
                <th className="py-3 px-4 text-right font-bold">FII Fut Net</th>
                <th className="py-3 px-4 text-right font-bold">FII Opt Net</th>
                <th className="py-3 px-4 text-right font-bold">DII Cash Net</th>
              </tr>
            </thead>
            <tbody>
              {recentData.map((d, idx) => (
                <motion.tr 
                  key={d.date}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className="border-b border-[#1e293b]/50 hover:bg-[#1e293b]/30"
                >
                  <td className="py-2.5 px-4 text-slate-200 font-medium">{d.date}</td>
                  <td className="py-2.5 px-4 text-right text-emerald-400 font-medium">₹{(d.fiiCashBuy / 100).toFixed(0)}Cr</td>
                  <td className="py-2.5 px-4 text-right text-red-400 font-medium">₹{(d.fiiCashSell / 100).toFixed(0)}Cr</td>
                  <td className={`py-2.5 px-4 text-right font-bold ${d.fiiCashNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {d.fiiCashNet >= 0 ? '+' : ''}₹{(d.fiiCashNet / 100).toFixed(0)}Cr
                  </td>
                  <td className={`py-2.5 px-4 text-right font-medium ${d.fiiFuturesNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {d.fiiFuturesNet >= 0 ? '+' : ''}₹{(d.fiiFuturesNet / 100).toFixed(0)}Cr
                  </td>
                  <td className={`py-2.5 px-4 text-right font-medium ${d.fiiOptionsNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {d.fiiOptionsNet >= 0 ? '+' : ''}₹{(d.fiiOptionsNet / 100).toFixed(0)}Cr
                  </td>
                  <td className={`py-2.5 px-4 text-right font-medium ${d.diiCashNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {d.diiCashNet >= 0 ? '+' : ''}₹{(d.diiCashNet / 100).toFixed(0)}Cr
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
