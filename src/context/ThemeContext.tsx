import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'tradeflow_theme';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  const legacy = localStorage.getItem('tradeflow_journal_theme');
  if (legacy === 'light' || legacy === 'dark') return legacy;
  return 'dark';
}

function applyThemeToDocument(mode: ThemeMode) {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  root.classList.remove('theme-dark', 'theme-light');
  root.classList.add(mode === 'light' ? 'theme-light' : 'theme-dark');
  root.style.colorScheme = mode;
  document.body.style.backgroundColor = '';
  document.body.style.color = '';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readStoredTheme);

  useLayoutEffect(() => {
    applyThemeToDocument(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      isDark: theme === 'dark',
    }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

/** Apply theme before React mounts (see index.html inline script). */
export function initThemeFromStorage() {
  applyThemeToDocument(readStoredTheme());
}
