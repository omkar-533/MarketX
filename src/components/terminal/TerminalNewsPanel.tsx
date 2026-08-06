import { useEffect, useMemo, useState } from 'react';
import { getNews, type NewsItem } from '../../data/marketData';
import { pushTerminalNotification } from '../../services/terminalNotifications';
import TerminalPanelChrome from './TerminalPanelChrome';

export type TerminalNewsPanelProps = {
  onClose: () => void;
};

type ImpactFilter = 'All' | 'High' | 'Medium' | 'Low';

export default function TerminalNewsPanel({ onClose }: TerminalNewsPanelProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [impact, setImpact] = useState<ImpactFilter>('All');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const load = () => setItems(getNews());
    load();
    const id = window.setInterval(load, 12_000);
    return () => window.clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (impact !== 'All' && n.impact !== impact) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.source.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q)
      );
    });
  }, [items, impact, query]);

  return (
    <TerminalPanelChrome title="News" onClose={onClose}>
      <div className="wolf-term__rp-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search news…"
          aria-label="Search news"
        />
      </div>
      <div className="wolf-term__rp-tabs wolf-term__rp-tabs--wrap" role="tablist">
        {(['All', 'High', 'Medium', 'Low'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={impact === id}
            className={impact === id ? 'on' : ''}
            onClick={() => setImpact(id)}
          >
            {id}
          </button>
        ))}
      </div>

      <ul className="wolf-term__rp-list">
        {filtered.length ? (
          filtered.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className="wolf-term__rp-row wolf-term__rp-row--news"
                onClick={() =>
                  pushTerminalNotification({
                    kind: 'news',
                    title: n.title,
                    body: `${n.source} · ${n.category} · ${n.impact} impact`,
                    read: true,
                  })
                }
              >
                <span className="wolf-term__rp-row-main">
                  <b>
                    {n.title}
                    <i
                      className={`wolf-term__pill ${
                        n.impact === 'High'
                          ? 'wolf-term__pill--hot'
                          : n.impact === 'Medium'
                            ? 'wolf-term__pill--mid'
                            : 'wolf-term__pill--muted'
                      }`}
                    >
                      {n.impact}
                    </i>
                  </b>
                  <em>
                    {n.source} · {n.category} · {n.time}
                  </em>
                </span>
              </button>
            </li>
          ))
        ) : (
          <div className="wolf-term__rp-empty">
            {items.length ? 'No headlines match your filters.' : 'News quiet — waiting for live movers.'}
          </div>
        )}
      </ul>
    </TerminalPanelChrome>
  );
}
