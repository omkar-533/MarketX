import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BookOpen,
  Brain,
  BrainCircuit,
  Check,
  ChevronDown,
  FlaskConical,
  GraduationCap,
  HelpCircle,
  History,
  Languages,
  Mic2,
  Pencil,
  RefreshCw,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import ChatMarkdown from './ChatMarkdown';
import ChatChartPanel from './masterai/ChatChartPanel';
import MentorOnboarding from './mentor/MentorOnboarding';
import MentorRoadmap from './mentor/MentorRoadmap';
import LessonPlayer from './mentor/LessonPlayer';
import ChartMentorPanel from './mentor/ChartMentorPanel';
import PerformanceCoachPanel from './mentor/PerformanceCoachPanel';
import TradingLabPanel from './mentor/TradingLabPanel';
import LiveMentorPanel from './mentor/LiveMentorPanel';
import TradingMasterPanel from './mentor/TradingMasterPanel';
import MentorEcosystemBar from './mentor/MentorEcosystemBar';
import MentorArena from './mentor/MentorArena';
import { useAuth } from '../hooks/useAuth';
import {
  buildEcosystemSnapshot,
  type MentordeskView,
  type MentorHandoff,
} from '../services/mentorBridge';
import {
  MENTOR_MODES,
  loadMentorMode,
  mentorModeLabel,
  saveMentorMode,
  type MentorMode,
} from '../services/mentorModes';
import {
  loadCurriculumProgress,
  saveCurriculumProgress,
  type CurriculumProgress,
} from '../services/mentorCurriculum';
import {
  loadStudentProfile,
  saveStudentProfile,
  type MentorStudentProfile,
} from '../services/mentorStudentProfile';
import {
  buildDrillChartMarks,
  buildDrillFromDetective,
  gradePromptForDrill,
  isDrillAnswerCorrect,
  saveDrillResult,
  type DetectiveCard,
  type DrillBias,
  type MentorDrill,
} from '../services/mentorDrills';
import { fetchMentorDetective } from '../services/mentorDetective';
import {
  buildTraderSkillProfile,
  trainingPlanPrompt,
} from '../services/traderSkillProfile';
import {
  MASTER_AI_LANGUAGES,
  MASTER_AI_MODEL_ID,
  askMasterAi,
  buildMasterMarketContext,
  fetchMasterAiStatus,
  getMasterAiLanguage,
  isHinglishLang,
  loadLanguageMode,
  loadSelectedLanguage,
  saveLanguageMode,
  saveSelectedLanguage,
  type MasterAiLangCode,
  type MasterAiLangMode,
  type MasterAiLanguage,
} from '../services/masterAiService';
import { consumeHunterPendingPrompt } from '../services/journalAiAssist';
import { API_SERVER_READY_EVENT } from '../services/apiAutoConnect';
import { OPENROUTER_KEY_UPDATED_EVENT } from '../services/openRouterKey';
import { parseChartAnnotations, type ChartLevel, type ChartShape } from '../utils/chartAnnotations';
import type { TvInterval } from '../utils/tradingViewSymbols';
import { tradingViewSymbolLabel } from '../utils/tradingViewSymbols';

const WOLF_MENTOR = 'Wolf Mentor';

/**
 * Wolf Mentor — professional training desk (not a chatbot).
 * Chart + process checks + mentor briefings. Hunter / Wolf AI stays separate for analysis.
 */
export default function MentorAI() {
  const { user } = useAuth();
  const ownerKey = user?.id || user?.email || 'guest';
  const initialMode = loadLanguageMode();
  const initialLang =
    initialMode === 'auto'
      ? getMasterAiLanguage(loadSelectedLanguage())
      : getMasterAiLanguage(initialMode);

  const [langMode, setLangMode] = useState<MasterAiLangMode>(initialMode);
  const [selectedLang, setSelectedLang] = useState<MasterAiLanguage>(initialLang);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [langQuery, setLangQuery] = useState('');
  const langMenuRef = useRef<HTMLDivElement>(null);

  const [mentorMode, setMentorMode] = useState<MentorMode>(loadMentorMode);
  // Arena first — game loop holds attention; curriculum stays one tap away.
  const [deskView, setDeskView] = useState<MentordeskView>('arena');
  const [arenaPlaying, setArenaPlaying] = useState(false);
  const [student, setStudent] = useState<MentorStudentProfile | null>(() => loadStudentProfile(ownerKey));
  const [curriculum, setCurriculum] = useState<CurriculumProgress>(() => loadCurriculumProgress(ownerKey));
  const [activeLevelId, setActiveLevelId] = useState<number | null>(null);
  const [labHandoff, setLabHandoff] = useState<MentorHandoff | null>(null);
  const [drillBias, setDrillBias] = useState<DrillBias>('auto');
  const [symbol, setSymbol] = useState('NSE:NIFTY');
  const [interval, setInterval] = useState<TvInterval>('15');
  const [study, setStudy] = useState('none');
  const [chartLevels, setChartLevels] = useState<ChartLevel[]>([]);
  const [chartShapes, setChartShapes] = useState<ChartShape[]>([]);
  const [detective, setDetective] = useState<DetectiveCard | null>(null);
  const [activeDrill, setActiveDrill] = useState<MentorDrill | null>(null);
  const [coachNote, setCoachNote] = useState(
    'Wolf Mentor intake ready. We train process from live tape and historical structure — Areas of Interest only. No Entry, Stop, Target, or trade calls.',
  );
  const [coachTitle, setCoachTitle] = useState('Mentor briefing');
  const [busy, setBusy] = useState(false);
  const [skillTick, setSkillTick] = useState(0);
  const [aiOk, setAiOk] = useState(false);
  const gradingRef = useRef(false);

  useEffect(() => {
    setStudent(loadStudentProfile(ownerKey));
    setCurriculum(loadCurriculumProgress(ownerKey));
  }, [ownerKey]);

  const persistCurriculum = useCallback(
    (next: CurriculumProgress) => {
      saveCurriculumProgress(next, ownerKey);
      setCurriculum(next);
      setSkillTick((n) => n + 1);
    },
    [ownerKey],
  );

  const effectiveBias: DrillBias =
    drillBias !== 'auto' ? drillBias : mentorMode === 'beginner' ? 'teach' : 'auto';

  const langGroups = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    const match = (l: MasterAiLanguage) =>
      !q ||
      l.name.toLowerCase().includes(q) ||
      l.nativeLabel.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q);
    return [
      { id: 'popular', label: 'Popular', items: MASTER_AI_LANGUAGES.filter((l) => l.group === 'popular' && match(l)) },
      { id: 'india', label: 'India & South Asia', items: MASTER_AI_LANGUAGES.filter((l) => l.group === 'india' && match(l)) },
      { id: 'world', label: 'World', items: MASTER_AI_LANGUAGES.filter((l) => l.group === 'world' && match(l)) },
    ].filter((g) => g.items.length > 0);
  }, [langQuery]);

  const onLanguageChange = (value: string) => {
    if (value === 'auto') {
      setLangMode('auto');
      saveLanguageMode('auto');
      setLangMenuOpen(false);
      setLangQuery('');
      return;
    }
    const code = value as MasterAiLangCode;
    const next = getMasterAiLanguage(code);
    setLangMode(code);
    setSelectedLang(next);
    saveLanguageMode(code);
    saveSelectedLanguage(code);
    setLangMenuOpen(false);
    setLangQuery('');
  };

  useEffect(() => {
    if (!langMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!langMenuRef.current?.contains(e.target as Node)) {
        setLangMenuOpen(false);
        setLangQuery('');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLangMenuOpen(false);
        setLangQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [langMenuOpen]);

  const skillProfile = useMemo(
    () => buildTraderSkillProfile(ownerKey, user),
    [ownerKey, user, skillTick],
  );

  const ecosystem = useMemo(
    () =>
      buildEcosystemSnapshot({
        ownerKey,
        weakness: skillProfile.weakness,
        curriculumLevel: curriculum.highestUnlocked,
        coachOverall: Math.round(
          (skillProfile.scores.patience + skillProfile.scores.riskManagement) / 2,
        ),
        dnaOverall: Math.round(
          (skillProfile.scores.marketReading + skillProfile.scores.entryTiming) / 2,
        ),
      }),
    [ownerKey, skillProfile, curriculum.highestUnlocked, skillTick],
  );

  const applyHandoff = useCallback((handoff: MentorHandoff) => {
    setDeskView(handoff.view);
    if (handoff.view === 'curriculum') {
      setActiveLevelId(handoff.levelId ?? null);
    } else {
      setActiveLevelId(null);
    }
    if (handoff.view === 'lab') {
      setLabHandoff(handoff);
    } else {
      setLabHandoff(null);
    }
    setSkillTick((n) => n + 1);
  }, []);

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

  // Live desk only — curriculum mode uses LessonPlayer quizzes.
  useEffect(() => {
    if (deskView !== 'desk' || !detective || activeDrill || busy) return;
    const t = window.setTimeout(() => {
      setActiveDrill(buildDrillFromDetective(detective, effectiveBias));
    }, 6_000);
    return () => window.clearTimeout(t);
  }, [deskView, detective?.symbol, detective?.ltp, detective?.zone, activeDrill, busy, effectiveBias]);

  // Live desk process checks also need chart drawings with the question.
  useEffect(() => {
    if (deskView !== 'desk' || !activeDrill || !detective) return;
    const marks = buildDrillChartMarks(detective, activeDrill);
    setChartLevels(marks.levels);
    setChartShapes(marks.shapes);
  }, [deskView, activeDrill, detective]);

  useEffect(() => {
    if (deskView !== 'desk' || !detective || busy) return;
    const t = window.setInterval(() => {
      setActiveDrill((prev) => prev ?? buildDrillFromDetective(detective, effectiveBias));
    }, 40_000);
    return () => window.clearInterval(t);
  }, [deskView, detective, busy, effectiveBias]);

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
    u.lang = isHinglishLang(selectedLang.code) ? 'hi-IN' : selectedLang.code;
    const voices = window.speechSynthesis.getVoices();
    const prefix = selectedLang.code.slice(0, 2);
    const preferred =
      voices.find((v) => v.lang === selectedLang.code) ??
      voices.find((v) => v.lang.startsWith(prefix)) ??
      voices.find((v) => v.lang.startsWith('hi'));
    if (preferred) u.voice = preferred;
    window.speechSynthesis.speak(u);
  }, [detective, selectedLang.code]);

  const askCoach = useCallback(
    async (message: string, opts?: { trainingGrade?: boolean; title?: string }) => {
      if (gradingRef.current) return;
      gradingRef.current = true;
      setBusy(true);
      setCoachTitle(opts?.title || 'Mentor briefing');
      setCoachNote(
        langMode === 'auto' || isHinglishLang(selectedLang.code)
          ? 'Desk tape padh raha hoon…'
          : 'Reading desk tape…',
      );
      try {
        const ctx = buildMasterMarketContext();
        const chartHint = `[CHART OPEN ON WOLF MENTOR DESK: ${tradingViewSymbolLabel(symbol)} · ${interval}. Train from LIVE + HISTORICAL MARKET INTEL. Draw lessons with wolfchart. Process only. Reply in ${selectedLang.replyIn}.]`;
        const result = await askMasterAi(
          {
            message: `${message}\n\n${chartHint}`,
            model: MASTER_AI_MODEL_ID,
            lang: selectedLang.code,
            langName: selectedLang.name,
            langMode,
            mentorMode,
            mentorDesk: true,
            trainingGrade: Boolean(opts?.trainingGrade),
            history: [],
          },
          ctx,
        );
        const parsed = parseChartAnnotations(String(result.reply || ''));
        if (parsed.levels.length || parsed.shapes.length) {
          setChartLevels(parsed.levels);
          setChartShapes(parsed.shapes);
        }
        setCoachNote(
          parsed.text.trim() ||
            (parsed.levels.length || parsed.shapes.length
              ? 'Lesson marked on the chart — study the drawing.'
              : 'No briefing returned — run a process check again.'),
        );
      } catch {
        setCoachNote('Wolf Mentor could not reach the mentor engine. Check your AI key in Profile, then retry.');
      } finally {
        gradingRef.current = false;
        setBusy(false);
      }
    },
    [symbol, interval, selectedLang, langMode, mentorMode],
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
    const gradeMsg = gradePromptForDrill(activeDrill, chosen, optionId, correct);
    setActiveDrill(null);
    void askCoach(gradeMsg, {
      trainingGrade: true,
      title: correct ? 'Process check · Correct' : 'Process check · Mistake',
    });
  };

  const punchQuiz = (bias: DrillBias = effectiveBias) => {
    if (detective) setActiveDrill(buildDrillFromDetective(detective, bias));
  };

  const quizFromChart = () => {
    void askCoach(
      '[MENTOR AUTO-QUIZ] Look at MARKET INTEL for the open chart and ask me ONE short process question about LIVE tape OR a HISTORICAL swing/event (bars-ago). Do not reveal the ideal answer yet. No Entry/Stop/Target.',
      { title: 'Process check · Chart' },
    );
  };

  const historyQuiz = () => {
    setDrillBias('historical');
    if (detective) setActiveDrill(buildDrillFromDetective(detective, 'historical'));
    void askCoach(
      '[MENTOR HISTORY-QUIZ] Using MARKET INTEL historical swings/events, ask me ONE question about a past structure mark on this chart. Do not answer yet.',
      { title: 'Process check · History' },
    );
  };

  const teachMe = () => {
    setDrillBias('teach');
    setMentorMode('beginner');
    saveMentorMode('beginner');
    void askCoach(
      '[MENTOR TEACH] I am new to trading. Teach me one core idea from this open chart (structure or liquidity) in simple steps, name common mistakes beginners make, DRAW it on the chart with wolfchart, then ask one check question. No Entry/Stop/Target.',
      { title: 'Mentor lesson' },
    );
  };

  const sendTrainingPlan = () => {
    void askCoach(trainingPlanPrompt(skillProfile), { title: '7-day mentor path' });
  };

  const scopeLabel =
    activeDrill?.scope === 'historical'
      ? 'Historical'
      : activeDrill?.scope === 'teach'
        ? 'Lesson'
        : 'Live tape';

  const tfLabel =
    interval === 'D' || interval === 'W' || interval === 'M' ? interval : `${interval}m`;
  const sessionLine = !student
    ? 'Module 1 AI Teacher · complete onboarding to unlock your roadmap'
    : deskView === 'arena'
      ? `Arena · ${student.name} · timed process rounds · combo XP`
      : deskView === 'curriculum'
      ? `Module 1 · ${student.name} · Level ${curriculum.highestUnlocked}/12 unlocked`
      : deskView === 'chart'
        ? `Module 2 Chart Mentor · ${tradingViewSymbolLabel(symbol)} · ${tfLabel}`
        : deskView === 'coach'
          ? `Module 3 Performance Coach · ${student.name} · journal habits & psychology`
          : deskView === 'lab'
            ? `Module 4 Trading Lab · ${student.name} · historical replay simulator`
            : deskView === 'liveMentor'
              ? `Module 5 Live Mentor · ${student.name} · real-market process coach`
              : deskView === 'master'
                ? `Module 6 Trading Master · ${student.name} · personal trading brain`
                : aiOk
                  ? `${mentorModeLabel(mentorMode)} · ${tradingViewSymbolLabel(symbol)} · ${tfLabel} · Live tape${
                      langMode === 'auto' ? ` · Auto · ${selectedLang.nativeLabel}` : ` · ${selectedLang.nativeLabel}`
                    }`
                  : 'Add AI key in Profile to grade process checks';

  const onOnboarded = (profile: MentorStudentProfile) => {
    saveStudentProfile(profile, ownerKey);
    setStudent(profile);
    if (profile.experience === 'none' || profile.experience === 'beginner') {
      setMentorMode('beginner');
      saveMentorMode('beginner');
    }
    setDeskView('arena');
    setActiveLevelId(null);
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
              <span className="wm-desk__badge">
                {deskView === 'arena'
                  ? 'Arena · Play'
                  : deskView === 'curriculum'
                  ? 'AI Teacher · Module 1'
                  : deskView === 'chart'
                    ? 'Chart Mentor · Module 2'
                    : deskView === 'coach'
                      ? 'Performance Coach · Module 3'
                      : deskView === 'lab'
                        ? 'Trading Lab · Module 4'
                        : deskView === 'liveMentor'
                          ? 'Live Mentor · Module 5'
                          : deskView === 'master'
                            ? 'Trading Master · Module 6'
                            : 'Professional Mentor'}
              </span>
            </div>
            <p className="wm-desk__sub">{sessionLine}</p>
          </div>
        </div>

        <div className="wm-desk__actions">
          <div className={`mai-chat__lang wm-desk__lang ${langMenuOpen ? 'mai-chat__lang--open' : ''}`} ref={langMenuRef}>
            <button
              type="button"
              className={`wm-desk__chip ${langMenuOpen ? 'wm-desk__chip--on' : ''}`}
              onClick={() => setLangMenuOpen((o) => !o)}
              aria-label="Mentor language"
              aria-expanded={langMenuOpen}
              aria-haspopup="listbox"
              title="Same language list as Wolf AI / Hunter"
            >
              <Languages className="h-3.5 w-3.5 shrink-0" />
              <span>
                {langMode === 'auto' ? `Auto · ${selectedLang.nativeLabel}` : selectedLang.nativeLabel}
              </span>
              <ChevronDown className={`h-3 w-3 ${langMenuOpen ? 'wm-desk__chevron--up' : ''}`} />
            </button>

            <AnimatePresence>
              {langMenuOpen ? (
                <motion.div
                  className="mai-chat__lang-menu"
                  role="listbox"
                  aria-label="Select mentor language"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                >
                  <div className="mai-chat__lang-glow" aria-hidden />
                  <div className="mai-chat__lang-head">
                    <div className="mai-chat__lang-head-title">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Mentor language</span>
                    </div>
                    <input
                      type="search"
                      className="mai-chat__lang-search"
                      placeholder="Search language…"
                      value={langQuery}
                      onChange={(e) => setLangQuery(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="mai-chat__lang-scroll">
                    <button
                      type="button"
                      role="option"
                      aria-selected={langMode === 'auto'}
                      className={`mai-chat__lang-item mai-chat__lang-item--auto ${langMode === 'auto' ? 'mai-chat__lang-item--on' : ''}`}
                      onClick={() => onLanguageChange('auto')}
                    >
                      <span className="mai-chat__lang-item-main">
                        <span className="mai-chat__lang-item-name">Auto detect</span>
                        <span className="mai-chat__lang-item-sub">
                          Matches your message · {selectedLang.nativeLabel}
                        </span>
                      </span>
                      {langMode === 'auto' ? <Check className="mai-chat__lang-check" /> : null}
                    </button>

                    {langGroups.map((group) => (
                      <div key={group.id} className="mai-chat__lang-group">
                        <div className="mai-chat__lang-group-label">{group.label}</div>
                        {group.items.map((l) => {
                          const on = langMode === l.code;
                          return (
                            <button
                              key={l.code}
                              type="button"
                              role="option"
                              aria-selected={on}
                              className={`mai-chat__lang-item ${on ? 'mai-chat__lang-item--on' : ''}`}
                              onClick={() => onLanguageChange(l.code)}
                            >
                              <span className="mai-chat__lang-item-main">
                                <span className="mai-chat__lang-item-name">{l.nativeLabel}</span>
                                <span className="mai-chat__lang-item-sub">{l.name}</span>
                              </span>
                              {on ? <Check className="mai-chat__lang-check" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ))}

                    {langGroups.length === 0 ? (
                      <p className="mai-chat__lang-empty">No language matched</p>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <button type="button" className="wm-desk__chip wm-desk__chip--ghost" onClick={speakBriefing} disabled={!detective}>
            <Mic2 className="h-3.5 w-3.5" />
            Brief
          </button>
        </div>
      </header>

      {student ? (
        <nav className="wm-desk__nav" aria-label="Mentor modules">
          <p className="wm-desk__nav-label">Arena se khelo · modules se seekho</p>
          <div className="wm-desk__nav-row">
            <button
              type="button"
              className={`wm-desk__nav-btn ${deskView === 'arena' ? 'wm-desk__nav-btn--on' : ''} wm-desk__nav-btn--start`}
              onClick={() => {
                setDeskView('arena');
                setActiveLevelId(null);
              }}
            >
              <Zap className="h-4 w-4" />
              <span>Arena</span>
              <small>PLAY NOW</small>
            </button>
            <button
              type="button"
              className={`wm-desk__nav-btn ${deskView === 'curriculum' ? 'wm-desk__nav-btn--on' : ''}`}
              onClick={() => {
                setDeskView('curriculum');
                setActiveLevelId(null);
              }}
            >
              <BookOpen className="h-4 w-4" />
              <span>1 · Curriculum</span>
              <small>levels</small>
            </button>
            <button
              type="button"
              className={`wm-desk__nav-btn ${deskView === 'chart' ? 'wm-desk__nav-btn--on' : ''}`}
              onClick={() => {
                setDeskView('chart');
                setActiveLevelId(null);
              }}
            >
              <Pencil className="h-4 w-4" />
              <span>2 · Chart</span>
            </button>
            <button
              type="button"
              className={`wm-desk__nav-btn ${deskView === 'coach' ? 'wm-desk__nav-btn--on' : ''}`}
              onClick={() => {
                setDeskView('coach');
                setActiveLevelId(null);
              }}
            >
              <Activity className="h-4 w-4" />
              <span>3 · Coach</span>
            </button>
            <button
              type="button"
              className={`wm-desk__nav-btn ${deskView === 'lab' ? 'wm-desk__nav-btn--on' : ''}`}
              onClick={() => {
                setDeskView('lab');
                setActiveLevelId(null);
              }}
            >
              <FlaskConical className="h-4 w-4" />
              <span>4 · Lab</span>
            </button>
            <button
              type="button"
              className={`wm-desk__nav-btn ${deskView === 'liveMentor' ? 'wm-desk__nav-btn--on' : ''}`}
              onClick={() => {
                setDeskView('liveMentor');
                setActiveLevelId(null);
              }}
            >
              <Shield className="h-4 w-4" />
              <span>5 · Live Mentor</span>
            </button>
            <button
              type="button"
              className={`wm-desk__nav-btn ${deskView === 'master' ? 'wm-desk__nav-btn--on' : ''}`}
              onClick={() => {
                setDeskView('master');
                setActiveLevelId(null);
              }}
            >
              <BrainCircuit className="h-4 w-4" />
              <span>6 · Master</span>
            </button>
            <button
              type="button"
              className={`wm-desk__nav-btn ${deskView === 'desk' ? 'wm-desk__nav-btn--on' : ''}`}
              onClick={() => setDeskView('desk')}
            >
              <Target className="h-4 w-4" />
              <span>Live desk</span>
              <small>baad mein</small>
            </button>
          </div>
          {deskView === 'desk' ? (
            <div className="wm-desk__modes wm-desk__modes--style" role="group" aria-label="Mentor style">
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
          ) : null}
        </nav>
      ) : null}

      {student ? (
        <MentorEcosystemBar
          snapshot={ecosystem}
          activeView={deskView}
          onOpen={applyHandoff}
        />
      ) : null}

      {!student ? (
        <MentorOnboarding
          defaultName={user?.name || ''}
          defaultLanguage={selectedLang.code.startsWith('hi') ? 'hi-IN' : 'en-IN'}
          onComplete={onOnboarded}
        />
      ) : deskView === 'arena' ? (
        <div
          className={`wm-desk__body wm-desk__body--arena ${arenaPlaying ? 'wm-desk__body--arena-live wm-desk__body--empire' : ''}`}
        >
          {!arenaPlaying ? (
            <section className="wm-desk__chart" aria-label="Arena chart">
              <ChatChartPanel
                symbol={symbol}
                interval={interval}
                study={study}
                onSymbolChange={(s) => {
                  setSymbol(s);
                  setChartLevels([]);
                  setChartShapes([]);
                }}
                onIntervalChange={(tf) => {
                  setInterval(tf);
                  setChartLevels([]);
                  setChartShapes([]);
                }}
                onStudyChange={setStudy}
                onClose={() => undefined}
                hideClose
                levels={chartLevels}
                shapes={chartShapes}
              />
            </section>
          ) : null}
          <aside className={`wm-desk__side wm-desk__side--arena ${arenaPlaying ? 'wm-desk__side--empire' : ''}`}>
            <MentorArena
              ownerKey={ownerKey}
              detective={detective}
              studentName={student.name}
              onOpenCurriculum={() => {
                setDeskView('curriculum');
                setActiveLevelId(null);
              }}
              onOpenLab={() =>
                applyHandoff({
                  view: 'lab',
                  labMissionId: 'mistake_replay',
                  labMode: 'challenge',
                  mistakeReplay: true,
                  reason: 'Arena → Lab challenge',
                })
              }
              onRoundTeach={(summary) => {
                void askCoach(summary, { title: 'Arena debrief', trainingGrade: true });
              }}
              onChartMarks={(levels, shapes) => {
                setChartLevels(levels);
                setChartShapes(shapes);
              }}
              onPlayingChange={setArenaPlaying}
            />
            {!arenaPlaying ? (
              <section className="wm-desk__coach wm-desk__coach--arena" aria-live="polite">
                <div className="wm-desk__coach-h">
                  <span className="wm-desk__coach-title">{coachTitle}</span>
                  {busy ? <span className="wm-desk__coach-busy">Working…</span> : null}
                </div>
                <div className={`wm-desk__coach-body ${busy ? 'wm-desk__coach-body--busy' : ''}`}>
                  <ChatMarkdown text={coachNote} />
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      ) : deskView === 'curriculum' && activeLevelId == null ? (
        <MentorRoadmap
          progress={curriculum}
          studentName={student.name}
          activeLevelId={activeLevelId}
          onOpenLevel={(id) => setActiveLevelId(id)}
          onNavigate={applyHandoff}
          onPlayArena={() => {
            setDeskView('arena');
            setActiveLevelId(null);
          }}
        />
      ) : null}

      {student && deskView === 'curriculum' && activeLevelId != null ? (
        <div className="wm-desk__body wm-desk__body--learn">
          <section className="wm-desk__chart" aria-label="Lesson chart">
            <ChatChartPanel
              symbol={symbol}
              interval={interval}
              study={study}
              onSymbolChange={(s) => {
                setSymbol(s);
                setChartLevels([]);
                setChartShapes([]);
              }}
              onIntervalChange={(tf) => {
                setInterval(tf);
                setChartLevels([]);
                setChartShapes([]);
              }}
              onStudyChange={setStudy}
              onClose={() => undefined}
              hideClose
              levels={chartLevels}
              shapes={chartShapes}
            />
            {(chartLevels.length > 0 || chartShapes.length > 0) && (
              <p className="wm-desk__draw-hint">
                <Pencil className="h-3 w-3" />
                Blackboard — mentor marks for this lesson.
              </p>
            )}
          </section>
          <aside className="wm-desk__side wm-desk__side--lesson">
            <LessonPlayer
              levelId={activeLevelId}
              ownerKey={ownerKey}
              profile={student}
              progress={curriculum}
              symbol={symbol}
              interval={interval}
              lang={selectedLang}
              langMode={langMode}
              mentorMode={mentorMode}
              onProgress={persistCurriculum}
              onChartMarks={(levels, shapes) => {
                setChartLevels(levels);
                setChartShapes(shapes);
              }}
              onBack={() => setActiveLevelId(null)}
              onPractical={() => {
                setDeskView('desk');
                punchQuiz('teach');
              }}
            />
          </aside>
        </div>
      ) : null}

      {student && deskView === 'chart' ? (
        <div className="wm-desk__body wm-desk__body--learn">
          <section className="wm-desk__chart" aria-label="Chart Mentor blackboard">
            <ChatChartPanel
              symbol={symbol}
              interval={interval}
              study={study}
              onSymbolChange={(s) => {
                setSymbol(s);
                setChartLevels([]);
                setChartShapes([]);
              }}
              onIntervalChange={(tf) => {
                setInterval(tf);
                setChartLevels([]);
                setChartShapes([]);
              }}
              onStudyChange={setStudy}
              onClose={() => undefined}
              hideClose
              levels={chartLevels}
              shapes={chartShapes}
            />
            {(chartLevels.length > 0 || chartShapes.length > 0) && (
              <p className="wm-desk__draw-hint">
                <Pencil className="h-3 w-3" />
                Chart Mentor blackboard — Areas of Interest only.
              </p>
            )}
          </section>
          <aside className="wm-desk__side wm-desk__side--lesson">
            <ChartMentorPanel
              symbol={symbol}
              interval={interval}
              profile={student}
              curriculum={curriculum}
              lang={selectedLang}
              langMode={langMode}
              mentorMode={mentorMode}
              onChartMarks={(levels, shapes) => {
                setChartLevels(levels);
                setChartShapes(shapes);
              }}
              onOpenCurriculumLevel={(levelId) => {
                setDeskView('curriculum');
                setActiveLevelId(levelId);
              }}
            />
          </aside>
        </div>
      ) : null}

      {student && deskView === 'coach' ? (
        <div className="wm-desk__body wm-desk__body--coach">
          <aside className="wm-desk__side wm-desk__side--lesson wm-desk__side--coach">
            <PerformanceCoachPanel
              ownerKey={ownerKey}
              user={user}
              profile={student}
              lang={selectedLang}
              langMode={langMode}
              mentorMode={mentorMode}
              onNavigate={applyHandoff}
            />
          </aside>
        </div>
      ) : null}

      {student && deskView === 'lab' ? (
        <div className="wm-desk__body wm-desk__body--lab">
          <aside className="wm-desk__side wm-desk__side--lesson wm-desk__side--lab">
            <TradingLabPanel
              ownerKey={ownerKey}
              profile={student}
              lang={selectedLang}
              langMode={langMode}
              mentorMode={mentorMode}
              handoff={labHandoff}
              onNavigate={applyHandoff}
              onHandoffConsumed={() => setLabHandoff(null)}
            />
          </aside>
        </div>
      ) : null}

      {student && deskView === 'liveMentor' ? (
        <div className="wm-desk__body wm-desk__body--live">
          <aside className="wm-desk__side wm-desk__side--lesson wm-desk__side--live">
            <LiveMentorPanel
              ownerKey={ownerKey}
              user={user}
              profile={student}
              symbol={symbol}
              interval={interval}
              lang={selectedLang}
              langMode={langMode}
              mentorMode={mentorMode}
              onNavigate={applyHandoff}
            />
          </aside>
        </div>
      ) : null}

      {student && deskView === 'master' ? (
        <div className="wm-desk__body wm-desk__body--master">
          <aside className="wm-desk__side wm-desk__side--lesson wm-desk__side--master">
            <TradingMasterPanel
              ownerKey={ownerKey}
              user={user}
              profile={student}
              lang={selectedLang}
              langMode={langMode}
              mentorMode={mentorMode}
              onNavigate={applyHandoff}
            />
          </aside>
        </div>
      ) : null}

      {student && deskView === 'desk' ? (
      <>
      <div className="wm-desk__rail" role="group" aria-label="Mentor session actions">
        <div className="wm-desk__rail-group">
          <span className="wm-desk__rail-label">Teach</span>
          <button
            type="button"
            className={`wm-desk__chip ${drillBias === 'teach' || mentorMode === 'beginner' ? 'wm-desk__chip--on' : ''}`}
            onClick={teachMe}
            disabled={busy}
            title="Explain from scratch + draw on chart"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Teach me
          </button>
        </div>
        <div className="wm-desk__rail-group">
          <span className="wm-desk__rail-label">Drill</span>
          <button
            type="button"
            className={`wm-desk__chip ${drillBias === 'historical' ? 'wm-desk__chip--on' : ''}`}
            onClick={historyQuiz}
            disabled={busy}
            title="Quiz from past swings / BOS-CHoCH"
          >
            <History className="h-3.5 w-3.5" />
            History
          </button>
          <button
            type="button"
            className="wm-desk__chip"
            onClick={() => punchQuiz(drillBias === 'auto' ? 'auto' : drillBias)}
            disabled={!detective || busy}
          >
            <Target className="h-3.5 w-3.5" />
            Next check
          </button>
          <button type="button" className="wm-desk__chip" onClick={quizFromChart} disabled={busy}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'wm-desk__spin' : ''}`} />
            Chart check
          </button>
        </div>
      </div>

      <div className="wm-desk__body">
        <section className="wm-desk__chart" aria-label="Training chart">
          <ChatChartPanel
            symbol={symbol}
            interval={interval}
            study={study}
            onSymbolChange={(s) => {
              setSymbol(s);
              setChartLevels([]);
              setChartShapes([]);
            }}
            onIntervalChange={(tf) => {
              setInterval(tf);
              setChartLevels([]);
              setChartShapes([]);
            }}
            onStudyChange={setStudy}
            onClose={() => undefined}
            hideClose
            levels={chartLevels}
            shapes={chartShapes}
          />
          {(chartLevels.length > 0 || chartShapes.length > 0) && (
            <p className="wm-desk__draw-hint">
              <Pencil className="h-3 w-3" />
              Mentor marks on chart — study live + historical structure.
            </p>
          )}
        </section>

        <aside className="wm-desk__side">
          <div className="wm-desk__card wm-desk__guide">
            <div className="wm-desk__card-h">Kaise use karein? (simple)</div>
            <ol className="wm-desk__guide-list">
              <li>
                <b>Curriculum</b> — pehle yahan se Level 1 padho + quiz pass karo
              </li>
              <li>
                <b>Chart Mentor</b> — chart samjho (Buy/Sell nahi, sirf process)
              </li>
              <li>
                <b>Lab</b> — bina paise risk ke practice
              </li>
              <li>
                <b>Coach / Live Mentor / Master</b> — habits, rules, DNA
              </li>
            </ol>
            <p className="wm-desk__muted">
              Aap abhi <b>Live desk</b> pe ho — ye advanced practice hai. Beginner ho to pehle
              Curriculum kholo.
            </p>
            <div className="wm-desk__guide-actions">
              <button
                type="button"
                className="wm-desk__plan"
                onClick={() =>
                  applyHandoff({
                    view: 'curriculum',
                    levelId: 1,
                    reason: 'Beginner start · Module 1 Level 1',
                  })
                }
              >
                Start Curriculum (Level 1)
              </button>
              <button
                type="button"
                className="wm-desk__chip"
                onClick={() => applyHandoff(ecosystem.next)}
              >
                Mentor OS · Next step
              </button>
            </div>
          </div>

          {detective ? (
            <div className="wm-desk__card">
              <div className="wm-desk__card-h">Desk read</div>
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
                  <span>Evidence</span>
                  <b>{detective.confidence}%</b>
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
              <div className="wm-desk__card-h">Desk read</div>
              <p className="wm-desk__muted">Loading tape for {tradingViewSymbolLabel(symbol)}…</p>
            </div>
          )}

          <div className="wm-desk__card">
            <div className="wm-desk__card-h wm-desk__card-h--row">
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" />
                Trader progression
              </span>
              <em className="wm-desk__xp">{skillProfile.xp} XP</em>
            </div>
            <p className="wm-desk__level">{skillProfile.level.label}</p>
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
              Build 7-day mentor path
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

      <section className="wm-desk__quiz" aria-label="Process check">
        {activeDrill ? (
          <>
            <div className="wm-desk__quiz-h">
              <Target className="h-4 w-4" />
              <span>Process check</span>
              <span className="wm-desk__scope">{scopeLabel}</span>
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
            <p className="wm-desk__muted">
              Mistakes get a clear “Mistake: …” critique and a drawing on the chart.
            </p>
          </>
        ) : (
          <div className="wm-desk__quiz-idle">
            <p>
              Process checks load from live and historical tape. Use Teach me for a full mentor lesson
              with chart drawings.
            </p>
            <div className="wm-desk__quiz-idle-actions">
              <button type="button" onClick={() => punchQuiz('live')} disabled={!detective || busy}>
                <Target className="h-4 w-4" />
                Live check
              </button>
              <button type="button" onClick={() => punchQuiz('historical')} disabled={!detective || busy}>
                <History className="h-4 w-4" />
                History check
              </button>
              <button type="button" onClick={() => punchQuiz('teach')} disabled={!detective || busy}>
                <BookOpen className="h-4 w-4" />
                Lesson check
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="wm-desk__coach" aria-live="polite">
        <div className="wm-desk__coach-h">
          <span className="wm-desk__coach-title">{coachTitle}</span>
          <span className="wm-desk__mode-pill">{mentorModeLabel(mentorMode)}</span>
          {busy ? <span className="wm-desk__coach-busy">Working…</span> : null}
        </div>
        <div className={`wm-desk__coach-body ${busy ? 'wm-desk__coach-body--busy' : ''}`}>
          <ChatMarkdown text={coachNote} />
        </div>
      </section>
      </>
      ) : null}
    </div>
  );
}
