import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookMarked,
  Eye,
  Plus,
  Radar,
  ScanSearch,
  X,
} from 'lucide-react';
import { runRadarScanFull, DEFAULT_DISPLAY_LIMIT } from '../../../services/radar/radarScanner';
import {
  addToWatchlist,
  loadLastResults,
  loadWatchlist,
  loadRadarDayBoard,
  saveRadarDayBoard,
  radarDayBoardKey,
  mergeRadarResultKeepFirstSeen,
} from '../../../services/radar/radarStore';
import { openLiveWolfFromRadarResult } from '../../../services/live/liveBridge';
import AppLink from '../../AppLink';
import { liveWolfQuery } from '../../../utils/appNav';
import type {
  RadarResult,
  RadarScanIssue,
  RadarScanProgress,
  RadarScanSummary,
  RadarTimeframe,
  RadarUniverse,
} from '../../../services/radar/radarTypes';
import { marketFromUniverse } from '../../../services/radar/radarTypes';
import { STRATEGY_TEMPLATES } from '../../../services/strategy/strategyTemplates';
import { loadStrategies, strategyFromTemplate } from '../../../services/strategy/strategyStore';
import { WOLF_SCORE_WEIGHTS } from '../../../services/radar/WolfScoringEngine';
import {
  fetchMarketDataStatus,
  fetchUniversesMeta,
  isIndstocksLive,
  type ServerConnectionStatus,
} from '../../../services/marketData/marketDataApi';
import { initMarketDataService } from '../../../services/marketData/MarketDataService';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';
import ConnectMarketDataModal from './ConnectMarketDataModal';
import MySetupsPanel from './MySetupsPanel';
import WatchlistLimitPopup from './WatchlistLimitPopup';
import LuxSelect from '../../ui/LuxSelect';
import {
  STRATEGY_SCAN_EVENT,
  consumePendingStrategyScan,
  peekPendingStrategyScan,
  type PendingStrategyScan,
} from '../../../services/strategy/strategyBridge';
import type { StrategyDefinition } from '../../../services/strategy/strategyTypes';
import {
  formatCondition,
  formatTimeframeStack,
} from '../../../services/strategy/strategyDisplay';
import { catalogUniverseMeta } from '../../../services/radar/universeCatalog';

type RadarDesk = 'hunt' | 'lab';

type Props = {
  onOpenLive?: () => void;
  desk?: RadarDesk;
  onOpenHunt?: () => void;
  onOpenLab?: () => void;
};

const TIMEFRAMES: RadarTimeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'];

function statusClass(status: RadarResult['status']) {
  if (status === 'CONFIRMATION PENDING') return 'is-pending';
  if (status === 'SETUP CONFIRMED') return 'is-confirmed';
  if (status === 'INVALIDATED') return 'is-invalid';
  if (status === 'SETUP DEVELOPING') return 'is-developing';
  return 'is-watch';
}

function biasClass(d: string) {
  const x = d.toLowerCase();
  if (x.includes('bull')) return 'up';
  if (x.includes('bear')) return 'down';
  return 'flat';
}

function formatTime(ts: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

function RadarStage({ scanning }: { scanning: boolean }) {
  return (
    <div className={`wolf-radar-lux__stage ${scanning ? 'is-hot' : ''}`} aria-hidden>
      <div className="wolf-radar-lux__fog" />
      <div className="wolf-radar-lux__orb wolf-radar-lux__orb--a" />
      <div className="wolf-radar-lux__orb wolf-radar-lux__orb--b" />
      <div className="wolf-radar-lux__grid" />
      <div className="wolf-radar-lux__dish">
        <i />
        <i />
        <i />
        <i />
        <div className="wolf-radar-lux__sweep" />
        <span className="wolf-radar-lux__blips">
          <b />
          <b />
          <b />
          <b />
        </span>
      </div>
    </div>
  );
}

export default function WolfRadarPage({
  onOpenLive,
  desk = 'hunt',
  onOpenHunt,
  onOpenLab,
}: Props) {
  const [universe, setUniverse] = useState<RadarUniverse>('F&O');
  const [timeframe, setTimeframe] = useState<RadarTimeframe>('5m');
  const market = useMemo(() => marketFromUniverse(universe), [universe]);
  /** Screener key: '' | '__default__' | `tpl:${id}` | `mine:${id}` */
  const [screenerKey, setScreenerKey] = useState(() => {
    const pending = peekPendingStrategyScan()?.strategy;
    if (pending?.templateId) return `tpl:${pending.templateId}`;
    if (pending?.id) return `mine:${pending.id}`;
    return '';
  });
  const [myScreeners, setMyScreeners] = useState(() => loadStrategies());
  const [results, setResults] = useState<RadarResult[]>(() => loadLastResults());
  const [allMatches, setAllMatches] = useState<RadarResult[]>(() => loadLastResults());
  const [scanSummary, setScanSummary] = useState<RadarScanSummary | null>(null);
  const [scanIssues, setScanIssues] = useState<RadarScanIssue[]>([]);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [logicOpen, setLogicOpen] = useState(true);
  const [universeLoaded, setUniverseLoaded] = useState(() => catalogUniverseMeta('F&O').count);
  const [universeCatalogCount, setUniverseCatalogCount] = useState(
    () => catalogUniverseMeta('F&O').count,
  );
  const [universeUnavailable, setUniverseUnavailable] = useState(0);
  const [universeNote, setUniverseNote] = useState(() => catalogUniverseMeta('F&O').note);
  const [universeSource, setUniverseSource] = useState('static-catalog-fallback');
  const [optionCounts, setOptionCounts] = useState<Record<string, number>>(() => ({
    'F&O': catalogUniverseMeta('F&O').count,
    NSE: catalogUniverseMeta('NSE').count,
    BSE: catalogUniverseMeta('BSE').count,
    NIFTY50: 50,
    BANKNIFTY: catalogUniverseMeta('BANKNIFTY').count,
    CASH: catalogUniverseMeta('CASH').count,
  }));
  const [selected, setSelected] = useState<RadarResult | null>(null);
  const [progress, setProgress] = useState<RadarScanProgress>({
    status: 'idle',
    symbolsChecked: 0,
    symbolsTotal: 0,
    phase: '',
    lastScanAt: loadLastResults()[0]?.detectedAt ?? null,
  });
  const [watchSymbols, setWatchSymbols] = useState(() =>
    new Set(loadWatchlist().map((w) => w.symbol)),
  );
  const [watchLimitHit, setWatchLimitHit] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [mdStatus, setMdStatus] = useState<ServerConnectionStatus | null>(null);
  const [activeStrategy, setActiveStrategy] = useState<StrategyDefinition | null>(
    () => peekPendingStrategyScan()?.strategy ?? null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const scanGenRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastProgAtRef = useRef(0);

  useEffect(() => {
    const pending = consumePendingStrategyScan();
    if (pending) {
      sessionStorage.removeItem('wolf_strategy_auto_scan_id');
      sessionStorage.setItem('wolf_strategy_pending_auto', '1');
      setActiveStrategy(pending.strategy);
      setTimeframe(pending.strategy.timeframe);
      setScreenerKey(
        pending.strategy.templateId
          ? `tpl:${pending.strategy.templateId}`
          : `mine:${pending.strategy.id}`,
      );
    }
    const onStrategyScan = (ev: Event) => {
      const detail = (ev as CustomEvent<PendingStrategyScan>).detail;
      if (detail?.strategy) {
        sessionStorage.removeItem('wolf_strategy_auto_scan_id');
        sessionStorage.setItem('wolf_strategy_pending_auto', '1');
        setActiveStrategy(detail.strategy);
        setTimeframe(detail.strategy.timeframe);
        setScreenerKey(
          detail.strategy.templateId
            ? `tpl:${detail.strategy.templateId}`
            : `mine:${detail.strategy.id}`,
        );
        setMyScreeners(loadStrategies());
      }
    };
    window.addEventListener(STRATEGY_SCAN_EVENT, onStrategyScan);
    return () => window.removeEventListener(STRATEGY_SCAN_EVENT, onStrategyScan);
  }, []);

  useEffect(() => {
    void fetchMarketDataStatus()
      .then(async (s) => {
        setMdStatus(s);
        if (isIndstocksLive(s)) {
          const svc = initMarketDataService(serverMarketDataProvider);
          await svc.connect();
        }
      })
      .catch(() => {
        setMdStatus({
          status: 'DISCONNECTED',
          providerId: null,
          providerName: null,
          mode: null,
          historical: false,
          liveQuotes: false,
          orderAccess: 'NOT ENABLED',
          message: 'MARKET DATA DISCONNECTED',
        });
      });
  }, []);

  function resolveScanProvider(s: ServerConnectionStatus | null) {
    if (isIndstocksLive(s)) return serverMarketDataProvider;
    return null;
  }
  const dataConnected = isIndstocksLive(mdStatus);
  const dataLabel = dataConnected
    ? '● LIVE INDstocks'
    : mdStatus?.mode === 'DEMO'
      ? '○ DEMO OFF — connect INDstocks'
      : '○ MARKET DATA DISCONNECTED';

  const statusLabel = useMemo(() => {
    if (progress.status === 'scanning') return 'SCANNING…';
    if (progress.status === 'complete' && progress.phase === 'STOPPED') return 'SCAN STOPPED';
    if (progress.status === 'complete') return 'SCAN COMPLETE';
    if (progress.status === 'failed') return 'SCAN FAILED';
    return 'READY';
  }, [progress.status, progress.phase]);

  const stopScan = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const scan = useCallback(async (strategyOverride?: StrategyDefinition | null) => {
    if (inFlightRef.current) {
      // Restart: drop the in-flight scan so a click always feels alive
      abortRef.current?.abort();
    }
    let status = mdStatus;
    try {
      status = await fetchMarketDataStatus();
      setMdStatus(status);
    } catch {
      /* keep last known status */
    }
    const liveProvider = resolveScanProvider(status);
    if (!liveProvider) {
      setConnectOpen(true);
      return;
    }

    let key = screenerKey;
    const strategy =
      strategyOverride !== undefined ? strategyOverride : activeStrategy;

    if (!key && strategy) {
      key = strategy.templateId ? `tpl:${strategy.templateId}` : `mine:${strategy.id}`;
      setScreenerKey(key);
    }

    if (!key) {
      setProgress((p) => ({
        ...p,
        status: 'failed',
        error: 'Select what WOLF should scan for (SCREENER) before starting.',
        phase: 'SELECT SCREENER',
      }));
      return;
    }

    const ac = new AbortController();
    const gen = ++scanGenRef.current;
    abortRef.current?.abort();
    abortRef.current = ac;
    inFlightRef.current = true;

    setSelected(null);
    setShowAllMatches(false);
    setShowIssues(false);
    setScanIssues([]);
    setProgress({
      status: 'scanning',
      symbolsChecked: 0,
      symbolsTotal: universeLoaded,
      phase: strategy ? `STRATEGY: ${strategy.name}` : 'STARTING',
      lastScanAt: progress.lastScanAt,
      matchedSoFar: 0,
      noMatchSoFar: 0,
      unavailableSoFar: 0,
      errorsSoFar: 0,
      currentSymbol: null,
      error: undefined,
    });

    const isStale = () => scanGenRef.current !== gen || abortRef.current !== ac;

    try {
      const outcome = await runRadarScanFull(
        { market, universe, timeframe, displayLimit: DEFAULT_DISPLAY_LIMIT },
        {
          signal: ac.signal,
          onProgress: (p) => {
            if (isStale()) return;
            const now = Date.now();
            if (p.status === 'scanning' && now - lastProgAtRef.current < 220) return;
            lastProgAtRef.current = now;
            setProgress((prev) => ({ ...prev, ...p }));
          },
          onMatch: (row) => {
            if (isStale()) return;
            setAllMatches((prev) => {
              const next = mergeRadarResultKeepFirstSeen(prev, row);
              setResults(next);
              saveRadarDayBoard(radarDayBoardKey(universe, timeframe, screenerKey), next);
              return next;
            });
          },
          strategy,
          displayLimit: DEFAULT_DISPLAY_LIMIT,
        },
        liveProvider,
      );

      if (isStale()) return;

      setAllMatches((prev) => {
        let next = prev;
        for (const row of outcome.allMatches) {
          next = mergeRadarResultKeepFirstSeen(next, row);
        }
        saveRadarDayBoard(radarDayBoardKey(universe, timeframe, screenerKey), next);
        setResults(next);
        return next;
      });
      setScanSummary(outcome.summary);
      setScanIssues(outcome.issues);
      setUniverseCatalogCount(outcome.summary.universeLoaded);
      setUniverseLoaded(
        Math.max(
          outcome.summary.scanned,
          outcome.summary.matched ? outcome.summary.scanned : universeLoaded,
        ),
      );
      setProgress((p) => ({
        ...p,
        status: 'complete',
        lastScanAt: Date.now(),
        phase: ac.signal.aborted
          ? `STOPPED · ${outcome.summary.scanned} scanned · ${outcome.summary.matched} matches`
          : `COMPLETE · ${outcome.summary.scanned}/${outcome.summary.universeLoaded} scanned · ${outcome.summary.matched} matches`,
        matchedSoFar: outcome.summary.matched,
        unavailableSoFar: outcome.summary.unavailable,
        errorsSoFar: outcome.summary.errors,
        error: undefined,
      }));
    } catch (err) {
      if (isStale() || ac.signal.aborted) {
        if (!isStale()) {
          setProgress((p) => ({
            ...p,
            status: 'complete',
            phase: 'STOPPED',
            lastScanAt: Date.now(),
          }));
        }
        return;
      }
      const message = err instanceof Error ? err.message : 'SCAN FAILED — try again';
      setProgress((p) => ({
        ...p,
        status: 'failed',
        error: message,
        phase: 'ERROR',
      }));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      if (scanGenRef.current === gen) inFlightRef.current = false;
    }
  }, [
    market,
    universe,
    timeframe,
    progress.lastScanAt,
    dataConnected,
    mdStatus,
    activeStrategy,
    universeLoaded,
    screenerKey,
  ]);

  const applyScreenerKey = (key: string) => {
    setScreenerKey(key);
    setMyScreeners(loadStrategies());
    if (!key || key === '__default__') {
      setActiveStrategy(null);
      return;
    }
    if (key.startsWith('tpl:')) {
      const tpl = STRATEGY_TEMPLATES.find((t) => t.id === key.slice(4));
      if (!tpl) return;
      const strat = strategyFromTemplate(tpl);
      setActiveStrategy(strat);
      setTimeframe(strat.timeframe);
      return;
    }
    if (key.startsWith('mine:')) {
      const list = loadStrategies();
      const mine = list.find((s) => s.id === key.slice(5));
      if (!mine) return;
      setActiveStrategy(mine);
      setTimeframe(mine.timeframe);
    }
  };

  // Auto-run ONLY for Strategy Lab handoff (not every screener dropdown change)
  useEffect(() => {
    if (!activeStrategy || !dataConnected) return;
    if (sessionStorage.getItem('wolf_strategy_pending_auto') !== '1') return;
    if (sessionStorage.getItem('wolf_strategy_auto_scan_id') === activeStrategy.id) {
      sessionStorage.removeItem('wolf_strategy_pending_auto');
      return;
    }
    sessionStorage.removeItem('wolf_strategy_pending_auto');
    sessionStorage.setItem('wolf_strategy_auto_scan_id', activeStrategy.id);
    void scan(activeStrategy);
  }, [activeStrategy, dataConnected, scan]);

  const onAddWatch = (r: RadarResult) => {
    const res = addToWatchlist(r);
    if (res.limitReached) {
      setWatchLimitHit(true);
      return;
    }
    setWatchSymbols(new Set(res.items.map((w) => w.symbol)));
  };

  const onAnalyzeClick = (r: RadarResult) => {
    openLiveWolfFromRadarResult(r);
    onOpenLive?.();
  };

  const onOpenLiveClick = (r: RadarResult) => {
    openLiveWolfFromRadarResult(r);
    onOpenLive?.();
  };

  useEffect(() => {
    let cancelled = false;
    const provider = resolveScanProvider(mdStatus);
    if (!provider) {
      const m = catalogUniverseMeta(universe);
      setUniverseLoaded(m.count);
      setUniverseCatalogCount(m.count);
      setUniverseUnavailable(0);
      setUniverseNote(m.note);
      setUniverseSource('connect-indstocks');
      return;
    }
    void provider
      .getSymbols(universe, market)
      .then((syms) => {
        if (cancelled) return;
        const meta = provider.lastUniverseMeta ?? null;
        if (meta) {
          setUniverseCatalogCount(meta.universeLoaded);
          setUniverseLoaded(meta.dataAvailable || syms.length);
          setUniverseUnavailable(meta.dataUnavailable ?? 0);
          setUniverseNote(meta.note || catalogUniverseMeta(universe).note);
          setUniverseSource(meta.source || 'connected');
        } else {
          setUniverseLoaded(syms.length);
          setUniverseCatalogCount(syms.length);
          setUniverseUnavailable(0);
          setUniverseNote(catalogUniverseMeta(universe).note);
          setUniverseSource(mdStatus?.mode === 'LIVE' ? 'connected' : 'static-catalog-fallback');
        }
      })
      .catch(() => {
        if (cancelled) return;
        const m = catalogUniverseMeta(universe);
        setUniverseLoaded(m.count);
        setUniverseCatalogCount(m.count);
        setUniverseUnavailable(0);
        setUniverseNote(m.note);
        setUniverseSource('static-catalog-fallback');
      });

    if (mdStatus?.status === 'CONNECTED') {
      void fetchUniversesMeta()
        .then((meta) => {
          if (cancelled || !meta?.universes) return;
          const next: Record<string, number> = {};
          for (const [id, row] of Object.entries(meta.universes)) {
            next[id] = row.catalogCount || row.scannableCount;
          }
          setOptionCounts((prev) => ({ ...prev, ...next }));
          if (meta.source) setUniverseSource(meta.source);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [universe, market, mdStatus]);

  useEffect(() => {
    const rows = loadRadarDayBoard(radarDayBoardKey(universe, timeframe, screenerKey));
    setResults(rows);
    setAllMatches(rows);
  }, [universe, timeframe, screenerKey]);

  const visibleResults = showAllMatches && allMatches.length ? allMatches : results;
  const countFor = (id: RadarUniverse) => optionCounts[id] ?? catalogUniverseMeta(id).count;
  const scanPct =
    progress.symbolsTotal > 0
      ? Math.round((progress.symbolsChecked / progress.symbolsTotal) * 1000) / 10
      : 0;

  return (
    <div
      className={`wolf-radar-desk wolf-radar-lux ${progress.status === 'scanning' ? 'is-scanning' : ''} ${dataConnected ? 'is-live' : ''}`}
    >
      <RadarStage scanning={progress.status === 'scanning'} />
      <div className="wolf-radar-lux__tabs" role="tablist" aria-label="Radar desk">
        <button
          type="button"
          role="tab"
          aria-selected={desk === 'hunt'}
          className={desk === 'hunt' ? 'is-on' : ''}
          onClick={() => onOpenHunt?.()}
        >
          <Radar size={14} />
          HUNT
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={desk === 'lab'}
          className={desk === 'lab' ? 'is-on' : ''}
          onClick={() => onOpenLab?.()}
        >
          <BookMarked size={14} />
          STRATEGY LAB
        </button>
      </div>
      <div className={`wolf-radar-lux__pane ${desk === 'hunt' ? 'is-on' : ''}`}>
      <header className="wolf-radar-desk__header">
        <div className="wolf-radar-desk__brand">
          <p className="wolf-radar-lux__eyebrow">Hunt desk · live universe</p>
          <div className="wolf-radar-desk__title-row">
            <span className="wolf-radar-lux__mark">
              <Radar size={18} />
            </span>
            <h1>WOLF RADAR</h1>
          </div>
          <p className="wolf-radar-desk__subtitle">
            Find the setups WOLF has been taught to hunt.
          </p>
        </div>

        {activeStrategy && (
          <div className="wolf-radar-desk__strategy-banner">
            <div>
              <span>WHAT WOLF WILL SCAN</span>
              <strong>{activeStrategy.name}</strong>
              <small>
                {formatTimeframeStack(activeStrategy)} · {activeStrategy.conditions.length} conditions
              </small>
              <ul className="wolf-radar-desk__scan-conds">
                {activeStrategy.conditions.map((c) => (
                  <li key={c.id}>✓ {formatCondition(c)}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setActiveStrategy(null);
                setScreenerKey('');
                sessionStorage.removeItem('wolf_strategy_auto_scan_id');
              }}
            >
              Clear screener
            </button>
          </div>
        )}

        <div className="wolf-radar-desk__controls">
          <label className="wolf-radar-desk__datasource">
            <span>DATA SOURCE</span>
            <button
              type="button"
              className={`wolf-radar-desk__source-btn ${dataConnected ? 'is-on' : ''}`}
              onClick={() => setConnectOpen(true)}
            >
              {dataLabel}
            </button>
          </label>
          <LuxSelect
            className="wolf-radar-desk__screener"
            label="SCREENER"
            placeholder="Select a screener…"
            value={screenerKey}
            onOpen={() => setMyScreeners(loadStrategies())}
            onChange={applyScreenerKey}
            groups={[
              {
                label: '',
                options: [
                  { value: '', label: 'Select a screener…' },
                  { value: '__default__', label: 'WOLF default engines (unfiltered)' },
                ],
              },
              {
                label: 'WOLF PREDEFINED',
                options: STRATEGY_TEMPLATES.map((t) => ({ value: `tpl:${t.id}`, label: t.name })),
              },
              {
                label: 'MY SCREENERS',
                options: myScreeners.length
                  ? myScreeners.map((s) => ({ value: `mine:${s.id}`, label: s.name }))
                  : [{ value: '__none_mine', label: 'No saved screeners yet', disabled: true }],
              },
            ]}
          />
          <LuxSelect
            className="wolf-radar-desk__universe"
            label="UNIVERSE"
            value={universe}
            onChange={(v) => setUniverse(v as RadarUniverse)}
            options={[
              { value: 'NSE', label: `NSE Equity (${countFor('NSE').toLocaleString('en-IN')})` },
              { value: 'BSE', label: `BSE Equity (${countFor('BSE').toLocaleString('en-IN')})` },
              { value: 'F&O', label: `F&O (${countFor('F&O').toLocaleString('en-IN')})` },
              { value: 'NIFTY50', label: `NIFTY 50 (${countFor('NIFTY50')})` },
              { value: 'BANKNIFTY', label: `BANKNIFTY (${countFor('BANKNIFTY')})` },
              { value: 'CASH', label: `Cash snapshot (${countFor('CASH').toLocaleString('en-IN')})` },
            ]}
          />
          <LuxSelect
            className="wolf-radar-desk__timeframe"
            label="TIMEFRAME"
            value={timeframe}
            onChange={(v) => setTimeframe(v as RadarTimeframe)}
            options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf.toUpperCase() }))}
          />
          {progress.status === 'scanning' ? (
            <button type="button" className="wolf-radar-desk__stop-btn" onClick={stopScan}>
              STOP SCAN
            </button>
          ) : (
            <button
              type="button"
              className="wolf-radar-desk__scan-btn"
              onClick={() => void scan()}
            >
              <ScanSearch size={16} />
              SCAN MARKET
            </button>
          )}
        </div>

        <div className="wolf-radar-desk__meta">
          <span>
            Universe:{' '}
            <b>
              {universeLoaded.toLocaleString('en-IN')} scannable
            </b>
            {universeCatalogCount !== universeLoaded ? (
              <>
                {' '}
                · catalog {universeCatalogCount.toLocaleString('en-IN')}
                {universeUnavailable > 0
                  ? ` · ${universeUnavailable.toLocaleString('en-IN')} unresolved`
                  : ''}
              </>
            ) : null}{' '}
            · {universeNote}
          </span>
          <span title={universeSource}>
            Source: <b>{universeSource.includes('instrument') ? 'INSTRUMENT MASTER' : 'CATALOG'}</b>
          </span>
          <span>
            Last scan: <b>{formatTime(progress.lastScanAt)}</b>
          </span>
          <span className={`wolf-radar-desk__status is-${progress.status}`}>
            <i /> {statusLabel}
          </span>
          <span className="wolf-radar-desk__demo" title="Data mode">
            {dataConnected ? mdStatus?.providerName || 'INDstocks LIVE' : 'Connect INDstocks to scan'}
          </span>
        </div>
        {progress.status === 'scanning' && (
          <p className="wolf-radar-desk__scan-live" aria-live="polite">
            Scanning {progress.symbolsChecked}/{progress.symbolsTotal || universeLoaded}
            {progress.currentSymbol ? ` · ${progress.currentSymbol}` : ''}
            {progress.matchedSoFar != null ? ` · matches ${progress.matchedSoFar}` : ''}
          </p>
        )}
        {progress.status === 'failed' && progress.error && (
          <p className="wolf-radar-desk__scan-err" role="alert">
            {progress.error}
          </p>
        )}
      </header>

      <section className="wolf-radar-desk__logic">
        <button
          type="button"
          className="wolf-radar-desk__logic-toggle"
          onClick={() => setLogicOpen((o) => !o)}
        >
          WHAT IS WOLF SCANNING? {logicOpen ? '▾' : '▸'}
        </button>
        {logicOpen && (
          <div className="wolf-radar-desk__logic-body">
            {activeStrategy ? (
              <>
                <p>
                  <span>Strategy</span>
                  <strong>{activeStrategy.name}</strong>
                </p>
                <p>
                  <span>Timeframes</span>
                  <strong>{formatTimeframeStack(activeStrategy)}</strong>
                </p>
                <p>
                  <span>Logic</span>
                  <strong>ALL conditions required (AND)</strong>
                </p>
                <ul>
                  {activeStrategy.conditions.map((c) => (
                    <li key={c.id}>✓ {formatCondition(c)}</li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p>
                  <span>Mode</span>
                  <strong>Default Radar engines</strong>
                </p>
                <p>
                  <span>Timeframe</span>
                  <strong>{timeframe.toUpperCase()} (+ HTF context)</strong>
                </p>
                <ul>
                  <li>✓ Structure / Liquidity / Volume engines</li>
                  <li>✓ Setup classifier + WOLF Score ≥ 62</li>
                  <li>Tip: open Strategy Lab and SCAN a saved setup for exact conditions</li>
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      {!dataConnected && (
        <section className="wolf-radar-desk__connect-banner">
          <p>Connect market data to scan markets. Demo data is clearly marked — not live.</p>
          <button type="button" onClick={() => setConnectOpen(true)}>
            CONNECT MARKET DATA
          </button>
        </section>
      )}

      {progress.status === 'scanning' ? (
        <section className="wolf-radar-desk__loading" aria-live="polite">
          <div className="wolf-radar-lux__hud" aria-hidden>
            <span />
            <b />
            <em>{Math.max(4, Math.round(scanPct))}%</em>
          </div>
          <div>
            <h3>WOLF IS SCANNING</h3>
            <p>
              Universe: {universe} · {progress.symbolsChecked} / {progress.symbolsTotal || '—'} (
              {scanPct}%)
            </p>
            <p className="phase">
              Current: {progress.currentSymbol || '—'} · Matched: {progress.matchedSoFar ?? 0}
            </p>
          </div>
          <div className="wolf-radar-desk__bar">
            <i style={{ width: `${Math.min(100, scanPct || 4)}%` }} />
          </div>
        </section>
      ) : null}

      {scanSummary && progress.status === 'complete' && (
        <section className="wolf-radar-desk__summary">
          <h3>SCAN COMPLETE</h3>
          <div className="wolf-radar-desk__summary-grid">
            <div>
              <span>Universe</span>
              <b>{scanSummary.universe}</b>
            </div>
            <div>
              <span>Scanned</span>
              <b>
                {scanSummary.scanned} / {scanSummary.universeLoaded}
              </b>
            </div>
            <div>
              <span>Matched</span>
              <b>{scanSummary.matched}</b>
            </div>
            <div>
              <span>Displayed</span>
              <b>
                {showAllMatches ? scanSummary.matched : scanSummary.displayed} (cap{' '}
                {scanSummary.displayLimit})
              </b>
            </div>
            <div>
              <span>Developing</span>
              <b>{scanSummary.developing}</b>
            </div>
            <div>
              <span>Watch / Confirmed</span>
              <b>
                {scanSummary.watch} / {scanSummary.confirmed}
              </b>
            </div>
            <div>
              <span>Unavailable</span>
              <b>{scanSummary.unavailable}</b>
            </div>
            <div>
              <span>Duration</span>
              <b>{(scanSummary.durationMs / 1000).toFixed(1)}s</b>
            </div>
          </div>
          {scanSummary.matched === 0 && (
            <p className="wolf-radar-desk__summary-empty">
              Full scan finished — no symbols matched this strategy. Try relaxing a condition (Strategy
              Lab). Scanner did not fail.
            </p>
          )}
          <div className="wolf-radar-desk__summary-actions">
            {scanSummary.matched > scanSummary.displayed && (
              <button type="button" className="ghost" onClick={() => setShowAllMatches((v) => !v)}>
                {showAllMatches
                  ? `SHOW TOP ${scanSummary.displayLimit}`
                  : `SHOW ALL ${scanSummary.matched}`}
              </button>
            )}
            {scanIssues.length > 0 && (
              <button type="button" className="ghost" onClick={() => setShowIssues((v) => !v)}>
                {showIssues ? 'HIDE DATA ISSUES' : `VIEW DATA ISSUES (${scanIssues.length})`}
              </button>
            )}
          </div>
          {showIssues && (
            <ul className="wolf-radar-desk__issues">
              {scanIssues.slice(0, 40).map((iss) => (
                <li key={`${iss.symbol}-${iss.reason}`}>
                  <b>{iss.symbol}</b> — {iss.reason}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="wolf-radar-desk__results">
        <div className="wolf-radar-desk__section-head">
          <Eye size={14} />
          <h2>WOLF DETECTED</h2>
          <small>
            Display after full-universe scan · WOLF SCORE = setup quality, not profit probability
          </small>
        </div>

        {progress.status === 'failed' && (
          <div className="wolf-radar-desk__empty is-error">
            <p>SCAN FAILED</p>
            <span>{progress.error || 'Something went wrong. Try again.'}</span>
          </div>
        )}

        {progress.status !== 'scanning' && visibleResults.length === 0 && (
          <div className="wolf-radar-desk__empty">
            <div className="wolf-radar-lux__empty-radar" aria-hidden />
            <p>{scanSummary ? 'No matches after full scan' : 'No setups detected yet'}</p>
            <span>
              {dataConnected
                ? scanSummary
                  ? `${scanSummary.scanned}/${scanSummary.universeLoaded} scanned. Try another setup or timeframe.`
                  : 'Run SCAN MARKET to evaluate the full selected universe.'
                : 'Connect market data, then scan.'}
            </span>
            <button type="button" className="wolf-radar-desk__scan-btn" onClick={() => void scan()}>
              {dataConnected ? 'SCAN MARKET' : 'CONNECT MARKET DATA'}
            </button>
          </div>
        )}

        <div className="wolf-radar-desk__cards">
          {visibleResults.map((r, idx) => (
            <motion.article
              key={r.symbol}
              className="wolf-radar-desk__card"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: Math.min(idx * 0.045, 0.45), duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              <AppLink
                to="live-wolf"
                query={liveWolfQuery(r)}
                className="wolf-radar-desk__card-main"
                onActivate={() => onOpenLiveClick(r)}
              >
                <div className="wolf-radar-desk__card-top">
                  <div>
                    <h3>{r.symbol}</h3>
                    <span className="price">
                      ₹{r.price.toLocaleString('en-IN')} · {r.timeframe.toUpperCase()}
                    </span>
                  </div>
                  <div className="score" style={{ ['--rd-score' as string]: r.score }}>
                    <b>{r.score}</b>
                    <small>/100</small>
                  </div>
                </div>
                <p className="setup">
                  {r.setupType} · <span className={biasClass(r.direction)}>{r.direction}</span>
                </p>
                <ul className="tags">
                  {(Array.isArray(r.matchedConditions) && r.matchedConditions.length
                    ? r.matchedConditions
                    : Array.isArray(r.confirmations)
                      ? r.confirmations
                      : []
                  ).map((c) => (
                    <li key={String(c)}>{r.matchedConditions?.length ? `✓ ${c}` : String(c)}</li>
                  ))}
                </ul>
                {r.strategyName && (
                  <p className="setup wolf-radar-desk__strategy-tag">SETUP: {r.strategyName}</p>
                )}
                <div className={`state ${statusClass(r.status)}`}>{r.status}</div>
                <time>Created {formatTime(r.detectedAt)} IST</time>
              </AppLink>
              <div className="wolf-radar-desk__card-actions">
                <AppLink
                  to="live-wolf"
                  query={liveWolfQuery(r)}
                  className="primary"
                  onActivate={() => onOpenLiveClick(r)}
                >
                  LIVE WOLF
                </AppLink>
                <button type="button" className="ghost" onClick={() => setSelected(r)}>
                  DETAILS
                </button>
                <AppLink
                  to="live-wolf"
                  query={liveWolfQuery(r)}
                  className="ghost"
                  onActivate={() => onAnalyzeClick(r)}
                >
                  ANALYZE
                </AppLink>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onAddWatch(r)}
                  disabled={watchSymbols.has(r.symbol)}
                >
                  <Plus size={14} />
                  {watchSymbols.has(r.symbol) ? 'WATCHING' : 'WATCHLIST'}
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      <AnimatePresence>
        {selected ? (
          <motion.button
            key="radar-veil"
            type="button"
            className="wolf-radar-lux__veil"
            aria-label="Close details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {selected ? (
          <motion.aside
            key="radar-drawer"
            className="wolf-radar-desk__drawer"
            initial={{ opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 36 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            role="dialog"
            aria-label={`${selected.symbol} detail`}
          >
            <div className="wolf-radar-desk__drawer-head">
              <div>
                <h3>{selected.symbol}</h3>
                <span>
                  WOLF SCORE {selected.score}/100 · {selected.setupType}
                </span>
              </div>
              <button type="button" aria-label="Close" onClick={() => setSelected(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="wolf-radar-desk__metrics">
              <div>
                <span>MARKET STRUCTURE</span>
                <b>{selected.structure}</b>
              </div>
              <div>
                <span>LIQUIDITY</span>
                <b>{selected.liquidity}</b>
              </div>
              <div>
                <span>VOLUME</span>
                <b>{selected.volume}</b>
              </div>
              <div>
                <span>HTF ALIGNMENT</span>
                <b>{selected.htfAlignment ? 'YES' : 'NO'}</b>
              </div>
              <div>
                <span>MOMENTUM</span>
                <b>{selected.momentum}</b>
              </div>
              <div>
                <span>STATUS</span>
                <b>{selected.status}</b>
              </div>
            </div>

            {selected.matchedConditions?.length ? (
              <div className="wolf-radar-desk__why">
                <h4>MATCHED CONDITIONS</h4>
                <ul className="wolf-radar-desk__matched">
                  {selected.matchedConditions.map((c) => (
                    <li key={c}>✓ {c}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="wolf-radar-desk__why">
              <h4>WHY WOLF IS WATCHING</h4>
              <p>{selected.explanation}</p>
              <p className="inv">
                <strong>Invalidation:</strong> {selected.invalidation}
              </p>
            </div>

            <div className="wolf-radar-desk__breakdown">
              <h4>SCORE BREAKDOWN</h4>
              <p className="wolf-radar-desk__score-note">
                Setup quality model (max {Object.values(WOLF_SCORE_WEIGHTS).reduce((a, b) => a + b, 0)}
                ). Not profit probability.
              </p>
              <ul>
                {Object.entries(selected.scoreBreakdown).map(([k, v]) => (
                  <li key={k}>
                    <span>
                      {k}{' '}
                      <em>
                        /{WOLF_SCORE_WEIGHTS[k as keyof typeof WOLF_SCORE_WEIGHTS] ?? '—'}
                      </em>
                    </span>
                    <b>{v}</b>
                  </li>
                ))}
              </ul>
            </div>

            <div className="wolf-radar-desk__card-actions">
              <AppLink
                to="live-wolf"
                query={liveWolfQuery(selected)}
                className="primary"
                onActivate={() => onAnalyzeClick(selected)}
              >
                ANALYZE IN LIVE WOLF
              </AppLink>
              <button type="button" className="ghost" onClick={() => onAddWatch(selected)}>
                ADD TO WATCHLIST
              </button>
            </div>
            </motion.aside>
        ) : null}
      </AnimatePresence>
      </div>

      <div className={`wolf-radar-lux__pane ${desk === 'lab' ? 'is-on' : ''}`}>
        <MySetupsPanel embedded onScanSetup={() => onOpenHunt?.()} />
      </div>

      <ConnectMarketDataModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        status={mdStatus}
        onStatusChange={(s) => {
          setMdStatus(s);
          if (isIndstocksLive(s)) {
            setConnectOpen(false);
            void initMarketDataService(serverMarketDataProvider).connect();
          }
        }}
      />

      {watchLimitHit ? <WatchlistLimitPopup onClose={() => setWatchLimitHit(false)} /> : null}
    </div>
  );
}
