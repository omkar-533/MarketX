/**
 * WOLF OPPORTUNITY — one list per scanner; click Sort to cycle Long / Short / Created / %.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { feedState } from './feedState';
import { formatXFactor, xFactorOf } from '../../../services/opportunity/xFactor';
import { stopLevelOf } from '../../../services/opportunity/stopLevel';
import { formatOpportunityCreatedClock } from '../../../services/opportunity/opportunityCreated';
import { getMarketSession, isNseFnoMarketOpen } from '../../../utils/marketHours';
import { fetchMarketDataStatus, isIndstocksLive, clearLiveCandleCache, fetchOpportunityDayBoard, postOpportunityDayBoard, fetchOpportunityStats, type ScannerTrackRecord } from '../../../services/marketData/marketDataApi';
import { initMarketDataService } from '../../../services/marketData/MarketDataService';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';
import type { MarketDataProvider } from '../../../services/radar/MarketDataProvider';
import { runOpportunityScan, type RunOpportunityOptions } from '../../../services/opportunity/opportunityEngine';
import { opportunityToRadarResult } from '../../../services/opportunity/opportunityBridge';
import {
  loadOpportunityFilters,
  saveOpportunityFilters,
  applyLiveScanCards,
  sortHitsForDesk,
  scannerPrintLabels,
  scannerPrintLabelOf,
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
  OpportunityDirection,
  OpportunityFilters,
  OpportunityHit,
  OpportunityTimeframe,
  ScannerCardState,
} from '../../../services/opportunity/opportunityTypes';
import {
  coerceScannerTimeframe,
  defaultCardTimeframes,
  scannerTimeframes,
  timeframesInUse,
  type CardTimeframes,
} from '../../../services/opportunity/scannerTimeframes';
import {
  emptyMarketTrend,
  loadMarketTrend,
  type MarketTrendState,
} from '../../../services/opportunity/marketTrend';
import {
  OPPORTUNITY_SCAN_CAP,
  OPPORTUNITY_UNIVERSES,
} from '../../../services/opportunity/opportunityTypes';
import { openLiveWolfFromRadarResult } from '../../../services/live/liveBridge';
import AppLink from '../../AppLink';
import { liveWolfQuery } from '../../../utils/appNav';
import { tradingViewChartUrl } from '../../../utils/tradingViewSymbols';
import WolfHuntLoader from './WolfHuntLoader';
import StockLogoMark from './StockLogoMark';
import WaterStack from './WaterStack';

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

/** Chrome dumps the login mobile here after Connect Market Data. */
function looksLikeAutofilledPhone(raw: string): boolean {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 12 && !/[A-Za-z]/.test(raw);
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

/** Below this a win rate is noise, so the card stays silent about its record. */
const MIN_RECORD_SAMPLES = 20;
const RECORD_DAYS = 20;
const RECORD_REFRESH_MS = 5 * 60_000;
/** The board job rebuilds 15m every 2 min and 1h/1D far slower — polling faster only burns calls. */
const SIDE_BOARD_REFRESH_MS = 60_000;

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
      <span className="wolf-opp__seg-shine" aria-hidden />
      {children}
    </button>
  );
}

const HitTile = memo(function HitTile({
  hit,
  printLabel,
  onOpen,
  onWhy,
}: {
  hit: OpportunityHit;
  printLabel: string;
  onOpen: (hit: OpportunityHit) => void;
  onWhy: (hit: OpportunityHit) => void;
}) {
  const bias = biasOf(hit);
  const q = liveWolfQuery(hit);
  const xFactor = xFactorOf(hit);
  const stopLevel = stopLevelOf(hit);
  const tvHref = tradingViewChartUrl(hit.symbol, hit.timeframe, hit.exchange);
  return (
    <article className={`wolf-opp__tile is-${bias}`}>
      <AppLink to="live-wolf" query={q} className="wolf-opp__tile-main" onActivate={() => onOpen(hit)}>
        <StockLogoMark symbol={hit.symbol} size={38} className="wolf-opp__tile-logo" />
        <span className="wolf-opp__tile-copy">
          <span className="wolf-opp__tile-row">
            <span className="wolf-opp__tile-sym">{hit.symbol}</span>
            <span className="wolf-opp__tile-metrics">
              <span className="wolf-opp__tile-px">₹{formatHitPrice(hit.price)}</span>
              <span className={`wolf-opp__tile-chg ${(hit.changePercent || 0) >= 0 ? 'up' : 'down'}`}>
                {hit.changePercent >= 0 ? '+' : ''}
                {hit.changePercent.toFixed(2)}%
              </span>
            </span>
          </span>
          <span className="wolf-opp__tile-row">
            <span className="wolf-opp__tile-meta">
              <BiasBadge dir={bias} size="sm" />
              <em className="wolf-opp__tile-created">
                {formatHitClock(hit.detectedAt) === '—' ? 'Created —' : `${formatHitClock(hit.detectedAt)} IST`}
              </em>
              {hit.status === 'WATCH' ? <span className="wolf-opp__tile-nth">Watch</span> : null}
              {hit.status === 'INVALID' ? (
                <span className="wolf-opp__tile-nth is-dead">Invalidated</span>
              ) : null}
              {printLabel ? <span className="wolf-opp__tile-nth">{printLabel}</span> : null}
            </span>
            {xFactor != null ? (
              <span
                className="wolf-opp__tile-score wolf-opp__tile-score--x"
                title={`X Factor — relative volume ${xFactor.toFixed(2)}× of this symbol's recent average`}
              >
                {formatXFactor(xFactor)}
              </span>
            ) : (
              <span className="wolf-opp__tile-score" title={`Wolf score ${hit.score}/100`}>
                {hit.score}
              </span>
            )}
          </span>
          {stopLevel != null ? (
            <span className="wolf-opp__tile-stop">
              Invalid {bias === 'bullish' ? 'below' : 'above'} ₹{formatHitPrice(stopLevel)}
            </span>
          ) : null}
        </span>
      </AppLink>
      <div className="wolf-opp__tile-actions">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onWhy(hit);
          }}
        >
          Why
        </button>
        <a
          href={tvHref}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${hit.symbol} ${hit.timeframe} on TradingView`}
          onClick={(e) => e.stopPropagation()}
        >
          <Crosshair size={12} /> Chart
        </a>
      </div>
    </article>
  );
});

/**
 * Measured record of the card's past signals. Nothing is shown until enough of
 * them have resolved, so an empty strip never reads as a bad scanner.
 */
function TrackRecordStrip({ record }: { record?: ScannerTrackRecord }) {
  const useHalfHour = (record?.h30.samples ?? 0) >= MIN_RECORD_SAMPLES;
  const stat = useHalfHour ? record?.h30 : record?.h15;
  if (!stat || stat.samples < MIN_RECORD_SAMPLES || stat.winRate == null || stat.avgMove == null) {
    return null;
  }
  const avg = `${stat.avgMove >= 0 ? '+' : ''}${stat.avgMove.toFixed(2)}%`;
  return (
    <p
      className="wolf-opp__record"
      title={`${stat.samples} resolved signals from the last ${RECORD_DAYS} trading days`}
    >
      <span className={stat.winRate >= 50 ? 'is-up' : 'is-down'}>{Math.round(stat.winRate)}%</span>
      {` moved its way in ${useHalfHour ? '30m' : '15m'} · avg `}
      <span className={stat.avgMove >= 0 ? 'is-up' : 'is-down'}>{avg}</span>
      {` · ${stat.samples} signals`}
    </p>
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
  const [marketTrend, setMarketTrend] = useState<MarketTrendState>(() => emptyMarketTrend());
  const [selected, setSelected] = useState<OpportunityHit | null>(null);
  const [whyHit, setWhyHit] = useState<OpportunityHit | null>(null);
  const [symbolQuery, setSymbolQuery] = useState('');
  const [searchUnlocked, setSearchUnlocked] = useState(false);
  const [deskSortByScanner, setDeskSortByScanner] = useState<Partial<Record<string, OpportunityDeskSort>>>({});
  // Each card picks its own timeframe; it resets to the scanner default on reload.
  const [cardTf, setCardTf] = useState<CardTimeframes>(() => defaultCardTimeframes());
  // Read-only shared boards for the timeframes the primary scan does not cover.
  const [sideBoards, setSideBoards] = useState<
    Partial<Record<OpportunityTimeframe, ScannerCardState[]>>
  >({});
  const [trackRecord, setTrackRecord] = useState<Record<string, ScannerTrackRecord>>({});
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

  useEffect(() => {
    if (dataMode !== 'LIVE') {
      setTrackRecord({});
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const res = await fetchOpportunityStats(filters.universe, filters.timeframe);
        if (alive) setTrackRecord(res.scanners || {});
      } catch {
        // Optional strip — the desk must keep working without a track record.
      }
    };
    void load();
    const timer = setInterval(load, RECORD_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [dataMode, filters.universe, filters.timeframe]);

  // Cards parked off the primary timeframe read the shared board for their own
  // timeframe. This path only reads — the desk still scans and posts on 5m.
  const sideTfs = useMemo(
    () => timeframesInUse(cardTf).filter((tf) => tf !== filters.timeframe),
    [cardTf, filters.timeframe],
  );
  const sideTfKey = sideTfs.join(',');
  useEffect(() => {
    if (!sideTfs.length) return;
    let alive = true;

    // Yesterday's rows for these timeframes are already on disk, so paint them at once
    // rather than leaving the card on "Loading…" until its own board GET lands.
    setSideBoards((prev) => {
      const next = { ...prev };
      for (const tf of sideTfs) {
        if (next[tf]) continue;
        const local = loadOpportunityDayBoard(opportunityBoardKey(filters.universe, tf));
        if (local.some((c) => c.hits.length)) next[tf] = applyLiveScanCards(local);
      }
      return next;
    });

    const load = async () => {
      // One board per timeframe, all in flight together — a serial loop made the last
      // card wait out every board before it.
      await Promise.all(
        sideTfs.map(async (tf) => {
          try {
            const shared = await fetchOpportunityDayBoard(filters.universe, tf);
            if (!alive) return;
            const cards =
              shared.ready && shared.cards?.length ? applyLiveScanCards(shared.cards) : [];
            if (cards.some((c) => c.hits.length)) {
              saveOpportunityDayBoard(opportunityBoardKey(filters.universe, tf), cards);
            }
            setSideBoards((prev) => ({ ...prev, [tf]: cards }));
          } catch {
            // No board yet for this timeframe — show it as empty, never as another
            // timeframe's setups.
            if (!alive) return;
            setSideBoards((prev) => (prev[tf] ? prev : { ...prev, [tf]: [] }));
          }
        }),
      );
    };
    void load();
    const timer = setInterval(load, SIDE_BOARD_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // sideTfKey stands in for the timeframe list identity.
     
  }, [sideTfKey, filters.universe]);

  const refreshMarketTrend = useCallback(async (provider: MarketDataProvider) => {
    try {
      setMarketTrend(await loadMarketTrend(provider));
    } catch {
      setMarketTrend(emptyMarketTrend('Market trend unavailable — live index data missing.'));
    }
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
      if (quiet && scanningRef.current) {
        try {
          const f = { ...filtersRef.current, ...opts?.filtersOverride };
          const shared = await fetchOpportunityDayBoard(f.universe, f.timeframe);
          if (shared.ready && shared.cards?.some((c) => c.hits.length)) {
            const incoming = applyLiveScanCards(shared.cards).map((card) => ({
              ...card,
              hits: card.hits.filter((h) => h.timeframe === f.timeframe),
            }));
            saveOpportunityDayBoard(opportunityBoardKey(f.universe, f.timeframe), incoming);
            setCards(applyLiveScanCards(incoming));
            setLastUpdated(Date.now());
          }
        } catch {
          /* keep the desk on screen */
        }
        return;
      }
      if (!quiet) abortRef.current?.abort();
      else if (scanningRef.current) return;

      const ac = new AbortController();
      abortRef.current = ac;
      const gen = ++scanGenRef.current;
      const isStale = () => scanGenRef.current !== gen || ac.signal.aborted;
      scanningRef.current = true;
      if (quiet) setBgBusy(true);

      const replaceDesk = Boolean(opts?.reset);
      const boardKey = opportunityBoardKey(activeFilters.universe, activeFilters.timeframe);
      const tfHits = (cards: ScannerCardState[]) =>
        applyLiveScanCards(cards).map((card) => ({
          ...card,
          hits: card.hits.filter((h) => h.timeframe === activeFilters.timeframe),
        }));
      const paintBoard = (incoming: ScannerCardState[], _reset: boolean) => {
        setCards(applyLiveScanCards(incoming));
        setLastUpdated(Date.now());
      };
      const adoptBoard = (cards: ScannerCardState[], reset: boolean) => {
        const incoming = tfHits(cards);
        saveOpportunityDayBoard(boardKey, incoming);
        paintBoard(incoming, reset);
        return incoming;
      };

      // The day's rows are already on disk. Painting them before the status check and
      // broker connect means the desk is readable immediately instead of showing a
      // spinner through two round trips that cannot change what is on screen.
      const cached = loadOpportunityDayBoard(boardKey);
      const cachedHasHits = cached.some((c) => c.hits.length);
      if (!quiet) {
        if (replaceDesk && !cachedHasHits) setCards(emptyOpportunityCards());
        if (cachedHasHits) {
          paintBoard(cached, replaceDesk);
          setProgress(`${cached.reduce((n, c) => n + c.hits.length, 0)} setups · refreshing…`);
        } else {
          setProgress('Loading shared day board…');
        }
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
        setMarketTrend(emptyMarketTrend());
        setProgress('Connect INDstocks for live scan — demo prices are off');
        return;
      }

      const provider = resolveLiveProvider();
      setDataMode('LIVE');
      void refreshMarketTrend(provider);

      try {
        let hadBoard = cachedHasHits;
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
          if (isNseFnoMarketOpen()) {
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
                  if (!out.hits.length) return;
                  const saved = await postOpportunityDayBoard(
                    activeFilters.universe,
                    activeFilters.timeframe,
                    tfHits(out.cards),
                  );
                  if (saved.cards?.some((c) => c.hits.length)) adoptBoard(saved.cards, false);
                } catch {
                  /* keep the saved board on screen */
                } finally {
                  contributeRef.current = false;
                  setBgBusy(false);
                }
              })();
            }
          } else {
            closedBoardFrozenRef.current = true;
            if (!quiet) setProgress('Last session board');
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
          const hasHits = incoming.some((c) => c.hits.length);
          if (hasHits) {
            try {
              const saved = await postOpportunityDayBoard(
                activeFilters.universe,
                activeFilters.timeframe,
                incoming,
              );
              if (saved.cards?.some((c) => c.hits.length)) incoming = tfHits(saved.cards);
            } catch {
              /* keep local incoming */
            }
            saveOpportunityDayBoard(boardKey, incoming);
            paintBoard(incoming, false);
          }
          setDataMode(out.dataMode);
          if (!isNseFnoMarketOpen()) closedBoardFrozenRef.current = true;
          const n = incoming.reduce((sum, c) => sum + c.hits.length, 0);
          if (!quiet) setProgress(n ? `${n} setups ready` : 'No setups on this timeframe yet');
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
    [filters, refreshMarketTrend, liveHint],
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
    setSymbolQuery((q) => (looksLikeAutofilledPhone(q) ? '' : q));
  }, [rescanToken]);

  useEffect(() => {
    if (!filters.autoRefresh) return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void runScan({ quiet: true });
    };
    const id = window.setInterval(tick, filters.refreshSec * 1000);
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [filters.autoRefresh, filters.refreshSec, runScan]);

  const openAnalyze = (hit: OpportunityHit) => {
    openLiveWolfFromRadarResult(opportunityToRadarResult(hit));
    onOpenLive?.();
    onOpenWolfAi();
  };


  const { liveStreaming, cta: feedCta, label: feedLabel } = feedState({
    dataMode,
    feedStatus,
    marketOpen,
  });
  const selectedXFactor = selected ? xFactorOf(selected) : null;
  const needle = symbolNeedle(symbolQuery);

  /** Resolves a card against its own timeframe's board. */
  const cardView = useCallback(
    (scannerId: string) => {
      const timeframe = coerceScannerTimeframe(scannerId, cardTf[scannerId as never]);
      const primary = timeframe === filters.timeframe;
      const board = primary ? cards : sideBoards[timeframe];
      const hits = (board?.find((c) => c.scannerId === scannerId)?.hits || []).filter(
        (h) => h.timeframe === timeframe,
      );
      return { timeframe, hits, pending: !primary && board === undefined };
    },
    [cardTf, cards, filters.timeframe, sideBoards],
  );

  const hitCount = useMemo(
    () => cards.reduce((n, c) => n + cardView(c.scannerId).hits.length, 0),
    [cards, cardView],
  );
  const finder = useMemo(() => {
    if (!needle) return [] as Array<{ scannerId: string; title: string; side: OpportunityDirection; count: number }>;
    const byKey = new Map<string, { scannerId: string; title: string; side: OpportunityDirection; count: number }>();
    for (const card of cards) {
      for (const hit of cardView(card.scannerId).hits) {
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
  }, [cards, cardView, needle]);
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
        className="wolf-opp__hero wolf-opp__hero--slim wolf-opp__hero--lux"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="wolf-opp__hero-stage" aria-hidden>
          <div className="wolf-opp__hero-fog" />
          <i className="wolf-opp__hero-orb wolf-opp__hero-orb--a" />
          <i className="wolf-opp__hero-orb wolf-opp__hero-orb--b" />
          <span className="wolf-opp__hero-scan" />
          <span className="wolf-opp__hero-edge" />
        </div>
        <div className="wolf-opp__hero-copy">
          <p className="wolf-opp__eyebrow">Wolf Trade AI</p>
          <h1 className="wolf-opp__title">
            <span>Opportunity</span>
          </h1>
        </div>

        <div className="wolf-opp__pulse">
          <span className={`wolf-opp__mkt ${marketOpen ? 'is-open' : 'is-closed'}`}>
            {marketOpen ? 'Market open' : 'Market closed'}
          </span>
          <div
            className={`wolf-opp__trend is-${marketTrend.available ? marketTrend.bias : 'na'}`}
            title={marketTrend.reason}
          >
            <span>Market trend</span>
            {marketTrend.available && marketTrend.bias === 'bullish' ? <TrendingUp size={13} /> : null}
            {marketTrend.available && marketTrend.bias === 'bearish' ? <TrendingDown size={13} /> : null}
            {marketTrend.available && marketTrend.bias === 'neutral' ? <Minus size={13} /> : null}
            <em>{marketTrend.label}</em>
          </div>
        </div>

        <div className="wolf-opp__hero-actions">
          <div className={`wolf-opp__feed ${liveStreaming ? 'is-live' : ''}`}>
            {feedLabel}
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
          {onConnectData ? (
            <button
              type="button"
              className={`wolf-opp__cta${feedCta === 'manage' ? ' wolf-opp__cta--quiet' : ''}`}
              onClick={onConnectData}
              title={
                feedCta === 'connect'
                  ? 'Connect your broker for live data'
                  : 'Market data connection — reconnect or switch broker'
              }
            >
              <Link2 size={14} /> {feedCta === 'connect' ? 'Connect live' : 'Live data'}
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
        <form
          className="wolf-opp__search"
          autoComplete="off"
          onSubmit={(e) => e.preventDefault()}
        >
          <Search size={14} strokeWidth={2.2} />
          <input
            type="text"
            name="wolf_opp_symbol_finder"
            inputMode="search"
            value={symbolQuery}
            readOnly={!searchUnlocked}
            onFocus={() => setSearchUnlocked(true)}
            onChange={(e) => {
              const v = e.target.value;
              setSymbolQuery(looksLikeAutofilledPhone(v) ? '' : v);
            }}
            placeholder="Find a stock across scanners"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            aria-label="Search stock across scanners"
          />
          {symbolQuery ? (
            <button type="button" aria-label="Clear search" onClick={() => setSymbolQuery('')}>
              <X size={13} />
            </button>
          ) : null}
        </form>
        <p className="wolf-opp__status-line">
          {scanning ? progress || 'Scanning…' : hitCount ? `${hitCount} setups` : progress || '0 setups'}
          {lastUpdated
            ? ` · ${new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
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
          {cards.map((card) => {
            const deskSort = deskSortByScanner[card.scannerId] || DEFAULT_OPPORTUNITY_DESK_SORT;
            const view = cardView(card.scannerId);
            const tfChoices = scannerTimeframes(card.scannerId);
            const tfHits = sortHitsForDesk(
              view.hits.filter((h) => hitMatchesQuery(h, needle)),
              deskSort,
            );
            const printLabels = scannerPrintLabels(tfHits);
            if (needle && !tfHits.length) return null;
            return (
              <article
                key={card.scannerId}
                id={`wolf-opp-sheet-${card.scannerId}`}
                className={`wolf-opp__sheet${needle ? ' is-found' : ''}`}
              >
                <header className="wolf-opp__sheet-head">
                  <div>
                    <h3>{prettyTitle(card.title)}</h3>
                    <TrackRecordStrip record={trackRecord[card.scannerId]} />
                  </div>
                  <div className="wolf-opp__sheet-tools">
                    {tfChoices.length > 1 ? (
                      <div
                        className="wolf-opp__sheet-tf"
                        role="group"
                        aria-label={`${prettyTitle(card.title)} timeframe`}
                      >
                        {tfChoices.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={`wolf-opp__sheet-tf-btn${t === view.timeframe ? ' is-on' : ''}`}
                            aria-pressed={t === view.timeframe}
                            onClick={() =>
                              setCardTf((prev) => ({ ...prev, [card.scannerId]: t }))
                            }
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span
                        className="wolf-opp__sheet-tf-fixed"
                        title={`This scanner only runs on ${view.timeframe}`}
                      >
                        {view.timeframe}
                      </span>
                    )}
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
                    <span className="wolf-opp__sheet-count" title={`${tfHits.length} setups`}>
                      {tfHits.length}
                    </span>
                  </div>
                </header>

                {card.status === 'unavailable' ? (
                  <p className="wolf-opp__sheet-empty">{card.unavailableReason}</p>
                ) : (
                  <WaterStack>
                    {!tfHits.length ? (
                      <p className="wolf-opp__side-empty">
                        {view.pending
                          ? `Loading ${view.timeframe} board…`
                          : scanning || bgBusy
                            ? 'Hunting…'
                            : 'No setups'}
                      </p>
                    ) : (
                      tfHits.map((hit) => (
                        <HitTile
                          key={hit.id}
                          hit={hit}
                          printLabel={scannerPrintLabelOf(hit, printLabels)}
                          onOpen={setSelected}
                          onWhy={setWhyHit}
                        />
                      ))
                    )}
                  </WaterStack>
                )}
              </article>
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
                    {prettyTitle(selected.scannerId)} ·{' '}
                    {selectedXFactor != null
                      ? `X Factor ${formatXFactor(selectedXFactor)}`
                      : `${selected.score}/100`}
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
                {selectedXFactor != null ? (
                  <div>
                    <dt>X Factor</dt>
                    <dd title="Relative volume against this symbol's recent average">
                      {formatXFactor(selectedXFactor)}
                    </dd>
                  </div>
                ) : null}
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
                <a
                  href={tradingViewChartUrl(selected.symbol, selected.timeframe, selected.exchange)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wolf-opp__cta"
                  title={`Open ${selected.symbol} ${selected.timeframe} on TradingView`}
                >
                  <Crosshair size={14} /> Open chart
                </a>
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
