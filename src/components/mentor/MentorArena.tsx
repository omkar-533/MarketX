import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Flame,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  ARENA_ROUND_SECONDS,
  ARENA_ROUND_SIZE,
  arenaRankTitle,
  loadArenaStats,
  recordArenaRound,
  scoreArenaHit,
  touchArenaStreak,
  type ArenaStats,
} from '../../services/mentorArena';
import {
  buildDrillChartMarks,
  buildDrillFromDetective,
  isDrillAnswerCorrect,
  saveDrillResult,
  type DetectiveCard,
  type MentorDrill,
} from '../../services/mentorDrills';
import { buildTraderSkillProfile } from '../../services/traderSkillProfile';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';

type Phase = 'lobby' | 'round' | 'result';

type Feedback = {
  correct: boolean;
  xp: number;
  combo: number;
  label: string;
} | null;

type MentorArenaProps = {
  ownerKey: string;
  detective: DetectiveCard | null;
  studentName: string;
  onOpenCurriculum: () => void;
  onOpenLab: () => void;
  onRoundTeach: (summary: string) => void;
  /** Paint the quiz context on the live chart (zones / swings) as soon as Q shows. */
  onChartMarks: (levels: ChartLevel[], shapes: ChartShape[]) => void;
};

export default function MentorArena({
  ownerKey,
  detective,
  studentName,
  onOpenCurriculum,
  onOpenLab,
  onRoundTeach,
  onChartMarks,
}: MentorArenaProps) {
  const [stats, setStats] = useState<ArenaStats>(() => loadArenaStats(ownerKey));
  const [phase, setPhase] = useState<Phase>('lobby');
  const [drill, setDrill] = useState<MentorDrill | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [comboMax, setComboMax] = useState(0);
  const [xpRound, setXpRound] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(ARENA_ROUND_SECONDS);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [locked, setLocked] = useState(false);
  const [lastResult, setLastResult] = useState<{
    correct: number;
    total: number;
    xp: number;
    comboMax: number;
    timedOut: boolean;
  } | null>(null);

  const skill = useMemo(
    () => buildTraderSkillProfile(ownerKey),
    [ownerKey, stats.totalCorrect, stats.roundsPlayed],
  );

  useEffect(() => {
    setStats(loadArenaStats(ownerKey));
  }, [ownerKey]);

  const nextDrill = useCallback(() => {
    if (!detective) return null;
    return buildDrillFromDetective(detective, 'auto');
  }, [detective]);

  // Every question paints its lesson on the chart — no blank “premium zone” quiz.
  useEffect(() => {
    if (phase === 'round' && drill && detective) {
      const marks = buildDrillChartMarks(detective, drill);
      onChartMarks(marks.levels, marks.shapes);
      return;
    }
    if (phase === 'lobby') onChartMarks([], []);
  }, [phase, drill, detective, onChartMarks]);

  const finishRound = useCallback(
    (timedOut: boolean, correct: number, total: number, maxCombo: number, xp: number) => {
      const recorded = recordArenaRound(
        {
          correct,
          total,
          comboMax: maxCombo,
          xpEarned: xp,
          timedOut,
        },
        ownerKey,
      );
      setStats(recorded);
      setLastResult({
        correct,
        total,
        xp: xp + (correct === total && total >= ARENA_ROUND_SIZE ? 15 : 0),
        comboMax: maxCombo,
        timedOut,
      });
      setPhase('result');
      setDrill(null);
      const summary = [
        `[ARENA ROUND RESULT] ${correct}/${total} correct.`,
        timedOut ? 'Timer ended.' : 'Round cleared.',
        `Max combo x${maxCombo}.`,
        'Give a 4-line hype + one process tip from the tape. Draw one lesson on chart if useful. No Entry/Stop/Target.',
      ].join(' ');
      onRoundTeach(summary);
    },
    [ownerKey, onRoundTeach],
  );

  const startRound = () => {
    if (!detective) return;
    const first = nextDrill();
    if (!first) return;
    touchArenaStreak(ownerKey);
    setStats(loadArenaStats(ownerKey));
    setPhase('round');
    setDrill(first);
    setQIndex(0);
    setCorrectCount(0);
    setCombo(0);
    setComboMax(0);
    setXpRound(0);
    setSecondsLeft(ARENA_ROUND_SECONDS);
    setFeedback(null);
    setLocked(false);
    setLastResult(null);
  };

  useEffect(() => {
    if (phase !== 'round') return;
    if (secondsLeft <= 0) {
      finishRound(true, correctCount, Math.max(qIndex, 1), comboMax, xpRound);
      return;
    }
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [phase, secondsLeft, correctCount, qIndex, comboMax, xpRound, finishRound]);

  const pickOption = (optionId: string) => {
    if (!drill || locked || phase !== 'round') return;
    setLocked(true);
    const ok = isDrillAnswerCorrect(drill, optionId);
    saveDrillResult(
      {
        drillId: drill.id,
        chosenId: optionId,
        correct: ok,
        at: new Date().toISOString(),
        symbol: drill.symbol,
      },
      ownerKey,
    );
    const scored = scoreArenaHit(combo, ok);
    const nextCorrect = correctCount + (ok ? 1 : 0);
    const nextCombo = scored.nextCombo;
    const nextXp = xpRound + scored.xp;
    const nextMax = Math.max(comboMax, nextCombo);
    setCorrectCount(nextCorrect);
    setCombo(nextCombo);
    setComboMax(nextMax);
    setXpRound(nextXp);
    setFeedback({
      correct: ok,
      xp: scored.xp,
      combo: nextCombo,
      label: ok
        ? nextCombo >= 2
          ? `Clean · Combo x${nextCombo}`
          : 'Process locked in'
        : 'Mistake · reset combo',
    });

    window.setTimeout(() => {
      setFeedback(null);
      const nextQ = qIndex + 1;
      if (nextQ >= ARENA_ROUND_SIZE) {
        finishRound(false, nextCorrect, ARENA_ROUND_SIZE, nextMax, nextXp);
        return;
      }
      const d = nextDrill();
      setDrill(d);
      setQIndex(nextQ);
      setLocked(false);
    }, 900);
  };

  const timerPct = Math.max(0, (secondsLeft / ARENA_ROUND_SECONDS) * 100);
  const rank = arenaRankTitle(stats);

  return (
    <div className="wm-arena">
      <div className="wm-arena__hud">
        <div className="wm-arena__hud-main">
          <p className="wm-arena__eyebrow">Wolf Mentor Arena</p>
          <h2 className="wm-arena__title">
            {studentName}, <span>game on</span>
          </h2>
          <p className="wm-arena__lead">
            75-second process rounds · live tape · combo XP · bilkul game jaisa training
          </p>
        </div>
        <div className="wm-arena__stats">
          <div className="wm-arena__stat">
            <Flame className="h-4 w-4" />
            <div>
              <b>{stats.streakDays}d</b>
              <span>Streak</span>
            </div>
          </div>
          <div className="wm-arena__stat">
            <Zap className="h-4 w-4" />
            <div>
              <b>{stats.todayXp}</b>
              <span>Today XP</span>
            </div>
          </div>
          <div className="wm-arena__stat">
            <Trophy className="h-4 w-4" />
            <div>
              <b>{rank}</b>
              <span>{skill.xp} desk XP</span>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'lobby' ? (
          <motion.div
            key="lobby"
            className="wm-arena__panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="wm-arena__quest">
              <Sparkles className="h-4 w-4" />
              <div>
                <b>Daily quest</b>
                <p>1 Arena round + 1 Curriculum step clear karo — streak safe rahegi.</p>
              </div>
            </div>

            <button
              type="button"
              className="wm-arena__play"
              onClick={startRound}
              disabled={!detective}
            >
              <Play className="h-5 w-5" />
              <span>
                <strong>Play Round</strong>
                <small>
                  {ARENA_ROUND_SIZE} checks · {ARENA_ROUND_SECONDS}s ·{' '}
                  {detective ? 'tape ready' : 'loading tape…'}
                </small>
              </span>
            </button>

            <div className="wm-arena__quick">
              <button type="button" className="wm-arena__chip" onClick={onOpenCurriculum}>
                <Target className="h-3.5 w-3.5" />
                Curriculum path
              </button>
              <button type="button" className="wm-arena__chip" onClick={onOpenLab}>
                <RotateCcw className="h-3.5 w-3.5" />
                Lab challenge
              </button>
            </div>

            <ul className="wm-arena__tips">
              <li>Sahi answer = XP + combo</li>
              <li>Galat = combo toot jaati hai</li>
              <li>3/3 perfect = bonus XP blast</li>
            </ul>
          </motion.div>
        ) : null}

        {phase === 'round' && drill ? (
          <motion.div
            key="round"
            className="wm-arena__panel wm-arena__panel--fight"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
          >
            <div className="wm-arena__round-top">
              <span>
                Q{qIndex + 1}/{ARENA_ROUND_SIZE}
              </span>
              <span className={combo >= 2 ? 'wm-arena__combo wm-arena__combo--hot' : 'wm-arena__combo'}>
                <Flame className="h-3.5 w-3.5" />
                x{combo}
              </span>
              <span className="wm-arena__clock">{secondsLeft}s</span>
            </div>
            <div className="wm-arena__timer">
              <i style={{ width: `${timerPct}%` }} />
            </div>
            <p className="wm-arena__q">{drill.question}</p>
            <p className="wm-arena__hint">Chart pe zone / swings mark ho chuke hain — pehle wahan dekho, phir answer do.</p>
            <div className="wm-arena__opts">
              {drill.options.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={locked}
                  className="wm-arena__opt"
                  onClick={() => pickOption(o.id)}
                >
                  <em>{String.fromCharCode(65 + i)}</em>
                  {o.label}
                </button>
              ))}
            </div>

            <AnimatePresence>
              {feedback ? (
                <motion.div
                  key="fb"
                  className={`wm-arena__flash ${
                    feedback.correct ? 'wm-arena__flash--ok' : 'wm-arena__flash--bad'
                  }`}
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <b>{feedback.label}</b>
                  {feedback.xp > 0 ? <span>+{feedback.xp} XP</span> : <span>Focus · next</span>}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}

        {phase === 'result' && lastResult ? (
          <motion.div
            key="result"
            className="wm-arena__panel wm-arena__panel--result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="wm-arena__result-badge">
              {lastResult.correct === lastResult.total ? 'PERFECT ROUND' : 'ROUND OVER'}
            </div>
            <h3 className="wm-arena__result-score">
              {lastResult.correct}/{lastResult.total}
            </h3>
            <p className="wm-arena__result-sub">
              +{lastResult.xp} XP · max combo x{lastResult.comboMax}
              {lastResult.timedOut ? ' · timer hit' : ''}
            </p>
            <div className="wm-arena__result-actions">
              <button type="button" className="wm-arena__play wm-arena__play--sm" onClick={startRound}>
                <Play className="h-4 w-4" />
                Play again
              </button>
              <button type="button" className="wm-arena__chip" onClick={onOpenCurriculum}>
                Continue learning
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
