import { motion } from 'framer-motion';
import { Crown } from 'lucide-react';
import AuthForm, { type AuthFormProps } from './AuthForm';
import AuthRobotScene from './AuthRobotScene';
import AuthTradingOverlay from './AuthTradingOverlay';
import ThemeToggle from '../ThemeToggle';
import { BRAND, BRAND_LINE1, BRAND_LINE2, BRAND_SHORT } from '../../constants/brandLabels';

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

/** Same brand block as Sidebar / Header — only labels that are visible in-app */
export default function AuthPage(props: AuthPageProps) {
  const ticker = AUTH_TICKER;

  return (
    <div className="auth-page auth-page--robot auth-page--fullscreen-thinker min-h-screen flex flex-col relative overflow-hidden">
      <div className="auth-aurora auth-aurora--robot" aria-hidden="true" />
      <div className="auth-noise" aria-hidden="true" />
      <div className="auth-scan-grid" aria-hidden="true" />
      <div className="auth-scanbeam" aria-hidden="true" />

      <div className="auth-fullscreen-stage" aria-hidden="true">
        <AuthRobotScene fullscreen />
      </div>
      <div className="auth-fullscreen-shade auth-fullscreen-shade--thinker" aria-hidden="true" />
      <AuthTradingOverlay />

      <header className="relative z-20 border-b border-cyan-400/10 shrink-0 bg-[#041018]/55 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0" title={BRAND}>
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-gold rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-gold/20">
              <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-dark-surface" />
            </div>
            <div className="min-w-0">
              <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-gold leading-tight tracking-tight">
                {BRAND_LINE1}
              </div>
              <div className="text-base sm:text-xl lg:text-2xl text-slate-100 -mt-0.5 leading-tight tracking-wide font-bold">
                {BRAND_LINE2}
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-[0.16em] mt-1">
                {BRAND_SHORT} · Live
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
        <div className="flex gap-10 py-1.5 ticker-scroll whitespace-nowrap px-4 overflow-hidden border-t border-gold/10">
          {[...ticker, ...ticker, ...ticker].map((t, i) => (
            <span key={`${t.sym}-${i}`} className="inline-flex items-center gap-2 text-xs shrink-0">
              <span className="font-bold text-slate-500">{t.sym}</span>
              <span className="font-semibold text-slate-200 tabular-nums">{t.val}</span>
              <span className={`font-bold tabular-nums ${t.up ? 'text-emerald-400' : 'text-red-400'}`}>
                {t.ch}
              </span>
            </span>
          ))}
        </div>
      </header>

      <div className="relative z-20 flex-1 flex items-end sm:items-center justify-center sm:justify-end px-4 sm:px-8 lg:px-16 py-6 lg:py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full max-w-md"
        >
          <div className="auth-form-card auth-form-card--robot auth-form-card--overlay p-5 sm:p-8">
            <div className="auth-form-robot-edge" aria-hidden="true" />
            <AuthForm {...props} />
          </div>
          <p className="mt-3 text-center text-[10px] text-slate-500 tracking-wide">
            {BRAND_LINE1} {BRAND_LINE2}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
