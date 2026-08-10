/**
 * CONNECT MARKET DATA wizard
 * Detect (catalog/preference) → Official authorize → Connected
 *
 * Detection ≠ authorization. No cookie scrape / password / OTP / TOTP.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link2, Radar, ShieldOff, X } from 'lucide-react';
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

type Props = {
  open: boolean;
  onClose: () => void;
  status: ServerConnectionStatus | null;
  onStatusChange: (s: ServerConnectionStatus) => void;
};

type Step = 'detect' | 'authorize' | 'connected';

export default function ConnectMarketDataModal({
  open,
  onClose,
  status,
  onStatusChange,
}: Props) {
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

  const preferredLabel = useMemo(() => {
    if (!detection?.lastPreferredId) return null;
    return detection.brokers.find((b) => b.id === detection.lastPreferredId)?.name || null;
  }, [detection]);

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
    // Clear token from React state immediately
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

  return (
    <div className="wolf-md-modal" role="dialog" aria-modal="true" aria-label="Connect Market Data">
      <button type="button" className="wolf-md-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div className="wolf-md-modal__panel">
        <header className="wolf-md-modal__head">
          <div>
            <h2>CONNECT MARKET DATA</h2>
            <p>Official broker authorization only · Order access never enabled</p>
          </div>
          <button type="button" className="wolf-md-modal__x" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <nav className="wolf-md-steps" aria-label="Connect steps">
          <span className={step === 'detect' ? 'is-on' : ''}>1 · Detect</span>
          <span className={step === 'authorize' ? 'is-on' : ''}>2 · Authorize</span>
          <span className={step === 'connected' ? 'is-on' : ''}>3 · Connected</span>
        </nav>

        {step === 'detect' && (
          <section className="wolf-md-detect">
            <div className="wolf-md-detect__banner">
              <Radar size={14} />
              <p>
                {detection?.message ||
                  'Listing supported market-data sources. Other-tab logins are never read.'}
              </p>
            </div>
            {preferredLabel && (
              <p className="wolf-md-detect__hint">
                Last preferred: <strong>{preferredLabel}</strong> (preference only — not a live
                session).
              </p>
            )}
            <div className="wolf-md-modal__grid">
              {(detection?.brokers || []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`wolf-md-card ${p.enabled ? 'is-enabled' : 'is-locked'} ${
                    p.isDemo ? 'is-demo' : ''
                  } ${selected?.id === p.id ? 'is-selected' : ''}`}
                  onClick={() => goAuthorize(p)}
                  disabled={busy}
                >
                  <div className="wolf-md-card__top">
                    <strong>{p.name}</strong>
                    {p.isDemo ? <em>DEMO</em> : p.enabled ? <em>SUPPORTED</em> : <em>UNSUPPORTED</em>}
                  </div>
                  <ul>
                    <li>Historical: {p.capabilities.historicalCandles ? 'Yes' : 'No'}</li>
                    <li>Quotes: {p.capabilities.liveQuotes ? 'Yes' : 'No'}</li>
                    <li>Auth: {authLabel(p)}</li>
                    <li>Order access: NOT ENABLED</li>
                  </ul>
                  <small>{p.notes}</small>
                  {!p.enabled && (
                    <span className="wolf-md-card__lock">
                      <ShieldOff size={12} /> No unofficial workaround
                    </span>
                  )}
                  {p.enabled && (
                    <span className="wolf-md-card__cta">
                      <Link2 size={12} /> Continue to authorize
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 'authorize' && plan && selected && (
          <section className="wolf-md-token">
            <h3>{plan.name}</h3>
            <p className="wolf-md-token__warn">
              Mechanism: <strong>{mechanismLabel(plan.mechanism)}</strong>
              {plan.canAuthorize
                ? ' · Detection is complete; authorization still required.'
                : ' · Cannot authorize without an official API.'}
            </p>
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
                  autoComplete="off"
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
                  {busy ? 'Authorizing…' : 'Authorize market data'}
                </button>
              )}
            </div>
          </section>
        )}

        {step === 'connected' && status?.status === 'CONNECTED' && (
          <div className="wolf-md-modal__status">
            <strong>● {status.message}</strong>
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
          </div>
        )}

        {error && <p className="wolf-md-modal__error">{error}</p>}
      </div>
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
