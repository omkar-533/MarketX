/**
 * WOLF OPPORTUNITY — one list per scanner; click Sort to cycle Long / Short / Created / %.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crosshair,
  RefreshCw,
  Search,
  X,
  Link2,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
} from 'lucide-react';
import { formatOpportunityCreatedClock } from '../../../services/opportunity/opportunityCreated';
import { getMarketSession, isNseFnoMarketOpen } from '../../../utils/marketHours';
import { fetchMarketDataStatus, isIndstocksLive, clearLiveCandleCache, fetchOpportunityDayBoard, postOpportunityDayBoard } from '../../../services/marketData/marketDataApi';
import { initMarketDataService } from '../../../services/marketData/MarketDataService';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';
import type { MarketDataProvider } from '../../../services/radar/MarketDataProvider';
import { runOpportunityScan, type RunOpportunityOptions } from '../../../services/opportunity/opportunityEngine';
import { opportunityToRadarResult } from '../../../services/opportunity/opportunityBridge';
import {
  loadOpportunityFilters,
  saveOpportunityFilters,
  applyLiveScanCards,
  applyDaySignalCards,
  sortHitsForDesk,
  nextOpportunityDeskSort,
  emptyOpportunityCards,
  loadOpportunityDayBoard,
  saveOpportunityDayBoard,
  opportunityBoardKey,
  DEFAULT_OPPORTUNITY_DESK_SORT,
  type OpportunityDeskSort,
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
  OPPORTUNITY_UNIVERSES,
} from '../../../services/opportunity/opportunityTypes';
import { openLiveWolfFromRadarResult } from '../../../services/live/liveBridge';
import AppLink from '../../AppLink';
import { liveWolfQuery } from '../../../utils/appNav';
import WolfHuntLoader from './WolfHuntLoader';
import StockLogoMark from './StockLogoMark';

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
  return formatOpportunityCreatedClock(ms);
}

function signalPrintLabel(hit: OpportunityHit): string {
  const n = Number(hit.meta?.signalN);
  if (!(n > 1)) return '';
  const suf = n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return ` · ${n}${suf} signal`;
}

const DESK_SORT_LABEL: Record<OpportunityDeskSort, string> = {
  default: 'Default',
  long: 'Long first',
  short: 'Short first',
  created: 'Created time',
  percent: '% change',
};

function symbolNeedle(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function hitMatchesQuery(hit: OpportunityHit, needle: string): boolean {
  if (!needle) return true;
  return symbolNeedle(hit.symbol).includes(needle);
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
        <StockLogoMark symbol={hit.symbol} size={42} className="wolf-opp__tile-logo" />
        <span className="wolf-opp__tile-copy">
          <span className="wolf-opp__tile-row">
            <span className="wolf-opp__tile-sym">{hit.symbol}</span>
            <span className={`wolf-opp__tile-chg ${(hit.changePercent || 0) >= 0 ? 'up' : 'down'}`}>
              {hit.changePercent >= 0 ? '+' : ''}
              {hit.changePercent.toFixed(2)}%
            </span>
          </span>
          <span className="wolf-opp__tile-row">
            <span className="wolf-opp__tile-px">₹{formatHitPrice(hit.price)}</span>
            <span className="wolf-opp__tile-score">{hit.score}</span>
          </span>
          <span className="wolf-opp__tile-meta">
            <BiasBadge dir={bias} size="sm" />
            <em>
              Created {formatHitClock(hit.detectedAt)} IST
              {signalPrintLabel(hit)}
            </em>
          </span>
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
  const [symbolQuery, setSymbolQuery] = useState('');
  const [deskSortByScanner, setDeskSortByScanner] = useState<Partial<Record<string, OpportunityDeskSort>>>({});
  const abortRef = useRef<AbortController | null>(null);
  const scanningRef = useRef(false);
  const scanGenRef = useRef(0);
  const lastProgAtRef = useRef(0);
  const closedBoardFrozenRef = useRef(false);
  const contributeRef = useRef(false);
  const lastContributeAtRef = useRef(0);
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
      fresh?: boolean;
      filtersOverride?: Partial<OpportunityFilters>;
    }) => {
      const quiet = Boolean(opts?.quiet);
      const activeFilters = { ...filters, ...opts?.filtersOverride };
      if (opts?.reset) closedBoardFrozenRef.current = false;
      if (!opts?.reset && closedBoardFrozenRef.current && !isNseFnoMarketOpen()) return;
      if (quiet && scanningRef.current) return;
      if (!quiet) abortRef.current?.abort();
      else if (scanningRef.current) return;

      const ac = new AbortController();
      abortRef.current = ac;
      const gen = ++scanGenRef.current;
      const isStale = () => scanGenRef.current !== gen || ac.signal.aborted;
      scanningRef.current = true;
      if (quiet) setBgBusy(true);
      else setProgress('Loading shared day board…');

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
        return;
      }

      const provider = resolveLiveProvider();
      setDataMode('LIVE');
      void refreshIndices(provider);
      const replaceDesk = Boolean(opts?.reset);
      const boardKey = opportunityBoardKey(activeFilters.universe, activeFilters.timeframe);
      const tfHits = (cards: ScannerCardState[]) =>
        applyLiveScanCards(cards).map((card) => ({
          ...card,
          hits: card.hits.filter((h) => h.timeframe === activeFilters.timeframe),
        }));
      const paintBoard = (incoming: ScannerCardState[], reset: boolean) => {
        setCards((prev) => (reset ? incoming : applyDaySignalCards(prev, incoming)));
        setLastUpdated(Date.now());
      };
      const adoptBoard = (cards: ScannerCardState[], reset: boolean) => {
        const incoming = tfHits(cards);
        saveOpportunityDayBoard(boardKey, incoming);
        paintBoard(incoming, reset);
        return incoming;
      };
      const localBoard = () => loadOpportunityDayBoard(boardKey);

      try {
        if (!quiet) setProgress('Loading shared day board…');
        const cached = localBoard();
        if (replaceDesk) setCards(emptyOpportunityCards());
        if (!quiet && cached.some((c) => c.hits.length)) paintBoard(cached, replaceDesk);

        let hadBoard = cached.some((c) => c.hits.length);
        try {
          const shared = await fetchOpportunityDayBoard(activeFilters.universe, activeFilters.timeframe);
          if (!isStale() && shared.ready && shared.cards?.some((c) => c.hits.length)) {
            adoptBoard(shared.cards, replaceDesk);
            hadBoard = true;
            if (!quiet) setProgress(`${shared.hits} setups`);
          }
        } catch {
          /* keep local board; first user of the day still scans once */
        }

        if (hadBoard) {
          if (!isNseFnoMarketOpen()) {
            closedBoardFrozenRef.current = true;
            return;
          }
          const canContribute =
            !contributeRef.current && Date.now() - lastContributeAtRef.current > 45_000;
          if (canContribute) {
            contributeRef.current = true;
            lastContributeAtRef.current = Date.now();
            void (async () => {
              setBgBusy(true);
              try {
                const out = await runOpportunityScan(
                  activeFilters,
                  { signal: ac.signal, topN: OPPORTUNITY_SCAN_CAP, freshCandles: false },
                  provider,
                );
                if (!out.complete) return;
                const saved = await postOpportunityDayBoard(
                  activeFilters.universe,
                  activeFilters.timeframe,
                  tfHits(out.cards),
                );
                if (saved.cards?.length) adoptBoard(saved.cards, false);
              } catch {
                /* keep the saved board on screen */
              } finally {
                contributeRef.current = false;
                setBgBusy(false);
              }
            })();
          }
          return;
        }

        if (!quiet) {
          setScanning(true);
          setProgress('Fetching live market…');
          if (opts?.fresh) clearLiveCandleCache();
        }

        const scanOpts: RunOpportunityOptions = {
          signal: ac.signal,
          topN: OPPORTUNITY_SCAN_CAP,
          freshCandles: Boolean(opts?.fresh),
          onProgress: (p) => {
            if (quiet) return;
            const now = Date.now();
            if (p.status === 'scanning' && now - lastProgAtRef.current < 220) return;
            lastProgAtRef.current = now;
            setProgress(
              p.status === 'scanning'
                ? p.phase === 'SHARED'
                  ? `Shared board ${p.symbolsChecked}/${p.symbolsTotal || '?'}`
                  : `Hunting ${p.symbolsChecked}/${p.symbolsTotal}`
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
          let incoming = tfHits(out.cards);
          try {
            const saved = await postOpportunityDayBoard(
              activeFilters.universe,
              activeFilters.timeframe,
              incoming,
            );
            if (saved.cards?.length) incoming = tfHits(saved.cards);
          } catch {
            /* keep local incoming */
          }
          saveOpportunityDayBoard(boardKey, incoming);
          paintBoard(incoming, false);
          setDataMode(out.dataMode);
          if (!isNseFnoMarketOpen()) closedBoardFrozenRef.current = true;
          if (!quiet) setProgress(`${incoming.reduce((n, c) => n + c.hits.length, 0)} setups ready`);
        } else if (!isStale() && !out.complete) {
          if (out.hits.length) {
            const incoming = tfHits(out.cards);
            saveOpportunityDayBoard(boardKey, incoming);
            paintBoard(incoming, false);
          }
          if (!quiet) {
            setProgress(out.hits.length ? `${out.hits.length} setups (partial)` : 'Waiting for a full live scan…');
          }
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
    [filters, refreshIndices, liveHint],
  );

  useEffect(() => {
    if (!sessionKnown) return;
    void runScan({ reset: false, fresh: true });
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKnown, liveHint, rescanToken]);

  useEffect(() => {
    if (!filters.autoRefresh) return;
    if (!isNseFnoMarketOpen()) return;
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
  const needle = symbolNeedle(symbolQuery);
  const hitCount = cards.reduce(
    (n, c) => n + c.hits.filter((h) => h.timeframe === filters.timeframe).length,
    0,
  );
  const finder = useMemo(() => {
    if (!needle) return [] as Array<{ scannerId: string; title: string; side: OpportunityDirection; count: number }>;
    const byKey = new Map<string, { scannerId: string; title: string; side: OpportunityDirection; count: number }>();
    for (const card of cards) {
      for (const hit of card.hits) {
        if (hit.timeframe !== filters.timeframe) continue;
        if (!hitMatchesQuery(hit, needle)) continue;
        const side = biasOf(hit);
        const key = `${card.scannerId}|${side}`;
        const prev = byKey.get(key);
        if (prev) prev.count += 1;
        else {
          byKey.set(key, {
            scannerId: card.scannerId,
            title: prettyTitle(card.title),
            side,
            count: 1,
          });
        }
      }
    }
    return [...byKey.values()];
  }, [cards, filters.timeframe, needle]);
  const finderScannerCount = useMemo(
    () => new Set(finder.map((row) => row.scannerId)).size,
    [finder],
  );

  const jumpToScanner = (scannerId: string) => {
    document.getElementById(`wolf-opp-sheet-${scannerId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

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
          <p className="wolf-opp__lead">Every scanner. Long and short in one list — sort inside each box.</p>
        </div>

        <div className="wolf-opp__pulse">
          <span className={`wolf-opp__mkt ${marketOpen ? 'is-open' : 'is-closed'}`}>
            {marketOpen ? 'Market open' : 'Market closed'}
          </span>
          {indices.map((ix) => (
            <div key={ix.symbol} className="wolf-opp__ix">
              <StockLogoMark symbol={ix.symbol} size={18} />
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
        {OPPORTUNITY_UNIVERSES.length > 1 ? (
        <div className="wolf-opp__seg-row" role="group" aria-label="Universe">
          {OPPORTUNITY_UNIVERSES.map((u) => (
            <Seg
              key={u}
              on={filters.universe === u}
              onClick={() => {
                if (filters.universe === u) return;
                patchFilters({ universe: u });
                setSelected(null);
                setWhyHit(null);
                setCards(emptyOpportunityCards());
                void runScan({ reset: true, filtersOverride: { universe: u } });
              }}
            >
              {u === 'F&O' ? 'F&O' : u}
            </Seg>
          ))}
        </div>
        ) : null}
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
        <label className="wolf-opp__search">
          <Search size={14} strokeWidth={2.2} />
          <input
            type="search"
            value={symbolQuery}
            onChange={(e) => setSymbolQuery(e.target.value)}
            placeholder="Find a stock across scanners"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search stock across scanners"
          />
          {symbolQuery ? (
            <button type="button" aria-label="Clear search" onClick={() => setSymbolQuery('')}>
              <X size={13} />
            </button>
          ) : null}
        </label>
        <p className="wolf-opp__status-line">
          {scanning ? progress || 'Scanning…' : hitCount ? `${hitCount} setups` : progress || '0 setups'}
          {lastUpdated
            ? ` · ${new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
            : ''}
        </p>
      </motion.nav>

      {needle ? (
        <div className="wolf-opp__finder" role="status">
          {finder.length ? (
            <>
              <p>
                <b>{needle}</b> in {finderScannerCount} scanner{finderScannerCount === 1 ? '' : 's'}
              </p>
              <div className="wolf-opp__finder-chips">
                {finder.map((row) => (
                  <button
                    key={`${row.scannerId}-${row.side}`}
                    type="button"
                    className={`wolf-opp__finder-chip is-${row.side}`}
                    onClick={() => jumpToScanner(row.scannerId)}
                  >
                    {row.title}
                    <em>{row.side === 'bullish' ? 'Long' : row.side === 'bearish' ? 'Short' : 'Neutral'}</em>
                    {row.count > 1 ? <span>{row.count}</span> : null}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p>
              No live setup for <b>{needle}</b> on this F&O board
            </p>
          )}
        </div>
      ) : null}

      <section
        className={`wolf-opp__desk${scanning ? ' is-hunting' : ''}`}
        aria-label="Scanners"
        aria-busy={scanning}
      >
        <AnimatePresence>
          {scanning ? <WolfHuntLoader key="hunt" caption={progress || 'Scanning live setups…'} /> : null}
        </AnimatePresence>
        <div className="wolf-opp__sheets">
          {cards.map((card, idx) => {
            const deskSort = deskSortByScanner[card.scannerId] || DEFAULT_OPPORTUNITY_DESK_SORT;
            const tfHits = sortHitsForDesk(
              card.hits.filter(
                (h) => h.timeframe === filters.timeframe && hitMatchesQuery(h, needle),
              ),
              deskSort,
            );
            if (needle && !tfHits.length) return null;
            return (
              <motion.article
                key={card.scannerId}
                id={`wolf-opp-sheet-${card.scannerId}`}
                className={`wolf-opp__sheet${needle ? ' is-found' : ''}`}
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
                  <div className="wolf-opp__sheet-tools">
                    <button
                      type="button"
                      className="wolf-opp__sort wolf-opp__sort--sheet"
                      onClick={() =>
                        setDeskSortByScanner((prev) => ({
                          ...prev,
                          [card.scannerId]: nextOpportunityDeskSort(
                            prev[card.scannerId] || DEFAULT_OPPORTUNITY_DESK_SORT,
                          ),
                        }))
                      }
                      title="Click to cycle: Default → Long first → Short first → Created time → % change"
                    >
                      <ArrowUpDown size={13} strokeWidth={2.2} />
                      {DESK_SORT_LABEL[deskSort]}
                    </button>
                    <span className="wolf-opp__sheet-count">{tfHits.length}</span>
                  </div>
                </header>

                {card.status === 'unavailable' ? (
                  <p className="wolf-opp__sheet-empty">{card.unavailableReason}</p>
                ) : (
                  <div className="wolf-opp__stack wolf-opp__stack--merged">
                    {!tfHits.length ? (
                      <p className="wolf-opp__side-empty">
                        {scanning || bgBusy ? 'Hunting…' : 'No setups'}
                      </p>
                    ) : (
                      tfHits.map((hit) => (
                        <HitTile
                          key={hit.id}
                          hit={hit}
                          onOpen={() => setSelected(hit)}
                          onWhy={() => setWhyHit(hit)}
                          onChart={() => openChart(hit)}
                        />
                      ))
                    )}
                  </div>
                )}
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
                      <div className="wolf-opp__head-id">
                        <StockLogoMark symbol={whyHit.symbol} size={44} />
                        <div>
                        <p className="wolf-opp__modal-kicker">{prettyTitle(whyHit.scannerId)}</p>
                        <h3 id="wolf-opp-why-title">Why {whyHit.symbol}?</h3>
                        <p className="wolf-opp__setup-at">
                          Created at {formatHitClock(whyHit.detectedAt)} IST
                        </p>
                        </div>
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
                <div className="wolf-opp__head-id">
                  <StockLogoMark symbol={selected.symbol} size={48} />
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
