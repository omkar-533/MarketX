// ============================================================
// PROFESSIONAL SCANNER ENGINE (HEDGE FUND GRADE SIMULATION)
// ============================================================

export interface StockData {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  rsi: number;
  macd: number;
  vwap: number;
  ema20: number;
  ema50: number;
  oi: number;
  oiChange: number;
  iv: number;
  aiScore: number;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  lastUpdated: string;
}

export interface ScannerRule {
  id: string;
  field: keyof StockData;
  operator: '>' | '<' | '=' | 'CROSSES_ABOVE' | 'CROSSES_BELOW';
  value: number;
  logic: 'AND' | 'OR';
}

export const SECTORS = ['NIFTY 50', 'BANK NIFTY', 'IT', 'AUTO', 'PHARMA', 'FMCG', 'METAL', 'ENERGY'];

// Generate 100+ Mock Stocks with realistic technical data
export function generateMarketData(): StockData[] {
  const symbols = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK',
    'LT', 'AXISBANK', 'ASIANPAINT', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'TITAN', 'ULTRACEMCO', 'BAJFINANCE', 'WIPRO',
    'NESTLEIND', 'POWERGRID', 'NTPC', 'ONGC', 'TATAMOTORS', 'TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'COALINDIA', 'BPCL',
    'ADANIPORTS', 'GRASIM', 'CIPLA', 'DRREDDY', 'DIVISLAB', 'BRITANNIA', 'EICHERMOT', 'SHREECEM', 'TECHM', 'M&M'
  ];
  
  // Expand to 100+ by adding variations
  const allStocks: StockData[] = [];
  for (let i = 0; i < 3; i++) {
    symbols.forEach((sym, idx) => {
      const basePrice = 500 + Math.random() * 4000;
      const change = (Math.random() - 0.5) * 6;
      const price = basePrice * (1 + change / 100);
      const volume = Math.floor(Math.random() * 5000000) + 100000;
      const rsi = Math.floor(Math.random() * 100);
      const aiScore = Math.floor(Math.random() * 100);
      
      allStocks.push({
        symbol: i === 0 ? sym : `${sym}${i}`,
        name: `Company ${sym} ${i}`,
        sector: SECTORS[idx % SECTORS.length],
        price: Number(price.toFixed(2)),
        changePercent: Number(change.toFixed(2)),
        volume,
        avgVolume: Math.floor(volume * (0.8 + Math.random() * 0.4)),
        rsi,
        macd: Number((Math.random() - 0.5) * 10),
        vwap: Number(price * (0.98 + Math.random() * 0.04)),
        ema20: Number(price * (0.95 + Math.random() * 0.1)),
        ema50: Number(price * (0.9 + Math.random() * 0.2)),
        oi: Math.floor(Math.random() * 1000000),
        oiChange: Number((Math.random() - 0.5) * 30),
        iv: Number((10 + Math.random() * 40).toFixed(2)),
        aiScore,
        signal: aiScore > 70 ? 'BUY' : aiScore < 30 ? 'SELL' : 'NEUTRAL',
        lastUpdated: new Date().toLocaleTimeString(),
      });
    });
  }
  return allStocks;
}

// Core Rule Evaluation Engine
export function evaluateRule(stock: StockData, rule: ScannerRule): boolean {
  const stockValue = stock[rule.field];
  if (typeof stockValue !== 'number') return false;

  switch (rule.operator) {
    case '>': return stockValue > rule.value;
    case '<': return stockValue < rule.value;
    case '=': return stockValue === rule.value;
    case 'CROSSES_ABOVE': return stockValue > rule.value && (stockValue - rule.value) < (stockValue * 0.01); // Simplified
    case 'CROSSES_BELOW': return stockValue < rule.value && (rule.value - stockValue) < (stockValue * 0.01);
    default: return false;
  }
}

export function runScanner(stocks: StockData[], rules: ScannerRule[]): StockData[] {
  if (rules.length === 0) return stocks.sort((a, b) => b.aiScore - a.aiScore);

  return stocks.filter(stock => {
    let result = evaluateRule(stock, rules[0]);
    for (let i = 1; i < rules.length; i++) {
      const currentRule = rules[i];
      const currentResult = evaluateRule(stock, currentRule);
      if (currentRule.logic === 'AND') {
        result = result && currentResult;
      } else {
        result = result || currentResult;
      }
    }
    return result;
  }).sort((a, b) => b.aiScore - a.aiScore);
}

// Preset Scanners
export const PRESET_SCANNERS = {
  MOMENTUM: [
    { id: '1', field: 'rsi', operator: '>' as const, value: 60, logic: 'AND' as const },
    { id: '2', field: 'volume', operator: '>' as const, value: 1000000, logic: 'AND' as const },
    { id: '3', field: 'changePercent', operator: '>' as const, value: 2, logic: 'AND' as const },
  ],
  BREAKOUT: [
    { id: '1', field: 'price', operator: 'CROSSES_ABOVE' as const, value: 0, logic: 'AND' as const },
    { id: '2', field: 'volume', operator: '>' as const, value: 2000000, logic: 'AND' as const },
  ],
  OI_BUILDUP: [
    { id: '1', field: 'oiChange', operator: '>' as const, value: 10, logic: 'AND' as const },
    { id: '2', field: 'changePercent', operator: '>' as const, value: 0, logic: 'AND' as const },
  ]
};

// ============================================================
// CODE SCREENER ENGINE (DSL PARSER)
// ============================================================

const FIELD_ALIASES: Record<string, keyof StockData> = {
  price: 'price',
  close: 'price',
  ltp: 'price',
  change: 'changePercent',
  chg: 'changePercent',
  vol: 'volume',
  volume: 'volume',
  rsi: 'rsi',
  macd: 'macd',
  vwap: 'vwap',
  ema20: 'ema20',
  ema50: 'ema50',
  ema: 'ema50', // default
  oi: 'oi',
  oi_change: 'oiChange',
  oichg: 'oiChange',
  iv: 'iv',
  score: 'aiScore',
  ai: 'aiScore',
};

export function evaluateCodeScript(script: string, stock: StockData): boolean {
  if (!script.trim()) return true;
  
  // Normalize
  let normalized = script.toLowerCase().replace(/\s+/g, ' ').trim();
  normalized = normalized.replace(/\s+and\s+/g, ' &&&AND&&& ').replace(/\s+or\s+/g, ' |||OR||| ');
  
  const conditions = normalized.split(/\s+(?:&&&AND&&&|\|\|\|OR\|\|\|)\s+/);
  const logics = normalized.match(/\s+(?:&&&AND&&&|\|\|\|OR\|\|\|)\s+/g)?.map(m => m.includes('AND') ? 'and' : 'or') || [];
  
  // If no logic, just one condition
  if (conditions.length === 1) {
    return evaluateSingleCondition(conditions[0], stock);
  }
  
  let result = evaluateSingleCondition(conditions[0], stock);
  
  for (let i = 0; i < logics.length; i++) {
    const nextResult = evaluateSingleCondition(conditions[i + 1], stock);
    if (logics[i] === 'and') {
      result = result && nextResult;
    } else {
      result = result || nextResult;
    }
    // Short circuit
    if (logics[i] === 'and' && !result) return false;
    if (logics[i] === 'or' && result) return true;
  }
  
  return result;
}

function evaluateSingleCondition(conditionStr: string, stock: StockData): boolean {
  conditionStr = conditionStr.trim();
  if (!conditionStr) return true;
  
  // Regex: field operator value
  // field can be ema(50) -> ema50
  conditionStr = conditionStr.replace(/ema\((\d+)\)/g, 'ema$1');
  conditionStr = conditionStr.replace(/sma\((\d+)\)/g, 'ema$1'); // map sma to ema for simplicity
  conditionStr = conditionStr.replace(/rsi\((\d+)\)/g, 'rsi');
  
  const match = conditionStr.match(/^(\w+)\s*(>=|<=|==|!=|>|<|=)\s*([\d.]+)$/);
  if (!match) return false; // Syntax error treated as false
  
  const [, fieldRaw, opRaw, valueRaw] = match;
  const field = FIELD_ALIASES[fieldRaw] || fieldRaw as keyof StockData;
  const op = opRaw === '=' ? '=' : (opRaw === '==' ? '=' : opRaw as any);
  const value = parseFloat(valueRaw);
  
  if (!(field in stock)) return false;
  const stockValue = stock[field] as number;
  if (typeof stockValue !== 'number') return false;
  
  switch (op) {
    case '>': return stockValue > value;
    case '<': return stockValue < value;
    case '=': return stockValue === value;
    case '>=': return stockValue >= value;
    case '<=': return stockValue <= value;
    case '!=': return stockValue !== value;
    default: return false;
  }
}

export function runCodeScanner(script: string, stocks: StockData[]): StockData[] {
  return stocks.filter(stock => evaluateCodeScript(script, stock))
               .sort((a, b) => b.aiScore - a.aiScore);
}