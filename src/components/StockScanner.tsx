import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, ArrowUpDown, TrendingUp, TrendingDown, Filter, Crown } from 'lucide-react';
import { getStocks, type StockData as BaseStock } from '../data/marketData';
import { buildOptionChain } from '../services/optionChainEngine';

type StockData = BaseStock & { oi: number; iv: number; pcr: number; maxPain: number };
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const SCANNER_PRESETS = [
  { name: 'High OI Buildup', filter: (s: StockData) => s.oi > 3000000 },
  { name: 'High IV', filter: (s: StockData) => s.iv > 35 },
  { name: 'Bullish PCR', filter: (s: StockData) => s.pcr > 1.2 },
  { name: 'Bearish PCR', filter: (s: StockData) => s.pcr < 0.8 },
  { name: 'Top Gainers', filter: (s: StockData) => s.changePercent > 1 },
  { name: 'Top Losers', filter: (s: StockData) => s.changePercent < -1 },
  { name: 'High Volume', filter: (s: StockData) => s.volume > 5000000 },
];

export default function StockScanner() {
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [sortBy, setSortBy] = useState<keyof StockData>('changePercent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [sectorFilter, setSectorFilter] = useState('');

  const load = () => {
    setStocks(
      getStocks().map((s) => {
        const chain = buildOptionChain(s.symbol, s.price, undefined, 15);
        const ce = chain.reduce((n, r) => n + r.ceOi, 0);
        const pe = chain.reduce((n, r) => n + r.peOi, 0);
        return {
          ...s,
          oi: ce + pe,
          iv: Math.round((18 + Math.abs(s.changePercent) * 1.5) * 10) / 10,
          pcr: Math.round((pe / Math.max(ce, 1)) * 100) / 100,
          maxPain: Math.round(s.price / 50) * 50,
        };
      }),
    );
  };

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(load);

  const sectors = useMemo(() => {
    return [...new Set(stocks.map(s => s.sector))];
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    let result = [...stocks];
    
    if (search) {
      result = result.filter(s => 
        s.symbol.toLowerCase().includes(search.toLowerCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    if (sectorFilter) {
      result = result.filter(s => s.sector === sectorFilter);
    }
    
    if (selectedPreset) {
      const preset = SCANNER_PRESETS.find(p => p.name === selectedPreset);
      if (preset) {
        result = result.filter(preset.filter);
      }
    }
    
    result.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    
    return result;
  }, [stocks, search, sectorFilter, selectedPreset, sortBy, sortOrder]);

  const handleSort = (field: keyof StockData) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="p-4 max-w-[1600px] mx-auto space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gold flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Stock Scanner
          </h2>
          <p className="text-sm text-slate-500">Filter & scan stocks by options metrics</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search symbol..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-[#111827] border border-[#334155] text-slate-200 text-sm rounded-lg pl-9 pr-3 py-2 w-48 focus:outline-none focus:border-gold"
            />
          </div>
          
          <select 
            value={sectorFilter}
            onChange={e => setSectorFilter(e.target.value)}
            className="bg-[#111827] border border-[#334155] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
          >
            <option value="">All Sectors</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select 
            value={selectedPreset}
            onChange={e => setSelectedPreset(e.target.value)}
            className="bg-[#111827] border border-[#334155] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold"
          >
            <option value="">All Stocks</option>
            {SCANNER_PRESETS.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {SCANNER_PRESETS.map(preset => (
          <button
            key={preset.name}
            onClick={() => setSelectedPreset(selectedPreset === preset.name ? '' : preset.name)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
              selectedPreset === preset.name
                ? 'bg-gold-15 text-gold border-gold-30'
                : 'bg-[#111827] text-slate-400 border-[#334155] hover:text-gold-light'
            }`}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Total Stocks</div>
          <div className="text-2xl font-bold text-gold">{filteredStocks.length}</div>
        </div>
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Avg PCR</div>
          <div className="text-2xl font-bold text-gold">
            {(filteredStocks.reduce((sum, s) => sum + s.pcr, 0) / (filteredStocks.length || 1)).toFixed(2)}
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Avg IV</div>
          <div className="text-2xl font-bold text-gold">
            {(filteredStocks.reduce((sum, s) => sum + s.iv, 0) / (filteredStocks.length || 1)).toFixed(1)}%
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Advancing</div>
          <div className="text-2xl font-bold text-emerald-400">
            {filteredStocks.filter(s => s.changePercent > 0).length}
          </div>
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-[#111827] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0d1220] text-slate-500 text-xs uppercase tracking-wider">
                <th className="py-3 px-4 text-left">
                  <button onClick={() => handleSort('symbol')} className="flex items-center gap-1 hover:text-gold font-bold">
                    Symbol <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-left">Name</th>
                <th className="py-3 px-4 text-left">Sector</th>
                <th className="py-3 px-4 text-right">
                  <button onClick={() => handleSort('price')} className="flex items-center gap-1 ml-auto hover:text-gold font-bold">
                    Price <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">
                  <button onClick={() => handleSort('changePercent')} className="flex items-center gap-1 ml-auto hover:text-gold font-bold">
                    Change <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">
                  <button onClick={() => handleSort('volume')} className="flex items-center gap-1 ml-auto hover:text-gold font-bold">
                    Volume <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">
                  <button onClick={() => handleSort('oi')} className="flex items-center gap-1 ml-auto hover:text-gold font-bold">
                    OI <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">
                  <button onClick={() => handleSort('iv')} className="flex items-center gap-1 ml-auto hover:text-gold font-bold">
                    IV <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">
                  <button onClick={() => handleSort('pcr')} className="flex items-center gap-1 ml-auto hover:text-gold font-bold">
                    PCR <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right font-bold">Max Pain</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.map((stock, idx) => (
                <motion.tr 
                  key={stock.symbol}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.02 }}
                  className="border-b border-[#1e293b]/50 hover:bg-[#1e293b]/30 transition-colors"
                >
                  <td className="py-2.5 px-4">
                    <div className="font-bold text-slate-200">{stock.symbol}</div>
                  </td>
                  <td className="py-2.5 px-4 text-slate-400">{stock.name}</td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 bg-[#1e293b] text-slate-400 text-xs rounded-full font-medium">
                      {stock.sector}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-200 font-bold">₹{stock.price}</td>
                  <td className="py-2.5 px-4 text-right">
                    <div className={`flex items-center justify-end gap-1 ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'} font-semibold`}>
                      {stock.changePercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent}%
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-400">{(stock.volume / 100000).toFixed(1)}L</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">{(stock.oi / 100000).toFixed(1)}L</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">{stock.iv}%</td>
                  <td className="py-2.5 px-4 text-right">
                    <span className={`${stock.pcr > 1 ? 'text-emerald-400' : 'text-red-400'} font-semibold`}>
                      {stock.pcr.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-400 font-medium">₹{stock.maxPain}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredStocks.length === 0 && (
          <div className="py-12 text-center text-slate-500">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No stocks match the selected filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
