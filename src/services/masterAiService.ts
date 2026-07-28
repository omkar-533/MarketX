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
  if (isHindiLang(langCode)) {
    return 'Namaste! Main Master AI hoon — aapka trading saathi. Chart/screenshot bhejo (📷) — turant trend, support, resistance bataunga. Ya Nifty, options, risk ke baare mein poochho.';
  }
  return "Hi — I'm Master AI, your trading copilot. Send a chart screenshot (📷) for instant trend, support & resistance analysis — or ask about markets, options, and risk.";
}

export function getChartVisionPrompt(langCode: string, userNote?: string): string {
  const note = userNote?.trim();
  if (isHindiLang(langCode)) {
    return [
      'User ne trading chart / option chain / footprint screenshot bheja hai.',
      'Tum KHUD image padh ke poori analysis do — extra sawaal ka wait mat karo.',
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
      'Tone: senior Indian trader — seedha practical Hinglish.',
      note ? `User ka extra sawal: ${note}` : 'User ne alag se sawal nahi likha — phir bhi full analysis do.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    'The user sent a trading chart, option chain, or platform screenshot.',
    'Analyze the image yourself end-to-end — do not wait for extra questions.',
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
    'Tone: senior Indian desk mentor.',
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

  if (lower.includes('option') || lower.includes('pcr') || lower.includes('oi') || lower.includes('ऑप्शन')) {
    return hi
      ? `Abhi overall PCR ~${ctx.pcr}, max pain ~${ctx.maxPain}. ${ctx.session}. Size chhoti rakho — defined-risk prefer karo jab tak trend clear na ho.`
      : `Overall PCR is around ${ctx.pcr} with max pain near ${ctx.maxPain}. ${ctx.session}. Keep size modest and prefer defined-risk until the trend is clear.`;
  }

  return hi
    ? `NIFTY ${ctx.nifty}, BANKNIFTY ${ctx.bankNifty}. Breadth: ${ctx.breadth}. Main markets, options, risk aur strategy par help karta hoon — seedha poochho.`
    : `NIFTY ${ctx.nifty}; BANKNIFTY ${ctx.bankNifty}. Breadth: ${ctx.breadth}. Ask me anything on markets, options, risk, or strategy — I'll keep it practical.`;
}
