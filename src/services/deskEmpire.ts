/**
 * Wolf Desk Empire — virtual bank, luxury shop, garage inventory.
 */

export type ShopCategory = 'watch' | 'car' | 'property' | 'desk';

export type ShopItem = {
  id: string;
  name: string;
  blurb: string;
  price: number;
  category: ShopCategory;
  /** CSS accent for card chrome */
  tone: string;
  tier: 1 | 2 | 3;
};

export type DeskEmpireState = {
  bank: number;
  streak: number;
  bestStreak: number;
  rounds: number;
  wins: number;
  inventory: string[];
  totalPnl: number;
};

const STORAGE = 'wolf_desk_empire_v1';
export const STARTING_BANK = 50_000;

export const SHOP_CATALOG: ShopItem[] = [
  {
    id: 'watch_steel',
    name: 'Steel Chrono',
    blurb: 'Entry flex — desk-ready steel watch',
    price: 8_000,
    category: 'watch',
    tone: '#94a3b8',
    tier: 1,
  },
  {
    id: 'watch_gold',
    name: 'Gold Bezel',
    blurb: 'Warm gold rim — win streak energy',
    price: 22_000,
    category: 'watch',
    tone: '#d4af37',
    tier: 2,
  },
  {
    id: 'watch_royal',
    name: 'Royal Skeleton',
    blurb: 'Open-heart luxury piece',
    price: 55_000,
    category: 'watch',
    tone: '#f59e0b',
    tier: 3,
  },
  {
    id: 'car_coupe',
    name: 'City Coupe',
    blurb: 'Clean lines for the after-close drive',
    price: 45_000,
    category: 'car',
    tone: '#38bdf8',
    tier: 1,
  },
  {
    id: 'car_gt',
    name: 'Midnight GT',
    blurb: 'Blacked-out grand tourer',
    price: 95_000,
    category: 'car',
    tone: '#f97316',
    tier: 2,
  },
  {
    id: 'car_hyper',
    name: 'Apex Hyper',
    blurb: 'Top-shelf garage flex',
    price: 180_000,
    category: 'car',
    tone: '#ef4444',
    tier: 3,
  },
  {
    id: 'prop_loft',
    name: 'Skyline Loft',
    blurb: 'Glass loft overlooking the tape',
    price: 120_000,
    category: 'property',
    tone: '#34d399',
    tier: 1,
  },
  {
    id: 'prop_villa',
    name: 'Coast Villa',
    blurb: 'Weekend villa — process over noise',
    price: 220_000,
    category: 'property',
    tone: '#2dd4bf',
    tier: 2,
  },
  {
    id: 'prop_penthouse',
    name: 'Empire Penthouse',
    blurb: 'Full-floor desk empire HQ',
    price: 400_000,
    category: 'property',
    tone: '#d4af37',
    tier: 3,
  },
  {
    id: 'desk_ultrawide',
    name: 'Ultrawide Stack',
    blurb: 'Triple-screen tape wall',
    price: 12_000,
    category: 'desk',
    tone: '#60a5fa',
    tier: 1,
  },
  {
    id: 'desk_chair',
    name: 'Pilot Chair',
    blurb: 'All-day session throne',
    price: 18_000,
    category: 'desk',
    tone: '#a78bfa',
    tier: 2,
  },
  {
    id: 'desk_art',
    name: 'Liquidity Art',
    blurb: 'Canvas of equal highs — wall flex',
    price: 35_000,
    category: 'desk',
    tone: '#f472b6',
    tier: 3,
  },
];

function emptyState(): DeskEmpireState {
  return {
    bank: STARTING_BANK,
    streak: 0,
    bestStreak: 0,
    rounds: 0,
    wins: 0,
    inventory: [],
    totalPnl: 0,
  };
}

export function loadDeskEmpire(ownerKey = 'guest'): DeskEmpireState {
  if (typeof window === 'undefined') return emptyState();
  try {
    const raw = window.localStorage.getItem(`${STORAGE}:${ownerKey}`);
    const parsed = raw ? (JSON.parse(raw) as Partial<DeskEmpireState>) : null;
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return {
      ...emptyState(),
      ...parsed,
      bank: Number(parsed.bank) || STARTING_BANK,
      streak: Number(parsed.streak) || 0,
      bestStreak: Number(parsed.bestStreak) || 0,
      rounds: Number(parsed.rounds) || 0,
      wins: Number(parsed.wins) || 0,
      inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
      totalPnl: Number(parsed.totalPnl) || 0,
    };
  } catch {
    return emptyState();
  }
}

function saveDeskEmpire(state: DeskEmpireState, ownerKey = 'guest'): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${STORAGE}:${ownerKey}`, JSON.stringify(state));
}

export function formatDeskCash(n: number): string {
  const abs = Math.abs(Math.round(n));
  if (abs >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  if (abs >= 1_000) return `₹${(n / 1_000).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

export function applyRoundPnl(
  pnl: number,
  ownerKey = 'guest',
): DeskEmpireState {
  const prev = loadDeskEmpire(ownerKey);
  const win = pnl > 0;
  const streak = win ? prev.streak + 1 : 0;
  const next: DeskEmpireState = {
    ...prev,
    bank: Math.max(0, prev.bank + pnl),
    streak,
    bestStreak: Math.max(prev.bestStreak, streak),
    rounds: prev.rounds + 1,
    wins: prev.wins + (win ? 1 : 0),
    totalPnl: prev.totalPnl + pnl,
  };
  saveDeskEmpire(next, ownerKey);
  return next;
}

export function buyShopItem(itemId: string, ownerKey = 'guest'): DeskEmpireState | null {
  const item = SHOP_CATALOG.find((x) => x.id === itemId);
  if (!item) return null;
  const prev = loadDeskEmpire(ownerKey);
  if (prev.inventory.includes(itemId)) return prev;
  if (prev.bank < item.price) return null;
  const next: DeskEmpireState = {
    ...prev,
    bank: prev.bank - item.price,
    inventory: [...prev.inventory, itemId],
  };
  saveDeskEmpire(next, ownerKey);
  return next;
}

export function shopItemById(id: string): ShopItem | undefined {
  return SHOP_CATALOG.find((x) => x.id === id);
}

export function ownedItems(state: DeskEmpireState): ShopItem[] {
  return state.inventory
    .map((id) => shopItemById(id))
    .filter((x): x is ShopItem => Boolean(x));
}

export const STAKE_OPTIONS = [1_000, 5_000, 10_000, 25_000] as const;
