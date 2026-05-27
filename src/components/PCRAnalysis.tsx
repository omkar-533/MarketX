import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart3, Crown } from 'lucide-react';
import { 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  ComposedChart,
  Cell
} from 'recharts';
import { getIndices } from '../data/marketData';
import { getHistoricalPCR } from '../data/marketData';
import { getStrikeChain, type StrikeData } from '../utils/optionChainStrike';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function PCRAnalysis() {
  const [symbol, setSymbol] = useState('NIFTY');
  const [strikes, setStrikes] = useState<StrikeData[]>([]);
  const [, setSpotPrice] = useState(24580);
  const [historicalPCR, setHistoricalPCR] = useState(getHistoricalPCR('NIFTY', 30));
  const [timeframe, setTimeframe] = useState<'intraday' | 'daily' | 'weekly'>('daily');

  const refresh = () => {
    const indices = getIndices();
    const currentSpot = indices.find((i) => i.symbol === symbol)?.price || 24580;
    setSpotPrice(currentSpot);
    setStrikes(getStrikeChain(symbol, currentSpot));
    setHistoricalPCR(getHistoricalPCR(symbol, 30));
  };

  useEffect(() => {
    refresh();
  }, [symbol]);

  useAutoRefresh(refresh);

  const pcrData = (() => {
    const ceTotalOI = strikes.reduce((sum, s) => sum + s.ceOI, 0);
    const peTotalOI = strikes.reduce((sum, s) => sum + s.peOI, 0);
    const ceTotalVol = strikes.reduce((sum, s) => sum + s.ceVolume, 0);
    const peTotalVol = strikes.reduce((sum, s) => sum + s.peVolume, 0);
    
    return {
      totalPCR: peTotalOI / (ceTotalOI || 1),
      volumePCR: peTotalVol / (ceTotalVol || 1),
      ceOI: ceTotalOI,
      peOI: peTotalOI,
      ceVol: ceTotalVol,
      peVol: peTotalVol,
    };
  })();

  const strikeWisePCR = strikes.map(s => ({
    strike: s.strike,
    pcr: s.pcr,
    ceOI: s.ceOI,
    peOI: s.peOI,
    ceVolume: s.ceVolume,
    peVolume: s.peVolume,
  }));

  const getPCRSignal = (pcr: number) => {
    if (pcr > 1.3) return { signal: 'Strongly Bullish', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' };
    if (pcr > 1.1) return { signal: 'Bullish', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' };
    if (pcr > 0.9) return { signal: 'Neutral', color: 'text-gold', bg: 'bg-gold-10 border-gold-30' };
    if (pcr > 0.7) return { signal: 'Bearish', color: 'text-red-300', bg: 'bg-red-500/10 border-red-500/20' };
    return { signal: 'Strongly Bearish', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' };
  };

  const signal = getPCRSignal(pcrData.totalPCR);

  return (
    <div className="p-4 max-w-[1600px] mx-auto space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gold flex items-center gap-2">
            <Crown className="w-5 h-5" />
            PCR Analysis
          </h2>
          <p className="text-sm text-slate-500">Put-Call Ratio & Sentiment Analysis</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={symbol} 
            onChange={e => setSymbol(e.target.value)}
            className="bg-[#111827] border border-[#334155] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
          >
            <option value="NIFTY">NIFTY 50</option>
            <option value="BANKNIFTY">BANK NIFTY</option>
            <option value="FINNIFTY">FIN NIFTY</option>
          </select>
          
          <div className="flex bg-[#111827] rounded-lg border border-[#334155] overflow-hidden">
            {(['intraday', 'daily', 'weekly'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-2 text-sm capitalize transition-all ${
                  timeframe === tf ? 'bg-gold-15 text-gold' : 'text-slate-400 hover:text-gold-light'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* PCR Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">OI Based PCR</div>
          <div className={`text-3xl font-bold ${signal.color}`}>{pcrData.totalPCR.toFixed(3)}</div>
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs mt-2 border ${signal.bg} ${signal.color}`}>
            {pcrData.totalPCR > 1 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {signal.signal}
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">Volume Based PCR</div>
          <div className={`text-3xl font-bold ${getPCRSignal(pcrData.volumePCR).color}`}>
            {pcrData.volumePCR.toFixed(3)}
          </div>
          <div className="text-xs text-slate-500 mt-2">Volume weighted sentiment</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">Total CE OI</div>
          <div className="text-3xl font-bold text-red-400">{(pcrData.ceOI / 100000).toFixed(2)}L</div>
          <div className="text-xs text-slate-500 mt-2">Call open interest</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">Total PE OI</div>
          <div className="text-3xl font-bold text-emerald-400">{(pcrData.peOI / 100000).toFixed(2)}L</div>
          <div className="text-xs text-slate-500 mt-2">Put open interest</div>
        </motion.div>
      </div>

      {/* Historical PCR Chart */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gold mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Historical PCR Trend (30 Days)
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={historicalPCR}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" stroke="#475569" fontSize={11} tickLine={false} angle={-45} textAnchor="end" height={60} />
            <YAxis stroke="#475569" fontSize={11} tickLine={false} domain={[0, 2]} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
            />
            <Legend />
            <Bar dataKey="ceOI" name="CE OI" fill="#ef4444" opacity={0.5} />
            <Bar dataKey="peOI" name="PE OI" fill="#10b981" opacity={0.5} />
            <Line type="monotone" dataKey="pcr" name="PCR" stroke="#d4af37" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Strike-wise PCR */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gold mb-4">Strike-wise PCR Analysis</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={strikeWisePCR}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="strike" stroke="#475569" fontSize={10} tickLine={false} />
            <YAxis stroke="#475569" fontSize={11} tickLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
            />
            <Bar dataKey="pcr" name="PCR">
              {strikeWisePCR.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.pcr > 1 ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* PCR Interpretation */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gold mb-3">PCR Interpretation Guide</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            { range: '< 0.7', signal: 'Strongly Bearish', desc: 'Extreme call buying', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
            { range: '0.7 - 0.9', signal: 'Bearish', desc: 'More calls than puts', color: 'bg-red-500/5 text-red-300 border-red-500/15' },
            { range: '0.9 - 1.1', signal: 'Neutral', desc: 'Balanced sentiment', color: 'bg-gold-10 text-gold border-gold-30' },
            { range: '1.1 - 1.3', signal: 'Bullish', desc: 'More puts than calls', color: 'bg-emerald-500/5 text-emerald-300 border-emerald-500/15' },
            { range: '> 1.3', signal: 'Strongly Bullish', desc: 'Extreme put buying', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
          ].map(item => (
            <div key={item.range} className={`p-3 rounded-lg border ${item.color}`}>
              <div className="text-lg font-bold">{item.range}</div>
              <div className="text-sm font-medium mt-1">{item.signal}</div>
              <div className="text-xs opacity-70 mt-1">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
