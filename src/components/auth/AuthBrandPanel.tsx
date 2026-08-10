import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bot, Code2, Cpu, GraduationCap, NotebookPen, Shield, Sparkles, Wallet } from 'lucide-react';
import AuthRobotScene from './AuthRobotScene';
import {
  BRAND,
  BRAND_LINE1,
  BRAND_LINE2,
  BRAND_SHORT,
  BRAND_TAGLINE_FULL,
  PAGE_NAMES,
} from '../../constants/brandLabels';
import { SHOW_INDICATORS, SHOW_PAPER_TRADING } from '../../constants/featureFlags';

const capabilities = [
  { icon: Sparkles, text: PAGE_NAMES['wolf-ai'] },
  { icon: GraduationCap, text: PAGE_NAMES['mentor-ai'] },
  ...(SHOW_INDICATORS ? [{ icon: Code2, text: PAGE_NAMES.indicators }] : []),
  ...(SHOW_PAPER_TRADING ? [{ icon: Wallet, text: PAGE_NAMES.papertrading }] : []),
  { icon: NotebookPen, text: PAGE_NAMES.tradingjournal },
];

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="auth-ai-clock">
      IST {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

interface AuthBrandPanelProps {
  variant?: 'page' | 'modal';
}

export default function AuthBrandPanel({ variant = 'modal' }: AuthBrandPanelProps) {
  const isPage = variant === 'page';

  return (
    <div
      className={`auth-brand-panel auth-brand-panel--robot relative flex-col justify-between overflow-hidden border-dark-border ${
        isPage ? 'p-8 xl:p-10 border-r' : 'hidden lg:flex p-8 border-r'
      }`}
    >
      <div className="auth-circuit-bg absolute inset-0 pointer-events-none" />
      <div className="auth-hologram-veil absolute inset-0 pointer-events-none" />

      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="auth-ai-logo">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <p className="auth-ai-brand">{BRAND_LINE1}</p>
            <p className="auth-ai-subbrand">{BRAND_LINE2} · Neural Core</p>
          </div>
        </div>
        <LiveClock />
      </div>

      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-2"
        >
          <div className="auth-kicker auth-kicker--ai">
            <Cpu className="w-3 h-3" />
            AI trading workspace
          </div>
          <h2 className="auth-ai-headline">
            <span>{BRAND}</span>
          </h2>
          <p className="auth-ai-tagline">{BRAND_TAGLINE_FULL}</p>
          <p className="auth-ai-lead">
            {SHOW_PAPER_TRADING
              ? 'AI-powered market intelligence with Wolf AI, Mentor, paper trading, and journaling — before you even sign in.'
              : 'AI-powered market intelligence with Wolf AI, Mentor, and journaling — before you even sign in.'}
          </p>
        </motion.div>

        <div className="auth-robot-wrap flex-1 min-h-[220px] my-2">
          <AuthRobotScene />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          {capabilities.map(({ icon: Icon, text }, i) => (
            <motion.div
              key={text}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              className="auth-ai-chip"
            >
              <Icon className="w-3.5 h-3.5 text-gold shrink-0" />
              <span>{text}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 mt-6 pt-5 border-t border-gold/15">
        <span className="auth-trust-badge">
          <Shield className="w-3 h-3 text-emerald-400" />
          Encrypted session
        </span>
        <span className="auth-trust-badge">{BRAND_SHORT}</span>
      </div>
    </div>
  );
}
