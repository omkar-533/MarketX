import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TradeRecord } from '../../types/journal';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Circle,
  Loader2,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
} from 'lucide-react';
import ChatMarkdown from '../ChatMarkdown';
import { hydrateJournalFromCloud, loadLocalTrades } from '../../services/journalSyncService';
import { fetchMentorDetective } from '../../services/mentorDetective';
import type { DetectiveCard } from '../../services/mentorDrills';
import {
  EMPTY_PLAN,
  LIVE_CHALLENGES,
  LIVE_EMOTIONS,
  LIVE_HOMEWORK,
  LIVE_RULE_OPTIONS,
  WATCHLIST_CRITERIA,
  buildEodReviewPrompt,
  buildLiveGuidancePrompt,
  buildMorningBriefPrompt,
  buildPlanCheckPrompt,
  buildTradingDna,
  buildWatchlist,
  buildWeeklyLivePrompt,
  checkRulesAndRisk,
  loadEmotionLog,
  loadLiveRules,
  loadMentorMemory,
  loadTradePlan,
  planCompleteness,
  pushEmotionLog,
  saveLiveRules,
  saveMentorMemory,
  saveTradePlan,
  tradesToday,
  type LiveEmotion,
  type LiveRules,
  type MentorMemory,
  type TradePlanDraft,
  type TradingDna,
  type WatchlistCriteria,
  type WatchlistItem,
} from '../../services/liveMentor';
import {
  MASTER_AI_MODEL_ID,
  askMasterAi,
  buildMasterMarketContext,
  type MasterAiLangMode,
  type MasterAiLanguage,
} from '../../services/masterAiService';
import type { MentorMode } from '../../services/mentorModes';
import type { MentorStudentProfile } from '../../services/mentorStudentProfile';
import type { User } from '../../hooks/useAuth';
import type { MentorHandoff } from '../../services/mentorBridge';
import MentorPathRail from './MentorPathRail';

type Props = {
  ownerKey: string;
  user: User | null;
  profile: MentorStudentProfile | null;
  symbol: string;
  interval: string;
  lang: MasterAiLanguage;
  langMode: MasterAiLangMode;
  mentorMode: MentorMode;
  onNavigate?: (handoff: MentorHandoff) => void;
};

function DnaBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="wm-live__dna-bar">
      <span>
        {label} <b>{value}</b>
      </span>
      <i style={{ width: `${value}%` }} />
    </div>
  );
}

export default function LiveMentorPanel({
  ownerKey,
  user,
  profile,
  symbol,
  interval,
  lang,
  langMode,
  mentorMode,
  onNavigate,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dna, setDna] = useState<TradingDna | null>(null);
  const [today, setToday] = useState<TradeRecord[]>([]);
  const [detective, setDetective] = useState<DetectiveCard | null>(null);
  const [rules, setRules] = useState<LiveRules>(() => loadLiveRules(ownerKey));
  const [memory, setMemory] = useState<MentorMemory>(() => loadMentorMemory(ownerKey));
  const [plan, setPlan] = useState<TradePlanDraft>(() => loadTradePlan(ownerKey));
  const [criteria, setCriteria] = useState<WatchlistCriteria[]>(['liquidity', 'continuation']);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [emotion, setEmotion] = useState<LiveEmotion>('Calm');
  const [emotionNote, setEmotionNote] = useState('');
  const [liveQ, setLiveQ] = useState('Sir ye setup dekh lo — structure aur liquidity pe coaching do.');
  const [note, setNote] = useState(
    'Live Mentor silent coach hai: planning, rules, risk, review. Trade execute nahi karega. Kabhi “Abhi Buy/Sell” nahi bolega.',
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await hydrateJournalFromCloud(user).catch(() => undefined);
      const trades = loadLocalTrades(user);
      setDna(buildTradingDna(trades, ownerKey, user));
      setToday(tradesToday(trades));
      setRules(loadLiveRules(ownerKey));
      setMemory(loadMentorMemory(ownerKey));
      setPlan(loadTradePlan(ownerKey));
      setWatchlist(buildWatchlist(criteria));
      const card = await fetchMentorDetective(symbol, interval);
      setDetective(card);
    } catch {
      const trades = loadLocalTrades(user);
      setDna(buildTradingDna(trades, ownerKey, user));
      setToday(tradesToday(trades));
      setWatchlist(buildWatchlist(criteria));
    } finally {
      setLoading(false);
    }
  }, [ownerKey, user, symbol, interval, criteria]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const completeness = useMemo(() => planCompleteness(plan), [plan]);
  const ruleCheck = useMemo(() => {
    if (!dna) {
      return { checks: [], compliance: 100, guardianAlerts: [] as string[] };
    }
    return checkRulesAndRisk({ rules, plan, todayTrades: today, dna });
  }, [rules, plan, today, dna]);

  const runAi = async (message: string) => {
    setBusy(true);
    setNote('Live Mentor soch raha hai…');
    try {
      const result = await askMasterAi(
        {
          message: `${message}\n\n[Reply in ${lang.replyIn}. Live Mentor — educational guidance only. Never Buy/Sell/Entry/Stop/Target orders.]`,
          model: MASTER_AI_MODEL_ID,
          lang: lang.code,
          langName: lang.name,
          langMode,
          mentorMode,
          mentorDesk: true,
          mentorLive: true,
          history: [],
        },
        buildMasterMarketContext(),
      );
      setNote(String(result.reply || '').trim() || 'No mentor note — retry.');
    } catch {
      setNote('Live Mentor unreachable. AI key Profile mein check karo.');
    } finally {
      setBusy(false);
    }
  };

  const morningBrief = () => {
    if (!dna) return;
    const wl = buildWatchlist(criteria);
    setWatchlist(wl);
    const nextMem = {
      ...memory,
      lastBriefAt: new Date().toISOString(),
      homework: LIVE_HOMEWORK[Math.floor(Math.random() * LIVE_HOMEWORK.length)],
      focusNotes: [dna.focusToday, ...memory.focusNotes].slice(0, 8),
    };
    setMemory(nextMem);
    saveMentorMemory(nextMem, ownerKey);
    void runAi(
      buildMorningBriefPrompt({
        studentName: profile?.name || 'Trader',
        dna,
        detective,
        memory: nextMem,
        criteria,
        watchlist: wl,
      }),
    );
  };

  const checkPlan = () => {
    saveTradePlan(plan, ownerKey);
    void runAi(buildPlanCheckPrompt(plan, completeness));
  };

  const askLive = () => {
    if (!dna) return;
    void runAi(
      buildLiveGuidancePrompt({
        question: liveQ.trim() || 'Structure aur scenarios explain karo.',
        plan,
        dna,
        detective,
      }),
    );
  };

  const eodReview = () => {
    if (!dna) return;
    void runAi(
      buildEodReviewPrompt({
        studentName: profile?.name || 'Trader',
        dna,
        todayTrades: today,
        compliance: ruleCheck.compliance,
        guardianAlerts: ruleCheck.guardianAlerts,
        emotions: loadEmotionLog(ownerKey).map((e) => ({ emotion: e.emotion, note: e.note })),
        challengeId: memory.challengeId,
      }),
    );
  };

  const weekly = () => {
    if (!dna) return;
    void runAi(buildWeeklyLivePrompt(dna, profile?.name || 'Trader'));
  };

  const toggleRule = (id: keyof LiveRules) => {
    setRules((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveLiveRules(next, ownerKey);
      return next;
    });
  };

  const toggleCriteria = (id: WatchlistCriteria) => {
    setCriteria((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      const final = next.length ? next : prev;
      setWatchlist(buildWatchlist(final));
      return final;
    });
  };

  const updatePlan = (patch: Partial<TradePlanDraft>) => {
    setPlan((prev) => {
      const next = { ...prev, ...patch };
      saveTradePlan(next, ownerKey);
      return next;
    });
  };

  const logEmotion = () => {
    pushEmotionLog(emotion, emotionNote.trim(), ownerKey);
    setEmotionNote('');
    setNote(`Emotion logged: ${emotion}. Pattern Live Mentor DNA me update hota rahega.`);
  };

  const setChallenge = (id: string) => {
    const next = { ...memory, challengeId: id, challengeStarted: new Date().toISOString().slice(0, 10) };
    setMemory(next);
    saveMentorMemory(next, ownerKey);
  };

  if (loading && !dna) {
    return (
      <div className="wm-live wm-live--empty">
        <Loader2 className="wm-desk__spin" size={20} />
        <p>Preparing Live Mentor desk…</p>
      </div>
    );
  }

  const d = dna!;

  return (
    <div className="wm-live">
      <header className="wm-live__head">
        <div>
          <p className="wm-learn__eyebrow">
            <Radio className="h-3 w-3" />
            Module 5 · Live Mentor
          </p>
          <h2 className="wm-learn__title">WOLF AI Live Mentor</h2>
          <p className="wm-learn__lead">
            Real market me silent mentor — planning, discipline, risk, review. Decision aapka. AI execute
            nahi karta.
          </p>
        </div>
        <button
          type="button"
          className="wm-desk__chip wm-desk__chip--ghost"
          onClick={() => void refresh()}
          disabled={loading || busy}
        >
          {loading ? <Loader2 className="wm-desk__spin" size={14} /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </header>

      <section className="wm-live__focus">
        <Brain size={16} />
        <div>
          <span>Today’s DNA focus</span>
          <strong>{d.focusToday}</strong>
        </div>
      </section>

      {onNavigate ? (
        <MentorPathRail
          ownerKey={ownerKey}
          weakness={d.weakArea || d.focusToday}
          onOpen={onNavigate}
          title="Practice loop before live size"
        />
      ) : null}

      <section className="wm-live__dna">
        <h3>Trading DNA</h3>
        <div className="wm-live__dna-grid">
          <DnaBar label="Technical" value={d.technicalAccuracy} />
          <DnaBar label="Execution" value={d.executionQuality} />
          <DnaBar label="Risk discipline" value={d.riskDiscipline} />
          <DnaBar label="Emotional stability" value={d.emotionalStability} />
          <DnaBar label="Consistency" value={d.consistencyIndex} />
          <DnaBar label="Learning speed" value={d.learningSpeed} />
        </div>
        <p className="wm-live__dna-meta">
          Setup lean: <b>{d.setupPreference}</b> · Market: <b>{d.marketPreference}</b> · Weak:{' '}
          <b>{d.weakArea}</b>
        </p>
      </section>

      {ruleCheck.guardianAlerts.length > 0 ? (
        <section className="wm-live__guardian">
          <Shield size={15} />
          <div>
            <strong>Risk Guardian</strong>
            <ul>
              {ruleCheck.guardianAlerts.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="wm-live__block">
        <div className="wm-live__block-h">
          <h3>Morning routine</h3>
          <button type="button" className="wm-learn__cta" disabled={busy} onClick={morningBrief}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Daily brief
          </button>
        </div>
        <p className="wm-live__muted">
          Homework: {memory.homework}
          {detective ? ` · Tape ${detective.symbol} LTP ${detective.ltp}` : ' · Tape loading…'}
        </p>
      </section>

      <section className="wm-live__block">
        <h3>Watchlist builder</h3>
        <div className="wm-live__chips">
          {WATCHLIST_CRITERIA.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`wm-learn__chip ${criteria.includes(c.id) ? 'wm-learn__chip--on' : ''}`}
              onClick={() => toggleCriteria(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <ul className="wm-live__watch">
          {watchlist.map((w) => (
            <li key={`${w.symbol}-${w.setupType}`}>
              <b>{w.symbol}</b>
              <span>{w.setupType}</span>
              <em>{w.riskLevel}</em>
              <p>{w.learning}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="wm-live__block">
        <div className="wm-live__block-h">
          <h3>Trade planning assistant</h3>
          <span className={completeness.score < 80 ? 'wm-live__warn' : ''}>
            {completeness.score}% complete
          </span>
        </div>
        {completeness.missing.length > 0 ? (
          <p className="wm-live__warn-line">
            <AlertTriangle size={13} /> Missing: {completeness.missing.join(', ')}
          </p>
        ) : null}
        <div className="wm-live__plan-grid">
          {(
            [
              ['symbol', 'Symbol'],
              ['trend', 'Trend'],
              ['entryReason', 'Entry reason'],
              ['confirmation', 'Confirmation'],
              ['stopLoss', 'Your stop'],
              ['target', 'Your target'],
              ['rr', 'RR'],
              ['maxRisk', 'Max risk %'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={plan[key]}
                onChange={(e) => updatePlan({ [key]: e.target.value })}
                placeholder={label}
              />
            </label>
          ))}
        </div>
        <label className="wm-live__fail">
          Decision challenge — if this fails, exit condition?
          <textarea
            rows={2}
            value={plan.failExit}
            onChange={(e) => updatePlan({ failExit: e.target.value })}
            placeholder="Invalidation / process exit — not a live order from AI"
          />
        </label>
        <div className="wm-live__actions">
          <button
            type="button"
            className="wm-desk__chip"
            onClick={() => {
              const next = { ...EMPTY_PLAN, symbol: plan.symbol };
              setPlan(next);
              saveTradePlan(next, ownerKey);
            }}
          >
            Clear plan
          </button>
          <button type="button" className="wm-learn__cta" disabled={busy} onClick={checkPlan}>
            Check plan with mentor
          </button>
        </div>
      </section>

      <section className="wm-live__block">
        <h3>Rule checker · {ruleCheck.compliance}% compliance</h3>
        <ul className="wm-live__rules">
          {LIVE_RULE_OPTIONS.map((r) => (
            <li key={r.id}>
              <button type="button" className={rules[r.id] ? 'on' : ''} onClick={() => toggleRule(r.id)}>
                {rules[r.id] ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                {r.label}
              </button>
            </li>
          ))}
        </ul>
        <ul className="wm-live__checks">
          {ruleCheck.checks.map((c) => (
            <li key={c.id} className={c.ok ? 'ok' : 'bad'}>
              {c.ok ? '✔' : '✖'} {c.label} — {c.detail}
            </li>
          ))}
        </ul>
      </section>

      <section className="wm-live__block">
        <h3>Live mentor mode</h3>
        <textarea
          className="wm-live__ask"
          rows={2}
          value={liveQ}
          onChange={(e) => setLiveQ(e.target.value)}
          placeholder="Chart / structure question — no ‘abhi buy’ answers"
        />
        <button type="button" className="wm-learn__cta" disabled={busy} onClick={askLive}>
          Ask live guidance
        </button>
      </section>

      <section className="wm-live__block">
        <h3>Emotion tracker</h3>
        <div className="wm-live__chips">
          {LIVE_EMOTIONS.map((e) => (
            <button
              key={e}
              type="button"
              className={`wm-learn__chip ${emotion === e ? 'wm-learn__chip--on' : ''}`}
              onClick={() => setEmotion(e)}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="wm-live__emotion-row">
          <input
            value={emotionNote}
            onChange={(e) => setEmotionNote(e.target.value)}
            placeholder="Optional note"
          />
          <button type="button" className="wm-desk__chip" onClick={logEmotion}>
            Log emotion
          </button>
        </div>
      </section>

      <section className="wm-live__block">
        <h3>Challenge</h3>
        <div className="wm-live__chips">
          {LIVE_CHALLENGES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`wm-learn__chip ${memory.challengeId === c.id ? 'wm-learn__chip--on' : ''}`}
              onClick={() => setChallenge(c.id)}
              title={c.detail}
            >
              {c.title}
            </button>
          ))}
        </div>
        <p className="wm-live__muted">
          {LIVE_CHALLENGES.find((c) => c.id === memory.challengeId)?.detail}
        </p>
      </section>

      <section className="wm-live__ask-row">
        <button type="button" className="wm-desk__chip" disabled={busy} onClick={eodReview}>
          End of day review
        </button>
        <button type="button" className="wm-desk__chip" disabled={busy} onClick={weekly}>
          Weekly coaching
        </button>
      </section>

      <section className="wm-live__note" aria-live="polite">
        <div className="wm-learn__label">Mentor note</div>
        <div className={`wm-learn__note ${busy ? 'wm-learn__note--busy' : ''}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin wm-learn__spin" /> : null}
          <ChatMarkdown text={note} />
        </div>
      </section>
    </div>
  );
}
