import { useEffect, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { getGainers, getLosers, getMostActive, type StockData } from '../../data/marketData';
import { getCachedScreenerRows, subscribeScreenerFeed } from '../../services/screenerLiveService';
import { refreshScreenerFeedAsync } from '../../services/screenerDataService';
import {
  runTradefinderScan,
  TRADEFINDER_SCREENERS,
  type ScanHit,
} from '../../services/tradefinderScreeners';
import { pushTerminalNotification } from '../../services/terminalNotifications';
import TerminalPanelChrome from './TerminalPanelChrome';

export type TerminalScreenersPanelProps = {
  onSelect: (tvSymbol: string) => void;
  onClose: () => void;
};

type Mode = 'gainers' | 'losers' | 'active' | 'wolf';

function toTv(symbol: string): string {
  const s = String(symbol || '').toUpperCase();
  if (s.includes(':')) return s;
  return `NSE:${s}`;
}

export default function TerminalScreenersPanel({ onSelect, onClose }: TerminalScreenersPanelProps) {
  const [mode, setMode] = useState<Mode>('gainers');
  const [scanId, setScanId] = useState(TRADEFINDER_SCREENERS[0]?.id || 'insider-strategy');
  const [hits, setHits] = useState<ScanHit[]>([]);
  const [movers, setMovers] = useState<StockData[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === 'wolf') return;
    const load = () => {
      if (mode === 'gainers') setMovers(getGainers(20));
      else if (mode === 'losers') setMovers(getLosers(20));
      else setMovers(getMostActive(20));
    };
    load();
    const id = window.setInterval(load, 12_000);
    return () => window.clearInterval(id);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'wolf') return;
    let alive = true;
    const run = async () => {
      setBusy(true);
      try {
        await refreshScreenerFeedAsync();
        const rows = getCachedScreenerRows();
        const result = runTradefinderScan(rows, scanId, '15m', 24);
        if (alive) setHits(result?.hits ?? []);
      } finally {
        if (alive) setBusy(false);
      }
    };
    void run();
    const unsub = subscribeScreenerFeed(() => {
      const rows = getCachedScreenerRows();
      const result = runTradefinderScan(rows, scanId, '15m', 24);
      setHits(result?.hits ?? []);
    });
    const id = window.setInterval(() => void run(), 45_000);
    return () => {
      alive = false;
      unsub();
      window.clearInterval(id);
    };
  }, [mode, scanId]);

  const scanMeta = useMemo(
    () => TRADEFINDER_SCREENERS.find((s) => s.id === scanId),
    [scanId],
  );

  return (
    <TerminalPanelChrome title="Screeners" onClose={onClose}>
      <div className="wolf-term__rp-tabs wolf-term__rp-tabs--wrap" role="tablist">
        {(
          [
            ['gainers', 'Gainers'],
            ['losers', 'Losers'],
            ['active', 'Volume'],
            ['wolf', 'Wolf'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={mode === id ? 'on' : ''}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'wolf' ? (
        <>
          <div className="wolf-term__screen-pick">
            <select
              value={scanId}
              onChange={(e) => setScanId(e.target.value)}
              aria-label="Wolf screener"
            >
              {TRADEFINDER_SCREENERS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {scanMeta ? <p className="wolf-term__rp-hint">{scanMeta.tagline}</p> : null}
          </div>
          <ul className="wolf-term__rp-list">
            {busy && !hits.length ? <div className="wolf-term__rp-empty">Scanning universe…</div> : null}
            {!busy && !hits.length ? (
              <div className="wolf-term__rp-empty">No hits on 15m right now — try another scan.</div>
            ) : null}
            {hits.map((hit) => {
              const up = hit.direction === 'bullish';
              return (
                <li key={`${hit.symbol}-${hit.strength}`}>
                  <button
                    type="button"
                    className="wolf-term__rp-row"
                    onClick={() => {
                      onSelect(toTv(hit.symbol));
                      pushTerminalNotification({
                        kind: 'screener',
                        title: `${scanMeta?.name || 'Scan'} · ${hit.symbol}`,
                        body: `${up ? 'Bullish' : 'Bearish'} · strength ${hit.strength}`,
                        symbol: toTv(hit.symbol),
                        read: true,
                      });
                    }}
                  >
                    <span className="wolf-term__rp-row-main">
                      <b>
                        {up ? (
                          <TrendingUp className="wolf-term__rp-dir up" />
                        ) : (
                          <TrendingDown className="wolf-term__rp-dir down" />
                        )}
                        {hit.symbol}
                      </b>
                      <em>
                        {hit.name} · {hit.strength}/100
                      </em>
                    </span>
                    <span className={`wolf-term__rp-row-meta ${hit.changePercent >= 0 ? 'up' : 'down'}`}>
                      {hit.changePercent >= 0 ? '+' : ''}
                      {hit.changePercent.toFixed(2)}%
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <ul className="wolf-term__rp-list">
          {movers.length ? (
            movers.map((row) => (
              <li key={row.symbol}>
                <button
                  type="button"
                  className="wolf-term__rp-row"
                  onClick={() => onSelect(toTv(row.symbol))}
                >
                  <span className="wolf-term__rp-row-main">
                    <b>{row.symbol}</b>
                    <em>{row.name}</em>
                  </span>
                  <span className="wolf-term__rp-row-side">
                    <strong>₹{row.price.toLocaleString('en-IN')}</strong>
                    <span className={row.changePercent >= 0 ? 'up' : 'down'}>
                      {row.changePercent >= 0 ? '+' : ''}
                      {row.changePercent.toFixed(2)}%
                    </span>
                  </span>
                </button>
              </li>
            ))
          ) : (
            <div className="wolf-term__rp-empty">Movers feed offline — reconnect market data.</div>
          )}
        </ul>
      )}
    </TerminalPanelChrome>
  );
}
