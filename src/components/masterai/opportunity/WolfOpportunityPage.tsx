/**
 * WOLF OPPORTUNITY — one-screen market intelligence dashboard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  GitCompare,
  RefreshCw,
  Settings2,
  Star,
  Bell,
  X,
  Activity,
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
  addOpportunityAlert,
  loadOpportunityFilters,
  loadOpportunityWatchlist,
  saveOpportunityFilters,
  toggleOpportunityWatch,
} from '../../../services/opportunity/opportunityStore';
import type {
  DataFeedStatus,
  IndexPulse,
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

function feedLabel(status: DataFeedStatus): string {
  if (status === 'LIVE') return '🟢 LIVE DATA';
  if (status === 'DELAYED') return '🟡 DELAYED DATA';
  if (status === 'DEMO') return '🟡 DEMO / HISTORICAL';
  return '🔴 DATA OFFLINE';
}

function Chip({
  on,
  children,
  onClick,
}: {
  on?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`wolf-opp__chip ${on ? 'is-on' : ''}`} onClick={onClick}>
      {children}
    </button>
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
  const [compare, setCompare] = useState<OpportunityHit[]>([]);
  const [watch, setWatch] = useState<string[]>(() => loadOpportunityWatchlist());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
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

  const runScan = useCallback(async (opts?: { quiet?: boolean; reset?: boolean }) => {
    const quiet = Boolean(opts?.quiet);
    // Background pass never interrupts an in-flight F&O scan.
    if (quiet && scanningRef.current) return;

    if (!quiet) {
      abortRef.current?.abort();
    } else if (scanningRef.current) {
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    scanningRef.current = true;
    if (quiet) setBgBusy(true);
    else {
      setScanning(true);
      setProgress('Connecting…');
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
        filters,
        {
          signal: ac.signal,
          topN: OPPORTUNITY_CARD_POOL,
          onProgress: (p) => {
            if (quiet) return;
            setProgress(
              p.status === 'scanning'
                ? `F&O scan ${p.symbolsChecked}/${p.symbolsTotal}`
                : p.phase,
            );
          },
          onHit: (hit) => {
            setCards((prev) => mergeHitIntoCards(prev, hit, OPPORTUNITY_CARD_POOL));
          },
          onCard: (card) => {
            // Only apply unavailable markers here; ranked cards stream via onHit.
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
        if (!quiet) setProgress(`Ready · ${out.hits.length} opportunities · ${filters.universe}`);
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
  }, [filters, refreshIndices, feedStatus]);

  useEffect(() => {
    void runScan({ reset: true });
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial boot
  }, []);

  useEffect(() => {
    if (!filters.autoRefresh) return;
    const id = window.setInterval(() => void runScan({ quiet: true }), filters.refreshSec * 1000);
    return () => window.clearInterval(id);
  }, [filters.autoRefresh, filters.refreshSec, runScan]);

  const clock = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const openAnalyze = (hit: OpportunityHit) => {
    openOpportunityInWolfAi(hit);
    onOpenWolfAi();
  };

  const openChart = (hit: OpportunityHit) => {
    openLiveWolfFromRadarResult(opportunityToRadarResult(hit));
    onOpenLive?.();
  };

  const toggleCompare = (hit: OpportunityHit) => {
    setCompare((prev) => {
      if (prev.some((p) => p.id === hit.id)) return prev.filter((p) => p.id !== hit.id);
      if (prev.length >= 3) return [...prev.slice(1), hit];
      return [...prev, hit];
    });
  };

  const headerFeed = useMemo(() => feedLabel(feedStatus), [feedStatus]);

  return (
    <div className="wolf-opp-desk">
      <header className="wolf-opp-desk__head">
        <div className="wolf-opp-desk__brand">
          <h1>🐺 WOLF OPPORTUNITY</h1>
          <p>Live Market Intelligence</p>
        </div>
        <div className="wolf-opp-desk__pulse">
          <span className={`wolf-opp-desk__mkt ${marketOpen ? 'is-open' : 'is-closed'}`}>
            ● {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
          </span>
          {indices.map((ix) => (
            <div key={ix.symbol} className="wolf-opp-desk__ix">
              <b>{ix.symbol}</b>
              <span>
                {ix.available && ix.price != null
                  ? ix.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                  : '—'}
              </span>
              <em className={(ix.changePercent || 0) >= 0 ? 'up' : 'down'}>
                {ix.available && ix.changePercent != null
                  ? `${ix.changePercent >= 0 ? '+' : ''}${ix.changePercent.toFixed(2)}%`
                  : 'n/a'}
              </em>
            </div>
          ))}
        </div>
        <div className="wolf-opp-desk__meta">
          <span className="wolf-opp-desk__feed">{headerFeed}</span>
          <span>{dataMode === 'LIVE' ? 'Mode LIVE' : 'Mode DEMO'}</span>
          <span>Updated {clock}</span>
          <span>Auto {filters.autoRefresh ? 'ON' : 'OFF'}{bgBusy ? ' · syncing' : ''}</span>
          <button
            type="button"
            className="wolf-opp__btn"
            onClick={() => void runScan({ reset: false })}
            disabled={scanning}
          >
            <RefreshCw size={13} className={scanning ? 'is-spin' : ''} /> Refresh
          </button>
          <button type="button" className="wolf-opp__btn" onClick={() => setSettingsOpen((v) => !v)}>
            <Settings2 size={13} />
          </button>
          {onConnectData && feedStatus !== 'LIVE' ? (
            <button type="button" className="wolf-opp__btn wolf-opp__btn--gold" onClick={onConnectData}>
              Connect data
            </button>
          ) : null}
        </div>
      </header>

      <div className="wolf-opp-desk__filters">
        <div className="wolf-opp-desk__filter-group">
          <span>Market</span>
          {(['NSE', 'BSE'] as const).map((m) => (
            <Chip key={m} on={filters.market === m} onClick={() => patchFilters({ market: m })}>
              {m}
            </Chip>
          ))}
        </div>
        <div className="wolf-opp-desk__filter-group">
          <span>Universe</span>
          {(['F&O', 'NIFTY50', 'NIFTY500', 'CUSTOM'] as const).map((u) => (
            <Chip
              key={u}
              on={filters.universe === u}
              onClick={() => {
                const next = u === 'CUSTOM' ? 'NIFTY50' : u;
                patchFilters({ universe: next });
                window.setTimeout(() => void runScan({ reset: true }), 0);
              }}
            >
              {u}
            </Chip>
          ))}
        </div>
        <div className="wolf-opp-desk__filter-group">
          <span>TF</span>
          {(['5m', '15m', '1h', '1D'] as const).map((t) => (
            <Chip key={t} on={filters.timeframe === t} onClick={() => patchFilters({ timeframe: t })}>
              {t}
            </Chip>
          ))}
        </div>
        <div className="wolf-opp-desk__filter-group">
          <span>Dir</span>
          {([
            ['all', 'All'],
            ['bullish', 'Bullish'],
            ['bearish', 'Bearish'],
          ] as const).map(([id, label]) => (
            <Chip key={id} on={filters.direction === id} onClick={() => patchFilters({ direction: id })}>
              {label}
            </Chip>
          ))}
        </div>
        <div className="wolf-opp-desk__filter-group">
          <span>Min</span>
          {([60, 70, 80] as const).map((n) => (
            <Chip key={n} on={filters.minScore === n} onClick={() => patchFilters({ minScore: n })}>
              {n}
            </Chip>
          ))}
        </div>
        <div className="wolf-opp-desk__filter-group">
          <span>Auto</span>
          <Chip on={filters.autoRefresh} onClick={() => patchFilters({ autoRefresh: !filters.autoRefresh })}>
            {filters.autoRefresh ? 'ON' : 'OFF'}
          </Chip>
        </div>
        <span className="wolf-opp-desk__scan-line">{progress}</span>
      </div>

      {settingsOpen ? (
        <div className="wolf-opp-desk__settings">
          <span>Refresh every</span>
          {([5, 10, 30, 60] as const).map((s) => (
            <Chip key={s} on={filters.refreshSec === s} onClick={() => patchFilters({ refreshSec: s })}>
              {s}s
            </Chip>
          ))}
          <button type="button" className="wolf-opp__btn" onClick={() => setSettingsOpen(false)}>
            Done
          </button>
        </div>
      ) : null}

      {feedStatus === 'OFFLINE' ? (
        <div className="wolf-opp-desk__banner">
          Live market data unavailable — showing DEMO / HISTORICAL mode. Connect LIVE data for real quotes & candles.
        </div>
      ) : null}
      {feedStatus === 'DEMO' ? (
        <div className="wolf-opp-desk__banner wolf-opp-desk__banner--demo">
          DEMO MODE — simulated market data. Not a live licensed feed.
        </div>
      ) : null}

      <div className="wolf-opp-desk__grid">
        {cards.map((card) => (
          <article key={card.scannerId} className="wolf-opp-card">
            <header>
              <h2>🐺 {card.title}</h2>
              <small>{card.tagline}</small>
            </header>
            {card.status === 'unavailable' ? (
              <p className="wolf-opp-card__empty">{card.unavailableReason}</p>
            ) : !card.hits.length ? (
              <p className="wolf-opp-card__empty">
                {scanning || bgBusy ? 'Hunting F&O universe…' : 'No opportunities above filter threshold.'}
              </p>
            ) : (
              <ul className="wolf-opp-card__list">
                {card.hits.map((hit) => (
                  <li key={hit.id}>
                    <button type="button" className="wolf-opp-card__row" onClick={() => setSelected(hit)}>
                      <div className="wolf-opp-card__sym">
                        <b>{hit.symbol}</b>
                        <span className={hit.changePercent >= 0 ? 'up' : 'down'}>
                          {hit.changePercent >= 0 ? '+' : ''}
                          {hit.changePercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="wolf-opp-card__score">
                        <em>{hit.score}</em>
                        <span>{hit.stateLabel}</span>
                      </div>
                      <p>{hit.why}</p>
                    </button>
                    <div className="wolf-opp-card__actions">
                      <button type="button" onClick={() => setWhyHit(hit)}>
                        WHY?
                      </button>
                      <button type="button" onClick={() => openChart(hit)}>
                        <Crosshair size={11} /> CHART
                      </button>
                      <button type="button" onClick={() => openAnalyze(hit)}>
                        WOLF AI
                      </button>
                      <button type="button" onClick={() => toggleCompare(hit)}>
                        <GitCompare size={11} />
                      </button>
                      <button
                        type="button"
                        className={watch.includes(hit.symbol) ? 'is-on' : ''}
                        onClick={() => setWatch(toggleOpportunityWatch(hit.symbol))}
                      >
                        <Star size={11} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>

      {compare.length >= 2 ? (
        <div className="wolf-opp-compare">
          <header>
            <h3>COMPARE</h3>
            <button type="button" onClick={() => setCompare([])}>
              <X size={14} />
            </button>
          </header>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                {compare.map((h) => (
                  <th key={h.id}>{h.symbol}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Score', (h: OpportunityHit) => String(h.score)],
                  ['Scanner', (h: OpportunityHit) => h.scannerId],
                  ['Direction', (h: OpportunityHit) => h.direction],
                  ['State', (h: OpportunityHit) => h.stateLabel],
                  ['Change %', (h: OpportunityHit) => h.changePercent.toFixed(2)],
                  ['Key level', (h: OpportunityHit) => (h.keyLevel != null ? String(h.keyLevel) : '—')],
                  ['Confirm', (h: OpportunityHit) => h.confirmationNeeded],
                ] as const
              ).map(([label, fn]) => (
                <tr key={label}>
                  <td>{label}</td>
                  {compare.map((h) => (
                    <td key={h.id}>{fn(h)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {whyHit ? (
        <div className="wolf-opp-drawer" role="dialog">
          <div className="wolf-opp-drawer__panel wolf-opp-drawer__panel--why">
            <header>
              <h3>WHY {whyHit.symbol}?</h3>
              <button type="button" onClick={() => setWhyHit(null)}>
                <X size={14} />
              </button>
            </header>
            <ul>
              {whyHit.evidence.map((e) => (
                <li key={e.label} className={e.ok ? 'ok' : 'risk'}>
                  {e.ok ? '✓' : '⚠️'} {e.label}
                  {e.detail ? ` — ${e.detail}` : ''}
                </li>
              ))}
            </ul>
            <p>
              <b>NEXT</b> {whyHit.confirmationNeeded}
            </p>
            <p>
              <b>RISK</b> {whyHit.invalidation}
            </p>
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="wolf-opp-drawer" role="dialog">
          <div className="wolf-opp-drawer__panel">
            <header>
              <div>
                <h3>{selected.symbol}</h3>
                <p>
                  {selected.scannerId.replace(/_/g, ' ').toUpperCase()} · Score {selected.score}/100 ·{' '}
                  {selected.stateLabel}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)}>
                <X size={14} />
              </button>
            </header>
            <dl>
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
                <dt>TF</dt>
                <dd>{selected.timeframe}</dd>
              </div>
              <div>
                <dt>Key level</dt>
                <dd>{selected.keyLevel ?? '—'}</dd>
              </div>
              <div>
                <dt>Trigger</dt>
                <dd>{selected.trigger ?? '—'}</dd>
              </div>
              <div>
                <dt>Data</dt>
                <dd>{selected.dataMode}</dd>
              </div>
            </dl>
            <p className="wolf-opp-drawer__why">{selected.why}</p>
            <p>
              <b>INVALIDATION</b> {selected.invalidation}
            </p>
            <p>
              <b>CONFIRMATION</b> {selected.confirmationNeeded}
            </p>
            <div className="wolf-opp-drawer__breakdown">
              {Object.entries(selected.breakdown).map(([k, v]) => (
                <span key={k}>
                  {k} <b>{v}</b>
                </span>
              ))}
            </div>
            <div className="wolf-opp-drawer__actions">
              <button type="button" onClick={() => openAnalyze(selected)}>
                <Activity size={13} /> OPEN IN WOLF AI
              </button>
              <button type="button" onClick={() => openChart(selected)}>
                VIEW CHART
              </button>
              <button type="button" onClick={() => toggleCompare(selected)}>
                COMPARE
              </button>
              <button
                type="button"
                onClick={() => setWatch(toggleOpportunityWatch(selected.symbol))}
              >
                <Star size={13} /> WATCHLIST
              </button>
              <button
                type="button"
                onClick={() => {
                  const rule = addOpportunityAlert(selected, filters.minScore);
                  setAlertMsg(rule.note);
                }}
              >
                <Bell size={13} /> SET ALERT
              </button>
            </div>
            {alertMsg ? <p className="wolf-opp-drawer__alert">{alertMsg}</p> : null}
            <p className="wolf-opp-drawer__note">
              Alerts are stored locally for this browser session — no background push yet.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
