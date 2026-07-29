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
  | 'hi-Latn'
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
    tone: 'senior male NSE/BSE desk mentor — warm and direct (he/him)',
  },
  {
    code: 'hi-Latn',
    name: 'Hinglish',
    nativeLabel: 'Hinglish',
    replyIn:
      'natural Hinglish only — Roman Hindi + English mix (jaise: "Nifty weak hai, SL tight rakho"). Devanagari mat likho unless user ne Hindi script use kiya',
    tone: 'male desi trading buddy on the floor — casual, clear, warm (he/him)',
  },
  {
    code: 'hi-IN',
    name: 'Hindi',
    nativeLabel: 'हिंदी',
    replyIn: 'natural Hindi in Devanagari (हिंदी लिपि) — trading terms like Nifty/CE/PE English me reh sakte hain',
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

/** Hindi Devanagari or Hinglish (Roman) — both use desi desk tone helpers */
export function isHindiLang(langCode: string): boolean {
  return langCode === 'hi-IN' || langCode === 'hi-Latn' || langCode.startsWith('hi');
}

export function isHinglishLang(langCode: string): boolean {
  return langCode === 'hi-Latn';
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

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

/** Common Roman-Hindi / Hinglish tokens (trading desk chat) */
const HINGLISH_WORD_SET = new Set([
  'kya', 'kyun', 'kyu', 'kyunki', 'hai', 'hain', 'hoon', 'hun', 'nahi', 'nahin', 'mat',
  'karo', 'karna', 'karke', 'kardo', 'krdo', 'krna', 'batao', 'bata', 'btao', 'bolo', 'bol',
  'samjhao', 'samjha', 'dekho', 'dekh', 'dikha', 'dikhao', 'dikh', 'suno', 'sunao', 'poochho', 'poocho', 'pooch',
  'bhai', 'yaar', 'dost', 'kaise', 'kaisa', 'kaisi', 'kitna', 'kitni', 'kitne',
  'thik', 'theek', 'acha', 'accha', 'acche', 'sahi', 'galat',
  'aaj', 'kal', 'abhi', 'pehle', 'pahle', 'baad', 'baadme', 'phir',
  'mere', 'mera', 'meri', 'mujhe', 'mujhko', 'mujko', 'humko', 'hamari', 'humari', 'hamara',
  'tum', 'tumhara', 'tumhari', 'tera', 'teri', 'apna', 'apni', 'apne',
  'chahiye', 'chahie', 'sakta', 'sakti', 'sakte', 'raha', 'rahi', 'rahe', 'rahega', 'rahegi',
  'gaya', 'gayi', 'gaye', 'hoga', 'hogi', 'honge', 'hogaya', 'hogayi',
  'lekin', 'magar', 'agar', 'toh', 'sirf', 'zyada', 'jyada', 'bahut',
  'thoda', 'bilkul', 'sach', 'waise', 'aise', 'jaise', 'wahan', 'yahan', 'yaha', 'waha',
  'andar', 'bahar', 'upar', 'neeche', 'saath', 'bhejo', 'bhejna', 'padho', 'padhao', 'likho',
  'wala', 'wali', 'wale', 'hone', 'hona', 'kahan', 'kidhar', 'kab', 'kyase', 'kyasee',
  'dikhra', 'dikhaega', 'bataega', 'karunga', 'karungi', 'milenga', 'milega',
]);

/** Short Roman particles — only count with other Hinglish signal */
const HINGLISH_PARTICLES = new Set([
  'ka', 'ki', 'ke', 'ko', 'se', 'pe', 'par', 'me', 'mein', 'mai', 'ye', 'yeh', 'vo', 'woh', 'wo', 'na', 'ji',
]);

const HINGLISH_SUFFIX =
  /^(?:[a-z]{2,})(?:ao|na|ne|ega|egi|ungi|unga|ogi|oge|iya|iyan|wala|wali|wale)$/i;

function tokenizeLatin(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreHinglish(text: string): number {
  const tokens = tokenizeLatin(text);
  let score = 0;
  let particles = 0;
  for (const t of tokens) {
    if (HINGLISH_WORD_SET.has(t)) score += 2;
    else if (HINGLISH_PARTICLES.has(t)) particles += 1;
    else if (HINGLISH_SUFFIX.test(t) && t.length >= 4) score += 1;
  }
  if (particles >= 2) score += 2;
  else if (particles === 1 && score > 0) score += 1;
  // Multi-word desk phrases
  if (
    /\b(kya\s+hai|kaise\s+hai|bata\s*do|bhej\s*do|samjha\s*do|view\s+kya|sl\s+kahan|entry\s+kahan|aaj\s+ka|mujhe\s+bata|nifty\s+ka|ka\s+view|kya\s+view|chart\s+bhej|dekh\s+ke|bata\s+de)\b/i.test(
      text,
    )
  ) {
    score += 3;
  }
  return score;
}

function cleanForLangDetect(text: string): string {
  return String(text || '')
    .replace(/\[INSTRUCTION:[\s\S]*?\]/gi, '')
    .replace(/\[LANGUAGE LOCK:[\s\S]*?\]/gi, '')
    .replace(/^chart analysis:.*/i, '')
    .replace(/^📷\s*/u, '')
    .trim();
}

/**
 * Detect reply language from user text (script + Hinglish heuristics).
 * Returns null when text is too short / inconclusive — caller keeps last language.
 */
export function detectMasterAiLanguage(text: string): MasterAiLangCode | null {
  const raw = cleanForLangDetect(text);
  if (raw.length < 2) return null;

  // Skip pure greetings — keep sticky last language
  if (
    /^(hi+|hii+|hello+|hey+|yo|sup|namaste|namaskar|good\s*(morning|afternoon|evening|night)|gm|gn|thanks|thank\s*you|ok|okay|cool|theek|thik)[!?.,…]*$/i.test(
      raw,
    )
  ) {
    return null;
  }

  let best: { code: MasterAiLangCode; score: number } | null = null;
  for (const row of SCRIPT_RANGES) {
    const score = countMatches(raw, row.re);
    if (score > 0 && (!best || score > best.score)) {
      best = { code: row.code, score };
    }
  }

  // Clear Indic script → that language
  if (best && best.score >= 1) {
    if (best.code === 'hi-IN' && MARATHI_MARKERS.test(raw)) return 'mr-IN';
    // Enough Devanagari / other script
    if (best.score >= 2 || raw.length <= 40) return best.code;
  }

  const hinglishScore = scoreHinglish(raw);
  const tokens = tokenizeLatin(raw);
  const englishCue =
    /\b(the|and|what|how|please|today|tomorrow|should|would|could|analyze|analysis|because|which|where|when|could\s+you|can\s+you|tell\s+me)\b/i.test(
      raw,
    );

  // Hinglish wins with any solid signal (even mixed with English trading words)
  if (hinglishScore >= 2) return 'hi-Latn';
  if (hinglishScore >= 1 && tokens.length <= 14) return 'hi-Latn';
  if (hinglishScore >= 1 && !englishCue) return 'hi-Latn';

  // Mostly Latin + English cues → English (only when no Hinglish)
  const letters = raw.replace(/[^A-Za-z\u0900-\u0D7F]/g, '');
  if (letters.length >= 3 && hinglishScore === 0) {
    const latin = (letters.match(/[A-Za-z]/g) || []).length;
    if (latin / letters.length >= 0.85) {
      if (englishCue || tokens.length >= 3) return 'en-US';
    }
  }

  return null;
}

export function resolveMasterAiLanguage(
  mode: MasterAiLangMode,
  userText: string,
  fallback: MasterAiLangCode = 'hi-Latn',
  recentUserTexts: string[] = [],
): MasterAiLanguage {
  if (mode !== 'auto') return getMasterAiLanguage(mode);

  const cleaned = cleanForLangDetect(userText);
  let detected = detectMasterAiLanguage(cleaned);

  // Auto: if this message is unclear, scan recent user messages (newest first)
  if (!detected) {
    for (const prev of recentUserTexts) {
      detected = detectMasterAiLanguage(prev);
      if (detected) break;
    }
  }

  // Sticky only when detector still inconclusive
  return getMasterAiLanguage(detected || fallback || 'hi-Latn');
}

function buildLanguageDirective(langCode: string, autoMode = false): string {
  const lang = getMasterAiLanguage(langCode);
  if (autoMode) {
    return `Language: match the user’s message (hint: ${lang.nativeLabel}).`;
  }
  if (langCode === 'hi-Latn') return 'Language: Hinglish (Roman Hindi + English).';
  if (langCode === 'hi-IN') return 'Language: Hindi Devanagari.';
  if (langCode === 'en-US') return 'Language: clear Indian English.';
  return `Language: ${lang.replyIn} (${lang.nativeLabel}).`;
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
  if (isHinglishLang(langCode)) {
    return 'Namaste! Main Jarvis hoon. Hinglish me baat karta hoon. Chart/screenshot bhejo (📷) — trend, support, resistance bataunga. Ya Nifty, options, risk poochho.';
  }
  if (langCode === 'hi-IN') {
    return 'नमस्ते! मैं Jarvis हूँ — आपका trading साथी। Chart/screenshot भेजो (📷) — trend, support, resistance बताऊँगा। या Nifty, options, risk पूछो।';
  }
  if (langCode === 'en-US') {
    return "Hi — I'm Jarvis, your trading copilot. Send a chart screenshot (📷) for instant trend, support & resistance analysis — or ask about markets, options, and risk.";
  }
  return `Namaste — I'm Jarvis. I'll reply in ${lang.name} (${lang.nativeLabel}). Send a chart screenshot (📷) or ask about Nifty, options, and risk.`;
}

export function getChartVisionPrompt(langCode: string, userNote?: string, autoMode = false): string {
  const note = userNote?.trim();
  const lock = buildLanguageDirective(langCode, autoMode);
  return [
    lock,
    'User sent a chart screenshot. Give a clear analysis from the image only.',
    'Cover: Snapshot · Bias (bullish/bearish/sideways) · Levels · Plan (bullish above / bearish below) · Risk.',
    'Never say buy/sell. Do not invent prices. If blurry, say so.',
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
  { id: 'gemini/auto', name: 'Auto (Flash)', provider: 'Google', description: 'Smart default — Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', description: 'Best quality / cost for trading chat + charts' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: 'Google', description: 'Cheapest — lighter answers' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', description: 'Fast multilingual fallback' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google', description: 'Deepest analysis (uses more credits)' },
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
- Jarvis (Analyse AI): trading-only copilot — introduce as Jarvis only (never say “male”); chart screenshot analysis
- Owner teachings: when admin uploads PDFs/notes, Jarvis follows that house method first
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

export function isPoliteAck(input: string): boolean {
  const n = input.toLowerCase().trim().replace(/[!?.,…]+$/g, '');
  return /^(thanks|thank\s*you|ok|okay|cool|great|nice|done|thik|theek|acha|accha|bye|goodbye|shukriya|dhanyavad)$/i.test(
    n,
  );
}

/** Trading/investment questions that must wait for a chart screenshot. */
export function needsChartImage(input: string): boolean {
  const n = input.toLowerCase().trim();
  if (!n) return false;
  if (isCasualGreeting(n) || isPoliteAck(n)) return false;
  return isTradingRelated(n);
}

export function getChartImageRequiredMessage(langCode: string): string {
  if (isHinglishLang(langCode) || langCode === 'hi-IN') {
    return 'Samajh gaya — ispe baat karte hain. Proper bias aur levels ke liye chart / TradingView screenshot bhej do (📷), usi image se clear bataunga.';
  }
  return "Got it — happy to talk this through. For a clear bias and levels, send a chart / TradingView screenshot (📷) and I’ll read only from that image.";
}

export function isTradingRelated(input: string): boolean {
  const n = input.toLowerCase().trim();
  if (!n) return false;
  if (isCasualGreeting(n)) return true;
  if (n.length < 2) return false;
  if (NON_TRADING_TERMS.some((t) => n.includes(t))) return false;
  if (TRADING_KEYWORDS.some((t) => n.includes(t))) return true;
  // Short polite chat on the desk (thanks / ok / cool)
  if (isPoliteAck(n)) {
    return true;
  }
  return false;
}

export function getHumanGreetingReply(langCode: string, userText: string): string {
  const hinglish = isHinglishLang(langCode) || langCode === 'hi-IN';
  const variantsHi = [
    'Hey bhai! Main Jarvis — kaisa raha din? Bol, kya chal raha hai?',
    'Hi — Jarvis yahin hoon. Seedha baat karo, main sun raha hoon.',
    'Namaste! Jarvis here. Aaj kya scene hai — bol.',
    'Arre hello! Jarvis bol raha hoon — kya dekhna hai aaj?',
  ];
  const variantsEn = [
    "Hey — Jarvis here. How’s it going? Tell me what’s on your mind.",
    "Hi! I'm Jarvis — right here. What’s up?",
    "Hello! Jarvis on the desk. What do you want to talk about?",
    "Hey there — Jarvis. Fire away whenever you’re ready.",
  ];
  const list = hinglish ? variantsHi : variantsEn;
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

export function formatContextBlock(
  ctx: MasterMarketContext,
  langCode: string,
  compact = false,
  autoMode = false,
): string {
  if (compact) {
    return [
      buildLanguageDirective(langCode, autoMode),
      'Jarvis — answer clearly like a helpful trading ChatGPT. bullish/bearish only (no buy/sell).',
      `Session: ${ctx.session}`,
      `NIFTY ${ctx.nifty} · BANKNIFTY ${ctx.bankNifty} · PCR ${ctx.pcr} · max pain ${ctx.maxPain}`,
      ctx.signals ? `Signals: ${ctx.signals}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    buildLanguageDirective(langCode, autoMode),
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
  /** When 'auto', server + prompts mirror user message language via detector hint */
  langMode?: MasterAiLangMode;
  imageDataUrl?: string | null;
  history?: ChatHistoryItem[];
  needsWeb?: boolean;
}

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
          ? 'Analyse AI ready (server key)'
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
  const autoMode = req.langMode === 'auto' || !req.langMode;
  // Always compact market dump — chart/image already carries levels; saves input tokens
  const platformContext = greeting
    ? [
        buildLanguageDirective(req.lang, autoMode),
        'User sent a greeting. Reply briefly and warmly as Jarvis. No market dump.',
      ].join('\n')
    : formatContextBlock(ctx, req.lang, true, autoMode);

  const history = (req.history ?? [])
    .slice(-6)
    .map((h) => ({
      role: h.role,
      content: String(h.content || '').slice(0, 1200),
    }));

  const res = await apiFetch('/api/chat', {
    method: 'POST',
    headers: { ...openRouterRequestHeaders() },
    body: JSON.stringify({
      message: req.message,
      model: req.model,
      lang: req.lang,
      langName: req.langName,
      langMode: autoMode ? 'auto' : req.langMode,
      imageDataUrl: req.imageDataUrl ?? null,
      history,
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
  if (typeof window === 'undefined') return 'hi-Latn';
  const saved = window.localStorage.getItem(STORAGE_LANGUAGE) || '';
  // Default Hinglish for Indian desk — not English
  return isValidMasterAiLang(saved) ? saved : 'hi-Latn';
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
