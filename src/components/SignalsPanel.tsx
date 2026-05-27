import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, TrendingUp, TrendingDown, Crown, Filter } from 'lucide-react';
import { getSignals, type SignalData } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function SignalsPanel() {
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

  const load = () => setSignals(getSignals());

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(load);

  const filtered = filter === 'ALL' ? signals : signals.filter(s => s.signal === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Trading Signals
          </h2>
          <p className="text-sm text-slate-500">AI-powered buy/sell recommendations</p>
        </div>
        <div className="flex bg-[#121520] rounded-lg border border-[#1a1f2e] overflow-hidden">
          {(['ALL', 'BUY', 'SELL'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                filter === f
                  ? f === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : f === 'SELL' ? 'bg-red-500/15 text-red-400' : 'bg-[#d4af37]/15 text-[#d4af37]'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((signal, idx) => (
            <motion.div
              key={signal.symbol + signal.timeframe}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: idx * 0.05 }}
              className={`bg-[#0b0e17] border rounded-xl p-4 hover:border-opacity-80 transition-all ${
                signal.signal === 'BUY' ? 'border-emerald-500/20 hover:border-emerald-500/40' : 'border-red-500/20 hover:border-red-500/40'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    signal.signal === 'BUY' ? 'bg-emerald-500/10' : 'bg-red-500/10'
                  }`}>
                    {signal.signal === 'BUY' ? (
                      <TrendingUp className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-200">{signal.symbol}</div>
                    <div className="text-[10px] text-slate-500">{signal.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold ${signal.signal === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {signal.signal}
                  </div>
                  <div className="text-[10px] text-slate-500">{signal.timeframe}</div>
                </div>
              </div>

              {/* Strength Bar */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                  <span>Signal Strength</span>
                  <span className={signal.signal === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{signal.strength}%</span>
                </div>
                <div className="h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${signal.strength}%` }}
                    transition={{ duration: 0.8, delay: idx * 0.1 }}
                    className={`h-full rounded-full ${signal.signal === 'BUY' ? 'bg-emerald-500' : 'bg-red-500'}`}
                  />
                </div>
              </div>

              {/* Levels */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 bg-[#121520] rounded-lg">
                  <div className="text-[10px] text-slate-500">Entry</div>
                  <div className="text-sm font-bold text-[#d4af37]">₹{signal.entry}</div>
                </div>
                <div className="text-center p-2 bg-emerald-500/5 rounded-lg">
                  <div className="text-[10px] text-emerald-500/70">Target</div>
                  <div className="text-sm font-bold text-emerald-400">₹{signal.target}</div>
                </div>
                <div className="text-center p-2 bg-red-500/5 rounded-lg">
                  <div className="text-[10px] text-red-500/70">Stop Loss</div>
                  <div className="text-sm font-bold text-red-400">₹{signal.stopLoss}</div>
                </div>
              </div>

              {/* Reason */}
              <div className="flex items-start gap-1.5 text-[11px] text-slate-500">
                <Zap className="w-3 h-3 text-[#d4af37] shrink-0 mt-0.5" />
                <span>{signal.reason}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="py-20 text-center text-slate-500">
          <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No signals match the filter</p>
        </div>
      )}
    </div>
  );
}
