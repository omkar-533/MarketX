import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Crown, Shield, LogOut, KeyRound } from 'lucide-react';
import type { User } from '../hooks/useAuth';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';
import { useBrokerSession } from '../hooks/useBrokerSession';
import { fetchMasterAiStatus } from '../services/masterAiService';
import {
  loadOpenRouterApiKey,
  saveOpenRouterApiKey,
  maskOpenRouterApiKey,
  clearOpenRouterApiKey,
} from '../services/openRouterKey';


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
  const [openRouterInput, setOpenRouterInput] = useState('');
  const [openRouterSaved, setOpenRouterSaved] = useState(() => loadOpenRouterApiKey());
  const [openRouterMsg, setOpenRouterMsg] = useState('');
  const [serverAiReady, setServerAiReady] = useState(false);
  const [showKeyOverride, setShowKeyOverride] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setOpenRouterSaved(loadOpenRouterApiKey());
    void fetchMasterAiStatus().then((s) => {
      setServerAiReady(s.configured && s.keySource === 'server');
      if (!s.configured && !loadOpenRouterApiKey()) setShowKeyOverride(true);
    });
  }, [isOpen]);

  if (!user) return null;

  const hasLocalKey = Boolean(openRouterSaved);
  const showPasteUi = showKeyOverride || (!serverAiReady && !hasLocalKey);
  const showOpenRouterCard = !serverAiReady || hasLocalKey || showPasteUi;

  const planLabel = user.plan === 'premium' ? 'Premium' : user.plan === 'pro' ? 'Pro' : 'Free';

  const handleSaveOpenRouterKey = () => {
    const key = openRouterInput.trim();
    if (!key.startsWith('sk-or-')) {
      setOpenRouterMsg('Valid OpenRouter key starts with sk-or-');
      return;
    }
    saveOpenRouterApiKey(key);
    setOpenRouterSaved(key);
    setOpenRouterInput('');
    setOpenRouterMsg('OpenRouter key saved — Master AI will use it.');
  };

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
              {showOpenRouterCard ? (
                <div className="py-3 px-4 rounded-xl bg-dark-elevated border border-dark-border space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-gold" />
                      <span className="text-sm text-slate-400">Master AI (OpenRouter)</span>
                    </div>
                    {(serverAiReady || hasLocalKey) && (
                      <span className="text-[10px] font-bold text-emerald-400">Active</span>
                    )}
                  </div>
                  {hasLocalKey ? (
                    <p className="text-[10px] text-emerald-400 font-mono">
                      Is browser me saved: {maskOpenRouterApiKey(openRouterSaved)}
                    </p>
                  ) : null}
                  {!serverAiReady && !hasLocalKey ? (
                    <p className="text-[10px] text-slate-500">
                      Server pe key nahi — openrouter.ai se key paste karo ya Render env me
                      OPENROUTER_API_KEY set karo.
                    </p>
                  ) : null}
                  {showPasteUi ? (
                    <>
                      <input
                        type="password"
                        value={openRouterInput}
                        onChange={(e) => {
                          setOpenRouterInput(e.target.value);
                          setOpenRouterMsg('');
                        }}
                        placeholder="sk-or-… (optional override)"
                        className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-xs text-slate-200 placeholder:text-slate-600 focus:border-gold/50 focus:outline-none"
                        autoComplete="off"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveOpenRouterKey}
                          className="flex-1 py-2 rounded-lg bg-gold/15 border border-gold/30 text-gold text-xs font-bold hover:bg-gold/25 transition-colors"
                        >
                          Save on this device
                        </button>
                        {hasLocalKey ? (
                          <button
                            type="button"
                            onClick={() => {
                              clearOpenRouterApiKey();
                              setOpenRouterSaved('');
                              setOpenRouterInput('');
                              setOpenRouterMsg('Local key removed — server key use hogi.');
                              if (serverAiReady) setShowKeyOverride(false);
                            }}
                            className="px-3 py-2 rounded-lg border border-dark-border text-slate-400 text-xs hover:text-slate-200"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                  {openRouterMsg ? (
                    <p className="text-[10px] text-slate-400">{openRouterMsg}</p>
                  ) : null}
                </div>
              ) : null}
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
