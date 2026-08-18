/**
 * CONNECT MARKET DATA wizard
 * Detect (catalog/preference) → Official authorize → Connected
 *
 * Detection ≠ authorization. No cookie scrape / password / OTP / TOTP.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Link2, Radar, Sparkles, X } from 'lucide-react';
import type { CatalogProvider, ServerConnectionStatus } from '../../../services/marketData/marketDataApi';
import {
  detectSupportedBrokers,
  type DetectionResult,
} from '../../../services/marketData/BrokerDetection';
import {
  authorizeMarketData,
  planAuthorization,
  revokeMarketDataAuthorization,
  type AuthorizationPlan,
} from '../../../services/marketData/BrokerAuthorization';
import BrokerLogoMark from './BrokerLogoMark';

type Props = {
  open: boolean;
  onClose: () => void;
  status: ServerConnectionStatus | null;
  onStatusChange: (s: ServerConnectionStatus) => void;
};

type Step = 'detect' | 'authorize' | 'connected';

const EASE = [0.16, 1, 0.3, 1] as const;

export default function ConnectMarketDataModal({
  open,
  onClose,
  status,
  onStatusChange,
}: Props) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState<Step>('detect');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selected, setSelected] = useState<CatalogProvider | null>(null);
  const [plan, setPlan] = useState<AuthorizationPlan | null>(null);
  const [tokenDraft, setTokenDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTokenDraft('');
    setBusy(true);
    void detectSupportedBrokers()
      .then((d) => {
        setDetection(d);
        if (status?.status === 'CONNECTED') {
          setStep('connected');
          return;
        }
        setStep('detect');
        const preferred =
          d.brokers.find((b) => b.id === d.lastPreferredId && b.enabled) ||
          d.connectable.find((b) => !b.isDemo) ||
          d.connectable[0] ||
          null;
        setSelected(preferred);
      })
      .catch(() => setError('Could not load market-data sources.'))
      .finally(() => setBusy(false));
  }, [open, status?.status]);

  const visibleBrokers = useMemo(
    () => (detection?.connectable || detection?.brokers || []).filter((b) => b.enabled && !b.isDemo),
    [detection],
  );

  if (!open) return null;

  const goAuthorize = (provider: CatalogProvider) => {
    const p = planAuthorization(provider);
    setSelected(provider);
    setPlan(p);
    setError(null);
    setTokenDraft('');
    if (!p.canAuthorize) {
      setError(p.unsupportedReason || 'Unsupported broker');
      setStep('authorize');
      return;
    }
    setStep('authorize');
  };

  const runAuthorize = async () => {
    if (!selected || !plan?.canAuthorize) return;
    setBusy(true);
    setError(null);
    const result = await authorizeMarketData(selected, {
      accessToken: plan.mechanism === 'official_access_token' ? tokenDraft : undefined,
    });
    setBusy(false);
    setTokenDraft('');
    if (!result.ok) {
      setError(result.error || 'Authorization failed');
      return;
    }
    onStatusChange(result.status);
    setStep('connected');
  };

  const onDisconnect = async () => {
    setBusy(true);
    const view = await revokeMarketDataAuthorization();
    onStatusChange(view);
    setStep('detect');
    setBusy(false);
  };

  const steps: { id: Step; label: string; n: number }[] = [
    { id: 'detect', label: 'Detect', n: 1 },
    { id: 'authorize', label: 'Authorize', n: 2 },
    { id: 'connected', label: 'Connected', n: 3 },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="wolf-md-modal" role="dialog" aria-modal="true" aria-label="Connect Market Data">
      <motion.button
        type="button"
        className="wolf-md-modal__backdrop"
        onClick={onClose}
        aria-label="Close"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28 }}
      />
      <motion.div
        className="wolf-md-modal__panel"
        initial={reduced ? false : { opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <div className="wolf-md-modal__glow" aria-hidden />
        <div className="wolf-md-modal__sheen" aria-hidden />

        <header className="wolf-md-modal__head">
          <div>
            <p className="wolf-md-modal__eyebrow">
              <Sparkles size={12} />
              Market desk
            </p>
            <h2>CONNECT MARKET DATA</h2>
            <p>Official broker authorization only · Order access never enabled</p>
          </div>
          <button type="button" className="wolf-md-modal__x" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <nav className="wolf-md-steps" aria-label="Connect steps">
          {steps.map((s, i) => {
            const on = step === s.id;
            const done = i < stepIndex;
            return (
              <span key={s.id} className={`wolf-md-steps__item ${on ? 'is-on' : ''} ${done ? 'is-done' : ''}`}>
                <span className="wolf-md-steps__dot">{done ? <Check size={11} /> : s.n}</span>
                {s.label}
              </span>
            );
          })}
          <motion.span
            className="wolf-md-steps__rail"
            aria-hidden
            initial={false}
            animate={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.45, ease: EASE }}
          />
        </nav>

        <AnimatePresence mode="wait">
          {step === 'detect' && (
            <motion.section
              key="detect"
              className="wolf-md-detect"
              initial={reduced ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              <div className="wolf-md-detect__banner">
                <span className="wolf-md-detect__pulse" aria-hidden>
                  <Radar size={14} />
                </span>
                <p>
                  {detection?.message ||
                    'Showing WOLF-supported market-data sources. Other-tab broker logins are never read or reused.'}
                </p>
              </div>
              <div className="wolf-md-modal__grid wolf-md-modal__grid--live">
                {visibleBrokers.map((p, i) => (
                  <motion.button
                    key={p.id}
                    type="button"
                    className={`wolf-md-card wolf-md-card--live ${
                      selected?.id === p.id ? 'is-selected' : ''
                    }`}
                    onClick={() => goAuthorize(p)}
                    disabled={busy}
                    initial={reduced ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(0.04 + i * 0.04, 0.2), duration: 0.28, ease: EASE }}
                    whileHover={reduced ? undefined : { y: -2 }}
                    whileTap={reduced ? undefined : { scale: 0.99 }}
                  >
                    <div className="wolf-md-card__aura" aria-hidden />
                    <div className="wolf-md-card__top">
                      <div className="wolf-md-card__brand">
                        <BrokerLogoMark id={p.id} name={p.name} />
                        <span>
                          <strong>{p.name}</strong>
                          <small className="wolf-md-card__ex">{p.supportedExchanges.join(' · ')}</small>
                        </span>
                      </div>
                      <em className="is-ok">LIVE API</em>
                    </div>
                    <ul>
                      <li>
                        <span>Historical</span>
                        <b>{p.capabilities.historicalCandles ? 'Yes' : 'No'}</b>
                      </li>
                      <li>
                        <span>Live quotes</span>
                        <b>{p.capabilities.liveQuotes ? 'Yes' : 'No'}</b>
                      </li>
                      <li>
                        <span>Auth</span>
                        <b>{authLabel(p)}</b>
                      </li>
                      <li>
                        <span>Order access</span>
                        <b>NOT ENABLED</b>
                      </li>
                    </ul>
                    <small>{p.notes}</small>
                    <span className="wolf-md-card__cta wolf-md-card__cta--btn">
                      <Link2 size={14} /> Continue to authorize
                    </span>
                  </motion.button>
                ))}
              </div>
              {!busy && visibleBrokers.length === 0 && (
                <p className="wolf-md-detect__hint">No live market-data API is available to connect right now.</p>
              )}
            </motion.section>
          )}

          {step === 'authorize' && plan && selected && (
            <motion.section
              key="authorize"
              className="wolf-md-token"
              initial={reduced ? false : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              <div className="wolf-md-token__brand">
                <BrokerLogoMark id={selected.id} name={selected.name} />
                <div>
                  <h3>{plan.name}</h3>
                  <p className="wolf-md-token__warn">
                    Mechanism: <strong>{mechanismLabel(plan.mechanism)}</strong>
                    {plan.canAuthorize
                      ? ' · Detection is complete; authorization still required.'
                      : ' · Cannot authorize without an official API.'}
                  </p>
                </div>
              </div>
              <ol>
                {plan.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>

              {plan.tokenPortalUrl && (
                <p>
                  <a href={plan.tokenPortalUrl} target="_blank" rel="noreferrer">
                    Open official INDstocks Access Tokens →
                  </a>
                </p>
              )}

              {plan.mechanism === 'official_access_token' && plan.canAuthorize && (
                <label>
                  <span>Official access token (not password / OTP)</span>
                  <input
                    type="password"
                    name="wolf_md_access_token"
                    autoComplete="new-password"
                    spellCheck={false}
                    value={tokenDraft}
                    onChange={(e) => setTokenDraft(e.target.value)}
                    placeholder="Paste token from broker portal"
                  />
                </label>
              )}

              <div className="wolf-md-token__actions">
                <button type="button" className="ghost" onClick={() => setStep('detect')} disabled={busy}>
                  Back
                </button>
                {plan.canAuthorize && (
                  <button type="button" className="primary" onClick={() => void runAuthorize()} disabled={busy}>
                    {busy ? 'Connecting…' : 'CONNECT NOW'}
                  </button>
                )}
              </div>
            </motion.section>
          )}

          {step === 'connected' && status?.status === 'CONNECTED' && (
            <motion.div
              key="connected"
              className="wolf-md-modal__status"
              initial={reduced ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <div className="wolf-md-modal__status-head">
                <BrokerLogoMark id={status.providerId || selected?.id || ''} name={status.providerName || ''} />
                <strong>● {status.message}</strong>
              </div>
              <span>Source: {status.providerName}</span>
              <span>Mode: {status.mode}</span>
              <span>Historical: {status.historical ? 'Available' : '—'}</span>
              <span>Live Quotes: {status.liveQuotes ? 'Available' : 'Not available'}</span>
              <span>Order Access: NOT ENABLED</span>
              {status.permissionNote && <span className="wolf-md-modal__note">{status.permissionNote}</span>}
              <p className="wolf-md-detect__hint">
                Scanner is broker-agnostic — it only sees normalized WOLF market data.
              </p>
              <div className="wolf-md-token__actions">
                <button type="button" className="ghost" onClick={() => void onDisconnect()} disabled={busy}>
                  Disconnect
                </button>
                <button type="button" className="primary" onClick={onClose}>
                  Continue to Radar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.p
            className="wolf-md-modal__error"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {error}
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}

function authLabel(p: CatalogProvider): string {
  if (p.isDemo) return 'None (demo)';
  if (p.id === 'indstocks') return 'Official access token';
  if (p.authenticationType === 'oauth2') return 'OAuth (not enabled)';
  return 'Unavailable';
}

function mechanismLabel(m: AuthorizationPlan['mechanism']): string {
  if (m === 'none') return 'Demo activate';
  if (m === 'oauth2') return 'Official OAuth';
  if (m === 'official_access_token') return 'Official API token';
  if (m === 'browser_extension') return 'Broker extension';
  return 'Unsupported';
}
