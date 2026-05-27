import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Info, Crown } from 'lucide-react';
import { calculateGreeks } from '../data/nseData';
import { getIndices } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

export default function GreeksCalculator() {
  const [spot, setSpot] = useState(24580);
  const [strike, setStrike] = useState(24600);
  const [daysToExpiry, setDaysToExpiry] = useState(7);
  const [iv, setIv] = useState(15);
  const [optionType, setOptionType] = useState<'CE' | 'PE'>('CE');
  const [interestRate, setInterestRate] = useState(6);

  const syncSpot = () => {
    const indices = getIndices();
    const niftySpot = indices.find((i) => i.symbol === 'NIFTY')?.price ?? 24580;
    setSpot(Math.round(niftySpot));
    setStrike(Math.round(niftySpot / 50) * 50);
  };

  useEffect(() => {
    syncSpot();
  }, []);

  useAutoRefresh(syncSpot);

  const greeks = calculateGreeks(spot, strike, daysToExpiry, iv, optionType, interestRate / 100);

  const greekCards = [
    { 
      name: 'Delta', 
      value: greeks.delta, 
      desc: 'Price sensitivity to underlying',
      color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      detail: optionType === 'CE' 
        ? 'For every ₹1 move in spot, option moves by ₹' + Math.abs(greeks.delta).toFixed(2)
        : 'For every ₹1 move in spot, option moves by ₹' + Math.abs(greeks.delta).toFixed(2) + ' (inverse)'
    },
    { 
      name: 'Gamma', 
      value: greeks.gamma, 
      desc: 'Delta sensitivity to underlying',
      color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      detail: 'Delta changes by ' + greeks.gamma + ' for every ₹1 move in spot'
    },
    { 
      name: 'Theta', 
      value: greeks.theta, 
      desc: 'Time decay per day',
      color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      detail: 'Option loses ₹' + Math.abs(greeks.theta).toFixed(2) + ' per day due to time decay'
    },
    { 
      name: 'Vega', 
      value: greeks.vega, 
      desc: 'Sensitivity to IV change',
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      detail: 'For every 1% change in IV, option changes by ₹' + greeks.vega.toFixed(2)
    },
    { 
      name: 'Rho', 
      value: greeks.rho, 
      desc: 'Sensitivity to interest rates',
      color: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
      detail: 'For every 1% change in rates, option changes by ₹' + Math.abs(greeks.rho).toFixed(2)
    },
  ];

  const T = daysToExpiry / 365;
  const theoreticalPrice = Math.round(
    (optionType === 'CE' 
      ? Math.max(0, spot - strike) + spot * iv / 100 * Math.sqrt(T)
      : Math.max(0, strike - spot) + spot * iv / 100 * Math.sqrt(T)
    ) * 100
  ) / 100;

  return (
    <div className="p-4 max-w-[1600px] mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gold flex items-center gap-2">
          <Crown className="w-5 h-5" />
          Greeks Calculator
        </h2>
        <p className="text-sm text-slate-500">Calculate option Greeks in real-time</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Input Panel */}
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gold mb-4">Parameters</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Option Type</label>
              <div className="flex rounded-lg border border-[#334155] overflow-hidden">
                <button
                  onClick={() => setOptionType('CE')}
                  className={`flex-1 py-2 text-sm font-bold transition-all ${
                    optionType === 'CE' ? 'bg-red-500/10 text-red-400 border-r border-[#334155]' : 'text-slate-400 hover:text-gold-light'
                  }`}
                >
                  CALL (CE)
                </button>
                <button
                  onClick={() => setOptionType('PE')}
                  className={`flex-1 py-2 text-sm font-bold transition-all ${
                    optionType === 'PE' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-gold-light'
                  }`}
                >
                  PUT (PE)
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Spot Price (₹)</label>
              <input
                type="number"
                value={spot}
                onChange={e => setSpot(Number(e.target.value))}
                className="w-full bg-[#0d1220] border border-[#334155] text-slate-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Strike Price (₹)</label>
              <input
                type="number"
                value={strike}
                onChange={e => setStrike(Number(e.target.value))}
                className="w-full bg-[#0d1220] border border-[#334155] text-slate-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Days to Expiry</label>
              <input
                type="number"
                value={daysToExpiry}
                onChange={e => setDaysToExpiry(Number(e.target.value))}
                className="w-full bg-[#0d1220] border border-[#334155] text-slate-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Implied Volatility (%)</label>
              <input
                type="number"
                value={iv}
                onChange={e => setIv(Number(e.target.value))}
                className="w-full bg-[#0d1220] border border-[#334155] text-slate-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Interest Rate (%)</label>
              <input
                type="number"
                value={interestRate}
                onChange={e => setInterestRate(Number(e.target.value))}
                className="w-full bg-[#0d1220] border border-[#334155] text-slate-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold"
              />
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gold">Greeks Values</h3>
              <div className="text-right">
                <div className="text-xs text-slate-500">Theoretical Price</div>
                <div className="text-xl font-bold text-gold">₹{theoreticalPrice.toFixed(2)}</div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {greekCards.map((greek, idx) => (
                <motion.div
                  key={greek.name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`p-4 rounded-xl border ${greek.color}`}
                >
                  <div className="text-xs opacity-70 mb-1">{greek.name}</div>
                  <div className="text-2xl font-bold">{greek.value > 0 ? '+' : ''}{greek.value}</div>
                  <div className="text-[10px] opacity-60 mt-1">{greek.desc}</div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Greeks Explanation */}
          <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gold mb-4 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Greeks Interpretation
            </h3>
            
            <div className="space-y-3">
              {greekCards.map(greek => (
                <div key={greek.name} className="flex items-start gap-3 p-3 bg-[#0d1220] rounded-lg border border-[#1e293b]/50">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${greek.color}`}>
                    {greek.name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-200">{greek.name}: {greek.value > 0 ? '+' : ''}{greek.value}</div>
                    <div className="text-xs text-slate-500">{greek.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Moneyness */}
          <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gold mb-3">Moneyness Analysis</h3>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-xs text-slate-500">Spot</div>
                <div className="text-lg font-bold text-gold">₹{spot}</div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-500" />
              <div className="text-center">
                <div className="text-xs text-slate-500">Strike</div>
                <div className="text-lg font-bold text-gold">₹{strike}</div>
              </div>
              <div className="h-8 w-px bg-[#1e293b]" />
              <div className="text-center">
                <div className="text-xs text-slate-500">Moneyness</div>
                <div className={`text-lg font-bold ${
                  optionType === 'CE' 
                    ? spot > strike ? 'text-emerald-400' : 'text-red-400'
                    : spot < strike ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {optionType === 'CE' 
                    ? spot > strike ? 'ITM' : spot === strike ? 'ATM' : 'OTM'
                    : spot < strike ? 'ITM' : spot === strike ? 'ATM' : 'OTM'
                  }
                </div>
              </div>
              <div className="h-8 w-px bg-[#1e293b]" />
              <div className="text-center">
                <div className="text-xs text-slate-500">Intrinsic Value</div>
                <div className="text-lg font-bold text-gold">
                  ₹{Math.max(0, optionType === 'CE' ? spot - strike : strike - spot)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
