import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  FlaskConical,
  Loader2,
  Pause,
  Play,
  SkipForward,
  Sparkles,
  Square,
} from 'lucide-react';
import ChatMarkdown from '../ChatMarkdown';
import LabReplayChart from './LabReplayChart';
import { fetchMarketOhlc } from '../../services/marketApiService';
import type { ChartBar } from '../../types/chart';
import {
  LAB_INTERVALS,
  LAB_MARKETS,
  LAB_MISSIONS,
  LAB_MODES,
  applyBarToPosition,
  awardSessionProgress,
  buildLabSessionReportPrompt,
  buildLabTradeReviewPrompt,
  certLabel,
  checkMentorIntervention,
  closePositionManual,
  conceptHint,
  currentPrice,
  defaultSessionRules,
  evaluateMissions,
  loadLabProgress,
  plannedRr,
  positionSizeFromRisk,
  revealedBars,
  scoreLabTrade,
  summarizeSession,
  warmupIndex,
  type LabClosedTrade,
  type LabMode,
  type LabPosition,
  type LabProgress,
  type LabSessionRules,
  type LabSide,
} from '../../services/tradingLab';
import {
  MASTER_AI_MODEL_ID,
  askMasterAi,
  buildMasterMarketContext,
  type MasterAiLangMode,
  type MasterAiLanguage,
} from '../../services/masterAiService';
import type { MentorMode } from '../../services/mentorModes';
import type { MentorStudentProfile } from '../../services/mentorStudentProfile';
import type { MentorHandoff } from '../../services/mentorBridge';
import MentorPathRail from './MentorPathRail';

type Props = {
  ownerKey: string;
  profile: MentorStudentProfile | null;
  lang: MasterAiLanguage;
  langMode: MasterAiLangMode;
  mentorMode: MentorMode;
  handoff?: MentorHandoff | null;
  onNavigate?: (handoff: MentorHandoff) => void;
  onHandoffConsumed?: () => void;
};

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="wm-lab__score-row">
      <span>{label}</span>
      <b>{value}%</b>
      <i style={{ width: `${value}%` }} />
    </div>
  );
}

export default function TradingLabPanel({
  ownerKey,
  profile,
  lang,
  langMode,
  mentorMode,
  handoff,
  onNavigate,
  onHandoffConsumed,
}: Props) {
  const [mode, setMode] = useState<LabMode>('beginner');
  const [marketId, setMarketId] = useState('NIFTY');
  const [interval, setInterval] = useState('15m');
  const [missionId, setMissionId] = useState(LAB_MISSIONS[0].id);
  const [replayBanner, setReplayBanner] = useState<string | null>(null);
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [cursor, setCursor] = useState(0);
  const [startCursor, setStartCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState<LabPosition | null>(null);
  const [closed, setClosed] = useState<LabClosedTrade[]>([]);
  const [lastTrade, setLastTrade] = useState<LabClosedTrade | null>(null);
  const [startBalance] = useState(100000);
  const [balance, setBalance] = useState(100000);
  const [riskPct, setRiskPct] = useState(1);
  const [side, setSide] = useState<LabSide>('BUY');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [notes, setNotes] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [intervention, setIntervention] = useState<string | null>(null);
  const [interventions, setInterventions] = useState<string[]>([]);
  const [note, setNote] = useState(
    'Trading Lab = flight simulator. Historical candles reveal one-by-one. Future hidden. Practice decisions — AI reviews process after the trade.',
  );
  const [progress, setProgress] = useState<LabProgress>(() => loadLabProgress(ownerKey));
  const [sessionEnded, setSessionEnded] = useState(false);
  const playRef = useRef<number | null>(null);

  const market = LAB_MARKETS.find((m) => m.id === marketId) || LAB_MARKETS[0];
  const modeMeta = LAB_MODES.find((m) => m.id === mode) || LAB_MODES[0];
  const rules: LabSessionRules = useMemo(() => defaultSessionRules(mode), [mode]);
  const visible = useMemo(() => revealedBars(bars, cursor), [bars, cursor]);
  const ltp = currentPrice(bars, cursor);
  const summary = useMemo(
    () => summarizeSession(closed, startBalance, balance),
    [closed, startBalance, balance],
  );

  useEffect(() => {
    setProgress(loadLabProgress(ownerKey));
  }, [ownerKey]);

  useEffect(() => {
    if (!handoff || handoff.view !== 'lab') return;
    if (handoff.labMode) setMode(handoff.labMode);
    if (handoff.labMissionId && LAB_MISSIONS.some((m) => m.id === handoff.labMissionId)) {
      setMissionId(handoff.labMissionId);
    }
    if (handoff.focusNote) {
      setNotes(handoff.focusNote);
      setReplayBanner(
        handoff.mistakeReplay
          ? `Mistake replay armed · ${handoff.reason}`
          : handoff.reason,
      );
      setHint(handoff.focusNote);
    }
    onHandoffConsumed?.();
  }, [handoff, onHandoffConsumed]);

  const stopPlay = useCallback(() => {
    setPlaying(false);
    if (playRef.current != null) {
      window.clearInterval(playRef.current);
      playRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPlay(), [stopPlay]);

  const pushClosed = useCallback(
    (trade: LabClosedTrade) => {
      const scored = {
        ...trade,
        scores: scoreLabTrade(trade, rules, null),
      };
      setClosed((prev) => [...prev, scored]);
      setLastTrade(scored);
      setBalance((b) => b + scored.pnlPoints);
      setPosition(null);
      setNotes('');
    },
    [rules],
  );

  const stepOnce = useCallback(() => {
    if (!bars.length || sessionEnded) return;
    setCursor((c) => {
      if (c >= bars.length - 1) {
        stopPlay();
        return c;
      }
      const next = c + 1;
      const bar = bars[next];
      setPosition((pos) => {
        if (!pos || !bar) return pos;
        const { closed: hit, stillOpen } = applyBarToPosition(pos, bar, next);
        if (hit) {
          const priorLoss = null;
          const scored = { ...hit, scores: scoreLabTrade(hit, rules, priorLoss) };
          setClosed((prev) => [...prev, scored]);
          setLastTrade(scored);
          setBalance((b) => b + scored.pnlPoints);
          return null;
        }
        return stillOpen;
      });
      const h = conceptHint(mode, next, bars);
      if (h) setHint(h);
      return next;
    });
  }, [bars, mode, rules, sessionEnded, stopPlay]);

  useEffect(() => {
    if (!playing) return;
    playRef.current = window.setInterval(() => stepOnce(), modeMeta.speedMs);
    return () => {
      if (playRef.current != null) window.clearInterval(playRef.current);
    };
  }, [playing, modeMeta.speedMs, stepOnce]);

  const loadSession = async () => {
    stopPlay();
    setLoading(true);
    setSessionEnded(false);
    setClosed([]);
    setLastTrade(null);
    setPosition(null);
    setIntervention(null);
    setInterventions([]);
    setHint(null);
    setBalance(startBalance);
    setNote('Loading historical market for replay…');
    try {
      const range = interval === '1d' ? '1y' : interval === '1h' ? '6mo' : '3mo';
      // Cap depth so lab opens quickly; replay does not need 2000-bar stitch.
      const res = await fetchMarketOhlc(market.apiSymbol, interval, range, 600);
      const next = res?.bars ?? [];
      if (next.length < 40) {
        setBars([]);
        setNote('Not enough historical bars for this symbol/timeframe. Try NIFTY 15m or another market.');
        return;
      }
      // Hide the most recent tip so student cannot peek live edge; practice mid-history.
      const usable = next.slice(0, Math.max(40, next.length - 8));
      const warm = warmupIndex(usable.length);
      setBars(usable);
      setStartCursor(warm);
      setCursor(warm);
      setHint(conceptHint(mode, warm, usable));
      setNote(
        `Session ready · ${market.label} ${interval} · ${usable.length} bars · future candles hidden. Step or Play to reveal.`,
      );
    } catch {
      setNote('Could not load OHLC. Check API server, then retry Load session.');
    } finally {
      setLoading(false);
    }
  };

  const openTrade = (orderSide: LabSide) => {
    if (!bars.length || sessionEnded) return;
    if (position) {
      setIntervention('Close the open position first, then open a new trade.');
      return;
    }
    if (closed.length >= rules.maxTrades) {
      const msg = checkMentorIntervention({ kind: 'max_trades', mode });
      setIntervention(msg);
      if (msg) setInterventions((p) => [...p, msg]);
      return;
    }
    const entry = ltp;
    const slN = sl ? Number(sl) : NaN;
    const tpN = tp ? Number(tp) : NaN;
    const stopLoss = Number.isFinite(slN) ? slN : null;
    const takeProfit = Number.isFinite(tpN) ? tpN : null;

    if (!stopLoss) {
      const msg = checkMentorIntervention({ kind: 'no_sl', mode });
      setIntervention(msg);
      if (msg) setInterventions((p) => [...p, msg]);
      if (mode !== 'beginner') return;
    }

    const rr = plannedRr(orderSide, entry, stopLoss, takeProfit);
    if (rr != null && rr < rules.minRr) {
      const msg = checkMentorIntervention({ kind: 'min_rr', mode });
      setIntervention(msg);
      if (msg) setInterventions((p) => [...p, msg]);
      if (mode === 'challenge' || mode === 'professional') return;
    }

    const lastLoss = [...closed].reverse().find((t) => t.pnlPoints < 0);
    if (lastLoss && cursor - lastLoss.exitBarIndex <= 3) {
      const msg = checkMentorIntervention({ kind: 'revenge', mode });
      setIntervention(msg);
      if (msg) setInterventions((p) => [...p, msg]);
      if (mode === 'challenge') return;
    }

    const lossSoFar = startBalance - balance;
    if (lossSoFar / startBalance >= rules.dailyLossLimitPct / 100) {
      const msg = checkMentorIntervention({ kind: 'risk_limit', mode });
      setIntervention(msg);
      if (msg) setInterventions((p) => [...p, msg]);
      return;
    }

    const qty = positionSizeFromRisk(balance, riskPct, entry, stopLoss);
    const riskPoints = stopLoss != null ? Math.abs(entry - stopLoss) : null;
    setSide(orderSide);
    setPosition({
      side: orderSide,
      qty,
      entry,
      entryBarIndex: cursor,
      stopLoss,
      takeProfit,
      notes: notes.trim(),
      plannedRr: rr,
      riskPoints,
    });
    setIntervention(null);
    setHint(modeMeta.hints ? 'Trade open — observe process, not signals.' : null);
  };

  const closeNow = () => {
    if (!position) return;
    const trade = closePositionManual(position, ltp, cursor, rules, null);
    pushClosed(trade);
  };

  const endSession = () => {
    stopPlay();
    let list = closed;
    let bal = balance;
    if (position) {
      const trade = closePositionManual(position, ltp, cursor, rules, null);
      const scored = { ...trade, scores: scoreLabTrade(trade, rules, null) };
      list = [...closed, scored];
      bal = balance + scored.pnlPoints;
      setClosed(list);
      setLastTrade(scored);
      setBalance(bal);
      setPosition(null);
    }
    setSessionEnded(true);
    const missionDone = evaluateMissions({
      closed: list,
      cursor,
      startCursor,
      startBalance,
      balance: bal,
      missionIds: [missionId],
    });
    const sum = summarizeSession(list, startBalance, bal);
    const nextProg = awardSessionProgress(ownerKey, {
      closed: list,
      summary: sum,
      missionDone,
    });
    setProgress(nextProg);
    setNote(
      `Session closed · Grade ${sum.grade} · Score ${sum.avgOverall} · XP now ${nextProg.xp} · ${certLabel(nextProg.certTier)}. Ask AI for full report.`,
    );
  };

  const runAi = async (message: string) => {
    setBusy(true);
    setNote('Lab mentor evaluating…');
    try {
      const result = await askMasterAi(
        {
          message: `${message}\n\n[Reply in ${lang.replyIn}. Trading Lab educational feedback only.]`,
          model: MASTER_AI_MODEL_ID,
          lang: lang.code,
          langName: lang.name,
          langMode,
          mentorMode,
          mentorDesk: true,
          mentorLab: true,
          history: [],
        },
        buildMasterMarketContext(),
      );
      setNote(String(result.reply || '').trim() || 'No mentor note — retry.');
    } catch {
      setNote('Lab mentor unreachable. Check your AI key in Profile.');
    } finally {
      setBusy(false);
    }
  };

  const reviewLast = () => {
    if (!lastTrade) return;
    void runAi(
      buildLabTradeReviewPrompt(lastTrade, {
        symbol: market.label,
        interval,
        mode,
        studentName: profile?.name || 'Trader',
      }),
    );
  };

  const sessionReport = () => {
    const missionDone = evaluateMissions({
      closed,
      cursor,
      startCursor,
      startBalance,
      balance,
      missionIds: [missionId],
    });
    void runAi(
      buildLabSessionReportPrompt({
        studentName: profile?.name || 'Trader',
        symbol: market.label,
        interval,
        mode,
        summary,
        closed,
        interventions,
        missionDone,
      }),
    );
  };

  const rrPreview = plannedRr(side, ltp, sl ? Number(sl) : null, tp ? Number(tp) : null);

  return (
    <div className="wm-lab">
      <header className="wm-lab__head">
        <div>
          <p className="wm-learn__eyebrow">
            <FlaskConical className="h-3 w-3" />
            Module 4 · Trading Lab
          </p>
          <h2 className="wm-learn__title">WOLF AI Trading Simulator</h2>
          <p className="wm-learn__lead">
            Flight simulator for traders — candle-by-candle historical practice + instant process
            scores. Future candles stay hidden.
          </p>
        </div>
        <div className="wm-lab__cert">
          <Award size={14} />
          <div>
            <span>{certLabel(progress.certTier)}</span>
            <b>{progress.xp} XP</b>
          </div>
        </div>
      </header>

      <section className="wm-lab__setup">
        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as LabMode)} disabled={playing}>
            {LAB_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Market
          <select value={marketId} onChange={(e) => setMarketId(e.target.value)} disabled={playing}>
            {LAB_MARKETS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Timeframe
          <select value={interval} onChange={(e) => setInterval(e.target.value)} disabled={playing}>
            {LAB_INTERVALS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mission
          <select value={missionId} onChange={(e) => setMissionId(e.target.value)} disabled={playing}>
            {LAB_MISSIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="wm-learn__cta wm-lab__load"
          onClick={() => void loadSession()}
          disabled={loading || playing}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Loading…' : 'Load session'}
        </button>
      </section>

      <p className="wm-lab__mode-hint">{modeMeta.hint}</p>

      {replayBanner ? (
        <div className="wm-lab__overlay wm-lab__overlay--warn">
          <strong>Mistake replay</strong>
          <p>{replayBanner}</p>
          <p>
            Mission <b>{missionId}</b> · mode <b>{mode}</b>. Load session, then practice the same
            process gap slower — no future candles.
          </p>
        </div>
      ) : null}

      {onNavigate ? (
        <MentorPathRail
          ownerKey={ownerKey}
          weakness={replayBanner || profile?.weakAreas?.[0] || 'execution discipline'}
          onOpen={onNavigate}
          title="After Lab · continue the ecosystem path"
        />
      ) : null}

      <div className="wm-lab__stage">
        {visible.length ? (
          <LabReplayChart bars={visible} position={position} />
        ) : (
          <div className="wm-lab__chart-empty">Load a historical session to start replay.</div>
        )}
      </div>

      <div className="wm-lab__tape">
        <span>
          Bar {bars.length ? cursor + 1 : 0}/{bars.length || '—'}
        </span>
        <span>LTP {ltp ? ltp.toFixed(2) : '—'}</span>
        <span>Bal ₹{Math.round(balance).toLocaleString('en-IN')}</span>
        <span>
          Trades {closed.length}/{rules.maxTrades}
        </span>
      </div>

      <div className="wm-lab__controls">
        <button type="button" className="wm-desk__chip" disabled={!bars.length || sessionEnded} onClick={stepOnce}>
          <SkipForward size={14} /> Step
        </button>
        {!playing ? (
          <button
            type="button"
            className="wm-desk__chip wm-desk__chip--on"
            disabled={!bars.length || sessionEnded}
            onClick={() => setPlaying(true)}
          >
            <Play size={14} /> Play
          </button>
        ) : (
          <button type="button" className="wm-desk__chip" onClick={stopPlay}>
            <Pause size={14} /> Pause
          </button>
        )}
        <button
          type="button"
          className="wm-desk__chip"
          disabled={!bars.length || sessionEnded}
          onClick={endSession}
        >
          <Square size={14} /> End session
        </button>
      </div>

      {(hint || intervention) && (
        <div className={`wm-lab__overlay ${intervention ? 'wm-lab__overlay--warn' : ''}`}>
          <strong>{intervention ? 'Mentor Intervention™' : 'Mentor overlay'}</strong>
          <p>{intervention || hint}</p>
        </div>
      )}

      <section className="wm-lab__ticket">
        <div className="wm-lab__ticket-row">
          <label>
            Risk %
            <input
              type="number"
              min={0.25}
              max={2}
              step={0.25}
              value={riskPct}
              onChange={(e) => setRiskPct(Number(e.target.value) || 1)}
            />
          </label>
          <label>
            Stop loss
            <input value={sl} onChange={(e) => setSl(e.target.value)} placeholder="price" />
          </label>
          <label>
            Take profit
            <input value={tp} onChange={(e) => setTp(e.target.value)} placeholder="price" />
          </label>
          <label className="wm-lab__rr">
            Planned RR
            <b>{rrPreview ?? '—'}</b>
          </label>
        </div>
        <label className="wm-lab__notes">
          Trade reason / notes
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this entry? What confirmation?"
          />
        </label>
        <div className="wm-lab__order-btns">
          <button
            type="button"
            className="wm-lab__buy"
            disabled={!bars.length || !!position || sessionEnded}
            onClick={() => openTrade('BUY')}
          >
            Buy
          </button>
          <button
            type="button"
            className="wm-lab__sell"
            disabled={!bars.length || !!position || sessionEnded}
            onClick={() => openTrade('SELL')}
          >
            Sell
          </button>
          <button
            type="button"
            className="wm-desk__chip"
            disabled={!position}
            onClick={closeNow}
          >
            Close position
          </button>
        </div>
        {position ? (
          <p className="wm-lab__pos">
            Open {position.side} · entry {position.entry.toFixed(2)} · qty {position.qty} · SL{' '}
            {position.stopLoss ?? '—'} · TP {position.takeProfit ?? '—'}
          </p>
        ) : null}
      </section>

      {lastTrade ? (
        <section className="wm-lab__scores">
          <h3>Instant trade review</h3>
          <ScoreRow label="Entry quality" value={lastTrade.scores.entryQuality} />
          <ScoreRow label="Risk management" value={lastTrade.scores.riskManagement} />
          <ScoreRow label="Structure reading" value={lastTrade.scores.structureReading} />
          <ScoreRow label="Execution" value={lastTrade.scores.execution} />
          <ScoreRow label="Discipline" value={lastTrade.scores.discipline} />
          <p className="wm-lab__overall">
            Overall <b>{lastTrade.scores.overall}</b>/100 · {lastTrade.reason} · PnL{' '}
            {Math.round(lastTrade.pnlPoints)}
          </p>
        </section>
      ) : null}

      {closed.length > 0 ? (
        <section className="wm-lab__summary">
          <h3>Session scoreboard</h3>
          <div className="wm-lab__kpis">
            <div>
              <b>{summary.winRate}%</b>
              <span>Win rate</span>
            </div>
            <div>
              <b>{summary.avgRr || '—'}</b>
              <span>Avg RR</span>
            </div>
            <div>
              <b>{summary.avgOverall}</b>
              <span>Avg score</span>
            </div>
            <div>
              <b>{summary.grade}</b>
              <span>Grade</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="wm-lab__ask">
        <div className="wm-lab__actions">
          <button
            type="button"
            className="wm-learn__cta"
            disabled={busy || !lastTrade}
            onClick={reviewLast}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI trade review
          </button>
          <button
            type="button"
            className="wm-desk__chip"
            disabled={busy || closed.length === 0}
            onClick={sessionReport}
          >
            Session report
          </button>
        </div>
      </section>

      <section className="wm-lab__note" aria-live="polite">
        <div className="wm-learn__label">Lab mentor</div>
        <div className={`wm-learn__note ${busy ? 'wm-learn__note--busy' : ''}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin wm-learn__spin" /> : null}
          <ChatMarkdown text={note} />
        </div>
      </section>

      <p className="wm-lab__mission-detail">
        Active mission: <strong>{LAB_MISSIONS.find((m) => m.id === missionId)?.title}</strong> —{' '}
        {LAB_MISSIONS.find((m) => m.id === missionId)?.detail}
      </p>
    </div>
  );
}
