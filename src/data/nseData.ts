// Comprehensive NSE Options Data Generator
// Simulates live market data for Indian stock market

export interface StrikeData {
  strike: number;
  cePrice: number;
  ceOI: number;
  ceVolume: number;
  ceIV: number;
  ceDelta: number;
  ceGamma: number;
  ceTheta: number;
  ceVega: number;
  pePrice: number;
  peOI: number;
  peVolume: number;
  peIV: number;
  peDelta: number;
  peGamma: number;
  peTheta: number;
  peVega: number;
  pcr: number;
}

export interface MarketIndex {
  name: string;
  symbol: string;
  spot: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  volume: number;
  vwap: number;
}

export interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  oi: number;
  iv: number;
  pcr: number;
  maxPain: number;
  sector: string;
}

export interface StrategyLeg {
  id: number;
  type: 'CE' | 'PE';
  action: 'BUY' | 'SELL';
  strike: number;
  premium: number;
  qty: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface MarketBreadthData {
  advances: number;
  declines: number;
  unchanged: number;
  advanceDeclineRatio: number;
  newHighs: number;
  newLows: number;
  above20DMA: number;
  above50DMA: number;
  above200DMA: number;
}

export interface FiiDiiData {
  date: string;
  fiiCashBuy: number;
  fiiCashSell: number;
  fiiCashNet: number;
  fiiFuturesBuy: number;
  fiiFuturesSell: number;
  fiiFuturesNet: number;
  fiiOptionsBuy: number;
  fiiOptionsSell: number;
  fiiOptionsNet: number;
  diiCashBuy: number;
  diiCashSell: number;
  diiCashNet: number;
}

const INDICES = [
  { name: 'NIFTY 50', symbol: 'NIFTY', spot: 24580, base: 24580 },
  { name: 'BANK NIFTY', symbol: 'BANKNIFTY', spot: 52450, base: 52450 },
  { name: 'FIN NIFTY', symbol: 'FINNIFTY', spot: 23890, base: 23890 },
  { name: 'SENSEX', symbol: 'SENSEX', spot: 80560, base: 80560 },
  { name: 'NIFTY MIDCAP', symbol: 'MIDCAP', spot: 14230, base: 14230 },
];

const STOCKS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy', base: 2980 },
  { symbol: 'TCS', name: 'Tata Consultancy', sector: 'IT', base: 4250 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking', base: 1680 },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT', base: 1850 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking', base: 1150 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', base: 1580 },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking', base: 820 },
  { symbol: 'ITC', name: 'ITC Limited', sector: 'FMCG', base: 445 },
  { symbol: 'HINDUNILVR', name: 'HUL', sector: 'FMCG', base: 2380 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Banking', base: 1780 },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Banking', base: 1120 },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Infrastructure', base: 3680 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'NBFC', base: 6850 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', sector: 'Consumer', base: 2980 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', sector: 'Auto', base: 11250 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Auto', base: 950 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Pharma', base: 1780 },
  { symbol: 'ADANIENT', name: 'Adani Enterprises', sector: 'Conglomerate', base: 3150 },
  { symbol: 'WIPRO', name: 'Wipro', sector: 'IT', base: 320 },
  { symbol: 'NTPC', name: 'NTPC', sector: 'Power', base: 385 },
];

let tickCount = 0;

function getRandomChange(base: number, volatility: number = 0.002): number {
  return base * (Math.random() - 0.5) * volatility;
}

export function getIndices(): MarketIndex[] {
  tickCount++;
  return INDICES.map(idx => {
    const change = getRandomChange(idx.base, 0.003);
    const spot = idx.base + change + Math.sin(tickCount * 0.1) * idx.base * 0.001;
    const changePercent = (change / idx.base) * 100;
    return {
      name: idx.name,
      symbol: idx.symbol,
      spot: Math.round(spot * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      high: Math.round((spot + Math.abs(change) + idx.base * 0.005) * 100) / 100,
      low: Math.round((spot - Math.abs(change) - idx.base * 0.005) * 100) / 100,
      open: Math.round((idx.base + getRandomChange(idx.base, 0.001)) * 100) / 100,
      prevClose: idx.base,
      volume: Math.floor(Math.random() * 50000000) + 10000000,
      vwap: Math.round(spot * 100) / 100,
    };
  });
}

export function getOptionChain(symbol: string = 'NIFTY', spotPrice?: number): StrikeData[] {
  const baseSpot = spotPrice || (symbol === 'NIFTY' ? 24580 : symbol === 'BANKNIFTY' ? 52450 : symbol === 'FINNIFTY' ? 23890 : 24580);
  const strikeInterval = symbol === 'NIFTY' ? 50 : symbol === 'BANKNIFTY' ? 100 : 50;
  const numStrikes = 25;
  const centerStrike = Math.round(baseSpot / strikeInterval) * strikeInterval;
  
  const strikes: StrikeData[] = [];
  
  for (let i = -Math.floor(numStrikes / 2); i <= Math.floor(numStrikes / 2); i++) {
    const strike = centerStrike + i * strikeInterval;
    const moneyness = (strike - baseSpot) / baseSpot;
    
    // CE calculations
    const ceIntrinsic = Math.max(0, baseSpot - strike);
    const ceTimeValue = Math.max(5, 150 * Math.exp(-Math.abs(moneyness) * 8) + Math.random() * 20);
    const cePrice = Math.round((ceIntrinsic + ceTimeValue) * 100) / 100;
    const ceOI = Math.floor(Math.exp(-Math.abs(moneyness) * 3) * 500000 + Math.random() * 100000);
    const ceVolume = Math.floor(ceOI * (0.1 + Math.random() * 0.3));
    const ceIV = Math.round((15 + Math.abs(moneyness) * 30 + Math.random() * 5) * 100) / 100;
    
    // PE calculations
    const peIntrinsic = Math.max(0, strike - baseSpot);
    const peTimeValue = Math.max(5, 150 * Math.exp(-Math.abs(moneyness) * 8) + Math.random() * 20);
    const pePrice = Math.round((peIntrinsic + peTimeValue) * 100) / 100;
    const peOI = Math.floor(Math.exp(-Math.abs(moneyness) * 3) * 500000 + Math.random() * 100000);
    const peVolume = Math.floor(peOI * (0.1 + Math.random() * 0.3));
    const peIV = Math.round((15 + Math.abs(moneyness) * 30 + Math.random() * 5) * 100) / 100;
    
    // Greeks approximation
    const d1 = -moneyness * 10;
    const ceDelta = Math.round((Math.exp(-Math.abs(moneyness) * 2) * (moneyness < 0 ? 0.6 : 0.4)) * 100) / 100;
    const peDelta = Math.round((-Math.exp(-Math.abs(moneyness) * 2) * (moneyness > 0 ? 0.6 : 0.4)) * 100) / 100;
    const gamma = Math.round((Math.exp(-d1 * d1 / 2) * 0.05) * 10000) / 10000;
    const theta = Math.round((-cePrice * 0.05) * 100) / 100;
    const vega = Math.round((cePrice * 0.1) * 100) / 100;
    
    const pcr = peOI / (ceOI || 1);
    
    strikes.push({
      strike,
      cePrice,
      ceOI,
      ceVolume,
      ceIV,
      ceDelta: moneyness < 0 ? Math.abs(ceDelta) : ceDelta,
      ceGamma: gamma,
      ceTheta: theta,
      ceVega: vega,
      pePrice,
      peOI,
      peVolume,
      peIV,
      peDelta: moneyness > 0 ? -Math.abs(peDelta) : peDelta,
      peGamma: gamma,
      peTheta: theta,
      peVega: vega,
      pcr: Math.round(pcr * 100) / 100,
    });
  }
  
  return strikes;
}

export function getStocks(): StockData[] {
  return STOCKS.map(stock => {
    const change = getRandomChange(stock.base, 0.008);
    const price = stock.base + change;
    const changePercent = (change / stock.base) * 100;
    return {
      symbol: stock.symbol,
      name: stock.name,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      volume: Math.floor(Math.random() * 10000000) + 500000,
      oi: Math.floor(Math.random() * 5000000) + 100000,
      iv: Math.round((20 + Math.random() * 30) * 100) / 100,
      pcr: Math.round((0.5 + Math.random() * 1.5) * 100) / 100,
      maxPain: Math.round((price + (Math.random() - 0.5) * price * 0.02) / 10) * 10,
      sector: stock.sector,
    };
  });
}

export function calculateMaxPain(strikes: StrikeData[]): { maxPainStrike: number; painValues: { strike: number; pain: number }[] } {
  const painValues = strikes.map(s => {
    let pain = 0;
    strikes.forEach(s2 => {
      if (s2.strike <= s.strike) {
        pain += s2.ceOI * (s.strike - s2.strike);
      }
      if (s2.strike >= s.strike) {
        pain += s2.peOI * (s2.strike - s.strike);
      }
    });
    return { strike: s.strike, pain: Math.round(pain) };
  });
  
  const minPain = painValues.reduce((min, p) => p.pain < min.pain ? p : min, painValues[0]);
  return { maxPainStrike: minPain.strike, painValues };
}

export function getPCRData(strikes: StrikeData[]): { totalPCR: number; ceTotalOI: number; peTotalOI: number; ceTotalVolume: number; peTotalVolume: number } {
  const ceTotalOI = strikes.reduce((sum, s) => sum + s.ceOI, 0);
  const peTotalOI = strikes.reduce((sum, s) => sum + s.peOI, 0);
  const ceTotalVolume = strikes.reduce((sum, s) => sum + s.ceVolume, 0);
  const peTotalVolume = strikes.reduce((sum, s) => sum + s.peVolume, 0);
  
  return {
    totalPCR: Math.round((peTotalOI / ceTotalOI) * 100) / 100,
    ceTotalOI,
    peTotalOI,
    ceTotalVolume,
    peTotalVolume,
  };
}

export function getMarketBreadth(): MarketBreadthData {
  const advances = Math.floor(1200 + Math.random() * 300);
  const declines = Math.floor(800 + Math.random() * 300);
  const unchanged = Math.floor(50 + Math.random() * 100);
  
  return {
    advances,
    declines,
    unchanged,
    advanceDeclineRatio: Math.round((advances / declines) * 100) / 100,
    newHighs: Math.floor(50 + Math.random() * 100),
    newLows: Math.floor(20 + Math.random() * 50),
    above20DMA: Math.floor(40 + Math.random() * 30),
    above50DMA: Math.floor(45 + Math.random() * 25),
    above200DMA: Math.floor(50 + Math.random() * 20),
  };
}

export function getFiiDiiData(days: number = 30): FiiDiiData[] {
  const data: FiiDiiData[] = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    const fiiCashBuy = Math.floor(2000 + Math.random() * 3000);
    const fiiCashSell = Math.floor(2000 + Math.random() * 3000);
    const fiiCashNet = fiiCashBuy - fiiCashSell;
    
    const fiiFuturesBuy = Math.floor(1500 + Math.random() * 2000);
    const fiiFuturesSell = Math.floor(1500 + Math.random() * 2000);
    const fiiFuturesNet = fiiFuturesBuy - fiiFuturesSell;
    
    const fiiOptionsBuy = Math.floor(5000 + Math.random() * 5000);
    const fiiOptionsSell = Math.floor(5000 + Math.random() * 5000);
    const fiiOptionsNet = fiiOptionsBuy - fiiOptionsSell;
    
    const diiCashBuy = Math.floor(1500 + Math.random() * 2000);
    const diiCashSell = Math.floor(1000 + Math.random() * 1500);
    const diiCashNet = diiCashBuy - diiCashSell;
    
    data.push({
      date: date.toISOString().split('T')[0],
      fiiCashBuy,
      fiiCashSell,
      fiiCashNet,
      fiiFuturesBuy,
      fiiFuturesSell,
      fiiFuturesNet,
      fiiOptionsBuy,
      fiiOptionsSell,
      fiiOptionsNet,
      diiCashBuy,
      diiCashSell,
      diiCashNet,
    });
  }
  
  return data;
}

export function getHistoricalPCR(days: number = 30): { date: string; pcr: number; ceOI: number; peOI: number }[] {
  const data: { date: string; pcr: number; ceOI: number; peOI: number }[] = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const ceOI = Math.floor(5000000 + Math.random() * 3000000);
    const peOI = Math.floor(4000000 + Math.random() * 4000000);
    
    data.push({
      date: date.toISOString().split('T')[0],
      pcr: Math.round((peOI / ceOI) * 100) / 100,
      ceOI,
      peOI,
    });
  }
  
  return data;
}

export function getIntradayData(): { time: string; price: number; volume: number; ceOI: number; peOI: number }[] {
  const data: { time: string; price: number; volume: number; ceOI: number; peOI: number }[] = [];
  const basePrice = 24580;
  let currentPrice = basePrice;
  let ceOI = 8000000;
  let peOI = 7500000;
  
  for (let hour = 9; hour <= 15; hour++) {
    for (let minute = 0; minute < 60; minute += 5) {
      if (hour === 9 && minute < 15) continue;
      if (hour === 15 && minute > 30) break;
      
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      currentPrice += getRandomChange(currentPrice, 0.001);
      ceOI += Math.floor((Math.random() - 0.5) * 50000);
      peOI += Math.floor((Math.random() - 0.5) * 50000);
      
      data.push({
        time,
        price: Math.round(currentPrice * 100) / 100,
        volume: Math.floor(Math.random() * 100000) + 50000,
        ceOI: Math.abs(ceOI),
        peOI: Math.abs(peOI),
      });
    }
  }
  
  return data;
}

export function calculateGreeks(
  spot: number,
  strike: number,
  daysToExpiry: number,
  iv: number,
  optionType: 'CE' | 'PE',
  interestRate: number = 0.06
): { delta: number; gamma: number; theta: number; vega: number; rho: number } {
  const T = daysToExpiry / 365;
  const sigma = iv / 100;
  const r = interestRate;
  
  const d1 = (Math.log(spot / strike) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  
  // Simplified approximations
  const nd1 = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
  
  const delta = optionType === 'CE' 
    ? Math.round((0.5 + 0.5 * Math.tanh(d1 * 2)) * 100) / 100
    : Math.round((-0.5 + 0.5 * Math.tanh(-d1 * 2)) * 100) / 100;
  
  const gamma = Math.round((nd1 / (spot * sigma * Math.sqrt(T))) * 10000) / 10000;
  const theta = Math.round((-spot * nd1 * sigma / (2 * Math.sqrt(T)) / 365) * 100) / 100;
  const vega = Math.round((spot * nd1 * Math.sqrt(T) / 100) * 100) / 100;
  const rho = Math.round((optionType === 'CE' ? strike * T * Math.exp(-r * T) * 0.01 : -strike * T * Math.exp(-r * T) * 0.01) * 100) / 100;
  
  return { delta, gamma, theta, vega, rho };
}

export const EXPIRY_DATES = [
  '27 Jun 2025',
  '04 Jul 2025',
  '11 Jul 2025',
  '18 Jul 2025',
  '25 Jul 2025',
  '31 Jul 2025',
];

export const STRATEGY_TEMPLATES = [
  { name: 'Long Call', legs: [{ type: 'CE' as const, action: 'BUY' as const, strikeOffset: 0 }] },
  { name: 'Long Put', legs: [{ type: 'PE' as const, action: 'BUY' as const, strikeOffset: 0 }] },
  { name: 'Short Call', legs: [{ type: 'CE' as const, action: 'SELL' as const, strikeOffset: 0 }] },
  { name: 'Short Put', legs: [{ type: 'PE' as const, action: 'SELL' as const, strikeOffset: 0 }] },
  { name: 'Bull Call Spread', legs: [{ type: 'CE' as const, action: 'BUY' as const, strikeOffset: 0 }, { type: 'CE' as const, action: 'SELL' as const, strikeOffset: 1 }] },
  { name: 'Bear Put Spread', legs: [{ type: 'PE' as const, action: 'BUY' as const, strikeOffset: 0 }, { type: 'PE' as const, action: 'SELL' as const, strikeOffset: -1 }] },
  { name: 'Long Straddle', legs: [{ type: 'CE' as const, action: 'BUY' as const, strikeOffset: 0 }, { type: 'PE' as const, action: 'BUY' as const, strikeOffset: 0 }] },
  { name: 'Short Straddle', legs: [{ type: 'CE' as const, action: 'SELL' as const, strikeOffset: 0 }, { type: 'PE' as const, action: 'SELL' as const, strikeOffset: 0 }] },
  { name: 'Long Strangle', legs: [{ type: 'CE' as const, action: 'BUY' as const, strikeOffset: 1 }, { type: 'PE' as const, action: 'BUY' as const, strikeOffset: -1 }] },
  { name: 'Iron Condor', legs: [{ type: 'PE' as const, action: 'BUY' as const, strikeOffset: -2 }, { type: 'PE' as const, action: 'SELL' as const, strikeOffset: -1 }, { type: 'CE' as const, action: 'SELL' as const, strikeOffset: 1 }, { type: 'CE' as const, action: 'BUY' as const, strikeOffset: 2 }] },
  { name: 'Butterfly Spread', legs: [{ type: 'CE' as const, action: 'BUY' as const, strikeOffset: -1 }, { type: 'CE' as const, action: 'SELL' as const, strikeOffset: 0, qty: 2 }, { type: 'CE' as const, action: 'BUY' as const, strikeOffset: 1 }] },
  { name: 'Calendar Spread', legs: [{ type: 'CE' as const, action: 'SELL' as const, strikeOffset: 0, expiry: 0 }, { type: 'CE' as const, action: 'BUY' as const, strikeOffset: 0, expiry: 1 }] },
];
