import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bitcoin,
  Flame,
  Globe2,
  IndianRupee,
  TrendingDown,
  TrendingUp,
  Volume2,
  Zap,
} from 'lucide-react';
import { getMarketBreadth } from '../data/marketData';
import { CORE_LIVE_SYMBOLS } from '../data/fnoUniverse';
import {
  FOREX_WATCH_META,
  CRYPTO_WATCH_META,
} from '../data/coreGlobalLiveSymbols';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useFyersWebSocket } from '../hooks/useFyersWebSocket';
import { BRAND } from '../constants/brandLabels';
import {
  calculateMaxPain,
  getFuturesOIData,
  getGainers,
  getIndices,
  getLosers,
  getMostActive,
  getOIIntelligence,
  getOptionChain,
  getSectorHeatmapData,
  getSignals,
  type IndexData,
  type SectorHeatmapItem,
  type StockData,
} from '../data/marketData';
import { fetchMarketQuotes, type MarketQuoteDto } from '../services/marketApiService';
import { startFyersSocketClient } from '../services/fyersSocketClient';
import { subscribeLiveSymbols } from '../services/marketTickStream';
import { subscribeMarketLive } from '../services/marketLiveStore';
import { getLiveQuote, refreshFnoLiveQuotesAsync } from '../services/symbolLiveService';
import DashInfoTip, { DashInfoLabel } from './ui/DashInfoTip';

interface DashboardProps {
  onNavigate?: (tab: string) => void;
}

type MarketScope = 'all' | 'india' | 'forex' | 'crypto';

const SCOPE_TIPS: Record<MarketScope, string> = {
  all: 'Poora multi-market overview — India, Forex/Metals aur Crypto ek saath.',
  india: 'Sirf India equities & indices (NSE/BSE) — NIFTY, sectors, movers.',
  forex: 'Currency pairs aur metals (USDINR, EURUSD, Gold, etc.).',
  crypto: 'Major cryptocurrencies vs USDT — BTC, ETH aur alts.',
};

const BOX_TIPS = {
  nifty: 'NIFTY 50 — India ke top 50 stocks ka benchmark index. Live LTP aur din ka % badlav.',
  banknifty: 'BANK NIFTY — banking stocks ka index. F&O traders ke liye key benchmark.',
  usdinr: 'USD/INR — dollar vs rupee. Import/export aur FII flow ke mood ka signal.',
  btc: 'Bitcoin vs USDT — global crypto risk appetite ka leading pulse.',
  sentiment:
    'India Sentiment score — NIFTY move, PCR aur market breadth se estimated bias (0–100).',
  pcr: 'Put-Call Ratio (OI) — puts vs calls open interest. >1 aksar bullish hedge / pe buying hint.',
  eurusd: 'EUR/USD — dollar strength vs euro. Global FX mood ka common pair.',
  quick:
    'Seedha tools pe jaao — Option Chain, OI Intelligence, ya Global Markets page.',
  feed: 'Live WebSocket / reconnect status — ticks aur quotes yahan se refresh hote hain.',
  breadth: 'Advances vs Declines — kitne stocks up/down. Strong advance = bullish breadth.',
  bias: 'Live Bias — short India trade signals (BUY/SELL reason ke saath).',
  sectors: 'Sector Performance — aaj kis industry group mein zyada force hai.',
  gainers: 'Top Gainers — aaj % ke hisaab se sabse tez upar jaane wale stocks.',
  losers: 'Top Losers — aaj % ke hisaab se sabse tez neeche jaane wale stocks.',
  active: 'Most Active — volume / participation ke hisaab se sabse busy stocks.',
  indiaSec: 'India equities desk — indices, movers, breadth aur sector heatmap.',
  forexSec: 'Forex & metals tape — major pairs aur XAU (gold) live quotes.',
  cryptoSec: 'Crypto tape — major coins live vs USDT.',
  indexCard: 'Index LTP, din ka change, high/low aur volume snapshot.',
  quoteCard: 'Live price, day change, aur session high/low for this instrument.',
} as const;

const HIDDEN_INDEX_SYMBOLS = new Set(['NIFTYNXT50']);

const FOREX_WATCH = FOREX_WATCH_META;

const CRYPTO_WATCH = CRYPTO_WATCH_META;

const GLOBAL_QUOTE_SYMBOLS = [
  ...FOREX_WATCH.map((x) => x.symbol),
  ...CRYPTO_WATCH.map((x) => x.symbol),
];

const DASHBOARD_LIVE_SYMBOLS = [...new Set([...CORE_LIVE_SYMBOLS, ...GLOBAL_QUOTE_SYMBOLS])];

function sparklinePoints(base: number, current: number, len = 12): number[] {
  return Array.from({ length: len }, (_, i) =>
    Math.round((base + ((current - base) * i) / Math.max(len - 1, 1)) * 100) / 100,
  );
}

function quoteChangeEpsilon(price: number) {
  const p = Math.abs(price) || 0;
  if (p > 0 && p < 2) return 1e-6;
  if (p < 50) return 1e-4;
  return 0.01;
}

/** Merge live LTP with REST day metadata so FX/crypto % does not stick at 0. */
function resolveQuoteFields(symbol: string, rest?: MarketQuoteDto | null) {
  const live = getLiveQuote(symbol);
  const price = live?.price || rest?.price || 0;
  const prevClose =
    (live?.prevClose && live.prevClose > 0 ? live.prevClose : 0) ||
    (rest?.prevClose && rest.prevClose > 0 ? rest.prevClose : 0) ||
    0;
  const open = (live?.open && live.open > 0 ? live.open : 0) || rest?.open || price;
  const high = Math.max(live?.high || 0, rest?.high || 0, price);
  const lowCandidates = [live?.low, rest?.low].filter((n): n is number => typeof n === 'number' && n > 0);
  const low = lowCandidates.length ? Math.min(...lowCandidates, price || lowCandidates[0]) : price;

  let change = live?.change;
  let changePercent = live?.changePercent;

  if (prevClose > 0 && price > 0) {
    const diff = price - prevClose;
    const eps = quoteChangeEpsilon(price);
    if (
      Math.abs(diff) > eps &&
      (change == null ||
        changePercent == null ||
        (Math.abs(change) < eps && Math.abs(changePercent) < 0.0001))
    ) {
      change = diff;
      changePercent = (diff / prevClose) * 100;
    }
  }

  if (
    (change == null || changePercent == null || (change === 0 && changePercent === 0)) &&
    rest &&
    (rest.change !== 0 || rest.changePercent !== 0)
  ) {
    change = rest.change;
    changePercent = rest.changePercent;
  }

  return {
    price,
    change: change ?? 0,
    changePercent: changePercent ?? 0,
    high,
    low,
    prevClose: prevClose || price,
    open,
  };
}

function formatPrice(price: number, symbol: string) {
  if (!Number.isFinite(price) || price <= 0) return '—';
  if (symbol === 'BTC' || symbol === 'ETH') {
    return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (symbol.includes('JPY') || symbol === 'XAUUSD') {
    return price.toLocaleString('en-US', { maximumFractionDigits: 3 });
  }
  if (FOREX_WATCH.some((f) => f.symbol === symbol)) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 5,
    });
  }
  if (CRYPTO_WATCH.some((c) => c.symbol === symbol)) {
    return price.toLocaleString('en-US', { maximumFractionDigits: price < 1 ? 5 : 3 });
  }
  return price.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function MiniSparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 72;
  const h = 26;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="shrink-0 opacity-90">
      <polyline
        fill="none"
        stroke={positive ? '#34d399' : '#f87171'}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

function IndexCard({ index, delay }: { index: IndexData; delay: number }) {
  const isPositive = index.change >= 0;
  const spark = useMemo(
    () => sparklinePoints(index.prevClose || index.price, index.price),
    [index.prevClose, index.price],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.03 }}
      className="app-card p-3.5 h-full hover:border-[#d4af37]/25 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider dash-info-label">
            {index.symbol}
            <DashInfoTip tip={BOX_TIPS.indexCard} title={index.name || index.symbol} dense />
          </span>
          <p className="text-[9px] text-slate-600 truncate">{index.name}</p>
        </div>
        <MiniSparkline data={spark} positive={isPositive} />
      </div>
      <div className="text-lg font-bold text-white tabular-nums leading-tight">
        {index.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span
          className={`text-xs font-bold flex items-center gap-0.5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {isPositive ? '+' : ''}
          {index.changePercent.toFixed(2)}%
        </span>
        <span className="text-[10px] text-slate-500 tabular-nums">
          {isPositive ? '+' : ''}
          {index.change.toFixed(2)}
        </span>
      </div>
      <div className="mt-2 pt-2 border-t border-[#1a1f2e] flex justify-between text-[9px] text-slate-600">
        <span>
          H <span className="text-emerald-400/90">{index.high.toLocaleString('en-IN')}</span>
        </span>
        <span>
          L <span className="text-red-400/90">{index.low.toLocaleString('en-IN')}</span>
        </span>
        <span className="flex items-center gap-0.5">
          <Volume2 className="w-2.5 h-2.5" />
          {(index.volume / 1e6).toFixed(1)}M
        </span>
      </div>
    </motion.div>
  );
}

function QuoteCard({
  symbol,
  label,
  name,
  quote,
  delay,
  badge,
}: {
  symbol: string;
  label: string;
  name: string;
  quote?: MarketQuoteDto | null;
  delay: number;
  badge: string;
}) {
  const resolved = resolveQuoteFields(symbol, quote);
  const { price, change, changePercent, high, low, prevClose } = resolved;
  const isPositive = changePercent >= 0;
  const spark = useMemo(
    () => sparklinePoints(prevClose || price || 1, price || prevClose || 1),
    [prevClose, price],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.03 }}
      className="app-card p-3.5 h-full hover:border-[#d4af37]/25 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider dash-info-label">
              {label}
              <DashInfoTip tip={BOX_TIPS.quoteCard} title={name || label} dense />
            </span>
            <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded border border-[#1a1f2e] text-slate-500">
              {badge}
            </span>
          </div>
          <p className="text-[9px] text-slate-600 truncate">{name}</p>
        </div>
        <MiniSparkline data={spark} positive={isPositive} />
      </div>
      <div className="text-lg font-bold text-white tabular-nums leading-tight">
        {formatPrice(price, symbol)}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span
          className={`text-xs font-bold flex items-center gap-0.5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {isPositive ? '+' : ''}
          {changePercent.toFixed(2)}%
        </span>
        <span className="text-[10px] text-slate-500 tabular-nums">
          {isPositive ? '+' : ''}
          {change.toFixed(symbol.includes('JPY') || symbol === 'XAUUSD' ? 3 : 4)}
        </span>
      </div>
      <div className="mt-2 pt-2 border-t border-[#1a1f2e] flex justify-between text-[9px] text-slate-600">
        <span>
          H <span className="text-emerald-400/90">{formatPrice(high, symbol)}</span>
        </span>
        <span>
          L <span className="text-red-400/90">{formatPrice(low, symbol)}</span>
        </span>
      </div>
    </motion.div>
  );
}

function MoversPanel({
  stocks,
  type,
}: {
  stocks: StockData[];
  type: 'gainers' | 'losers' | 'active';
}) {
  const title = type === 'gainers' ? 'Top Gainers' : type === 'losers' ? 'Top Losers' : 'Most Active';
  const tip =
    type === 'gainers' ? BOX_TIPS.gainers : type === 'losers' ? BOX_TIPS.losers : BOX_TIPS.active;
  const Icon = type === 'gainers' ? TrendingUp : type === 'losers' ? TrendingDown : Flame;
  const accent =
    type === 'gainers' ? 'text-emerald-400' : type === 'losers' ? 'text-red-400' : 'text-orange-400';

  return (
    <div className="app-card p-3.5 h-full flex flex-col min-h-[280px]">
      <h3 className={`text-xs font-bold mb-2.5 flex items-center gap-1.5 ${accent}`}>
        <Icon className="w-3.5 h-3.5" />
        <DashInfoLabel tip={tip} title={title}>
          {title}
        </DashInfoLabel>
      </h3>
      <div className="space-y-0.5 flex-1">
        {stocks.slice(0, 6).map((stock, i) => (
          <div
            key={stock.symbol}
            className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-[#121520] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-slate-600 w-3.5 font-bold tabular-nums">{i + 1}</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-200">{stock.symbol}</div>
                <div className="text-[9px] text-slate-600 truncate">{stock.sector}</div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs font-bold text-slate-200 tabular-nums">
                ₹{stock.price.toLocaleString('en-IN')}
              </div>
              <div
                className={`text-[10px] font-semibold tabular-nums ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {stock.changePercent >= 0 ? '+' : ''}
                {stock.changePercent.toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectorGrid({ sectors }: { sectors: SectorHeatmapItem[] }) {
  const list = sectors.slice(0, 8);
  return (
    <div className="app-card p-3.5 h-full">
      <h3 className="text-xs font-bold text-[#d4af37] mb-2.5 flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5" />
        <DashInfoLabel tip={BOX_TIPS.sectors} title="Sector Performance">
          Sector Performance
        </DashInfoLabel>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {list.map((s) => (
          <div
            key={s.sector}
            className="px-2.5 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] min-w-0"
          >
            <div className="text-[10px] text-slate-400 font-medium truncate">{s.sector}</div>
            <div
              className={`text-sm font-bold tabular-nums ${s.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {s.changePercent >= 0 ? '+' : ''}
              {s.changePercent.toFixed(2)}%
            </div>
            <div className="text-[9px] text-slate-600">
              {s.advancers}↑ {s.decliners}↓
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function sortedQuotes(
  watch: readonly { symbol: string }[],
  map: Map<string, MarketQuoteDto>,
) {
  return [...watch]
    .map((w) => {
      const resolved = resolveQuoteFields(w.symbol, map.get(w.symbol));
      return {
        symbol: w.symbol,
        changePercent: resolved.changePercent,
        price: resolved.price,
      };
    })
    .filter((q) => q.price > 0)
    .sort((a, b) => b.changePercent - a.changePercent);
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [scope, setScope] = useState<MarketScope>('all');
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [gainers, setGainers] = useState<StockData[]>([]);
  const [losers, setLosers] = useState<StockData[]>([]);
  const [active, setActive] = useState<StockData[]>([]);
  const [breadth, setBreadth] = useState(getMarketBreadth());
  const [sectors, setSectors] = useState<SectorHeatmapItem[]>([]);
  const [globalQuotes, setGlobalQuotes] = useState<Map<string, MarketQuoteDto>>(new Map());
  const [lastSync, setLastSync] = useState(new Date());
  const [liveTick, setLiveTick] = useState(0);
  const [feedLabel, setFeedLabel] = useState('Connecting live…');

  const { connected, status } = useFyersWebSocket({
    symbols: DASHBOARD_LIVE_SYMBOLS,
    autoConnect: true,
  });

  const paintIndia = useCallback(() => {
    setIndices(getIndices());
    setGainers(getGainers(6));
    setLosers(getLosers(6));
    setActive(getMostActive(6));
    setBreadth(getMarketBreadth());
    setSectors(getSectorHeatmapData());
    setLastSync(new Date());
  }, []);

  const paintGlobalFromLive = useCallback(() => {
    setGlobalQuotes((prev) => {
      const next = new Map(prev);
      for (const sym of GLOBAL_QUOTE_SYMBOLS) {
        const live = getLiveQuote(sym);
        if (!live?.price) continue;
        const rest = prev.get(sym);
        const resolved = resolveQuoteFields(sym, rest);
        next.set(sym, {
          symbol: sym,
          price: resolved.price,
          change: resolved.change,
          changePercent: resolved.changePercent,
          open: resolved.open,
          high: resolved.high,
          low: resolved.low,
          prevClose: resolved.prevClose,
          volume: live.volume || rest?.volume || 0,
          source: 'live',
          lastUpdated: live.lastUpdated || new Date().toISOString(),
        });
      }
      return next;
    });
  }, []);

  const seedRestQuotes = useCallback(async () => {
    subscribeLiveSymbols(DASHBOARD_LIVE_SYMBOLS);
    const res = await fetchMarketQuotes(DASHBOARD_LIVE_SYMBOLS);
    if (!res?.quotes?.length) return;
    // Seed live store so websocket LTP ticks keep prevClose / day change
    const { applyStreamQuotes } = await import('../services/symbolLiveService');
    applyStreamQuotes(
      res.quotes.map((q) => ({
        symbol: q.symbol,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        open: q.open,
        high: q.high,
        low: q.low,
        prevClose: q.prevClose,
        volume: q.volume,
        lastUpdated: q.lastUpdated || new Date().toISOString(),
        source: q.source || 'rest',
      })),
    );
    const next = new Map<string, MarketQuoteDto>();
    for (const q of res.quotes) {
      if (q?.symbol) next.set(q.symbol.toUpperCase(), q);
    }
    setGlobalQuotes((prev) => {
      const merged = new Map(prev);
      for (const [k, v] of next) {
        const resolved = resolveQuoteFields(k, v);
        merged.set(k, {
          ...v,
          price: resolved.price || v.price,
          change: resolved.change,
          changePercent: resolved.changePercent,
          high: resolved.high,
          low: resolved.low,
          prevClose: resolved.prevClose,
          open: resolved.open,
        });
      }
      return merged;
    });
  }, []);

  // Boot live feed + keep Socket.IO warm
  useEffect(() => {
    startFyersSocketClient();
    subscribeLiveSymbols(DASHBOARD_LIVE_SYMBOLS);
    void refreshFnoLiveQuotesAsync().then(() => {
      paintIndia();
      paintGlobalFromLive();
    });
    void seedRestQuotes();

    const unsubStore = subscribeMarketLive(() => {
      paintIndia();
      paintGlobalFromLive();
      setLiveTick((n) => n + 1);
      setLastSync(new Date());
    });

    return () => {
      unsubStore();
    };
  }, [paintIndia, paintGlobalFromLive, seedRestQuotes]);

  useEffect(() => {
    if (connected) {
      setFeedLabel('Live');
      paintIndia();
      paintGlobalFromLive();
    } else if (status === 'connecting' || status === 'reconnecting') {
      setFeedLabel('Reconnecting…');
    } else if (getLiveQuote('NIFTY')?.price || getLiveQuote('BTC')?.price) {
      // REST seed may succeed before Socket.IO finishes connecting
      setFeedLabel('Live (REST)');
      paintIndia();
      paintGlobalFromLive();
    } else {
      setFeedLabel(status === 'connected' ? 'Live' : 'Live feed starting…');
    }
  }, [connected, status, paintIndia, paintGlobalFromLive, liveTick]);

  // Soft REST reseed (does not block UI) — ticks drive real-time
  useAutoRefresh(() => {
    paintIndia();
    paintGlobalFromLive();
    void seedRestQuotes();
  });

  // Force QuoteCard re-read of getLiveQuote when store ticks
  void liveTick;

  const visibleIndices = useMemo(
    () => indices.filter((i) => !HIDDEN_INDEX_SYMBOLS.has(i.symbol)),
    [indices],
  );

  const oiSnap = useMemo(() => {
    const niftyIx = indices.find((i) => i.symbol === 'NIFTY');
    const spot = niftyIx?.price ?? 24580;
    const chain = getOptionChain('NIFTY', spot);
    const maxPain = calculateMaxPain(chain);
    const ceOi = chain.reduce((s, r) => s + r.ceOi, 0);
    const peOi = chain.reduce((s, r) => s + r.peOi, 0);
    const pcr = peOi / Math.max(ceOi, 1);
    const intel = getOIIntelligence('NIFTY');
    const fut = getFuturesOIData().find((f) => f.symbol === 'NIFTY');
    const signals = getSignals().filter((s) => s.signal !== 'HOLD').slice(0, 4);
    return { pcr, maxPain: maxPain.maxPainStrike, intel, fut, signals, ceOi, peOi };
  }, [indices, liveTick]);

  const nifty = indices.find((i) => i.symbol === 'NIFTY');
  const bankNifty = indices.find((i) => i.symbol === 'BANKNIFTY');
  const btc = resolveQuoteFields('BTC', globalQuotes.get('BTC'));
  const eurusd = resolveQuoteFields('EURUSD', globalQuotes.get('EURUSD'));
  const usdinr = resolveQuoteFields('USDINR', globalQuotes.get('USDINR'));

  const pcrBias = oiSnap.pcr > 1.05 ? 'Bullish' : oiSnap.pcr < 0.95 ? 'Bearish' : 'Neutral';
  const sentimentScore = Math.round(
    50 +
      (nifty?.changePercent ?? 0) * 8 +
      (oiSnap.pcr > 1 ? 10 : -10) +
      (breadth.advances > breadth.declines ? 8 : -8),
  );
  const clampedSentiment = Math.max(0, Math.min(100, sentimentScore));
  const breadthTotal = Math.max(1, breadth.advances + breadth.declines + breadth.unchanged);

  const forexSorted = useMemo(
    () => sortedQuotes(FOREX_WATCH, globalQuotes),
    [globalQuotes, lastSync],
  );
  const cryptoSorted = useMemo(
    () => sortedQuotes(CRYPTO_WATCH, globalQuotes),
    [globalQuotes, lastSync],
  );

  const showIndia = scope === 'all' || scope === 'india';
  const showForex = scope === 'all' || scope === 'forex';
  const showCrypto = scope === 'all' || scope === 'crypto';

  return (
    <div className="space-y-3 pb-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-[#1a1f2e] bg-gradient-to-br from-[#121520] via-[#0b0e17] to-[#0a0c14] p-4 sm:p-5">
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#d4af37]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

        <div className="relative flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4af37]">
                  {BRAND}
                </span>
                <span className="text-[10px] text-slate-500">Multi-market pulse</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                    connected
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'border-gold/30 bg-gold/10 text-gold'
                  }`}
                >
                  {feedLabel}
                  <DashInfoTip tip={BOX_TIPS.feed} title="Live feed" dense />
                </span>
                <span className="text-[10px] text-slate-600">
                  Updated{' '}
                  {lastSync.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-white">Market Dashboard</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                India equities · Forex & metals · Crypto — live overview
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ['all', 'All Markets', Globe2],
                  ['india', 'India', IndianRupee],
                  ['forex', 'Forex', Activity],
                  ['crypto', 'Crypto', Bitcoin],
                ] as const
              ).map(([id, label, Icon]) => (
                <span key={id} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setScope(id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide border transition-colors ${
                      scope === id
                        ? 'bg-[#d4af37] text-[#0b0e17] border-[#d4af37]'
                        : 'bg-[#121520] text-slate-400 border-[#1a1f2e] hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                  <DashInfoTip tip={SCOPE_TIPS[id]} title={label} dense />
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3">
              <div className="text-[9px] uppercase text-slate-500 font-semibold dash-info-label">
                NIFTY 50
                <DashInfoTip tip={BOX_TIPS.nifty} title="NIFTY 50" dense />
              </div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">
                {nifty ? nifty.price.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}
              </div>
              <div
                className={`text-xs font-bold mt-0.5 ${(nifty?.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {nifty
                  ? `${nifty.changePercent >= 0 ? '+' : ''}${nifty.changePercent.toFixed(2)}%`
                  : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3">
              <div className="text-[9px] uppercase text-slate-500 font-semibold dash-info-label">
                BANK NIFTY
                <DashInfoTip tip={BOX_TIPS.banknifty} title="BANK NIFTY" dense />
              </div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">
                {bankNifty
                  ? bankNifty.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                  : '—'}
              </div>
              <div
                className={`text-xs font-bold mt-0.5 ${(bankNifty?.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {bankNifty
                  ? `${bankNifty.changePercent >= 0 ? '+' : ''}${bankNifty.changePercent.toFixed(2)}%`
                  : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3">
              <div className="text-[9px] uppercase text-slate-500 font-semibold dash-info-label">
                USD / INR
                <DashInfoTip tip={BOX_TIPS.usdinr} title="USD / INR" dense />
              </div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">
                {formatPrice(usdinr.price, 'USDINR')}
              </div>
              <div
                className={`text-xs font-bold mt-0.5 ${usdinr.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {usdinr.price > 0
                  ? `${usdinr.changePercent >= 0 ? '+' : ''}${usdinr.changePercent.toFixed(2)}%`
                  : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3">
              <div className="text-[9px] uppercase text-slate-500 font-semibold dash-info-label">
                BTC / USDT
                <DashInfoTip tip={BOX_TIPS.btc} title="BTC / USDT" dense />
              </div>
              <div className="text-xl font-bold text-white tabular-nums mt-1">
                {formatPrice(btc.price, 'BTC')}
              </div>
              <div
                className={`text-xs font-bold mt-0.5 ${btc.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {btc.price > 0
                  ? `${btc.changePercent >= 0 ? '+' : ''}${btc.changePercent.toFixed(2)}%`
                  : '—'}
              </div>
            </div>
          </div>

          {showIndia ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3 flex flex-col justify-between min-h-[100px]">
                <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                  <Zap className="w-3 h-3 text-[#d4af37]" />
                  <DashInfoLabel tip={BOX_TIPS.sentiment} title="India Sentiment">
                    India Sentiment
                  </DashInfoLabel>
                </div>
                <div className="text-2xl font-bold text-[#d4af37] tabular-nums">
                  {clampedSentiment}%
                </div>
                <div className="h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden mt-1">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${clampedSentiment}%` }}
                    className="h-full bg-gradient-to-r from-red-500 via-[#d4af37] to-emerald-500 rounded-full"
                  />
                </div>
              </div>
              <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3 flex flex-col justify-between min-h-[100px]">
                <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold dash-info-label">
                  PCR (OI)
                  <DashInfoTip tip={BOX_TIPS.pcr} title="PCR (OI)" dense />
                </div>
                <div
                  className={`text-2xl font-bold tabular-nums ${oiSnap.pcr > 1 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {oiSnap.pcr.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-400 font-semibold">{pcrBias}</div>
              </div>
              <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3 flex flex-col justify-between min-h-[100px]">
                <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold dash-info-label">
                  EUR / USD
                  <DashInfoTip tip={BOX_TIPS.eurusd} title="EUR / USD" dense />
                </div>
                <div className="text-xl font-bold text-white tabular-nums">
                  {formatPrice(eurusd?.price ?? 0, 'EURUSD')}
                </div>
                <div
                  className={`text-[10px] font-semibold ${(eurusd?.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {eurusd
                    ? `${eurusd.changePercent >= 0 ? '+' : ''}${eurusd.changePercent.toFixed(2)}%`
                    : 'Forex'}
                </div>
              </div>
              <div className="rounded-lg bg-[#121520]/80 border border-[#1a1f2e] p-3 flex flex-col justify-between min-h-[100px] gap-2">
                <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold dash-info-label">
                  Quick links
                  <DashInfoTip tip={BOX_TIPS.quick} title="Quick links" dense />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onNavigate?.('optionchain')}
                    className="text-[10px] font-bold px-2 py-1 rounded border border-[#d4af37]/30 text-[#d4af37] hover:bg-[#d4af37]/10"
                  >
                    Option Chain
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('oiintelligence')}
                    className="text-[10px] font-bold px-2 py-1 rounded border border-[#1a1f2e] text-slate-300 hover:bg-[#121520]"
                  >
                    AI Intelligence
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate?.('global')}
                    className="text-[10px] font-bold px-2 py-1 rounded border border-[#1a1f2e] text-slate-300 hover:bg-[#121520]"
                  >
                    Global
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* India */}
      {showIndia ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-0.5">
            <IndianRupee className="w-4 h-4 text-[#d4af37]" />
            <h2 className="text-sm font-bold text-white">
              <DashInfoLabel tip={BOX_TIPS.indiaSec} title="India · NSE / BSE">
                India · NSE / BSE
              </DashInfoLabel>
            </h2>
          </div>
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
          >
            {visibleIndices.map((index, i) => (
              <IndexCard key={index.symbol} index={index} delay={i} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <MoversPanel stocks={gainers} type="gainers" />
              <MoversPanel stocks={losers} type="losers" />
              <MoversPanel stocks={active} type="active" />
            </div>

            <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
              <div className="app-card p-3.5 h-full min-h-[160px]">
                <h3 className="text-xs font-bold text-[#d4af37] mb-2.5 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" />
                  <DashInfoLabel tip={BOX_TIPS.breadth} title="Market Breadth">
                    Market Breadth
                  </DashInfoLabel>
                </h3>
                <div className="space-y-2">
                  {[
                    { label: 'Advances', value: breadth.advances, color: 'bg-emerald-500' },
                    { label: 'Declines', value: breadth.declines, color: 'bg-red-500' },
                    { label: 'Unchanged', value: breadth.unchanged, color: 'bg-slate-500' },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                        <span>{item.label}</span>
                        <span className="text-slate-300 tabular-nums font-semibold">
                          {item.value}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#1a1f2e] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(item.value / breadthTotal) * 100}%` }}
                          className={`${item.color} h-full rounded-full`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="app-card p-3.5 h-full min-h-[160px]">
                <h3 className="text-xs font-bold text-emerald-400 mb-2.5">
                  <DashInfoLabel tip={BOX_TIPS.bias} title="Live Bias">
                    Live Bias
                  </DashInfoLabel>
                </h3>
                {oiSnap.signals.length > 0 ? (
                  <div className="space-y-1">
                    {oiSnap.signals.map((s) => {
                      const isBullish = s.signal === 'BUY';
                      return (
                        <div
                          key={s.symbol}
                          className="py-1.5 px-2 rounded-md bg-[#121520] border border-[#1a1f2e]"
                        >
                          <div className="flex justify-between text-xs gap-2">
                            <span className="font-bold text-slate-200">{s.symbol}</span>
                            <span
                              className={
                                isBullish ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'
                              }
                            >
                              {isBullish ? 'BULLISH' : 'BEARISH'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-600 truncate mt-0.5">
                            {s.reason}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 leading-relaxed py-6 text-center">
                    No strong India bias right now — wait-and-watch.
                  </p>
                )}
              </div>
            </div>
          </div>

          <SectorGrid sectors={sectors} />
        </section>
      ) : null}

      {/* Forex */}
      {showForex ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold text-white">
                <DashInfoLabel tip={BOX_TIPS.forexSec} title="Forex & Metals">
                  Forex & Metals
                </DashInfoLabel>
              </h2>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className="px-2 py-1 rounded border border-[#1a1f2e] text-slate-400">
                Top{' '}
                <span className="text-emerald-400 font-bold">
                  {forexSorted[0]?.symbol ?? '—'}{' '}
                  {forexSorted[0]
                    ? `${forexSorted[0].changePercent >= 0 ? '+' : ''}${forexSorted[0].changePercent.toFixed(2)}%`
                    : ''}
                </span>
              </span>
              <span className="px-2 py-1 rounded border border-[#1a1f2e] text-slate-400">
                Weak{' '}
                <span className="text-red-400 font-bold">
                  {forexSorted.at(-1)?.symbol ?? '—'}{' '}
                  {forexSorted.at(-1)
                    ? `${forexSorted.at(-1)!.changePercent >= 0 ? '+' : ''}${forexSorted.at(-1)!.changePercent.toFixed(2)}%`
                    : ''}
                </span>
              </span>
            </div>
          </div>
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
          >
            {FOREX_WATCH.map((item, i) => (
              <QuoteCard
                key={item.symbol}
                symbol={item.symbol}
                label={item.label}
                name={item.name}
                quote={globalQuotes.get(item.symbol)}
                delay={i}
                badge="FX"
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Crypto */}
      {showCrypto ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-2">
              <Bitcoin className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-bold text-white">
                <DashInfoLabel tip={BOX_TIPS.cryptoSec} title="Crypto">
                  Crypto
                </DashInfoLabel>
              </h2>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className="px-2 py-1 rounded border border-[#1a1f2e] text-slate-400">
                Leaders{' '}
                <span className="text-emerald-400 font-bold">
                  {cryptoSorted
                    .slice(0, 3)
                    .map((c) => c.symbol)
                    .join(' · ') || '—'}
                </span>
              </span>
            </div>
          </div>
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
          >
            {CRYPTO_WATCH.map((item, i) => (
              <QuoteCard
                key={item.symbol}
                symbol={item.symbol}
                label={item.label}
                name={item.name}
                quote={globalQuotes.get(item.symbol)}
                delay={i}
                badge="CRYPTO"
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
