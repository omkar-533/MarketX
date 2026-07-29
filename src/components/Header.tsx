import { useEffect, useRef } from 'react';
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

/** Tiny clock — updates DOM only so Header does not re-render every second. */
function HeaderClock() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const tick = () => {
      if (ref.current) {
        ref.current.textContent = new Date().toLocaleTimeString('en-IN');
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500">
      <Clock className="w-3.5 h-3.5" />
      <span ref={ref} className="tabular-nums" />
    </div>
  );
}

/** Clean app header — ticker/search/alerts stay hidden as requested earlier. */
export default function Header({ user, onProfile, onMenuClick, className = '' }: HeaderProps) {
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

      <div className="shrink-0 min-w-0 mr-auto" title={BRAND}>
        <BrandMark size="sm" nameClassName="truncate text-[1.05rem] sm:text-[1.2rem]" />
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <HeaderClock />
        <ThemeToggle />

        {user && (
          <button
            type="button"
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
