/** Wolf AI visual setup analysis modes — modular strategy router (MVP). */

export type WolfAnalysisMode =
  | 'auto'
  | 'support_resistance'
  | 'liquidity'
  | 'market_structure'
  | 'breakout'
  | 'reversal'
  | 'supply_demand'
  | 'price_action'
  | 'smc'
  | 'ict'
  | 'fibonacci'
  | 'momentum'
  | 'trend'
  | 'mbp'
  | 'custom';

export type WolfAnalysisModeMeta = {
  id: WolfAnalysisMode;
  label: string;
  short: string;
  hint: string;
  /** MVP engines get full strategy depth; others still run with lighter mode rules */
  tier: 'core' | 'extended';
};

export const WOLF_ANALYSIS_MODES: WolfAnalysisModeMeta[] = [
  { id: 'auto', label: 'Auto', short: 'AUTO', hint: 'Confluence across engines', tier: 'core' },
  { id: 'support_resistance', label: 'S / R', short: 'S/R', hint: 'Zones · retests · role flip', tier: 'core' },
  { id: 'liquidity', label: 'Liquidity', short: 'LIQ', hint: 'Sweeps · BSL/SSL · confirmation', tier: 'core' },
  { id: 'market_structure', label: 'Structure', short: 'STR', hint: 'HH/HL · BOS · CHOCH', tier: 'core' },
  { id: 'breakout', label: 'Breakout', short: 'BO', hint: 'Range · displacement · retest', tier: 'extended' },
  { id: 'reversal', label: 'Reversal', short: 'REV', hint: 'Exhaustion · confirmation', tier: 'extended' },
  { id: 'supply_demand', label: 'Supply/Demand', short: 'S/D', hint: 'Base · impulse · fresh/tested', tier: 'extended' },
  { id: 'price_action', label: 'Price Action', short: 'PA', hint: 'Rejection · momentum in context', tier: 'extended' },
  { id: 'smc', label: 'SMC', short: 'SMC', hint: 'OB · FVG · BOS · liquidity', tier: 'extended' },
  { id: 'ict', label: 'ICT', short: 'ICT', hint: 'MSS · premium/discount · sweeps', tier: 'extended' },
  { id: 'fibonacci', label: 'Fibonacci', short: 'FIB', hint: 'Pullback · confluence', tier: 'extended' },
  { id: 'momentum', label: 'Momentum', short: 'MOM', hint: 'Expansion · compression', tier: 'extended' },
  { id: 'trend', label: 'Trend', short: 'TRD', hint: 'Higher highs / lower lows', tier: 'extended' },
  { id: 'mbp', label: 'MBP', short: 'MBP', hint: 'Proprietary framework v1', tier: 'extended' },
  { id: 'custom', label: 'Custom', short: 'CST', hint: 'Follow user instructions only', tier: 'extended' },
];

const STORAGE_KEY = 'wolf_ai_analysis_mode';

const VALID = new Set(WOLF_ANALYSIS_MODES.map((m) => m.id));

export function isWolfAnalysisMode(v: unknown): v is WolfAnalysisMode {
  return typeof v === 'string' && VALID.has(v as WolfAnalysisMode);
}

export function loadWolfAnalysisMode(): WolfAnalysisMode {
  if (typeof window === 'undefined') return 'auto';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return isWolfAnalysisMode(v) ? v : 'auto';
}

export function saveWolfAnalysisMode(mode: WolfAnalysisMode): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, mode);
}

export function wolfAnalysisModeLabel(mode: WolfAnalysisMode): string {
  return WOLF_ANALYSIS_MODES.find((m) => m.id === mode)?.label ?? 'Auto';
}
