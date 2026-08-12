/**
 * WOLF instrument-master snapshot for scanner universes.
 * DEMO and LIVE (until broker F&O master is fully wired) use these lists.
 * Numbers shown in UI must come from these arrays (or provider intersection) — never fake sizes.
 *
 * Note: F&O here = equity UNDERLYINGS commonly available for chart/scan analysis,
 * not every option/futures contract row.
 */
import nseEquityData from '../../data/nseEquity.json';
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

/** Mid/large F&O underlyings beyond Nifty 50 (scan universe expansion). */
export const FNO_EXTRA_UNDERLYINGS = [
  'ABB',
  'ABCAPITAL',
  'ABFRL',
  'ACC',
  'AARTIIND',
  'ALKEM',
  'AMBUJACEM',
  'ANGELONE',
  'ASHOKLEY',
  'ASTRAL',
  'ATUL',
  'AUBANK',
  'AUROPHARMA',
  'BALKRISIND',
  'BANDHANBNK',
  'BANKBARODA',
  'BATAINDIA',
  'BERGEPAINT',
  'BIOCON',
  'BHEL',
  'BOSCHLTD',
  'CANBK',
  'CANFINHOME',
  'CHAMBLFERT',
  'CHOLAFIN',
  'COLPAL',
  'CONCOR',
  'COROMANDEL',
  'CROMPTON',
  'CUMMINSIND',
  'DABUR',
  'DALBHARAT',
  'DEEPAKNTR',
  'DELHIVERY',
  'DIXON',
  'DLF',
  'DMART',
  'ESCORTS',
  'EXIDEIND',
  'FEDERALBNK',
  'GAIL',
  'GLENMARK',
  'GMRINFRA',
  'GNFC',
  'GODREJCP',
  'GODREJPROP',
  'GRANULES',
  'HAL',
  'HAVELLS',
  'HDFCAMC',
  'HINDPETRO',
  'HINDZINC',
  'IDFC',
  'IDFCFIRSTB',
  'IEX',
  'IGL',
  'INDIACEM',
  'INDIAMART',
  'INDIGO',
  'INDUSTOWER',
  'IOC',
  'IPCALAB',
  'IRCTC',
  'IRFC',
  'JINDALSTEL',
  'JIOFIN',
  'JKCEMENT',
  'JUBLFOOD',
  'KALYANKJIL',
  'KEI',
  'LALPATHLAB',
  'LAURUSLABS',
  'LICHSGFIN',
  'LODHA',
  'LTIM',
  'LUPIN',
  'MANAPPURAM',
  'MARICO',
  'MCX',
  'METROPOLIS',
  'MFSL',
  'MGL',
  'MOTHERSON',
  'MPHASIS',
  'MRF',
  'MUTHOOTFIN',
  'NAM-INDIA',
  'NAUKRI',
  'NAVINFLUOR',
  'NMDC',
  'OBEROIRLTY',
  'OFSS',
  'PAGEIND',
  'PATANJALI',
  'PEL',
  'PERSISTENT',
  'PETRONET',
  'PFC',
  'PIDILITIND',
  'PIIND',
  'PNB',
  'POLYCAB',
  'PVRINOX',
  'RAMCOCEM',
  'RBLBANK',
  'RECLTD',
  'SAIL',
  'SBICARD',
  'SHREECEM',
  'SIEMENS',
  'SRF',
  'SUPREMEIND',
  'SYNGENE',
  'TATACHEM',
  'TATACOMM',
  'TATAELXSI',
  'TATAPOWER',
  'TORNTPHARM',
  'TORNTPOWER',
  'TVSMOTOR',
  'UBL',
  'UPL',
  'VEDL',
  'VOLTAS',
  'YESBANK',
  'ZOMATO',
  'ZYDUSLIFE',
] as const;

export function getNifty50Universe(): string[] {
  return [...NIFTY_50_SYMBOLS];
}

export function getFnoUniverse(): string[] {
  return [...new Set([...NIFTY_50_SYMBOLS, ...FNO_EXTRA_UNDERLYINGS])];
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
        ? 'Equity underlyings from WOLF instrument master (not every FO contract). Connect LIVE for the full FO underlying list.'
        : id === 'NSE' || id === 'BSE'
          ? 'Connect INDstocks to load the complete equity universe from the official instrument master. DEMO shows a snapshot only.'
          : 'Constituent snapshot from WOLF instrument master.',
  };
}
