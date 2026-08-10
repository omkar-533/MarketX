/**
 * CONNECT MARKET DATA — DEMO or INDstocks token paste (server-side only).
 * No broker password / PIN / OTP / TOTP forms.
 */
import { useEffect, useState } from 'react';
import { Link2, ShieldOff, X } from 'lucide-react';
import {
  connectDemoMarketData,
  connectIndstocksMarketData,
  disconnectMarketData,
  fetchMarketDataProviders,
  type CatalogProvider,
  type ServerConnectionStatus,
} from '../../../services/marketData/marketDataApi';
import { initMarketDataService } from '../../../services/marketData/MarketDataService';
import { mockMarketDataProvider } from '../../../services/radar/MockMarketDataProvider';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';

type Props = {
  open: boolean;
  onClose: () => void;
  status: ServerConnectionStatus | null;
  onStatusChange: (s: ServerConnectionStatus) => void;
};

export default function ConnectMarketDataModal({
  open,
  onClose,
  status,
  onStatusChange,
}: Props) {
  const [providers, setProviders] = useState<CatalogProvider[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenStep, setTokenStep] = useState(false);
  const [tokenDraft, setTokenDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTokenStep(false);
    setTokenDraft('');
    void fetchMarketDataProviders()
      .then(setProviders)
      .catch(() =>
        setProviders([
          {
            id: 'mock-demo',
            name: 'Demo Market Data',
            authenticationType: 'none',
            supportedExchanges: ['NSE', 'BSE'],
            supportedTimeframes: ['1m', '5m', '15m', '1h', '1D'],
            capabilities: {
              historicalCandles: true,
              liveQuotes: false,
              bidAsk: false,
              marketDepth: false,
              instrumentList: true,
              marketStatus: true,
              orderExecution: false,
            },
            isDemo: true,
            enabled: true,
            notes: 'Local fallback catalog (API unreachable).',
          },
          {
            id: 'indstocks',
            name: 'INDstocks (INDMoney)',
            authenticationType: 'api_key_session',
            supportedExchanges: ['NSE', 'BSE', 'NFO'],
            supportedTimeframes: ['1m', '5m', '15m', '1h', '1D'],
            capabilities: {
              historicalCandles: true,
              liveQuotes: true,
              bidAsk: true,
              marketDepth: false,
              instrumentList: true,
              marketStatus: false,
              orderExecution: false,
            },
            isDemo: false,
            enabled: true,
            notes: 'Requires API server. Paste dashboard access token only.',
          },
          {
            id: 'sahi',
            name: 'Sahi',
            authenticationType: 'unavailable',
            supportedExchanges: [],
            supportedTimeframes: [],
            capabilities: {
              historicalCandles: false,
              liveQuotes: false,
              bidAsk: false,
              marketDepth: false,
              instrumentList: false,
              marketStatus: false,
              orderExecution: false,
            },
            isDemo: false,
            enabled: false,
            notes: 'No public developer API.',
          },
        ]),
      );
  }, [open]);

  if (!open) return null;

  const activateDemo = async () => {
    setBusy(true);
    setError(null);
    try {
      const view = await connectDemoMarketData();
      const svc = initMarketDataService(mockMarketDataProvider);
      await svc.connect();
      onStatusChange(view);
      onClose();
    } catch (e) {
      const svc = initMarketDataService(mockMarketDataProvider);
      await svc.connect();
      onStatusChange({
        status: 'CONNECTED',
        providerId: 'mock-demo',
        providerName: 'Demo Market Data',
        mode: 'DEMO',
        historical: true,
        liveQuotes: false,
        orderAccess: 'NOT ENABLED',
        message: 'DEMO MARKET DATA',
      });
      setError(e instanceof Error ? e.message : 'Connected locally (API unavailable)');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const activateIndstocks = async () => {
    const token = tokenDraft.trim();
    if (token.length < 12) {
      setError('Paste a valid INDstocks access token first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const view = await connectIndstocksMarketData(token);
      setTokenDraft('');
      const svc = initMarketDataService(serverMarketDataProvider);
      await svc.connect();
      onStatusChange(view);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'INDstocks connect failed');
    } finally {
      setBusy(false);
    }
  };

  const onSelect = async (p: CatalogProvider) => {
    if (busy) return;
    if (p.isDemo && p.enabled) {
      await activateDemo();
      return;
    }
    if (p.id === 'indstocks' && p.enabled) {
      setTokenStep(true);
      setError(null);
      return;
    }
    setError(
      p.enabled
        ? 'This provider is not configured yet.'
        : `${p.name} is not available. ${p.notes || 'No official public API.'}`,
    );
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      const view = await disconnectMarketData();
      try {
        const svc = initMarketDataService(mockMarketDataProvider);
        await svc.disconnect();
      } catch {
        /* ignore */
      }
      onStatusChange(view);
      setTokenStep(false);
      setTokenDraft('');
    } catch {
      onStatusChange({
        status: 'DISCONNECTED',
        providerId: null,
        providerName: null,
        mode: null,
        historical: false,
        liveQuotes: false,
        orderAccess: 'NOT ENABLED',
        message: 'MARKET DATA DISCONNECTED',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wolf-md-modal" role="dialog" aria-modal="true" aria-label="Connect Market Data">
      <button type="button" className="wolf-md-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div className="wolf-md-modal__panel">
        <header className="wolf-md-modal__head">
          <div>
            <h2>CONNECT MARKET DATA</h2>
            <p>Read-only market data for Radar & analysis. Order access is never enabled.</p>
          </div>
          <button type="button" className="wolf-md-modal__x" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        {status?.status === 'CONNECTED' && (
          <div className="wolf-md-modal__status">
            <strong>● {status.message}</strong>
            <span>Source: {status.providerName}</span>
            <span>Historical: {status.historical ? 'Available' : '—'}</span>
            <span>Live Quotes: {status.liveQuotes ? 'Available' : 'Not available'}</span>
            <span>Order Access: NOT ENABLED</span>
            {status.permissionNote && <span className="wolf-md-modal__note">{status.permissionNote}</span>}
            <button type="button" onClick={() => void onDisconnect()} disabled={busy}>
              Disconnect
            </button>
          </div>
        )}

        {tokenStep ? (
          <div className="wolf-md-token">
            <h3>INDstocks access token</h3>
            <ol>
              <li>
                Open{' '}
                <a
                  href="https://indstocks.com/app/api-trading/access-tokens"
                  target="_blank"
                  rel="noreferrer"
                >
                  indstocks.com → Access Tokens
                </a>
              </li>
              <li>Generate a token on their site (not inside WOLF)</li>
              <li>Paste it below — WOLF stores it encrypted on the server only</li>
            </ol>
            <p className="wolf-md-token__warn">
              Never enter MPIN, OTP, or TOTP here. Order Access stays NOT ENABLED — WOLF only
              requests market data.
            </p>
            <label>
              <span>Access token</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder="Paste token — not password"
              />
            </label>
            <div className="wolf-md-token__actions">
              <button type="button" className="ghost" onClick={() => setTokenStep(false)} disabled={busy}>
                Back
              </button>
              <button type="button" className="primary" onClick={() => void activateIndstocks()} disabled={busy}>
                {busy ? 'Connecting…' : 'Connect market data'}
              </button>
            </div>
          </div>
        ) : (
          <div className="wolf-md-modal__grid">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`wolf-md-card ${p.enabled ? 'is-enabled' : 'is-locked'} ${p.isDemo ? 'is-demo' : ''}`}
                onClick={() => void onSelect(p)}
                disabled={busy}
              >
                <div className="wolf-md-card__top">
                  <strong>{p.name}</strong>
                  {p.isDemo ? <em>DEMO</em> : p.enabled ? <em>READY</em> : <em>SOON</em>}
                </div>
                <ul>
                  <li>Historical: {p.capabilities.historicalCandles ? 'Yes' : 'No'}</li>
                  <li>Live quotes: {p.capabilities.liveQuotes ? 'Yes' : 'No'}</li>
                  <li>Exchanges: {p.supportedExchanges.join(', ') || '—'}</li>
                  <li>Order access: NOT ENABLED</li>
                </ul>
                <small>{p.notes || (p.enabled ? 'Select to connect' : 'Official API not available')}</small>
                {!p.enabled && (
                  <span className="wolf-md-card__lock">
                    <ShieldOff size={12} /> No fake connect
                  </span>
                )}
                {p.isDemo && (
                  <span className="wolf-md-card__cta">
                    <Link2 size={12} /> Use demo data
                  </span>
                )}
                {p.id === 'indstocks' && p.enabled && (
                  <span className="wolf-md-card__cta">
                    <Link2 size={12} /> Connect with token
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {error && <p className="wolf-md-modal__error">{error}</p>}
      </div>
    </div>
  );
}
