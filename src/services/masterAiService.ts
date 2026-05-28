import { getGainers, getIndices, getLosers, getNews, getOptionChain, getSignals, getStocks } from '../data/marketData';

export interface MasterAiModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  web?: boolean;
  free?: boolean;
}

/** Internal model id — not shown in UI */
export const MASTER_AI_MODEL_ID = 'openrouter/auto';

export type MasterAiLangCode = 'en-US' | 'hi-IN';

export interface MasterAiLanguage {
  code: MasterAiLangCode;
  name: string;
  nativeLabel: string;
}

export const MASTER_AI_LANGUAGES: MasterAiLanguage[] = [
  { code: 'en-US', name: 'English', nativeLabel: 'English' },
  { code: 'hi-IN', name: 'Hindi', nativeLabel: 'हिंदी' },
];

export function isHindiLang(langCode: string): boolean {
  return langCode.startsWith('hi');
}

function buildLanguageDirective(langCode: string): string {
  if (isHindiLang(langCode)) {
    return [
      'OUTPUT LANGUAGE (mandatory): Reply in natural Hinglish OR Hindi (Devanagari).',
      'Match how the user writes — Roman Hinglish if they type in English letters, Devanagari if they use Hindi script.',
      'Persona: seasoned Indian trader mentor (Mumbai/Delhi desk) — warm, direct, real.',
      'Use: dekho, samjho, dhyaan rakho, risk mat bhoolna, SL, target, lot size, trend clear hai, support/tod.',
      'Keep: Nifty, Bank Nifty, F&O, call/put, OI, PCR, max pain — familiar trading words.',
      'Avoid stiff textbook Hindi; sound like a senior on the trading floor, not a news reader.',
    ].join('\n');
  }
  return [
    'OUTPUT LANGUAGE (mandatory): Reply in clear Indian English only.',
    'Persona: experienced NSE/BSE mentor — warm, direct, like explaining to a desk mate.',
    'Use ₹, lakh/crore when natural. Prefer Nifty/Bank Nifty, not only "the index".',
    'Avoid US-only slang and robotic lists unless the user asks for bullets.',
  ].join('\n');
}

export function getMasterAiWelcome(langCode: string): string {
  if (isHindiLang(langCode)) {
    return 'Namaste! Main Master AI hoon — aapka trading saathi. Chart/screenshot bhejo (📷) — turant trend, support, resistance bataunga. Ya Nifty, options, risk ke baare mein poochho. Speak tabhi jab daboge.';
  }
  return "Hi — I'm Master AI, your trading copilot. Send a chart screenshot (📷) for instant trend, support & resistance analysis — or ask about markets, options, and risk. I speak when you tap Speak.";
}

/** Full chart/screenshot analysis instruction for vision models */
export function getChartVisionPrompt(langCode: string, userNote?: string): string {
  const note = userNote?.trim();
  if (isHindiLang(langCode)) {
    return [
      'User ne trading chart / option chain / footprint screenshot bheja hai. Image dekhte hi turant poori analysis do — wait mat karo.',
      'Zaroor cover karo (jo image mein dikhe):',
      '• Symbol, timeframe, exchange (NSE/BSE) agar visible ho',
      '• Trend: bullish / bearish / sideways + strength',
      '• Support levels (kam se kam 2–3) + Resistance levels (kam se kam 2–3)',
      '• Immediate support/resistance / range',
      '• Candlestick / price action pattern (agar dikhe)',
      '• Volume / OI clue (agar chart mein ho)',
      '• Indicators: RSI, MACD, VWAP, MA — jo dikhe unka matlab',
      '• Option chain ho to: PCR, max pain, CE/PE OI bias, key strikes',
      '• Entry zone, stop-loss idea, target idea (educational — guarantee mat)',
      '• Agar kuch unclear ho to honestly bolo — price mat guess karo',
      'Tone: senior Indian trader mentor — seedha, practical Hinglish/Devanagari.',
      note ? `User ka extra sawal: ${note}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    'The user sent a trading chart, option chain, or platform screenshot. Analyze it immediately — do not ask them to wait.',
    'Cover everything visible:',
    '• Symbol, timeframe, exchange (NSE/BSE) if shown',
    '• Trend: bullish / bearish / sideways and strength',
    '• Support levels (at least 2–3) and Resistance levels (at least 2–3)',
    '• Nearest support/resistance and trading range',
    '• Candlestick / price action patterns if visible',
    '• Volume or OI clues on the chart',
    '• Indicators shown (RSI, MACD, VWAP, MAs) — what they imply',
    '• If option chain: PCR, max pain, CE/PE OI bias, key strikes',
    '• Practical entry zone, stop-loss zone, target ideas (educational only)',
    '• Say clearly if something is unreadable — do not invent prices',
    'Tone: warm Indian English mentor, like a senior on the desk.',
    note ? `User note: ${note}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function getTradingBlockMessage(langCode: string): string {
  if (isHindiLang(langCode)) {
    return 'Main sirf trading aur investing par help karta hoon — markets, options, risk, strategies, platform. Apna sawal isi context mein poochho.';
  }
  return 'I only help with trading and investing — markets, options, risk, strategies, platform features, or portfolio ideas. Please rephrase your question in that space.';
}

export const MASTER_AI_MODELS: MasterAiModel[] = [
  { id: 'openrouter/auto', name: 'Auto (best)', provider: 'OpenRouter', description: 'Picks a strong model automatically' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', description: 'Fast, clear trading explanations' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', description: 'Deeper analysis & charts' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'Google', description: 'Quick multilingual answers' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic', description: 'Human-like, concise mentor tone' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', description: 'Strong reasoning for strategies' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'Meta', description: 'Open-weight, solid generalist' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', description: 'Technical & options-friendly' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct', name: 'Mistral Small', provider: 'Mistral', description: 'Efficient European model' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', provider: 'Qwen', description: 'Strong Hindi/English mix' },
  { id: 'perplexity/sonar', name: 'Sonar (web)', provider: 'Perplexity', description: 'Finds latest market info online', web: true },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini Flash (free)', provider: 'Google', description: 'Free tier via OpenRouter', free: true },
  { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 (free)', provider: 'Meta', description: 'Free open model fallback', free: true },
];

export const PLATFORM_KNOWLEDGE = `
Master TradeX platform (answer using this when user asks about the app):
- Paper Trading: virtual ₹10L, cash/futures/options, live LTP, limit/SL/target orders, brokerage, strategy import
- Strategy Builder: multi-leg templates, payoff, Greeks, paper trade bridge
- Option Chain / Opstra-style chain with OI, PCR, max pain
- Futures Analytics: OI vs price, delivery, daily/weekly
- OI Intelligence, Footprint, Scanners (volume, OI, gaps, momentum)
- Trading Journal: trades, analytics, calendar, Supabase sync
- Backtesting, Signals panel, Watchlist, Portfolio, Alerts, News
- Master AI (this assistant): trading-only copilot
Live data requires npm run dev. Connect TradeX Live in Profile — platform uses TradeX live feed only (no Yahoo/external feeds).
`;

const NON_TRADING_TERMS = [
  'weather', 'movie', 'song', 'recipe', 'joke', 'romance', 'dating',
  'doctor', 'medicine', 'homework', 'gaming', 'fortnite', 'cricket score only',
];

const TRADING_KEYWORDS = [
  'nifty', 'banknifty', 'sensex', 'market', 'stock', 'share', 'option', 'future',
  'call', 'put', 'oi', 'pcr', 'straddle', 'strangle', 'iron condor', 'hedge',
  'strategy', 'risk', 'stoploss', 'stop loss', 'target', 'entry', 'exit',
  'portfolio', 'intraday', 'swing', 'breakout', 'support', 'resistance',
  'bullish', 'bearish', 'vwap', 'rsi', 'macd', 'volume', 'trend', 'volatility',
  'earnings', 'fii', 'dii', 'dividend', 'commodity', 'gold', 'crude', 'usd',
  'invest', 'trade', 'chart', 'candle', 'scalp', 'position', 'margin', 'broker',
  'paper trading', 'backtest', 'scanner', 'max pain', 'gamma', 'theta', 'delta',
];

export function isTradingRelated(input: string): boolean {
  const n = input.toLowerCase().trim();
  if (n.length < 3) return false;
  if (NON_TRADING_TERMS.some((t) => n.includes(t))) return false;
  return TRADING_KEYWORDS.some((t) => n.includes(t));
}

export interface MasterMarketContext {
  summary: string;
  nifty: string;
  bankNifty: string;
  pcr: number;
  maxPain: number;
  signals: string;
  news: string;
  gainers: string;
  losers: string;
}

export function buildMasterMarketContext(): MasterMarketContext {
  const indices = getIndices();
  const nifty = indices.find((i) => i.symbol === 'NIFTY') ?? indices[0];
  const bank = indices.find((i) => i.symbol === 'BANKNIFTY') ?? indices[1];
  const chain = getOptionChain('NIFTY', nifty.price);
  const atm = chain[Math.floor(chain.length / 2)];
  const signals = getSignals().slice(0, 5);
  const news = getNews().slice(0, 4);
  const gainers = getGainers(4);
  const losers = getLosers(4);

  const pcr = Number((atm.peOi / Math.max(atm.ceOi, 1)).toFixed(2));
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  return {
    summary: 'Live feed: TradeX/NSE (npm run dev)',
    nifty: `${fmt(nifty.price)} (${nifty.changePercent >= 0 ? '+' : ''}${nifty.changePercent.toFixed(2)}%)`,
    bankNifty: `${fmt(bank.price)} (${bank.changePercent >= 0 ? '+' : ''}${bank.changePercent.toFixed(2)}%)`,
    pcr,
    maxPain: atm.strike,
    signals: signals.map((s) => `${s.symbol} ${s.signal} (${s.strength}%)`).join('; '),
    news: news.map((n) => n.title).join(' | '),
    gainers: gainers.map((g) => `${g.symbol} +${g.changePercent.toFixed(1)}%`).join(', '),
    losers: losers.map((l) => `${l.symbol} ${l.changePercent.toFixed(1)}%`).join(', '),
  };
}

export function formatContextBlock(ctx: MasterMarketContext, langCode: string): string {
  return [
    buildLanguageDirective(langCode),
    `Reply language preference: ${langCode} (match user's language naturally).`,
    PLATFORM_KNOWLEDGE,
    `Current app market snapshot (${ctx.summary}):`,
    `NIFTY ${ctx.nifty}`,
    `BANKNIFTY ${ctx.bankNifty}`,
    `Options: PCR ${ctx.pcr}, max pain ${ctx.maxPain}`,
    `Signals: ${ctx.signals}`,
    `Gainers: ${ctx.gainers}`,
    `Losers: ${ctx.losers}`,
    `News: ${ctx.news}`,
    `Universe size: ${getStocks().length} tracked names.`,
  ].join('\n');
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface MasterChatRequest {
  message: string;
  model: string;
  lang: string;
  langName: string;
  imageDataUrl?: string | null;
  history?: ChatHistoryItem[];
  needsWeb?: boolean;
}

export interface MasterChatResponse {
  reply: string;
  modelUsed?: string;
  source?: 'openrouter' | 'local';
}

export async function fetchMasterAiStatus(): Promise<{ configured: boolean; message: string }> {
  try {
    const res = await fetch('/api/chat/status');
    if (!res.ok) return { configured: false, message: 'Offline — start npm run dev' };
    const data = await res.json();
    return {
      configured: Boolean(data?.configured),
      message: data?.configured ? 'Live intelligence ready' : 'Server running — AI key needed',
    };
  } catch {
    return { configured: false, message: 'Cannot reach TradeX server (npm run dev)' };
  }
}

export async function askMasterAi(req: MasterChatRequest, ctx: MasterMarketContext): Promise<MasterChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: req.message,
      model: req.model,
      lang: req.lang,
      langName: req.langName,
      imageDataUrl: req.imageDataUrl ?? null,
      history: req.history ?? [],
      needsWeb: req.needsWeb ?? false,
      platformContext: formatContextBlock(ctx, req.lang),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err?.error === 'string' ? err.error : 'AI unavailable');
  }

  const data = await res.json();
  return {
    reply: typeof data?.reply === 'string' ? data.reply.trim() : '',
    modelUsed: data?.modelUsed,
    source: data?.source ?? 'openrouter',
  };
}

const STORAGE_MODEL = 'master_ai_selected_model';
const STORAGE_AUTO_SPEAK = 'master_ai_auto_speak';
const STORAGE_LANGUAGE = 'master_ai_language';

export function loadSelectedLanguage(): MasterAiLangCode {
  if (typeof window === 'undefined') return 'en-US';
  const saved = window.localStorage.getItem(STORAGE_LANGUAGE);
  return saved === 'hi-IN' ? 'hi-IN' : 'en-US';
}

export function saveSelectedLanguage(code: MasterAiLangCode): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_LANGUAGE, code);
}

export function loadSelectedModel(): string {
  if (typeof window === 'undefined') return MASTER_AI_MODELS[0].id;
  return window.localStorage.getItem(STORAGE_MODEL) ?? 'openrouter/auto';
}

export function saveSelectedModel(id: string): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_MODEL, id);
}

export function loadAutoSpeak(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_AUTO_SPEAK) === 'true';
}

export function saveAutoSpeak(on: boolean): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_AUTO_SPEAK, on ? 'true' : 'false');
}

/** Local fallback when API is down */
export function generateLocalTradingReply(input: string, ctx: MasterMarketContext, lang: string): string {
  const lower = input.toLowerCase();
  const hi = lang.startsWith('hi');

  if (lower.includes('paper') || lower.includes('virtual') || lower.includes('पेपर')) {
    return hi
      ? 'Dekho — Paper Trading mein ₹10L virtual capital milta hai. Cash, futures, options sab try karo; live price, limit/SL aur brokerage jaise real broker jaisa feel aata hai.'
      : 'Paper Trading gives you ₹10L virtual capital — cash, futures, and options with live prices, pending orders, and brokerage that feels like a real broker.';
  }

  if (lower.includes('option') || lower.includes('pcr') || lower.includes('oi') || lower.includes('ऑप्शन')) {
    return hi
      ? `Abhi PCR lagbhag ${ctx.pcr} hai, max pain ${ctx.maxPain} ke paas. Size chhoti rakho — defined-risk setup prefer karo jab tak trend clear na ho.`
      : `PCR is around ${ctx.pcr} with max pain near ${ctx.maxPain}. Keep size modest and stick to defined-risk until the trend is clear.`;
  }

  return hi
    ? `NIFTY ${ctx.nifty}, BANKNIFTY ${ctx.bankNifty}. Main markets, options, risk aur strategy par help karta hoon — seedha poochho.`
    : `NIFTY ${ctx.nifty}; BANKNIFTY ${ctx.bankNifty}. Ask me anything on markets, options, risk, or strategy — I'll keep it practical.`;
}
