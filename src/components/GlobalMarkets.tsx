import { useState, useEffect, useMemo } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Clock, Sunrise, Sunset, Crown, Bitcoin, Globe2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getIndices } from '../data/marketData';
import { fetchGlobalQuotes } from '../services/marketApiService';
import { getLiveIntradayData, isLiveSectionsActive } from '../services/liveMarketSections';
import {
  FOREX_WATCH_META,
  CRYPTO_WATCH_META,
} from '../data/coreGlobalLiveSymbols';
import { getLiveQuote } from '../services/symbolLiveService';
import { ensureSiteWideLiveFeed } from '../services/siteWideLiveFeed';
import { subscribeMarketLive } from '../services/marketLiveStore';

interface GlobalIndex {
  name: string;
  country: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'Open' | 'Closed';
  openTime: string;
  closeTime: string;
  currency: string;
}

function buildLiveIndiaIndices(): GlobalIndex[] {
  const india = getIndices();
  return india
    .filter((i) => ['NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY'].includes(i.symbol))
    .map((i) => ({
      name: i.name,
      country: 'India',
      price: i.price,
      change: i.change,
      changePercent: i.changePercent,
      status: 'Open' as const,
      openTime: '09:15',
      closeTime: '15:30',
      currency: 'INR',
    }));
}

async function mergeIndices(): Promise<GlobalIndex[]> {
  const liveIndia = buildLiveIndiaIndices();
  const sgx = liveIndia.find((i) => i.name.includes('NIFTY'));
  let global: GlobalIndex[] = [];
  try {
    const api = await fetchGlobalQuotes();
    global = (api?.indices ?? [])
      .filter((i) => i.price > 0)
      .map((i) => ({
        name: i.name,
        country: i.country,
        price: i.price,
        change: i.change,
        changePercent: i.changePercent,
        status: i.status,
        openTime: i.openTime,
        closeTime: i.closeTime,
        currency: i.currency,
      }));
  } catch {
    /* offline */
  }
  const merged = [...liveIndia, ...global];
  if (sgx) {
    merged.push({
      name: 'SGX Nifty',
      country: 'Singapore',
      price: sgx.price,
      change: sgx.change,
      changePercent: sgx.changePercent,
      status: 'Open',
      openTime: '06:30',
      closeTime: '23:30',
      currency: 'USD',
    });
  }
  return merged;
}

export default function GlobalMarkets() {
  const [indices, setIndices] = useState<GlobalIndex[]>([]);
  const [selected, setSelected] = useState('NIFTY 50');
  const [chartData, setChartData] = useState<{ time: string; price: number }[]>([]);
  const [time, setTime] = useState(new Date());
  const [liveTick, setLiveTick] = useState(0);

  const refresh = () => {
    void mergeIndices().then(setIndices);
    setTime(new Date());
    if (isLiveSectionsActive()) {
      const intra = getLiveIntradayData('NIFTY');
      setChartData(intra.map((p) => ({ time: p.time, price: p.price })));
    }
  };

  useEffect(() => {
    ensureSiteWideLiveFeed();
    refresh();
    const unsub = subscribeMarketLive(() => {
      setLiveTick((n) => n + 1);
      setTime(new Date());
    });
    return unsub;
  }, []);

  useAutoRefresh(refresh);

  const forexRows = useMemo(() => {
    void liveTick;
    return FOREX_WATCH_META.map((w) => {
      const q = getLiveQuote(w.symbol);
      return {
        ...w,
        price: q?.price ?? 0,
        changePercent: q?.changePercent ?? 0,
      };
    });
  }, [liveTick, time]);

  const cryptoRows = useMemo(() => {
    void liveTick;
    return CRYPTO_WATCH_META.map((w) => {
      const q = getLiveQuote(w.symbol);
      return {
        ...w,
        price: q?.price ?? 0,
        changePercent: q?.changePercent ?? 0,
      };
    });
  }, [liveTick, time]);

  const sel = indices.find((i) => i.name === selected) ?? indices[0];
  const pos = sel ? sel.change >= 0 : true;

  return (
    <div className="p-4 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gold flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Global Markets
          </h2>
          <p className="text-sm text-slate-500">
            TradingView live — India · Forex · Crypto · {time.toLocaleTimeString('en-IN')}
          </p>
        </div>
      </div>

      <div className="app-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Globe2 className="w-3.5 h-3.5 text-sky-400" />
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Forex & Metals</h3>
          <span className="text-[9px] text-emerald-400 font-bold">TV LIVE</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {forexRows.map((r) => (
            <div key={r.symbol} className="rounded-lg border border-dark-border bg-dark-elevated/50 px-2.5 py-2">
              <div className="text-[10px] text-slate-500 font-bold">{r.label}</div>
              <div className="text-sm font-bold text-slate-100 tabular-nums">
                {r.price > 0 ? r.price.toLocaleString('en-US', { maximumFractionDigits: 5 }) : '—'}
              </div>
              <div className={`text-[10px] font-bold ${r.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {r.price > 0 ? `${r.changePercent >= 0 ? '+' : ''}${r.changePercent.toFixed(2)}%` : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="app-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Bitcoin className="w-3.5 h-3.5 text-orange-400" />
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Crypto</h3>
          <span className="text-[9px] text-emerald-400 font-bold">TV LIVE</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {cryptoRows.map((r) => (
            <div key={r.symbol} className="rounded-lg border border-dark-border bg-dark-elevated/50 px-2.5 py-2">
              <div className="text-[10px] text-slate-500 font-bold">{r.label}</div>
              <div className="text-sm font-bold text-slate-100 tabular-nums">
                {r.price > 0 ? r.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
              </div>
              <div className={`text-[10px] font-bold ${r.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {r.price > 0 ? `${r.changePercent >= 0 ? '+' : ''}${r.changePercent.toFixed(2)}%` : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-2 max-h-[500px] overflow-y-auto">
          {indices.map((idx) => (
            <motion.button
              key={idx.name}
              type="button"
              onClick={() => setSelected(idx.name)}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                selected === idx.name
                  ? 'border-gold/40 bg-gold/10'
                  : 'border-dark-border bg-dark-surface hover:border-gold/20'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-slate-200 text-sm">{idx.name}</div>
                  <div className="text-[10px] text-slate-500">{idx.country}</div>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    idx.status === 'Open' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {idx.status}
                </span>
              </div>
              <div className="flex justify-between mt-2">
                <span className="font-bold text-slate-100">
                  {idx.currency === 'INR' ? '₹' : ''}
                  {idx.price.toLocaleString()}
                </span>
                <span className={idx.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {idx.changePercent >= 0 ? '+' : ''}
                  {idx.changePercent}%
                </span>
              </div>
            </motion.button>
          ))}
        </div>

        <div className="lg:col-span-2 bg-dark-surface border border-dark-border rounded-xl p-4">
          {!sel ? (
            <p className="text-slate-500 text-sm py-20 text-center">Loading live indices…</p>
          ) : (
          <>
          <div className="flex items-center gap-4 mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-100">{sel.name}</h3>
              <p className="text-2xl font-bold text-gold mt-1">
                {sel.price.toLocaleString()} {sel.currency}
              </p>
            </div>
            <div className={`ml-auto flex items-center gap-1 ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
              {pos ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              <span className="font-bold">
                {sel.change >= 0 ? '+' : ''}
                {sel.change} ({sel.changePercent}%)
              </span>
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1f2e" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip />
                <Area type="monotone" dataKey="price" stroke="#d4af37" fill="rgba(212,175,55,0.15)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-sm py-20 text-center">Live chart loading…</p>
          )}
          <div className="flex gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Sunrise className="w-3 h-3" /> Open {sel.openTime}
            </span>
            <span className="flex items-center gap-1">
              <Sunset className="w-3 h-3" /> Close {sel.closeTime}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {sel.currency}
            </span>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
