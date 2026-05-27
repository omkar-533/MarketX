import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, ArrowRight, Crown } from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';
import { getIndices, EXPIRY_DATES } from '../data/marketData';
import { getStrikeChain, calculateMaxPainFromStrikes } from '../utils/optionChainStrike';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function MaxPain() {
  const [symbol, setSymbol] = useState('NIFTY');
  const [expiry, setExpiry] = useState(EXPIRY_DATES[0]);
  const [spotPrice, setSpotPrice] = useState(24580);
  const [maxPainData, setMaxPainData] = useState<{ maxPainStrike: number; painValues: { strike: number; pain: number }[] }>({ maxPainStrike: 0, painValues: [] });

  const refresh = () => {
    const indices = getIndices();
    const currentSpot = indices.find((i) => i.symbol === symbol)?.price || 24580;
    setSpotPrice(currentSpot);
    const strikes = getStrikeChain(symbol, currentSpot);
    setMaxPainData(calculateMaxPainFromStrikes(strikes));
  };

  useEffect(() => {
    refresh();
  }, [symbol]);

  useAutoRefresh(refresh);

  const maxPainStrike = maxPainData.maxPainStrike;
  const diff = spotPrice - maxPainStrike;
  const diffPercent = (diff / maxPainStrike) * 100;

  const painChartData = maxPainData.painValues.map(p => ({
    strike: p.strike,
    pain: p.pain,
    isMaxPain: p.strike === maxPainStrike,
    isSpot: p.strike === Math.round(spotPrice / 50) * 50,
  }));

  const topPainStrikes = [...maxPainData.painValues]
    .sort((a, b) => a.pain - b.pain)
    .slice(0, 5);

  return (
    <div className="p-4 max-w-[1600px] mx-auto space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gold flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Max Pain Analysis
          </h2>
          <p className="text-sm text-slate-500">Option pain point & expiry analysis</p>
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
          
          <select 
            value={expiry} 
            onChange={e => setExpiry(e.target.value)}
            className="bg-[#111827] border border-[#334155] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
          >
            {EXPIRY_DATES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">Current Spot</div>
          <div className="text-3xl font-bold text-gold">{spotPrice.toLocaleString()}</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">Max Pain Strike</div>
          <div className="text-3xl font-bold text-gold">{maxPainStrike.toLocaleString()}</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">Difference</div>
          <div className={`text-3xl font-bold ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
          </div>
          <div className={`text-sm ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ({diffPercent >= 0 ? '+' : ''}{diffPercent.toFixed(2)}%)
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm"
        >
          <div className="text-xs text-slate-500 font-medium mb-1">Expected Move</div>
          <div className="text-lg font-bold">
            {diff > 0 ? (
              <span className="flex items-center gap-1 text-red-400">
                <TrendingDown className="w-4 h-4" /> Down to <span className="text-gold">{maxPainStrike}</span>
              </span>
            ) : diff < 0 ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <TrendingUp className="w-4 h-4" /> Up to <span className="text-gold">{maxPainStrike}</span>
              </span>
            ) : (
              <span className="text-gold">At Max Pain</span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Market may gravitate towards max pain at expiry
          </div>
        </motion.div>
      </div>

      {/* Max Pain Chart */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gold mb-4">Pain Value by Strike</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={painChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="strike" stroke="#475569" fontSize={11} tickLine={false} />
            <YAxis stroke="#475569" fontSize={11} tickLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              formatter={(value) => [((value as number) / 1000000).toFixed(2) + 'M', 'Pain Value']}
            />
            <ReferenceLine x={maxPainStrike} stroke="#d4af37" strokeDasharray="5 5" label={{ value: 'Max Pain', fill: '#d4af37', fontSize: 12 }} />
            <ReferenceLine x={Math.round(spotPrice / 50) * 50} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: 'Spot', fill: '#3b82f6', fontSize: 12 }} />
            <Bar dataKey="pain" name="Pain Value">
              {painChartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.isMaxPain ? '#d4af37' : entry.isSpot ? '#3b82f6' : '#334155'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Pain Strikes Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gold mb-4">Lowest Pain Strikes (Support Levels)</h3>
          <div className="space-y-2">
            {topPainStrikes.map((item, idx) => (
              <div key={item.strike} className="flex items-center justify-between p-3 bg-[#0d1220] rounded-lg border border-[#1e293b]/50">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gold-dark w-5 font-bold">{idx + 1}</span>
                  <span className="font-bold text-slate-200">{item.strike}</span>
                  {item.strike === maxPainStrike && (
                    <span className="px-2 py-0.5 bg-gold-10 text-gold text-xs rounded-full border border-gold-30 font-semibold">Max Pain</span>
                  )}
                </div>
                <div className="text-sm text-slate-400 font-medium">
                  {(item.pain / 1000000).toFixed(2)}M
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gold mb-4">Max Pain Theory</h3>
          <div className="space-y-3 text-sm text-slate-400">
            <p>
              <span className="text-gold font-semibold">What is Max Pain?</span><br />
              Max Pain is the strike price where the total value of options contracts (both calls and puts) 
              would be minimized if the underlying expires at that price.
            </p>
            <p>
              <span className="text-gold font-semibold">How it works:</span><br />
              At expiry, option writers (sellers) want maximum options to expire worthless. 
              The max pain point represents where the most options would expire worthless, 
              minimizing the payout from option writers.
            </p>
            <p>
              <span className="text-gold font-semibold">Trading Implication:</span><br />
              The underlying price often gravitates towards the max pain strike as expiry approaches, 
              especially in the last few days.
            </p>
            <div className="flex items-center gap-2 p-3 bg-gold-10 rounded-lg border border-gold-30 mt-4">
              <ArrowRight className="w-4 h-4 text-gold" />
              <span className="text-gold text-sm font-medium">
                Current spot is {Math.abs(diff).toFixed(0)} points {diff > 0 ? 'above' : 'below'} max pain
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
