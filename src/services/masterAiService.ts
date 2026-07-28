import { apiFetch } from '../config/api';
import { hasRemoteApi, masterAiOfflineMessage, serverUnreachableMessage } from '../constants/brandLabels';
import {
  calculateMaxPain,
  getFuturesOIData,
  getGainers,
  getIndices,
  getLosers,
  getMarketBreadth,
  getMostActive,
  getNews,
  getOptionChain,
  getSignals,
  getStocks,
} from '../data/marketData';
import { openRouterRequestHeaders } from './openRouterKey';

export interface MasterAiModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  web?: boolean;
  free?: boolean;
}

/** Internal model id — not shown in UI */
export const MASTER_AI_MODEL_ID = 'gemini/auto';

export type MasterAiKeySource = 'server' | 'profile' | 'none';

export interface MasterChatResponse {
  reply: string;
  modelUsed?: string;
  source?: 'openrouter' | 'openai' | 'gemini' | 'local';
}

export type MasterAiLangCode =
  | 'en-US'
  | 'hi-IN'
  | 'gu-IN'
  | 'mr-IN'
  | 'ta-IN'
  | 'te-IN'
  | 'bn-IN'
  | 'kn-IN'
  | 'ml-IN'
  | 'pa-IN';

export interface MasterAiLanguage {
  code: MasterAiLangCode;
  name: string;
  nativeLabel: string;
  /** What Gemini must write replies in */
  replyIn: string;
  /** Short tone note for the model */
  tone: string;
}

export const MASTER_AI_LANGUAGES: MasterAiLanguage[] = [
  {
    code: 'en-US',
    name: 'English',
    nativeLabel: 'English',
    replyIn: 'clear Indian English',
    tone: 'senior NSE/BSE desk mentor — warm and direct',
  },
  {
    code: 'hi-IN',
    name: 'Hindi',
    nativeLabel: 'हिंदी',
    replyIn: 'natural Hinglish or Hindi (Devanagari) — match the user script',
    tone: 'seasoned Indian trader mentor (Mumbai/Delhi desk)',
  },
  {
    code: 'gu-IN',
    name: 'Gujarati',
    nativeLabel: 'ગુજરાતી',
    replyIn: 'natural Gujarati (ગુજરાતી script preferred; Roman Gujarati OK if user types Latin)',
    tone: 'friendly Ahmedabad / Surat trading mentor',
  },
  {
    code: 'mr-IN',
    name: 'Marathi',
    nativeLabel: 'मराठी',
    replyIn: 'natural Marathi (मराठी script preferred; Roman Marathi OK if user types Latin)',
    tone: 'friendly Mumbai / Pune trading mentor',
  },
  {
    code: 'ta-IN',
    name: 'Tamil',
    nativeLabel: 'தமிழ்',
    replyIn: 'natural Tamil (தமிழ் script preferred; Roman Tamil OK if user types Latin)',
    tone: 'friendly Chennai trading mentor',
  },
  {
    code: 'te-IN',
    name: 'Telugu',
    nativeLabel: 'తెలుగు',
    replyIn: 'natural Telugu (తెలుగు script preferred; Roman Telugu OK if user types Latin)',
    tone: 'friendly Hyderabad trading mentor',
  },
  {
    code: 'bn-IN',
    name: 'Bengali',
    nativeLabel: 'বাংলা',
    replyIn: 'natural Bengali (বাংলা script preferred; Roman Bengali OK if user types Latin)',
    tone: 'friendly Kolkata trading mentor',
  },
  {
    code: 'kn-IN',
    name: 'Kannada',
    nativeLabel: 'ಕನ್ನಡ',
    replyIn: 'natural Kannada (ಕನ್ನಡ script preferred; Roman Kannada OK if user types Latin)',
    tone: 'friendly Bengaluru trading mentor',
  },
  {
    code: 'ml-IN',
    name: 'Malayalam',
    nativeLabel: 'മലയാളം',
    replyIn: 'natural Malayalam (മലയാളം script preferred; Roman Malayalam OK if user types Latin)',
    tone: 'friendly Kochi / Kerala trading mentor',
  },
  {
    code: 'pa-IN',
    name: 'Punjabi',
    nativeLabel: 'ਪੰਜਾਬੀ',
    replyIn: 'natural Punjabi (ਗੁਰਮੁਖੀ preferred; Roman Punjabi OK if user types Latin)',
    tone: 'friendly Punjab trading mentor',
  },
];

export function getMasterAiLanguage(code: string): MasterAiLanguage {
  return MASTER_AI_LANGUAGES.find((l) => l.code === code) ?? MASTER_AI_LANGUAGES[0];
}

export function isHindiLang(langCode: string): boolean {
  return langCode.startsWith('hi');
}

export function isValidMasterAiLang(code: string): code is MasterAiLangCode {
  return MASTER_AI_LANGUAGES.some((l) => l.code === code);
}

export type MasterAiLangMode = MasterAiLangCode | 'auto';

const SCRIPT_RANGES: { code: MasterAiLangCode; re: RegExp }[] = [
  { code: 'gu-IN', re: /[\u0A80-\u0AFF]/g },
  { code: 'pa-IN', re: /[\u0A00-\u0A7F]/g },
  { code: 'ta-IN', re: /[\u0B80-\u0BFF]/g },
  { code: 'te-IN', re: /[\u0C00-\u0C7F]/g },
  { code: 'kn-IN', re: /[\u0C80-\u0CFF]/g },
  { code: 'ml-IN', re: /[\u0D00-\u0D7F]/g },
  { code: 'bn-IN', re: /[\u0980-\u09FF]/g },
  { code: 'hi-IN', re: /[\u0900-\u097F]/g }, // Devanagari — refine Hindi vs Marathi below
];

const MARATHI_MARKERS =
  /\b(आहे|आहेत|तुम्ही|तुमचा|मला|आम्ही|कसे|काय|नाही|होय|कृपया)\b|आहे|तुम्ही|मला/;

const HINGLISH_MARKERS =
  /\b(kya|hai|nahi|nahin|mat|karo|karna|batao|samjhao|dekho|bhai|yaar|kaise|kitna|thik|theek|acha|accha|please bata|market kaisa|aaj|kal|mere|mera|mujhe|humko|kyun|kyu)\b/i;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

/**
 * Detect reply language from user text (script + light Hinglish/Marathi heuristics).
 * Returns null when text is too short / inconclusive.
 */
export function detectMasterAiLanguage(text: string): MasterAiLangCode | null {
  const raw = String(text || '').trim();
  if (raw.length < 2) return null;

  let best: { code: MasterAiLangCode; score: number } | null = null;
  for (const row of SCRIPT_RANGES) {
    const score = countMatches(raw, row.re);
    if (score > 0 && (!best || score > best.score)) {
      best = { code: row.code, score };
    }
  }

  if (best && best.score >= 2) {
    // Devanagari can be Hindi or Marathi
    if (best.code === 'hi-IN' && MARATHI_MARKERS.test(raw)) {
      return 'mr-IN';
    }
    return best.code;
  }

  // Single-script short words (e.g. "क्या")
  if (best && best.score >= 1 && raw.length <= 24) {
    if (best.code === 'hi-IN' && MARATHI_MARKERS.test(raw)) return 'mr-IN';
    return best.code;
  }

  if (HINGLISH_MARKERS.test(raw)) return 'hi-IN';

  // Mostly Latin letters → English
  const letters = raw.replace(/[^A-Za-z\u0900-\u0D7F]/g, '');
  if (letters.length >= 3) {
    const latin = (letters.match(/[A-Za-z]/g) || []).length;
    if (latin / letters.length >= 0.85) return 'en-US';
  }

  return null;
}

export function resolveMasterAiLanguage(
  mode: MasterAiLangMode,
  userText: string,
  fallback: MasterAiLangCode = 'en-US',
): MasterAiLanguage {
  if (mode !== 'auto') return getMasterAiLanguage(mode);
  const detected = detectMasterAiLanguage(userText);
  return getMasterAiLanguage(detected || fallback);
}

function buildLanguageDirective(langCode: string): string {
  const lang = getMasterAiLanguage(langCode);
  return [
    `OUTPUT LANGUAGE (mandatory): Reply in ${lang.replyIn}.`,
    `Persona: ${lang.tone}.`,
    'Keep trading terms familiar: Nifty, Bank Nifty, F&O, CE/PE, OI, PCR, max pain, SL, target, lot size.',
    'Educational only — no guaranteed profit claims.',
    isHindiLang(langCode)
      ? 'Avoid stiff textbook Hindi; sound like a senior on the trading floor.'
      : 'Prefer clarity over essays; short paragraphs or tight bullets.',
  ].join('\n');
}

function istSessionNote(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    const mins = hour * 60 + minute;
    const weekday = get('weekday');
    const isWeekday = !['Sat', 'Sun'].includes(weekday);
    const open = mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
    const session = !isWeekday
      ? 'Weekend — cash market closed'
      : open
        ? 'Cash market OPEN (NSE regular session)'
        : mins < 9 * 60 + 15
          ? 'Pre-open / before cash open'
          : 'Cash market CLOSED (after hours)';
    return `IST now ${get('hour')}:${get('minute')} (${weekday}) · ${session}`;
  } catch {
    return 'Session clock unavailable';
  }
}

export function getMasterAiWelcome(langCode: string): string {
  const lang = getMasterAiLanguage(langCode);
  if (isHindiLang(langCode)) {
    return 'Namaste! Main Master AI hoon — aapka trading saathi. Chart/screenshot bhejo (📷) — turant trend, support, resistance bataunga. Ya Nifty, options, risk ke baare mein poochho.';
  }
  if (langCode === 'en-US') {
    return "Hi — I'm Master AI, your trading copilot. Send a chart screenshot (📷) for instant trend, support & resistance analysis — or ask about markets, options, and risk.";
  }
  return `Namaste — I'm Master AI. I'll reply in ${lang.name} (${lang.nativeLabel}). Send a chart screenshot (📷) or ask about Nifty, options, and risk.`;
}

export function getChartVisionPrompt(langCode: string, userNote?: string): string {
  const note = userNote?.trim();
  const lang = getMasterAiLanguage(langCode);
  const langLine = `Write the FULL analysis in ${lang.replyIn}. Tone: ${lang.tone}.`;

  if (isHindiLang(langCode)) {
    return [
      'User ne trading chart / option chain / footprint screenshot bheja hai.',
      'Tum KHUD image padh ke poori analysis do — extra sawaal ka wait mat karo.',
      langLine,
      'Format (headings use karo):',
      '1. Snapshot — symbol, timeframe, LTP/spot (agar dikhe)',
      '2. Bias — bullish / bearish / range + strength + short why',
      '3. Levels — kam se kam 2–3 support + 2–3 resistance (chart se exact numbers)',
      '4. Chart kya keh raha hai — candles, patterns, VWAP/MA/RSI/MACD/volume/OI jo dikhe',
      '5. Plan — entry zone, SL/invalidation, target 1 & 2 (educational, guarantee nahi)',
      '6. Risk — size caution + kya setup todta hai',
      '7. Next check — agla candle close / retest / VWAP etc.',
      'Option chain ho to: PCR feel, max pain, heavy CE/PE, bias bhi do.',
      'Blurry/unclear ho to honestly bolo — price mat invent karo.',
      note ? `User ka extra sawal: ${note}` : 'User ne alag se sawal nahi likha — phir bhi full analysis do.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    'The user sent a trading chart, option chain, or platform screenshot.',
    'Analyze the image yourself end-to-end — do not wait for extra questions.',
    langLine,
    'Use these headings:',
    '1. Snapshot — symbol, timeframe, LTP/spot if visible',
    '2. Bias — bullish / bearish / range + strength + short why',
    '3. Levels — at least 2–3 supports and 2–3 resistances (exact numbers from chart)',
    '4. What the chart is saying — candles, patterns, VWAP/MA/RSI/MACD/volume/OI if shown',
    '5. Plan — entry zone, stop/invalidation, target 1 & 2 (educational only)',
    '6. Risk — size caution + what breaks the idea',
    '7. Next check — next close / retest / VWAP reclaim etc.',
    'If option chain: PCR feel, max pain, heavy CE/PE, bias.',
    'If unreadable, say so — never invent prices.',
    note ? `User note: ${note}` : 'No extra question — still give the full analysis.',
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

/** Soft user-facing error — never show technical / npm / stack details */
export function getMasterAiSorryMessage(langCode: string, kind: 'chat' | 'chart' | 'image' = 'chat'): string {
  if (isHindiLang(langCode)) {
    if (kind === 'chart') return 'Sorry — chart abhi analyze nahi ho paya. Thodi der baad dubara try karo.';
    if (kind === 'image') return 'Sorry — image load nahi hui. Koi aur screenshot try karo.';
    return 'Sorry — abhi jawab nahi de paaya. Thodi der baad dubara try karo.';
  }
  if (kind === 'chart') return 'Sorry — I couldn’t analyze that chart right now. Please try again in a moment.';
  if (kind === 'image') return 'Sorry — that image couldn’t be loaded. Please try another screenshot.';
  return 'Sorry — I couldn’t complete that just now. Please try again in a moment.';
}

/** Prefer web/news models only when the question needs “latest” info */
export function shouldUseWebSearch(input: string): boolean {
  const n = input.toLowerCase();
  return /\b(news|headline|latest|today|rbi|fed|cpi|gdp|budget|result|earnings|sebi|ban|event|why.*(fall|crash|rally)|kya.*(hua|huya))\b/i.test(
    n,
  );
}

export const MASTER_AI_MODELS: MasterAiModel[] = [
  { id: 'gemini/auto', name: 'Auto (Gemini)', provider: 'Google', description: 'Best Gemini model for the question' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google', description: 'Deep analysis & chart reads' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', description: 'Fast, clear trading answers' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', description: 'Quick multilingual answers' },
  { id: 'openrouter/auto', name: 'Auto (OpenRouter)', provider: 'OpenRouter', description: 'Picks a strong model automatically' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', description: 'Deeper analysis & charts' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', description: 'Fast, clear trading explanations' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', description: 'Strong reasoning for strategies' },
  { id: 'perplexity/sonar', name: 'Sonar (web)', provider: 'Perplexity', description: 'Finds latest market info online', web: true },
];

export const PLATFORM_KNOWLEDGE = `
Wolf Trade AI platform (answer using this when user asks about the app):
- AI Intelligence: OI/smart-money style views, writing zones, scanner, alerts
- Stock Screeners: categorized live scans (momentum, breakout, intraday, F&O, etc.)
- Strategy Builder: multi-leg templates, payoff, Greeks
- Option Chain with OI, PCR, max pain
- Futures Analytics: OI vs price, delivery
- Trading Journal: trades, analytics, calendar
- Heatmap, Footprint, Signals, Watchlist, Alerts, News
- Master AI (this assistant): trading-only copilot with chart screenshot analysis
- Owner teachings: when admin uploads PDFs/notes, Master AI follows that house method first
Live market data comes from the connected live feed in Profile.
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
  'screener', 'heatmap', 'journal', 'bias', 'lot',
];

export function isCasualGreeting(input: string): boolean {
  const n = input
    .toLowerCase()
    .trim()
    .replace(/[!?.,…]+$/g, '')
    .replace(/\s+/g, ' ');
  if (!n || n.length > 48) return false;
  return /^(hi|hii|hiii|hello|helloo|hey|heyy|yo|sup|hola|namaste|namaskar|good\s*(morning|afternoon|evening|night)|gm|gn|kaise\s*ho|kaisa\s*hai|how\s*are\s*you|what'?s\s*up|wassup|hola\s*bhai|radhe\s*radhe|sat\s*sri\s*akal)$/i.test(
    n,
  );
}

export function isTradingRelated(input: string): boolean {
  const n = input.toLowerCase().trim();
  if (!n) return false;
  if (isCasualGreeting(n)) return true;
  if (n.length < 2) return false;
  if (NON_TRADING_TERMS.some((t) => n.includes(t))) return false;
  if (TRADING_KEYWORDS.some((t) => n.includes(t))) return true;
  // Short polite chat on the desk (thanks / ok / cool)
  if (/^(thanks|thank\s*you|ok|okay|cool|great|nice|done|thik|theek|acha|accha|bye|goodbye)$/i.test(n)) {
    return true;
  }
  return false;
}

export function getHumanGreetingReply(langCode: string, userText: string): string {
  const hi = langCode.startsWith('hi');
  const variantsHi = [
    'Hey! Kaisa raha din? Chart bhejna hai ya Nifty / options pe baat karni hai — bol.',
    'Hi — main yahin hoon. Seedha poochho: market pulse, options, risk, ya screenshot analysis.',
    'Namaste! Good to see you. Aaj kya dekhna hai — chart, setup, ya risk plan?',
    'Arre hello! Bol kya chahiye — Nifty view, options lens, ya chart padhwaun?',
  ];
  const variantsEn = [
    "Hey — good to see you. Want a quick market take, options view, or drop a chart and I'll read it?",
    "Hi! I'm right here. Tell me what you need — Nifty pulse, risk check, or chart analysis.",
    "Hello! How's the session treating you? Chart, setup, or just a quick desk check — your call.",
    "Hey there. Fire away — market, options, risk, or paste a screenshot and I'll break it down.",
  ];
  const list = hi ? variantsHi : variantsEn;
  // Light variation from message length / time
  const idx = (userText.length + new Date().getMinutes()) % list.length;
  return list[idx];
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
  active: string;
  breadth: string;
  futures: string;
  session: string;
}

export function buildMasterMarketContext(): MasterMarketContext {
  const indices = getIndices();
  const nifty = indices.find((i) => i.symbol === 'NIFTY') ?? indices[0];
  const bank = indices.find((i) => i.symbol === 'BANKNIFTY') ?? indices[1];
  const chain = getOptionChain('NIFTY', nifty?.price ?? 0);
  const totalCe = chain.reduce((s, r) => s + (r.ceOi || 0), 0);
  const totalPe = chain.reduce((s, r) => s + (r.peOi || 0), 0);
  const pcr = Number((totalPe / Math.max(totalCe, 1)).toFixed(2));
  const maxPain = calculateMaxPain(chain).maxPainStrike;
  const signals = getSignals().filter((s) => s.signal !== 'HOLD').slice(0, 6);
  const news = getNews().slice(0, 5);
  const gainers = getGainers(5);
  const losers = getLosers(5);
  const active = getMostActive(5);
  const breadth = getMarketBreadth();
  const fut = getFuturesOIData().slice(0, 4);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  return {
    summary: hasRemoteApi ? 'Live feed connected (cloud)' : 'Live feed (local/session)',
    nifty: nifty
      ? `${fmt(nifty.price)} (${nifty.changePercent >= 0 ? '+' : ''}${nifty.changePercent.toFixed(2)}%)`
      : 'n/a',
    bankNifty: bank
      ? `${fmt(bank.price)} (${bank.changePercent >= 0 ? '+' : ''}${bank.changePercent.toFixed(2)}%)`
      : 'n/a',
    pcr,
    maxPain,
    signals: signals.length
      ? signals.map((s) => `${s.symbol} ${s.signal === 'BUY' ? 'BULLISH' : 'BEARISH'} (${s.strength}%)`).join('; ')
      : 'No strong bias signals',
    news: news.length ? news.map((n) => n.title).join(' | ') : 'No headline movers cached',
    gainers: gainers.map((g) => `${g.symbol} +${g.changePercent.toFixed(1)}%`).join(', ') || 'n/a',
    losers: losers.map((l) => `${l.symbol} ${l.changePercent.toFixed(1)}%`).join(', ') || 'n/a',
    active: active.map((a) => a.symbol).join(', ') || 'n/a',
    breadth: `Adv ${breadth.advances} / Dec ${breadth.declines} · A/D ${breadth.advanceDeclineRatio.toFixed(2)} · Highs ${breadth.newHighs} Lows ${breadth.newLows}`,
    futures: fut.length
      ? fut.map((f) => `${f.symbol} ${f.signal} (OI chg ${f.futuresOiChange})`).join('; ')
      : 'Futures OI n/a',
    session: istSessionNote(),
  };
}

export function formatContextBlock(ctx: MasterMarketContext, langCode: string): string {
  return [
    buildLanguageDirective(langCode),
    'QUALITY: Prefer specific levels and risk over generic commentary. Cite snapshot numbers when used.',
    PLATFORM_KNOWLEDGE,
    `Session: ${ctx.session}`,
    `Market snapshot (${ctx.summary}):`,
    `NIFTY ${ctx.nifty}`,
    `BANKNIFTY ${ctx.bankNifty}`,
    `Nifty options: overall PCR ${ctx.pcr}, max pain ${ctx.maxPain}`,
    `Market breadth: ${ctx.breadth}`,
    `Futures OI cues: ${ctx.futures}`,
    `Bias signals: ${ctx.signals}`,
    `Top gainers: ${ctx.gainers}`,
    `Top losers: ${ctx.losers}`,
    `Most active: ${ctx.active}`,
    `Tape headlines: ${ctx.news}`,
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
  source?: 'openrouter' | 'openai' | 'local';
}

export type MasterAiKeySource = 'server' | 'profile' | 'none';

export async function fetchMasterAiStatus(): Promise<{
  configured: boolean;
  message: string;
  keySource: MasterAiKeySource;
}> {
  try {
    const keyHeaders = openRouterRequestHeaders();
    const res = await apiFetch('/api/chat/status', {
      headers: { ...keyHeaders },
    });
    if (!res.ok) {
      return { configured: false, message: masterAiOfflineMessage(), keySource: 'none' };
    }
    const data = await res.json();
    const keySource =
      (data?.keySource as MasterAiKeySource) ||
      (data?.configured ? (keyHeaders['X-OpenRouter-Key'] ? 'profile' : 'server') : 'none');
    return {
      configured: Boolean(data?.configured),
      keySource,
      message: data?.configured
        ? keySource === 'server'
          ? 'Master AI ready (server key)'
          : 'Live intelligence ready'
        : 'Add Gemini API key (aistudio.google.com) in Profile',
    };
  } catch {
    return {
      configured: false,
      message: serverUnreachableMessage(),
      keySource: 'none',
    };
  }
}

export async function askMasterAi(req: MasterChatRequest, ctx: MasterMarketContext): Promise<MasterChatResponse> {
  const greeting = isCasualGreeting(req.message || '');
  const platformContext = greeting
    ? [
        buildLanguageDirective(req.lang),
        'User sent a casual greeting. Reply like a warm human trading buddy — short, natural, no market data dump.',
        'Invite them to share a chart or ask about Nifty / options / risk.',
      ].join('\n')
    : formatContextBlock(ctx, req.lang);

  const res = await apiFetch('/api/chat', {
    method: 'POST',
    headers: { ...openRouterRequestHeaders() },
    body: JSON.stringify({
      message: req.message,
      model: req.model,
      lang: req.lang,
      langName: req.langName,
      imageDataUrl: req.imageDataUrl ?? null,
      history: req.history ?? [],
      needsWeb: req.needsWeb ?? false,
      platformContext,
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
const STORAGE_LANG_MODE = 'master_ai_language_mode';

export function loadSelectedLanguage(): MasterAiLangCode {
  if (typeof window === 'undefined') return 'en-US';
  const saved = window.localStorage.getItem(STORAGE_LANGUAGE) || '';
  return isValidMasterAiLang(saved) ? saved : 'en-US';
}

export function saveSelectedLanguage(code: MasterAiLangCode): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_LANGUAGE, code);
}

export function loadLanguageMode(): MasterAiLangMode {
  if (typeof window === 'undefined') return 'auto';
  const mode = window.localStorage.getItem(STORAGE_LANG_MODE);
  if (!mode || mode === 'auto') return 'auto';
  if (isValidMasterAiLang(mode)) return mode;
  return 'auto';
}

export function saveLanguageMode(mode: MasterAiLangMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_LANG_MODE, mode);
  if (mode !== 'auto') {
    window.localStorage.setItem(STORAGE_LANGUAGE, mode);
  }
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
  const lower = input.toLowerCase().trim();
  const hi = lang.startsWith('hi');

  if (isCasualGreeting(lower)) {
    return getHumanGreetingReply(lang, lower);
  }

  if (/^(thanks|thank\s*you|ok|okay|cool|great|nice|thik|theek|acha|accha)$/i.test(lower)) {
    return hi
      ? 'Bilkul — jab ready ho chart ya sawaal bhej dena. Main yahin hoon.'
      : "Anytime — send a chart or your next question whenever you're ready.";
  }

  if (lower.includes('option') || lower.includes('pcr') || lower.includes('oi') || lower.includes('ऑप्शन')) {
    return hi
      ? `Abhi overall PCR ~${ctx.pcr}, max pain ~${ctx.maxPain}. ${ctx.session}. Size chhoti rakho — defined-risk prefer karo jab tak trend clear na ho.`
      : `Overall PCR is around ${ctx.pcr} with max pain near ${ctx.maxPain}. ${ctx.session}. Keep size modest and prefer defined-risk until the trend is clear.`;
  }

  return hi
    ? `NIFTY ${ctx.nifty}, BANKNIFTY ${ctx.bankNifty}. Breadth: ${ctx.breadth}. Main markets, options, risk aur strategy par help karta hoon — seedha poochho.`
    : `NIFTY ${ctx.nifty}; BANKNIFTY ${ctx.bankNifty}. Breadth: ${ctx.breadth}. Ask me anything on markets, options, risk, or strategy — I'll keep it practical.`;
}
