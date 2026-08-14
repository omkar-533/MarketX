/**
 * LIVE WOLF — Terminal chart (NativeChatChart + drawing tools) + continuous analysis.
 * Always shows a chart (default NSE:NIFTY). Radar handoff optional.
 * Read-only market data. No order execution.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Link2, MessageSquare, RefreshCw, Search, Volume2 } from 'lucide-react';
import TerminalChartHost from '../../terminal/TerminalChartHost';
import TerminalSymbolSearch from '../../terminal/TerminalSymbolSearch';
import { LiveWolfSession } from '../../../services/live/LiveWolfSession';
import {
  consumePendingLiveWolf,
  LIVE_WOLF_OPEN_EVENT,
  loadLastLiveWolfDesk,
  rememberLiveWolfDesk,
  type LiveWolfOpenPayload,
} from '../../../services/live/liveBridge';
import type {
  LiveAnalysisSnapshot,
  LiveSessionState,
  MarketEvent,
} from '../../../services/live/liveTypes';
import type { RadarResult, RadarTimeframe } from '../../../services/radar/radarTypes';
import { fetchMarketDataStatus, isIndstocksLive } from '../../../services/marketData/marketDataApi';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';
import type { MarketDataProvider } from '../../../services/radar/MarketDataProvider';
import { setPendingRadarAnalyze } from '../../../services/radar/radarBridge';
import {
  narrateEvent,
  narrateSnapshot,
  speakNarration,
  type NarrationLine,
  resetNarrationCooldown,
} from '../../../services/live/EventNarrationService';
import type { ChartLevel } from '../../../utils/chartAnnotations';
import {
  apiSymbolFromTv,
  parseTradingViewInput,
  tradingViewSymbolLabel,
  type TvInterval,
} from '../../../utils/tradingViewSymbols';

type Props = {
  onAskWolf?: () => void;
  onConnectData: () => void;
  /** From ConnectMarketDataModal — keeps chart CTA in sync after connect. */
  dataConnected?: boolean;
};

const TFS: RadarTimeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'];

const RADAR_TO_TV: Record<RadarTimeframe, TvInterval> = {
  '1m': '1',
  '3m': '3',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1D': 'D',
};

function formatClock(ts: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Never render objects as React children (that throws and triggers Workspace hiccup). */
function textOrDash(v: unknown): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '—';
}

function resolveProvider(live: boolean): MarketDataProvider | null {
  if (live) return serverMarketDataProvider;
  return null;
}

function tvFromPayload(p: LiveWolfOpenPayload): string {
  const ex = String(p.exchange || 'NSE').toUpperCase();
  const sym = String(p.symbol || '').toUpperCase();
  if (!sym) return '';
  if (sym.includes(':')) return parseTradingViewInput(sym);
  return parseTradingViewInput(`${ex}:${sym}`);
}

function bootLiveWolf(): { tv: string; tf: RadarTimeframe } {
  const pending = consumePendingLiveWolf();
  if (pending?.symbol) {
    const tv = tvFromPayload(pending);
    const tf = pending.timeframe || '5m';
    if (tv) {
      rememberLiveWolfDesk(tv, tf);
      return { tv, tf };
    }
  }
  const last = loadLastLiveWolfDesk();
  if (last?.tvSymbol) return { tv: last.tvSymbol, tf: last.timeframe || '5m' };
  return { tv: 'NSE:NIFTY', tf: '5m' };
}

function exchangeFromTv(tv: string): string {
  const raw = parseTradingViewInput(tv);
  return raw.includes(':') ? raw.split(':')[0] : 'NSE';
}

function levelsFromAnalysis(
  levels: { label: string; price: number }[] | undefined,
  enabled: boolean,
): ChartLevel[] | undefined {
  if (!enabled || !levels?.length) return undefined;
  const drawn = levels.filter((lv) => !/invalid/i.test(lv.label)).slice(0, 8);
  if (!drawn.length) return undefined;
  return drawn.map((lv) => {
    const lower = lv.label.toLowerCase();
    const kind: ChartLevel['kind'] = lower.includes('res') || lower.includes('high')
      ? 'resistance'
      : lower.includes('sup') || lower.includes('low')
        ? 'support'
        : 'pivot';
    return { price: lv.price, label: lv.label, kind };
  });
}

export default function LiveWolfPage({ onAskWolf, onConnectData, dataConnected }: Props) {
  const [boot] = useState(() => bootLiveWolf());
  const [tvSymbol, setTvSymbol] = useState(() => boot.tv);
  const [timeframe, setTimeframe] = useState<RadarTimeframe>(() => boot.tf);
  const [tvInterval, setTvInterval] = useState<TvInterval>(() =>
    RADAR_TO_TV[boot.tf] || '5',
  );
  const [study, setStudy] = useState('none');
  const [reloadKey, setReloadKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [analysis, setAnalysis] = useState<LiveAnalysisSnapshot | null>(null);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [narration, setNarration] = useState<NarrationLine[]>([]);
  const [status, setStatus] = useState<LiveSessionState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [showLevels, setShowLevels] = useState(true);
  const sessionRef = useRef<LiveWolfSession | null>(null);
  const analysisRef = useRef<LiveAnalysisSnapshot | null>(null);

  const symbolKey = `${exchangeFromTv(tvSymbol)}:${apiSymbolFromTv(tvSymbol)}`;
  const bareSymbol = apiSymbolFromTv(tvSymbol);
  const exchange = exchangeFromTv(tvSymbol);

  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

  useEffect(() => {
    rememberLiveWolfDesk(tvSymbol, timeframe);
  }, [tvSymbol, timeframe]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<LiveWolfOpenPayload>).detail;
      const pending = detail?.symbol ? detail : consumePendingLiveWolf();
      if (!pending?.symbol) return;
      const tv = tvFromPayload(pending);
      if (!tv) return;
      setTvSymbol(tv);
      const tf = pending.timeframe || '5m';
      setTimeframe(tf);
      setTvInterval(RADAR_TO_TV[tf] || '5');
      rememberLiveWolfDesk(tv, tf);
      setEvents([]);
      setNarration([]);
      resetNarrationCooldown();
    };
    window.addEventListener(LIVE_WOLF_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(LIVE_WOLF_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    void fetchMarketDataStatus()
      .then((s) => setConnected(isIndstocksLive(s)))
      .catch(() => setConnected(false));
  }, []);

  const pushEvent = useCallback(
    (evt: MarketEvent) => {
      setEvents((prev) => [evt, ...prev].filter((e) => e.significance !== 'LOW').slice(0, 40));
      const line = narrateEvent(evt, analysisRef.current);
      if (line) {
        setNarration((prev) => [line, ...prev].slice(0, 30));
        if (autoSpeak) speakNarration(line.text);
      }
    },
    [autoSpeak],
  );

  const startSession = useCallback(async () => {
    if (!bareSymbol) return;
    setError(null);
    await sessionRef.current?.stop();
    sessionRef.current = null;

    let live = false;
    try {
      const s = await fetchMarketDataStatus();
      live = isIndstocksLive(s);
      setConnected(live);
      if (!live) {
        setError('Connect INDstocks for LIVE WOLF — demo feed is off.');
        return;
      }
    } catch {
      setError('Connect INDstocks for LIVE WOLF analysis.');
      setConnected(false);
      return;
    }

    const provider = resolveProvider(live);
    if (!provider) {
      setError('Connect INDstocks for LIVE WOLF analysis.');
      return;
    }
    const session = new LiveWolfSession({
      symbol: bareSymbol,
      exchange,
      timeframe,
      provider,
      onBars: () => undefined,
      onAnalysis: (snap) => {
        setAnalysis(snap);
        if (snap.waiting === false && snap.setupType) {
          const line = narrateSnapshot(snap);
          setNarration((prev) => {
            if (prev[0]?.text === line.text) return prev;
            return [line, ...prev].slice(0, 30);
          });
        }
      },
      onEvent: pushEvent,
      onStatus: setStatus,
    });
    sessionRef.current = session;
    try {
      await session.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start LIVE WOLF');
    }
  }, [bareSymbol, exchange, timeframe, pushEvent]);

  useEffect(() => {
    if (typeof dataConnected !== 'boolean') return;
    setConnected(dataConnected);
    if (dataConnected) {
      setError(null);
      void startSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when connect flag flips
  }, [dataConnected]);

  useEffect(() => {
    void startSession();
    return () => {
      void sessionRef.current?.stop();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- symbol-keyed boot only
  }, [symbolKey]);

  useEffect(() => {
    const s = sessionRef.current;
    if (!s || !symbolKey) return;
    void s.setTimeframe(timeframe).catch(() => undefined);
  }, [timeframe, symbolKey]);

  const feedLabel = useMemo(() => {
    if (!connected) return '○ DATA DISCONNECTED';
    if (status?.stale || status?.feedStatus === 'STALE_DATA') return '⚠ DATA DELAYED';
    if (status?.feedStatus === 'CONNECTING') return '◌ CONNECTING…';
    if (status?.feedStatus === 'RECONNECTING') return '◌ RECONNECTING…';
    if (status?.feedStatus === 'CONNECTED') {
      return status.dataMode === 'DEMO' ? '● DEMO STREAM' : '● LIVE DATA CONNECTED';
    }
    return '○ DATA DISCONNECTED';
  }, [connected, status]);

  const chartLevels = useMemo(
    () => levelsFromAnalysis(analysis?.keyLevels, showLevels),
    [analysis?.keyLevels, showLevels],
  );

  const onPickSymbol = (next: string) => {
    const tv = parseTradingViewInput(next);
    if (!tv) return;
    setTvSymbol(tv);
    rememberLiveWolfDesk(tv, timeframe);
    setEvents([]);
    setNarration([]);
    setAnalysis(null);
    resetNarrationCooldown();
  };

  const onTfClick = (tf: RadarTimeframe) => {
    setTimeframe(tf);
    setTvInterval(RADAR_TO_TV[tf] || '5');
  };

  const onAsk = () => {
    if (!analysis) return;
    const trend = String(analysis.htfTrend || '').toLowerCase();
    const asResult: RadarResult = {
      id: `live-${analysis.symbol}-${Date.now()}`,
      symbol: analysis.symbol,
      exchange: analysis.exchange,
      price: analysis.price,
      timeframe: analysis.timeframe as RadarTimeframe,
      setupType: (analysis.setupType as RadarResult['setupType']) || 'Trend Continuation',
      direction: trend.includes('bear')
        ? 'bearish'
        : trend.includes('bull')
          ? 'bullish'
          : 'neutral',
      score: analysis.score ?? 0,
      scoreBreakdown: (analysis.scoreBreakdown as RadarResult['scoreBreakdown']) || {
        structure: 0,
        liquidity: 0,
        volume: 0,
        momentum: 0,
        htfAlignment: 0,
        volatility: 0,
        setupQuality: 0,
      },
      status: (analysis.status as RadarResult['status']) || 'WATCH',
      confirmations: [],
      structure: analysis.structure,
      liquidity: analysis.liquidity,
      volume: analysis.volume,
      momentum: analysis.momentum,
      htfAlignment: analysis.htfAlignment,
      keyLevels: analysis.keyLevels,
      invalidation: analysis.invalidation,
      explanation: analysis.explanation,
      detectedAt: analysis.analyzedAt,
      dataMode: analysis.dataMode,
    };
    setPendingRadarAnalyze(asResult);
    onAskWolf?.();
  };

  const onSpeakLatest = () => {
    const line = narration[0] || (analysis ? narrateSnapshot(analysis) : null);
    if (line) speakNarration(line.text);
  };

  return (
    <div className="live-wolf-desk live-wolf-desk--terminal">
      <header className="live-wolf-desk__top">
        <div className="live-wolf-desk__id">
          <button
            type="button"
            className="live-wolf-desk__symbol-btn"
            onClick={() => setSearchOpen(true)}
            title="Search symbol"
          >
            <Search size={14} />
            <h1>{tradingViewSymbolLabel(tvSymbol)}</h1>
          </button>
          <span>{exchange}</span>
          <span className={`live-wolf-desk__feed ${status?.stale ? 'is-stale' : ''}`}>
            {feedLabel}
          </span>
          <button
            type="button"
            className="live-wolf-desk__icon-btn"
            title="Reload chart"
            onClick={() => {
              setReloadKey((k) => k + 1);
            }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="live-wolf-desk__metrics">
          <div>
            <small>Price</small>
            <b>
              {analysis?.price
                ? `₹${analysis.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                : '—'}
            </b>
          </div>
          <div>
            <small>Change</small>
            <b className={(analysis?.changePercent || 0) >= 0 ? 'up' : 'down'}>
              {analysis ? `${analysis.changePercent.toFixed(2)}%` : '—'}
            </b>
          </div>
          <div>
            <small>Last update</small>
            <b>{formatClock(status?.lastTickAt ?? null)}</b>
          </div>
          <div>
            <small>Source</small>
            <b>{status?.providerLabel || '—'} </b>
          </div>
        </div>
        <div className="live-wolf-desk__tfs">
          {TFS.map((tf) => (
            <button
              key={tf}
              type="button"
              className={timeframe === tf ? 'is-on' : ''}
              onClick={() => onTfClick(tf)}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="live-wolf-desk__toggles" aria-label="Chart layers">
          <label>
            <input
              type="checkbox"
              checked={showLevels}
              onChange={(e) => setShowLevels(e.target.checked)}
            />
            Levels
          </label>
          <label>
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => setAutoSpeak(e.target.checked)}
            />
            Auto-speak
          </label>
        </div>
      </header>

      {error && (
        <div className="live-wolf-desk__banner">
          <p>{error}</p>
          <button type="button" onClick={onConnectData}>
            <Link2 size={14} /> CONNECT MARKET DATA
          </button>
        </div>
      )}

      <div className="live-wolf-desk__main">
        <section className="live-wolf-desk__chart-wrap live-wolf-desk__chart-wrap--term">
          <TerminalChartHost
            symbol={tvSymbol}
            interval={tvInterval}
            study={study}
            chartStyle="1"
            reloadKey={reloadKey}
            nativeFailed={false}
            showRail
            levels={chartLevels}
            onNativeUnavailable={() => undefined}
            onClearIndicators={() => setStudy('none')}
            onApplyStudy={setStudy}
            onStudyChange={setStudy}
            needsLiveDataConnect={!connected}
            onConnectLiveData={onConnectData}
            wolfLiveFeed
          />
        </section>

        <aside className="live-wolf-desk__panel">
          <div className="live-wolf-desk__panel-head">
            <Activity size={14} />
            <h2>WOLF LIVE ANALYSIS</h2>
            <span>● ANALYZING</span>
          </div>

          {analysis?.waiting && (
            <p className="live-wolf-desk__wait">
              {analysis.structure === 'INSUFFICIENT DATA'
                ? analysis.explanation
                : 'WOLF is watching. No high-quality setup detected yet — WAIT is valid.'}
            </p>
          )}

          <dl className="live-wolf-desk__grid">
            <div>
              <dt>MARKET STRUCTURE</dt>
              <dd>{textOrDash(analysis?.structure)}</dd>
            </div>
            <div>
              <dt>LIQUIDITY</dt>
              <dd>{textOrDash(analysis?.liquidity)}</dd>
            </div>
            <div>
              <dt>VOLUME</dt>
              <dd>{textOrDash(analysis?.volume)}</dd>
            </div>
            <div>
              <dt>MOMENTUM</dt>
              <dd>{textOrDash(analysis?.momentum)}</dd>
            </div>
            <div>
              <dt>HTF ALIGNMENT</dt>
              <dd>
                {analysis
                  ? analysis.htfAlignment
                    ? `YES · ${textOrDash(analysis.htfTrend)}`
                    : textOrDash(analysis.htfTrend)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>WOLF SCORE</dt>
              <dd>{analysis?.score != null ? `${analysis.score}/100` : '—'}</dd>
            </div>
            <div>
              <dt>CURRENT STATE</dt>
              <dd>{textOrDash(analysis?.status)}</dd>
            </div>
          </dl>

          <div className="live-wolf-desk__why">
            <h3>WHY WOLF IS WATCHING</h3>
            <p>{textOrDash(analysis?.explanation) === '—'
              ? 'Waiting for market structure to develop.'
              : textOrDash(analysis?.explanation)}
            </p>
            {analysis?.invalidation ? (
              <p className="inv">
                <strong>Invalidation:</strong> {textOrDash(analysis.invalidation)}
              </p>
            ) : null}
          </div>

          <div className="live-wolf-desk__narration">
            <h3>WOLF NOTES</h3>
            {!narration.length && (
              <p className="empty">Meaningful changes appear here (not every tick).</p>
            )}
            <ul>
              {narration.slice(0, 6).map((n) => (
                <li key={n.id}>
                  <time>{formatClock(n.timestamp)}</time>
                  <span>{n.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="live-wolf-desk__actions">
            {onAskWolf ? (
              <button type="button" className="live-wolf-desk__ask" onClick={onAsk} disabled={!analysis}>
                <MessageSquare size={14} /> ASK WOLF
              </button>
            ) : null}
            <button
              type="button"
              className="live-wolf-desk__speak"
              onClick={onSpeakLatest}
              disabled={!analysis && !narration.length}
            >
              <Volume2 size={14} /> SPEAK
            </button>
          </div>
        </aside>
      </div>

      <section className="live-wolf-desk__timeline" aria-label="WOLF timeline">
        <h3>WOLF TIMELINE</h3>
        {!events.length && <p className="empty">Events appear when something meaningful changes.</p>}
        <ul>
          {events.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="live-wolf-desk__tl-btn"
                onClick={() => {
                  const line = narrateEvent(e, analysis);
                  if (line) setNarration((prev) => [line, ...prev].slice(0, 30));
                }}
              >
                <time>{formatClock(e.timestamp)}</time>
                <strong>{e.type.replace(/_/g, ' ')}</strong>
                <span>{e.message}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <TerminalSymbolSearch
        open={searchOpen}
        activeSymbol={tvSymbol}
        onClose={() => setSearchOpen(false)}
        onPick={onPickSymbol}
      />
    </div>
  );
}
