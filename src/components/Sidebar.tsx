import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ChevronLeft, ChevronRight, Crown, LogOut,
  NotebookPen, Code2, Wallet, CandlestickChart,
  Layers, Brain, LayoutDashboard, Radar, Activity, Bookmark, Crosshair,
} from 'lucide-react';
import type { User } from '../hooks/useAuth';
import { BRAND, PAGE_NAMES } from '../constants/brandLabels';
import {
  SHOW_DASHBOARD,
  SHOW_INDICATORS,
  SHOW_OI_INTELLIGENCE,
  SHOW_OPTION_CHAIN,
  SHOW_PAPER_TRADING,
  SHOW_TERMINAL,
} from '../constants/featureFlags';
import BrandMark from './BrandMark';
import AppLink from './AppLink';

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

const productNavItems = [
  ...(SHOW_DASHBOARD
    ? [{ id: 'dashboard', label: PAGE_NAMES.dashboard, icon: LayoutDashboard }]
    : []),
  { id: 'wolf-opportunity', label: PAGE_NAMES['wolf-opportunity'], icon: Crosshair },
  { id: 'wolf-radar', label: PAGE_NAMES['wolf-radar'], icon: Radar },
  { id: 'live-wolf', label: PAGE_NAMES['live-wolf'], icon: Activity },
  ...(SHOW_TERMINAL ? [{ id: 'terminal', label: PAGE_NAMES.terminal, icon: CandlestickChart }] : []),
  ...(SHOW_OPTION_CHAIN
    ? [{ id: 'optionchain', label: PAGE_NAMES.optionchain, icon: Layers }]
    : []),
  ...(SHOW_OI_INTELLIGENCE
    ? [{ id: 'oiintelligence', label: PAGE_NAMES.oiintelligence, icon: Brain }]
    : []),
  ...(SHOW_INDICATORS
    ? [{ id: 'indicators', label: PAGE_NAMES.indicators, icon: Code2 }]
    : []),
  ...(SHOW_PAPER_TRADING
    ? [{ id: 'papertrading', label: PAGE_NAMES.papertrading, icon: Wallet }]
    : []),
  { id: 'tradingjournal', label: PAGE_NAMES.tradingjournal, icon: NotebookPen },
  { id: 'watchlist', label: PAGE_NAMES.watchlist, icon: Bookmark },
];

function linkActive(activeTab: string, id: string) {
  if (id === 'wolf-radar') return activeTab === 'wolf-radar' || activeTab === 'strategy-lab';
  return activeTab === id;
}

function NavLink({
  item,
  activeTab,
  collapsed,
  hovered,
  setHovered,
  onTabChange,
  onMobileClose,
}: {
  item: (typeof productNavItems)[number];
  activeTab: string;
  collapsed: boolean;
  hovered: string;
  setHovered: (id: string) => void;
  onTabChange: (tab: string) => void;
  onMobileClose?: () => void;
}) {
  const Icon = item.icon;
  const isActive = linkActive(activeTab, item.id);
  return (
    <AppLink
      to={item.id}
      onActivate={() => {
        onTabChange(item.id);
        onMobileClose?.();
      }}
      onMouseEnter={() => setHovered(item.id)}
      onMouseLeave={() => setHovered('')}
      className={`app-sidebar__link wolf-side-lux__link relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium group${
        isActive ? ' is-on' : ''
      }`}
    >
      <span className="wolf-side-lux__shine" aria-hidden />
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="wolf-side-lux__rail"
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <Icon className="wolf-side-lux__ico w-[18px] h-[18px] shrink-0" />
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
          className="app-sidebar__tip wolf-side-lux__tip absolute left-full ml-2 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap z-50"
        >
          {item.label}
        </motion.div>
      )}
    </AppLink>
  );
}

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
      animate={{ width: collapsed ? 64 : 232 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className={`app-sidebar wolf-side-lux fixed left-0 top-0 h-screen z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="wolf-side-lux__stage" aria-hidden>
        <div className="wolf-side-lux__fog" />
        <i className="wolf-side-lux__orb wolf-side-lux__orb--a" />
        <i className="wolf-side-lux__orb wolf-side-lux__orb--b" />
        <span className="wolf-side-lux__scan" />
        <span className="wolf-side-lux__edge" />
      </div>

      <div className="wolf-side-lux__head h-14 flex items-center px-3 shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
          {collapsed ? (
            <BrandMark size="sm" iconOnly />
          ) : (
            <BrandMark size="sm" nameClassName="truncate app-sidebar__brand" />
          )}
          {collapsed ? <span className="sr-only">{BRAND}</span> : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="wolf-side-lux__fold ml-auto p-1.5 rounded-lg hidden lg:block"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="wolf-side-lux__nav flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        <div className="app-sidebar__section wolf-side-lux__section px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.35em]">
          {collapsed ? '·' : 'Product'}
        </div>
        {productNavItems.map((item) => (
          <NavLink
            key={item.id}
            item={item}
            activeTab={activeTab}
            collapsed={collapsed}
            hovered={hovered}
            setHovered={setHovered}
            onTabChange={onTabChange}
            onMobileClose={onMobileClose}
          />
        ))}
      </nav>

      <div className="wolf-side-lux__foot p-2 shrink-0 space-y-1">
        <div className="app-sidebar__section wolf-side-lux__section px-3 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-[0.35em]">
          {collapsed ? '·' : 'Account'}
        </div>
        {(user?.role === 'admin' || user?.role === 'subadmin') && (
          <AppLink
            to="admin"
            onActivate={() => {
              onTabChange('admin');
              onMobileClose?.();
            }}
            className={`app-sidebar__link wolf-side-lux__link w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium relative${
              activeTab === 'admin' ? ' is-on' : ''
            }`}
          >
            <span className="wolf-side-lux__shine" aria-hidden />
            <Shield className="wolf-side-lux__ico w-[18px] h-[18px] shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                  Admin Panel
                </motion.span>
              )}
            </AnimatePresence>
          </AppLink>
        )}
        <AppLink
          to="subscription"
          onActivate={() => {
            onTabChange('subscription');
            onMobileClose?.();
          }}
          className={`app-sidebar__link wolf-side-lux__link w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium relative${
            activeTab === 'subscription' ? ' is-on' : ''
          }`}
        >
          <span className="wolf-side-lux__shine" aria-hidden />
          <Crown className="wolf-side-lux__ico w-[18px] h-[18px] shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                {user?.plan === 'premium' ? 'Premium' : user?.plan === 'pro' ? 'Pro' : 'Upgrade'}
              </motion.span>
            )}
          </AnimatePresence>
        </AppLink>
        {user && (
          <button
            type="button"
            onClick={onProfile}
            className="app-sidebar__link wolf-side-lux__link w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium relative"
          >
            <span className="wolf-side-lux__shine" aria-hidden />
            <div className="wolf-side-lux__avatar w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 overflow-hidden">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] font-bold">{user.name[0]?.toUpperCase()}</span>
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
          type="button"
          onClick={onLogout}
          className="app-sidebar__link wolf-side-lux__link wolf-side-lux__link--out w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium relative"
        >
          <span className="wolf-side-lux__shine" aria-hidden />
          <LogOut className="wolf-side-lux__ico w-[18px] h-[18px] shrink-0" />
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
