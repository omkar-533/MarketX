/**
 * LIVE WOLF — live chart + continuous analysis for one Radar-selected symbol.
 * Read-only market data via MarketDataProvider. No order execution.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Link2, MessageSquare, Radar } from 'lucide-react';
import LiveWolfChart from './LiveWolfChart';
import { LiveWolfSession } from '../../../services/live/LiveWolfSession';
import {
  consumePendingLiveWolf,
  LIVE_WOLF_OPEN_EVENT,
  type LiveWolfOpenPayload,
} from '../../../services/live/liveBridge';
import type {
  LiveAnalysisSnapshot,
  LiveSessionState,
  MarketEvent,
} from '../../../services/live/liveTypes';
import type { Candle, RadarTimeframe } from '../../../services/radar/radarTypes';
import { getMarketDataService, initMarketDataService } from '../../../services/marketData/MarketDataService';
import { mockMarketDataProvider } from '../../../services/radar/MockMarketDataProvider';
import { serverMarketDataProvider } from '../../../services/marketData/ServerMarketDataProvider';
import { fetchMarketDataStatus } from '../../../services/marketData/marketDataApi';
import { setPendingRadarAnalyze } from '../../../services/radar/radarBridge';
import type { RadarResult } from '../../../services/radar/radarTypes';
import type { MarketDataProvider } from '../../../services/radar/MarketDataProvider';

type Props = {
  onAskWolf: () => void;
  onConnectData: () => void;
};

const TFS: RadarTimeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'];

function formatClock(ts: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function resolveProvider(mode: 'DEMO' | 'LIVE' | null): MarketDataProvider {
  if (mode === 'LIVE') return serverMarketDataProvider;
  try {
    return getMarketDataService().getProvider();
  } catch {
    initMarketDataService(mockMarketDataProvider);
    return mockMarketDataProvider;
  }
}

export default function LiveWolfPage({ onAskWolf, onConnectData }: Props) {
  const [payload, setPayload] = useState<LiveWolfOpenPayload | null>(() => consumePendingLiveWolf());
  const [timeframe, setTimeframe] = useState<RadarTimeframe>('5m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [analysis, setAnalysis] = useState<LiveAnalysisSnapshot | null>(null);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [status, setStatus] = useState<LiveSessionState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<LiveWolfSession | null>(null);
  const seedRef = useRef<RadarResult | null | undefined>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<LiveWolfOpenPayload>).detail;
      const pending = detail || consumePendingLiveWolf();
      if (pending) {
        setPayload(pending);
        setTimeframe(pending.timeframe || '5m');
        seedRef.current = pending.seedResult;
        setEvents([]);
      }
    };
    window.addEventListener(LIVE_WOLF_OPEN_EVENT, onOpen);
    const boot = consumePendingLiveWolf();
    if (boot) {
      setPayload(boot);
      setTimeframe(boot.timeframe || '5m');
      seedRef.current = boot.seedResult;
    }
    return () => window.removeEventListener(LIVE_WOLF_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    void fetchMarketDataStatus()
      .then((s) => setConnected(s.status === 'CONNECTED'))
      .catch(() => setConnected(false));
  }, []);

  const startSession = useCallback(async () => {
    if (!payload?.symbol) return;
    setError(null);
    await sessionRef.current?.stop();
    sessionRef.current = null;

    let mode: 'DEMO' | 'LIVE' | null = null;
    try {
      const s = await fetchMarketDataStatus();
      setConnected(s.status === 'CONNECTED');
      if (s.status !== 'CONNECTED') {
        setError('Connect market data to activate LIVE WOLF.');
        return;
      }
      mode = s.mode;
    } catch {
      // Local demo fallback only if service already DEMO-connected
      try {
        const p = getMarketDataService().getProvider();
        mode = p.isDemo ? 'DEMO' : 'LIVE';
        setConnected(true);
      } catch {
        setError('Connect market data to activate LIVE WOLF.');
        setConnected(false);
        return;
      }
    }

    const provider = resolveProvider(mode);
    const session = new LiveWolfSession({
      symbol: payload.symbol,
      exchange: payload.exchange || 'NSE',
      timeframe,
      provider,
      onBars: setCandles,
      onAnalysis: setAnalysis,
      onEvent: (evt) =>
        setEvents((prev) => [evt, ...prev].filter((e) => e.significance !== 'LOW').slice(0, 40)),
      onStatus: setStatus,
    });
    sessionRef.current = session;
    try {
      await session.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start LIVE WOLF');
    }
  }, [payload, timeframe]);

  useEffect(() => {
    void startSession();
    return () => {
      void sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, [startSession]);

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

  const onAsk = () => {
    if (!analysis) return;
    const asResult: RadarResult = {
      id: `live-${analysis.symbol}-${Date.now()}`,
      symbol: analysis.symbol,
      exchange: analysis.exchange,
      price: analysis.price,
      timeframe: analysis.timeframe as RadarTimeframe,
      setupType: (analysis.setupType as RadarResult['setupType']) || 'Trend Continuation',
      direction: analysis.htfTrend.toLowerCase().includes('bear')
        ? 'bearish'
        : analysis.htfTrend.toLowerCase().includes('bull')
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
    onAskWolf();
  };

  if (!payload?.symbol) {
    return (
      <div className="live-wolf-desk live-wolf-desk--empty">
        <Radar size={18} className="text-gold" />
        <h2>LIVE WOLF</h2>
        <p>Select a symbol from WOLF RADAR to watch the market live.</p>
        <p className="sub">Live market intelligence. Explained as it happens.</p>
      </div>
    );
  }

  return (
    <div className="live-wolf-desk">
      <header className="live-wolf-desk__top">
        <div className="live-wolf-desk__id">
          <h1>{payload.symbol}</h1>
          <span>{payload.exchange || 'NSE'}</span>
          <span className={`live-wolf-desk__feed ${status?.stale ? 'is-stale' : ''}`}>
            {feedLabel}
          </span>
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
            <b>{status?.providerLabel || '—'}</b>
          </div>
        </div>
        <div className="live-wolf-desk__tfs">
          {TFS.map((tf) => (
            <button
              key={tf}
              type="button"
              className={timeframe === tf ? 'is-on' : ''}
              onClick={() => setTimeframe(tf)}
            >
              {tf.toUpperCase()}
            </button>
          ))}
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
        <section className="live-wolf-desk__chart-wrap">
          <LiveWolfChart candles={candles} levels={analysis?.keyLevels || []} />
        </section>

        <aside className="live-wolf-desk__panel">
          <div className="live-wolf-desk__panel-head">
            <Activity size={14} />
            <h2>WOLF LIVE ANALYSIS</h2>
            <span>● ANALYZING</span>
          </div>

          {analysis?.waiting && (
            <p className="live-wolf-desk__wait">
              WOLF is watching. No high-quality setup detected yet — WAIT is valid.
            </p>
          )}

          <dl className="live-wolf-desk__grid">
            <div>
              <dt>MARKET STRUCTURE</dt>
              <dd>{analysis?.structure || '—'}</dd>
            </div>
            <div>
              <dt>LIQUIDITY</dt>
              <dd>{analysis?.liquidity || '—'}</dd>
            </div>
            <div>
              <dt>VOLUME</dt>
              <dd>{analysis?.volume || '—'}</dd>
            </div>
            <div>
              <dt>MOMENTUM</dt>
              <dd>{analysis?.momentum || '—'}</dd>
            </div>
            <div>
              <dt>HTF ALIGNMENT</dt>
              <dd>
                {analysis ? (analysis.htfAlignment ? `YES · ${analysis.htfTrend}` : analysis.htfTrend) : '—'}
              </dd>
            </div>
            <div>
              <dt>WOLF SCORE</dt>
              <dd>{analysis?.score != null ? `${analysis.score}/100` : '—'}</dd>
            </div>
            <div>
              <dt>CURRENT STATE</dt>
              <dd>{analysis?.status || '—'}</dd>
            </div>
          </dl>

          <div className="live-wolf-desk__why">
            <h3>WHY WOLF IS WATCHING</h3>
            <p>{analysis?.explanation || 'Waiting for market structure to develop.'}</p>
            {analysis?.invalidation && (
              <p className="inv">
                <strong>Invalidation:</strong> {analysis.invalidation}
              </p>
            )}
          </div>

          <button type="button" className="live-wolf-desk__ask" onClick={onAsk} disabled={!analysis}>
            <MessageSquare size={14} /> ASK WOLF
          </button>
        </aside>
      </div>

      <section className="live-wolf-desk__timeline" aria-label="WOLF timeline">
        <h3>WOLF TIMELINE</h3>
        {!events.length && <p className="empty">Events appear when something meaningful changes.</p>}
        <ul>
          {events.map((e) => (
            <li key={e.id}>
              <time>{formatClock(e.timestamp)}</time>
              <strong>{e.type.replace(/_/g, ' ')}</strong>
              <span>{e.message}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
