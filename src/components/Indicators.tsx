import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ImageOff,
  Loader2,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import { listIndicators, getTradingViewAccessStatus, submitTradingViewAccess, type IndicatorItem, type TvAccessStatusPayload } from '../services/indicatorLibrary';
import { BRAND, BRAND_SHORT } from '../constants/brandLabels';
import { openExternalUrl } from '../utils/openExternalUrl';
import ProtectedGuideVideo from './indicators/ProtectedGuideVideo';
import IndicatorSettingsForm from './indicators/IndicatorSettingsForm';
import WolfLoader from './WolfLoader';
import {
  loadIndicatorSettings,
  rememberStudySettingsSchema,
  saveIndicatorSettings,
} from '../services/wolfIndicatorSettings';
import { wolfStudyIdFor } from '../services/chart/wolfIndicators';
import { defaultsFromSettings } from '../services/pineSettings';

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

const spring = { type: 'spring' as const, stiffness: 380, damping: 26 };
const softSpring = { type: 'spring' as const, stiffness: 280, damping: 22 };

type IndicatorsProps = {
  openIndicatorId?: string | null;
  onOpenIndicatorConsumed?: () => void;
};

export default function Indicators({
  openIndicatorId = null,
  onOpenIndicatorConsumed,
}: IndicatorsProps) {
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
  const [tvFormOpen, setTvFormOpen] = useState(true);
  const [tvRequest, setTvRequest] = useState<TvAccessStatusPayload['request']>(null);
  const [inviteLink, setInviteLink] = useState('');
  const [memberSettings, setMemberSettings] = useState<
    Record<string, string | number | boolean>
  >({});
  const pinTvFormRef = useRef(false);

  const openDetail = useCallback((item: IndicatorItem) => {
    setCopied(false);
    setTvId('');
    setTvMsg('');
    setTvErr('');
    setTvDone(false);
    setTvFormOpen(true);
    setTvRequest(null);
    pinTvFormRef.current = false;
    setInviteLink(item.link || '');
    setActive(item);
    if (item.settings?.length) {
      const studyId = wolfStudyIdFor(item);
      rememberStudySettingsSchema(studyId, item.settings);
      setMemberSettings(loadIndicatorSettings(studyId, item.settings));
    } else {
      setMemberSettings(item.settingsDefaults || defaultsFromSettings(item.settings || []));
    }
  }, []);

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

  /** Deep-open from Approve popup / browser notification. */
  useEffect(() => {
    if (!openIndicatorId || loading || items.length === 0) return;
    const hit = items.find((item) => item.id === openIndicatorId);
    if (hit) openDetail(hit);
    onOpenIndicatorConsumed?.();
  }, [openIndicatorId, loading, items, onOpenIndicatorConsumed, openDetail]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const hit = items.find((item) => item.id === id);
      if (hit) openDetail(hit);
    };
    window.addEventListener('wolf:open-indicator', onOpen);
    return () => window.removeEventListener('wolf:open-indicator', onOpen);
  }, [items, openDetail]);

  /** Load + poll TV access while detail is open and status is pending. */
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: number | undefined;

    const pull = async () => {
      try {
        const status = await getTradingViewAccessStatus(active.id);
        if (cancelled) return;
        setTvRequest(status.request);
        if (status.inviteLink) {
          setInviteLink(status.inviteLink);
          setActive((prev) => (prev ? { ...prev, link: status.inviteLink } : prev));
        } else {
          setInviteLink('');
          setActive((prev) => (prev ? { ...prev, link: '' } : prev));
        }
        const reqStatus = status.request?.status || null;
        if (reqStatus === 'pending') {
          setTvDone(true);
          if (!pinTvFormRef.current) setTvFormOpen(false);
          setTvMsg('Waiting for desk approval — invite unlocks here after Approve.');
          timer = window.setTimeout(() => void pull(), 8000);
        } else if (reqStatus === 'granted') {
          setTvDone(true);
          if (!pinTvFormRef.current) setTvFormOpen(false);
          setTvMsg(
            status.inviteLink
              ? 'Access approved — open the invite link below.'
              : 'Approved on TradingView. The invite unlocks once your plan access is active.',
          );
        } else {
          setTvDone(false);
          setTvFormOpen(true);
        }
      } catch {
        // Keep polling so an approval is never missed because of a dropped request.
        if (!cancelled) timer = window.setTimeout(() => void pull(), 15000);
      }
    };

    void pull();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [active?.id]);

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

  const effectiveLink = inviteLink || active?.link || '';
  const requestStatus = tvRequest?.status || null;
  const waitingDesk = requestStatus === 'pending' && !tvFormOpen;
  const inviteReady = Boolean(effectiveLink);

  const copyLink = async () => {
    if (!effectiveLink) return;
    try {
      await navigator.clipboard.writeText(effectiveLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
      setTvErr('Could not copy — select the link and copy it manually.');
    }
  };

  const submitTvAccess = async () => {
    if (!active) return;
    setTvBusy(true);
    setTvErr('');
    setTvMsg('');
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission().catch(() => {});
      }
      const result = await submitTradingViewAccess(active.id, tvId);
      setTvDone(true);
      setTvFormOpen(false);
      pinTvFormRef.current = false;
      setTvMsg(result.message);
      setTvRequest(result.request);
      if (result.inviteLink) {
        setInviteLink(result.inviteLink);
        setActive((prev) => (prev ? { ...prev, link: result.inviteLink } : prev));
      } else {
        setInviteLink('');
        setActive((prev) => (prev ? { ...prev, link: '' } : prev));
      }
    } catch (err) {
      setTvErr(err instanceof Error ? err.message : 'Could not submit');
    } finally {
      setTvBusy(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {active && detail ? (
        <motion.div
          key={`detail-${active.id}`}
          className="lux-lib lux-ind"
          initial={{ opacity: 0, y: 22, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
          transition={softSpring}
        >
          <motion.button
            type="button"
            className="lux-ind__back"
            onClick={() => setActive(null)}
            whileHover={{ x: -4 }}
            whileTap={{ scale: 0.97 }}
          >
            <ArrowLeft className="w-4 h-4" />
            All indicators
          </motion.button>

          <motion.header
            className="lux-ind__hero"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, ...softSpring }}
          >
            <h1 className="lux-ind__title">{active.title}</h1>
            <p className="lux-ind__byline">By {BRAND}</p>
          </motion.header>

          <div className="lux-ind__layout">
            <motion.div
              className="lux-ind__main"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, ...softSpring }}
            >
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
                <button
                  type="button"
                  className="lux-ind__tag-cta"
                  onClick={() => {
                    const el = document.getElementById('lux-ind-access');
                    if (!el) return;
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    el.classList.add('is-pulse');
                    window.setTimeout(() => el.classList.remove('is-pulse'), 1400);
                  }}
                >
                  {waitingDesk
                    ? 'View status'
                    : 'Get access'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {active.howToVideoUrl ? (
                <ProtectedGuideVideo url={active.howToVideoUrl} title={active.title} />
              ) : null}

              <section className="lux-ind__section">
                <p className="lux-ind__overview">{detail.overview}</p>
              </section>

              {active.settings && active.settings.length > 0 ? (
                <section className="lux-ind__section">
                  <h2>Settings</h2>
                  <p className="lux-ind__prose" style={{ marginBottom: 12 }}>
                    Tune inputs for this indicator. Source code is never shown — only these settings.
                  </p>
                  <IndicatorSettingsForm
                    fields={active.settings}
                    values={memberSettings}
                    onChange={(next) => {
                      setMemberSettings(next);
                      saveIndicatorSettings(wolfStudyIdFor(active), next);
                    }}
                  />
                </section>
              ) : null}

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
                      This tool is distributed via invite access. Settings above control how you
                      apply it — raw script code is never exposed in the app.
                    </div>
                  </section>
                </>
              )}

              <section className="lux-ind__section lux-ind__faq">
                <h2>FAQ</h2>
                <div className="lux-ind__faq-item">
                  <h3>How do I access this indicator?</h3>
                  <p>
                    Submit your TradingView username in Get access. After the desk adds you on
                    TradingView, open the invite link and apply the indicator on your chart.
                  </p>
                </div>
                <div className="lux-ind__faq-item">
                  <h3>How do I get full indicator access?</h3>
                  <p>
                    Buy a plan via Call or WhatsApp, or submit demat + F&amp;O verification so the
                    desk can approve longer access.
                  </p>
                </div>
              </section>

              <div className="lux-ind__footer-note">
                <span>Original indicator</span>
                <span>Shared by {BRAND}</span>
              </div>
            </motion.div>

            <motion.aside
              className="lux-ind__aside"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.16, ...softSpring }}
            >
              <section className="lux-ind__access" id="lux-ind-access">
                <div className="lux-ind__access-copy">
                  <h2>Get access</h2>
                  <p>
                    {waitingDesk
                      ? 'Request is with the desk. Invite unlocks here as soon as they Approve.'
                      : inviteReady
                        ? 'Submit your TradingView username so the desk can add you, then open the invite on TradingView.'
                        : 'Enter your TradingView username and submit. After the desk adds you on TradingView, the invite unlocks here.'}
                  </p>
                </div>

                {waitingDesk ? (
                  <div className="lux-ind__tv-done">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <p className="lux-ind__tv-done-title">Pending approval</p>
                      <p className="lux-ind__tv-done-body">
                        {tvMsg ||
                          'Waiting for desk approval — invite unlocks here after Approve.'}
                        {tvRequest?.tradingViewId
                          ? ` Submitted as @${tvRequest.tradingViewId.replace(/^@/, '')}.`
                          : ''}
                      </p>
                      <button
                        type="button"
                        className="lux-ind__tv-again"
                        onClick={() => {
                          pinTvFormRef.current = true;
                          setTvFormOpen(true);
                          setTvDone(false);
                          setTvId(tvRequest?.tradingViewId || '');
                          setTvMsg('');
                        }}
                      >
                        Change TradingView ID
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
                    {tvDone && tvMsg && requestStatus !== 'pending' ? (
                      <p className="lux-ind__tv-hint">{tvMsg}</p>
                    ) : null}
                    <motion.button
                      type="submit"
                      className="lux-ind__btn lux-ind__btn--primary"
                      disabled={tvBusy || !tvId.trim()}
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      {tvBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {tvBusy ? 'Submitting…' : 'Submit for access'}
                    </motion.button>
                  </form>
                )}

                {inviteReady ? (
                  <div className="lux-ind__access-actions">
                    <button
                      type="button"
                      className="lux-ind__btn lux-ind__btn--primary"
                      style={{ justifyContent: 'center' }}
                      onClick={() => {
                        if (!openExternalUrl(effectiveLink)) {
                          setTvErr('Could not open the invite — copy the link and paste it in a new tab.');
                        }
                      }}
                    >
                      Open indicator
                      <ArrowRight className="w-4 h-4" />
                    </button>
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
                    </div>
                  </div>
                ) : (
                  <div className="lux-ind__locked">
                    {waitingDesk
                      ? 'Invite locked until the desk Approves your request.'
                      : 'Submit your TradingView ID above. Invite unlocks after desk approval.'}
                  </div>
                )}
              </section>
            </motion.aside>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="library"
          className="lux-lib lux-lib--desk"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.28 }}
        >
          <header className="lux-lib__hero">
            <div className="lux-lib__hero-orb lux-lib__hero-orb--a" aria-hidden />
            <div className="lux-lib__hero-orb lux-lib__hero-orb--b" aria-hidden />
            <motion.p
              className="lux-lib__eyebrow"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, ...spring }}
            >
              <Sparkles className="w-3 h-3" />
              The Algorithmic Library
            </motion.p>
            <motion.h1
              className="lux-lib__title"
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1, ...softSpring }}
            >
              Universal Indicator Library
            </motion.h1>
            <motion.p
              className="lux-lib__lead"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, ...softSpring }}
            >
              Curated indicators — previewed, linked, and ready for your desk.
            </motion.p>
          </header>

          <motion.div
            className="lux-lib__toolbar"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, ...softSpring }}
          >
            <div className="lux-lib__filters">
              {[
                { label: BRAND_SHORT, active: true },
                { label: 'TradingView', active: false },
                { label: 'Invite link', active: false },
              ].map((chip, i) => (
                <motion.span
                  key={chip.label}
                  className={`lux-lib__chip ${chip.active ? 'is-active' : ''}`}
                  initial={{ opacity: 0, scale: 0.85, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 0.24 + i * 0.05, ...spring }}
                  whileHover={{ y: -2, scale: 1.04 }}
                >
                  {chip.label}
                </motion.span>
              ))}
            </div>
            <motion.div className="lux-lib__search" whileHover={{ scale: 1.01 }}>
              <Search className="lux-lib__search-icon" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search indicators…"
                aria-label="Search indicators"
              />
            </motion.div>
          </motion.div>

          <motion.p
            className="lux-lib__count"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.28 }}
          >
            {loading ? 'Loading…' : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`}
          </motion.p>
          <hr className="lux-lib__rule" />

          {loading ? (
            <div className="lux-lib__state lux-lib__state--wolf">
              <WolfLoader fullscreen={false} label="Loading Wolf Library" />
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
            <motion.div
              className="lux-lib__grid"
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
              }}
            >
              {filtered.map((item) => (
                <motion.article
                  key={item.id}
                  className="lux-lib-card"
                  variants={{
                    hidden: { opacity: 0, y: 28, scale: 0.92, rotateX: 12 },
                    show: {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      rotateX: 0,
                      transition: spring,
                    },
                  }}
                  whileHover={{
                    y: -10,
                    scale: 1.025,
                    rotateX: -4,
                    rotateY: 2,
                    transition: { type: 'spring', stiffness: 420, damping: 22 },
                  }}
                  whileTap={{ scale: 0.985 }}
                  style={{ transformPerspective: 900 }}
                >
                  <span className="lux-lib-card__glow" aria-hidden />
                  <span className="lux-lib-card__shine" aria-hidden />

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
                    <span className="lux-lib-card__media-veil" aria-hidden />
                  </button>

                  <div className="lux-lib-card__body">
                    <p className="lux-lib-card__meta">
                      <span>{BRAND}</span>
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
                    <motion.button
                      type="button"
                      className="lux-lib-card__cta"
                      onClick={() => openDetail(item)}
                      whileHover={{ x: 4 }}
                    >
                      View indicator
                      <ArrowRight className="w-3.5 h-3.5" />
                    </motion.button>
                  </div>
                </motion.article>
              ))}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
