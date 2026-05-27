import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Newspaper, Calendar, TrendingUp, Crown, Clock, BarChart3 } from 'lucide-react';
import { getNews, getEarnings, getIpos, getFiiDiiData, type NewsItem } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, Legend } from 'recharts';

export default function News() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [earnings] = useState(getEarnings());
  const [ipos] = useState(getIpos());
  const [fiiData] = useState(getFiiDiiData().slice(-14));
  const [tab, setTab] = useState<'news' | 'earnings' | 'ipo' | 'fiidii'>('news');

  const loadNews = () => setNews(getNews());

  useEffect(() => {
    loadNews();
  }, []);

  useAutoRefresh(loadNews);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2"><Crown className="w-5 h-5" />Market Intelligence</h2>
          <p className="text-sm text-slate-600">News, earnings, IPOs & FII/DII data</p>
        </div>
        <div className="flex bg-[#121520] rounded-lg border border-[#1a1f2e] overflow-hidden">
          {[{ id: 'news' as const, label: 'News', icon: Newspaper }, { id: 'earnings' as const, label: 'Earnings', icon: Calendar }, { id: 'ipo' as const, label: 'IPO', icon: TrendingUp }, { id: 'fiidii' as const, label: 'FII/DII', icon: BarChart3 }].map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all ${tab === t.id ? 'bg-[#d4af37]/10 text-[#d4af37]' : 'text-slate-500 hover:text-slate-300'}`}>
                <Icon className="w-3.5 h-3.5" />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'news' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {news.map((n, idx) => (
            <motion.div key={n.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
              className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 hover:border-[#d4af37]/20 transition-all cursor-pointer">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${n.impact === 'High' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : n.impact === 'Medium' ? 'bg-[#d4af37]/10 text-[#d4af37] border border-[#d4af37]/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>{n.impact} Impact</span>
                <span className="text-[9px] text-slate-600">{n.source}</span>
                <span className="text-[9px] text-slate-700 flex items-center gap-1"><Clock className="w-3 h-3" />{n.time}</span>
              </div>
              <div className="text-sm font-bold text-slate-200 leading-snug">{n.title}</div>
              <div className="text-[10px] text-slate-600 mt-1">{n.category}</div>
            </motion.div>
          ))}
        </div>
      )}

      {tab === 'earnings' && (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#080a12] text-slate-600 text-[10px] uppercase tracking-wider">
                <th className="py-3 px-4 text-left">Symbol</th>
                <th className="py-3 px-4 text-left">Company</th>
                <th className="py-3 px-4 text-left">Date</th>
                <th className="py-3 px-4 text-left">Time</th>
                <th className="py-3 px-4 text-right">Expected EPS</th>
                <th className="py-3 px-4 text-right">Previous EPS</th>
                <th className="py-3 px-4 text-right">Growth</th>
              </tr>
            </thead>
            <tbody>
              {earnings.map((e, idx) => {
                const growth = ((e.expectedEPS - e.prevEPS) / e.prevEPS) * 100;
                return (
                  <motion.tr key={e.symbol} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                    className="border-b border-[#1a1f2e]/40 hover:bg-[#121520] transition-colors">
                    <td className="py-2.5 px-4 font-bold text-slate-200">{e.symbol}</td>
                    <td className="py-2.5 px-4 text-slate-400">{e.name}</td>
                    <td className="py-2.5 px-4 text-[#d4af37] font-medium">{e.date}</td>
                    <td className="py-2.5 px-4 text-slate-500">{e.time}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-200">{e.expectedEPS}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">{e.prevEPS}</td>
                    <td className={`py-2.5 px-4 text-right font-bold ${growth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{growth >= 0 ? '+' : ''}{growth.toFixed(1)}%</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ipo' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ipos.map((ipo, idx) => (
            <motion.div key={ipo.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
              className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-slate-200">{ipo.name}</div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ipo.status === 'Open' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-[#d4af37]/10 text-[#d4af37] border border-[#d4af37]/20'}`}>{ipo.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2 bg-[#121520] rounded-lg"><div className="text-[10px] text-slate-600">Price Range</div><div className="font-bold text-[#d4af37]">₹{ipo.priceRange}</div></div>
                <div className="p-2 bg-[#121520] rounded-lg"><div className="text-[10px] text-slate-600">Lot Size</div><div className="font-bold text-slate-200">{ipo.lotSize}</div></div>
                <div className="p-2 bg-[#121520] rounded-lg"><div className="text-[10px] text-slate-600">Open</div><div className="font-bold text-slate-200">{ipo.openDate}</div></div>
                <div className="p-2 bg-[#121520] rounded-lg"><div className="text-[10px] text-slate-600">Close</div><div className="font-bold text-slate-200">{ipo.closeDate}</div></div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {tab === 'fiidii' && (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
          <h3 className="text-sm font-bold text-[#d4af37] mb-4">FII/DII Cash Flow (₹ Cr)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={fiiData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
              <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} angle={-30} textAnchor="end" height={50} />
              <YAxis stroke="#475569" fontSize={10} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }} formatter={(value) => [`₹${(value as number).toFixed(0)}Cr`, '']} />
              <Legend />
              <Bar dataKey="fiiCash" name="FII Cash" fill="#d4af37" opacity={0.7} radius={[2, 2, 0, 0]} />
              <Bar dataKey="diiCash" name="DII Cash" fill="#10b981" opacity={0.7} radius={[2, 2, 0, 0]} />
              <Line type="monotone" dataKey="fiiFutures" name="FII Futures" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
