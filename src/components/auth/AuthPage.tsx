import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';
import AuthBrandPanel from './AuthBrandPanel';
import AuthForm, { type AuthFormProps } from './AuthForm';
import AuthRobotScene from './AuthRobotScene';
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
    <div className="auth-page auth-page--robot min-h-screen flex flex-col">
      <div className="auth-aurora auth-aurora--robot" aria-hidden="true" />
      <div className="auth-noise" aria-hidden="true" />
      <div className="auth-scan-grid" aria-hidden="true" />
      <div className="auth-scanbeam" aria-hidden="true" />

      <header className="relative z-10 border-b border-gold/15 shrink-0 bg-[#06080f]/90 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="auth-ai-logo auth-ai-logo--sm">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="auth-ai-brand text-[11px] leading-none">Master TradeX</p>
              <p className="text-[9px] text-slate-500 font-bold tracking-[0.2em] uppercase mt-0.5">
                AI Neural Login
              </p>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="auth-version-badge auth-version-badge--ai hidden sm:inline-flex">AI CORE v3</span>
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

      <div className="relative z-10 flex-1 grid lg:grid-cols-2 min-h-0">
        {/* Desktop left panel */}
        <AuthBrandPanel variant="page" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col justify-center px-4 sm:px-8 lg:px-12 xl:px-16 py-6 lg:py-10 overflow-y-auto"
        >
          {/* Mobile / tablet: robot ALWAYS visible */}
          <div className="lg:hidden mb-4">
            <p className="auth-ai-headline text-center text-xl mb-1">
              <span>Walking</span> AI unit
            </p>
            <p className="text-center text-[11px] text-slate-500 mb-2">Live patrol · neural market core</p>
            <div className="auth-robot-wrap auth-robot-wrap--mobile mx-auto">
              <AuthRobotScene />
            </div>
          </div>

          <div className="w-full max-w-md mx-auto lg:mx-0">
            <div className="auth-form-card auth-form-card--robot p-5 sm:p-8 relative z-[1]">
              <div className="auth-form-robot-edge" aria-hidden="true" />
              <AuthForm {...props} />
            </div>
            <p className="mt-4 text-center text-[10px] text-slate-600 tracking-wide">
              Secure neural gateway · TradeX Live
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
