import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ChevronLeft, ChevronRight, Crown, LogOut, Bot,
  NotebookPen, Code2,
} from 'lucide-react';
import type { User } from '../hooks/useAuth';
import { BRAND, PAGE_NAMES } from '../constants/brandLabels';
import BrandMark from './BrandMark';

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
  { id: 'trafi', label: PAGE_NAMES.trafi, icon: Bot },
  { id: 'indicators', label: PAGE_NAMES.indicators, icon: Code2 },
  { id: 'tradingjournal', label: PAGE_NAMES.tradingjournal, icon: NotebookPen },
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
      animate={{ width: collapsed ? 64 : 280 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className={`fixed left-0 top-0 h-screen glass border-r z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="h-16 flex items-center px-4 border-b border-white/[0.08] shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
          {collapsed ? (
            <BrandMark size="sm" iconOnly />
          ) : (
            <BrandMark size="sm" nameClassName="tracking-[0.08em] text-[1.15rem]" />
          )}
          {collapsed ? <span className="sr-only">{BRAND}</span> : null}
        </div>
        <button
          onClick={onToggle}
          className="ml-auto p-1.5 text-zinc-500 hover:text-[#e8d48b] transition-colors rounded-lg hover:bg-white/[0.04] hidden lg:block"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 py-3 px-2.5 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-600">
          Menu
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
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[0.9rem] font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-[rgba(201,162,39,0.12)] text-[#e8d48b]'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#e8d48b] rounded-r-full"
                  transition={{ duration: 0.2 }}
                />
              )}
              <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[#e8d48b]' : ''}`} />
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
