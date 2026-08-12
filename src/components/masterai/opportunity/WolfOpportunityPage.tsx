/**
 * WOLF OPPORTUNITY — every scanner kept; Long / Short split inside each.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { getMarketSession } from '../../../utils/marketHours';
import { fetchMarketDataStatus } from '../../../services/marketData/marketDataApi';
import { initMarketDataService, getMarketDataService } from '../../../services/marketData/MarketDataService';
import { mockMarketDataProvider } from '../../../services/radar/MockMarketDataProvider';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';
import type { MarketDataProvider } from '../../../services/radar/MarketDataProvider';
import { runOpportunityScan } from '../../../services/opportunity/opportunityEngine';
import { openOpportunityInWolfAi } from '../../../services/opportunity/opportunityBridge';
import {
  loadOpportunityFilters,
  saveOpportunityFilters,
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
  OPPORTUNITY_CARD_POOL,
  OPPORTUNITY_SCANNERS,
} from '../../../services/opportunity/opportunityTypes';
import { openLiveWolfFromRadarResult } from '../../../services/live/liveBridge';
import { opportunityToRadarResult } from '../../../services/opportunity/opportunityBridge';

function mergeHitIntoCards(
  prev: ScannerCardState[],
  hit: OpportunityHit,
  topN = OPPORTUNITY_CARD_POOL,
): ScannerCardState[] {
  return prev.map((card) => {
    if (card.scannerId !== hit.scannerId) return card;
    if (card.status === 'unavailable') return card;
    const without = card.hits.filter((h) => h.symbol !== hit.symbol);
    const nextHits = [...without, hit].sort((a, b) => b.score - a.score).slice(0, topN);
    return {
      ...card,
      status: 'ready',
      hits: nextHits,
      updatedAt: Date.now(),
      unavailableReason: undefined,
    };
  });
}

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
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
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
};

function resolveProvider(mode: 'DEMO' | 'LIVE' | null): MarketDataProvider {
  if (mode === 'LIVE') return serverMarketDataProvider;
  try {
    return getMarketDataService().getProvider();
  } catch {
    initMarketDataService(mockMarketDataProvider);
    return mockMarketDataProvider;
  }
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
  return (
    <motion.article
      layout
      className={`wolf-opp__tile is-${bias}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      whileHover={{ y: -3, transition: { type: 'spring', stiffness: 500, damping: 28 } }}
      whileTap={{ scale: 0.985 }}
    >
      <button type="button" className="wolf-opp__tile-main" onClick={onOpen}>
        <span className="wolf-opp__tile-sym">{hit.symbol}</span>
        <span className={`wolf-opp__tile-chg ${(hit.changePercent || 0) >= 0 ? 'up' : 'down'}`}>
          {hit.changePercent >= 0 ? '+' : ''}
          {hit.changePercent.toFixed(2)}%
        </span>
        <span className="wolf-opp__tile-px">₹{formatHitPrice(hit.price)}</span>
        <span className="wolf-opp__tile-score">{hit.score}</span>
        <span className="wolf-opp__tile-meta">
          <BiasBadge dir={bias} size="sm" />
          <em>{formatHitClock(hit.detectedAt)}</em>
        </span>
      </button>
      <div className="wolf-opp__tile-actions">
        <button type="button" onClick={onWhy}>
          Why
        </button>
        <button type="button" onClick={onChart}>
          <Crosshair size={12} /> Chart
        </button>
      </div>
    </motion.article>
  );
}

export default function WolfOpportunityPage({ onOpenWolfAi, onOpenLive, onConnectData }: Props) {
  const [filters, setFilters] = useState<OpportunityFilters>(() => loadOpportunityFilters());
  const [cards, setCards] = useState<ScannerCardState[]>(() =>
    OPPORTUNITY_SCANNERS.map((s) => ({
      scannerId: s.id,
      title: s.title,
      tagline: s.tagline,
      status: 'idle',
      hits: [],
      updatedAt: null,
    })),
  );
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
    const next: IndexPulse[] = [];
    for (const symbol of syms) {
      try {
        const q = await provider.getQuote(symbol);
        const price = Number(q.price) || Number((q as { lastPrice?: number }).lastPrice) || 0;
        next.push({
          symbol,
          price: price > 0 ? price : null,
          changePercent: Number.isFinite(q.changePercent) ? q.changePercent : null,
          available: price > 0,
        });
      } catch {
        next.push({ symbol, price: null, changePercent: null, available: false });
      }
    }
    setIndices(next);
  }, []);

  const runScan = useCallback(
    async (opts?: {
      quiet?: boolean;
      reset?: boolean;
      filtersOverride?: Partial<OpportunityFilters>;
    }) => {
      const quiet = Boolean(opts?.quiet);
      const activeFilters = { ...filters, ...opts?.filtersOverride };
      if (quiet && scanningRef.current) return;
      if (!quiet) abortRef.current?.abort();
      else if (scanningRef.current) return;

      const ac = new AbortController();
      abortRef.current = ac;
      scanningRef.current = true;
      if (quiet) setBgBusy(true);
      else {
        setScanning(true);
        setProgress('Scanning market…');
        if (opts?.reset) {
          setCards((prev) =>
            prev.map((c) =>
              c.status === 'unavailable' ? c : { ...c, hits: [], status: 'scanning' as const },
            ),
          );
        }
      }

      let mode: 'DEMO' | 'LIVE' | null = null;
      try {
        const s = await fetchMarketDataStatus();
        if (s.status === 'CONNECTED' && s.mode === 'LIVE') {
          mode = 'LIVE';
          setFeedStatus('LIVE');
          await initMarketDataService(serverMarketDataProvider).connect();
        } else if (s.status === 'CONNECTED') {
          mode = 'DEMO';
          setFeedStatus('DEMO');
          await initMarketDataService(mockMarketDataProvider).connect();
        } else {
          mode = 'DEMO';
          setFeedStatus('OFFLINE');
          initMarketDataService(mockMarketDataProvider);
        }
      } catch {
        mode = 'DEMO';
        setFeedStatus('OFFLINE');
        initMarketDataService(mockMarketDataProvider);
      }

      const provider = resolveProvider(mode);
      setDataMode(provider.isDemo ? 'DEMO' : 'LIVE');
      if (provider.isDemo && feedStatus !== 'OFFLINE') setFeedStatus('DEMO');
      void refreshIndices(provider);

      try {
        const out = await runOpportunityScan(
          activeFilters,
          {
            signal: ac.signal,
            topN: OPPORTUNITY_CARD_POOL,
            onProgress: (p) => {
              if (quiet) return;
              setProgress(
                p.status === 'scanning'
                  ? `Hunting ${p.symbolsChecked}/${p.symbolsTotal}`
                  : p.phase,
              );
            },
            onHit: (hit) => {
              setCards((prev) => mergeHitIntoCards(prev, hit, OPPORTUNITY_CARD_POOL));
            },
            onCard: (card) => {
              if (card.status !== 'unavailable') return;
              setCards((prev) => prev.map((c) => (c.scannerId === card.scannerId ? card : c)));
            },
          },
          provider,
        );
        if (!ac.signal.aborted) {
          setCards(out.cards);
          setDataMode(out.dataMode);
          setLastUpdated(Date.now());
          if (!quiet) setProgress(`${out.hits.length} setups ready`);
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          if (!quiet) setProgress(e instanceof Error ? e.message : 'Scan failed');
          setFeedStatus((f) => (f === 'LIVE' ? 'DELAYED' : f));
        }
      } finally {
        scanningRef.current = false;
        if (!ac.signal.aborted) {
          setScanning(false);
          setBgBusy(false);
        }
      }
    },
    [filters, refreshIndices, feedStatus],
  );

  useEffect(() => {
    void runScan({ reset: true });
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!filters.autoRefresh) return;
    const id = window.setInterval(() => void runScan({ quiet: true }), filters.refreshSec * 1000);
    return () => window.clearInterval(id);
  }, [filters.autoRefresh, filters.refreshSec, runScan]);

  const openAnalyze = (hit: OpportunityHit) => {
    openOpportunityInWolfAi(hit);
    onOpenWolfAi();
  };

  const openChart = (hit: OpportunityHit) => {
    openLiveWolfFromRadarResult(opportunityToRadarResult(hit));
    onOpenLive?.();
  };

  const liveOk = feedStatus === 'LIVE';
  const hitCount = cards.reduce((n, c) => n + c.hits.length, 0);
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
          {(['F&O', 'NIFTY50'] as const).map((u) => (
            <Seg
              key={u}
              on={filters.universe === u}
              onClick={() => {
                patchFilters({ universe: u });
                void runScan({ reset: true, filtersOverride: { universe: u } });
              }}
            >
              {u === 'F&O' ? 'F&O' : 'Cash'}
            </Seg>
          ))}
        </div>
        <div className="wolf-opp__seg-row" role="group" aria-label="Timeframe">
          {(['5m', '15m', '1h', '1D'] as const).map((t) => (
            <Seg key={t} on={filters.timeframe === t} onClick={() => patchFilters({ timeframe: t })}>
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
              onClick={() => patchFilters({ direction: id })}
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

      {!liveOk ? (
        <p className="wolf-opp__note">
          {feedStatus === 'DEMO'
            ? 'Demo feed — connect live data for real quotes.'
            : 'Live data offline — showing historical / demo results.'}
        </p>
      ) : null}

      <section className="wolf-opp__desk" aria-label="Scanners">
        <div className="wolf-opp__sheets">
          {cards.map((card, idx) => {
            const longs = showLong ? card.hits.filter((h) => biasOf(h) === 'bullish') : [];
            const shorts = showShort ? card.hits.filter((h) => biasOf(h) === 'bearish') : [];
            const neutrals =
              filters.direction === 'all'
                ? card.hits.filter((h) => biasOf(h) === 'neutral')
                : [];
            return (
              <motion.article
                key={card.scannerId}
                className="wolf-opp__sheet"
                initial={{ opacity: 0, y: 14 }}
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
                  <span className="wolf-opp__sheet-count">{card.hits.length}</span>
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
                            <AnimatePresence initial={false}>
                              {longs.map((hit) => (
                                <HitTile
                                  key={hit.id}
                                  hit={hit}
                                  onOpen={() => setSelected(hit)}
                                  onWhy={() => setWhyHit(hit)}
                                  onChart={() => openChart(hit)}
                                />
                              ))}
                            </AnimatePresence>
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
                            <AnimatePresence initial={false}>
                              {shorts.map((hit) => (
                                <HitTile
                                  key={hit.id}
                                  hit={hit}
                                  onOpen={() => setSelected(hit)}
                                  onWhy={() => setWhyHit(hit)}
                                  onChart={() => openChart(hit)}
                                />
                              ))}
                            </AnimatePresence>
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

      <AnimatePresence>
        {whyHit ? (
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
              onClick={() => setWhyHit(null)}
            />
            <motion.div
              className="wolf-opp__drawer-panel"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 28, opacity: 0 }}
            >
              <header>
                <h3>Why {whyHit.symbol}?</h3>
                <button type="button" onClick={() => setWhyHit(null)}>
                  <X size={16} />
                </button>
              </header>
              <ul className="wolf-opp__evidence">
                {whyHit.evidence.map((e) => (
                  <li key={e.label} className={e.ok ? 'ok' : 'risk'}>
                    {e.ok ? '✓' : '·'} {e.label}
                    {e.detail ? ` — ${e.detail}` : ''}
                  </li>
                ))}
              </ul>
              <p>
                <b>Next</b> {whyHit.confirmationNeeded}
              </p>
              <p>
                <b>Risk</b> {whyHit.invalidation}
              </p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
                <button type="button" className="wolf-opp__cta" onClick={() => openChart(selected)}>
                  <Crosshair size={14} /> Open chart
                </button>
                <button type="button" className="wolf-opp__cta wolf-opp__cta--ghost" onClick={() => openAnalyze(selected)}>
                  Ask Wolf
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
