import { apiFetch } from '../config/api';
import { hasRemoteApi, masterAiOfflineMessage } from '../constants/brandLabels';
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
import type { WolfAnalysisMode } from '../constants/wolfAnalysisModes';
import {
  isForexMarketOpen,
  isMcxMarketOpen,
  isNseFnoMarketOpen,
} from '../utils/marketHours';

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
 * Languages Hunter can lock to — aligned with Gemini web app multilingual support (70+).
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
  fallback: MasterAiLangCode = 'en-US',
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
  return getMasterAiLanguage(detected || fallback || 'en-US');
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
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const nse = isNseFnoMarketOpen(now);
    const fx = isForexMarketOpen(now);
    const mcx = isMcxMarketOpen(now);
    return `IST now ${get('hour')}:${get('minute')} (${get('weekday')}) · NSE ${nse ? 'OPEN' : 'CLOSED'} · MCX ${mcx ? 'OPEN' : 'CLOSED'} · FX/Metals ${fx ? 'OPEN' : 'CLOSED'} · Crypto 24/7`;
  } catch {
    return 'Session clock unavailable';
  }
}

export function getMasterAiWelcome(langCode: string): string {
  const lang = getMasterAiLanguage(langCode);
  if (isHinglishLang(langCode)) {
    return 'Namaste. Main Hunter — Wolf Trade AI. Chart screenshot bhejo, setup mode choose karo (S/R, Liquidity, Structure…); Bias · Entry condition · SL · Target · WAIT/NO TRADE dunga.';
  }
  if (langCode === 'hi-IN') {
    return 'नमस्ते। मैं Hunter हूँ — Wolf Trade AI। चार्ट screenshot भेजें, setup चुनें; Bias · Entry · SL · Target · WAIT मिलेगा।';
  }
  if (langCode === 'en-US') {
    return "I'm Hunter on Wolf Trade AI. Upload a chart, pick a setup (S/R, Liquidity, Structure…), and I'll return Bias, Entry conditions, SL/Target logic, and WAIT / NO TRADE when needed.";
  }
  return `I'm Hunter (Wolf Trade AI). I'll reply in ${lang.name} (${lang.nativeLabel}). Upload a chart + pick a setup for structured analysis.`;
}

export function getChartVisionPrompt(
  langCode: string,
  userNote?: string,
  autoMode = false,
  analysisMode: WolfAnalysisMode = 'auto',
): string {
  const note = userNote?.trim();
  const lock = buildLanguageDirective(langCode, autoMode);
  const modeLabel = analysisMode.replace(/_/g, ' ').toUpperCase();
  return [
    lock,
    `WOLF AI SETUP DESK — mode: ${modeLabel}. Visual trading intelligence — not a signal bot.`,
    'Fill locked template: Market Bias · Setup · Status · Key Observation · Direction · Entry Condition · SL Logic · Target Logic · Invalidation · Evidence Score · Why · Assumptions.',
    'LONG BIAS | SHORT BIAS | WAIT | NO TRADE. Exact prices only if scale readable. Never invent levels. No wolfchart.',
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

/**
 * "Try again shortly" is the wrong advice when the screenshot was too big or no
 * API key is set — those need the user to do something specific.
 */
export function describeMasterAiFailure(
  err: unknown,
  langCode: string,
  kind: 'chat' | 'chart' | 'image' = 'chat',
): string {
  const status = (err as { status?: number } | null)?.status;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err || '');
  const hindi = isHindiLang(langCode) || isHinglishLang(langCode);
  if (status === 413) {
    return hindi
      ? 'Screenshot bahut bada hai. Chart ko crop karke ya JPG me save karke bhejiye.'
      : 'That screenshot is too large. Crop the chart or save it as JPG and send it again.';
  }
  if (status === 503) {
    return hindi
      ? 'AI key abhi set nahi hai. Profile me API key add karke try kijiye.'
      : 'No AI key is configured yet. Add an API key in Profile and try again.';
  }
  if (status === 429) {
    return hindi
      ? 'AI ka limit abhi full hai. Ek-do minute baad try kijiye.'
      : 'The AI quota is exhausted right now. Please try again in a minute.';
  }
  if (status === 402 || /prompt tokens limit|sufficient credits|upgrade to a paid/i.test(msg)) {
    return hindi
      ? 'AI credit / free prompt limit khatam hai. OpenRouter pe credits add karo, ya Profile me Google Gemini (AIza…) key daalo.'
      : 'AI credit or free prompt limit hit. Add OpenRouter credits, or paste a Google Gemini key (AIza…) in Profile.';
  }
  if (status === 502 || /empty reply|all models failed|models unavailable/i.test(msg)) {
    return hindi
      ? 'AI abhi busy / empty reply aayi. 5–10 second baad ek baar phir try kijiye.'
      : 'Wolf AI was busy or returned an empty reply. Wait a few seconds and try again.';
  }
  if (/abort|timeout/i.test(msg)) {
    return hindi
      ? 'Server wake-up / slow reply — jawab late ho gaya. Ek baar phir try kijiye (usually chalta hai).'
      : 'That took too long (cold start or busy). Please try once more — it usually works.';
  }
  if (/Failed to fetch|NetworkError|network|Load failed|ECONNRESET/i.test(msg)) {
    return hindi
      ? 'API tak pahunch nahi paaye (network/server restart). 5–10 second baad try kijiye.'
      : 'Could not reach the AI API (network or server restart). Wait 5–10s and try again.';
  }
  return getMasterAiSorryMessage(langCode, kind);
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
- Hunter (Wolf AI): senior market analyst voice for Wolf Trade AI — human desk tone, chart analysis, never chatbot phrasing
- Owner teachings: when admin uploads PDFs/notes, Hunter follows that house method first
Live market data comes from the connected live feed in Profile.
`;

const NON_TRADING_TERMS = [
  'weather', 'movie', 'film', 'song', 'lyrics', 'recipe', 'cooking', 'joke', 'shayari',
  'poem', 'romance', 'dating', 'girlfriend', 'boyfriend', 'love letter',
  'doctor', 'medicine', 'symptom', 'homework', 'assignment', 'essay',
  'gaming', 'fortnite', 'football', 'cricket match', 'cricket score',
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
  // Price-action and chart-markup vocabulary — "order block mark kro" is desk talk.
  'order block', 'orderblock', 'supply', 'demand', 'fvg', 'imbalance', 'liquidity',
  'bos', 'choch', 'structure', 'zone', 'level', 'pivot', 'trendline', 'trend line',
  'fib', 'retracement', 'mark', 'draw', 'annotate', 'highlight', 'khinch', 'dikha',
  'ema', 'sma', 'bollinger', 'atr', 'stochastic', 'supertrend', 'ichimoku', 'timeframe',
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
    return 'Setup analysis sirf chart screenshot se hota hai. Screenshot chip / attach se chart image bhejo, setup mode choose karo — phir Bias · Entry · SL · Target dunga. Bina image ke levels invent nahi karta.';
  }
  return 'Setup analysis is screenshot-only. Upload a chart (Screenshot / attach), pick a setup mode, and I will reply with Bias · Entry · SL · Target from that image only — I will not invent levels without a chart.';
}

/** “Aaj nifty kaisa tha / market kaisa hai” style — needs chart, no invented levels */
export function isDayMarketReviewQuestion(input: string): boolean {
  const n = String(input || '').toLowerCase().trim();
  if (!n || n.length > 160) return false;
  // Follow-ups about an existing setup should NOT be blocked
  if (/^\s*(sl|stoploss|stop\s*loss|target|entry|invalidation|rr|risk|aur|uske\s+baad|same|uska|uski)\b/i.test(n)) {
    return false;
  }
  if (isJournalReviewQuestion(n)) return false;
  return /\b(aaj|today|abhi|kaise\s+(tha|hai|raha)|kaisa\s+(tha|hai)|how\s+(was|is)|market\s+view|nifty|banknifty|sensex|din\s+(kaisa|kaise)|session)\b/i.test(
    n,
  ) && /\b(kaisa|kaise|tha|hai|raha|was|is|view|performance|recap|summary|batao|bata|analyse|analyze)\b/i.test(n);
}

/** User wants analysis of the platform Trading Journal (not a new journal). */
export function isJournalReviewQuestion(input: string): boolean {
  const n = String(input || '').toLowerCase().trim();
  if (!n) return false;
  return /\b(journal|trading\s*journal|trade\s*review|my\s*trades|meri\s*(trades?|journal)|journal\s*(review|padh|analyse|analyze|check|dekho|quality|completeness)|review\s*my\s*(journal|trades)|trades?\s*(review|analyse|analyze)|win\s*rate|expectancy|profit\s*factor|rule\s*compliance|discipline\s*(score|review)|mera\s*journal|risk\s*drift|outlier|pattern\s*discovery|trade\s*quality|completeness)\b/i.test(
    n,
  );
}

/** Soft completeness warnings — never block save; never invent missing data. */
export function getJournalCompletenessWarnings(
  trade: {
    instrument?: string;
    entryPrice?: number;
    exitPrice?: number;
    stopLoss?: number;
    target?: number;
    quantity?: number;
    strategy?: string;
    notes?: string;
    screenshot?: string;
    beforeEmotion?: string;
    afterEmotion?: string;
    psychologyNote?: string;
    tags?: string[];
    type?: string;
    side?: string;
  },
): string[] {
  const warnings: string[] = [];
  if (!Number(trade.entryPrice)) warnings.push('Entry price missing/zero');
  if (!Number(trade.exitPrice)) warnings.push('Exit price missing/zero');
  if (!Number(trade.stopLoss)) warnings.push('Stop loss missing/zero');
  if (!Number(trade.target)) warnings.push('Target missing/zero');
  if (!Number(trade.quantity)) warnings.push('Position size missing/zero');
  if (!String(trade.strategy || '').trim() || trade.strategy === 'Manual') {
    warnings.push('Strategy not specified');
  }
  if (!String(trade.type || '').trim()) warnings.push('Timeframe/type missing');
  if (!String(trade.side || '').trim()) warnings.push('Direction missing');
  if (!String(trade.notes || '').trim()) warnings.push('Trade notes empty');
  if (!trade.screenshot) warnings.push('No screenshot attached');
  if (![trade.beforeEmotion, trade.afterEmotion, trade.psychologyNote].some((x) => String(x || '').trim())) {
    warnings.push('Emotion notes empty');
  }
  if (!Array.isArray(trade.tags) || trade.tags.length === 0) warnings.push('No trade tags');
  return warnings;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function scoreTradeCompleteness(t: {
  instrument?: string;
  entryPrice?: number;
  exitPrice?: number;
  stopLoss?: number;
  target?: number;
  quantity?: number;
  strategy?: string;
  notes?: string;
  screenshot?: string;
  beforeEmotion?: string;
  afterEmotion?: string;
  psychologyNote?: string;
  tags?: string[];
  type?: string;
  side?: string;
  pnl?: number;
}): { score: number; label: string } {
  let pts = 0;
  const max = 10;
  if (t.instrument) pts += 1;
  if (Number(t.entryPrice) && Number(t.exitPrice)) pts += 1;
  if (Number(t.stopLoss) && Number(t.target)) pts += 1;
  if (Number(t.quantity)) pts += 1;
  if (t.strategy && t.strategy !== 'Manual') pts += 1;
  if (t.type && t.side) pts += 1;
  if (Number.isFinite(Number(t.pnl))) pts += 1;
  if (String(t.notes || '').trim()) pts += 1;
  if (t.screenshot) pts += 1;
  if (
    [t.beforeEmotion, t.afterEmotion, t.psychologyNote].some((x) => String(x || '').trim()) ||
    (Array.isArray(t.tags) && t.tags.length > 0)
  ) {
    pts += 1;
  }
  const score = Math.round((pts / max) * 100);
  const label =
    score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 55 ? 'Average' : score >= 35 ? 'Incomplete' : 'Poor';
  return { score, label };
}

/** Compact snapshot from platform journal — no screenshots, no invented fields. */
export function buildJournalContextForAi(
  trades: Array<{
    id?: string;
    instrument?: string;
    side?: string;
    type?: string;
    strategy?: string;
    date?: string;
    entryPrice?: number;
    exitPrice?: number;
    stopLoss?: number;
    target?: number;
    quantity?: number;
    pnl?: number;
    rr?: number;
    brokerage?: number;
    notes?: string;
    tags?: string[];
    beforeEmotion?: string;
    afterEmotion?: string;
    psychologyNote?: string;
    market?: string;
    discipline?: number;
    confidence?: number;
    screenshot?: string;
    positionSize?: number;
  }>,
): string {
  const list = Array.isArray(trades) ? trades : [];
  if (!list.length) {
    return [
      'PLATFORM TRADING JOURNAL v3.0 (ONLY source of truth):',
      'Trade count: 0',
      'Insufficient journal evidence — do not invent trades. User should log trades in the platform Trading Journal.',
    ].join('\n');
  }

  const wins = list.filter((t) => Number(t.pnl) > 0);
  const losses = list.filter((t) => Number(t.pnl) < 0);
  const flat = list.filter((t) => Number(t.pnl) === 0);
  const grossWin = wins.reduce((s, t) => s + Number(t.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.pnl || 0), 0));
  const net = list.reduce((s, t) => s + Number(t.pnl || 0), 0);
  const fees = list.reduce((s, t) => s + Number(t.brokerage || 0), 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const winRate = list.length ? (wins.length / list.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const expectancy = list.length ? net / list.length : 0;
  const rrVals = list.map((t) => Number(t.rr)).filter((n) => Number.isFinite(n));
  const avgRr = rrVals.length ? rrVals.reduce((a, b) => a + b, 0) / rrVals.length : 0;
  const sizes = list.map((t) => Number(t.quantity || t.positionSize || 0)).filter((n) => n > 0);
  const absPnls = list.map((t) => Math.abs(Number(t.pnl || 0)));
  const medSize = median(sizes);
  const medAbsPnl = median(absPnls);
  const medRr = median(rrVals.map((n) => Math.abs(n)));

  const completeness = list.map((t) => scoreTradeCompleteness(t));
  const avgCompleteness =
    completeness.reduce((s, c) => s + c.score, 0) / Math.max(1, completeness.length);
  const completenessLabel =
    avgCompleteness >= 90
      ? 'Excellent'
      : avgCompleteness >= 75
        ? 'Good'
        : avgCompleteness >= 55
          ? 'Average'
          : avgCompleteness >= 35
            ? 'Incomplete'
            : 'Poor';

  const integrity: string[] = [];
  const ids = new Set<string>();
  for (const t of list) {
    if (t.id) {
      if (ids.has(t.id)) integrity.push(`Duplicate ID ${t.id}`);
      ids.add(t.id);
    }
    if (!t.instrument) integrity.push('Missing symbol');
    if (Number(t.quantity) < 0) integrity.push(`Negative qty ${t.instrument || t.id}`);
    if (Number(t.entryPrice) < 0 || Number(t.exitPrice) < 0) {
      integrity.push(`Impossible price ${t.instrument || t.id}`);
    }
  }

  const outliers = list
    .filter((t) => {
      const size = Number(t.quantity || t.positionSize || 0);
      const ap = Math.abs(Number(t.pnl || 0));
      const rr = Math.abs(Number(t.rr || 0));
      return (
        (medSize > 0 && size > medSize * 3) ||
        (medAbsPnl > 0 && ap > medAbsPnl * 4) ||
        (medRr > 0 && rr > medRr * 4)
      );
    })
    .slice(0, 8)
    .map(
      (t) =>
        `${t.date || '?'} ${t.instrument || '?'} pnl=${Number(t.pnl || 0).toFixed(2)} rr=${Number(t.rr || 0).toFixed(2)} qty=${t.quantity ?? '?'}`,
    );

  const byStrategy = new Map<string, { n: number; pnl: number; wins: number }>();
  const byType = new Map<string, { n: number; pnl: number; wins: number }>();
  for (const t of list) {
    const key = (t.strategy || 'Unspecified').trim() || 'Unspecified';
    const row = byStrategy.get(key) || { n: 0, pnl: 0, wins: 0 };
    row.n += 1;
    row.pnl += Number(t.pnl || 0);
    if (Number(t.pnl) > 0) row.wins += 1;
    byStrategy.set(key, row);
    const tk = (t.type || 'Unspecified').trim() || 'Unspecified';
    const tr = byType.get(tk) || { n: 0, pnl: 0, wins: 0 };
    tr.n += 1;
    tr.pnl += Number(t.pnl || 0);
    if (Number(t.pnl) > 0) tr.wins += 1;
    byType.set(tk, tr);
  }
  const strategyLines = [...byStrategy.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 8)
    .map(
      ([name, s]) =>
        `${name}: n=${s.n} win%=${((s.wins / s.n) * 100).toFixed(0)} net=${s.pnl.toFixed(2)}`,
    );
  const typeLines = [...byType.entries()]
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .slice(0, 6)
    .map(([name, s]) => `${name}: n=${s.n} net=${s.pnl.toFixed(2)}`);

  // Simple risk-drift cue: compare first half vs second half avg |pnl| and |rr|
  const chrono = [...list].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const mid = Math.floor(chrono.length / 2);
  const halfStats = (slice: typeof chrono) => {
    const pnls = slice.map((t) => Math.abs(Number(t.pnl || 0)));
    const rrs = slice.map((t) => Math.abs(Number(t.rr || 0))).filter((n) => n > 0);
    return {
      avgAbsPnl: pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0,
      avgAbsRr: rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0,
      avgSize:
        slice.map((t) => Number(t.quantity || 0)).filter((n) => n > 0).reduce((a, b) => a + b, 0) /
        Math.max(1, slice.filter((t) => Number(t.quantity) > 0).length),
    };
  };
  const early = halfStats(chrono.slice(0, mid || 1));
  const late = halfStats(chrono.slice(mid));
  const riskDriftNote =
    chrono.length >= 6
      ? `Risk drift cue (early→late half): |PnL| ${early.avgAbsPnl.toFixed(1)}→${late.avgAbsPnl.toFixed(1)} · |RR| ${early.avgAbsRr.toFixed(2)}→${late.avgAbsRr.toFixed(2)} · size ${early.avgSize.toFixed(1)}→${late.avgSize.toFixed(1)} (descriptive only — not a diagnosis)`
      : 'Risk drift: Insufficient journal evidence (need more trades)';

  const recent = [...list]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 25)
    .map((t) => {
      const emo = [t.beforeEmotion, t.afterEmotion, t.psychologyNote].filter(Boolean).join('|');
      const tags = Array.isArray(t.tags) && t.tags.length ? t.tags.slice(0, 4).join('+') : '';
      const note = String(t.notes || '').replace(/\s+/g, ' ').slice(0, 80);
      const comp = scoreTradeCompleteness(t);
      const soft = getJournalCompletenessWarnings(t).slice(0, 3).join(';');
      return [
        t.date || '?',
        t.instrument || '?',
        t.side || '?',
        t.type || '?',
        t.strategy || '-',
        `E${t.entryPrice ?? '?'}→X${t.exitPrice ?? '?'}`,
        `SL${t.stopLoss ?? '?'} T${t.target ?? '?'}`,
        `qty${t.quantity ?? '?'}`,
        `pnl=${Number(t.pnl || 0).toFixed(2)}`,
        `rr=${Number(t.rr || 0).toFixed(2)}`,
        `complete=${comp.score}/${comp.label}`,
        tags ? `tags:${tags}` : '',
        emo ? `emo:${emo.slice(0, 60)}` : '',
        note ? `note:${note}` : '',
        soft ? `warn:${soft}` : '',
        t.screenshot ? 'shot:yes' : 'shot:no',
      ]
        .filter(Boolean)
        .join(' · ');
    });

  return [
    'PLATFORM TRADING JOURNAL v3.0 (ONLY source of truth — analyze ONLY these records; never modify):',
    `Trade count: ${list.length} | Wins: ${wins.length} | Losses: ${losses.length} | Flat: ${flat.length}`,
    `Journal Completeness: ${avgCompleteness.toFixed(0)}/100 (${completenessLabel})`,
    `WinRate: ${winRate.toFixed(1)}% | NetP/L: ${net.toFixed(2)} | Fees: ${fees.toFixed(2)} | Expectancy/trade: ${expectancy.toFixed(2)}`,
    `AvgWin: ${avgWin.toFixed(2)} | AvgLoss: ${avgLoss.toFixed(2)} | ProfitFactor: ${
      Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : 'n/a'
    } | AvgRR: ${avgRr.toFixed(2)}`,
    strategyLines.length ? `By strategy: ${strategyLines.join(' | ')}` : '',
    typeLines.length ? `By timeframe/type: ${typeLines.join(' | ')}` : '',
    riskDriftNote,
    outliers.length ? `Outliers (not assumed mistakes): ${outliers.join(' || ')}` : 'Outliers: none flagged vs median',
    integrity.length
      ? `Integrity flags (do not change data): ${[...new Set(integrity)].slice(0, 8).join(' | ')}`
      : 'Integrity flags: none observed',
    'Recent trades (screenshots not embedded; missing fields ignored):',
    ...recent,
    'Output focus: Journal Quality · Trade Quality · Compliance · Behavior · Risk · Execution · Pattern · Similarity · Primary Insight · Recommended Focus · Confidence.',
    'Rules: Never invent trades/emotions/reasons/performance. Separate Good Decision from Good Result; Bad Result from Bad Process. Small samples → low confidence / Insufficient journal evidence.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Fixed reply — never mentions live data */
export function getNeedChartOnlyReply(langCode: string): string {
  if (isHinglishLang(langCode) || langCode === 'hi-IN' || langCode.startsWith('hi')) {
    return 'Analysis ke liye Nifty ka TradingView chart screenshot bhejiye. Us image se main structure aur levels clear karunga.';
  }
  return 'Please share a Nifty TradingView chart screenshot. I will read structure and levels from that image.';
}

/**
 * A trading desk gets asked in a thousand phrasings — "expiry pe kya hota hai",
 * "chandi ka scene", "revenge trading se kaise bachu" — and a keyword whitelist
 * turns every one it has not seen into a refusal, which reads like a broken app.
 * Only clearly off-topic questions are turned away; the desk answers the rest.
 */
export function isTradingRelated(input: string): boolean {
  const n = input.toLowerCase().trim();
  if (!n) return false;
  if (isCasualGreeting(n)) return true;
  if (n.length < 2) return false;
  if (TRADING_KEYWORDS.some((t) => n.includes(t))) return true;
  if (NON_TRADING_TERMS.some((t) => n.includes(t))) return false;
  return true;
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
    'Namaste. Hunter — Wolf Trade AI desk. Bataiye, aaj kya analyse karna hai?',
    'Good to hear from you. Main Hunter. Chart ya market sawal — seedha shuru karte hain.',
    'Namaste. Desk ready hai. Symbol, timeframe, ya chart share kijiye.',
    'Hello. Hunter yahan. Aaj ka focus kya rakhna hai — structure, levels, ya risk?',
  ];
  const variantsEn = [
    'Good day. Hunter on the Wolf Trade AI desk — what would you like to analyse?',
    'Hello. Ready when you are. Share a chart or your market question.',
    'Good to connect. Hunter here — symbol, timeframe, or a screenshot, and we begin.',
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
  const liveBanner =
    'SCREENSHOT-ONLY DESK: no live market tape. For setup/bias/entry/SL/target, require a chart image. Never invent prices. Follow-ups may use the last analyzed screenshot context in chat history.';

  if (compact) {
    return [
      buildLanguageDirective(langCode, autoMode),
      'You are Hunter — Wolf AI visual setup analyst. Accuracy first: never invent prices/levels.',
      liveBanner,
      `Session: ${ctx.session}`,
      'NIFTY n/a · BANKNIFTY n/a · PCR n/a · max pain n/a (use screenshot only)',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    buildLanguageDirective(langCode, autoMode),
    'You are Hunter — Wolf AI visual setup analyst.',
    liveBanner,
    PLATFORM_KNOWLEDGE,
    `Session: ${ctx.session}`,
    'No live snapshot — only journal context (if any) and chart screenshots in the request.',
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
  /** Compact PLATFORM TRADING JOURNAL snapshot — single source of truth */
  journalContext?: string;
  mentorMode?: 'beginner' | 'professional' | 'strict' | 'socratic';
  roomMode?: boolean;
  /** User is answering a decision-training drill */
  trainingGrade?: boolean;
  /** True when request comes from Mentor AI training desk (not Hunter analysis) */
  mentorDesk?: boolean;
  /** Module 2 Chart Mentor educational read */
  mentorChart?: boolean;
  /** Module 3 Performance Coach (journal / habits) */
  mentorCoach?: boolean;
  /** Module 4 Trading Lab simulator reviews */
  mentorLab?: boolean;
  /** Module 5 Live Mentor (real-market process coach) */
  mentorLive?: boolean;
  /** Module 6 Trading Master / Institutional Mentor */
  mentorMaster?: boolean;
  /** Module 1 curriculum lesson step (AI Teacher) */
  mentorLesson?: {
    levelId: number;
    stepId: string;
    title: string;
  };
  /** Client-resolved draw tool — server must not infer S/R from chart-hint text */
  markTool?: 'trend' | 'sr' | 'ob' | 'liq' | 'auto';
  /** Visual setup strategy mode for screenshot analysis */
  analysisMode?: WolfAnalysisMode;
}

export async function fetchMasterAiStatus(): Promise<{
  configured: boolean;
  message: string;
  keySource: MasterAiKeySource;
}> {
  try {
    const keyHeaders = openRouterRequestHeaders();
    // Cold Render often needs >18s; a short timeout falsely reports "no key".
    const res = await apiFetch(
      '/api/chat/status',
      { headers: { ...keyHeaders } },
      { retries: 1, timeoutMs: 45_000 },
    );
    if (!res.ok) {
      // Transport blip ≠ missing key — never tell the user to re-add a Profile key.
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
          ? 'Wolf AI ready (server key)'
          : 'Live intelligence ready'
        : 'Add an AI API key (aistudio.google.com) in Profile',
    };
  } catch {
    return {
      configured: false,
      message: masterAiOfflineMessage(),
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

function isRetriableMasterAiError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  // 503 = missing API key — retrying never helps. 429 needs a longer wait (handled below).
  if (status === 502 || status === 504) return true;
  if (status === 429) return true;
  if (status === 503) return false;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err || '');
  return /abort|timeout|empty reply|Failed to fetch|NetworkError|network|Load failed|ECONNRESET|overloaded|temporarily|All models failed|models unavailable/i.test(
    msg,
  );
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
        'User sent a greeting. Reply in 1–2 respectful desk lines as Hunter. No market dump.',
      ].join('\n')
    : formatContextBlock(ctx, req.lang, true, autoMode);
  const platformContext = [baseContext, memoryNote, req.journalContext?.trim()]
    .filter(Boolean)
    .join('\n\n');

  const payload = {
    message: req.message,
    model: req.model,
    lang: req.lang,
    langName: req.langName,
    langMode: autoMode ? 'auto' : req.langMode,
    imageDataUrl: req.imageDataUrl ?? null,
    history,
    needsWeb: req.needsWeb ?? false,
    platformContext,
    mentorMode: req.mentorMode ?? 'professional',
    roomMode: Boolean(req.roomMode),
    trainingGrade: Boolean(req.trainingGrade),
    mentorDesk: Boolean(req.mentorDesk),
    mentorChart: Boolean(req.mentorChart),
    mentorCoach: Boolean(req.mentorCoach),
    mentorLab: Boolean(req.mentorLab),
    mentorLive: Boolean(req.mentorLive),
    mentorMaster: Boolean(req.mentorMaster),
    mentorLesson: req.mentorLesson || undefined,
    markTool: req.markTool,
    analysisMode: req.analysisMode || 'auto',
  };

  // Chart-open / mark / image paths run live tape + LLM — give them a full window.
  // Nested apiFetch retries multiply orphan server jobs; keep retries:0 here and
  // one outer retry only for abort/502/empty.
  const heavy = Boolean(
    req.imageDataUrl ||
      req.markTool ||
      req.mentorChart ||
      /CHART OPEN BESIDE THIS CHAT/i.test(String(req.message || '')),
  );
  const timeoutMs = heavy ? 120_000 : 90_000;
  const maxAttempts = 2;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await apiFetch(
        '/api/chat',
        {
          method: 'POST',
          headers: { ...openRouterRequestHeaders() },
          body: JSON.stringify(payload),
        },
        { retries: 0, timeoutMs },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(
          new Error(typeof err?.error === 'string' ? err.error : 'AI unavailable'),
          { status: res.status },
        );
      }

      const data = await res.json();
      const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
      if (!reply) {
        throw Object.assign(new Error('Empty reply from Wolf AI'), { status: 502 });
      }
      return {
        reply,
        modelUsed: data?.modelUsed,
        source: data?.source ?? 'openrouter',
      };
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isRetriableMasterAiError(err)) throw err;
      const status = (err as { status?: number } | null)?.status;
      const waitMs = status === 429 ? 5_000 * attempt : 900 * attempt;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('AI unavailable');
}

const STORAGE_MODEL = 'master_ai_selected_model';
const STORAGE_AUTO_SPEAK = 'master_ai_auto_speak';
const STORAGE_LANGUAGE = 'master_ai_language';
const STORAGE_LANG_MODE = 'master_ai_language_mode';
/** One-time: old builds defaulted Auto+Hinglish — migrate unset users to English. */
const STORAGE_LANG_DEFAULT_EN = 'master_ai_lang_default_en_v1';

function migrateLanguageDefaultsToEnglish(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(STORAGE_LANG_DEFAULT_EN) === '1') return;
    const mode = window.localStorage.getItem(STORAGE_LANG_MODE);
    const lang = window.localStorage.getItem(STORAGE_LANGUAGE);
    const wasOldAutoHinglish =
      (!mode || mode === 'auto') && (!lang || lang === 'hi-Latn');
    if (wasOldAutoHinglish) {
      window.localStorage.setItem(STORAGE_LANGUAGE, 'en-US');
      window.localStorage.setItem(STORAGE_LANG_MODE, 'en-US');
    }
    window.localStorage.setItem(STORAGE_LANG_DEFAULT_EN, '1');
  } catch {
    /* ignore */
  }
}

export function loadSelectedLanguage(): MasterAiLangCode {
  migrateLanguageDefaultsToEnglish();
  if (typeof window === 'undefined') return 'en-US';
  const saved = window.localStorage.getItem(STORAGE_LANGUAGE) || '';
  // Site default is English until the user picks another language.
  return isValidMasterAiLang(saved) ? saved : 'en-US';
}

export function saveSelectedLanguage(code: MasterAiLangCode): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_LANGUAGE, code);
}

export function loadLanguageMode(): MasterAiLangMode {
  migrateLanguageDefaultsToEnglish();
  if (typeof window === 'undefined') return 'en-US';
  const mode = window.localStorage.getItem(STORAGE_LANG_MODE);
  // Empty / legacy missing → English locked (Auto is available if user selects it).
  if (!mode) return 'en-US';
  if (mode === 'auto') return 'auto';
  if (isValidMasterAiLang(mode)) return mode;
  return 'en-US';
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
