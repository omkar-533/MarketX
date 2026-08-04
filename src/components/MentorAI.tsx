import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  GraduationCap,
  HelpCircle,
  Mic2,
  RefreshCw,
  Swords,
  Target,
  Trophy,
} from 'lucide-react';
import ChatMarkdown from './ChatMarkdown';
import ChatChartPanel from './masterai/ChatChartPanel';
import { useAuth } from '../hooks/useAuth';
import {
  MENTOR_MODES,
  loadMentorMode,
  saveMentorMode,
  type MentorMode,
} from '../services/mentorModes';
import {
  buildDrillFromDetective,
  isDrillAnswerCorrect,
  saveDrillResult,
  type DetectiveCard,
  type MentorDrill,
} from '../services/mentorDrills';
import { fetchMentorDetective } from '../services/mentorDetective';
import {
  buildTraderSkillProfile,
  trainingPlanPrompt,
} from '../services/traderSkillProfile';
import {
  MASTER_AI_MODEL_ID,
  askMasterAi,
  buildMasterMarketContext,
  fetchMasterAiStatus,
  getMasterAiLanguage,
  loadSelectedLanguage,
} from '../services/masterAiService';
import { consumeHunterPendingPrompt } from '../services/journalAiAssist';
import { API_SERVER_READY_EVENT } from '../services/apiAutoConnect';
import { OPENROUTER_KEY_UPDATED_EVENT } from '../services/openRouterKey';
import type { TvInterval } from '../utils/tradingViewSymbols';
import { tradingViewSymbolLabel } from '../utils/tradingViewSymbols';

const WOLF_MENTOR = 'Wolf Mentor';

/**
 * Wolf Mentor — live training desk (not a chatbot).
 * Chart + quizzes + coach notes. Hunter / Wolf AI stays separate for analysis chat.
 */
export default function MentorAI() {
  const { user } = useAuth();
  const ownerKey = user?.id || user?.email || 'guest';
  const lang = getMasterAiLanguage(loadSelectedLanguage());

  const [mentorMode, setMentorMode] = useState<MentorMode>(loadMentorMode);
  const [symbol, setSymbol] = useState('NSE:NIFTY');
  const [interval, setInterval] = useState<TvInterval>('15');
  const [study, setStudy] = useState('none');
  const [detective, setDetective] = useState<DetectiveCard | null>(null);
  const [activeDrill, setActiveDrill] = useState<MentorDrill | null>(null);
  const [coachNote, setCoachNote] = useState(
    'Wolf Mentor is ready. Answer chart quizzes — I grade process only, never Entry/Stop/Target.',
  );
  const [coachTitle, setCoachTitle] = useState('Coach notes');
  const [busy, setBusy] = useState(false);
  const [skillTick, setSkillTick] = useState(0);
  const [aiOk, setAiOk] = useState(false);
  const gradingRef = useRef(false);

  const skillProfile = useMemo(
    () => buildTraderSkillProfile(ownerKey, user),
    [ownerKey, user, skillTick],
  );

  useEffect(() => {
    const refresh = () =>
      void fetchMasterAiStatus().then((s) => setAiOk(s.configured));
    refresh();
    window.addEventListener(OPENROUTER_KEY_UPDATED_EVENT, refresh);
    window.addEventListener(API_SERVER_READY_EVENT, refresh);
    return () => {
      window.removeEventListener(OPENROUTER_KEY_UPDATED_EVENT, refresh);
      window.removeEventListener(API_SERVER_READY_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const card = await fetchMentorDetective(symbol, interval);
      if (!cancelled) setDetective(card);
    };
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [symbol, interval]);

  // Always punch drills from tape — training desk, not chat.
  useEffect(() => {
    if (!detective || activeDrill || busy) return;
    const t = window.setTimeout(() => {
      setActiveDrill(buildDrillFromDetective(detective));
    }, 6_000);
    return () => window.clearTimeout(t);
  }, [detective?.symbol, detective?.ltp, detective?.zone, activeDrill, busy]);

  useEffect(() => {
    if (!detective || busy) return;
    const t = window.setInterval(() => {
      setActiveDrill((prev) => prev ?? buildDrillFromDetective(detective));
    }, 40_000);
    return () => window.clearInterval(t);
  }, [detective, busy]);

  const speakBriefing = useCallback(() => {
    if (!detective || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const line = [
      `${detective.symbol} briefing from Wolf Mentor.`,
      `Trend ${detective.trend}. Zone ${detective.zone}.`,
      `Liquidity: ${detective.liquidity}.`,
      `Volatility ${detective.volatility}.`,
      `Process: ${detective.bestAction}.`,
      `Confidence ${detective.confidence} percent — evidence score, not win rate.`,
    ].join(' ');
    const u = new SpeechSynthesisUtterance(line);
    u.lang = 'en-IN';
    window.speechSynthesis.speak(u);
  }, [detective]);

  const askCoach = useCallback(
    async (message: string, opts?: { trainingGrade?: boolean; title?: string }) => {
      if (gradingRef.current) return;
      gradingRef.current = true;
      setBusy(true);
      setCoachTitle(opts?.title || 'Coach notes');
      setCoachNote('Reading the chart tape…');
      try {
        const ctx = buildMasterMarketContext();
        const chartHint = `[CHART OPEN ON WOLF MENTOR DESK: ${tradingViewSymbolLabel(symbol)} · ${interval}. Train from MARKET INTEL. Process only.]`;
        const result = await askMasterAi(
          {
            message: `${message}\n\n${chartHint}`,
            model: MASTER_AI_MODEL_ID,
            lang: lang.code,
            langName: lang.name,
            langMode: 'auto',
            mentorMode,
            mentorDesk: true,
            trainingGrade: Boolean(opts?.trainingGrade),
            history: [],
          },
          ctx,
        );
        const text = String(result.reply || '')
          .replace(/```wolfchart[\s\S]*?```/gi, '')
          .trim();
        setCoachNote(text || 'No coach note — try Next quiz again.');
      } catch {
        setCoachNote('Wolf Mentor could not reach the coach engine. Check your AI key in Profile, then retry.');
      } finally {
        gradingRef.current = false;
        setBusy(false);
      }
    },
    [symbol, interval, lang.code, lang.name, mentorMode],
  );

  useEffect(() => {
    const pending = consumeHunterPendingPrompt();
    if (!pending) return;
    void askCoach(pending, { title: 'Challenge review' });
  }, [askCoach]);

  const answerDrill = (optionId: string) => {
    if (!activeDrill || busy) return;
    const correct = isDrillAnswerCorrect(activeDrill, optionId);
    saveDrillResult(
      {
        drillId: activeDrill.id,
        chosenId: optionId,
        correct,
        at: new Date().toISOString(),
        symbol: activeDrill.symbol,
      },
      ownerKey,
    );
    setSkillTick((n) => n + 1);
    const chosen = activeDrill.options.find((o) => o.id === optionId)?.label || optionId;
    const gradeMsg = [
      `[DECISION TRAINING] My choice: ${chosen} (${optionId}).`,
      `Drill: ${activeDrill.question}`,
      `Correct process key: ${activeDrill.correctId}.`,
      `Brief reason key: ${activeDrill.reason}`,
      'Grade my process in 4–6 short lines. No Entry/Stop/Target.',
    ].join('\n');
    setActiveDrill(null);
    void askCoach(gradeMsg, { trainingGrade: true, title: correct ? 'Solid process' : 'Process correction' });
  };

  const punchQuiz = () => {
    if (detective) setActiveDrill(buildDrillFromDetective(detective));
  };

  const quizFromChart = () => {
    void askCoach(
      '[MENTOR AUTO-QUIZ] Look at MARKET INTEL for the open chart and ask me ONE short process question (premium/discount, structure lean, or liquidity). Do not answer it yourself. No Entry/Stop/Target.',
      { title: 'Chart question' },
    );
  };

  const sendTrainingPlan = () => {
    void askCoach(trainingPlanPrompt(skillProfile), { title: '7-day training path' });
  };

  return (
    <div className="wm-desk">
      <header className="wm-desk__top">
        <div className="wm-desk__brand">
          <div className="wm-desk__mark" aria-hidden>
            <GraduationCap className="h-4 w-4" />
          </div>
          <div>
            <div className="wm-desk__title-row">
              <h1 className="wm-desk__title">{WOLF_MENTOR}</h1>
              <span className="wm-desk__badge">Trainer</span>
            </div>
            <p className="wm-desk__sub">
              {aiOk ? 'Live training desk · process only' : 'Add AI key in Profile to grade quizzes'}
            </p>
          </div>
        </div>

        <div className="wm-desk__modes" role="group" aria-label="Coach style">
          {MENTOR_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`wm-desk__chip ${mentorMode === m.id ? 'wm-desk__chip--on' : ''}`}
              title={m.hint}
              onClick={() => {
                setMentorMode(m.id);
                saveMentorMode(m.id);
              }}
            >
              {m.id === 'beginner' ? (
                <GraduationCap className="h-3 w-3" />
              ) : m.id === 'strict' ? (
                <Swords className="h-3 w-3" />
              ) : m.id === 'socratic' ? (
                <HelpCircle className="h-3 w-3" />
              ) : (
                <Brain className="h-3 w-3" />
              )}
              {m.label}
            </button>
          ))}
        </div>

        <div className="wm-desk__actions">
          <button type="button" className="wm-desk__chip" onClick={speakBriefing} disabled={!detective}>
            <Mic2 className="h-3.5 w-3.5" />
            Briefing
          </button>
          <button type="button" className="wm-desk__chip" onClick={punchQuiz} disabled={!detective || busy}>
            <Target className="h-3.5 w-3.5" />
            Next quiz
          </button>
          <button type="button" className="wm-desk__chip" onClick={quizFromChart} disabled={busy}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'wm-desk__spin' : ''}`} />
            Chart question
          </button>
        </div>
      </header>

      <div className="wm-desk__body">
        <section className="wm-desk__chart" aria-label="Training chart">
          <ChatChartPanel
            symbol={symbol}
            interval={interval}
            study={study}
            onSymbolChange={setSymbol}
            onIntervalChange={setInterval}
            onStudyChange={setStudy}
            onClose={() => undefined}
            hideClose
          />
        </section>

        <aside className="wm-desk__side">
          {detective ? (
            <div className="wm-desk__card">
              <div className="wm-desk__card-h">Market Condition</div>
              <div className="wm-desk__grid">
                <div>
                  <span>Trend</span>
                  <b>{detective.trend}</b>
                </div>
                <div>
                  <span>Zone</span>
                  <b>{detective.zone}</b>
                </div>
                <div>
                  <span>Volatility</span>
                  <b>{detective.volatility}</b>
                </div>
                <div>
                  <span>Confidence</span>
                  <b>{detective.confidence}% · evidence</b>
                </div>
                <div className="wm-desk__wide">
                  <span>Liquidity</span>
                  <b>{detective.liquidity}</b>
                </div>
                <div className="wm-desk__wide">
                  <span>Best process</span>
                  <b>{detective.bestAction}</b>
                </div>
              </div>
              {detective.mtf ? (
                <p className="wm-desk__mtf">
                  Daily {detective.mtf.daily} · 1H {detective.mtf.h1} · Chart {detective.mtf.entryTf}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="wm-desk__card">
              <div className="wm-desk__card-h">Market Condition</div>
              <p className="wm-desk__muted">Loading tape for {tradingViewSymbolLabel(symbol)}…</p>
            </div>
          )}

          <div className="wm-desk__card">
            <div className="wm-desk__card-h wm-desk__card-h--row">
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" />
                {skillProfile.level.label}
              </span>
              <em className="wm-desk__xp">{skillProfile.xp} XP</em>
            </div>
            <div className="wm-desk__bars">
              {(
                [
                  ['Reading', skillProfile.scores.marketReading],
                  ['Timing', skillProfile.scores.entryTiming],
                  ['Risk', skillProfile.scores.riskManagement],
                  ['Patience', skillProfile.scores.patience],
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="wm-desk__bar">
                  <span>
                    {label} <b>{val}</b>
                  </span>
                  <i style={{ width: `${val}%` }} />
                </div>
              ))}
            </div>
            <p className="wm-desk__focus">
              Focus: {skillProfile.weakness}. {skillProfile.focusWeek[0]}
            </p>
            <button type="button" className="wm-desk__plan" onClick={sendTrainingPlan} disabled={busy}>
              Build 7-day path
            </button>
            <div className="wm-desk__ach">
              {skillProfile.achievements.map((a) => (
                <span
                  key={a.id}
                  className={`wm-desk__badge-sm ${a.earned ? 'wm-desk__badge-sm--on' : ''}`}
                  title={a.detail}
                >
                  {a.label}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <section className="wm-desk__quiz" aria-label="Decision quiz">
        {activeDrill ? (
          <>
            <div className="wm-desk__quiz-h">
              <Target className="h-4 w-4" />
              <span>Decision quiz</span>
              <button type="button" className="wm-desk__dismiss" onClick={() => setActiveDrill(null)}>
                Skip
              </button>
            </div>
            <p className="wm-desk__quiz-q">{activeDrill.question}</p>
            <div className="wm-desk__opts">
              {activeDrill.options.map((o) => (
                <button key={o.id} type="button" disabled={busy} onClick={() => answerDrill(o.id)}>
                  {o.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="wm-desk__quiz-idle">
            <p>Next chart quiz loads automatically — or punch one now.</p>
            <button type="button" onClick={punchQuiz} disabled={!detective || busy}>
              <Target className="h-4 w-4" />
              Punch quiz
            </button>
          </div>
        )}
      </section>

      <section className="wm-desk__coach" aria-live="polite">
        <div className="wm-desk__coach-h">{coachTitle}</div>
        <div className={`wm-desk__coach-body ${busy ? 'wm-desk__coach-body--busy' : ''}`}>
          <ChatMarkdown text={coachNote} />
        </div>
      </section>
    </div>
  );
}
