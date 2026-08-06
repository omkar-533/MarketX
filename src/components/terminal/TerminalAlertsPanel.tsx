import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellPlus, Trash2 } from 'lucide-react';
import {
  addChartPriceAlert,
  CHART_ALERTS_CHANGED_EVENT,
  listChartPriceAlerts,
  removeChartPriceAlert,
  type ChartPriceAlert,
} from '../../services/chart/chartContextActions';
import { getAlerts, type AlertItem } from '../../data/marketData';
import { getFyersCachedQuote } from '../../services/fyersSocketClient';
import { pushTerminalNotification } from '../../services/terminalNotifications';
import { apiSymbolFromTv, tradingViewSymbolLabel } from '../../utils/tradingViewSymbols';
import TerminalPanelChrome from './TerminalPanelChrome';

export type TerminalAlertsPanelProps = {
  activeSymbol: string;
  onSelect: (tvSymbol: string) => void;
  onClose: () => void;
};

type Tab = 'price' | 'market';

function toTvSymbol(raw: string): string {
  const s = String(raw || '').toUpperCase();
  if (s.includes(':')) return s;
  if (/^(BTC|ETH|SOL|XRP)/.test(s)) return `BINANCE:${s.replace(/USDT$/, '')}USDT`;
  if (s === 'XAUUSD' || s === 'XAU') return 'OANDA:XAUUSD';
  return `NSE:${s.replace(/^NSE/, '')}`;
}

export default function TerminalAlertsPanel({
  activeSymbol,
  onSelect,
  onClose,
}: TerminalAlertsPanelProps) {
  const [tab, setTab] = useState<Tab>('price');
  const [priceAlerts, setPriceAlerts] = useState<ChartPriceAlert[]>(() => listChartPriceAlerts());
  const [marketAlerts, setMarketAlerts] = useState<AlertItem[]>([]);
  const [priceInput, setPriceInput] = useState('');
  const [condition, setCondition] = useState<'crossing' | 'above' | 'below'>('crossing');

  const refreshPrice = useCallback(() => setPriceAlerts(listChartPriceAlerts()), []);

  useEffect(() => {
    refreshPrice();
    const onChange = () => refreshPrice();
    window.addEventListener(CHART_ALERTS_CHANGED_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHART_ALERTS_CHANGED_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refreshPrice]);

  useEffect(() => {
    const load = () => setMarketAlerts(getAlerts());
    load();
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const api = apiSymbolFromTv(activeSymbol);
    const q = getFyersCachedQuote(api);
    if (q?.price) setPriceInput(String(Math.round(q.price * 100) / 100));
  }, [activeSymbol]);

  const label = useMemo(() => tradingViewSymbolLabel(activeSymbol), [activeSymbol]);

  const createAlert = () => {
    const px = Number(priceInput);
    if (!(px > 0)) return;
    const condLabel =
      condition === 'above'
        ? `Crossing up ${px.toLocaleString('en-IN')}`
        : condition === 'below'
          ? `Crossing down ${px.toLocaleString('en-IN')}`
          : `Crossing ${px.toLocaleString('en-IN')}`;
    const alert = addChartPriceAlert(activeSymbol, px, { condition: condLabel });
    pushTerminalNotification({
      kind: 'alert',
      title: `Alert set · ${label}`,
      body: condLabel,
      symbol: activeSymbol,
    });
    setPriceAlerts([alert, ...priceAlerts.filter((a) => a.id !== alert.id)]);
  };

  return (
    <TerminalPanelChrome title="Alerts" onClose={onClose}>
      <div className="wolf-term__rp-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'price'}
          className={tab === 'price' ? 'on' : ''}
          onClick={() => setTab('price')}
        >
          Price
          {priceAlerts.length ? <em>{priceAlerts.length}</em> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'market'}
          className={tab === 'market' ? 'on' : ''}
          onClick={() => setTab('market')}
        >
          Market
          {marketAlerts.length ? <em>{marketAlerts.length}</em> : null}
        </button>
      </div>

      {tab === 'price' ? (
        <>
          <div className="wolf-term__alert-create">
            <div className="wolf-term__alert-create-sym">{label}</div>
            <div className="wolf-term__alert-create-row">
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as typeof condition)}
                aria-label="Alert condition"
              >
                <option value="crossing">Crossing</option>
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
              <input
                type="number"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="Price"
                aria-label="Alert price"
              />
              <button type="button" className="wolf-term__alert-create-btn" onClick={createAlert} title="Create alert">
                <BellPlus className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="wolf-term__rp-hint">Right-click chart → Create alert, or set one here.</p>
          </div>

          <ul className="wolf-term__rp-list">
            {priceAlerts.length ? (
              priceAlerts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="wolf-term__rp-row"
                    onClick={() => onSelect(a.symbol)}
                  >
                    <span className="wolf-term__rp-row-main">
                      <b>{tradingViewSymbolLabel(a.symbol)}</b>
                      <em>{a.condition}</em>
                    </span>
                    <span className="wolf-term__rp-row-meta">
                      {new Date(a.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="wolf-term__rp-row-x"
                    title="Delete alert"
                    onClick={() => {
                      removeChartPriceAlert(a.id);
                      refreshPrice();
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))
            ) : (
              <div className="wolf-term__rp-empty">No price alerts yet. Create one above.</div>
            )}
          </ul>
        </>
      ) : (
        <ul className="wolf-term__rp-list">
          {marketAlerts.length ? (
            marketAlerts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="wolf-term__rp-row"
                  onClick={() => onSelect(toTvSymbol(a.symbol))}
                >
                  <span className="wolf-term__rp-row-main">
                    <b>
                      {a.symbol}
                      {a.triggered ? <i className="wolf-term__pill wolf-term__pill--hot">Live</i> : null}
                    </b>
                    <em>
                      {a.type} · {a.condition}
                    </em>
                  </span>
                  <span className="wolf-term__rp-row-meta">{a.time}</span>
                </button>
              </li>
            ))
          ) : (
            <div className="wolf-term__rp-empty">No market alerts while feed is quiet.</div>
          )}
        </ul>
      )}
    </TerminalPanelChrome>
  );
}
