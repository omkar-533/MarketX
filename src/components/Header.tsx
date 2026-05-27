import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Bell, Wifi, WifiOff, X, TrendingUp, TrendingDown, Clock, Menu } from 'lucide-react';
import { getIndices, getStocks, type IndexData, type StockData } from '../data/marketData';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useAutoRefreshMeta } from '../context/AutoRefreshContext';
import ThemeToggle from './ThemeToggle';
import MarketLiveBadge from './MarketLiveBadge';
import type { User } from '../hooks/useAuth';

interface HeaderProps {
  sidebarCollapsed: boolean;
  user: User | null;
  onProfile: () => void;
  onMenuClick?: () => void;
  className?: string;
}

export default function Header({ user, onProfile, onMenuClick, className = '' }: HeaderProps) {
  const [indices, setIndices] = useState<IndexData[]>(getIndices());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [stocks] = useState<StockData[]>(getStocks());
  const { tick } = useAutoRefreshMeta();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showNotifications, setShowNotifications] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useAutoRefresh(() => {
    setIndices(getIndices());
  });

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredStocks =
    searchQuery.length > 0
      ? stocks.filter(
          (s) =>
            s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : [];

  return (
    <header
      className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 border-b border-dark-border/60 ${className}`}
    >
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-1 text-slate-400 hover:text-gold rounded-lg hover:bg-dark-border/60 shrink-0"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Ticker — hidden on small screens */}
      <div className="hidden md:flex items-center gap-4 lg:gap-5 overflow-hidden mr-auto min-w-0">
        {indices.slice(0, 4).map((idx) => (
          <motion.div
            key={idx.symbol}
            className="flex items-center gap-2 shrink-0"
            initial={false}
            animate={{ x: [0, -1, 0] }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-[10px] font-bold text-slate-500 uppercase">{idx.symbol}</span>
            <span className="text-sm font-bold text-slate-200 tabular-nums">
              {idx.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span
              className={`flex items-center gap-0.5 text-[10px] font-bold ${idx.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {idx.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {idx.change >= 0 ? '+' : ''}
              {idx.changePercent}%
            </span>
          </motion.div>
        ))}
      </div>

      {/* Mobile: compact NIFTY */}
      <div className="md:hidden flex items-center gap-2 mr-auto min-w-0">
        {indices[0] && (
          <>
            <span className="text-[10px] font-bold text-slate-500">NIFTY</span>
            <span className="text-xs font-bold text-slate-200 tabular-nums truncate">
              {indices[0].price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
            <span className={`text-[10px] font-bold ${indices[0].change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {indices[0].change >= 0 ? '+' : ''}
              {indices[0].changePercent}%
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div ref={searchRef} className="relative hidden sm:block">
          <div
            className={`flex items-center bg-dark-elevated border rounded-lg transition-all duration-200 ${
              searchOpen ? 'border-gold/50 w-48 md:w-64' : 'border-dark-border w-36 md:w-48'
            }`}
          >
            <Search className="w-4 h-4 text-slate-600 ml-2.5 shrink-0" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              className="bg-transparent text-sm text-slate-200 placeholder-slate-600 px-2 py-2 w-full focus:outline-none min-w-0"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchOpen(false);
                }}
                className="p-1 mr-1 text-slate-600 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <AnimatePresence>
            {searchOpen && filteredStocks.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="absolute top-full right-0 mt-1 w-72 max-w-[calc(100vw-2rem)] bg-dark-elevated border border-dark-border rounded-lg shadow-2xl overflow-hidden z-50"
              >
                {filteredStocks.slice(0, 8).map((stock) => (
                  <button
                    key={stock.symbol}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-dark-border transition-colors text-left"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-200">{stock.symbol}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{stock.name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-slate-200">₹{stock.price}</div>
                      <div
                        className={`text-xs font-semibold ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      >
                        {stock.changePercent >= 0 ? '+' : ''}
                        {stock.changePercent}%
                      </div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <MarketLiveBadge />
        <div
          className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
            tick > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {tick > 0 ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span>{tick > 0 ? 'Synced' : 'Sync…'}</span>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          <span className="tabular-nums">{currentTime.toLocaleTimeString('en-IN')}</span>
        </div>

        <ThemeToggle />

        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-slate-500 hover:text-gold transition-colors rounded-lg hover:bg-dark-border/60"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-gold rounded-full" />
          </button>
          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1.5rem)] bg-dark-elevated border border-dark-border rounded-xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="p-3 border-b border-dark-border">
                  <span className="text-sm font-bold text-slate-200">Notifications</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {[
                    'NIFTY crossed 24600',
                    'RELIANCE volume spike detected',
                    'BANKNIFTY PCR turned bullish',
                    'Your price alert triggered for INFY',
                  ].map((n, i) => (
                    <div
                      key={i}
                      className="px-3 py-2.5 hover:bg-dark-border transition-colors border-b border-dark-border/50"
                    >
                      <div className="text-xs text-slate-300">{n}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{i + 1} min ago</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {user && (
          <button
            onClick={onProfile}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-dark-border/60 transition-colors"
          >
            <div className="w-7 h-7 bg-gold/20 rounded-full flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-gold">{user.name[0]?.toUpperCase()}</span>
            </div>
            <span className="hidden lg:block text-xs text-slate-300 font-medium max-w-[100px] truncate">
              {user.name}
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
