import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Flame,
  Heart,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  ARENA_LIVES,
  ARENA_MAX_WAVES,
  ARENA_Q_SECONDS,
  ARENA_WAVE_SIZE,
  arenaRankTitle,
  loadArenaStats,
  playArenaSfx,
  recordArenaRound,
  scoreArenaHit,
  touchArenaStreak,
  type ArenaStats,
} from '../../services/mentorArena';
import { buildArenaDrill, arenaTopicLabel } from '../../services/mentorArenaBank';
import {
  buildDrillChartMarks,
  historicalStructureDrill,
  isDrillAnswerCorrect,
  liveProcessDrill,
  saveDrillResult,
  type DetectiveCard,
  type MentorDrill,
} from '../../services/mentorDrills';
import { buildTraderSkillProfile } from '../../services/traderSkillProfile';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';

type Phase = 'lobby' | 'countdown' | 'fight' | 'waveClear' | 'result';

type Feedback = {
  correct: boolean;
  points: number;
  xp: number;
  combo: number;
  speedBonus: number;
  label: string;
} | null;

type MentorArenaProps = {
  ownerKey: string;
  detective: DetectiveCard | null;
  studentName: string;
  onOpenCurriculum: () => void;
  onOpenLab: () => void;
  onRoundTeach: (summary: string) => void;
  onChartMarks: (levels: ChartLevel[], shapes: ChartShape[]) => void;
  /** True while countdown / fight / wave — hide desk chrome for immersion */
  onPlayingChange?: (playing: boolean) => void;
};

export default function MentorArena({
  ownerKey,
  detective,
  studentName,
  onOpenCurriculum,
  onOpenLab,
  onRoundTeach,
  onChartMarks,
  onPlayingChange,
}: MentorArenaProps) {
  const [stats, setStats] = useState<ArenaStats>(() => loadArenaStats(ownerKey));
  const [phase, setPhase] = useState<Phase>('lobby');
  const [drill, setDrill] = useState<MentorDrill | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [wave, setWave] = useState(1);
  const [lives, setLives] = useState(ARENA_LIVES);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [askedCount, setAskedCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [comboMax, setComboMax] = useState(0);
  const [xpRound, setXpRound] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(ARENA_Q_SECONDS);
  const [countdown, setCountdown] = useState(3);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [locked, setLocked] = useState(false);
  const [shake, setShake] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    correct: number;
    total: number;
    xp: number;
    score: number;
    comboMax: number;
    wave: number;
    survived: boolean;
    newRecord: boolean;
  } | null>(null);
  const scoreRef = useRef(0);

  const skill = useMemo(
    () => buildTraderSkillProfile(ownerKey),
    [ownerKey, stats.totalCorrect, stats.roundsPlayed, stats.highScore],
  );

  useEffect(() => {
    setStats(loadArenaStats(ownerKey));
  }, [ownerKey]);

  const playing = phase === 'countdown' || phase === 'fight' || phase === 'waveClear';
  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  const nextDrill = useCallback(() => {
    if (!detective) return null;
    return buildArenaDrill(detective, liveProcessDrill, historicalStructureDrill);
  }, [detective]);

  useEffect(() => {
    if ((phase === 'fight' || phase === 'waveClear') && drill && detective) {
      const marks = buildDrillChartMarks(detective, drill);
      onChartMarks(marks.levels, marks.shapes);
      return;
    }
    if (phase === 'lobby') onChartMarks([], []);
  }, [phase, drill, detective, onChartMarks]);

  const finishGame = useCallback(
    (survived: boolean, correct: number, total: number, maxCombo: number, xp: number, finalScore: number, finalWave: number) => {
      playArenaSfx(survived ? 'wave' : 'over');
      const recorded = recordArenaRound(
        {
          correct,
          total,
          comboMax: maxCombo,
          xpEarned: xp,
          score: finalScore,
          wave: finalWave,
          timedOut: !survived && total > 0,
          survived,
        },
        ownerKey,
      );
      setStats(recorded);
      setLastResult({
        correct,
        total,
        xp,
        score: finalScore,
        comboMax: maxCombo,
        wave: finalWave,
        survived,
        newRecord: finalScore > (stats.highScore || 0),
      });
      setPhase('result');
      setDrill(null);
      onRoundTeach(
        [
          `[ARENA SURVIVAL] Score ${finalScore}. ${correct}/${total} correct. Wave ${finalWave}.`,
          survived ? 'Player CLEARED all waves.' : 'Player out of lives.',
          `Max combo x${maxCombo}.`,
          'Hype 3 lines + 1 process tip. Draw one lesson if useful. No Entry/Stop/Target.',
        ].join(' '),
      );
    },
    [ownerKey, onRoundTeach, stats.highScore],
  );

  const startGame = () => {
    if (!detective) return;
    const first = nextDrill();
    if (!first) return;
    touchArenaStreak(ownerKey);
    setStats(loadArenaStats(ownerKey));
    setPhase('countdown');
    setCountdown(3);
    setDrill(first);
    setQIndex(0);
    setWave(1);
    setLives(ARENA_LIVES);
    setScore(0);
    scoreRef.current = 0;
    setCorrectCount(0);
    setAskedCount(0);
    setCombo(0);
    setComboMax(0);
    setXpRound(0);
    setSecondsLeft(ARENA_Q_SECONDS);
    setFeedback(null);
    setLocked(false);
    setPickedId(null);
    setLastResult(null);
    setShake(false);
  };

  // 3-2-1-GO
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      playArenaSfx('go');
      setPhase('fight');
      setSecondsLeft(Math.max(12, ARENA_Q_SECONDS - (wave - 1) * 2));
      return;
    }
    playArenaSfx('hit');
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 700);
    return () => window.clearTimeout(t);
  }, [phase, countdown, wave]);

  // Per-question timer
  useEffect(() => {
    if (phase !== 'fight' || locked) return;
    if (secondsLeft <= 0) {
      // Timeout = miss
      setLocked(true);
      playArenaSfx('miss');
      setShake(true);
      const nextLives = lives - 1;
      setLives(nextLives);
      setCombo(0);
      setFeedback({
        correct: false,
        points: 0,
        xp: 0,
        combo: 0,
        speedBonus: 0,
        label: 'TIME UP · -1 life',
      });
      window.setTimeout(() => {
        setShake(false);
        setFeedback(null);
        const asked = askedCount + 1;
        setAskedCount(asked);
        if (nextLives <= 0) {
          finishGame(false, correctCount, asked, comboMax, xpRound, scoreRef.current, wave);
          return;
        }
        const d = nextDrill();
        setDrill(d);
        setQIndex((q) => q + 1);
        setSecondsLeft(Math.max(12, ARENA_Q_SECONDS - (wave - 1) * 2));
        setLocked(false);
        setPickedId(null);
      }, 850);
      return;
    }
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [
    phase,
    secondsLeft,
    locked,
    lives,
    askedCount,
    correctCount,
    comboMax,
    xpRound,
    wave,
    finishGame,
    nextDrill,
  ]);

  const advanceAfterHit = (
    nextCorrect: number,
    nextAsked: number,
    nextCombo: number,
    nextMax: number,
    nextXp: number,
    nextScore: number,
    nextLives: number,
  ) => {
    // Wave clear every WAVE_SIZE correct answers in the run's progress by questions answered in wave
    const inWave = (nextAsked % ARENA_WAVE_SIZE) === 0;
    if (inWave && nextLives > 0) {
      const nextWave = wave + 1;
      if (nextWave > ARENA_MAX_WAVES) {
        finishGame(true, nextCorrect, nextAsked, nextMax, nextXp, nextScore, wave);
        return;
      }
      playArenaSfx('wave');
      setPhase('waveClear');
      setWave(nextWave);
      window.setTimeout(() => {
        const d = nextDrill();
        setDrill(d);
        setQIndex(0);
        setSecondsLeft(Math.max(12, ARENA_Q_SECONDS - nextWave * 2));
        setLocked(false);
        setPickedId(null);
        setFeedback(null);
        setPhase('fight');
      }, 1400);
      return;
    }

    if (nextLives <= 0) {
      finishGame(false, nextCorrect, nextAsked, nextMax, nextXp, nextScore, wave);
      return;
    }

    const d = nextDrill();
    setDrill(d);
    setQIndex((q) => q + 1);
    setSecondsLeft(Math.max(12, ARENA_Q_SECONDS - (wave - 1) * 2));
    setLocked(false);
    setPickedId(null);
    setFeedback(null);
  };

  const pickOption = (optionId: string) => {
    if (!drill || locked || phase !== 'fight') return;
    setLocked(true);
    setPickedId(optionId);
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

    const qSec = Math.max(12, ARENA_Q_SECONDS - (wave - 1) * 2);
    const scored = scoreArenaHit(combo, ok, secondsLeft, qSec);
    const nextCorrect = correctCount + (ok ? 1 : 0);
    const nextAsked = askedCount + 1;
    const nextCombo = scored.nextCombo;
    const nextMax = Math.max(comboMax, nextCombo);
    const nextXp = xpRound + scored.xp;
    const nextScore = score + scored.points;
    const nextLives = ok ? lives : lives - 1;

    scoreRef.current = nextScore;
    setCorrectCount(nextCorrect);
    setAskedCount(nextAsked);
    setCombo(nextCombo);
    setComboMax(nextMax);
    setXpRound(nextXp);
    setScore(nextScore);
    setLives(nextLives);

    if (ok) {
      playArenaSfx(nextCombo >= 2 ? 'combo' : 'hit');
      setFeedback({
        correct: true,
        points: scored.points,
        xp: scored.xp,
        combo: nextCombo,
        speedBonus: scored.speedBonus,
        label: nextCombo >= 3 ? `ON FIRE x${nextCombo}` : nextCombo >= 2 ? `COMBO x${nextCombo}` : 'NICE HIT',
      });
    } else {
      playArenaSfx('miss');
      setShake(true);
      setFeedback({
        correct: false,
        points: 0,
        xp: 0,
        combo: 0,
        speedBonus: 0,
        label: nextLives <= 0 ? 'KO · GAME OVER' : 'MISS · -1 LIFE',
      });
      window.setTimeout(() => setShake(false), 450);
    }

    window.setTimeout(() => {
      advanceAfterHit(nextCorrect, nextAsked, nextCombo, nextMax, nextXp, nextScore, nextLives);
    }, ok ? 750 : 950);
  };

  // Keyboard 1-4 / A-D
  useEffect(() => {
    if (phase !== 'fight' || !drill || locked) return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 };
      const idx = map[e.key.toLowerCase()];
      if (idx == null || !drill.options[idx]) return;
      e.preventDefault();
      pickOption(drill.options[idx].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const qSec = Math.max(12, ARENA_Q_SECONDS - (wave - 1) * 2);
  const timerPct = Math.max(0, (secondsLeft / qSec) * 100);
  const rank = arenaRankTitle(stats);
  const urgent = secondsLeft <= 5;

  return (
    <div
      className={`wm-arena ${playing || phase === 'result' ? 'wm-arena--live' : ''} ${
        playing ? 'wm-arena--playing' : ''
      } ${shake ? 'wm-arena--shake' : ''} ${urgent && phase === 'fight' ? 'wm-arena--urgent' : ''}`}
    >
      {!playing ? (
        <div className="wm-arena__hud">
          <div className="wm-arena__hud-main">
            <p className="wm-arena__eyebrow">Wolf Mentor · Survival Arena</p>
            <h2 className="wm-arena__title">
              {studentName.split(' ')[0] || 'Trader'}, <span>lock in</span>
            </h2>
            <p className="wm-arena__lead">
              Full trading desk quiz — 40% candles + candle psych · 10% chart psych · structure,
              liquidity, risk, SMC & more
            </p>
          </div>
          <div className="wm-arena__stats">
            <div className="wm-arena__stat">
              <Trophy className="h-4 w-4" />
              <div>
                <b>{stats.highScore}</b>
                <span>High score</span>
              </div>
            </div>
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
                <b>{rank}</b>
                <span>{skill.xp} desk XP</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {phase === 'lobby' ? (
          <motion.div
            key="lobby"
            className="wm-arena__panel wm-arena__panel--lobby"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="wm-arena__modes">
              <div className="wm-arena__mode-card wm-arena__mode-card--on">
                <Sparkles className="h-4 w-4" />
                <div>
                  <b>Survival · Full Desk</b>
                  <p>
                    {ARENA_LIVES} lives · {ARENA_MAX_WAVES} waves · candles-heavy mix
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="wm-arena__play"
              onClick={startGame}
              disabled={!detective}
            >
              <Play className="h-5 w-5" />
              <span>
                <strong>START GAME</strong>
                <small>{detective ? 'Live tape loaded · press to fight' : 'Loading market tape…'}</small>
              </span>
            </button>

            <div className="wm-arena__howto">
              <div>
                <em>1</em>
                <span>Chart pe zone dekho</span>
              </div>
              <div>
                <em>2</em>
                <span>Keys 1–4 ya tap</span>
              </div>
              <div>
                <em>3</em>
                <span>Jaldi = zyada score</span>
              </div>
            </div>

            <div className="wm-arena__quick">
              <button type="button" className="wm-arena__chip" onClick={onOpenCurriculum}>
                <Target className="h-3.5 w-3.5" />
                Curriculum
              </button>
              <button type="button" className="wm-arena__chip" onClick={onOpenLab}>
                <RotateCcw className="h-3.5 w-3.5" />
                Lab
              </button>
            </div>
          </motion.div>
        ) : null}

        {phase === 'countdown' ? (
          <motion.div
            key="cd"
            className="wm-arena__panel wm-arena__panel--countdown"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              key={countdown}
              className="wm-arena__cd-num"
              initial={{ scale: 1.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18 }}
            >
              {countdown > 0 ? countdown : 'GO'}
            </motion.div>
            <p>Wave {wave} · get ready</p>
          </motion.div>
        ) : null}

        {phase === 'waveClear' ? (
          <motion.div
            key="wave"
            className="wm-arena__panel wm-arena__panel--wave"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <b>WAVE {wave - 1} CLEAR</b>
            <p>+speed pressure · Wave {wave} incoming</p>
            <span className="wm-arena__score-big">{score}</span>
          </motion.div>
        ) : null}

        {phase === 'fight' && drill ? (
          <motion.div
            key={`fight-${drill.id}`}
            className={`wm-arena__panel wm-arena__panel--fight ${urgent ? 'wm-arena__panel--urgent' : ''}`}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
          >
            <div className="wm-arena__fight-hud">
              <div className="wm-arena__hearts" aria-label={`${lives} lives`}>
                {Array.from({ length: ARENA_LIVES }).map((_, i) => (
                  <Heart
                    key={i}
                    className={`wm-arena__heart ${i < lives ? 'wm-arena__heart--on' : ''}`}
                    fill={i < lives ? 'currentColor' : 'none'}
                  />
                ))}
              </div>
              <div className="wm-arena__scoreboard">
                <span>
                  SCORE <b>{score}</b>
                </span>
                <span className={combo >= 2 ? 'wm-arena__combo wm-arena__combo--hot' : 'wm-arena__combo'}>
                  <Flame className="h-3.5 w-3.5" />x{combo}
                </span>
              </div>
            </div>

            <div className="wm-arena__round-top">
              <span className="wm-arena__wave-pill">WAVE {wave}/{ARENA_MAX_WAVES}</span>
              <span className="wm-arena__topic-pill">{arenaTopicLabel(drill.topic)}</span>
              <span>
                Q{(qIndex % ARENA_WAVE_SIZE) + 1}/{ARENA_WAVE_SIZE}
              </span>
              <span className={`wm-arena__clock ${urgent ? 'wm-arena__clock--hot' : ''}`}>{secondsLeft}s</span>
            </div>
            <div className={`wm-arena__timer ${urgent ? 'wm-arena__timer--hot' : ''}`}>
              <i style={{ width: `${timerPct}%` }} />
            </div>

            <p className="wm-arena__q">{drill.question}</p>
            <p className="wm-arena__hint">Chart marks = answer · keys 1–4</p>
            {feedback?.correct ? (
              <motion.span
                key={`pop-${score}`}
                className="wm-arena__score-pop"
                initial={{ opacity: 0, y: 8, scale: 0.7 }}
                animate={{ opacity: 1, y: -28, scale: 1.15 }}
                exit={{ opacity: 0 }}
              >
                +{feedback.points}
              </motion.span>
            ) : null}

            <div className="wm-arena__opts">
              {drill.options.map((o, i) => {
                const state =
                  pickedId == null
                    ? ''
                    : o.id === pickedId
                      ? feedback?.correct
                        ? 'wm-arena__opt--good'
                        : 'wm-arena__opt--bad'
                      : pickedId && o.id === drill.correctId && feedback && !feedback.correct
                        ? 'wm-arena__opt--reveal'
                        : '';
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={locked}
                    className={`wm-arena__opt ${state}`}
                    onClick={() => pickOption(o.id)}
                  >
                    <em>{i + 1}</em>
                    {o.label}
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {feedback ? (
                <motion.div
                  key="fb"
                  className={`wm-arena__flash ${
                    feedback.correct ? 'wm-arena__flash--ok' : 'wm-arena__flash--bad'
                  }`}
                  initial={{ opacity: 0, y: 20, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                >
                  <b>{feedback.label}</b>
                  {feedback.correct ? (
                    <span>
                      +{feedback.points}
                      {feedback.speedBonus > 40 ? ' SPEED' : ''}
                    </span>
                  ) : (
                    <span>{lives > 0 ? `${lives} left` : 'OUT'}</span>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}

        {phase === 'result' && lastResult ? (
          <motion.div
            key="result"
            className="wm-arena__panel wm-arena__panel--result"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className={`wm-arena__result-badge ${lastResult.survived ? 'wm-arena__result-badge--win' : ''}`}>
              {lastResult.survived ? 'ALL WAVES CLEAR' : 'GAME OVER'}
            </div>
            {lastResult.newRecord ? <p className="wm-arena__record">NEW HIGH SCORE</p> : null}
            <h3 className="wm-arena__result-score">{lastResult.score}</h3>
            <p className="wm-arena__result-sub">
              {lastResult.correct}/{lastResult.total} hits · Wave {lastResult.wave} · combo x
              {lastResult.comboMax} · +{lastResult.xp} XP
            </p>
            <div className="wm-arena__result-actions">
              <button type="button" className="wm-arena__play wm-arena__play--sm" onClick={startGame}>
                <Play className="h-4 w-4" />
                Rematch
              </button>
              <button type="button" className="wm-arena__chip" onClick={onOpenCurriculum}>
                Learn mode
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
