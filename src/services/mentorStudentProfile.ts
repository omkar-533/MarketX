/** Student intake + weak-area memory for Wolf Mentor curriculum. */

export type TradingExperience = 'none' | 'beginner' | 'intermediate' | 'advanced';
export type CapitalBand = 'under25k' | '25k_1L' | '1L_5L' | 'above5L' | 'paper';
export type MentorMarket = 'nse_fno' | 'nse_cash' | 'crypto' | 'global' | 'mixed';
export type MentorGoal = 'learn' | 'intraday' | 'swing' | 'discipline' | 'career';

export type MentorStudentProfile = {
  name: string;
  language: string;
  experience: TradingExperience;
  capital: CapitalBand;
  market: MentorMarket;
  goal: MentorGoal;
  minutesPerDay: number;
  weakAreas: string[];
  onboardedAt: string;
};

const STORAGE = 'wolf_mentor_student_v1';

function storageKey(ownerKey: string) {
  return `${STORAGE}:${ownerKey || 'guest'}`;
}

export function loadStudentProfile(ownerKey = 'guest'): MentorStudentProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(ownerKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MentorStudentProfile;
    if (!parsed?.name || !parsed?.onboardedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStudentProfile(profile: MentorStudentProfile, ownerKey = 'guest'): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(ownerKey), JSON.stringify(profile));
}

export function isStudentOnboarded(ownerKey = 'guest'): boolean {
  return Boolean(loadStudentProfile(ownerKey));
}

export function rememberWeakArea(topic: string, ownerKey = 'guest'): void {
  const profile = loadStudentProfile(ownerKey);
  if (!profile) return;
  const t = topic.trim();
  if (!t) return;
  if (!profile.weakAreas.some((w) => w.toLowerCase() === t.toLowerCase())) {
    profile.weakAreas = [...profile.weakAreas, t].slice(-12);
    saveStudentProfile(profile, ownerKey);
  }
}

export const EXPERIENCE_OPTIONS: { id: TradingExperience; label: string }[] = [
  { id: 'none', label: 'Zero — just starting' },
  { id: 'beginner', label: 'Beginner — basics only' },
  { id: 'intermediate', label: 'Intermediate — some chart reading' },
  { id: 'advanced', label: 'Advanced — active trader' },
];

export const CAPITAL_OPTIONS: { id: CapitalBand; label: string }[] = [
  { id: 'paper', label: 'Paper / practice only' },
  { id: 'under25k', label: 'Under ₹25,000' },
  { id: '25k_1L', label: '₹25,000 – ₹1L' },
  { id: '1L_5L', label: '₹1L – ₹5L' },
  { id: 'above5L', label: 'Above ₹5L' },
];

export const MARKET_OPTIONS: { id: MentorMarket; label: string }[] = [
  { id: 'nse_fno', label: 'NSE F&O (Nifty / BankNifty)' },
  { id: 'nse_cash', label: 'NSE cash equities' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'global', label: 'Global indices / forex' },
  { id: 'mixed', label: 'Mixed' },
];

export const GOAL_OPTIONS: { id: MentorGoal; label: string }[] = [
  { id: 'learn', label: 'Learn markets from zero' },
  { id: 'intraday', label: 'Intraday process' },
  { id: 'swing', label: 'Swing / positional' },
  { id: 'discipline', label: 'Discipline & psychology' },
  { id: 'career', label: 'Serious trading craft' },
];

export const WEAK_AREA_OPTIONS = [
  'Market basics',
  'Candlesticks',
  'Trend',
  'Support / Resistance',
  'Liquidity',
  'Market structure',
  'SMC',
  'Risk',
  'Psychology',
  'Patience',
];
