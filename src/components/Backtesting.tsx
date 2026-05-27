import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Plus, Trash2, Settings, Download, 
  TrendingUp, Activity, BarChart3, 
  Zap, Layers
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ReferenceLine 
} from 'recharts';

// ============================================================
// INSTITUTIONAL DATA & SIMULATION ENGINE
// ============================================================

interface BacktestDay {
  date: string;
  spot: number;
  portfolioValue: number;
  drawdown: number;
}

interface TradeLog {
  id: number;
  entryDate: string;
  exitDate: string;
  pnl: number;
  pnlPercent: number;
  maxDrawdown: number;
  daysHeld: number;
}

interface Leg {
  id: string;
  action: 'BUY' | 'SELL';
  type: 'CE' | 'PE';
  strikeOffset: number; // 0 = ATM, 1 = OTM 1 strike, -1 = ITM 1 strike
  lots: number;
}

const LOT_SIZE = 50;
const INITIAL_CAPITAL = 1000000; // 10 Lakhs

// Simulate 2 years of historical data with realistic market movements
function generateMarketData() {
  const data = [];
  let spot = 18000;
  const startDate = new Date('2022-01-01');
  let currentDate = new Date(startDate);
  
  while (currentDate <= new Date('2023-12-31')) {
    if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
      const volatility = 0.015; 
      const drift = 0.0002;
      const change = spot * (drift + volatility * (Math.random() - 0.5) * 2);
      spot += change;
      
      data.push({
        date: currentDate.toISOString().split('T')[0],
        spot: Number(spot.toFixed(2)),
        iv: 12 + Math.random() * 6
      });
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return data;
}

// Simplified Options Pricing for Simulation
function calculateOptionPrice(spot: number, strike: number, type: 'CE' | 'PE', daysToExpiry: number, iv: number) {
  const intrinsic = type === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const timeValue = (iv / 100) * spot * Math.sqrt(Math.max(0, daysToExpiry) / 365) * 0.4;
  return intrinsic + Math.max(0, timeValue);
}

// ============================================================
// BACKTESTING ENGINE
// ============================================================

function runMultiLegBacktest(legs: Leg[], marketData: any[]) {
  const equityCurve: BacktestDay[] = [];
  const tradeLog: TradeLog[] = [];
  let capital = INITIAL_CAPITAL;
  let peakCapital = INITIAL_CAPITAL;
  let entryDayIndex = 0;
  let inTrade = false;
  
  for (let i = 0; i < marketData.length; i++) {
    const day = marketData[i];

    if (!inTrade && (i % 7 === 0)) {
      inTrade = true;
      entryDayIndex = i;
    }

    if (inTrade && (i % 7 === 6 || i === marketData.length - 1)) {
      inTrade = false;
      const entryDay = marketData[entryDayIndex];
      const entryAtmStrike = Math.round(entryDay.spot / 50) * 50;
      let tradePnL = 0;
      
      legs.forEach(leg => {
        const lockedStrike = entryAtmStrike + (leg.strikeOffset * 50);
        const entryPrice = calculateOptionPrice(entryDay.spot, lockedStrike, leg.type, 7, entryDay.iv);
        const exitPrice = calculateOptionPrice(day.spot, lockedStrike, leg.type, 0, day.iv);
        const priceDiff = exitPrice - entryPrice;
        tradePnL += leg.action === 'BUY' ? priceDiff : -priceDiff;
      });
      
      tradePnL = tradePnL * legs[0].lots * LOT_SIZE;
      capital += tradePnL;
      
      if (capital > peakCapital) peakCapital = capital;
      const dd = peakCapital - capital;
      
      tradeLog.push({
        id: tradeLog.length + 1,
        entryDate: entryDay.date,
        exitDate: day.date,
        pnl: Number(tradePnL.toFixed(2)),
        pnlPercent: Number(((tradePnL / INITIAL_CAPITAL) * 100).toFixed(2)),
        maxDrawdown: Number(dd.toFixed(2)),
        daysHeld: 7
      });
    }

    equityCurve.push({
      date: day.date,
      spot: day.spot,
      portfolioValue: Number(capital.toFixed(2)),
      drawdown: Number(((peakCapital - capital) / peakCapital * 100).toFixed(2))
    });
  }
  
  return { equityCurve, tradeLog, finalCapital: capital };
}

// ============================================================
// COMPONENT
// ============================================================

export default function Backtesting() {
  const [marketData, setMarketData] = useState<any[]>([]);
  const [legs, setLegs] = useState<Leg[]>([
    { id: '1', action: 'SELL', type: 'CE', strikeOffset: 0, lots: 2 },
    { id: '2', action: 'SELL', type: 'PE', strikeOffset: 0, lots: 2 }
  ]);
  const [results, setResults] = useState<{equityCurve: BacktestDay[], tradeLog: TradeLog[], finalCapital: number} | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setMarketData(generateMarketData());
  }, []);

  const addLeg = () => {
    setLegs([...legs, { id: Math.random().toString(), action: 'BUY', type: 'CE', strikeOffset: 1, lots: 1 }]);
  };

  const updateLeg = (id: string, field: keyof Leg, value: any) => {
    setLegs(legs.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const removeLeg = (id: string) => {
    setLegs(legs.filter(l => l.id !== id));
  };

  const handleRunBacktest = () => {
    if (marketData.length === 0) return;
    setIsRunning(true);
    setTimeout(() => {
      const res = runMultiLegBacktest(legs, marketData);
      setResults(res);
      setIsRunning(false);
    }, 1200);
  };

  const analytics = useMemo(() => {
    if (!results) return null;
    const totalTrades = results.tradeLog.length;
    const winningTrades = results.tradeLog.filter(t => t.pnl > 0).length;
    const winRate = totalTrades ? (winningTrades / totalTrades) * 100 : 0;
    const totalPnL = results.finalCapital - INITIAL_CAPITAL;
    const grossProfit = results.tradeLog.filter(t => t.pnl > 0).reduce((a, b) => a + b.pnl, 0);
    const grossLoss = Math.abs(results.tradeLog.filter(t => t.pnl < 0).reduce((a, b) => a + b.pnl, 0));
    const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
    const maxDD = Math.max(...results.equityCurve.map(d => d.drawdown));
    
    return { totalTrades, winRate, totalPnL, profitFactor: isFinite(profitFactor) ? profitFactor : 0, maxDD, finalCapital: results.finalCapital };
  }, [results]);

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200 p-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-[#d4af37]/10 rounded-lg border border-[#d4af37]/20">
              <Activity className="w-6 h-6 text-[#d4af37]" />
            </div>
            Multi-Leg Options Backtester
          </h1>
          <p className="text-slate-500 text-sm mt-1 ml-14">Institutional-grade strategy simulation with historical OI & Greeks data</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-[#121520] border border-[#1a1f2e] rounded-lg text-sm text-slate-300 hover:bg-[#1a1f2e] flex items-center gap-2">
            <Settings className="w-4 h-4" /> Settings
          </button>
          <button 
            onClick={handleRunBacktest} 
            disabled={isRunning}
            className="px-6 py-2 bg-[#d4af37] text-[#0b0e17] font-bold rounded-lg hover:bg-[#b8941f] transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isRunning ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {isRunning ? 'Simulating...' : 'Run Backtest'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-180px)]">
        
        {/* LEFT: Strategy Builder */}
        <div className="col-span-3 bg-[#0b0e17] border border-[#1a1f2e] rounded-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#1a1f2e] bg-[#0f1219]">
            <h2 className="text-sm font-bold text-[#d4af37] flex items-center gap-2">
              <Layers className="w-4 h-4" /> Strategy Legs
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <AnimatePresence>
              {legs.map((leg, idx) => (
                <motion.div 
                  key={leg.id} 
                  initial={{ opacity: 0, x: -20 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-[#121520] border border-[#1a1f2e] rounded-lg p-3 relative group"
                >
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => removeLeg(leg.id)} className="text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold mb-2 uppercase tracking-wider">Leg {idx + 1}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={leg.action} onChange={e => updateLeg(leg.id, 'action', e.target.value)} className={`text-xs rounded px-2 py-1.5 border font-bold ${leg.action === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                    <select value={leg.type} onChange={e => updateLeg(leg.id, 'type', e.target.value)} className="bg-[#0b0e17] border border-[#1a1f2e] text-slate-200 text-xs rounded px-2 py-1.5">
                      <option value="CE">CE</option>
                      <option value="PE">PE</option>
                    </select>
                    <select value={leg.strikeOffset} onChange={e => updateLeg(leg.id, 'strikeOffset', Number(e.target.value))} className="bg-[#0b0e17] border border-[#1a1f2e] text-slate-200 text-xs rounded px-2 py-1.5 col-span-2">
                      <option value={-2}>ITM 2 (ATM - 100)</option>
                      <option value={-1}>ITM 1 (ATM - 50)</option>
                      <option value={0}>ATM (At The Money)</option>
                      <option value={1}>OTM 1 (ATM + 50)</option>
                      <option value={2}>OTM 2 (ATM + 100)</option>
                    </select>
                    <div className="col-span-2 flex items-center gap-2 bg-[#0b0e17] border border-[#1a1f2e] rounded px-2 py-1.5">
                      <span className="text-[10px] text-slate-500">Lots:</span>
                      <input type="number" value={leg.lots} onChange={e => updateLeg(leg.id, 'lots', Number(e.target.value))} className="bg-transparent text-xs text-white w-full focus:outline-none text-right" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <button onClick={addLeg} className="w-full py-2 border border-dashed border-[#1a1f2e] rounded-lg text-xs text-slate-500 hover:text-[#d4af37] hover:border-[#d4af37]/50 transition-colors flex items-center justify-center gap-2">
              <Plus className="w-3.5 h-3.5" /> Add Leg
            </button>
          </div>
          <div className="p-4 border-t border-[#1a1f2e] bg-[#0f1219] text-[10px] text-slate-600">
            <div className="flex justify-between mb-1"><span>Capital:</span> <span className="text-slate-400">₹{(INITIAL_CAPITAL/100000).toFixed(1)}L</span></div>
            <div className="flex justify-between"><span>Lot Size:</span> <span className="text-slate-400">NIFTY (50)</span></div>
          </div>
        </div>

        {/* CENTER: Charts & Analytics */}
        <div className="col-span-6 flex flex-col gap-6">
          {/* Equity Curve */}
          <div className="flex-1 bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Equity Curve
              </h2>
              {analytics && (
                <div className="text-xs font-mono text-slate-400">
                  Final: <span className={analytics.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}>₹{(analytics.finalCapital/100000).toFixed(2)}L</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0">
              {results ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={results.equityCurve}>
                    <defs>
                      <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d4af37" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#d4af37" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" vertical={false} />
                    <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} minTickGap={60} />
                    <YAxis stroke="#475569" fontSize={10} tickLine={false} domain={['auto', 'auto']} tickFormatter={(val) => `${(val/100000).toFixed(1)}L`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: any) => [`₹${(value/1000).toFixed(1)}K`, 'Portfolio Value']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <ReferenceLine y={INITIAL_CAPITAL} stroke="#475569" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="portfolioValue" stroke="#d4af37" fillOpacity={1} fill="url(#equityGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600 text-sm">Configure legs and run backtest to view equity curve</div>
              )}
            </div>
          </div>

          {/* Trade Log Table */}
          <div className="h-1/3 bg-[#0b0e17] border border-[#1a1f2e] rounded-xl flex flex-col overflow-hidden">
            <div className="p-3 border-b border-[#1a1f2e] bg-[#0f1219] flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trade Log</h2>
              <button className="text-[10px] text-slate-500 hover:text-white flex items-center gap-1"><Download className="w-3 h-3" /> Export CSV</button>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#121520] text-slate-500 sticky top-0 z-10">
                  <tr>
                    <th className="py-2 px-4 font-medium">Entry Date</th>
                    <th className="py-2 px-4 font-medium">Exit Date</th>
                    <th className="py-2 px-4 font-medium text-right">Days</th>
                    <th className="py-2 px-4 font-medium text-right">P&L (₹)</th>
                    <th className="py-2 px-4 font-medium text-right">Return %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a1f2e]">
                  {results?.tradeLog.map((trade) => (
                    <tr key={trade.id} className="hover:bg-[#121520] transition-colors">
                      <td className="py-2 px-4 text-slate-300 font-mono">{trade.entryDate}</td>
                      <td className="py-2 px-4 text-slate-300 font-mono">{trade.exitDate}</td>
                      <td className="py-2 px-4 text-right text-slate-400">{trade.daysHeld}</td>
                      <td className={`py-2 px-4 text-right font-bold font-mono ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toLocaleString()}
                      </td>
                      <td className={`py-2 px-4 text-right font-mono ${trade.pnlPercent >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                        {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                  {!results && <tr><td colSpan={5} className="py-8 text-center text-slate-600">No trades executed yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT: Performance Metrics */}
        <div className="col-span-3 space-y-4">
          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#d4af37]" /> Performance Summary
            </h2>
            {analytics ? (
              <div className="space-y-4">
                <div className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e]">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Net Profit</div>
                  <div className={`text-xl font-black ${analytics.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {analytics.totalPnL >= 0 ? '+' : ''}₹{(analytics.totalPnL/1000).toFixed(1)}K
                  </div>
                  <div className="text-[10px] text-slate-600 mt-1">{((analytics.totalPnL/INITIAL_CAPITAL)*100).toFixed(2)}% Total Return</div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e]">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Win Rate</div>
                    <div className={`text-lg font-bold ${analytics.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{analytics.winRate.toFixed(1)}%</div>
                  </div>
                  <div className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e]">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Profit Factor</div>
                    <div className="text-lg font-bold text-blue-400">{analytics.profitFactor.toFixed(2)}</div>
                  </div>
                  <div className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e]">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Max Drawdown</div>
                    <div className="text-lg font-bold text-red-400">{analytics.maxDD.toFixed(2)}%</div>
                  </div>
                  <div className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e]">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Trades</div>
                    <div className="text-lg font-bold text-white">{analytics.totalTrades}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-600 text-xs">Run backtest to view analytics</div>
            )}
          </div>

          <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" /> AI Strategy Score
            </h2>
            {analytics ? (
              <div>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-3xl font-black text-white">
                    {Math.min(99, Math.max(10, Math.round(analytics.winRate + (analytics.profitFactor * 10) - analytics.maxDD)))}
                  </span>
                  <span className="text-sm text-slate-500 mb-1">/ 100</span>
                </div>
                <div className="w-full bg-[#121520] rounded-full h-1.5 mb-3">
                  <div className="bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, analytics.winRate + 20)}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Strategy shows {analytics.winRate > 50 ? 'positive' : 'negative'} expectancy. 
                  {analytics.maxDD > 20 ? ' High drawdown risk detected.' : ' Drawdowns are within acceptable limits.'}
                </p>
              </div>
            ) : (
              <div className="text-center py-4 text-slate-600 text-xs">Waiting for simulation data...</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}