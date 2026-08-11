import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Eye,
  Plus,
  Radar,
  ScanSearch,
  Sparkles,
  X,
} from 'lucide-react';
import { fetchMarketPulse, runRadarScanFull, DEFAULT_DISPLAY_LIMIT, type ScanActivityRow } from '../../../services/radar/radarScanner';
import {
  addToWatchlist,
  loadLastResults,
  loadWatchlist,
} from '../../../services/radar/radarStore';
import { setPendingRadarAnalyze } from '../../../services/radar/radarBridge';
import { openLiveWolfFromRadarResult } from '../../../services/live/liveBridge';
import type {
  MarketPulseItem,
  RadarMarket,
  RadarResult,
  RadarScanIssue,
  RadarScanProgress,
  RadarScanSummary,
  RadarTimeframe,
  RadarUniverse,
} from '../../../services/radar/radarTypes';
import { WOLF_SCORE_WEIGHTS } from '../../../services/radar/WolfScoringEngine';
import {
  fetchMarketDataStatus,
  fetchUniversesMeta,
  type ServerConnectionStatus,
} from '../../../services/marketData/marketDataApi';
import { initMarketDataService, getMarketDataService } from '../../../services/marketData/MarketDataService';
import { mockMarketDataProvider } from '../../../services/radar/MockMarketDataProvider';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';
import ConnectMarketDataModal from './ConnectMarketDataModal';
import type { MarketDataProvider } from '../../../services/radar/MarketDataProvider';
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

type Props = {
  onAnalyze: () => void;
  onOpenLive?: () => void;
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
    second: '2-digit',
  });
}

export default function WolfRadarPage({ onAnalyze, onOpenLive }: Props) {
  const [market, setMarket] = useState<RadarMarket>('NSE');
  const [universe, setUniverse] = useState<RadarUniverse>('F&O');
  const [timeframe, setTimeframe] = useState<RadarTimeframe>('5m');
  const [pulse, setPulse] = useState<MarketPulseItem[]>([]);
  const [results, setResults] = useState<RadarResult[]>(() => loadLastResults());
  const [allMatches, setAllMatches] = useState<RadarResult[]>([]);
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
  const [connectOpen, setConnectOpen] = useState(false);
  const [mdStatus, setMdStatus] = useState<ServerConnectionStatus | null>(null);
  const [activeStrategy, setActiveStrategy] = useState<StrategyDefinition | null>(
    () => peekPendingStrategyScan()?.strategy ?? null,
  );
  const [scanActivity, setScanActivity] = useState<ScanActivityRow[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const pending = consumePendingStrategyScan();
    if (pending) {
      sessionStorage.removeItem('wolf_strategy_auto_scan_id');
      setActiveStrategy(pending.strategy);
      setTimeframe(pending.strategy.timeframe);
    }
    const onStrategyScan = (ev: Event) => {
      const detail = (ev as CustomEvent<PendingStrategyScan>).detail;
      if (detail?.strategy) {
        sessionStorage.removeItem('wolf_strategy_auto_scan_id');
        setActiveStrategy(detail.strategy);
        setTimeframe(detail.strategy.timeframe);
      }
    };
    window.addEventListener(STRATEGY_SCAN_EVENT, onStrategyScan);
    return () => window.removeEventListener(STRATEGY_SCAN_EVENT, onStrategyScan);
  }, []);

  useEffect(() => {
    initMarketDataService(mockMarketDataProvider);
    void fetchMarketDataStatus()
      .then(async (s) => {
        setMdStatus(s);
        if (s.status === 'CONNECTED' && s.mode === 'LIVE') {
          const svc = initMarketDataService(serverMarketDataProvider);
          await svc.connect();
        } else if (s.status === 'CONNECTED' && s.mode === 'DEMO') {
          const svc = initMarketDataService(mockMarketDataProvider);
          await svc.connect();
        }
        const provider = resolveScanProvider(s);
        void fetchMarketPulse(provider).then((p) => setPulse(p.items));
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
        void fetchMarketPulse(mockMarketDataProvider).then((p) => setPulse(p.items));
      });
  }, []);

  function resolveScanProvider(s: ServerConnectionStatus | null): MarketDataProvider {
    if (s?.status === 'CONNECTED' && s.mode === 'LIVE') return serverMarketDataProvider;
    try {
      return getMarketDataService().getProvider();
    } catch {
      return mockMarketDataProvider;
    }
  }
  const dataConnected = mdStatus?.status === 'CONNECTED';
  const dataLabel = dataConnected
    ? mdStatus?.mode === 'DEMO'
      ? '● DEMO MARKET DATA'
      : '● MARKET DATA CONNECTED'
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

  const scan = useCallback(async () => {
    if (progress.status === 'scanning') return;
    if (!dataConnected) {
      setConnectOpen(true);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setSelected(null);
    setShowAllMatches(false);
    setShowIssues(false);
    setScanSummary(null);
    setScanIssues([]);
    setAllMatches([]);
    setResults([]);
    setScanActivity([]);
    setProgress({
      status: 'scanning',
      symbolsChecked: 0,
      symbolsTotal: universeLoaded,
      phase: activeStrategy ? `STRATEGY: ${activeStrategy.name}` : 'STARTING',
      lastScanAt: progress.lastScanAt,
      matchedSoFar: 0,
      noMatchSoFar: 0,
      unavailableSoFar: 0,
      errorsSoFar: 0,
      currentSymbol: null,
    });
    try {
      const outcome = await runRadarScanFull(
        { market, universe, timeframe, displayLimit: DEFAULT_DISPLAY_LIMIT },
        {
          signal: ac.signal,
          onProgress: (p) => setProgress((prev) => ({ ...prev, ...p })),
          onMatch: (row) => {
            setAllMatches((prev) => {
              const next = [...prev.filter((x) => x.symbol !== row.symbol), row].sort(
                (a, b) => b.score - a.score,
              );
              setResults(next.slice(0, DEFAULT_DISPLAY_LIMIT));
              return next;
            });
          },
          onActivity: (row) => {
            setScanActivity((prev) => [row, ...prev].slice(0, 80));
          },
          strategy: activeStrategy,
          displayLimit: DEFAULT_DISPLAY_LIMIT,
        },
        resolveScanProvider(mdStatus),
      );
      setAllMatches(outcome.allMatches);
      setResults(outcome.results);
      setScanSummary(outcome.summary);
      setScanIssues(outcome.issues);
      setUniverseCatalogCount(outcome.summary.universeLoaded);
      setUniverseLoaded(
        Math.max(outcome.summary.scanned, outcome.summary.matched ? outcome.summary.scanned : universeLoaded),
      );
      // Keep authoritative scannable size from pre-scan when available
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
      }));
    } catch (err) {
      if (ac.signal.aborted) {
        setProgress((p) => ({
          ...p,
          status: 'complete',
          phase: 'STOPPED',
          lastScanAt: Date.now(),
        }));
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
    }
  }, [
    market,
    universe,
    timeframe,
    progress.status,
    progress.lastScanAt,
    dataConnected,
    mdStatus,
    activeStrategy,
    universeLoaded,
  ]);

  // Auto-run once when Strategy Lab hands off a setup and data is already connected
  useEffect(() => {
    if (!activeStrategy || !dataConnected || progress.status === 'scanning') return;
    const raw = sessionStorage.getItem('wolf_strategy_auto_scan_id');
    if (raw === activeStrategy.id) return;
    sessionStorage.setItem('wolf_strategy_auto_scan_id', activeStrategy.id);
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot on strategy handoff
  }, [activeStrategy?.id, dataConnected]);

  const onAddWatch = (r: RadarResult) => {
    const list = addToWatchlist(r);
    setWatchSymbols(new Set(list.map((w) => w.symbol)));
  };

  const onAnalyzeClick = (r: RadarResult) => {
    setPendingRadarAnalyze(r);
    onAnalyze();
  };

  const onOpenLiveClick = (r: RadarResult) => {
    openLiveWolfFromRadarResult(r);
    onOpenLive?.();
  };

  useEffect(() => {
    let cancelled = false;
    void resolveScanProvider(mdStatus)
      .getSymbols(universe, market)
      .then((syms) => {
        if (cancelled) return;
        const provider = resolveScanProvider(mdStatus);
        const meta =
          'lastUniverseMeta' in provider
            ? (provider as typeof serverMarketDataProvider).lastUniverseMeta
            : null;
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
            next[id] = row.scannableCount || row.catalogCount;
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

  const visibleResults = showAllMatches && allMatches.length ? allMatches : results;
  const countFor = (id: RadarUniverse) => optionCounts[id] ?? catalogUniverseMeta(id).count;
  const scanPct =
    progress.symbolsTotal > 0
      ? Math.round((progress.symbolsChecked / progress.symbolsTotal) * 1000) / 10
      : 0;

  return (
    <div className="wolf-radar-desk">
      <header className="wolf-radar-desk__header">
        <div className="wolf-radar-desk__brand">
          <div className="wolf-radar-desk__title-row">
            <Radar size={18} className="text-gold" />
            <h1>WOLF RADAR</h1>
          </div>
          <p className="wolf-radar-desk__subtitle">
            Find the setups WOLF has been taught to hunt.
          </p>
        </div>

        {activeStrategy && (
          <div className="wolf-radar-desk__strategy-banner">
            <div>
              <span>Selected Setup</span>
              <strong>{activeStrategy.name}</strong>
              <small>
                {formatTimeframeStack(activeStrategy)} · {activeStrategy.conditions.length} conditions
              </small>
            </div>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setActiveStrategy(null);
                sessionStorage.removeItem('wolf_strategy_auto_scan_id');
              }}
            >
              Clear filter
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
          <label>
            <span>MARKET</span>
            <select
              value={universe === 'BSE' ? 'BSE' : universe === 'F&O' ? 'F&O' : market}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'F&O') {
                  setUniverse('F&O');
                  setMarket('NSE');
                } else if (v === 'BSE') {
                  setUniverse('BSE');
                  setMarket('BSE');
                } else {
                  setUniverse('NSE');
                  setMarket('NSE');
                }
              }}
            >
              <option value="NSE">NSE Equity ({countFor('NSE').toLocaleString('en-IN')})</option>
              <option value="BSE">BSE Equity ({countFor('BSE').toLocaleString('en-IN')})</option>
              <option value="F&O">F&O Underlyings ({countFor('F&O').toLocaleString('en-IN')})</option>
            </select>
          </label>
          <label>
            <span>UNIVERSE</span>
            <select
              value={universe}
              onChange={(e) => {
                const next = e.target.value as RadarUniverse;
                setUniverse(next);
                if (next === 'BSE') setMarket('BSE');
                else setMarket('NSE');
              }}
            >
              <option value="F&O">F&O underlyings ({countFor('F&O').toLocaleString('en-IN')})</option>
              <option value="NSE">NSE equity ({countFor('NSE').toLocaleString('en-IN')})</option>
              <option value="BSE">BSE equity ({countFor('BSE').toLocaleString('en-IN')})</option>
              <option value="NIFTY50">NIFTY 50 ({countFor('NIFTY50')})</option>
              <option value="BANKNIFTY">BANKNIFTY basket ({countFor('BANKNIFTY')})</option>
              <option value="CASH">CASH / Nifty snapshot ({countFor('CASH')})</option>
            </select>
          </label>
          <label>
            <span>TIMEFRAME</span>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as RadarTimeframe)}
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="wolf-radar-desk__scan-btn"
            onClick={() => void scan()}
            disabled={progress.status === 'scanning'}
          >
            <ScanSearch size={16} />
            SCAN MARKET
          </button>
          {progress.status === 'scanning' ? (
            <button type="button" className="wolf-radar-desk__stop-btn" onClick={stopScan}>
              STOP SCAN
            </button>
          ) : null}
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
            {dataConnected
              ? mdStatus?.mode === 'DEMO'
                ? mockMarketDataProvider.label
                : mdStatus?.providerName || 'MARKET DATA'
              : 'Connect market data to scan'}
          </span>
        </div>
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

      {(progress.status === 'scanning' || allMatches.length > 0) && (
        <section className="wolf-radar-desk__live" aria-live="polite">
          <div className="wolf-radar-desk__section-head">
            <Radar size={14} />
            <h2>{progress.status === 'scanning' ? 'WOLF IS SCANNING' : 'LIVE DISCOVERIES'}</h2>
            <small>
              {progress.symbolsChecked.toLocaleString('en-IN')} /{' '}
              {Math.max(progress.symbolsTotal, universeLoaded).toLocaleString('en-IN')} · {scanPct}%
              {progress.currentSymbol ? ` · CURRENT ${progress.currentSymbol}` : ''}
            </small>
          </div>
          <div className="wolf-radar-desk__live-stats">
            <span>
              MATCHES <b>{progress.matchedSoFar ?? allMatches.length}</b>
            </span>
            <span>
              NO MATCH <b>{progress.noMatchSoFar ?? 0}</b>
            </span>
            <span>
              DATA ISSUES <b>{progress.unavailableSoFar ?? 0}</b>
            </span>
            <span>
              ERRORS <b>{progress.errorsSoFar ?? 0}</b>
            </span>
          </div>
          {allMatches.length > 0 && (
            <ul className="wolf-radar-desk__discoveries">
              {allMatches.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelected(r)}>
                    <strong>{r.symbol}</strong>
                    <em>{r.score}/100</em>
                    <span>{r.setupType}</span>
                    <small>
                      {progress.status === 'scanning'
                        ? 'Just now'
                        : formatTime(r.detectedAt)}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="wolf-radar-desk__activity-toggle"
            onClick={() => setActivityOpen((o) => !o)}
          >
            SCAN ACTIVITY {activityOpen ? '▾' : '▸'}
          </button>
          {activityOpen && (
            <ul className="wolf-radar-desk__activity">
              {!scanActivity.length && <li className="empty">Evaluations appear here live.</li>}
              {scanActivity.slice(0, 24).map((a, i) => (
                <li key={`${a.symbol}-${a.at}-${i}`}>
                  <strong>{a.symbol}</strong>
                  <span className={`st is-${a.status.toLowerCase()}`}>{a.status.replace('_', ' ')}</span>
                  <small>{a.reason || (a.score != null ? `${a.score}/100` : '')}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="wolf-radar-desk__pulse" aria-label="Market pulse">
        <div className="wolf-radar-desk__section-head">
          <Activity size={14} />
          <h2>MARKET PULSE</h2>
          <small>
            {dataConnected && mdStatus?.mode === 'DEMO'
              ? 'DEMO snapshot — not a live feed claim'
              : dataConnected
                ? 'Authorized market-data source'
                : 'Connect a data source to refresh pulse'}
          </small>
        </div>
        <div className="wolf-radar-desk__pulse-grid">
          {pulse.map((p) => (
            <article key={p.symbol} className={`wolf-radar-desk__pulse-card ${biasClass(p.direction)}`}>
              <strong>{p.symbol}</strong>
              <span className="dir">{p.direction.toUpperCase()}</span>
              <em>{p.strength}/100</em>
              <small>{p.trendState}</small>
            </article>
          ))}
        </div>
      </section>

      {progress.status === 'scanning' && (
        <section className="wolf-radar-desk__loading" aria-live="polite">
          <Sparkles size={16} className="text-gold" />
          <div>
            <h3>WOLF IS SCANNING</h3>
            <p>
              Universe: {universe} · {progress.symbolsChecked} / {progress.symbolsTotal || '—'} (
              {scanPct}%)
            </p>
            <p className="phase">
              Current: {progress.currentSymbol || '—'} · Matched: {progress.matchedSoFar ?? 0} · No
              match: {progress.noMatchSoFar ?? 0} · Unavailable: {progress.unavailableSoFar ?? 0} ·
              Errors: {progress.errorsSoFar ?? 0}
            </p>
          </div>
          <div className="wolf-radar-desk__bar">
            <i style={{ width: `${Math.min(100, scanPct || 4)}%` }} />
          </div>
        </section>
      )}

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
              key={r.id}
              className="wolf-radar-desk__card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx, 12) * 0.03 }}
            >
              <button
                type="button"
                className="wolf-radar-desk__card-main"
                onClick={() => onOpenLiveClick(r)}
              >
                <div className="wolf-radar-desk__card-top">
                  <div>
                    <h3>{r.symbol}</h3>
                    <span className="price">
                      ₹{r.price.toLocaleString('en-IN')} · {r.timeframe.toUpperCase()}
                    </span>
                  </div>
                  <div className="score">
                    <b>{r.score}</b>
                    <small>/100</small>
                  </div>
                </div>
                <p className="setup">
                  {r.setupType} · <span className={biasClass(r.direction)}>{r.direction}</span>
                </p>
                <ul className="tags">
                  {(r.matchedConditions?.length ? r.matchedConditions : r.confirmations).map((c) => (
                    <li key={c}>{r.matchedConditions?.length ? `✓ ${c}` : c}</li>
                  ))}
                </ul>
                {r.strategyName && (
                  <p className="setup wolf-radar-desk__strategy-tag">SETUP: {r.strategyName}</p>
                )}
                <div className={`state ${statusClass(r.status)}`}>{r.status}</div>
                <time>Detected {formatTime(r.detectedAt)}</time>
              </button>
              <div className="wolf-radar-desk__card-actions">
                <button type="button" className="primary" onClick={() => onOpenLiveClick(r)}>
                  LIVE WOLF
                </button>
                <button type="button" className="ghost" onClick={() => setSelected(r)}>
                  DETAILS
                </button>
                <button type="button" className="ghost" onClick={() => onAnalyzeClick(r)}>
                  ANALYZE
                </button>
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
        {selected && (
          <motion.aside
            className="wolf-radar-desk__drawer"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
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
              <button type="button" className="primary" onClick={() => onAnalyzeClick(selected)}>
                ANALYZE IN WOLF AI
              </button>
              <button type="button" className="ghost" onClick={() => onAddWatch(selected)}>
                ADD TO WATCHLIST
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <ConnectMarketDataModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        status={mdStatus}
        onStatusChange={(s) => {
          setMdStatus(s);
          if (s.status === 'CONNECTED' && s.mode === 'LIVE') {
            void initMarketDataService(serverMarketDataProvider).connect();
            void fetchMarketPulse(serverMarketDataProvider).then((p) => setPulse(p.items));
          } else if (s.status === 'CONNECTED') {
            void initMarketDataService(mockMarketDataProvider).connect();
            void fetchMarketPulse(mockMarketDataProvider).then((p) => setPulse(p.items));
          }
        }}
      />
    </div>
  );
}
