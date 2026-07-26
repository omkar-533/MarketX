import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bot, Cpu, Shield, Sparkles, Zap } from 'lucide-react';
import AuthRobotScene from './AuthRobotScene';
import { BRAND, BRAND_LINE1, BRAND_LINE2, BRAND_SHORT } from '../../constants/brandLabels';

const capabilities = [
  { icon: Bot, text: 'Neural market scan' },
  { icon: Zap, text: 'Real-time signal core' },
  { icon: Cpu, text: 'Smart money detection' },
  { icon: Sparkles, text: 'Master AI copilots' },
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
            AI trading terminal
          </div>
          <h2 className="auth-ai-headline">
            <span>{BRAND}</span>
          </h2>
          <p className="auth-ai-lead">
            AI-powered market intelligence with live LTP, option chain, OI, and signals —
            before you even sign in.
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
        <span className="auth-trust-badge">Neural feed · {BRAND_SHORT}</span>
        <span className="auth-trust-badge">NSE · F&O</span>
      </div>
    </div>
  );
}
