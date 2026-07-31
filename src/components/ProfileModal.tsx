import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Crown, Shield, LogOut, KeyRound, Camera, Trash2 } from 'lucide-react';
import type { User } from '../hooks/useAuth';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';
import { fetchMasterAiStatus } from '../services/masterAiService';
import {
  loadOpenRouterApiKey,
  saveOpenRouterApiKey,
  maskOpenRouterApiKey,
  clearOpenRouterApiKey,
  isValidMasterAiKey,
  detectMasterAiKeyProvider,
} from '../services/openRouterKey';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onLogout: () => void;
  onUpgrade?: () => void;
  onUpdateAvatar?: (file: File) => Promise<string>;
  onRemoveAvatar?: () => void;
}

export default function ProfileModal({
  isOpen,
  onClose,
  user,
  onLogout,
  onUpgrade,
  onUpdateAvatar,
  onRemoveAvatar,
}: ProfileModalProps) {
  const { theme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [openRouterInput, setOpenRouterInput] = useState('');
  const [openRouterSaved, setOpenRouterSaved] = useState(() => loadOpenRouterApiKey());
  const [openRouterMsg, setOpenRouterMsg] = useState('');
  const [serverAiReady, setServerAiReady] = useState(false);
  const [showKeyOverride, setShowKeyOverride] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setOpenRouterSaved(loadOpenRouterApiKey());
    setAvatarMsg('');
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
    const provider = detectMasterAiKeyProvider(key);
    if (!isValidMasterAiKey(key) || !provider) {
      setOpenRouterMsg(
        'Use an AI Studio key (AQ.… or AIza… from aistudio.google.com), OpenAI (sk-…), or OpenRouter (sk-or-…). ChatGPT Plus login is not an API key.',
      );
      return;
    }
    saveOpenRouterApiKey(key);
    setOpenRouterSaved(key);
    setOpenRouterInput('');
    setOpenRouterMsg(
      provider === 'gemini'
        ? 'API key saved — Wolf AI is ready.'
        : provider === 'openai'
          ? 'OpenAI API key saved — Wolf AI will use GPT models.'
          : 'OpenRouter key saved — Wolf AI will use it.',
    );
  };

  const handlePickAvatar = async (file: File | undefined) => {
    if (!file || !onUpdateAvatar) return;
    setAvatarBusy(true);
    setAvatarMsg('');
    try {
      await onUpdateAvatar(file);
      setAvatarMsg('Profile photo updated.');
    } catch (err) {
      setAvatarMsg(err instanceof Error ? err.message : 'Could not update photo');
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
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
              <div className="relative shrink-0">
                <div className="w-16 h-16 rounded-2xl bg-gold/15 border border-gold/30 overflow-hidden flex items-center justify-center">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-gold">{user.name[0]?.toUpperCase()}</span>
                  )}
                </div>
                {onUpdateAvatar ? (
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gold text-dark-surface flex items-center justify-center shadow-lg border-2 border-[var(--tf-surface)] hover:bg-gold-light disabled:opacity-60"
                    title="Upload profile photo"
                    aria-label="Upload profile photo"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                ) : null}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handlePickAvatar(e.target.files?.[0])}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-[var(--tf-text)]">{user.name}</h2>
                <p className="text-xs text-[var(--tf-text-muted)] flex items-center gap-1 mt-0.5 truncate">
                  <Mail className="w-3 h-3 shrink-0" />
                  {user.email}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {onUpdateAvatar ? (
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => fileRef.current?.click()}
                      className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg border border-gold/30 text-gold hover:bg-gold/10 disabled:opacity-60"
                    >
                      {avatarBusy ? 'Uploading…' : user.avatar ? 'Change photo' : 'Add photo'}
                    </button>
                  ) : null}
                  {user.avatar && onRemoveAvatar ? (
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => {
                        onRemoveAvatar();
                        setAvatarMsg('Profile photo removed.');
                      }}
                      className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg border border-dark-border text-[var(--tf-text-secondary)] hover:text-red-400 hover:border-red-400/30 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  ) : null}
                </div>
                {avatarMsg ? (
                  <p className="mt-1.5 text-[10px] text-[var(--tf-text-muted)]">{avatarMsg}</p>
                ) : null}
              </div>
            </div>

            <p className="text-xs text-[var(--tf-text-muted)] mb-4">
              Trading psychology is recorded when you save each trade in the journal.
            </p>

            <div className="space-y-3 mb-6">
              {showOpenRouterCard ? (
                <div className="py-3 px-4 rounded-xl bg-dark-elevated border border-dark-border space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-gold" />
                      <span className="text-sm text-slate-400">Wolf AI (API key)</span>
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
                      Server pe key nahi — aistudio.google.com se AI Studio key (AQ.… / AIza…), OpenAI (sk-…), ya OpenRouter
                      (sk-or-…) paste karo. ChatGPT Plus/Premium website login API key nahi hota.
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
                        placeholder="AQ.… / AIza… · sk-… · sk-or-…"
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
                  {openRouterMsg ? <p className="text-[10px] text-slate-400">{openRouterMsg}</p> : null}
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
