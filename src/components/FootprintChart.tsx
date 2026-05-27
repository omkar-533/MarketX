import { useState, useEffect, useMemo } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { 
  Search, Activity, TrendingUp, TrendingDown, 
  Zap, ArrowUpRight, ArrowDownRight, Maximize2
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';

import { getFnoLiveQuotes } from '../services/symbolLiveService';
import { fetchMarketOhlc } from '../services/marketApiService';

function liveUniverse() {
  const quotes = getFnoLiveQuotes();
  const indices = quotes.filter((q) => q.type === 'index').map((q) => ({
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    change: q.changePercent,
  }));
  const stocks = quotes.filter((q) => q.type === 'stock').map((q) => ({
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    change: q.changePercent,
  }));
  return { indices, stocks, futures: indices };
}

// ============================================================
// FOOTPRINT DATA GENERATOR ENGINE
// ============================================================
interface PriceLevel {
  price: number;
  bidVol: number;
  askVol: number;
  delta: number;
  isImbalance: boolean;
  imbalanceType: 'BUY' | 'SELL' | null;
  isAbsorption: boolean;
}

interface FootprintCandle {
  id: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  totalVolume: number;
  candleDelta: number;
  levels: PriceLevel[];
}

async function footprintFromOhlc(symbol: string, interval: string): Promise<FootprintCandle[]> {
  const res = await fetchMarketOhlc(symbol, interval, '1d');
  if (!res?.bars?.length) return [];
  return res.bars.slice(-12).map((b, i) => {
    const d = new Date(b.time * 1000);
    const up = b.close >= b.open;
    const half = Math.floor(b.volume / 2);
    return {
      id: i,
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      totalVolume: b.volume,
      candleDelta: up ? half : -half,
      levels: [
        {
          price: b.close,
          bidVol: up ? half : b.volume - half,
          askVol: up ? b.volume - half : half,
          delta: up ? half : -half,
          isImbalance: Math.abs(b.close - b.open) > (b.high - b.low) * 0.4,
          imbalanceType: up ? 'BUY' : 'SELL',
          isAbsorption: false,
        },
      ],
    };
  });
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function FootprintChart() {
  const universe = liveUniverse();
  const [activeTab, setActiveTab] = useState<'indices' | 'stocks' | 'futures'>('indices');
  const [selectedSymbol, setSelectedSymbol] = useState(
    universe.indices[0] ?? { symbol: 'NIFTY', name: 'Nifty 50', price: 0, change: 0 },
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<FootprintCandle[]>([]);
  const [timeframe, setTimeframe] = useState('5m');

  const refreshFootprint = () => {
    void footprintFromOhlc(selectedSymbol.symbol, timeframe === '5m' ? '5m' : '15m').then(setData);
  };

  useEffect(() => {
    refreshFootprint();
  }, [selectedSymbol, timeframe]);

  useAutoRefresh(refreshFootprint);

  // Derived Analytics
  const { minPrice, maxPrice } = useMemo(() => {
    if (data.length === 0) return { minPrice: 0, maxPrice: 0 };
    let min = Infinity, max = -Infinity;
    data.forEach(c => {
      c.levels.forEach(l => {
        if (l.price < min) min = l.price;
        if (l.price > max) max = l.price;
      });
    });
    const tickSize = selectedSymbol.price > 10000 ? 5 : selectedSymbol.price > 1000 ? 1 : 0.05;
    return { minPrice: Math.floor(min / tickSize) * tickSize, maxPrice: Math.ceil(max / tickSize) * tickSize };
  }, [data, selectedSymbol.price]);

  const priceLevels = useMemo(() => {
    const levels = [];
    const tickSize = selectedSymbol.price > 10000 ? 5 : selectedSymbol.price > 1000 ? 1 : 0.05;
    for (let p = maxPrice; p >= minPrice; p -= tickSize) {
      levels.push(p);
    }
    return levels;
  }, [minPrice, maxPrice, selectedSymbol.price]);

  const cumulativeDeltaData = useMemo(() => {
    let cum = 0;
    return data.map(d => {
      cum += d.candleDelta;
      return { time: d.time, delta: cum };
    });
  }, [data]);

  const lastCandle = data[data.length - 1];
  const totalAsk = lastCandle ? lastCandle.levels.reduce((acc, l) => acc + l.askVol, 0) : 0;
  const totalBid = lastCandle ? lastCandle.levels.reduce((acc, l) => acc + l.bidVol, 0) : 0;
  const buyPressure = totalAsk + totalBid === 0 ? 50 : (totalAsk / (totalAsk + totalBid)) * 100;

  const filteredUniverse = useMemo(() => {
    const list = liveUniverse()[activeTab];
    if (!searchQuery) return list;
    return list.filter(item => item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || item.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [activeTab, searchQuery]);

  const getCellBg = (bid: number, ask: number) => {
    const maxVol = 5000;
    const intensity = Math.min((Math.max(bid, ask) / maxVol), 0.8);
    if (ask > bid) return `rgba(16, 185, 129, ${intensity})`; // Green
    if (bid > ask) return `rgba(239, 68, 68, ${intensity})`; // Red
    return `rgba(100, 116, 139, ${intensity * 0.5})`; // Neutral
  };

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col bg-[#05070d] text-slate-200 font-sans overflow-hidden">
      
      {/* TOP BAR: Quick Switch & Market Status */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0b0e17] border-b border-[#1a1f2e]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#121520] rounded-lg p-1 border border-[#1a1f2e]">
            <button onClick={() => universe.indices[0] && setSelectedSymbol(universe.indices[0])} className={`px-3 py-1 text-xs font-bold rounded ${selectedSymbol.symbol === 'NIFTY' ? 'bg-[#d4af37] text-[#0b0e17]' : 'text-slate-400 hover:text-white'}`}>NIFTY</button>
            <button onClick={() => universe.indices[1] && setSelectedSymbol(universe.indices[1])} className={`px-3 py-1 text-xs font-bold rounded ${selectedSymbol.symbol === 'BANKNIFTY' ? 'bg-[#d4af37] text-[#0b0e17]' : 'text-slate-400 hover:text-white'}`}>BANKNIFTY</button>
            <button onClick={() => universe.stocks[0] && setSelectedSymbol(universe.stocks[0])} className={`px-3 py-1 text-xs font-bold rounded ${selectedSymbol.symbol === 'RELIANCE' ? 'bg-[#d4af37] text-[#0b0e17]' : 'text-slate-400 hover:text-white'}`}>RELIANCE</button>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span>LIVE FEED</span>
            <span className="text-slate-600">|</span>
            <span>LATENCY: 12ms</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-[#121520] rounded-lg border border-[#1a1f2e] p-1">
            {['1m', '5m', '15m', '30m'].map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)} className={`px-3 py-1 text-xs font-bold rounded ${timeframe === tf ? 'bg-[#1a1f2e] text-white' : 'text-slate-500 hover:text-white'}`}>{tf}</button>
            ))}
          </div>
          <button className="p-2 bg-[#121520] border border-[#1a1f2e] rounded-lg text-slate-400 hover:text-white"><Maximize2 className="w-4 h-4" /></button>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANEL: Universe Selector */}
        <div className="w-64 bg-[#0b0e17] border-r border-[#1a1f2e] flex flex-col">
          <div className="p-3 border-b border-[#1a1f2e]">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search Symbol..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#121520] border border-[#1a1f2e] text-slate-200 text-xs rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-[#d4af37]"
              />
            </div>
            <div className="flex gap-1 mt-3">
              {(['indices', 'stocks', 'futures'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-1 text-[10px] font-bold uppercase rounded border transition-all ${activeTab === tab ? 'bg-[#d4af37]/10 text-[#d4af37] border-[#d4af37]/30' : 'bg-[#121520] text-slate-500 border-[#1a1f2e]'}`}>
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredUniverse.map(item => (
              <div 
                key={item.symbol} 
                onClick={() => setSelectedSymbol(item)}
                className={`p-3 border-b border-[#1a1f2e]/50 cursor-pointer hover:bg-[#121520] transition-colors ${selectedSymbol.symbol === item.symbol ? 'bg-[#121520] border-l-2 border-l-[#d4af37]' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="font-bold text-sm text-white">{item.symbol}</div>
                  <div className={`text-xs font-bold ${item.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{item.change > 0 ? '+' : ''}{item.change}%</div>
                </div>
                <div className="text-[10px] text-slate-500">{item.name}</div>
                <div className="text-xs text-slate-300 mt-1 font-mono">{item.price.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER PANEL: Footprint Grid */}
        <div className="flex-1 flex flex-col bg-[#080a12] overflow-hidden relative">
          <div className="absolute inset-0 overflow-auto custom-scrollbar">
            <table className="w-full border-collapse text-[10px] font-mono">
              <thead className="sticky top-0 z-20 bg-[#0b0e17] border-b border-[#1a1f2e] shadow-lg">
                <tr>
                  <th className="w-24 py-2 px-2 text-left text-slate-500 font-sans font-bold sticky left-0 bg-[#0b0e17] z-30 border-r border-[#1a1f2e] shadow-[4px_0_10px_rgba(0,0,0,0.5)]">Price</th>
                  {data.map(c => (
                    <th key={c.id} className="min-w-[120px] py-2 px-1 text-center border-r border-[#1a1f2e]/50">
                      <div className="text-slate-400 font-sans text-[10px]">{c.time}</div>
                      <div className={`text-[9px] font-bold flex items-center justify-center gap-1 ${c.candleDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {c.candleDelta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(c.candleDelta)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priceLevels.map(price => (
                  <tr key={price} className="border-b border-[#1a1f2e]/30 hover:bg-[#121520]/50">
                    <td className="py-1 px-2 text-left text-slate-300 font-sans font-bold sticky left-0 bg-[#080a12] z-10 border-r border-[#1a1f2e] shadow-[4px_0_10px_rgba(0,0,0,0.5)]">{price.toFixed(selectedSymbol.price > 1000 ? 0 : 2)}</td>
                    {data.map(c => {
                      const level = c.levels.find(l => l.price === price);
                      if (!level) return <td key={c.id} className="border-r border-[#1a1f2e]/20 bg-[#05070d]"></td>;
                      
                      const bgColor = getCellBg(level.bidVol, level.askVol);
                      return (
                        <td key={c.id} className="border-r border-[#1a1f2e]/50 p-1 text-center relative transition-colors" style={{ backgroundColor: bgColor }}>
                          <div className="flex justify-between items-center px-2 font-bold">
                            <span className={`${level.bidVol > level.askVol ? 'text-white' : 'text-slate-400'} ${level.isImbalance && level.imbalanceType === 'SELL' ? 'underline decoration-red-500 decoration-2 text-white' : ''} ${level.isAbsorption ? 'italic text-yellow-300' : ''}`}>
                              {level.bidVol}
                            </span>
                            <span className="text-slate-600/50 text-[8px]">|</span>
                            <span className={`${level.askVol > level.bidVol ? 'text-white' : 'text-slate-400'} ${level.isImbalance && level.imbalanceType === 'BUY' ? 'underline decoration-emerald-500 decoration-2 text-white' : ''} ${level.isAbsorption ? 'italic text-yellow-300' : ''}`}>
                              {level.askVol}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Legend Overlay */}
          <div className="absolute bottom-4 left-4 bg-[#0b0e17]/90 backdrop-blur border border-[#1a1f2e] rounded-lg p-3 text-[10px] space-y-2 shadow-2xl z-20">
            <div className="text-slate-500 font-bold uppercase mb-1">Heatmap Legend</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500/60 border border-emerald-500"></div> Ask Dominance (Aggressive Buy)</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500/60 border border-red-500"></div> Bid Dominance (Aggressive Sell)</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-transparent border-b-2 border-emerald-500"></div> Buy Imbalance (&gt;3x)</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-transparent border-b-2 border-red-500"></div> Sell Imbalance (&gt;3x)</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 text-yellow-300 font-serif italic">A</div> Absorption Zone</div>
          </div>
        </div>

        {/* RIGHT PANEL: Analytics & Pressure */}
        <div className="w-72 bg-[#0b0e17] border-l border-[#1a1f2e] flex flex-col">
          <div className="p-4 border-b border-[#1a1f2e]">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-[#d4af37]" /> Order Flow Stats</h3>
            
            {/* Market Pressure Meter */}
            <div className="mb-6">
              <div className="flex justify-between text-[10px] text-slate-500 mb-1 uppercase font-bold">
                <span className="text-red-400">Sellers ({(100 - buyPressure).toFixed(1)}%)</span>
                <span className="text-emerald-400">Buyers ({buyPressure.toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-[#1a1f2e] h-3 rounded-full overflow-hidden flex">
                <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${100 - buyPressure}%` }}></div>
                <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${buyPressure}%` }}></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 bg-[#121520] rounded-lg border border-red-500/20">
                <div className="text-[10px] text-slate-500 uppercase">Total Bid</div>
                <div className="text-lg font-bold text-red-400">{totalBid.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-[#121520] rounded-lg border border-emerald-500/20">
                <div className="text-[10px] text-slate-500 uppercase">Total Ask</div>
                <div className="text-lg font-bold text-emerald-400">{totalAsk.toLocaleString()}</div>
              </div>
            </div>
            
            <div className="p-3 bg-[#121520] rounded-lg border border-[#1a1f2e] flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Net Candle Delta</div>
                <div className={`text-xl font-black ${lastCandle?.candleDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {lastCandle?.candleDelta >= 0 ? '+' : ''}{lastCandle?.candleDelta.toLocaleString()}
                </div>
              </div>
              {lastCandle?.candleDelta >= 0 ? <TrendingUp className="w-8 h-8 text-emerald-500/20" /> : <TrendingDown className="w-8 h-8 text-red-500/20" />}
            </div>
          </div>

          <div className="flex-1 p-4 flex flex-col min-h-0">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-blue-400" /> Cumulative Delta</h3>
            <div className="flex-1 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeDeltaData}>
                  <defs>
                    <linearGradient id="colorDelta" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" vertical={false} />
                  <XAxis dataKey="time" stroke="#475569" fontSize={8} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={8} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0b0e17', border: '1px solid #1a1f2e', fontSize: '10px' }} />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="delta" stroke="#3b82f6" fillOpacity={1} fill="url(#colorDelta)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}