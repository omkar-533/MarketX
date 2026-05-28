import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, CandlestickChart, Layers, PieChart, Zap, ScanLine,
  Globe, Bell, Bookmark, Wallet, Newspaper,
  Shield, ChevronLeft, ChevronRight, Crown, LogOut, Activity, Bot, BarChart3,
  NotebookPen, Calculator, Briefcase,
} from 'lucide-react';
import type { User } from '../hooks/useAuth';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  user: User | null;
  onLogout: () => void;
  onProfile: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tradingjournal', label: 'Trading Journal', icon: NotebookPen },
  { id: 'chart', label: 'Pro Charts', icon: CandlestickChart },
  { id: 'optionchain', label: 'Option Chain', icon: Layers },
  { id: 'optionsimulator', label: 'Option Simulator', icon: Calculator },
  { id: 'oiintelligence', label: 'OI Intelligence', icon: Activity },
  { id: 'footprint', label: 'Footprint Chart', icon: BarChart3 },
  { id: 'futures', label: 'Futures Analytics', icon: Activity },
  { id: 'strategy', label: 'Strategy Builder', icon: Zap },
  { id: 'papertrading', label: 'Paper Trading', icon: Wallet },
  { id: 'heatmap', label: 'Heatmap', icon: PieChart },
  { id: 'scanner', label: 'Scanners', icon: ScanLine },
  { id: 'master-tx', label: 'Master TX', icon: Crown },
  { id: 'trafi', label: 'Master AI', icon: Bot },
  { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
  { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'global', label: 'Global', icon: Globe },
];

export default function Sidebar({
  activeTab,
  onTabChange,
  collapsed,
  onToggle,
  mobileOpen = false,
  onMobileClose,
  user,
  onLogout,
  onProfile,
}: SidebarProps) {
  const [hovered, setHovered] = useState('');

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className={`fixed left-0 top-0 h-screen glass border-r border-dark-border/60 z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="h-14 flex items-center px-3 border-b border-dark-border/60 shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 bg-gold rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-gold/20">
            <Crown className="w-4 h-4 text-dark-surface" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <div className="text-sm font-bold text-gold whitespace-nowrap">Master</div>
                <div className="text-[9px] text-slate-500 -mt-0.5 whitespace-nowrap tracking-wider font-bold">TradeX</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={onToggle}
          className="ml-auto p-1.5 text-slate-500 hover:text-gold transition-colors rounded-lg hover:bg-dark-border/60 hidden lg:block"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.35em] text-slate-600">
          Core Features
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onTabChange(item.id);
                onMobileClose?.();
              }}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered('')}
              className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-gold/10 text-gold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-dark-border/60'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-gold rounded-r-full"
                  transition={{ duration: 0.2 }}
                />
              )}
              <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-gold' : ''}`} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {collapsed && hovered === item.id && (
                <motion.div
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="absolute left-full ml-2 px-2.5 py-1.5 bg-dark-elevated border border-dark-border rounded-lg text-xs text-slate-200 whitespace-nowrap z-50 shadow-xl"
                >
                  {item.label}
                </motion.div>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-dark-border/60 shrink-0 space-y-1">
        {user?.role === 'admin' && (
          <button
            onClick={() => onTabChange('admin')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'admin'
                ? 'bg-gold/10 text-gold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-dark-border/60'
            }`}
          >
            <Shield className="w-[18px] h-[18px] shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                  Admin Panel
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}
        <button
          onClick={() => onTabChange('subscription')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'subscription'
              ? 'bg-gold/10 text-gold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-dark-border/60'
          }`}
        >
          <Crown className="w-[18px] h-[18px] shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                {user?.plan === 'premium' ? 'Premium' : user?.plan === 'pro' ? 'Pro' : 'Upgrade'}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        {user && (
          <button
            onClick={onProfile}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-gold hover:bg-gold/5 transition-all"
          >
            <div className="w-[18px] h-[18px] rounded-full bg-gold/20 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-gold">{user.name[0]?.toUpperCase()}</span>
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap truncate">
                  {user.name}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                Logout
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
