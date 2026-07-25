import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Crown, Filter } from 'lucide-react';
import { getSignals, type SignalData } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function SignalsPanel() {
  const [signals, setSignals] = useState<SignalData[]>([]);

  const load = () => setSignals(getSignals());

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(load);

  const topSignal = signals.length
    ? [...signals].sort((a, b) => b.strength - a.strength)[0]
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Live Auto Trade
          </h2>
          <p className="text-sm text-slate-500">
            Automatically displays the strongest BUY or SELL trade signal — no manual click needed.
          </p>
        </div>
      </div>

      {topSignal ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={topSignal.symbol + topSignal.timeframe}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.3 }}
            className={`bg-[#0b0e17] border rounded-3xl p-5 shadow-sm ${
              topSignal.signal === 'BUY' ? 'border-emerald-500/20' : 'border-red-500/20'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  topSignal.signal === 'BUY' ? 'bg-emerald-500/10' : 'bg-red-500/10'
                }`}>
                  {topSignal.signal === 'BUY' ? (
                    <TrendingUp className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-red-400" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200">{topSignal.symbol}</div>
                  <div className="text-[11px] text-slate-500">{topSignal.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${topSignal.signal === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {topSignal.signal}
                </div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Single auto trade</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-2xl bg-[#121520] p-3 text-center">
                <div className="text-[10px] text-slate-500 uppercase tracking-[0.18em]">Entry</div>
                <div className="mt-2 text-lg font-semibold text-[#d4af37]">₹{topSignal.entry}</div>
              </div>
              <div className="rounded-2xl bg-emerald-500/5 p-3 text-center">
                <div className="text-[10px] text-emerald-400 uppercase tracking-[0.18em]">Target</div>
                <div className="mt-2 text-lg font-semibold text-emerald-300">₹{topSignal.target}</div>
              </div>
              <div className="rounded-2xl bg-red-500/5 p-3 text-center">
                <div className="text-[10px] text-red-400 uppercase tracking-[0.18em]">Stop Loss</div>
                <div className="mt-2 text-lg font-semibold text-red-300">₹{topSignal.stopLoss}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
              <div className="text-sm text-slate-400">{topSignal.reason}</div>
              <div className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] ${topSignal.signal === 'BUY' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                {topSignal.strength}% confidence
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="py-20 text-center text-slate-500">
          <Filter className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No automatic trade signal is available right now.</p>
          <p className="text-xs text-slate-400">Waiting for the first strong BUY or SELL opportunity.</p>
        </div>
      )}
    </div>
  );
}
