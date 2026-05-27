/** NSE F&O universe — indices + stock FNO (base refs for live simulation) */

import { buildExtendedFnoStocks } from './fnoStocksExtended';

export type FnoInstrumentType = 'index' | 'stock';

export interface FnoInstrument {
  symbol: string;
  name: string;
  type: FnoInstrumentType;
  sector: string;
  basePrice: number;
  lotSize: number;
  strikeInterval?: number;
  ivBase?: number;
}

export const FNO_INDICES: FnoInstrument[] = [
  { symbol: 'NIFTY', name: 'NIFTY 50', type: 'index', sector: 'Index', basePrice: 24580, lotSize: 25, strikeInterval: 50, ivBase: 16 },
  { symbol: 'BANKNIFTY', name: 'BANK NIFTY', type: 'index', sector: 'Index', basePrice: 52450, lotSize: 15, strikeInterval: 100, ivBase: 18 },
  { symbol: 'FINNIFTY', name: 'FIN NIFTY', type: 'index', sector: 'Index', basePrice: 23890, lotSize: 25, strikeInterval: 50, ivBase: 15 },
  { symbol: 'MIDCPNIFTY', name: 'MIDCP NIFTY', type: 'index', sector: 'Index', basePrice: 14230, lotSize: 50, strikeInterval: 25, ivBase: 17 },
  { symbol: 'SENSEX', name: 'SENSEX', type: 'index', sector: 'Index', basePrice: 80560, lotSize: 10, strikeInterval: 100, ivBase: 15 },
  { symbol: 'BANKEX', name: 'BANKEX', type: 'index', sector: 'Index', basePrice: 58200, lotSize: 15, strikeInterval: 100, ivBase: 17 },
  { symbol: 'NIFTYNXT50', name: 'NIFTY NEXT 50', type: 'index', sector: 'Index', basePrice: 68500, lotSize: 10, strikeInterval: 50, ivBase: 16 },
];

/** NSE F&O stocks — liquid names */
export const FNO_STOCKS: FnoInstrument[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', type: 'stock', sector: 'Energy', basePrice: 2985, lotSize: 250 },
  { symbol: 'TCS', name: 'Tata Consultancy', type: 'stock', sector: 'IT', basePrice: 4258, lotSize: 175 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', type: 'stock', sector: 'Banking', basePrice: 1682, lotSize: 550 },
  { symbol: 'INFY', name: 'Infosys', type: 'stock', sector: 'IT', basePrice: 1856, lotSize: 400 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', type: 'stock', sector: 'Banking', basePrice: 1153, lotSize: 700 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', type: 'stock', sector: 'Telecom', basePrice: 1586, lotSize: 475 },
  { symbol: 'SBIN', name: 'State Bank of India', type: 'stock', sector: 'Banking', basePrice: 822, lotSize: 750 },
  { symbol: 'ITC', name: 'ITC', type: 'stock', sector: 'FMCG', basePrice: 448, lotSize: 1600 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', type: 'stock', sector: 'FMCG', basePrice: 2386, lotSize: 300 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', type: 'stock', sector: 'Banking', basePrice: 1783, lotSize: 400 },
  { symbol: 'AXISBANK', name: 'Axis Bank', type: 'stock', sector: 'Banking', basePrice: 1126, lotSize: 625 },
  { symbol: 'LT', name: 'Larsen & Toubro', type: 'stock', sector: 'Infra', basePrice: 3685, lotSize: 150 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', type: 'stock', sector: 'NBFC', basePrice: 6852, lotSize: 125 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', type: 'stock', sector: 'Consumer', basePrice: 2986, lotSize: 200 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', type: 'stock', sector: 'Auto', basePrice: 11258, lotSize: 50 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', type: 'stock', sector: 'Auto', basePrice: 953, lotSize: 800 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', type: 'stock', sector: 'Pharma', basePrice: 1786, lotSize: 350 },
  { symbol: 'ADANIENT', name: 'Adani Enterprises', type: 'stock', sector: 'Conglomerate', basePrice: 3158, lotSize: 300 },
  { symbol: 'WIPRO', name: 'Wipro', type: 'stock', sector: 'IT', basePrice: 325, lotSize: 1500 },
  { symbol: 'NTPC', name: 'NTPC', type: 'stock', sector: 'Power', basePrice: 389, lotSize: 1500 },
  { symbol: 'ONGC', name: 'ONGC', type: 'stock', sector: 'Energy', basePrice: 285, lotSize: 1925 },
  { symbol: 'POWERGRID', name: 'Power Grid', type: 'stock', sector: 'Power', basePrice: 329, lotSize: 1900 },
  { symbol: 'TITAN', name: 'Titan', type: 'stock', sector: 'Consumer', basePrice: 3585, lotSize: 175 },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement', type: 'stock', sector: 'Cement', basePrice: 11285, lotSize: 50 },
  { symbol: 'NESTLEIND', name: 'Nestle India', type: 'stock', sector: 'FMCG', basePrice: 2486, lotSize: 25 },
  { symbol: 'HCLTECH', name: 'HCL Technologies', type: 'stock', sector: 'IT', basePrice: 1685, lotSize: 350 },
  { symbol: 'TECHM', name: 'Tech Mahindra', type: 'stock', sector: 'IT', basePrice: 1585, lotSize: 600 },
  { symbol: 'TATASTEEL', name: 'Tata Steel', type: 'stock', sector: 'Metal', basePrice: 158, lotSize: 5500 },
  { symbol: 'JSWSTEEL', name: 'JSW Steel', type: 'stock', sector: 'Metal', basePrice: 985, lotSize: 675 },
  { symbol: 'HINDALCO', name: 'Hindalco', type: 'stock', sector: 'Metal', basePrice: 685, lotSize: 1400 },
  { symbol: 'COALINDIA', name: 'Coal India', type: 'stock', sector: 'Energy', basePrice: 485, lotSize: 2100 },
  { symbol: 'BPCL', name: 'BPCL', type: 'stock', sector: 'Energy', basePrice: 625, lotSize: 1800 },
  { symbol: 'IOC', name: 'Indian Oil', type: 'stock', sector: 'Energy', basePrice: 165, lotSize: 4875 },
  { symbol: 'DRREDDY', name: "Dr Reddy's", type: 'stock', sector: 'Pharma', basePrice: 6285, lotSize: 125 },
  { symbol: 'CIPLA', name: 'Cipla', type: 'stock', sector: 'Pharma', basePrice: 1585, lotSize: 650 },
  { symbol: 'DIVISLAB', name: "Divi's Labs", type: 'stock', sector: 'Pharma', basePrice: 4285, lotSize: 100 },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals', type: 'stock', sector: 'Pharma', basePrice: 7285, lotSize: 125 },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', type: 'stock', sector: 'NBFC', basePrice: 1685, lotSize: 500 },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', type: 'stock', sector: 'Auto', basePrice: 9850, lotSize: 75 },
  { symbol: 'EICHERMOT', name: 'Eicher Motors', type: 'stock', sector: 'Auto', basePrice: 4850, lotSize: 175 },
  { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp', type: 'stock', sector: 'Auto', basePrice: 5285, lotSize: 150 },
  { symbol: 'M&M', name: 'Mahindra & Mahindra', type: 'stock', sector: 'Auto', basePrice: 2985, lotSize: 200 },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank', type: 'stock', sector: 'Banking', basePrice: 985, lotSize: 700 },
  { symbol: 'PNB', name: 'Punjab National Bank', type: 'stock', sector: 'Banking', basePrice: 125, lotSize: 8000 },
  { symbol: 'BANKBARODA', name: 'Bank of Baroda', type: 'stock', sector: 'Banking', basePrice: 265, lotSize: 2925 },
  { symbol: 'CANBK', name: 'Canara Bank', type: 'stock', sector: 'Banking', basePrice: 118, lotSize: 6750 },
  { symbol: 'FEDERALBNK', name: 'Federal Bank', type: 'stock', sector: 'Banking', basePrice: 198, lotSize: 5000 },
  { symbol: 'IDFCFIRSTB', name: 'IDFC First Bank', type: 'stock', sector: 'Banking', basePrice: 85, lotSize: 9275 },
  { symbol: 'AUBANK', name: 'AU Small Finance', type: 'stock', sector: 'Banking', basePrice: 685, lotSize: 1000 },
  { symbol: 'ADANIPORTS', name: 'Adani Ports', type: 'stock', sector: 'Infra', basePrice: 1485, lotSize: 625 },
  { symbol: 'DLF', name: 'DLF', type: 'stock', sector: 'Realty', basePrice: 885, lotSize: 825 },
  { symbol: 'GODREJCP', name: 'Godrej Consumer', type: 'stock', sector: 'FMCG', basePrice: 1285, lotSize: 500 },
  { symbol: 'BRITANNIA', name: 'Britannia', type: 'stock', sector: 'FMCG', basePrice: 5585, lotSize: 125 },
  { symbol: 'DABUR', name: 'Dabur', type: 'stock', sector: 'FMCG', basePrice: 585, lotSize: 1250 },
  { symbol: 'MARICO', name: 'Marico', type: 'stock', sector: 'FMCG', basePrice: 685, lotSize: 1200 },
  { symbol: 'TATACONSUM', name: 'Tata Consumer', type: 'stock', sector: 'FMCG', basePrice: 1185, lotSize: 550 },
  { symbol: 'VEDL', name: 'Vedanta', type: 'stock', sector: 'Metal', basePrice: 485, lotSize: 1150 },
  { symbol: 'HAL', name: 'HAL', type: 'stock', sector: 'Defence', basePrice: 4285, lotSize: 150 },
  { symbol: 'BEL', name: 'Bharat Electronics', type: 'stock', sector: 'Defence', basePrice: 285, lotSize: 2850 },
  { symbol: 'IRCTC', name: 'IRCTC', type: 'stock', sector: 'Services', basePrice: 985, lotSize: 875 },
  { symbol: 'ZOMATO', name: 'Zomato', type: 'stock', sector: 'Services', basePrice: 285, lotSize: 2750 },
  { symbol: 'PAYTM', name: 'Paytm', type: 'stock', sector: 'Services', basePrice: 985, lotSize: 900 },
  { symbol: 'JIOFIN', name: 'Jio Financial', type: 'stock', sector: 'NBFC', basePrice: 685, lotSize: 1450 },
  { symbol: 'SBILIFE', name: 'SBI Life', type: 'stock', sector: 'Insurance', basePrice: 1685, lotSize: 375 },
  { symbol: 'HDFCLIFE', name: 'HDFC Life', type: 'stock', sector: 'Insurance', basePrice: 685, lotSize: 1100 },
  { symbol: 'ICICIPRULI', name: 'ICICI Pru Life', type: 'stock', sector: 'Insurance', basePrice: 685, lotSize: 750 },
  { symbol: 'SHRIRAMFIN', name: 'Shriram Finance', type: 'stock', sector: 'NBFC', basePrice: 3285, lotSize: 300 },
  { symbol: 'CHOLAFIN', name: 'Chola Inv Finance', type: 'stock', sector: 'NBFC', basePrice: 1285, lotSize: 625 },
  { symbol: 'MUTHOOTFIN', name: 'Muthoot Finance', type: 'stock', sector: 'NBFC', basePrice: 1985, lotSize: 275 },
  { symbol: 'PIDILITIND', name: 'Pidilite', type: 'stock', sector: 'Chemical', basePrice: 2985, lotSize: 250 },
  { symbol: 'SIEMENS', name: 'Siemens', type: 'stock', sector: 'Capital Goods', basePrice: 8285, lotSize: 125 },
  { symbol: 'ABB', name: 'ABB India', type: 'stock', sector: 'Capital Goods', basePrice: 8285, lotSize: 125 },
  { symbol: 'VOLTAS', name: 'Voltas', type: 'stock', sector: 'Consumer', basePrice: 1685, lotSize: 375 },
  { symbol: 'AMBUJACEM', name: 'Ambuja Cements', type: 'stock', sector: 'Cement', basePrice: 585, lotSize: 1050 },
  { symbol: 'GRASIM', name: 'Grasim', type: 'stock', sector: 'Cement', basePrice: 2685, lotSize: 250 },
  { symbol: 'TRENT', name: 'Trent', type: 'stock', sector: 'Retail', basePrice: 5285, lotSize: 100 },
  { symbol: 'DMART', name: 'Avenue Supermarts', type: 'stock', sector: 'Retail', basePrice: 4285, lotSize: 150 },
];

const _existingStockSymbols = new Set(FNO_STOCKS.map((s) => s.symbol));
export const FNO_STOCKS_EXTENDED = buildExtendedFnoStocks(_existingStockSymbols);

/** Full NSE F&O universe — indices + all FNO stocks */
export const FNO_STOCKS_ALL: FnoInstrument[] = [...FNO_STOCKS, ...FNO_STOCKS_EXTENDED];

export const FNO_UNIVERSE: FnoInstrument[] = [...FNO_INDICES, ...FNO_STOCKS_ALL];

const bySymbol = new Map(FNO_UNIVERSE.map((i) => [i.symbol, i]));

export function getFnoInstrument(symbol: string): FnoInstrument | undefined {
  return bySymbol.get(symbol.trim().toUpperCase());
}

export function getStrikeIntervalForSpot(spot: number, instrument?: FnoInstrument): number {
  if (instrument?.strikeInterval) return instrument.strikeInterval;
  if (spot > 40000) return 100;
  if (spot > 15000) return 50;
  if (spot > 3000) return 100;
  if (spot > 1000) return 50;
  if (spot > 500) return 20;
  if (spot > 200) return 10;
  return 5;
}

export function getDefaultIv(instrument?: FnoInstrument, sector?: string): number {
  if (instrument?.ivBase) return instrument.ivBase;
  if (instrument?.type === 'index') return 16;
  if (sector === 'Banking') return 22;
  if (sector === 'IT') return 20;
  return 26;
}
