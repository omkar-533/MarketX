import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Coins,
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
import WolfTapeGame, {
  tapeConfigFromLevel,
  type TapeGameConfig,
  type TapeGameResult,
} from './WolfTapeGame';
import type { DetectiveCard } from '../../services/mentorDrills';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';

type Phase = 'hub' | 'loadout' | 'brief' | 'countdown' | 'fight' | 'chest' | 'fail';

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
  const [gameConfig, setGameConfig] = useState<TapeGameConfig | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [chestOpen, setChestOpen] = useState(false);
  const [lastRun, setLastRun] = useState<TapeGameResult | null>(null);
  const [livesMax, setLivesMax] = useState(3);

  useEffect(() => {
    setQuest(loadQuestProgress(ownerKey));
  }, [ownerKey]);

  useEffect(() => {
    onPlayingChange?.(phase === 'countdown' || phase === 'fight');
  }, [phase, onPlayingChange]);

  useEffect(() => {
    if (phase === 'hub' || phase === 'loadout') onChartMarks([], []);
  }, [phase, onChartMarks]);

  const equipped = titleName(quest.equippedTitle);
  const firstName = studentName.split(' ')[0] || 'Trader';
  const arenaStats = useMemo(
    () => loadArenaStats(ownerKey),
    [ownerKey, quest.totalStars, quest.coins],
  );

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
    const level = activeLevel;
    const isSurvival = survivalMode || !level;
    let baseLives = isSurvival ? 3 : level!.lives;
    if (armed.heart && consumePowerUp('heart', ownerKey)) baseLives += 1;
    else if (armed.heart) setArmed((a) => ({ ...a, heart: false }));
    // clock → longer track / slightly slower for learning
    let trackBoost = 0;
    if (armed.clock && consumePowerUp('clock', ownerKey)) trackBoost = 400;
    else if (armed.clock) setArmed((a) => ({ ...a, clock: false }));
    if (armed.shield && consumePowerUp('shield', ownerKey)) baseLives += 1;
    else if (armed.shield) setArmed((a) => ({ ...a, shield: false }));

    refreshQuest();
    touchArenaStreak(ownerKey);

    const cfg = tapeConfigFromLevel(
      isSurvival
        ? {
            id: 99,
            title: 'Survival Raid',
            mode: 'rush',
            lives: baseLives,
            topics: ['candle', 'candle_psych', 'psych', 'liquidity', 'structure'],
          }
        : {
            id: level!.id,
            title: level!.title,
            mode: level!.mode,
            lives: baseLives,
            topics: level!.topics,
          },
    );
    cfg.trackLength += trackBoost;
    setLivesMax(baseLives);
    setGameConfig(cfg);
    setLoot(null);
    setUnlockedNext(null);
    setChestOpen(false);
    setLastRun(null);
    setCountdown(3);
    setPhase('countdown');
  };

  const onGameFinish = useCallback(
    (result: TapeGameResult) => {
      setLastRun(result);
      const gateAcc = result.gatesTotal > 0 ? result.gatesCorrect / result.gatesTotal : 1;
      const pseudoCorrect = Math.round(
        (result.cleared ? 0.7 : 0.3) * 10 + gateAcc * 5 + (result.coins > 8 ? 2 : 0),
      );
      const pseudoTotal = 10;

      recordArenaRound(
        {
          correct: result.cleared ? pseudoCorrect : Math.max(1, result.gatesCorrect),
          total: pseudoTotal,
          comboMax: result.comboMax,
          xpEarned: Math.round(result.score / 10),
          score: result.score,
          wave: activeLevel?.id || 1,
          timedOut: !result.cleared,
          survived: result.cleared,
        },
        ownerKey,
      );

      if (!result.cleared) {
        playArenaSfx('over');
        setPhase('fail');
        onRoundTeach(
          [
            `[TAPE RUNNER FAIL] ${activeLevel?.title || 'Survival'}. Score ${result.score}.`,
            'Encourage retry. Tip: jump early on spikes, land on correct GATE pads. No Entry/Stop/Target.',
          ].join(' '),
        );
        return;
      }

      const stars = computeStars({
        correct: Math.round(gateAcc * pseudoTotal),
        total: pseudoTotal,
        livesLeft: result.livesLeft,
        livesMax: result.livesMax || livesMax,
        comboMax: result.comboMax,
        cleared: true,
      });

      if (survivalMode || !activeLevel) {
        const coins = Math.max(10, Math.round(result.score / 25) + result.coins);
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

      const applied = applyLevelClear(activeLevel.id, Math.max(1, stars), ownerKey);
      setQuest(applied.progress);
      setLoot(applied.loot);
      setUnlockedNext(applied.unlockedNext);
      setPhase('chest');
      setChestOpen(false);
      window.setTimeout(() => {
        setChestOpen(true);
        playArenaSfx('chest');
        if (applied.loot.stars >= 2) playArenaSfx('star');
        if (applied.unlockedNext) window.setTimeout(() => playArenaSfx('unlock'), 500);
      }, 450);

      onRoundTeach(
        [
          `[TAPE RUNNER CLEAR] ${activeLevel.title}. ${stars}★. Score ${result.score}. Gates ${result.gatesCorrect}/${result.gatesTotal}.`,
          applied.loot.badge ? `Badge: ${applied.loot.badge.name}.` : '',
          'Hype the run + 1 process tip from the level theme. No Entry/Stop/Target.',
        ]
          .filter(Boolean)
          .join(' '),
      );
    },
    [ownerKey, onRoundTeach, activeLevel, survivalMode, livesMax],
  );

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      playArenaSfx('go');
      setPhase('fight');
      return;
    }
    playArenaSfx('hit');
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 700);
    return () => window.clearTimeout(t);
  }, [phase, countdown]);

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

  const playing = phase === 'countdown' || phase === 'fight';

  return (
    <div className={`wm-arena wm-quest ${playing ? 'wm-arena--live wm-arena--playing wm-quest--game' : ''}`}>
      {!playing ? (
        <div className="wm-arena__hud wm-quest__top">
          <div className="wm-arena__hud-main">
            <p className="wm-arena__eyebrow">Wolf Trade Quest · Most Wanted</p>
            <h2 className="wm-arena__title">
              {firstName}
              {equipped ? (
                <>
                  , <span>{equipped}</span>
                </>
              ) : (
                <>
                  , <span>you are wanted</span>
                </>
              )}
            </h2>
            <p className="wm-arena__lead">
              Night freeway racer — switch lanes, nitro past FOMO cars, hit checkpoint answer lanes,
              finish for the chest.
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
                        {modeLabel(level.mode)} RACE · {level.lives}♥ · lanes + nitro
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
                    <b>
                      {id === 'clock' ? 'Longer Track' : POWERUP_SHOP[id].name}
                    </b>
                    <span>
                      {id === 'clock'
                        ? 'Extra distance / breathing room'
                        : id === 'shield'
                          ? '+1 life (armor)'
                          : POWERUP_SHOP[id].blurb}{' '}
                      · own {quest.powerups[id] || 0}
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
              <h3>{survivalMode ? 'Endless tape run' : activeLevel?.title}</h3>
              <p>
                {survivalMode
                  ? 'Faster night race · dodge FOMO rivals · checkpoint answer lanes · nitro to the finish'
                  : `${activeLevel?.blurb} — NFS-style race: lanes, nitro, heat. Learning at checkpoints.`}
              </p>
              {!survivalMode && activeLevel ? (
                <p className="wm-quest__reward-line">
                  <Gift className="h-3.5 w-3.5" />
                  Clear reward: {rewardPreview(activeLevel)}
                </p>
              ) : null}
            </div>

            <div className="wm-quest__howto-run">
              <div>
                <b>← →</b>
                <span>Change lane</span>
              </div>
              <div>
                <b>SPACE</b>
                <span>Nitro boost</span>
              </div>
              <div>
                <b>CHECKPOINT</b>
                <span>Drive correct lane</span>
              </div>
              <div>
                <b>FINISH</b>
                <span>Clear for chest</span>
              </div>
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
                    {id === 'clock' ? 'Longer Track' : POWERUP_SHOP[id].name}
                    <small>×{own}</small>
                  </button>
                );
              })}
            </div>

            <button type="button" className="wm-arena__play" onClick={startMission}>
              <Play className="h-5 w-5" />
              <span>
                <strong>START RACE</strong>
                <small>Tutorial pehle · phir ← → nitro · finish line</small>
              </span>
            </button>
          </motion.div>
        ) : null}

        {phase === 'countdown' ? (
          <motion.div
            key="cd"
            className="wm-arena__panel wm-arena__panel--countdown wm-quest__countdown"
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
            <p>{gameConfig?.title || 'Race'} · engines hot</p>
          </motion.div>
        ) : null}

        {phase === 'fight' && gameConfig ? (
          <motion.div
            key={`run-${gameConfig.levelId}-${gameConfig.lives}`}
            className="wm-quest__stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <WolfTapeGame config={gameConfig} onFinish={onGameFinish} />
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
              <b>{chestOpen ? 'RACE WON!' : 'Opening chest…'}</b>
            </div>
            {chestOpen ? (
              <motion.div
                className="wm-quest__loot"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <StarsRow n={loot.stars} />
                {lastRun ? (
                  <p className="wm-quest__loot-sub">
                    Score {lastRun.score} · coins grabbed {lastRun.coins} · gates{' '}
                    {lastRun.gatesCorrect}/{lastRun.gatesTotal}
                  </p>
                ) : null}
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
                {unlockedNext ? <p className="wm-quest__unlock">Level {unlockedNext} unlocked!</p> : null}
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
                  Replay Run
                </button>
              )}
              <button type="button" className="wm-arena__chip" onClick={() => setPhase('hub')}>
                World Map
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
            <div className="wm-arena__result-badge">BUSTED</div>
            <h3 className="wm-arena__result-score">{lastRun?.score ?? 0}</h3>
            <p className="wm-arena__result-sub">
              Coins {lastRun?.coins ?? 0} · gates {lastRun?.gatesCorrect ?? 0}/
              {lastRun?.gatesTotal ?? 0} · combo x{lastRun?.comboMax ?? 0}
            </p>
            <p className="wm-quest__fail-tip">
              Tip: ← → se lane badlo, FOMO cars se bacho, checkpoint pe sahi answer lane mein ghus
              jao, SPACE se nitro.
            </p>
            <div className="wm-arena__result-actions">
              <button
                type="button"
                className="wm-arena__play wm-arena__play--sm"
                onClick={() => {
                  if (survivalMode) setPhase('brief');
                  else if (activeLevel) openBrief(activeLevel);
                  else setPhase('hub');
                }}
              >
                <Play className="h-4 w-4" />
                Retry Run
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
