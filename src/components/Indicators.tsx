import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  ImageOff,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { listIndicators, type IndicatorItem } from '../services/indicatorLibrary';
import { BRAND, BRAND_SHORT } from '../constants/brandLabels';
import { TRIAL_DAYS } from '../constants/plans';

function formatDate(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Indicators() {
  const [items, setItems] = useState<IndicatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<IndicatorItem | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const rows = await listIndicators();
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load indicators');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [active]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    );
  }, [items, query]);

  const copyLink = async () => {
    if (!active?.link) return;
    try {
      await navigator.clipboard.writeText(active.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="lux-lib">
      <header className="lux-lib__hero">
        <p className="lux-lib__eyebrow">The Algorithmic Library</p>
        <h1 className="lux-lib__title">Universal Indicator Library</h1>
        <p className="lux-lib__lead">
          Curated indicators — previewed, linked, and ready for your desk. {TRIAL_DAYS}-day demo
          included; longer access after approval.
        </p>
      </header>

      <div className="lux-lib__toolbar">
        <div className="lux-lib__filters">
          <span className="lux-lib__chip is-active">{BRAND_SHORT}</span>
          <span className="lux-lib__chip">TradingView</span>
          <span className="lux-lib__chip">Invite link</span>
        </div>
        <div className="lux-lib__search">
          <Search className="lux-lib__search-icon" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search indicators…"
            aria-label="Search indicators"
          />
        </div>
      </div>

      <p className="lux-lib__count">
        {loading ? 'Loading…' : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`}
      </p>
      <hr className="lux-lib__rule" />

      {loading ? (
        <div className="lux-lib__state">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading library…
        </div>
      ) : error ? (
        <div className="lux-lib__state lux-lib__state--error">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="lux-lib__state">
          {items.length === 0
            ? 'No indicators published yet. Add invite links from Admin → Indicators.'
            : 'No matches for that search.'}
        </div>
      ) : (
        <div className="lux-lib__grid">
          {filtered.map((item, idx) => (
            <motion.article
              key={item.id}
              className="lux-lib-card"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.32) }}
            >
              <button
                type="button"
                className="lux-lib-card__media"
                onClick={() => {
                  setCopied(false);
                  setActive(item);
                }}
                aria-label={`View ${item.title}`}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" loading="lazy" />
                ) : (
                  <span className="lux-lib-card__placeholder">
                    <ImageOff className="w-8 h-8" />
                  </span>
                )}
              </button>

              <div className="lux-lib-card__body">
                <p className="lux-lib-card__meta">
                  <span>{BRAND}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                </p>
                <h2 className="lux-lib-card__title">
                  <button
                    type="button"
                    onClick={() => {
                      setCopied(false);
                      setActive(item);
                    }}
                  >
                    {item.title}
                  </button>
                </h2>
                <p className="lux-lib-card__desc">
                  {item.description ||
                    'Open this indicator to get the invite link and use it on your chart.'}
                </p>
                <button
                  type="button"
                  className="lux-lib-card__cta"
                  onClick={() => {
                    setCopied(false);
                    setActive(item);
                  }}
                >
                  View indicator
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      <AnimatePresence>
        {active && (
          <motion.div
            className="lux-lib-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="lux-lib-modal__backdrop"
              aria-label="Close"
              onClick={() => setActive(null)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="indicator-detail-title"
              className="lux-lib-modal__panel"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.22 }}
            >
              <div className="lux-lib-modal__head">
                <div className="min-w-0">
                  <p className="lux-lib-card__meta">
                    <span>{BRAND}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={active.createdAt}>{formatDate(active.createdAt)}</time>
                  </p>
                  <h2 id="indicator-detail-title">{active.title}</h2>
                </div>
                <button
                  type="button"
                  className="lux-lib-modal__close"
                  onClick={() => setActive(null)}
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="lux-lib-modal__body">
                {active.imageUrl ? (
                  <div className="lux-lib-modal__media">
                    <img src={active.imageUrl} alt="" />
                  </div>
                ) : null}

                {active.description ? (
                  <p className="lux-lib-modal__desc">{active.description}</p>
                ) : null}

                {active.link ? (
                  <div className="lux-lib-modal__actions">
                    <a
                      href={active.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="lux-lib-modal__primary"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open indicator
                    </a>
                    <button
                      type="button"
                      className="lux-lib-modal__secondary"
                      onClick={() => void copyLink()}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                ) : (
                  <div className="lux-lib-modal__locked">
                    Link locked — your {TRIAL_DAYS}-day demo ended. Request access so the desk can
                    approve a longer plan.
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
