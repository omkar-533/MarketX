import { useState, useEffect } from 'react';
import { Clock, Menu } from 'lucide-react';
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

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className={`app-lux-header ${className}`}>
      <div className="app-lux-header__inner">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-1 text-[rgba(190,190,198,0.9)] hover:text-[#e8d48b] rounded-lg hover:bg-white/[0.04] shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="shrink-0 min-w-0 mr-auto overflow-hidden" title={BRAND}>
          <BrandMark size="sm" nameClassName="auth-lux__brand-text tracking-[0.06em]" />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-[rgba(190,190,198,0.75)]">
            <Clock className="w-3.5 h-3.5" />
            <span className="tabular-nums">{currentTime.toLocaleTimeString('en-IN')}</span>
          </div>

          <ThemeToggle />

          {user && (
            <button
              type="button"
              onClick={onProfile}
              className="auth-lux__btn-ghost !py-1.5 !px-3 text-xs inline-flex items-center gap-2"
            >
              <span className="w-6 h-6 rounded-full bg-[rgba(201,162,39,0.18)] text-[#e8d48b] text-[11px] font-bold grid place-items-center">
                {user.name[0]?.toUpperCase()}
              </span>
              <span className="hidden lg:inline max-w-[100px] truncate font-semibold text-[#f5f5f7]">
                {user.name}
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
