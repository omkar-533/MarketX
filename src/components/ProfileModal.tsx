import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Crown, Shield, LogOut } from 'lucide-react';
import type { User } from '../hooks/useAuth';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';
import { useBrokerSession } from '../hooks/useBrokerSession';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onLogout: () => void;
  onUpgrade?: () => void;
}

export default function ProfileModal({ isOpen, onClose, user, onLogout, onUpgrade }: ProfileModalProps) {
  const { theme } = useTheme();
  const { session, startBrokerLogin } = useBrokerSession(Boolean(user));
  if (!user) return null;

  const planLabel = user.plan === 'premium' ? 'Premium' : user.plan === 'pro' ? 'Pro' : 'Free';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="app-card relative w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-dark-elevated transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gold/15 border border-gold/30 flex items-center justify-center">
                <span className="text-xl font-bold text-gold">{user.name[0]?.toUpperCase()}</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Trader Profile</h2>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" />
                  {user.email}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Trading psychology is recorded when you save each trade in the journal.
            </p>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-dark-elevated border border-dark-border gap-3">
                <div>
                  <span className="text-sm text-slate-400 block">TradeX live data</span>
                  <span className="text-[10px] text-slate-500">
                    {session.brokerConnected
                      ? session.wsConnected
                        ? 'Connected · auto-reconnect on'
                        : 'Token ok · connecting WS…'
                      : 'Not connected'}
                  </span>
                </div>
                {session.brokerConnected ? (
                  <span className="text-xs font-bold text-emerald-400">Live</span>
                ) : (
                  <button
                    type="button"
                    onClick={startBrokerLogin}
                    className="text-xs font-bold text-gold hover:underline"
                  >
                    Connect
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-dark-elevated border border-dark-border gap-3">
                <div>
                  <span className="text-sm text-slate-400 block">Appearance</span>
                  <span className="text-[10px] text-slate-500 capitalize">{theme} mode</span>
                </div>
                <ThemeToggle variant="pill" />
              </div>
              <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-dark-elevated border border-dark-border">
                <span className="text-sm text-slate-400">Plan</span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-gold">
                  <Crown className="w-4 h-4" />
                  {planLabel}
                </span>
              </div>
              {user.role === 'admin' && (
                <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-dark-elevated border border-dark-border">
                  <span className="text-sm text-slate-400">Role</span>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-400">
                    <Shield className="w-4 h-4" />
                    Admin
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {onUpgrade && user.plan !== 'premium' && (
                <button
                  type="button"
                  onClick={() => {
                    onUpgrade();
                    onClose();
                  }}
                  className="w-full py-2.5 rounded-xl bg-gold text-dark-surface font-bold text-sm hover:bg-gold-light transition-colors"
                >
                  Upgrade plan
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dark-border text-red-400 text-sm font-semibold hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
