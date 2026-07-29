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

export type MasterAiLangCode = string;

export interface MasterAiLanguage {
  code: MasterAiLangCode;
  name: string;
  nativeLabel: string;
  /** What Gemini must write replies in */
  replyIn: string;
  /** Short tone note for the model */
  tone: string;
  /** Optional group for dropdown */
  group?: 'popular' | 'india' | 'world';
}

const analystTone = 'senior market analyst — calm, professional, evidence-based';

function lang(
  code: string,
  name: string,
  nativeLabel: string,
  group: 'popular' | 'india' | 'world' = 'world',
  replyIn?: string,
): MasterAiLanguage {
  return {
    code,
    name,
    nativeLabel,
    replyIn: replyIn || `natural ${name} (${nativeLabel})`,
    tone: analystTone,
    group,
  };
}

/**
 * Languages Jarvis can lock to — aligned with Gemini web app multilingual support (70+).
 * Auto mode unlocks the full Gemini multilingual capability even beyond this list.
 */
export const MASTER_AI_LANGUAGES: MasterAiLanguage[] = [
  lang('en-US', 'English', 'English', 'popular', 'clear Indian English'),
  lang(
    'hi-Latn',
    'Hinglish',
    'Hinglish',
    'popular',
    'natural Hinglish — Roman Hindi + English mix. Devanagari mat likho unless user used Hindi script',
  ),
  lang(
    'hi-IN',
    'Hindi',
    'हिंदी',
    'popular',
    'natural Hindi in Devanagari — trading terms Nifty/CE/PE may stay English',
  ),
  // India / South Asia
  lang('as-IN', 'Assamese', 'অসমীয়া', 'india'),
  lang('bn-IN', 'Bengali', 'বাংলা', 'india'),
  lang('gu-IN', 'Gujarati', 'ગુજરાતી', 'india'),
  lang('kn-IN', 'Kannada', 'ಕನ್ನಡ', 'india'),
  lang('ml-IN', 'Malayalam', 'മലയാളം', 'india'),
  lang('mr-IN', 'Marathi', 'मराठी', 'india'),
  lang('ne-NP', 'Nepali', 'नेपाली', 'india'),
  lang('or-IN', 'Odia', 'ଓଡ଼ିଆ', 'india'),
  lang('pa-IN', 'Punjabi', 'ਪੰਜਾਬੀ', 'india'),
  lang('ta-IN', 'Tamil', 'தமிழ்', 'india'),
  lang('te-IN', 'Telugu', 'తెలుగు', 'india'),
  lang('ur-PK', 'Urdu', 'اردو', 'india'),
  // World (Gemini-supported)
  lang('af-ZA', 'Afrikaans', 'Afrikaans', 'world'),
  lang('sq-AL', 'Albanian', 'Shqip', 'world'),
  lang('am-ET', 'Amharic', 'አማርኛ', 'world'),
  lang('ar-SA', 'Arabic', 'العربية', 'world'),
  lang('hy-AM', 'Armenian', 'Հայերեն', 'world'),
  lang('az-AZ', 'Azerbaijani', 'Azərbaycan', 'world'),
  lang('eu-ES', 'Basque', 'Euskara', 'world'),
  lang('be-BY', 'Belarusian', 'Беларуская', 'world'),
  lang('bs-BA', 'Bosnian', 'Bosanski', 'world'),
  lang('bg-BG', 'Bulgarian', 'Български', 'world'),
  lang('ca-ES', 'Catalan', 'Català', 'world'),
  lang('zh-CN', 'Chinese (Simplified)', '中文 (简体)', 'world'),
  lang('zh-TW', 'Chinese (Traditional)', '中文 (繁體)', 'world'),
  lang('hr-HR', 'Croatian', 'Hrvatski', 'world'),
  lang('cs-CZ', 'Czech', 'Čeština', 'world'),
  lang('da-DK', 'Danish', 'Dansk', 'world'),
  lang('nl-NL', 'Dutch', 'Nederlands', 'world'),
  lang('et-EE', 'Estonian', 'Eesti', 'world'),
  lang('fa-IR', 'Persian', 'فارسی', 'world'),
  lang('fil-PH', 'Filipino', 'Filipino', 'world'),
  lang('fi-FI', 'Finnish', 'Suomi', 'world'),
  lang('fr-FR', 'French', 'Français', 'world'),
  lang('gl-ES', 'Galician', 'Galego', 'world'),
  lang('ka-GE', 'Georgian', 'ქართული', 'world'),
  lang('de-DE', 'German', 'Deutsch', 'world'),
  lang('el-GR', 'Greek', 'Ελληνικά', 'world'),
  lang('he-IL', 'Hebrew', 'עברית', 'world'),
  lang('hu-HU', 'Hungarian', 'Magyar', 'world'),
  lang('is-IS', 'Icelandic', 'Íslenska', 'world'),
  lang('id-ID', 'Indonesian', 'Bahasa Indonesia', 'world'),
  lang('it-IT', 'Italian', 'Italiano', 'world'),
  lang('ja-JP', 'Japanese', '日本語', 'world'),
  lang('kk-KZ', 'Kazakh', 'Қазақ', 'world'),
  lang('km-KH', 'Khmer', 'ខ្មែរ', 'world'),
  lang('ko-KR', 'Korean', '한국어', 'world'),
  lang('lo-LA', 'Lao', 'ລາວ', 'world'),
  lang('lv-LV', 'Latvian', 'Latviešu', 'world'),
  lang('lt-LT', 'Lithuanian', 'Lietuvių', 'world'),
  lang('mk-MK', 'Macedonian', 'Македонски', 'world'),
  lang('ms-MY', 'Malay', 'Bahasa Melayu', 'world'),
  lang('mn-MN', 'Mongolian', 'Монгол', 'world'),
  lang('no-NO', 'Norwegian', 'Norsk', 'world'),
  lang('pl-PL', 'Polish', 'Polski', 'world'),
  lang('pt-BR', 'Portuguese', 'Português', 'world'),
  lang('ro-RO', 'Romanian', 'Română', 'world'),
  lang('ru-RU', 'Russian', 'Русский', 'world'),
  lang('sr-RS', 'Serbian', 'Српски', 'world'),
  lang('sk-SK', 'Slovak', 'Slovenčina', 'world'),
  lang('sl-SI', 'Slovenian', 'Slovenščina', 'world'),
  lang('es-ES', 'Spanish', 'Español', 'world'),
  lang('sw-KE', 'Swahili', 'Kiswahili', 'world'),
  lang('sv-SE', 'Swedish', 'Svenska', 'world'),
  lang('th-TH', 'Thai', 'ไทย', 'world'),
  lang('tr-TR', 'Turkish', 'Türkçe', 'world'),
  lang('uk-UA', 'Ukrainian', 'Українська', 'world'),
  lang('uz-UZ', 'Uzbek', 'Oʻzbek', 'world'),
  lang('vi-VN', 'Vietnamese', 'Tiếng Việt', 'world'),
  lang('zu-ZA', 'Zulu', 'isiZulu', 'world'),
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
  { code: 'or-IN', re: /[\u0B00-\u0B7F]/g },
  { code: 'ta-IN', re: /[\u0B80-\u0BFF]/g },
  { code: 'te-IN', re: /[\u0C00-\u0C7F]/g },
  { code: 'kn-IN', re: /[\u0C80-\u0CFF]/g },
  { code: 'ml-IN', re: /[\u0D00-\u0D7F]/g },
  { code: 'th-TH', re: /[\u0E00-\u0E7F]/g },
  { code: 'lo-LA', re: /[\u0E80-\u0EFF]/g },
  { code: 'ka-GE', re: /[\u10A0-\u10FF]/g },
  { code: 'am-ET', re: /[\u1200-\u137F]/g },
  { code: 'bn-IN', re: /[\u0980-\u09FF]/g },
  { code: 'ko-KR', re: /[\uAC00-\uD7AF]/g },
  { code: 'ja-JP', re: /[\u3040-\u30FF]/g },
  { code: 'zh-CN', re: /[\u4E00-\u9FFF]/g },
  { code: 'ar-SA', re: /[\u0600-\u06FF]/g },
  { code: 'he-IL', re: /[\u0590-\u05FF]/g },
  { code: 'ru-RU', re: /[\u0400-\u04FF]/g },
  { code: 'el-GR', re: /[\u0370-\u03FF]/g },
  { code: 'hi-IN', re: /[\u0900-\u097F]/g },
];

const MARATHI_MARKERS =
  /\b(आहे|आहेत|तुम्ही|तुमचा|मला|आम्ही|कसे|काय|नाही|होय|कृपया)\b|आहे|तुम्ही|मला/;

const NEPALI_MARKERS = /\b(छ|छन्|हो|होइन|तपाईं|मलाई|कृपया)\b/;

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

  // Clear Indic / other script → that language
  if (best && best.score >= 1) {
    if (best.code === 'hi-IN' && MARATHI_MARKERS.test(raw)) return 'mr-IN';
    if (best.code === 'hi-IN' && NEPALI_MARKERS.test(raw)) return 'ne-NP';
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
    return [
      'AUTO LANGUAGE (70+ languages):',
      'Detect the user’s latest message language yourself and reply in that exact language/script.',
      'Works for Hinglish, Hindi, Tamil, Telugu, Gujarati, Arabic, Spanish, French, Chinese, Japanese, and other supported languages.',
      'Switch every turn if the user switches. Do not stay stuck in a previous language.',
      `Soft UI hint only (ignore if it conflicts with the message): ${lang.nativeLabel}.`,
    ].join(' ');
  }
  if (langCode === 'hi-Latn') return 'Language: Hinglish (Roman Hindi + English).';
  if (langCode === 'hi-IN') return 'Language: Hindi Devanagari.';
  if (langCode === 'en-US') return 'Language: clear Indian English.';
  return `Language lock: reply ONLY in ${lang.replyIn} (${lang.nativeLabel} / ${lang.name}).`;
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
    return 'Namaste. Main Jarvis — Wolf Trade AI desk. Chart screenshot bhejo ya market structure, levels, risk poochho. Main step-by-step analysis dunga.';
  }
  if (langCode === 'hi-IN') {
    return 'नमस्ते। मैं Jarvis हूँ — Wolf Trade AI desk। Chart screenshot भेजें या market structure, levels, risk पूछें। मैं step-by-step analysis दूँगा।';
  }
  if (langCode === 'en-US') {
    return "Good day. I'm Jarvis on the Wolf Trade AI desk. Share a chart screenshot or ask about structure, levels, and risk — I'll walk through the analysis step by step.";
  }
  return `Good day — I'm Jarvis (Wolf Trade AI desk). I'll reply in ${lang.name} (${lang.nativeLabel}). Share a chart or ask about structure, levels, and risk.`;
}

export function getChartVisionPrompt(langCode: string, userNote?: string, autoMode = false): string {
  const note = userNote?.trim();
  const lock = buildLanguageDirective(langCode, autoMode);
  return [
    lock,
    'TRAFI Module 1+2A+2B. Answer USER question FIRST. Psychology BEFORE candle/Doji name. Location > shape. Doji=indecision — never trade alone; need confirmation.',
    'Order: Structure → Trend → Liquidity → S/R → Volume → PA → Candle psych → Indicators → Risk. Never trade inside Long-Legged Doji. Ignore Four-Price Doji.',
    'Concept Q: 4–8 short lines. Full: Trend · Structure · S/R · Liquidity · Volume · Candle story · Pattern · Risk/Weaknesses · Entry/Stop/Targets · Invalidation · Probabilities · Confidence · Summary.',
    'Evidence only. Never invent. Never buy/sell. Under ~200 words full / ~120 Q&A.',
    note ? `User question: ${note}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function getTradingBlockMessage(langCode: string): string {
  if (isHindiLang(langCode)) {
    return 'Main markets, options, risk, strategy aur platform analysis pe focus karta hoon. Apna sawal isi space me poochiye.';
  }
  return 'I focus on markets, options, risk, strategy, and platform analysis. Please rephrase your question in that space.';
}

/** Soft user-facing error — never show technical / npm / stack details */
export function getMasterAiSorryMessage(langCode: string, kind: 'chat' | 'chart' | 'image' = 'chat'): string {
  if (isHindiLang(langCode)) {
    if (kind === 'chart') return 'Chart abhi read nahi ho paya. Thodi der baad dubara bhejiye.';
    if (kind === 'image') return 'Screenshot load nahi hua. Kripya dusra chart image try kijiye.';
    return 'Abhi jawab complete nahi ho paya. Thodi der baad phir try kijiye.';
  }
  if (kind === 'chart') return 'The chart could not be read just now. Please send it again in a moment.';
  if (kind === 'image') return 'That screenshot could not be loaded. Please try another chart image.';
  return 'The response could not be completed just now. Please try again shortly.';
}

/** Prefer web/news models only when the question needs “latest” info */
export function shouldUseWebSearch(input: string): boolean {
  const n = input.toLowerCase();
  return /\b(news|headline|latest|today|rbi|fed|cpi|gdp|budget|result|earnings|sebi|ban|event|why.*(fall|crash|rally)|kya.*(hua|huya))\b/i.test(
    n,
  );
}

export const MASTER_AI_MODELS: MasterAiModel[] = [
  { id: 'gemini/auto', name: 'Auto (Flash)', provider: 'Google', description: 'Smart default — fast trading chat + charts' },
  { id: 'gemini-2.5-flash', name: 'Flash', provider: 'Google', description: 'Best quality / cost for trading chat + charts' },
  { id: 'gemini-2.5-flash-lite', name: 'Flash Lite', provider: 'Google', description: 'Cheapest — lighter answers' },
  { id: 'gemini-2.0-flash', name: 'Flash 2.0', provider: 'Google', description: 'Fast multilingual fallback' },
  { id: 'gemini-2.5-pro', name: 'Pro', provider: 'Google', description: 'Deepest analysis (uses more credits)' },
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
- Jarvis (Analyse AI): senior market analyst voice for Wolf Trade AI — human desk tone, chart analysis, never chatbot phrasing
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
    return 'Analysis ke liye Nifty ka chart screenshot bhejiye. Us image se structure aur levels clear karunga.';
  }
  return 'Please share a Nifty chart screenshot. I will read structure and levels from that image.';
}

/** “Aaj nifty kaisa tha / market kaisa hai” style — needs chart, no invented levels */
export function isDayMarketReviewQuestion(input: string): boolean {
  const n = String(input || '').toLowerCase().trim();
  if (!n || n.length > 160) return false;
  // Follow-ups about an existing setup should NOT be blocked
  if (/^\s*(sl|stoploss|stop\s*loss|target|entry|invalidation|rr|risk|aur|uske\s+baad|same|uska|uski)\b/i.test(n)) {
    return false;
  }
  return /\b(aaj|today|abhi|kaise\s+(tha|hai|raha)|kaisa\s+(tha|hai)|how\s+(was|is)|market\s+view|nifty|banknifty|sensex|din\s+(kaisa|kaise)|session)\b/i.test(
    n,
  ) && /\b(kaisa|kaise|tha|hai|raha|was|is|view|performance|recap|summary|batao|bata|analyse|analyze)\b/i.test(n);
}

/** Fixed reply — never mentions live data */
export function getNeedChartOnlyReply(langCode: string): string {
  if (isHinglishLang(langCode) || langCode === 'hi-IN' || langCode.startsWith('hi')) {
    return 'Analysis ke liye Nifty ka TradingView chart screenshot bhejiye. Us image se main structure aur levels clear karunga.';
  }
  return 'Please share a Nifty TradingView chart screenshot. I will read structure and levels from that image.';
}

export function isTradingRelated(input: string): boolean {
  const n = input.toLowerCase().trim();
  if (!n) return false;
  if (isCasualGreeting(n)) return true;
  if (n.length < 2) return false;
  if (NON_TRADING_TERMS.some((t) => n.includes(t))) return false;
  if (TRADING_KEYWORDS.some((t) => n.includes(t))) return true;
  if (isConversationFollowUp(n)) return true;
  // Short polite chat on the desk (thanks / ok / cool)
  if (isPoliteAck(n)) {
    return true;
  }
  return false;
}

/** Follow-ups that continue an existing desk thread (language switch, SL, more detail, etc.) */
export function isConversationFollowUp(input: string): boolean {
  const n = String(input || '').toLowerCase().trim();
  if (!n || n.length > 160) return false;
  if (
    /\b(english|hindi|hinglish|हिंदी|urdu|tamil|telugu|gujarati|marathi|bengali)\b/i.test(n) &&
    /\b(me|mein|main|in|batao|bata|bolo|bol|likho|reply|explain|samjha|translate|karo|kar)\b/i.test(n)
  ) {
    return true;
  }
  if (
    /^(in\s+english|english\s+please|please\s+in\s+english|same\s+in\s+english|hindi\s+me|english\s+me|hinglish\s+me)/i.test(
      n,
    )
  ) {
    return true;
  }
  if (
    /^(aur\??|phir\??|uske\s+baad\??|uska\??|uski\??|use\??|ese\??|aise\??|is[e]?\??|sl\??|target\??|entry\??|kyun\??|why\??|more|detail|details|explain|dobara|again|same)\b/i.test(
      n,
    )
  ) {
    return true;
  }
  return false;
}

/** Explicit language lock from user text like “english me batao” */
export function detectExplicitLanguageRequest(input: string): MasterAiLangCode | null {
  const n = String(input || '').toLowerCase().trim();
  if (!n) return null;
  if (
    /\b(in\s+english|english\s+me|english\s+mein|english\s+main|english\s+please|reply\s+in\s+english|ese\s+english|same\s+in\s+english)\b/i.test(
      n,
    )
  ) {
    return 'en-US';
  }
  if (/\b(hinglish\s+me|in\s+hinglish|roman\s+hindi)\b/i.test(n)) return 'hi-Latn';
  if (
    /\b(hindi\s+me|hindi\s+mein|hindi\s+main|in\s+hindi|हिंदी\s+में|हिन्दी\s+में|devanagari|hindi\s+batao|hindi\s+me\s+batao|hindi\s+me\s+btao)\b/i.test(
      n,
    ) ||
    /^hindi\s+me\s+bta?o/i.test(n)
  ) {
    return 'hi-IN';
  }
  return null;
}

/** True if recent chat already has desk/trading context worth continuing */
export function hasActiveDeskThread(
  messages: Array<{ id?: string; role: string; text: string; imageUrl?: string }>,
): boolean {
  const recent = messages.filter((m) => m.id !== 'welcome').slice(-12);
  if (!recent.length) return false;
  // Any real back-and-forth means continue the conversation
  const userTurns = recent.filter((m) => m.role === 'user').length;
  const aiTurns = recent.filter((m) => m.role === 'trafi' || m.role === 'assistant').length;
  if (userTurns >= 1 && aiTurns >= 1) return true;
  return recent.some(
    (m) =>
      Boolean(m.imageUrl) ||
      isTradingRelated(m.text) ||
      /chart|bias|support|resistance|nifty|bullish|bearish|analysis|levels?/i.test(m.text),
  );
}

export function getHumanGreetingReply(langCode: string, userText: string): string {
  const hinglish = isHinglishLang(langCode) || langCode === 'hi-IN';
  const variantsHi = [
    'Namaste. Jarvis — Wolf Trade AI desk. Bataiye, aaj kya analyse karna hai?',
    'Good to hear from you. Main Jarvis. Chart ya market sawal — seedha shuru karte hain.',
    'Namaste. Desk ready hai. Symbol, timeframe, ya chart share kijiye.',
    'Hello. Jarvis yahan. Aaj ka focus kya rakhna hai — structure, levels, ya risk?',
  ];
  const variantsEn = [
    'Good day. Jarvis on the Wolf Trade AI desk — what would you like to analyse?',
    'Hello. Ready when you are. Share a chart or your market question.',
    'Good to connect. Jarvis here — symbol, timeframe, or a screenshot, and we begin.',
    'Hello. What should we review first — structure, levels, or risk?',
  ];
  const list = hinglish ? variantsHi : variantsEn;
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
  const niftyRaw = String(ctx.nifty || '');
  const hasLiveTape = /\d/.test(niftyRaw) && !/n\/a|from chart/i.test(niftyRaw);
  const liveBanner = hasLiveTape
    ? 'LIVE CONTEXT: real snapshot numbers below — cite only these if you use levels.'
    : 'NO CHART ATTACHED: Do not invent levels. Ask only for a TradingView chart screenshot.';

  if (compact) {
    return [
      buildLanguageDirective(langCode, autoMode),
      'You are Jarvis — Wolf Trade AI. Accuracy first: never invent prices/levels. bullish/bearish only (no buy/sell orders).',
      liveBanner,
      `Session: ${ctx.session}`,
      hasLiveTape
        ? `NIFTY ${ctx.nifty} · BANKNIFTY ${ctx.bankNifty} · PCR ${ctx.pcr} · max pain ${ctx.maxPain}`
        : 'NIFTY n/a · BANKNIFTY n/a · PCR n/a · max pain n/a',
      hasLiveTape && ctx.signals ? `Signals: ${ctx.signals}` : '',
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
        : 'Add an AI API key (aistudio.google.com) in Profile',
    };
  } catch {
    return {
      configured: false,
      message: serverUnreachableMessage(),
      keySource: 'none',
    };
  }
}

/** Compact memory cues from recent turns — helps follow-ups (“SL?”, “target?”) stay on-topic */
export function buildConversationMemoryNote(history: ChatHistoryItem[]): string {
  if (!history.length) return '';
  const blob = history
    .map((h) => h.content)
    .join('\n')
    .slice(0, 6000);

  const symbols = Array.from(
    new Set(
      (blob.match(/\b(NIFTY|BANKNIFTY|FINNIFTY|SENSEX|RELIANCE|TCS|INFY|HDFCBANK|ICICIBANK|[A-Z]{2,12})\b/g) || [])
        .filter((s) => !['CE', 'PE', 'SL', 'PCR', 'OI', 'EMA', 'RSI', 'MACD', 'VWAP'].includes(s)),
    ),
  ).slice(0, 8);

  const timeframes = Array.from(
    new Set(blob.match(/\b(\d+\s?(m|min|mins|h|hr|hour|hours|d|day|days)|1H|4H|15m|5m|daily|weekly)\b/gi) || []),
  ).slice(0, 6);

  const levels = Array.from(new Set(blob.match(/\b\d{4,6}(?:\.\d+)?\b/g) || [])).slice(-12);

  const bias =
    /\bbullish\b/i.test(blob) && /\bbearish\b/i.test(blob)
      ? 'mixed (check last assistant turn)'
      : /\bbullish\b/i.test(blob)
        ? 'bullish cues in thread'
        : /\bbearish\b/i.test(blob)
          ? 'bearish cues in thread'
          : /\bsideways|range\b/i.test(blob)
            ? 'sideways/range cues in thread'
            : '';

  const lines = [
    'THREAD MEMORY (use for follow-ups; do not invent beyond this + latest chart/message):',
    symbols.length ? `Symbols mentioned: ${symbols.join(', ')}` : '',
    timeframes.length ? `Timeframes mentioned: ${timeframes.join(', ')}` : '',
    levels.length ? `Levels mentioned: ${levels.join(', ')}` : '',
    bias ? `Bias cues: ${bias}` : '',
    'If the user asks a short follow-up, continue the last setup — do not restart from zero.',
  ].filter(Boolean);

  return lines.length > 2 ? lines.join('\n') : '';
}

export async function askMasterAi(req: MasterChatRequest, ctx: MasterMarketContext): Promise<MasterChatResponse> {
  const greeting = isCasualGreeting(req.message || '');
  const autoMode = req.langMode === 'auto' || !req.langMode;
  // Always compact market dump — chart/image already carries levels; saves input tokens
  const history = (req.history ?? [])
    .slice(-24)
    .map((h) => ({
      role: h.role,
      content: String(h.content || '').slice(0, 2000),
    }));

  const memoryNote = buildConversationMemoryNote(history);
  const baseContext = greeting
    ? [
        buildLanguageDirective(req.lang, autoMode),
        'User sent a greeting. Reply in 1–2 respectful desk lines as Jarvis. No market dump.',
      ].join('\n')
    : formatContextBlock(ctx, req.lang, true, autoMode);
  const platformContext = memoryNote ? `${baseContext}\n\n${memoryNote}` : baseContext;

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
      ? 'Theek hai. Chart ya agla sawal share kijiye — step-by-step review karte hain.'
      : 'Understood. Share the chart or your next question and we will review it step by step.';
  }

  if (lower.includes('option') || lower.includes('pcr') || lower.includes('oi') || lower.includes('ऑप्शन')) {
    return hi
      ? `Current snapshot: overall PCR ~${ctx.pcr}, max pain ~${ctx.maxPain}. ${ctx.session}. Jab tak structure clear na ho, defined-risk approach better rahegi.`
      : `Current snapshot: overall PCR around ${ctx.pcr}, max pain near ${ctx.maxPain}. ${ctx.session}. Until structure is clear, a defined-risk approach is more disciplined.`;
  }

  return hi
    ? `NIFTY ${ctx.nifty}, BANKNIFTY ${ctx.bankNifty}. Breadth: ${ctx.breadth}. Markets, options, risk aur strategy pe focused analysis mil sakti hai — sawal clearly poochiye.`
    : `NIFTY ${ctx.nifty}; BANKNIFTY ${ctx.bankNifty}. Breadth: ${ctx.breadth}. Ask clearly on markets, options, risk, or strategy for a focused desk review.`;
}
