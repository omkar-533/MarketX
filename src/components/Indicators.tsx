import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ImageOff,
  Loader2,
  Search,
  Send,
} from 'lucide-react';
import { listIndicators, submitTradingViewAccess, type IndicatorItem } from '../services/indicatorLibrary';
import { BRAND, BRAND_SHORT } from '../constants/brandLabels';
import { TRIAL_DAYS } from '../constants/plans';

function formatDate(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Split admin description into overview + optional ## sections (Usage / Details / FAQ). */
function splitDescription(raw: string) {
  const text = String(raw || '').trim();
  if (!text) {
    return {
      overview:
        'This indicator is provided via invite link. Open access below to add it on TradingView and use it on your charts.',
      sections: [] as { title: string; body: string }[],
    };
  }

  const parts = text.split(/\n(?=##\s+)/);
  if (parts.length === 1) {
    return { overview: text, sections: [] as { title: string; body: string }[] };
  }

  const overview = parts[0].replace(/^##\s+.*\n?/, '').trim() || text;
  const sections = parts.slice(1).map((block) => {
    const lines = block.trim().split('\n');
    const title = lines[0].replace(/^##\s+/, '').trim() || 'Details';
    const body = lines.slice(1).join('\n').trim();
    return { title, body };
  });
  return { overview, sections };
}

export default function Indicators() {
  const [items, setItems] = useState<IndicatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<IndicatorItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [tvId, setTvId] = useState('');
  const [tvBusy, setTvBusy] = useState(false);
  const [tvMsg, setTvMsg] = useState('');
  const [tvErr, setTvErr] = useState('');
  const [tvDone, setTvDone] = useState(false);

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    );
  }, [items, query]);

  const detail = useMemo(
    () => (active ? splitDescription(active.description) : null),
    [active],
  );

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

  const openDetail = (item: IndicatorItem) => {
    setCopied(false);
    setTvId('');
    setTvMsg('');
    setTvErr('');
    setTvDone(false);
    setActive(item);
  };

  const submitTvAccess = async () => {
    if (!active) return;
    setTvBusy(true);
    setTvErr('');
    setTvMsg('');
    try {
      const result = await submitTradingViewAccess(active.id, tvId);
      setTvDone(true);
      setTvMsg(result.message);
    } catch (err) {
      setTvErr(err instanceof Error ? err.message : 'Could not submit');
    } finally {
      setTvBusy(false);
    }
  };

  if (active && detail) {
    return (
      <div className="lux-lib lux-ind">
        <button type="button" className="lux-ind__back" onClick={() => setActive(null)}>
          <ArrowLeft className="w-4 h-4" />
          All indicators
        </button>

        <header className="lux-ind__hero">
          <h1 className="lux-ind__title">{active.title}</h1>
          <p className="lux-ind__byline">
            By {BRAND}
            <span aria-hidden>·</span>
            <time dateTime={active.createdAt}>{formatDate(active.createdAt)}</time>
          </p>
        </header>

        <div className="lux-ind__layout">
          <div className="lux-ind__main">
            <div className="lux-ind__chart">
              {active.imageUrl ? (
                <img src={active.imageUrl} alt={`${active.title} chart preview`} />
              ) : (
                <div className="lux-ind__chart-empty">
                  <ImageOff className="w-10 h-10" />
                  <span>Chart preview</span>
                </div>
              )}
            </div>

            <div className="lux-ind__tags">
              <span className="lux-ind__tag">TradingView</span>
              <span className="lux-ind__tag">Invite link</span>
              <span className="lux-ind__tag">{BRAND_SHORT}</span>
            </div>

            <section className="lux-ind__section">
              <p className="lux-ind__overview">{detail.overview}</p>
            </section>

            {detail.sections.length > 0 ? (
              detail.sections.map((section) => (
                <section key={section.title} className="lux-ind__section">
                  <h2>{section.title}</h2>
                  <div className="lux-ind__prose">{section.body}</div>
                </section>
              ))
            ) : (
              <>
                <section className="lux-ind__section">
                  <h2>Usage</h2>
                  <div className="lux-ind__prose">
                    Open the invite link, add the indicator on TradingView, then apply it to your
                    chart. Use the preview image above as a reference for how setups are meant to
                    look.
                  </div>
                </section>
                <section className="lux-ind__section">
                  <h2>Details</h2>
                  <div className="lux-ind__prose">
                    This tool is distributed as a share / invite link rather than raw script code.
                    Access stays on during your demo window and extends after admin approval.
                  </div>
                </section>
              </>
            )}

            <section className="lux-ind__section lux-ind__faq">
              <h2>FAQ</h2>
              <div className="lux-ind__faq-item">
                <h3>How do I access this indicator?</h3>
                <p>
                  Enter your <strong>TradingView username</strong> in the form and submit. The desk
                  adds you manually on TradingView — you will see the invite in your TradingView
                  account.
                </p>
              </div>
              <div className="lux-ind__faq-item">
                <h3>What happens after the {TRIAL_DAYS}-day demo?</h3>
                <p>
                  Workspace access may lock when the demo ends. Submit a fresh request so the desk
                  can approve longer access.
                </p>
              </div>
            </section>

            <div className="lux-ind__footer-note">
              <span>Original indicator</span>
              <span>Shared by {BRAND}</span>
            </div>
          </div>

          <aside className="lux-ind__aside">
            <section className="lux-ind__access">
              <div className="lux-ind__access-copy">
                <h2>Get access</h2>
                <p>
                  Enter your TradingView username and submit your request. Our support team will
                  contact you within <strong>24 hours</strong>.
                </p>
              </div>

              {tvDone ? (
                <div className="lux-ind__tv-done">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="lux-ind__tv-done-title">Request received</p>
                    <p className="lux-ind__tv-done-body">
                      {tvMsg ||
                        'Your request has been received. Our support team will contact you within 24 hours.'}
                    </p>
                    <button
                      type="button"
                      className="lux-ind__tv-again"
                      onClick={() => {
                        setTvDone(false);
                        setTvId('');
                        setTvMsg('');
                      }}
                    >
                      Submit another ID
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  className="lux-ind__tv-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitTvAccess();
                  }}
                >
                  <label className="lux-ind__tv-label" htmlFor="tv-username">
                    TradingView user ID
                  </label>
                  <input
                    id="tv-username"
                    className="lux-ind__tv-input"
                    value={tvId}
                    onChange={(e) => setTvId(e.target.value)}
                    placeholder="e.g. your_tv_username"
                    autoComplete="username"
                    disabled={tvBusy}
                  />
                  <p className="lux-ind__tv-hint">
                    Open TradingView → profile → copy your username (not email).
                  </p>
                  {tvErr ? <p className="lux-ind__tv-error">{tvErr}</p> : null}
                  <button
                    type="submit"
                    className="lux-ind__btn lux-ind__btn--primary"
                    disabled={tvBusy || !tvId.trim()}
                  >
                    {tvBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {tvBusy ? 'Submitting…' : 'Submit for access'}
                  </button>
                </form>
              )}

              {active.link ? (
                <div className="lux-ind__access-actions lux-ind__access-actions--secondary">
                  <button
                    type="button"
                    className="lux-ind__btn lux-ind__btn--ghost"
                    onClick={() => void copyLink()}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied' : 'Copy invite link'}
                  </button>
                  <div className="lux-ind__platform">
                    <span className="lux-ind__platform-label">TradingView</span>
                    <a
                      href={active.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="lux-ind__platform-cta"
                    >
                      Open invite
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="lux-ind__locked">
                  Invite link locked until your desk access is approved. You can still submit your
                  TradingView ID above.
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    );
  }

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
                onClick={() => openDetail(item)}
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
                  <button type="button" onClick={() => openDetail(item)}>
                    {item.title}
                  </button>
                </h2>
                <p className="lux-lib-card__desc">
                  {item.description ||
                    'Open this indicator to get the invite link and use it on your chart.'}
                </p>
                <button type="button" className="lux-lib-card__cta" onClick={() => openDetail(item)}>
                  View indicator
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
}
