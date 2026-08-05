import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ChevronLeft, ChevronRight, Crown, LogOut, Bot,
  GraduationCap, NotebookPen, Code2, Wallet,
} from 'lucide-react';
import type { User } from '../hooks/useAuth';
import { BRAND, PAGE_NAMES } from '../constants/brandLabels';
import { SHOW_INDICATORS } from '../constants/featureFlags';
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
  { id: 'wolf-ai', label: PAGE_NAMES['wolf-ai'], icon: Bot },
  { id: 'mentor-ai', label: PAGE_NAMES['mentor-ai'], icon: GraduationCap },
  ...(SHOW_INDICATORS
    ? [{ id: 'indicators', label: PAGE_NAMES.indicators, icon: Code2 }]
    : []),
  { id: 'papertrading', label: PAGE_NAMES.papertrading, icon: Wallet },
  { id: 'tradingjournal', label: PAGE_NAMES.tradingjournal, icon: NotebookPen },
];

const navIdle =
  'text-[var(--tf-text)] hover:text-[var(--tf-text)] hover:bg-[var(--tf-elevated)]';
const navActive = 'bg-gold/10 text-gold';

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
      className={`app-sidebar fixed left-0 top-0 h-screen glass border-r border-[var(--tf-border)] z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="h-14 flex items-center px-3 border-b border-[var(--tf-border)] shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
          {collapsed ? (
            <BrandMark size="sm" iconOnly />
          ) : (
            <BrandMark size="sm" nameClassName="truncate app-sidebar__brand" />
          )}
          {collapsed ? <span className="sr-only">{BRAND}</span> : null}
        </div>
        <button
          onClick={onToggle}
          className="ml-auto p-1.5 text-[var(--tf-text-secondary)] hover:text-gold transition-colors rounded-lg hover:bg-[var(--tf-elevated)] hidden lg:block"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        <div className="app-sidebar__section px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.35em]">
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
              className={`app-sidebar__link relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group ${
                isActive ? navActive : navIdle
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
                  className="app-sidebar__tip absolute left-full ml-2 px-2.5 py-1.5 bg-[var(--tf-elevated)] border border-[var(--tf-border)] rounded-lg text-xs text-[var(--tf-text)] whitespace-nowrap z-50 shadow-xl"
                >
                  {item.label}
                </motion.div>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-[var(--tf-border)] shrink-0 space-y-1">
        {user?.role === 'admin' && (
          <button
            onClick={() => {
              onTabChange('admin');
              onMobileClose?.();
            }}
            className={`app-sidebar__link w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'admin' ? navActive : navIdle
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
          onClick={() => {
            onTabChange('subscription');
            onMobileClose?.();
          }}
          className={`app-sidebar__link w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'subscription' ? navActive : navIdle
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
            className={`app-sidebar__link w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${navIdle} hover:text-gold`}
          >
            <div className="w-[18px] h-[18px] rounded-full bg-gold/20 flex items-center justify-center shrink-0 overflow-hidden">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-bold text-gold">{user.name[0]?.toUpperCase()}</span>
              )}
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
          className={`app-sidebar__link w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${navIdle} hover:text-red-400 hover:bg-red-500/5`}
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
