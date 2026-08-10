import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { fetchMarketPulse, runRadarScan } from '../../../services/radar/radarScanner';
import {
  addToWatchlist,
  loadLastResults,
  loadWatchlist,
} from '../../../services/radar/radarStore';
import { setPendingRadarAnalyze } from '../../../services/radar/radarBridge';
import type {
  MarketPulseItem,
  RadarMarket,
  RadarResult,
  RadarScanProgress,
  RadarTimeframe,
  RadarUniverse,
} from '../../../services/radar/radarTypes';
import { mockMarketDataProvider } from '../../../services/radar/MockMarketDataProvider';
import { WOLF_SCORE_WEIGHTS } from '../../../services/radar/WolfScoringEngine';

type Props = {
  onAnalyze: () => void;
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

export default function WolfRadarPage({ onAnalyze }: Props) {
  const [market, setMarket] = useState<RadarMarket>('NSE');
  const [universe, setUniverse] = useState<RadarUniverse>('F&O');
  const [timeframe, setTimeframe] = useState<RadarTimeframe>('5m');
  const [pulse, setPulse] = useState<MarketPulseItem[]>([]);
  const [results, setResults] = useState<RadarResult[]>(() => loadLastResults());
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

  useEffect(() => {
    void fetchMarketPulse().then((p) => setPulse(p.items));
  }, []);

  const statusLabel = useMemo(() => {
    if (progress.status === 'scanning') return 'SCANNING…';
    if (progress.status === 'complete') return 'SCAN COMPLETE';
    if (progress.status === 'failed') return 'SCAN FAILED';
    return 'READY';
  }, [progress.status]);

  const scan = useCallback(async () => {
    if (progress.status === 'scanning') return;
    setSelected(null);
    setProgress({
      status: 'scanning',
      symbolsChecked: 0,
      symbolsTotal: 0,
      phase: 'STARTING',
      lastScanAt: progress.lastScanAt,
    });
    try {
      const rows = await runRadarScan(
        { market, universe, timeframe },
        {
          onProgress: (p) => setProgress((prev) => ({ ...prev, ...p })),
        },
      );
      setResults(rows);
      setProgress((p) => ({
        ...p,
        status: 'complete',
        lastScanAt: Date.now(),
        phase: 'COMPLETE',
      }));
    } catch {
      setProgress((p) => ({
        ...p,
        status: 'failed',
        error: 'SCAN FAILED — try again',
        phase: 'ERROR',
      }));
    }
  }, [market, universe, timeframe, progress.status, progress.lastScanAt]);

  const onAddWatch = (r: RadarResult) => {
    const list = addToWatchlist(r);
    setWatchSymbols(new Set(list.map((w) => w.symbol)));
  };

  const onAnalyzeClick = (r: RadarResult) => {
    setPendingRadarAnalyze(r);
    onAnalyze();
  };

  return (
    <div className="wolf-radar-desk">
      <header className="wolf-radar-desk__header">
        <div className="wolf-radar-desk__brand">
          <div className="wolf-radar-desk__title-row">
            <Radar size={18} className="text-gold" />
            <h1>WOLF RADAR</h1>
          </div>
          <p className="wolf-radar-desk__subtitle">Let WOLF find the setups worth watching.</p>
        </div>

        <div className="wolf-radar-desk__controls">
          <label>
            <span>MARKET</span>
            <select value={market} onChange={(e) => setMarket(e.target.value as RadarMarket)}>
              <option value="NSE">NSE</option>
              <option value="BSE">BSE</option>
            </select>
          </label>
          <label>
            <span>UNIVERSE</span>
            <select
              value={universe}
              onChange={(e) => setUniverse(e.target.value as RadarUniverse)}
            >
              <option value="F&O">F&O</option>
              <option value="NIFTY50">NIFTY50</option>
              <option value="CASH">CASH</option>
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
        </div>

        <div className="wolf-radar-desk__meta">
          <span>
            Last scan: <b>{formatTime(progress.lastScanAt)}</b>
          </span>
          <span className={`wolf-radar-desk__status is-${progress.status}`}>
            <i /> {statusLabel}
          </span>
          <span className="wolf-radar-desk__demo" title="Provider is demo-only">
            {mockMarketDataProvider.label}
          </span>
        </div>
      </header>

      <section className="wolf-radar-desk__pulse" aria-label="Market pulse">
        <div className="wolf-radar-desk__section-head">
          <Activity size={14} />
          <h2>MARKET PULSE</h2>
          <small>DEMO snapshot — not a live feed claim</small>
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
            <h3>Scanning market…</h3>
            <p>
              Universe: {universe} · Symbols checked: {progress.symbolsChecked} /{' '}
              {progress.symbolsTotal || '—'}
            </p>
            <p className="phase">Analyzing: {progress.phase}</p>
          </div>
          <div className="wolf-radar-desk__bar">
            <i
              style={{
                width: `${progress.symbolsTotal ? (progress.symbolsChecked / progress.symbolsTotal) * 100 : 12}%`,
              }}
            />
          </div>
        </section>
      )}

      <section className="wolf-radar-desk__results">
        <div className="wolf-radar-desk__section-head">
          <Eye size={14} />
          <h2>WOLF DETECTED</h2>
          <small>Top quality setups only · WOLF SCORE = setup quality, not profit odds</small>
        </div>

        {progress.status === 'failed' && (
          <div className="wolf-radar-desk__empty is-error">
            <p>SCAN FAILED</p>
            <span>{progress.error || 'Something went wrong. Try again.'}</span>
          </div>
        )}

        {progress.status !== 'scanning' && results.length === 0 && (
          <div className="wolf-radar-desk__empty">
            <p>No setups detected</p>
            <span>Markets are quiet right now. WOLF isn&apos;t forcing a trade.</span>
            <button type="button" className="wolf-radar-desk__scan-btn" onClick={() => void scan()}>
              SCAN MARKET
            </button>
          </div>
        )}

        <div className="wolf-radar-desk__cards">
          {results.map((r, idx) => (
            <motion.article
              key={r.id}
              className="wolf-radar-desk__card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
            >
              <button
                type="button"
                className="wolf-radar-desk__card-main"
                onClick={() => setSelected(r)}
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
                  {r.confirmations.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <div className={`state ${statusClass(r.status)}`}>{r.status}</div>
                <time>Detected {formatTime(r.detectedAt)}</time>
              </button>
              <div className="wolf-radar-desk__card-actions">
                <button type="button" className="primary" onClick={() => onAnalyzeClick(r)}>
                  ANALYZE
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onAddWatch(r)}
                  disabled={watchSymbols.has(r.symbol)}
                >
                  <Plus size={14} />
                  {watchSymbols.has(r.symbol) ? 'WATCHING' : 'ADD TO WATCHLIST'}
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
    </div>
  );
}
