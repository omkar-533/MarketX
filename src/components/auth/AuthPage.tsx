import { motion } from 'framer-motion';
import { Crown } from 'lucide-react';
import AuthBrandPanel from './AuthBrandPanel';
import AuthForm, { type AuthFormProps } from './AuthForm';
import ThemeToggle from '../ThemeToggle';

/** Static ticker on login — avoids loading heavy marketData engine before sign-in */
const AUTH_TICKER = [
  { sym: 'NIFTY', val: '24,580.00', ch: '+0.42%', up: true },
  { sym: 'BANKNIFTY', val: '52,140.00', ch: '+0.38%', up: true },
  { sym: 'SENSEX', val: '80,520.00', ch: '+0.31%', up: true },
  { sym: 'FINNIFTY', val: '23,890.00', ch: '-0.12%', up: false },
  { sym: 'MIDCPNIFTY', val: '12,456.00', ch: '+0.18%', up: true },
  { sym: 'BANKEX', val: '58,230.00', ch: '+0.25%', up: true },
];

type AuthPageProps = Omit<AuthFormProps, 'headerExtra'> & {
  initialMode?: AuthFormProps['mode'];
};

export default function AuthPage(props: AuthPageProps) {
  const ticker = AUTH_TICKER;

  return (
    <div className="auth-page min-h-screen flex flex-col">
      <div className="auth-aurora" aria-hidden="true" />
      <div className="auth-noise" aria-hidden="true" />

      <header className="relative z-10 glass border-b border-dark-border shrink-0">
        <div className="flex items-center justify-between gap-2 px-4 py-2 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gold rounded-lg flex items-center justify-center shadow-lg shadow-gold/20">
              <Crown className="w-3.5 h-3.5 text-dark-surface" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Markets Live</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <ThemeToggle />
        </div>
        <div className="flex gap-10 py-2 ticker-scroll whitespace-nowrap px-4 overflow-hidden">
          {[...ticker, ...ticker, ...ticker].map((t, i) => (
            <span key={`${t.sym}-${i}`} className="inline-flex items-center gap-2 text-xs shrink-0">
              <span className="font-bold text-slate-500">{t.sym}</span>
              <span className="font-semibold text-slate-200 tabular-nums">{t.val}</span>
              <span className={`font-bold tabular-nums ${t.up ? 'text-emerald-400' : 'text-red-400'}`}>{t.ch}</span>
            </span>
          ))}
        </div>
      </header>

      <div className="relative z-10 flex-1 grid lg:grid-cols-2 min-h-0">
        <AuthBrandPanel variant="page" />

        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col justify-center px-5 sm:px-8 lg:px-12 xl:px-16 py-8 lg:py-10 overflow-y-auto bg-dark-bg/50"
        >
          <div className="hidden lg:flex items-center justify-end gap-2 mb-5">
            <ThemeToggle />
            <span className="auth-version-badge">v2.0</span>
          </div>

          <div className="lg:hidden flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gold rounded-lg flex items-center justify-center shadow-lg shadow-gold/20">
                <Crown className="w-4 h-4 text-dark-surface" />
              </div>
              <div>
                <p className="text-sm font-bold text-gold leading-none">Master</p>
                <p className="text-[9px] text-slate-500 font-bold tracking-wider">TradeX</p>
              </div>
            </div>
          </div>

          <div className="w-full max-w-md mx-auto lg:mx-0">
            <div className="auth-form-card auth-form-card--accent p-6 sm:p-8">
              <AuthForm {...props} />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
