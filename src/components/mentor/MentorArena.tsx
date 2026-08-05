import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Coins,
  Flame,
  Gift,
  Heart,
  Lock,
  Package,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  playArenaSfx,
  recordArenaRound,
  scoreArenaHit,
  touchArenaStreak,
  loadArenaStats,
} from '../../services/mentorArena';
import {
  ALL_BADGES,
  ALL_TITLES,
  CAMPAIGN_LEVELS,
  POWERUP_SHOP,
  addQuestCoins,
  applyLevelClear,
  buyPowerUp,
  computeStars,
  consumePowerUp,
  equipTitle,
  isLevelUnlocked,
  loadQuestProgress,
  modeLabel,
  rewardPreview,
  titleName,
  type ChestLoot,
  type PowerUpId,
  type QuestLevel,
  type QuestProgress,
} from '../../services/mentorArenaCampaign';
import {
  arenaTopicLabel,
  buildArenaDrill,
  buildArenaDrillForLevel,
} from '../../services/mentorArenaBank';
import {
  buildDrillChartMarks,
  historicalStructureDrill,
  isDrillAnswerCorrect,
  liveProcessDrill,
  saveDrillResult,
  type DetectiveCard,
  type MentorDrill,
} from '../../services/mentorDrills';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';

type Phase = 'hub' | 'loadout' | 'brief' | 'countdown' | 'fight' | 'chest' | 'fail';

type Feedback = {
  correct: boolean;
  points: number;
  combo: number;
  speedBonus: number;
  label: string;
  lesson?: string;
} | null;

type ArmedPowerUps = {
  heart: boolean;
  clock: boolean;
  shield: boolean;
};

type MentorArenaProps = {
  ownerKey: string;
  detective: DetectiveCard | null;
  studentName: string;
  onOpenCurriculum: () => void;
  onOpenLab: () => void;
  onRoundTeach: (summary: string) => void;
  onChartMarks: (levels: ChartLevel[], shapes: ChartShape[]) => void;
  onPlayingChange?: (playing: boolean) => void;
};

function StarsRow({ n, max = 3 }: { n: number; max?: number }) {
  return (
    <span className="wm-quest__stars" aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`wm-quest__star ${i < n ? 'wm-quest__star--on' : ''}`}
          fill={i < n ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}

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
  const [quest, setQuest] = useState<QuestProgress>(() => loadQuestProgress(ownerKey));
  const [phase, setPhase] = useState<Phase>('hub');
  const [activeLevel, setActiveLevel] = useState<QuestLevel | null>(null);
  const [survivalMode, setSurvivalMode] = useState(false);
  const [armed, setArmed] = useState<ArmedPowerUps>({ heart: false, clock: false, shield: false });
  const [loot, setLoot] = useState<ChestLoot | null>(null);
  const [unlockedNext, setUnlockedNext] = useState<number | null>(null);

  const [drill, setDrill] = useState<MentorDrill | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [lives, setLives] = useState(3);
  const [livesMax, setLivesMax] = useState(3);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [askedCount, setAskedCount] = useState(0);
  const [combo, setCombo] = useState(0);
  const [comboMax, setComboMax] = useState(0);
  const [xpRound, setXpRound] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(18);
  const [qSeconds, setQSeconds] = useState(18);
  const [targetQuestions, setTargetQuestions] = useState(5);
  const [countdown, setCountdown] = useState(3);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [locked, setLocked] = useState(false);
  const [shake, setShake] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [shieldLeft, setShieldLeft] = useState(0);
  const [chestOpen, setChestOpen] = useState(false);
  const scoreRef = useRef(0);
  const shieldRef = useRef(0);

  useEffect(() => {
    setQuest(loadQuestProgress(ownerKey));
  }, [ownerKey]);

  useEffect(() => {
    onPlayingChange?.(phase === 'countdown' || phase === 'fight');
  }, [phase, onPlayingChange]);

  const equipped = titleName(quest.equippedTitle);
  const firstName = studentName.split(' ')[0] || 'Trader';

  const nextDrill = useCallback(() => {
    if (!detective) return null;
    if (survivalMode || !activeLevel) {
      return buildArenaDrill(detective, liveProcessDrill, historicalStructureDrill);
    }
    return buildArenaDrillForLevel(detective, activeLevel.topics, {
      topicWeights: activeLevel.topicWeights,
      allowLiveTape: activeLevel.allowLiveTape,
      liveDrill: liveProcessDrill,
      histDrill: historicalStructureDrill,
    });
  }, [detective, survivalMode, activeLevel]);

  useEffect(() => {
    if (phase === 'fight' && drill && detective) {
      const marks = buildDrillChartMarks(detective, drill);
      onChartMarks(marks.levels, marks.shapes);
      return;
    }
    if (phase === 'hub' || phase === 'loadout') onChartMarks([], []);
  }, [phase, drill, detective, onChartMarks]);

  const refreshQuest = () => setQuest(loadQuestProgress(ownerKey));

  const openBrief = (level: QuestLevel) => {
    if (!isLevelUnlocked(level.id, quest)) return;
    setSurvivalMode(false);
    setActiveLevel(level);
    setArmed({ heart: false, clock: false, shield: false });
    setPhase('brief');
  };

  const toggleArm = (id: PowerUpId) => {
    if ((quest.powerups[id] || 0) <= 0 && !armed[id]) return;
    setArmed((a) => ({ ...a, [id]: !a[id] }));
  };

  const startMission = () => {
    if (!detective) return;
    const level = activeLevel;
    const isSurvival = survivalMode || !level;

    let baseLives = isSurvival ? 3 : level!.lives;
    let baseSec = isSurvival ? 16 : level!.qSeconds;
    let questions = isSurvival ? 12 : level!.questions;

    if (armed.heart && consumePowerUp('heart', ownerKey)) {
      baseLives += 1;
    } else if (armed.heart) {
      setArmed((a) => ({ ...a, heart: false }));
    }
    if (armed.clock && consumePowerUp('clock', ownerKey)) {
      baseSec += 5;
    } else if (armed.clock) {
      setArmed((a) => ({ ...a, clock: false }));
    }
    let shield = 0;
    if (armed.shield && consumePowerUp('shield', ownerKey)) {
      shield = 1;
    } else if (armed.shield) {
      setArmed((a) => ({ ...a, shield: false }));
    }

    refreshQuest();
    touchArenaStreak(ownerKey);

    const first = isSurvival
      ? buildArenaDrill(detective, liveProcessDrill, historicalStructureDrill)
      : buildArenaDrillForLevel(detective, level!.topics, {
          topicWeights: level!.topicWeights,
          allowLiveTape: level!.allowLiveTape,
          liveDrill: liveProcessDrill,
          histDrill: historicalStructureDrill,
        });
    if (!first) return;

    setDrill(first);
    setQIndex(0);
    setLives(baseLives);
    setLivesMax(baseLives);
    setQSeconds(baseSec);
    setSecondsLeft(baseSec);
    setTargetQuestions(questions);
    setScore(0);
    scoreRef.current = 0;
    setCorrectCount(0);
    setAskedCount(0);
    setCombo(0);
    setComboMax(0);
    setXpRound(0);
    setFeedback(null);
    setLocked(false);
    setPickedId(null);
    setShake(false);
    setShieldLeft(shield);
    shieldRef.current = shield;
    setLoot(null);
    setUnlockedNext(null);
    setChestOpen(false);
    setCountdown(3);
    setPhase('countdown');
  };

  const finishFail = useCallback(
    (correct: number, total: number, maxCombo: number, xp: number, finalScore: number) => {
      playArenaSfx('over');
      recordArenaRound(
        {
          correct,
          total,
          comboMax: maxCombo,
          xpEarned: xp,
          score: finalScore,
          wave: 1,
          timedOut: true,
          survived: false,
        },
        ownerKey,
      );
      setPhase('fail');
      setDrill(null);
      onRoundTeach(
        [
          `[QUEST FAIL] ${activeLevel?.title || 'Survival'}. ${correct}/${total} correct.`,
          'Encourage retry. 2 tip lines. No Entry/Stop/Target.',
        ].join(' '),
      );
    },
    [ownerKey, onRoundTeach, activeLevel],
  );

  const finishClear = useCallback(
    (correct: number, total: number, maxCombo: number, xp: number, finalScore: number, livesLeft: number) => {
      playArenaSfx('wave');
      recordArenaRound(
        {
          correct,
          total,
          comboMax: maxCombo,
          xpEarned: xp,
          score: finalScore,
          wave: activeLevel?.id || 1,
          timedOut: false,
          survived: true,
        },
        ownerKey,
      );

      if (survivalMode || !activeLevel) {
        const coins = Math.round(finalScore / 20);
        const stars = computeStars({
          correct,
          total,
          livesLeft,
          livesMax,
          comboMax: maxCombo,
          cleared: true,
        });
        setLoot({
          coins,
          powerUpQty: 0,
          firstClear: false,
          stars,
          bestStars: stars,
          newBest: false,
        });
        setQuest(addQuestCoins(coins, ownerKey));
        setPhase('chest');
        setChestOpen(false);
        window.setTimeout(() => {
          setChestOpen(true);
          playArenaSfx('chest');
        }, 400);
        return;
      }

      const stars = computeStars({
        correct,
        total,
        livesLeft,
        livesMax,
        comboMax: maxCombo,
        cleared: true,
      });
      const result = applyLevelClear(activeLevel.id, stars, ownerKey);
      setQuest(result.progress);
      setLoot(result.loot);
      setUnlockedNext(result.unlockedNext);
      setPhase('chest');
      setChestOpen(false);
      window.setTimeout(() => {
        setChestOpen(true);
        playArenaSfx('chest');
        if (result.loot.stars >= 2) playArenaSfx('star');
        if (result.unlockedNext) {
          window.setTimeout(() => playArenaSfx('unlock'), 500);
        }
      }, 450);

      onRoundTeach(
        [
          `[QUEST CLEAR] ${activeLevel.title}. ${stars}★. ${correct}/${total}.`,
          result.loot.badge ? `Unlocked badge ${result.loot.badge.name}.` : '',
          'Celebrate + 1 process tip. No Entry/Stop/Target.',
        ]
          .filter(Boolean)
          .join(' '),
      );
    },
    [ownerKey, onRoundTeach, activeLevel, survivalMode, livesMax],
  );

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      playArenaSfx('go');
      setPhase('fight');
      setSecondsLeft(qSeconds);
      return;
    }
    playArenaSfx('hit');
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 700);
    return () => window.clearTimeout(t);
  }, [phase, countdown, qSeconds]);

  const advanceMission = (
    nextCorrect: number,
    nextAsked: number,
    _nextCombo: number,
    nextMax: number,
    nextXp: number,
    nextScore: number,
    nextLives: number,
  ) => {
    if (nextLives <= 0) {
      finishFail(nextCorrect, nextAsked, nextMax, nextXp, nextScore);
      return;
    }
    if (nextAsked >= targetQuestions) {
      finishClear(nextCorrect, nextAsked, nextMax, nextXp, nextScore, nextLives);
      return;
    }
    const d = nextDrill();
    setDrill(d);
    setQIndex(nextAsked);
    setSecondsLeft(qSeconds);
    setLocked(false);
    setPickedId(null);
    setFeedback(null);
  };

  // Timer
  useEffect(() => {
    if (phase !== 'fight' || locked) return;
    if (secondsLeft <= 0) {
      setLocked(true);
      playArenaSfx('miss');
      setShake(true);
      let nextLives = lives;
      let usedShield = false;
      if (shieldRef.current > 0) {
        shieldRef.current -= 1;
        setShieldLeft(shieldRef.current);
        usedShield = true;
      } else {
        nextLives = lives - 1;
        setLives(nextLives);
      }
      setCombo(0);
      setFeedback({
        correct: false,
        points: 0,
        combo: 0,
        speedBonus: 0,
        label: usedShield ? 'SHIELD BLOCKED TIME-UP' : 'TIME UP · -1 life',
        lesson: drill?.reason,
      });
      window.setTimeout(() => {
        setShake(false);
        const asked = askedCount + 1;
        setAskedCount(asked);
        advanceMission(correctCount, asked, 0, comboMax, xpRound, scoreRef.current, nextLives);
      }, 900);
      return;
    }
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft, locked, lives, askedCount, correctCount, comboMax, xpRound, drill]);

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

    const scored = scoreArenaHit(combo, ok, secondsLeft, qSeconds);
    const nextCorrect = correctCount + (ok ? 1 : 0);
    const nextAsked = askedCount + 1;
    const nextCombo = scored.nextCombo;
    const nextMax = Math.max(comboMax, nextCombo);
    const nextXp = xpRound + scored.xp;
    const nextScore = score + scored.points;

    let nextLives = lives;
    let usedShield = false;
    if (!ok) {
      if (shieldRef.current > 0) {
        shieldRef.current -= 1;
        setShieldLeft(shieldRef.current);
        usedShield = true;
      } else {
        nextLives = lives - 1;
      }
    }

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
        combo: 0,
        speedBonus: 0,
        label: usedShield
          ? 'SHIELD SAVED YOU'
          : nextLives <= 0
            ? 'KO · MISSION FAIL'
            : 'MISS · -1 LIFE',
        lesson: drill.reason,
      });
      window.setTimeout(() => setShake(false), 450);
    }

    window.setTimeout(() => {
      advanceMission(nextCorrect, nextAsked, nextCombo, nextMax, nextXp, nextScore, nextLives);
    }, ok ? 700 : 1100);
  };

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

  const timerPct = Math.max(0, (secondsLeft / qSeconds) * 100);
  const urgent = secondsLeft <= 5;
  const arenaStats = useMemo(() => loadArenaStats(ownerKey), [ownerKey, quest.totalStars, quest.coins]);

  const onBuy = (id: PowerUpId) => {
    const next = buyPowerUp(id, ownerKey);
    if (next) {
      playArenaSfx('hit');
      setQuest(next);
    }
  };

  const onEquip = (titleId: string) => {
    setQuest(equipTitle(titleId, ownerKey));
    playArenaSfx('star');
  };

  return (
    <div
      className={`wm-arena wm-quest ${phase === 'fight' || phase === 'countdown' ? 'wm-arena--live wm-arena--playing' : ''} ${
        shake ? 'wm-arena--shake' : ''
      } ${urgent && phase === 'fight' ? 'wm-arena--urgent' : ''}`}
    >
      {phase === 'hub' || phase === 'loadout' || phase === 'brief' ? (
        <div className="wm-arena__hud wm-quest__top">
          <div className="wm-arena__hud-main">
            <p className="wm-arena__eyebrow">Wolf Trade Quest</p>
            <h2 className="wm-arena__title">
              {firstName}
              {equipped ? (
                <>
                  , <span>{equipped}</span>
                </>
              ) : (
                <>
                  , <span>begin the path</span>
                </>
              )}
            </h2>
            <p className="wm-arena__lead">
              10 story levels · badges · titles · power-ups — clear missions, open chests, unlock the desk
            </p>
          </div>
          <div className="wm-quest__wallet">
            <div className="wm-quest__coin">
              <Coins className="h-4 w-4" />
              <b>{quest.coins}</b>
            </div>
            <div className="wm-quest__coin">
              <Star className="h-4 w-4" />
              <b>{quest.totalStars}</b>
              <span>stars</span>
            </div>
            <div className="wm-quest__coin">
              <Trophy className="h-4 w-4" />
              <b>{arenaStats.highScore}</b>
            </div>
          </div>
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {phase === 'hub' ? (
          <motion.div
            key="hub"
            className="wm-arena__panel wm-quest__hub"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="wm-quest__hub-actions">
              <button type="button" className="wm-arena__chip" onClick={() => setPhase('loadout')}>
                <Package className="h-3.5 w-3.5" />
                Collection
              </button>
              {quest.survivalUnlocked ? (
                <button
                  type="button"
                  className="wm-arena__chip"
                  onClick={() => {
                    setSurvivalMode(true);
                    setActiveLevel(null);
                    setArmed({ heart: false, clock: false, shield: false });
                    setPhase('brief');
                  }}
                >
                  <Zap className="h-3.5 w-3.5" />
                  Survival Raid
                </button>
              ) : null}
            </div>

            <div className="wm-quest__path">
              {CAMPAIGN_LEVELS.map((level) => {
                const unlocked = isLevelUnlocked(level.id, quest);
                const stars = quest.cleared[String(level.id)] || 0;
                const boss = level.mode === 'boss';
                return (
                  <button
                    key={level.id}
                    type="button"
                    disabled={!unlocked}
                    className={`wm-quest__node ${unlocked ? 'wm-quest__node--open' : 'wm-quest__node--lock'} ${
                      boss ? 'wm-quest__node--boss' : ''
                    } ${stars > 0 ? 'wm-quest__node--cleared' : ''}`}
                    onClick={() => openBrief(level)}
                  >
                    <div className="wm-quest__node-num">
                      {unlocked ? level.id : <Lock className="h-3.5 w-3.5" />}
                    </div>
                    <div className="wm-quest__node-body">
                      <em>{level.world}</em>
                      <b>{level.title}</b>
                      <span>
                        {modeLabel(level.mode)} · {level.questions}Q · {level.lives}♥
                      </span>
                      {unlocked ? <StarsRow n={stars} /> : <span className="wm-quest__need">Clear previous</span>}
                    </div>
                    <div className="wm-quest__node-loot">
                      <Gift className="h-3.5 w-3.5" />
                      <small>{level.reward.badge?.name || `${level.reward.coins}c`}</small>
                    </div>
                  </button>
                );
              })}
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

        {phase === 'loadout' ? (
          <motion.div
            key="loadout"
            className="wm-arena__panel wm-quest__loadout"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <button type="button" className="wm-arena__chip" onClick={() => setPhase('hub')}>
              ← Back to map
            </button>

            <h3 className="wm-quest__section">Titles</h3>
            <div className="wm-quest__grid">
              {ALL_TITLES.map((t) => {
                const owned = quest.titles.includes(t.id);
                const on = quest.equippedTitle === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!owned}
                    className={`wm-quest__collect ${owned ? '' : 'wm-quest__collect--lock'} ${
                      on ? 'wm-quest__collect--on' : ''
                    }`}
                    onClick={() => owned && onEquip(t.id)}
                  >
                    <b>{t.name}</b>
                    <span>{owned ? (on ? 'Equipped' : 'Tap to equip') : 'Locked'}</span>
                  </button>
                );
              })}
            </div>

            <h3 className="wm-quest__section">Badges</h3>
            <div className="wm-quest__grid">
              {ALL_BADGES.map((b) => {
                const owned = quest.badges.includes(b.id);
                return (
                  <div
                    key={b.id}
                    className={`wm-quest__collect ${owned ? 'wm-quest__collect--badge' : 'wm-quest__collect--lock'}`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <b>{b.name}</b>
                    <span>{owned ? b.blurb : '???'}</span>
                  </div>
                );
              })}
            </div>

            <h3 className="wm-quest__section">Power-up shop</h3>
            <div className="wm-quest__shop">
              {(Object.keys(POWERUP_SHOP) as PowerUpId[]).map((id) => (
                <div key={id} className="wm-quest__shop-row">
                  <div>
                    <b>{POWERUP_SHOP[id].name}</b>
                    <span>
                      {POWERUP_SHOP[id].blurb} · own {quest.powerups[id] || 0}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="wm-arena__chip"
                    disabled={quest.coins < POWERUP_SHOP[id].cost}
                    onClick={() => onBuy(id)}
                  >
                    <Coins className="h-3.5 w-3.5" />
                    {POWERUP_SHOP[id].cost}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}

        {phase === 'brief' ? (
          <motion.div
            key="brief"
            className="wm-arena__panel wm-quest__brief"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <button type="button" className="wm-arena__chip" onClick={() => setPhase('hub')}>
              ← Map
            </button>
            <div className="wm-quest__brief-hero">
              <em>{survivalMode ? 'Survival Raid' : activeLevel?.world}</em>
              <h3>{survivalMode ? 'Endless desk mix' : activeLevel?.title}</h3>
              <p>
                {survivalMode
                  ? '12 questions · full trading mix · earn coins from score'
                  : activeLevel?.blurb}
              </p>
              {!survivalMode && activeLevel ? (
                <p className="wm-quest__reward-line">
                  <Gift className="h-3.5 w-3.5" />
                  Clear reward: {rewardPreview(activeLevel)}
                </p>
              ) : null}
            </div>

            <div className="wm-quest__arm">
              <p>Arm power-ups (consumed on start)</p>
              {(Object.keys(POWERUP_SHOP) as PowerUpId[]).map((id) => {
                const Icon = id === 'heart' ? Heart : id === 'clock' ? Timer : Shield;
                const own = quest.powerups[id] || 0;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={own <= 0 && !armed[id]}
                    className={`wm-quest__arm-btn ${armed[id] ? 'wm-quest__arm-btn--on' : ''}`}
                    onClick={() => toggleArm(id)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {POWERUP_SHOP[id].name}
                    <small>×{own}</small>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="wm-arena__play"
              onClick={startMission}
              disabled={!detective}
            >
              <Play className="h-5 w-5" />
              <span>
                <strong>START MISSION</strong>
                <small>
                  {detective
                    ? `${survivalMode ? '12' : activeLevel?.questions}Q · keys 1–4`
                    : 'Loading tape…'}
                </small>
              </span>
            </button>
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
            <p>{survivalMode ? 'Survival Raid' : activeLevel?.title} · get ready</p>
          </motion.div>
        ) : null}

        {phase === 'fight' && drill ? (
          <motion.div
            key={`fight-${drill.id}-${qIndex}`}
            className={`wm-arena__panel wm-arena__panel--fight ${urgent ? 'wm-arena__panel--urgent' : ''}`}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
          >
            <div className="wm-arena__fight-hud">
              <div className="wm-arena__hearts" aria-label={`${lives} lives`}>
                {Array.from({ length: livesMax }).map((_, i) => (
                  <Heart
                    key={i}
                    className={`wm-arena__heart ${i < lives ? 'wm-arena__heart--on' : ''}`}
                    fill={i < lives ? 'currentColor' : 'none'}
                  />
                ))}
                {shieldLeft > 0 ? (
                  <span className="wm-quest__shield-pill">
                    <Shield className="h-3 w-3" />×{shieldLeft}
                  </span>
                ) : null}
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
              <span className="wm-arena__wave-pill">
                {survivalMode ? 'RAID' : `L${activeLevel?.id}`}
              </span>
              <span className="wm-arena__topic-pill">{arenaTopicLabel(drill.topic)}</span>
              <span>
                Q{qIndex + 1}/{targetQuestions}
              </span>
              <span className={`wm-arena__clock ${urgent ? 'wm-arena__clock--hot' : ''}`}>
                {secondsLeft}s
              </span>
            </div>
            <div className={`wm-arena__timer ${urgent ? 'wm-arena__timer--hot' : ''}`}>
              <i style={{ width: `${timerPct}%` }} />
            </div>

            <p className="wm-arena__q">{drill.question}</p>
            <p className="wm-arena__hint">Chart marks · keys 1–4</p>

            {feedback?.correct ? (
              <motion.span
                key={`pop-${score}`}
                className="wm-arena__score-pop"
                initial={{ opacity: 0, y: 8, scale: 0.7 }}
                animate={{ opacity: 1, y: -28, scale: 1.15 }}
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
                  initial={{ opacity: 0, y: 16, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <b>{feedback.label}</b>
                  {feedback.correct ? (
                    <span>+{feedback.points}</span>
                  ) : (
                    <span className="wm-quest__lesson">{feedback.lesson || `${lives} left`}</span>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}

        {phase === 'chest' && loot ? (
          <motion.div
            key="chest"
            className="wm-arena__panel wm-quest__chest"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className={`wm-quest__chest-box ${chestOpen ? 'wm-quest__chest-box--open' : ''}`}>
              <Gift className="h-10 w-10" />
              <b>{chestOpen ? 'REWARDS!' : 'Opening chest…'}</b>
            </div>

            {chestOpen ? (
              <motion.div
                className="wm-quest__loot"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <StarsRow n={loot.stars} />
                {loot.coins > 0 ? (
                  <p className="wm-quest__loot-row">
                    <Coins className="h-4 w-4" /> +{loot.coins} Wolf Coins
                  </p>
                ) : null}
                {loot.badge ? (
                  <p className="wm-quest__loot-row wm-quest__loot-row--rare">
                    <Sparkles className="h-4 w-4" /> Badge: {loot.badge.name}
                  </p>
                ) : null}
                {loot.title ? (
                  <p className="wm-quest__loot-row wm-quest__loot-row--rare">
                    <Trophy className="h-4 w-4" /> Title: {loot.title.name}
                  </p>
                ) : null}
                {loot.powerUp ? (
                  <p className="wm-quest__loot-row">
                    <Zap className="h-4 w-4" /> {POWERUP_SHOP[loot.powerUp].name} ×{loot.powerUpQty}
                  </p>
                ) : null}
                {unlockedNext ? (
                  <p className="wm-quest__unlock">Level {unlockedNext} unlocked!</p>
                ) : null}
                {!loot.firstClear && loot.stars > 0 ? (
                  <p className="wm-quest__loot-sub">
                    {loot.newBest ? 'New best stars!' : 'Replay bonus'}
                  </p>
                ) : null}
              </motion.div>
            ) : null}

            <div className="wm-arena__result-actions">
              {unlockedNext ? (
                <button
                  type="button"
                  className="wm-arena__play wm-arena__play--sm"
                  onClick={() => {
                    const next = CAMPAIGN_LEVELS.find((l) => l.id === unlockedNext);
                    if (next) openBrief(next);
                    else setPhase('hub');
                  }}
                >
                  <Play className="h-4 w-4" />
                  Next Level
                </button>
              ) : (
                <button
                  type="button"
                  className="wm-arena__play wm-arena__play--sm"
                  onClick={() => {
                    if (activeLevel) openBrief(activeLevel);
                    else setPhase('hub');
                  }}
                >
                  <Play className="h-4 w-4" />
                  Replay
                </button>
              )}
              <button type="button" className="wm-arena__chip" onClick={() => setPhase('hub')}>
                World Map
              </button>
              <button type="button" className="wm-arena__chip" onClick={() => setPhase('loadout')}>
                Collection
              </button>
            </div>
          </motion.div>
        ) : null}

        {phase === 'fail' ? (
          <motion.div
            key="fail"
            className="wm-arena__panel wm-arena__panel--result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="wm-arena__result-badge">MISSION FAILED</div>
            <h3 className="wm-arena__result-score">{score}</h3>
            <p className="wm-arena__result-sub">
              {correctCount}/{askedCount || targetQuestions} hits · combo x{comboMax}
            </p>
            <p className="wm-quest__fail-tip">
              Tip: arm a Miss Shield from Collection, or re-read the lesson flashes.
            </p>
            <div className="wm-arena__result-actions">
              <button
                type="button"
                className="wm-arena__play wm-arena__play--sm"
                onClick={() => {
                  if (survivalMode) {
                    setPhase('brief');
                  } else if (activeLevel) openBrief(activeLevel);
                  else setPhase('hub');
                }}
              >
                <Play className="h-4 w-4" />
                Retry
              </button>
              <button type="button" className="wm-arena__chip" onClick={() => setPhase('hub')}>
                World Map
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

    </div>
  );
}
