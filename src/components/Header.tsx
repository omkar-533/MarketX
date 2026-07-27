import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Clock, Menu } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import type { User } from '../hooks/useAuth';
import { BRAND } from '../constants/brandLabels';
import BrandMark from './BrandMark';

interface HeaderProps {
  sidebarCollapsed: boolean;
  user: User | null;
  onProfile: () => void;
  onMenuClick?: () => void;
  className?: string;
}

export default function Header({ user, onProfile, onMenuClick, className = '' }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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

      <div className="shrink-0 min-w-0 max-w-[58vw] sm:max-w-[280px] md:max-w-none mr-auto" title={BRAND}>
        <BrandMark size="sm" nameClassName="truncate text-[1.05rem] sm:text-[1.2rem]" />
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
