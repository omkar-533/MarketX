/**
 * WOLF instrument-master snapshot for scanner universes.
 * DEMO and LIVE (until broker F&O master is fully wired) use these lists.
 * Numbers shown in UI must come from these arrays (or provider intersection) — never fake sizes.
 *
 * Note: F&O here = equity UNDERLYINGS commonly available for chart/scan analysis,
 * not every option/futures contract row.
 */
import nseEquityData from '../../data/nseEquity.json';
import { NSE_FNO_EQUITY_UNDERLYINGS } from '../../data/nseFnoUnderlyings';

export const NIFTY_50_SYMBOLS = [
  'ADANIENT',
  'ADANIPORTS',
  'APOLLOHOSP',
  'ASIANPAINT',
  'AXISBANK',
  'BAJAJFINSV',
  'BAJFINANCE',
  'BHARTIARTL',
  'BPCL',
  'BRITANNIA',
  'CIPLA',
  'COALINDIA',
  'DIVISLAB',
  'DRREDDY',
  'EICHERMOT',
  'GRASIM',
  'HCLTECH',
  'HDFCBANK',
  'HDFCLIFE',
  'HEROMOTOCO',
  'HINDALCO',
  'HINDUNILVR',
  'ICICIBANK',
  'INDUSINDBK',
  'INFY',
  'ITC',
  'JSWSTEEL',
  'KOTAKBANK',
  'LT',
  'M&M',
  'MARUTI',
  'NESTLEIND',
  'NTPC',
  'ONGC',
  'POWERGRID',
  'RELIANCE',
  'SBILIFE',
  'SBIN',
  'SUNPHARMA',
  'TATACONSUM',
  'TATAMOTORS',
  'TATASTEEL',
  'TCS',
  'TECHM',
  'TITAN',
  'ULTRACEMCO',
  'WIPRO',
  'BEL',
  'TRENT',
  'LICI',
] as const;

/** F&O equity underlyings beyond Nifty 50 — derived from the live FO master. */
export const FNO_EXTRA_UNDERLYINGS = NSE_FNO_EQUITY_UNDERLYINGS.filter(
  (s) => !(NIFTY_50_SYMBOLS as readonly string[]).includes(s),
);

export function getNifty50Universe(): string[] {
  return [...NIFTY_50_SYMBOLS];
}

export function getFnoUniverse(): string[] {
  return [...NSE_FNO_EQUITY_UNDERLYINGS];
}

export function getCashUniverse(): string[] {
  const rows = nseEquityData as Array<{ s?: string }>;
  return [...new Set(rows.map((r) => String(r.s || '').toUpperCase()).filter(Boolean))];
}

export type CatalogUniverseId =
  | 'F&O'
  | 'NSE'
  | 'BSE'
  | 'NIFTY50'
  | 'CASH'
  | 'NIFTY'
  | 'BANKNIFTY';

export function resolveCatalogUniverse(id: string): string[] {
  switch (id) {
    case 'NIFTY50':
    case 'NIFTY':
      return getNifty50Universe();
    case 'CASH':
      return getCashUniverse();
    case 'NSE':
    case 'BSE':
      // DEMO / offline: honest snapshot only — full lists come from LIVE instrument master.
      return getFnoUniverse();
    case 'BANKNIFTY':
      return [
        'HDFCBANK',
        'ICICIBANK',
        'AXISBANK',
        'KOTAKBANK',
        'SBIN',
        'INDUSINDBK',
        'BANKBARODA',
        'FEDERALBNK',
        'IDFCFIRSTB',
        'PNB',
        'AUBANK',
        'BANDHANBNK',
      ];
    case 'F&O':
    default:
      return getFnoUniverse();
  }
}

export function catalogUniverseMeta(id: string): { id: string; label: string; count: number; note: string } {
  const symbols = resolveCatalogUniverse(id);
  const labels: Record<string, string> = {
    'F&O': 'F&O underlyings',
    NSE: 'NSE equity (DEMO snapshot)',
    BSE: 'BSE equity (DEMO snapshot)',
    NIFTY50: 'NIFTY 50',
    CASH: 'NSE cash (all EQ)',
    NIFTY: 'NIFTY 50',
    BANKNIFTY: 'Bank Nifty basket',
  };
  return {
    id,
    label: labels[id] || id,
    count: symbols.length,
    note:
      id === 'F&O'
        ? 'NSE F&O equity underlyings from the live FO master (not every futures/options contract).'
        : id === 'NSE' || id === 'BSE'
          ? 'Connect INDstocks to load the complete equity universe from the official instrument master. DEMO shows a snapshot only.'
          : 'Constituent snapshot from WOLF instrument master.',
  };
}
