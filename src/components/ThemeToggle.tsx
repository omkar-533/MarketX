import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

type ThemeToggleProps = {
  variant?: 'icon' | 'pill';
  className?: string;
};

export default function ThemeToggle({ variant = 'icon', className = '' }: ThemeToggleProps) {
  const { setTheme, isDark } = useTheme();

  if (variant === 'pill') {
    return (
      <div
        className={`inline-flex rounded-lg border border-dark-border bg-dark-elevated p-0.5 ${className}`}
        role="group"
        aria-label="Theme mode"
      >
        <button
          type="button"
          onClick={() => setTheme('light')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            !isDark ? 'bg-gold text-dark-surface shadow-sm' : 'text-slate-500 hover:text-slate-300'
          }`}
          aria-pressed={!isDark}
        >
          <Sun className="w-3.5 h-3.5" />
          Light
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            isDark ? 'bg-gold text-dark-surface shadow-sm' : 'text-slate-500 hover:text-slate-300'
          }`}
          aria-pressed={isDark}
        >
          <Moon className="w-3.5 h-3.5" />
          Dark
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`p-2 rounded-lg text-slate-500 hover:text-gold hover:bg-dark-border/60 transition-colors ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
