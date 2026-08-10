/**
 * CONNECT MARKET DATA — select DEMO or (future) official broker OAuth.
 * No broker password / PIN / OTP forms.
 */
import { useEffect, useState } from 'react';
import { Link2, ShieldOff, X } from 'lucide-react';
import {
  connectDemoMarketData,
  disconnectMarketData,
  fetchMarketDataProviders,
  type CatalogProvider,
  type ServerConnectionStatus,
} from '../../../services/marketData/marketDataApi';
import { initMarketDataService } from '../../../services/marketData/MarketDataService';
import { mockMarketDataProvider } from '../../../services/radar/MockMarketDataProvider';

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

  useEffect(() => {
    if (!open) return;
    setError(null);
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
      // Offline / API down — still allow local DEMO scan
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

  const onSelect = async (p: CatalogProvider) => {
    if (busy) return;
    if (p.isDemo && p.enabled) {
      await activateDemo();
      return;
    }
    setError(
      p.enabled
        ? 'Official broker authorization is not configured yet.'
        : `${p.name} is not enabled. WOLF will not fake a connection.`,
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
            <button type="button" onClick={() => void onDisconnect()} disabled={busy}>
              Disconnect
            </button>
          </div>
        )}

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
              <small>{p.notes || (p.enabled ? 'Select to connect' : 'Official API not wired yet')}</small>
              {!p.enabled && !p.isDemo && (
                <span className="wolf-md-card__lock">
                  <ShieldOff size={12} /> No fake connect
                </span>
              )}
              {p.isDemo && (
                <span className="wolf-md-card__cta">
                  <Link2 size={12} /> Use demo data
                </span>
              )}
            </button>
          ))}
        </div>

        {error && <p className="wolf-md-modal__error">{error}</p>}
      </div>
    </div>
  );
}
