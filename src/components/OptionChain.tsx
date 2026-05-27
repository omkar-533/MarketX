import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, ArrowUpDown, Crown } from 'lucide-react';
import { getOptionChain, getIndices, EXPIRY_DATES, calculateMaxPain, getBuildupData, getIvPercentile, getVolatilitySkew, type OptionData } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts';

export default function OptionChain() {
  const [symbol, setSymbol] = useState('NIFTY');
  const [expiry, setExpiry] = useState(EXPIRY_DATES[0]);
  const [strikes, setStrikes] = useState<OptionData[]>([]);
  const [spotPrice, setSpotPrice] = useState(24580);
  const [searchStrike, setSearchStrike] = useState('');
  const [sortBy, setSortBy] = useState<'strike' | 'ceOi' | 'peOi' | 'pcr'>('strike');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showGreeks, setShowGreeks] = useState(false);
  const [activeTab, setActiveTab] = useState<'chain' | 'analytics' | 'buildup' | 'iv'>('chain');
  const [maxPainData, setMaxPainData] = useState(calculateMaxPain(getOptionChain()));
  const [buildup, setBuildup] = useState(getBuildupData());
  const [ivData] = useState(getIvPercentile());
  const [skewData] = useState(getVolatilitySkew());

  const refreshChain = () => {
    const indices = getIndices();
    const currentSpot = indices.find((i) => i.symbol === symbol)?.price || 24580;
    setSpotPrice(currentSpot);
    const chain = getOptionChain(symbol, currentSpot);
    setStrikes(chain);
    setMaxPainData(calculateMaxPain(chain));
    setBuildup(getBuildupData());
  };

  useEffect(() => {
    refreshChain();
  }, [symbol]);

  useAutoRefresh(refreshChain);

  const atmStrike = useMemo(() => { const interval = symbol === 'NIFTY' ? 50 : symbol === 'BANKNIFTY' ? 100 : 50; return Math.round(spotPrice / interval) * interval; }, [spotPrice, symbol]);
  const totals = useMemo(() => strikes.reduce((acc, s) => ({ ceOi: acc.ceOi + s.ceOi, peOi: acc.peOi + s.peOi, ceVolume: acc.ceVolume + s.ceVolume, peVolume: acc.peVolume + s.peVolume }), { ceOi: 0, peOi: 0, ceVolume: 0, peVolume: 0 }), [strikes]);
  const totalPCR = totals.peOi / (totals.ceOi || 1);

  const filteredStrikes = useMemo(() => {
    let result = [...strikes];
    if (searchStrike) result = result.filter(s => s.strike.toString().includes(searchStrike));
    result.sort((a, b) => { const aVal = a[sortBy]; const bVal = b[sortBy]; return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1); });
    return result;
  }, [strikes, searchStrike, sortBy, sortOrder]);

  const handleSort = (field: typeof sortBy) => { if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); else { setSortBy(field); setSortOrder('asc'); } };

  const getBuildupColor = (signal: string) => {
    if (signal.includes('Long Buildup')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (signal.includes('Short Covering')) return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    if (signal.includes('Short Buildup')) return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (signal.includes('Long Unwinding')) return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2"><Crown className="w-5 h-5" />Option Chain & Analytics</h2>
          <p className="text-sm text-slate-600">Live OI, Volume, Greeks & Advanced Analytics</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={symbol} onChange={e => setSymbol(e.target.value)} className="bg-[#121520] border border-[#1a1f2e] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#d4af37]">
            <option value="NIFTY">NIFTY 50</option><option value="BANKNIFTY">BANK NIFTY</option><option value="FINNIFTY">FIN NIFTY</option>
          </select>
          <select value={expiry} onChange={e => setExpiry(e.target.value)} className="bg-[#121520] border border-[#1a1f2e] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#d4af37]">
            {EXPIRY_DATES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-700" />
            <input type="text" placeholder="Strike..." value={searchStrike} onChange={e => setSearchStrike(e.target.value)} className="bg-[#121520] border border-[#1a1f2e] text-slate-200 text-sm rounded-lg pl-9 pr-3 py-2 w-24 focus:outline-none focus:border-[#d4af37]" />
          </div>
          <button onClick={() => setShowGreeks(!showGreeks)} className={`px-3 py-2 text-sm rounded-lg border transition-all ${showGreeks ? 'bg-[#d4af37]/10 text-[#d4af37] border-[#d4af37]/30' : 'bg-[#121520] text-slate-500 border-[#1a1f2e]'}`}>Greeks</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#121520] rounded-lg border border-[#1a1f2e] overflow-hidden">
        {[{ id: 'chain' as const, label: 'Option Chain' }, { id: 'analytics' as const, label: 'Analytics' }, { id: 'buildup' as const, label: 'OI Buildup' }, { id: 'iv' as const, label: 'IV Analysis' }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-4 py-2 text-sm font-medium transition-all ${activeTab === t.id ? 'bg-[#d4af37]/10 text-[#d4af37]' : 'text-slate-500 hover:text-slate-300'}`}>{t.label}</button>
        ))}
      </div>

      {/* Stats Bar */}
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 flex flex-wrap items-center gap-5">
        {[{ label: 'Spot', value: spotPrice.toLocaleString(), color: 'text-[#d4af37]' }, { label: 'ATM', value: atmStrike.toString(), color: 'text-[#d4af37]' }, { label: 'CE OI', value: `${(totals.ceOi / 100000).toFixed(2)}L`, color: 'text-red-400' }, { label: 'PE OI', value: `${(totals.peOi / 100000).toFixed(2)}L`, color: 'text-emerald-400' }, { label: 'PCR', value: totalPCR.toFixed(2), color: totalPCR > 1 ? 'text-emerald-400' : 'text-red-400' }, { label: 'Max Pain', value: maxPainData.maxPainStrike.toString(), color: 'text-[#d4af37]' }].map(item => (
          <div key={item.label}><div className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">{item.label}</div><div className={`text-lg font-bold ${item.color}`}>{item.value}</div></div>
        ))}
      </div>

      {activeTab === 'chain' && (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[#080a12] text-slate-600 text-[10px] uppercase tracking-wider">
                  <th colSpan={showGreeks ? 8 : 5} className="py-2.5 px-2 text-center border-b border-r border-[#1a1f2e] bg-red-500/5 text-red-400 font-bold">CALLS</th>
                  <th className="py-2.5 px-3 text-center border-b border-[#1a1f2e]"><button onClick={() => handleSort('strike')} className="flex items-center gap-1 mx-auto hover:text-[#d4af37] font-bold">Strike <ArrowUpDown className="w-3 h-3" /></button></th>
                  <th colSpan={showGreeks ? 8 : 5} className="py-2.5 px-2 text-center border-b border-l border-[#1a1f2e] bg-emerald-500/5 text-emerald-400 font-bold">PUTS</th>
                </tr>
                <tr className="bg-[#080a12]/80 text-slate-700 text-[10px]">
                  <th className="py-2 px-2 text-right"><button onClick={() => handleSort('ceOi')} className="flex items-center gap-1 ml-auto hover:text-[#d4af37]">OI <ArrowUpDown className="w-3 h-3" /></button></th>
                  <th className="py-2 px-2 text-right">Chg</th><th className="py-2 px-2 text-right">Vol</th><th className="py-2 px-2 text-right">IV</th><th className="py-2 px-2 text-right">Bid</th><th className="py-2 px-2 text-right">Ask</th>
                  {showGreeks && <><th className="py-2 px-2 text-right">Delta</th><th className="py-2 px-2 text-right">Gamma</th><th className="py-2 px-2 text-right">Theta</th></>}
                  <th className="py-2 px-2 text-right">LTP</th>
                  <th className="py-2 px-3 text-center text-[#d4af37] font-bold bg-[#080a12]">Strike</th>
                  <th className="py-2 px-2 text-left">LTP</th>
                  {showGreeks && <><th className="py-2 px-2 text-left">Delta</th><th className="py-2 px-2 text-left">Gamma</th><th className="py-2 px-2 text-left">Theta</th></>}
                  <th className="py-2 px-2 text-left">Bid</th><th className="py-2 px-2 text-left">Ask</th><th className="py-2 px-2 text-left">IV</th><th className="py-2 px-2 text-left">Vol</th><th className="py-2 px-2 text-left">Chg</th>
                  <th className="py-2 px-2 text-left"><button onClick={() => handleSort('peOi')} className="flex items-center gap-1 hover:text-[#d4af37]"><ArrowUpDown className="w-3 h-3" /> OI</button></th>
                </tr>
              </thead>
              <tbody>
                {filteredStrikes.map((s, idx) => {
                  const isATM = s.strike === atmStrike;
                  return (
                    <motion.tr key={s.strike} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.01 }}
                      className={`border-b border-[#1a1f2e]/40 hover:bg-[#121520] transition-colors ${isATM ? 'bg-[#d4af37]/5' : ''}`}>
                      <td className="py-1.5 px-2 text-right"><div className="text-slate-200 font-semibold">{(s.ceOi / 1000).toFixed(1)}K</div><div className="h-0.5 bg-[#1a1f2e] rounded-full mt-0.5 w-12 ml-auto"><div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min((s.ceOi / totals.ceOi) * 800, 100)}%` }} /></div></td>
                      <td className={`py-1.5 px-2 text-right font-medium ${s.ceOiChg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.ceOiChg >= 0 ? '+' : ''}{(s.ceOiChg / 1000).toFixed(1)}K</td>
                      <td className="py-1.5 px-2 text-right text-slate-500">{(s.ceVolume / 1000).toFixed(1)}K</td>
                      <td className="py-1.5 px-2 text-right text-slate-600">{s.ceIv}%</td>
                      <td className="py-1.5 px-2 text-right text-slate-600">{s.ceBid}</td>
                      <td className="py-1.5 px-2 text-right text-slate-600">{s.ceAsk}</td>
                      {showGreeks && <><td className="py-1.5 px-2 text-right text-slate-600">{s.ceDelta}</td><td className="py-1.5 px-2 text-right text-slate-600">{s.ceGamma}</td><td className="py-1.5 px-2 text-right text-slate-600">{s.ceTheta}</td></>}
                      <td className="py-1.5 px-2 text-right font-bold text-red-400">{s.ceLtp.toFixed(2)}</td>
                      <td className={`py-1.5 px-3 text-center font-bold ${isATM ? 'text-[#d4af37] bg-[#d4af37]/10' : 'text-slate-200'}`}>{s.strike}{isATM && <span className="text-[8px] block text-[#d4af37]">ATM</span>}</td>
                      <td className="py-1.5 px-2 text-left font-bold text-emerald-400">{s.peLtp.toFixed(2)}</td>
                      {showGreeks && <><td className="py-1.5 px-2 text-left text-slate-600">{s.peDelta}</td><td className="py-1.5 px-2 text-left text-slate-600">{s.peGamma}</td><td className="py-1.5 px-2 text-left text-slate-600">{s.peTheta}</td></>}
                      <td className="py-1.5 px-2 text-left text-slate-600">{s.peBid}</td>
                      <td className="py-1.5 px-2 text-left text-slate-600">{s.peAsk}</td>
                      <td className="py-1.5 px-2 text-left text-slate-600">{s.peIv}%</td>
                      <td className="py-1.5 px-2 text-left text-slate-500">{(s.peVolume / 1000).toFixed(1)}K</td>
                      <td className={`py-1.5 px-2 text-left font-medium ${s.peOiChg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.peOiChg >= 0 ? '+' : ''}{(s.peOiChg / 1000).toFixed(1)}K</td>
                      <td className="py-1.5 px-2 text-left"><div className="text-slate-200 font-semibold">{(s.peOi / 1000).toFixed(1)}K</div><div className="h-0.5 bg-[#1a1f2e] rounded-full mt-0.5 w-12"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min((s.peOi / totals.peOi) * 800, 100)}%` }} /></div></td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
            <h3 className="text-sm font-bold text-[#d4af37] mb-3">Max Pain Analysis</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={maxPainData.painValues}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                <XAxis dataKey="strike" stroke="#475569" fontSize={10} tickLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }} formatter={(value) => [((value as number) / 1000000).toFixed(2) + 'M', 'Pain']} />
                <Bar dataKey="pain" fill="#334155" radius={[2, 2, 0, 0]}>
                  {maxPainData.painValues.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.strike === maxPainData.maxPainStrike ? '#d4af37' : '#334155'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 text-center"><span className="text-sm text-slate-500">Max Pain Strike: </span><span className="text-lg font-bold text-[#d4af37]">{maxPainData.maxPainStrike}</span></div>
          </div>
          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
            <h3 className="text-sm font-bold text-[#d4af37] mb-3">PCR by Strike</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={strikes.map(s => ({ strike: s.strike, pcr: s.pcr }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                <XAxis dataKey="strike" stroke="#475569" fontSize={10} tickLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="pcr" fill="#d4af37" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'buildup' && (
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#080a12] text-slate-600 text-[10px] uppercase tracking-wider">
                <th className="py-3 px-4 text-left">Symbol</th>
                <th className="py-3 px-4 text-right">CE OI Chg</th>
                <th className="py-3 px-4 text-right">PE OI Chg</th>
                <th className="py-3 px-4 text-right">Price Chg %</th>
                <th className="py-3 px-4 text-center">Signal</th>
              </tr>
            </thead>
            <tbody>
              {buildup.map((b, idx) => (
                <motion.tr key={b.symbol} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                  className="border-b border-[#1a1f2e]/40 hover:bg-[#121520] transition-colors">
                  <td className="py-2.5 px-4 font-bold text-slate-200">{b.symbol}</td>
                  <td className={`py-2.5 px-4 text-right font-medium ${b.ceOiChg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{b.ceOiChg >= 0 ? '+' : ''}{(b.ceOiChg / 1000).toFixed(1)}K</td>
                  <td className={`py-2.5 px-4 text-right font-medium ${b.peOiChg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{b.peOiChg >= 0 ? '+' : ''}{(b.peOiChg / 1000).toFixed(1)}K</td>
                  <td className={`py-2.5 px-4 text-right font-bold ${b.priceChg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{b.priceChg >= 0 ? '+' : ''}{b.priceChg}%</td>
                  <td className="py-2.5 px-4 text-center"><span className={`text-xs px-2 py-1 rounded-full font-bold border ${getBuildupColor(b.signal)}`}>{b.signal}</span></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'iv' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
            <h3 className="text-sm font-bold text-[#d4af37] mb-3">IV Percentile & Rank</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-3 bg-[#121520] rounded-lg"><div className="text-xs text-slate-600">Current IV</div><div className="text-xl font-bold text-[#d4af37]">{ivData.current}%</div></div>
              <div className="text-center p-3 bg-[#121520] rounded-lg"><div className="text-xs text-slate-600">Percentile</div><div className="text-xl font-bold text-emerald-400">{ivData.percentile}%</div></div>
              <div className="text-center p-3 bg-[#121520] rounded-lg"><div className="text-xs text-slate-600">IV Rank</div><div className="text-xl font-bold text-blue-400">{ivData.rank}</div></div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={ivData.historical}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                <XAxis dataKey="date" stroke="#475569" fontSize={9} tickLine={false} angle={-30} textAnchor="end" height={40} />
                <YAxis stroke="#475569" fontSize={9} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '11px' }} />
                <Line type="monotone" dataKey="iv" stroke="#d4af37" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
            <h3 className="text-sm font-bold text-[#d4af37] mb-3">Volatility Skew</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={skewData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                <XAxis dataKey="strike" stroke="#475569" fontSize={10} tickLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }} />
                <Legend />
                <Line type="monotone" dataKey="ceIv" name="CE IV" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="peIv" name="PE IV" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
