import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Languages,
  Loader2,
  RefreshCw,
  Volume2,
  Zap,
} from 'lucide-react';
import ChatMarkdown from '../ChatMarkdown';
import {
  LESSON_STEPS,
  PASS_SCORE,
  buildLessonStepPrompt,
  getLevel,
  markStepDone,
  setHomeworkChecks,
  submitLevelQuiz,
  type CurriculumProgress,
  type LessonStepId,
} from '../../services/mentorCurriculum';
import { rememberWeakArea, type MentorStudentProfile } from '../../services/mentorStudentProfile';
import {
  MASTER_AI_MODEL_ID,
  askMasterAi,
  buildMasterMarketContext,
  type MasterAiLangMode,
  type MasterAiLanguage,
} from '../../services/masterAiService';
import { parseChartAnnotations, type ChartLevel, type ChartShape } from '../../utils/chartAnnotations';
import { tradingViewSymbolLabel, type TvInterval } from '../../utils/tradingViewSymbols';
import type { MentorMode } from '../../services/mentorModes';

type LessonPlayerProps = {
  levelId: number;
  ownerKey: string;
  profile: MentorStudentProfile;
  progress: CurriculumProgress;
  symbol: string;
  interval: TvInterval;
  lang: MasterAiLanguage;
  langMode: MasterAiLangMode;
  mentorMode: MentorMode;
  onProgress: (next: CurriculumProgress) => void;
  onChartMarks: (levels: ChartLevel[], shapes: ChartShape[]) => void;
  onBack: () => void;
  onPractical: () => void;
};

const ADAPT_CHIPS = [
  { id: 'again', label: 'Dubara samjhao', text: 'Explain again more clearly' },
  { id: 'easy', label: 'Easy language', text: 'Use easier simpler language' },
  { id: 'hindi', label: 'In Hindi', text: 'Explain in simple Hindi / Hinglish' },
  { id: 'chart', label: 'Real chart', text: 'Use the open chart more concretely' },
  { id: 'example', label: 'One more example', text: 'Give one more everyday + market example' },
] as const;

export default function LessonPlayer({
  levelId,
  ownerKey,
  profile,
  progress,
  symbol,
  interval,
  lang,
  langMode,
  mentorMode,
  onProgress,
  onChartMarks,
  onBack,
  onPractical,
}: LessonPlayerProps) {
  const level = getLevel(levelId);
  const [stepIdx, setStepIdx] = useState(0);
  const [note, setNote] = useState('Lesson loading…');
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [checks, setChecks] = useState<boolean[]>([]);
  const askToken = useRef(0);
  const loadedStep = useRef<string>('');

  const step = LESSON_STEPS[stepIdx] || LESSON_STEPS[0];
  const lp = progress.levels[levelId];

  useEffect(() => {
    if (!level) return;
    setChecks(lp?.homeworkChecked?.length ? [...lp.homeworkChecked] : level.homework.map(() => false));
    setAnswers({});
    setQuizResult(lp?.quizPassed ? { score: lp.quizScore ?? PASS_SCORE, passed: true } : null);
    const firstPending = LESSON_STEPS.findIndex((s) => !lp?.stepsDone?.includes(s.id));
    setStepIdx(firstPending >= 0 ? firstPending : 0);
    loadedStep.current = '';
  }, [levelId, level, lp?.quizPassed, lp?.quizScore]);

  const askStep = useCallback(
    async (adapt?: string) => {
      if (!level || !step.aiDriven) return;
      const token = ++askToken.current;
      setBusy(true);
      setNote(adapt ? 'Adapting the lesson…' : `Teaching: ${step.label}…`);
      try {
        const message = buildLessonStepPrompt(level, step, profile.name, adapt);
        const chartHint = `[CHART OPEN ON WOLF MENTOR DESK: ${tradingViewSymbolLabel(symbol)} · ${interval}. Curriculum lesson. Draw when required. Process only. Reply in ${lang.replyIn}.]`;
        const result = await askMasterAi(
          {
            message: `${message}\n\n${chartHint}`,
            model: MASTER_AI_MODEL_ID,
            lang: lang.code,
            langName: lang.name,
            langMode,
            mentorMode,
            mentorDesk: true,
            mentorLesson: {
              levelId: level.id,
              stepId: step.id,
              title: level.title,
            },
            history: [],
          },
          buildMasterMarketContext(),
        );
        if (token !== askToken.current) return;
        const parsed = parseChartAnnotations(String(result.reply || ''));
        if (parsed.levels.length || parsed.shapes.length) {
          onChartMarks(parsed.levels, parsed.shapes);
        }
        setNote(parsed.text.trim() || 'Lesson step ready — continue when you understand.');
        const next = markStepDone(progress, levelId, step.id);
        onProgress(next);
      } catch {
        if (token !== askToken.current) return;
        setNote('Could not reach the mentor engine. Check AI key in Profile, then retry.');
      } finally {
        if (token === askToken.current) setBusy(false);
      }
    },
    [
      level,
      step,
      profile.name,
      symbol,
      interval,
      lang,
      langMode,
      mentorMode,
      progress,
      levelId,
      onProgress,
      onChartMarks,
    ],
  );

  useEffect(() => {
    if (!level || !step.aiDriven) return;
    const key = `${levelId}:${step.id}`;
    if (loadedStep.current === key) return;
    loadedStep.current = key;
    void askStep();
  }, [levelId, step.id, level, step.aiDriven, askStep]);

  const score = useMemo(() => {
    if (!level) return 0;
    return level.quiz.reduce((n, q) => n + (answers[q.id] === q.correctId ? 1 : 0), 0);
  }, [answers, level]);

  const gradeQuiz = () => {
    if (!level) return;
    if (level.quiz.some((q) => !answers[q.id])) {
      setNote('Choose all 5 answers first.');
      return;
    }
    const { progress: next, passed } = submitLevelQuiz(progress, levelId, score);
    onProgress(next);
    setQuizResult({ score, passed });
    if (!passed) {
      rememberWeakArea(level.title, ownerKey);
      setNote(
        `Score ${score}/5 — you need ${PASS_SCORE} to pass. Weak topic saved: ${level.title}. Review again, then retry.`,
      );
    } else {
      setNote(
        score === 5
          ? '🔥 PERFECT — Level cleared! +40 XP. Next level unlocked.'
          : `✅ Pass (${score}/5) — next level unlocked. +25 XP. Review the notes, then continue.`,
      );
    }
  };

  const jumpToQuiz = () => {
    const quizIdx = LESSON_STEPS.findIndex((s) => s.id === 'quiz');
    if (quizIdx >= 0) setStepIdx(quizIdx);
  };

  const toggleHomework = (idx: number) => {
    if (!level) return;
    const nextChecks = checks.map((c, i) => (i === idx ? !c : c));
    setChecks(nextChecks);
    onProgress(setHomeworkChecks(progress, levelId, nextChecks));
  };

  const goNext = () => {
    if (step.id === 'quiz' && !quizResult?.passed && !(lp?.quizPassed)) {
      setNote('Pass the quiz (4/5) before continuing.');
      return;
    }
    if (step.id === 'practical') {
      onPractical();
      const next = markStepDone(progress, levelId, 'practical');
      onProgress(next);
      return;
    }
    setStepIdx((i) => Math.min(LESSON_STEPS.length - 1, i + 1));
  };

  const goPrev = () => setStepIdx((i) => Math.max(0, i - 1));

  const speak = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(note.replace(/[#*`]/g, ' ').slice(0, 900));
    u.lang = profile.language === 'hi-IN' || profile.language === 'hinglish' ? 'hi-IN' : 'en-IN';
    window.speechSynthesis.speak(u);
  };

  if (!level) {
    return (
      <div className="wm-learn">
        <p className="wm-learn__error">Level not found</p>
        <button type="button" className="wm-learn__cta" onClick={onBack}>
          Back to roadmap
        </button>
      </div>
    );
  }

  return (
    <div className="wm-learn wm-learn--lesson">
      <div className="wm-learn__lesson-top">
        <button type="button" className="wm-learn__back" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Roadmap
        </button>
        <div>
          <p className="wm-learn__eyebrow">
            Level {level.id} · {level.title}
          </p>
          <h2 className="wm-learn__title">
            Step {stepIdx + 1}/{LESSON_STEPS.length}: {step.label}
          </h2>
        </div>
        {step.id !== 'quiz' && !lp?.quizPassed ? (
          <button type="button" className="wm-learn__chip wm-learn__chip--play" onClick={jumpToQuiz}>
            <Zap className="h-3.5 w-3.5" />
            Skip to Quiz
          </button>
        ) : null}
      </div>

      <div className="wm-learn__stepper" role="list">
        {LESSON_STEPS.map((s, i) => {
          const done = lp?.stepsDone?.includes(s.id) || i < stepIdx;
          return (
            <button
              key={s.id}
              type="button"
              role="listitem"
              className={`wm-learn__step-dot ${i === stepIdx ? 'wm-learn__step-dot--on' : ''} ${
                done ? 'wm-learn__step-dot--done' : ''
              }`}
              title={s.label}
              onClick={() => {
                if (i <= stepIdx || lp?.stepsDone?.includes(LESSON_STEPS[i].id)) setStepIdx(i);
              }}
            >
              {done && i !== stepIdx ? <Check className="h-3 w-3" /> : i + 1}
            </button>
          );
        })}
      </div>

      {step.aiDriven ? (
        <>
          <div className="wm-learn__adapt">
            {ADAPT_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className="wm-learn__chip"
                disabled={busy}
                onClick={() => void askStep(c.text)}
              >
                {c.id === 'hindi' ? <Languages className="h-3 w-3" /> : null}
                {c.label}
              </button>
            ))}
            <button type="button" className="wm-learn__chip" disabled={busy} onClick={() => void askStep()}>
              <RefreshCw className={`h-3 w-3 ${busy ? 'wm-desk__spin' : ''}`} />
              Retry
            </button>
            <button type="button" className="wm-learn__chip" onClick={speak} disabled={busy}>
              <Volume2 className="h-3 w-3" />
              Voice
            </button>
          </div>
          <div className={`wm-learn__note ${busy ? 'wm-learn__note--busy' : ''}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin wm-learn__spin" /> : null}
            <ChatMarkdown text={note} />
          </div>
        </>
      ) : null}

      {step.id === 'quiz' ? (
        <div className="wm-learn__quiz">
          <p className="wm-learn__lead">
            End-of-level exam — {PASS_SCORE}/5 pass required to unlock Level {Math.min(12, levelId + 1)}.
          </p>
          {level.quiz.map((q, qi) => (
            <div key={q.id} className="wm-learn__q">
              <p>
                {qi + 1}. {q.question}
              </p>
              <div className="wm-learn__opts">
                {q.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`wm-learn__opt ${answers[q.id] === o.id ? 'wm-learn__opt--on' : ''}`}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                    disabled={Boolean(quizResult?.passed || lp?.quizPassed)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!quizResult?.passed && !lp?.quizPassed ? (
            <button type="button" className="wm-learn__cta" onClick={gradeQuiz}>
              Submit quiz ({Object.keys(answers).length}/5)
            </button>
          ) : (
            <p className="wm-learn__pass">
              Passed · score {quizResult?.score ?? lp?.quizScore}/{level.quiz.length}
            </p>
          )}
          {note && !step.aiDriven ? <p className="wm-learn__quiz-msg">{note}</p> : null}
        </div>
      ) : null}

      {step.id === 'homework' ? (
        <div className="wm-learn__homework">
          <p className="wm-learn__lead">Manual checklist (screenshot AI grading coming in Phase 2).</p>
          <ul>
            {level.homework.map((item, i) => (
              <li key={item}>
                <label>
                  <input type="checkbox" checked={Boolean(checks[i])} onChange={() => toggleHomework(i)} />
                  <span>{item}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step.id === 'practical' ? (
        <div className="wm-learn__practical">
          <p className="wm-learn__lead">
            Identify process on the open chart. A desk drill will run — Areas of Interest only.
          </p>
          <button
            type="button"
            className="wm-learn__cta"
            onClick={() => {
              const next = markStepDone(progress, levelId, 'practical' as LessonStepId);
              onProgress(next);
              onPractical();
            }}
          >
            Start practical on chart
          </button>
        </div>
      ) : null}

      <div className="wm-learn__nav">
        <button type="button" className="wm-learn__nav-btn" onClick={goPrev} disabled={stepIdx === 0 || busy}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <button
          type="button"
          className="wm-learn__nav-btn wm-learn__nav-btn--primary"
          onClick={goNext}
          disabled={busy}
        >
          {step.id === 'practical' ? 'Finish step' : 'Next'}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
