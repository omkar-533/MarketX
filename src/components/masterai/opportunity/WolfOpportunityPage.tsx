/**
 * WOLF OPPORTUNITY — every scanner kept; Long / Short split inside each.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crosshair,
  RefreshCw,
  X,
  Link2,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { getMarketSession, istCalendarDay } from '../../../utils/marketHours';
import { fetchMarketDataStatus, isIndstocksLive, clearLiveCandleCache } from '../../../services/marketData/marketDataApi';
import { initMarketDataService } from '../../../services/marketData/MarketDataService';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';
import type { MarketDataProvider } from '../../../services/radar/MarketDataProvider';
import { runOpportunityScan, type RunOpportunityOptions } from '../../../services/opportunity/opportunityEngine';
import { opportunityToRadarResult } from '../../../services/opportunity/opportunityBridge';
import {
  loadOpportunityFilters,
  saveOpportunityFilters,
  clearOpportunityDayBoard,
  applyLiveScanCards,
  rankHitsByScore,
  emptyOpportunityCards,
} from '../../../services/opportunity/opportunityStore';
import type {
  DataFeedStatus,
  IndexPulse,
  OpportunityDirection,
  OpportunityFilters,
  OpportunityHit,
  ScannerCardState,
} from '../../../services/opportunity/opportunityTypes';
import {
  OPPORTUNITY_SCAN_CAP,
} from '../../../services/opportunity/opportunityTypes';
import { openLiveWolfFromRadarResult } from '../../../services/live/liveBridge';
import AppLink from '../../AppLink';
import { liveWolfQuery } from '../../../utils/appNav';

function prettyTitle(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function biasOf(hit: OpportunityHit): OpportunityDirection {
  if (hit.direction === 'bullish' || hit.direction === 'bearish') return hit.direction;
  if ((hit.changePercent || 0) > 0) return 'bullish';
  if ((hit.changePercent || 0) < 0) return 'bearish';
  return 'neutral';
}

function formatHitPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '—';
  return price.toLocaleString('en-IN', {
    maximumFractionDigits: price >= 100 ? 2 : 3,
    minimumFractionDigits: 2,
  });
}

function formatHitClock(ms: number): string {
  const t0 = ms > 0 && ms < 1e11 ? ms * 1000 : ms;
  if (!Number.isFinite(t0) || t0 <= 0) return '—';
  if (t0 > Date.now() + 2_000) return '—';
  const day = istCalendarDay(new Date(t0));
  const open = Date.parse(`${day}T09:15:00+05:30`);
  const close = Date.parse(`${day}T15:30:00+05:30`);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return '—';
  const t = t0 > close ? close : t0 < open ? open : t0;
  if (Date.now() - t > 10 * 86_400_000) return '—';
  return new Date(t).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

function BiasBadge({ dir, size = 'md' }: { dir: OpportunityDirection; size?: 'sm' | 'md' }) {
  const label = dir === 'bullish' ? 'Long' : dir === 'bearish' ? 'Short' : 'Neutral';
  const Icon = dir === 'bullish' ? TrendingUp : dir === 'bearish' ? TrendingDown : Minus;
  return (
    <span className={`wolf-opp__bias wolf-opp__bias--${dir} wolf-opp__bias--${size}`}>
      <Icon size={size === 'sm' ? 11 : 13} strokeWidth={2.5} />
      {label}
    </span>
  );
}

type Props = {
  onOpenWolfAi: () => void;
  onOpenLive?: () => void;
  onConnectData?: () => void;
  /** Parent already has a LIVE INDstocks session — do not reopen the connect modal. */
  liveHint?: boolean;
  /** Bump after a successful connect so the desk rescans without remounting. */
  rescanToken?: number;
  /** Wait until the route has read INDstocks status once. */
  sessionKnown?: boolean;
};

function resolveLiveProvider(): typeof serverMarketDataProvider | null {
  return serverMarketDataProvider;
}

function Seg({
  on,
  children,
  onClick,
}: {
  on?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`wolf-opp__seg ${on ? 'is-on' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function HitTile({
  hit,
  onOpen,
  onWhy,
  onChart,
}: {
  hit: OpportunityHit;
  onOpen: () => void;
  onWhy: () => void;
  onChart: () => void;
}) {
  const bias = biasOf(hit);
  const q = liveWolfQuery(hit);
  return (
    <article className={`wolf-opp__tile is-${bias}`}>
      <AppLink to="live-wolf" query={q} className="wolf-opp__tile-main" onActivate={onOpen}>
        <span className="wolf-opp__tile-sym">{hit.symbol}</span>
        <span className={`wolf-opp__tile-chg ${(hit.changePercent || 0) >= 0 ? 'up' : 'down'}`}>
          {hit.changePercent >= 0 ? '+' : ''}
          {hit.changePercent.toFixed(2)}%
        </span>
        <span className="wolf-opp__tile-px">₹{formatHitPrice(hit.price)}</span>
        <span className="wolf-opp__tile-score">{hit.score}</span>
        <span className="wolf-opp__tile-meta">
          <BiasBadge dir={bias} size="sm" />
          <em>Created {formatHitClock(hit.detectedAt)} IST</em>
        </span>
      </AppLink>
      <div className="wolf-opp__tile-actions">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onWhy();
          }}
        >
          Why
        </button>
        <AppLink
          to="live-wolf"
          query={q}
          onActivate={onChart}
          onClick={(e) => e.stopPropagation()}
        >
          <Crosshair size={12} /> Chart
        </AppLink>
      </div>
    </article>
  );
}

export default function WolfOpportunityPage({
  onOpenWolfAi,
  onOpenLive,
  onConnectData,
  liveHint = false,
  rescanToken = 0,
  sessionKnown = true,
}: Props) {
  const [filters, setFilters] = useState<OpportunityFilters>(() => loadOpportunityFilters());
  const [cards, setCards] = useState<ScannerCardState[]>(() => emptyOpportunityCards());
  const [feedStatus, setFeedStatus] = useState<DataFeedStatus>('OFFLINE');
  const [dataMode, setDataMode] = useState<'LIVE' | 'DEMO'>('DEMO');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState('');
  const [bgBusy, setBgBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [indices, setIndices] = useState<IndexPulse[]>([
    { symbol: 'NIFTY', price: null, changePercent: null, available: false },
    { symbol: 'BANKNIFTY', price: null, changePercent: null, available: false },
    { symbol: 'SENSEX', price: null, changePercent: null, available: false },
  ]);
  const [selected, setSelected] = useState<OpportunityHit | null>(null);
  const [whyHit, setWhyHit] = useState<OpportunityHit | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scanningRef = useRef(false);
  const scanGenRef = useRef(0);
  const lastProgAtRef = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const marketOpen = getMarketSession('NSE:NIFTY').open;

  const patchFilters = useCallback((patch: Partial<OpportunityFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      saveOpportunityFilters(next);
      return next;
    });
  }, []);

  const refreshIndices = useCallback(async (provider: MarketDataProvider) => {
    const syms = ['NIFTY', 'BANKNIFTY', 'SENSEX'] as const;
    const next = await Promise.all(
      syms.map(async (symbol) => {
        try {
          const q = await provider.getQuote(symbol);
          const price = Number(q.price) || Number((q as { lastPrice?: number }).lastPrice) || 0;
          return {
            symbol,
            price: price > 0 ? price : null,
            changePercent: Number.isFinite(q.changePercent) ? q.changePercent : null,
            available: price > 0,
          } satisfies IndexPulse;
        } catch {
          return { symbol, price: null, changePercent: null, available: false } satisfies IndexPulse;
        }
      }),
    );
    setIndices(next);
  }, []);

  const runScan = useCallback(
    async (opts?: {
      quiet?: boolean;
      reset?: boolean;
      filtersOverride?: Partial<OpportunityFilters>;
    }) => {
      const quiet = Boolean(opts?.quiet);
      const fresh = !quiet;
      const activeFilters = { ...filters, ...opts?.filtersOverride };
      if (quiet && scanningRef.current) return;
      if (!quiet) abortRef.current?.abort();
      else if (scanningRef.current) return;

      const ac = new AbortController();
      abortRef.current = ac;
      const gen = ++scanGenRef.current;
      const isStale = () => scanGenRef.current !== gen || ac.signal.aborted;
      scanningRef.current = true;
      if (quiet) setBgBusy(true);
      else {
        setScanning(true);
        setProgress('Fetching live market…');
        clearOpportunityDayBoard();
        clearLiveCandleCache();
        setCards(emptyOpportunityCards());
        setLastUpdated(null);
      }

      let live = liveHint;
      try {
        const s = await fetchMarketDataStatus();
        live = isIndstocksLive(s) || liveHint;
        if (live) {
          setFeedStatus('LIVE');
          await initMarketDataService(serverMarketDataProvider).connect();
        } else {
          setFeedStatus(s.status === 'CONNECTED' && s.mode === 'DEMO' ? 'DEMO' : 'OFFLINE');
        }
      } catch {
        if (liveHint) {
          live = true;
          setFeedStatus('LIVE');
        } else {
          setFeedStatus('OFFLINE');
        }
      }

      if (!live) {
        setDataMode('DEMO');
        setScanning(false);
        setBgBusy(false);
        scanningRef.current = false;
        setProgress('Connect INDstocks for live scan — demo prices are off');
        if (!quiet && !liveHint) onConnectData?.();
        return;
      }

      const provider = resolveLiveProvider();
      setDataMode('LIVE');
      void refreshIndices(provider);

      try {
        const scanOpts: RunOpportunityOptions = {
          signal: ac.signal,
          topN: OPPORTUNITY_SCAN_CAP,
          freshCandles: fresh,
          onProgress: (p) => {
            if (quiet) return;
            const now = Date.now();
            if (p.status === 'scanning' && now - lastProgAtRef.current < 220) return;
            lastProgAtRef.current = now;
            setProgress(
              p.status === 'scanning'
                ? `Hunting ${p.symbolsChecked}/${p.symbolsTotal}`
                : p.phase,
            );
          },
          onCard: (card) => {
            if (isStale() || card.status !== 'unavailable') return;
            setCards((prev) => prev.map((c) => (c.scannerId === card.scannerId ? card : c)));
          },
        };
        let out = await runOpportunityScan(activeFilters, scanOpts, provider);
        if (!isStale() && !out.complete && !ac.signal.aborted) {
          if (!quiet) setProgress('Full scan needed — hunting again…');
          out = await runOpportunityScan(activeFilters, scanOpts, provider);
        }
        if (!isStale() && out.complete) {
          setCards(
            applyLiveScanCards(out.cards).map((card) => ({
              ...card,
              hits: card.hits.filter((h) => h.timeframe === activeFilters.timeframe),
            })),
          );
          setDataMode(out.dataMode);
          setLastUpdated(Date.now());
          if (!quiet) setProgress(`${out.hits.length} setups ready`);
        } else if (!isStale() && !out.complete && !quiet) {
          setProgress('Waiting for a full live scan…');
        }
      } catch (e) {
        if (!isStale()) {
          if (!quiet) setProgress(e instanceof Error ? e.message : 'Scan failed');
          setFeedStatus((f) => (f === 'LIVE' ? 'DELAYED' : f));
        }
      } finally {
        if (scanGenRef.current === gen) {
          scanningRef.current = false;
          setScanning(false);
          setBgBusy(false);
        }
      }
    },
    [filters, refreshIndices, feedStatus, liveHint],
  );

  useEffect(() => {
    if (!sessionKnown) return;
    void runScan({ reset: true, fresh: true });
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKnown, liveHint, rescanToken]);

  useEffect(() => {
    if (!filters.autoRefresh) return;
    const id = window.setInterval(() => void runScan({ quiet: true }), filters.refreshSec * 1000);
    return () => window.clearInterval(id);
  }, [filters.autoRefresh, filters.refreshSec, runScan]);

  const openAnalyze = (hit: OpportunityHit) => {
    openLiveWolfFromRadarResult(opportunityToRadarResult(hit));
    onOpenLive?.();
    onOpenWolfAi();
  };

  const openChart = (hit: OpportunityHit) => {
    openLiveWolfFromRadarResult(opportunityToRadarResult(hit));
    onOpenLive?.();
  };

  const liveOk = feedStatus === 'LIVE';
  const hitCount = cards.reduce(
    (n, c) => n + c.hits.filter((h) => h.timeframe === filters.timeframe).length,
    0,
  );
  const showLong = filters.direction !== 'bearish';
  const showShort = filters.direction !== 'bullish';

  return (
    <div className="wolf-opp wolf-opp--sheets">
      <div className="wolf-opp__stage" aria-hidden>
        <div className="wolf-opp__fog" />
      </div>

      <motion.header
        className="wolf-opp__hero wolf-opp__hero--slim"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="wolf-opp__hero-copy">
          <p className="wolf-opp__eyebrow">Wolf Trade AI</p>
          <h1 className="wolf-opp__title">
            <span>Opportunity</span>
          </h1>
          <p className="wolf-opp__lead">Every scanner. Long and short, kept apart.</p>
        </div>

        <div className="wolf-opp__pulse">
          <span className={`wolf-opp__mkt ${marketOpen ? 'is-open' : 'is-closed'}`}>
            {marketOpen ? 'Market open' : 'Market closed'}
          </span>
          {indices.map((ix) => (
            <div key={ix.symbol} className="wolf-opp__ix">
              <b>{ix.symbol === 'BANKNIFTY' ? 'BN' : ix.symbol}</b>
              <em className={(ix.changePercent || 0) >= 0 ? 'up' : 'down'}>
                {ix.available && ix.changePercent != null
                  ? `${ix.changePercent >= 0 ? '+' : ''}${ix.changePercent.toFixed(2)}%`
                  : '—'}
              </em>
            </div>
          ))}
        </div>

        <div className="wolf-opp__hero-actions">
          <div className={`wolf-opp__feed ${liveOk ? 'is-live' : ''}`}>
            {liveOk ? 'Live feed' : dataMode === 'DEMO' ? 'Demo mode' : 'Connect for live'}
            {bgBusy ? ' · syncing' : ''}
          </div>
          <button
            type="button"
            className="wolf-opp__icon-btn"
            onClick={() => void runScan({ reset: false })}
            disabled={scanning}
            title="Refresh"
          >
            <RefreshCw size={15} className={scanning ? 'is-spin' : ''} />
          </button>
          {onConnectData && !liveOk ? (
            <button type="button" className="wolf-opp__cta" onClick={onConnectData}>
              <Link2 size={14} /> Connect live
            </button>
          ) : null}
        </div>
      </motion.header>

      <motion.nav
        className="wolf-opp__controls"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.45 }}
      >
        <div className="wolf-opp__seg-row" role="group" aria-label="Universe">
          {(['F&O', 'CASH'] as const).map((u) => (
            <Seg
              key={u}
              on={
                u === 'CASH'
                  ? filters.universe === 'CASH' ||
                    filters.universe === 'NIFTY50' ||
                    filters.universe === 'NIFTY500'
                  : filters.universe === u
              }
              onClick={() => {
                patchFilters({ universe: u });
                setSelected(null);
                setWhyHit(null);
                void runScan({ reset: true, filtersOverride: { universe: u } });
              }}
            >
              {u === 'F&O' ? 'F&O' : 'Cash'}
            </Seg>
          ))}
        </div>
        <div className="wolf-opp__seg-row" role="group" aria-label="Timeframe">
          {(['5m', '15m', '1h', '1D'] as const).map((t) => (
            <Seg
              key={t}
              on={filters.timeframe === t}
              onClick={() => {
                if (filters.timeframe === t) return;
                patchFilters({ timeframe: t });
                setSelected(null);
                setWhyHit(null);
                void runScan({ reset: true, filtersOverride: { timeframe: t } });
              }}
            >
              {t}
            </Seg>
          ))}
        </div>
        <div className="wolf-opp__seg-row" role="group" aria-label="Direction">
          {(
            [
              ['all', 'All'],
              ['bullish', 'Bullish'],
              ['bearish', 'Bearish'],
            ] as const
          ).map(([id, label]) => (
            <Seg
              key={id}
              on={filters.direction === id}
              onClick={() => {
                if (filters.direction === id) return;
                patchFilters({ direction: id });
                void runScan({ reset: true, filtersOverride: { direction: id } });
              }}
            >
              {label}
            </Seg>
          ))}
        </div>
        <p className="wolf-opp__status-line">
          {scanning ? progress || 'Scanning…' : `${hitCount} setups`}
          {lastUpdated
            ? ` · ${new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
            : ''}
        </p>
      </motion.nav>

      <section className="wolf-opp__desk" aria-label="Scanners">
        <div className="wolf-opp__sheets">
          {cards.map((card, idx) => {
            const tfHits = rankHitsByScore(card.hits.filter((h) => h.timeframe === filters.timeframe));
            const longs = showLong ? tfHits.filter((h) => biasOf(h) === 'bullish') : [];
            const shorts = showShort ? tfHits.filter((h) => biasOf(h) === 'bearish') : [];
            const neutrals =
              filters.direction === 'all'
                ? tfHits.filter((h) => biasOf(h) === 'neutral')
                : [];
            return (
              <motion.article
                key={card.scannerId}
                className="wolf-opp__sheet"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.03 * Math.min(idx, 11),
                  duration: 0.42,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <header className="wolf-opp__sheet-head">
                  <div>
                    <h3>{prettyTitle(card.title)}</h3>
                    <p>{card.tagline}</p>
                  </div>
                  <span className="wolf-opp__sheet-count">{tfHits.length}</span>
                </header>

                {card.status === 'unavailable' ? (
                  <p className="wolf-opp__sheet-empty">{card.unavailableReason}</p>
                ) : (
                  <div className={`wolf-opp__sides${!showLong || !showShort ? ' is-single' : ''}`}>
                    {showLong ? (
                      <div className="wolf-opp__side wolf-opp__side--long">
                        <h4>
                          <TrendingUp size={14} strokeWidth={2.4} /> Long
                          <em>{longs.length}</em>
                        </h4>
                        <div className="wolf-opp__stack">
                          {!longs.length ? (
                            <p className="wolf-opp__side-empty">
                              {scanning || bgBusy ? 'Hunting…' : 'No longs'}
                            </p>
                          ) : (
                            <>
                              {longs.map((hit) => (
                                <HitTile
                                  key={hit.id}
                                  hit={hit}
                                  onOpen={() => setSelected(hit)}
                                  onWhy={() => setWhyHit(hit)}
                                  onChart={() => openChart(hit)}
                                />
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {showShort ? (
                      <div className="wolf-opp__side wolf-opp__side--short">
                        <h4>
                          <TrendingDown size={14} strokeWidth={2.4} /> Short
                          <em>{shorts.length}</em>
                        </h4>
                        <div className="wolf-opp__stack">
                          {!shorts.length ? (
                            <p className="wolf-opp__side-empty">
                              {scanning || bgBusy ? 'Hunting…' : 'No shorts'}
                            </p>
                          ) : (
                            <>
                              {shorts.map((hit) => (
                                <HitTile
                                  key={hit.id}
                                  hit={hit}
                                  onOpen={() => setSelected(hit)}
                                  onWhy={() => setWhyHit(hit)}
                                  onChart={() => openChart(hit)}
                                />
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
                {neutrals.length ? (
                  <p className="wolf-opp__neutral-note">{neutrals.length} unlabelled</p>
                ) : null}
              </motion.article>
            );
          })}
        </div>
      </section>

      {typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              {whyHit ? (
                <motion.div
                  className="wolf-opp__modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="wolf-opp-why-title"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <button
                    type="button"
                    className="wolf-opp__modal-backdrop"
                    aria-label="Close"
                    onClick={() => setWhyHit(null)}
                  />
                  <motion.div
                    className="wolf-opp__modal-card"
                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  >
                    <header>
                      <div>
                        <p className="wolf-opp__modal-kicker">{prettyTitle(whyHit.scannerId)}</p>
                        <h3 id="wolf-opp-why-title">Why {whyHit.symbol}?</h3>
                        <p className="wolf-opp__setup-at">
                          Created at {formatHitClock(whyHit.detectedAt)} IST
                        </p>
                      </div>
                      <button type="button" onClick={() => setWhyHit(null)} aria-label="Close">
                        <X size={18} />
                      </button>
                    </header>
                    {whyHit.why ? <p className="wolf-opp__why">{whyHit.why}</p> : null}
                    <ul className="wolf-opp__evidence">
                      {(whyHit.evidence || []).map((e) => (
                        <li key={e.label} className={e.ok ? 'ok' : 'risk'}>
                          {e.ok ? '✓' : '·'} {e.label}
                          {e.detail ? ` — ${e.detail}` : ''}
                        </li>
                      ))}
                    </ul>
                    {whyHit.confirmationNeeded ? (
                      <p>
                        <b>Next</b> {whyHit.confirmationNeeded}
                      </p>
                    ) : null}
                    {whyHit.invalidation ? (
                      <p>
                        <b>Risk</b> {whyHit.invalidation}
                      </p>
                    ) : null}
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}

      <AnimatePresence>
        {selected ? (
          <motion.div
            className="wolf-opp__drawer"
            role="dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="wolf-opp__drawer-backdrop"
              aria-label="Close"
              onClick={() => setSelected(null)}
            />
            <motion.div
              className="wolf-opp__drawer-panel wolf-opp__drawer-panel--wide"
              initial={{ x: 48, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 32, opacity: 0 }}
            >
              <header>
                <div>
                  <h3>{selected.symbol}</h3>
                  <p>
                    {prettyTitle(selected.scannerId)} · {selected.score}/100
                  </p>
                  <p className="wolf-opp__setup-at">
                    Created at {formatHitClock(selected.detectedAt)} IST
                  </p>
                  <div className="wolf-opp__drawer-bias">
                    <BiasBadge dir={biasOf(selected)} />
                  </div>
                </div>
                <button type="button" onClick={() => setSelected(null)}>
                  <X size={16} />
                </button>
              </header>
              <dl className="wolf-opp__stats">
                <div>
                  <dt>Price</dt>
                  <dd>₹{selected.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</dd>
                </div>
                <div>
                  <dt>Change</dt>
                  <dd className={selected.changePercent >= 0 ? 'up' : 'down'}>
                    {selected.changePercent.toFixed(2)}%
                  </dd>
                </div>
                <div>
                  <dt>Created at</dt>
                  <dd>{formatHitClock(selected.detectedAt)} IST</dd>
                </div>
                <div>
                  <dt>Timeframe</dt>
                  <dd>{selected.timeframe}</dd>
                </div>
                <div>
                  <dt>Level</dt>
                  <dd>{selected.keyLevel ?? '—'}</dd>
                </div>
              </dl>
              <p className="wolf-opp__why">{selected.why}</p>
              <p>
                <b>Invalidation</b> {selected.invalidation}
              </p>
              <div className="wolf-opp__drawer-cta">
                <AppLink
                  to="live-wolf"
                  query={liveWolfQuery(selected)}
                  className="wolf-opp__cta"
                  onActivate={() => openChart(selected)}
                >
                  <Crosshair size={14} /> Open chart
                </AppLink>
                <AppLink
                  to="live-wolf"
                  query={liveWolfQuery(selected)}
                  className="wolf-opp__cta wolf-opp__cta--ghost"
                  onActivate={() => openAnalyze(selected)}
                >
                  Ask Wolf
                </AppLink>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
