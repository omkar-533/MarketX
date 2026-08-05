/**
 * Wolf Trade Quest — campaign levels, stars, coins, badges, titles, power-ups.
 */

import type { ArenaTopic } from './mentorArenaBank';

export type QuestMode = 'standard' | 'rush' | 'boss';
export type PowerUpId = 'heart' | 'clock' | 'shield';

export type QuestBadge = {
  id: string;
  name: string;
  blurb: string;
};

export type QuestTitle = {
  id: string;
  name: string;
};

export type QuestLevel = {
  id: number;
  title: string;
  blurb: string;
  world: string;
  topics: ArenaTopic[];
  /** topic → relative weight; empty = equal */
  topicWeights?: Partial<Record<ArenaTopic, number>>;
  mode: QuestMode;
  lives: number;
  questions: number;
  qSeconds: number;
  /** allow live/historical tape drills (boss finale) */
  allowLiveTape?: boolean;
  reward: {
    coins: number;
    badge?: QuestBadge;
    title?: QuestTitle;
    powerUp?: PowerUpId;
    powerUpQty?: number;
  };
};

export type QuestPowerUps = Record<PowerUpId, number>;

export type QuestProgress = {
  cleared: Record<string, number>; // levelId -> best stars 1-3
  coins: number;
  badges: string[];
  titles: string[];
  equippedTitle: string;
  powerups: QuestPowerUps;
  totalStars: number;
  survivalUnlocked: boolean;
};

export const POWERUP_SHOP: Record<
  PowerUpId,
  { name: string; blurb: string; cost: number }
> = {
  heart: { name: 'Extra Heart', blurb: '+1 life for next mission', cost: 40 },
  clock: { name: '+5s Clock', blurb: 'Extra 5 seconds per question', cost: 35 },
  shield: { name: 'Miss Shield', blurb: 'First miss forgiven', cost: 50 },
};

export const ALL_BADGES: QuestBadge[] = [
  { id: 'wick_reader', name: 'Wick Reader', blurb: 'Cleared Candle Rookie' },
  { id: 'wick_hunter', name: 'Wick Hunter', blurb: 'Cleared Wick Hunter' },
  { id: 'candle_sensei_badge', name: 'Dojo Mark', blurb: 'Beat Candle Dojo Boss' },
  { id: 'trend_scout', name: 'Trend Scout', blurb: 'Cleared Trend Trail' },
  { id: 'magnet_mind', name: 'Magnet Mind', blurb: 'Cleared Magnet Levels' },
  { id: 'liq_diver', name: 'Liquidity Diver', blurb: 'Cleared Liquidity Pit' },
  { id: 'pa_forger', name: 'PA Forger', blurb: 'Cleared Action Forge' },
  { id: 'fomo_slayer', name: 'FOMO Slayer', blurb: 'Cleared Mind Trap' },
  { id: 'risk_warden', name: 'Risk Warden', blurb: 'Cleared Risk Gate' },
  { id: 'desk_legend', name: 'Desk Legend', blurb: 'Cleared the finale' },
];

export const ALL_TITLES: QuestTitle[] = [
  { id: 'rookie', name: 'Tape Rookie' },
  { id: 'candle_sensei', name: 'Candle Sensei' },
  { id: 'structure_runner', name: 'Structure Runner' },
  { id: 'liquidity_ghost', name: 'Liquidity Ghost' },
  { id: 'mind_forge', name: 'Mind Forge' },
  { id: 'desk_legend_title', name: 'Desk Legend' },
];

export const CAMPAIGN_LEVELS: QuestLevel[] = [
  {
    id: 1,
    title: 'Candle Rookie',
    blurb: 'Learn body, wick, OHLC — the language of every chart.',
    world: 'Candle Dojo',
    topics: ['candle'],
    mode: 'standard',
    lives: 3,
    questions: 5,
    qSeconds: 20,
    reward: {
      coins: 25,
      badge: ALL_BADGES[0],
      title: ALL_TITLES[0],
      powerUp: 'clock',
      powerUpQty: 1,
    },
  },
  {
    id: 2,
    title: 'Wick Hunter',
    blurb: 'Rejection wicks + candle psychology under speed pressure.',
    world: 'Candle Dojo',
    topics: ['candle', 'candle_psych'],
    topicWeights: { candle: 1, candle_psych: 1.2 },
    mode: 'rush',
    lives: 3,
    questions: 6,
    qSeconds: 14,
    reward: {
      coins: 35,
      badge: ALL_BADGES[1],
      powerUp: 'heart',
      powerUpQty: 1,
    },
  },
  {
    id: 3,
    title: 'Candle Dojo Boss',
    blurb: 'Boss fight: candle psychology. Clear the dojo.',
    world: 'Candle Dojo',
    topics: ['candle_psych', 'candle'],
    topicWeights: { candle_psych: 2.2, candle: 1 },
    mode: 'boss',
    lives: 4,
    questions: 8,
    qSeconds: 16,
    reward: {
      coins: 60,
      badge: ALL_BADGES[2],
      title: ALL_TITLES[1],
      powerUp: 'shield',
      powerUpQty: 1,
    },
  },
  {
    id: 4,
    title: 'Trend Trail',
    blurb: 'HH/HL vs LH/LL — read bias from swings.',
    world: 'Structure Trail',
    topics: ['trend', 'structure'],
    mode: 'standard',
    lives: 3,
    questions: 6,
    qSeconds: 18,
    reward: {
      coins: 40,
      badge: ALL_BADGES[3],
      title: ALL_TITLES[2],
    },
  },
  {
    id: 5,
    title: 'Magnet Levels',
    blurb: 'Support/resistance + chart psychology magnets.',
    world: 'Structure Trail',
    topics: ['sr', 'chart_psych'],
    mode: 'standard',
    lives: 3,
    questions: 6,
    qSeconds: 17,
    reward: {
      coins: 45,
      badge: ALL_BADGES[4],
      powerUp: 'clock',
      powerUpQty: 1,
    },
  },
  {
    id: 6,
    title: 'Liquidity Pit',
    blurb: 'Stops, sweeps, equal highs — rush mode.',
    world: 'Liquidity Pit',
    topics: ['liquidity'],
    mode: 'rush',
    lives: 3,
    questions: 6,
    qSeconds: 13,
    reward: {
      coins: 50,
      badge: ALL_BADGES[5],
      title: ALL_TITLES[3],
    },
  },
  {
    id: 7,
    title: 'Action Forge',
    blurb: 'Acceptance, rejection, follow-through + candle psych.',
    world: 'Liquidity Pit',
    topics: ['price_action', 'candle_psych'],
    mode: 'standard',
    lives: 3,
    questions: 7,
    qSeconds: 17,
    reward: {
      coins: 55,
      badge: ALL_BADGES[6],
      powerUp: 'heart',
      powerUpQty: 1,
    },
  },
  {
    id: 8,
    title: 'Mind Trap',
    blurb: 'FOMO, revenge, chart traps — keep your head.',
    world: 'Mind Forge',
    topics: ['psych', 'chart_psych', 'candle_psych'],
    topicWeights: { psych: 1.4, chart_psych: 1.2, candle_psych: 1 },
    mode: 'rush',
    lives: 3,
    questions: 7,
    qSeconds: 14,
    reward: {
      coins: 60,
      badge: ALL_BADGES[7],
      title: ALL_TITLES[4],
      powerUp: 'shield',
      powerUpQty: 1,
    },
  },
  {
    id: 9,
    title: 'Risk Gate',
    blurb: 'Survive first. Size, invalidation, no-trade discipline.',
    world: 'Mind Forge',
    topics: ['risk', 'psych'],
    mode: 'standard',
    lives: 3,
    questions: 6,
    qSeconds: 18,
    reward: {
      coins: 65,
      badge: ALL_BADGES[8],
      powerUp: 'heart',
      powerUpQty: 2,
    },
  },
  {
    id: 10,
    title: 'Desk Legend',
    blurb: 'Finale boss — full desk mix + live tape reads.',
    world: 'Desk Boss',
    topics: [
      'candle',
      'candle_psych',
      'chart_psych',
      'trend',
      'structure',
      'sr',
      'liquidity',
      'price_action',
      'risk',
      'psych',
      'smc',
      'basics',
    ],
    mode: 'boss',
    lives: 4,
    questions: 10,
    qSeconds: 15,
    allowLiveTape: true,
    reward: {
      coins: 120,
      badge: ALL_BADGES[9],
      title: ALL_TITLES[5],
      powerUp: 'shield',
      powerUpQty: 2,
    },
  },
];

const STORAGE = 'wolf_mentor_quest_v1';

function emptyProgress(): QuestProgress {
  return {
    cleared: {},
    coins: 0,
    badges: [],
    titles: [],
    equippedTitle: '',
    powerups: { heart: 0, clock: 0, shield: 0 },
    totalStars: 0,
    survivalUnlocked: false,
  };
}

export function loadQuestProgress(ownerKey = 'guest'): QuestProgress {
  if (typeof window === 'undefined') return emptyProgress();
  try {
    const raw = window.localStorage.getItem(`${STORAGE}:${ownerKey}`);
    const parsed = raw ? (JSON.parse(raw) as Partial<QuestProgress>) : null;
    if (!parsed || typeof parsed !== 'object') return emptyProgress();
    const base = emptyProgress();
    return {
      ...base,
      ...parsed,
      cleared: parsed.cleared && typeof parsed.cleared === 'object' ? parsed.cleared : {},
      badges: Array.isArray(parsed.badges) ? parsed.badges : [],
      titles: Array.isArray(parsed.titles) ? parsed.titles : [],
      powerups: {
        heart: Number(parsed.powerups?.heart) || 0,
        clock: Number(parsed.powerups?.clock) || 0,
        shield: Number(parsed.powerups?.shield) || 0,
      },
      coins: Number(parsed.coins) || 0,
      totalStars: Number(parsed.totalStars) || 0,
      survivalUnlocked: Boolean(parsed.survivalUnlocked),
      equippedTitle: String(parsed.equippedTitle || ''),
    };
  } catch {
    return emptyProgress();
  }
}

function saveQuestProgress(progress: QuestProgress, ownerKey = 'guest'): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${STORAGE}:${ownerKey}`, JSON.stringify(progress));
}

export function getLevel(id: number): QuestLevel | undefined {
  return CAMPAIGN_LEVELS.find((l) => l.id === id);
}

export function isLevelUnlocked(levelId: number, progress: QuestProgress): boolean {
  if (levelId <= 1) return true;
  const prev = progress.cleared[String(levelId - 1)] || 0;
  return prev >= 1;
}

export function computeStars(input: {
  correct: number;
  total: number;
  livesLeft: number;
  livesMax: number;
  comboMax: number;
  cleared: boolean;
}): number {
  if (!input.cleared || input.total <= 0) return 0;
  const acc = input.correct / input.total;
  let stars = 1;
  if (acc >= 0.7 && input.livesLeft >= 1) stars = 2;
  if (acc >= 0.85 && input.livesLeft >= Math.max(1, Math.floor(input.livesMax / 2)) && input.comboMax >= 2) {
    stars = 3;
  }
  if (acc >= 0.95 && input.livesLeft === input.livesMax) stars = 3;
  return stars;
}

export type ChestLoot = {
  coins: number;
  badge?: QuestBadge;
  title?: QuestTitle;
  powerUp?: PowerUpId;
  powerUpQty: number;
  firstClear: boolean;
  stars: number;
  bestStars: number;
  newBest: boolean;
};

export type LevelClearResult = {
  progress: QuestProgress;
  loot: ChestLoot;
  unlockedNext: number | null;
};

export function applyLevelClear(
  levelId: number,
  stars: number,
  ownerKey = 'guest',
): LevelClearResult {
  const level = getLevel(levelId);
  const progress = loadQuestProgress(ownerKey);
  if (!level || stars < 1) {
    return {
      progress,
      loot: {
        coins: 0,
        powerUpQty: 0,
        firstClear: false,
        stars: 0,
        bestStars: progress.cleared[String(levelId)] || 0,
        newBest: false,
      },
      unlockedNext: null,
    };
  }

  const key = String(levelId);
  const prevStars = progress.cleared[key] || 0;
  const firstClear = prevStars === 0;
  const newBest = stars > prevStars;
  const bestStars = Math.max(prevStars, stars);

  let coinsGain = 0;
  if (firstClear) coinsGain += level.reward.coins;
  else if (newBest) coinsGain += Math.round(level.reward.coins * 0.35);
  else if (stars >= 3) coinsGain += Math.round(level.reward.coins * 0.2);

  const loot: ChestLoot = {
    coins: coinsGain,
    powerUpQty: 0,
    firstClear,
    stars,
    bestStars,
    newBest,
  };

  if (firstClear) {
    if (level.reward.badge) loot.badge = level.reward.badge;
    if (level.reward.title) loot.title = level.reward.title;
    if (level.reward.powerUp) {
      loot.powerUp = level.reward.powerUp;
      loot.powerUpQty = level.reward.powerUpQty || 1;
    }
  } else if (stars >= 3 && prevStars < 3 && level.reward.powerUp) {
    loot.powerUp = level.reward.powerUp;
    loot.powerUpQty = 1;
  }

  const badges = [...progress.badges];
  if (loot.badge && !badges.includes(loot.badge.id)) badges.push(loot.badge.id);

  const titles = [...progress.titles];
  if (loot.title && !titles.includes(loot.title.id)) titles.push(loot.title.id);

  const powerups = { ...progress.powerups };
  if (loot.powerUp && loot.powerUpQty > 0) {
    powerups[loot.powerUp] = (powerups[loot.powerUp] || 0) + loot.powerUpQty;
  }

  const cleared = { ...progress.cleared, [key]: bestStars };
  let totalStars = 0;
  for (const v of Object.values(cleared)) totalStars += Number(v) || 0;

  const next: QuestProgress = {
    ...progress,
    cleared,
    coins: progress.coins + coinsGain,
    badges,
    titles,
    powerups,
    totalStars,
    survivalUnlocked: progress.survivalUnlocked || levelId >= 3,
    equippedTitle:
      progress.equippedTitle ||
      (loot.title ? loot.title.id : progress.equippedTitle),
  };

  if (loot.title && !progress.equippedTitle) {
    next.equippedTitle = loot.title.id;
  }

  saveQuestProgress(next, ownerKey);

  const unlockedNext =
    firstClear && getLevel(levelId + 1) ? levelId + 1 : null;

  return { progress: next, loot, unlockedNext };
}

export function equipTitle(titleId: string, ownerKey = 'guest'): QuestProgress {
  const progress = loadQuestProgress(ownerKey);
  if (titleId && !progress.titles.includes(titleId)) return progress;
  const next = { ...progress, equippedTitle: titleId };
  saveQuestProgress(next, ownerKey);
  return next;
}

export function addQuestCoins(amount: number, ownerKey = 'guest'): QuestProgress {
  const progress = loadQuestProgress(ownerKey);
  const next = { ...progress, coins: progress.coins + Math.max(0, Math.round(amount)) };
  saveQuestProgress(next, ownerKey);
  return next;
}

export function buyPowerUp(id: PowerUpId, ownerKey = 'guest'): QuestProgress | null {
  const progress = loadQuestProgress(ownerKey);
  const cost = POWERUP_SHOP[id].cost;
  if (progress.coins < cost) return null;
  const next: QuestProgress = {
    ...progress,
    coins: progress.coins - cost,
    powerups: {
      ...progress.powerups,
      [id]: (progress.powerups[id] || 0) + 1,
    },
  };
  saveQuestProgress(next, ownerKey);
  return next;
}

/** Consume one power-up from inventory. Returns false if none. */
export function consumePowerUp(id: PowerUpId, ownerKey = 'guest'): boolean {
  const progress = loadQuestProgress(ownerKey);
  if ((progress.powerups[id] || 0) <= 0) return false;
  const next: QuestProgress = {
    ...progress,
    powerups: {
      ...progress.powerups,
      [id]: progress.powerups[id] - 1,
    },
  };
  saveQuestProgress(next, ownerKey);
  return true;
}

export function titleName(id: string): string {
  return ALL_TITLES.find((t) => t.id === id)?.name || '';
}

export function badgeById(id: string): QuestBadge | undefined {
  return ALL_BADGES.find((b) => b.id === id);
}

export function modeLabel(mode: QuestMode): string {
  if (mode === 'rush') return 'RUSH';
  if (mode === 'boss') return 'BOSS';
  return 'STANDARD';
}

export function rewardPreview(level: QuestLevel): string {
  const parts: string[] = [`${level.reward.coins} coins`];
  if (level.reward.badge) parts.push(level.reward.badge.name);
  if (level.reward.title) parts.push(`Title: ${level.reward.title.name}`);
  if (level.reward.powerUp) {
    parts.push(POWERUP_SHOP[level.reward.powerUp].name);
  }
  return parts.join(' · ');
}
