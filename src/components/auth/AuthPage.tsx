import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import AuthForm, { type AuthFormProps } from './AuthForm';
import AuthRobotScene from './AuthRobotScene';
import AuthTradingOverlay from './AuthTradingOverlay';
import ThemeToggle from '../ThemeToggle';

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
    <div className="auth-page auth-page--robot auth-page--fullscreen-thinker min-h-screen flex flex-col relative overflow-hidden">
      <div className="auth-aurora auth-aurora--robot" aria-hidden="true" />
      <div className="auth-noise" aria-hidden="true" />
      <div className="auth-scan-grid" aria-hidden="true" />
      <div className="auth-scanbeam" aria-hidden="true" />

      {/* Full-screen AI Thinker portrait */}
      <div className="auth-fullscreen-stage" aria-hidden="true">
        <AuthRobotScene fullscreen />
      </div>
      <div className="auth-fullscreen-shade auth-fullscreen-shade--thinker" aria-hidden="true" />
      <AuthTradingOverlay />

      <header className="relative z-20 border-b border-cyan-400/10 shrink-0 bg-[#041018]/50 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="auth-ai-logo auth-ai-logo--sm">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="auth-ai-brand text-[11px] leading-none">Master TradeX</p>
              <p className="text-[9px] text-slate-500 font-bold tracking-[0.2em] uppercase mt-0.5">
                AI Neural Core
              </p>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="auth-version-badge auth-version-badge--ai hidden sm:inline-flex">
              3D AI · LIVE
            </span>
            <ThemeToggle />
          </div>
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
          <div className="mb-4 hidden sm:block">
            <p className="auth-ai-headline text-2xl lg:text-3xl">
              <span>TradeX</span> AI assistant
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Live LTP · Option Chain · OI · Signals · LPT Master
            </p>
          </div>
          <div className="auth-form-card auth-form-card--robot auth-form-card--overlay p-5 sm:p-8">
            <div className="auth-form-robot-edge" aria-hidden="true" />
            <AuthForm {...props} />
          </div>
          <p className="mt-3 text-center text-[10px] text-slate-500 tracking-wide">
            3D neural AI · Secure TradeX Live
          </p>
        </motion.div>
      </div>
    </div>
  );
}
