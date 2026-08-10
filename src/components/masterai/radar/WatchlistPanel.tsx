import { useState } from 'react';
import { Bookmark, Sparkles, Trash2 } from 'lucide-react';
import { loadLastResults, loadWatchlist, removeFromWatchlist } from '../../../services/radar/radarStore';
import { setPendingRadarAnalyze } from '../../../services/radar/radarBridge';
import type { WatchlistItem } from '../../../services/radar/radarTypes';

type Props = {
  onAnalyze: () => void;
  onOpenRadar: () => void;
};

export default function WatchlistPanel({ onAnalyze, onOpenRadar }: Props) {
  const [items, setItems] = useState<WatchlistItem[]>(() => loadWatchlist());

  const analyze = (item: WatchlistItem) => {
    const cached = loadLastResults().find((r) => r.symbol === item.symbol || r.id === item.resultId);
    if (cached) {
      setPendingRadarAnalyze(cached);
      onAnalyze();
      return;
    }
    onOpenRadar();
  };

  if (!items.length) {
    return (
      <div className="wolf-radar-desk wolf-radar-desk--panel">
        <header className="wolf-radar-desk__header">
          <div className="wolf-radar-desk__brand">
            <div className="wolf-radar-desk__title-row">
              <Bookmark size={18} className="text-gold" />
              <h1>WATCHLIST</h1>
            </div>
            <p className="wolf-radar-desk__subtitle">Setups you chose to keep an eye on.</p>
          </div>
        </header>
        <div className="wolf-radar-desk__empty">
          <p>Watchlist is empty</p>
          <span>Scan the market, then add only the charts worth your attention.</span>
          <button type="button" className="wolf-radar-desk__scan-btn" onClick={onOpenRadar}>
            OPEN WOLF RADAR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wolf-radar-desk wolf-radar-desk--panel">
      <header className="wolf-radar-desk__header">
        <div className="wolf-radar-desk__brand">
          <div className="wolf-radar-desk__title-row">
            <Bookmark size={18} className="text-gold" />
            <h1>WATCHLIST</h1>
          </div>
          <p className="wolf-radar-desk__subtitle">{items.length} symbols under watch</p>
        </div>
      </header>

      <div className="wolf-radar-desk__cards">
        {items.map((item) => (
          <article key={item.symbol} className="wolf-radar-desk__card">
            <div className="wolf-radar-desk__card-main" style={{ cursor: 'default' }}>
              <div className="wolf-radar-desk__card-top">
                <div>
                  <h3>{item.symbol}</h3>
                  <span className="price">
                    {item.setupType || 'Setup'} · {item.status || 'WATCH'}
                  </span>
                </div>
                {typeof item.score === 'number' && (
                  <div className="score">
                    <b>{item.score}</b>
                    <small>/100</small>
                  </div>
                )}
              </div>
              <time>
                Added {new Date(item.addedAt).toLocaleString('en-IN')}
                {item.lastDetectedAt
                  ? ` · Last detected ${new Date(item.lastDetectedAt).toLocaleTimeString('en-IN')}`
                  : ''}
              </time>
            </div>
            <div className="wolf-radar-desk__card-actions">
              <button type="button" className="primary" onClick={() => analyze(item)}>
                <Sparkles size={14} /> ANALYZE
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setItems(removeFromWatchlist(item.symbol))}
              >
                <Trash2 size={14} /> REMOVE
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
