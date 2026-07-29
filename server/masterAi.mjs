import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildKnowledgeContext } from './auth/masterAiKnowledgeStore.mjs';

export const MASTER_AI_MODELS = [
  { id: 'gemini/auto', name: 'Auto (Flash)', provider: 'Google', web: false },
  { id: 'gemini-2.5-flash', name: 'Flash', provider: 'Google' },
  { id: 'gemini-2.5-flash-lite', name: 'Flash Lite', provider: 'Google' },
  { id: 'gemini-2.0-flash', name: 'Flash 2.0', provider: 'Google' },
  { id: 'gemini-2.5-pro', name: 'Pro', provider: 'Google' },
  { id: 'gemini-1.5-flash', name: 'Flash 1.5', provider: 'Google' },
  { id: 'openrouter/auto', name: 'Auto (OpenRouter)', provider: 'OpenRouter', web: false },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'google/gemini-2.0-flash-001', name: 'Flash (via OR)', provider: 'Google' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'perplexity/sonar', name: 'Sonar (web)', provider: 'Perplexity', web: true },
];

/** Quality-first defaults — Flash is smart + still cheap; Lite only as last fallback. */
export const GEMINI_COST_MODE = {
  textDefault: 'gemini-2.5-flash',
  visionDefault: 'gemini-2.5-flash',
};
const GEMINI_TEXT_CHAIN = [
  GEMINI_COST_MODE.textDefault,
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-2.5-flash-lite',
];
const GEMINI_VISION_CHAIN = [
  GEMINI_COST_MODE.visionDefault,
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-2.5-flash-lite',
];
const HISTORY_TURNS = 24;
const HISTORY_MSG_CHARS = 2500;
const CONTEXT_CAP_CHARS = 16_000;

const SYSTEM_PROMPT = `You are Jarvis at Wolf Trade AI (Analyse AI), running TRAFI AI — Institutional Trading Analyst System v1.0.
Spoken name: Jarvis. Do not rename yourself.
You are NOT a financial advisor. You do NOT provide investment advice. You do NOT guarantee profits. You do NOT predict the future. You are NOT a signal bot.

MISSION
Improve decision quality. Help traders understand: what the market is doing, why, where risk is, what confirms, what invalidates, and alternative scenarios.
Final principle: do not tell traders what to do — help them understand the market. Transparency > confidence. Evidence > opinion. Discipline > prediction.

VIRTUAL DESK (combined opinion every reply — never one narrow lens)
Market Structure Analyst · Price Action Expert · Indicator Analyst · Volume Analyst · Risk Manager · Trading Psychologist · Journal Coach · Portfolio Analyst · Report Writer

CORE PHILOSOPHY
Markets cannot be predicted with certainty. Multiple outcomes always exist. Include uncertainty. Explain WHY price moves. Evidence beats opinion. Never bullish/bearish by default — follow evidence; change when evidence changes.
Never memorize patterns. Price is the result; order flow / aggression is the cause. Always ask: who is buying, who is selling, where is liquidity.

KNOWLEDGE BASE — MODULE 1 FINANCIAL MARKETS v1.0
Mission: first principles before any chart. Identify buyers, sellers, liquidity. Never invent.

Markets (independent mechanics): stocks (ownership — e.g. AAPL, RELIANCE, TCS); indices (NIFTY50, BANKNIFTY, SENSEX, NASDAQ, S&P500); FX pairs (EURUSD, USDINR…); commodities (gold, silver, crude, NG…); crypto (BTC, ETH…); futures (expiry, leverage); options (calls/puts, premium, OI, Greeks, time decay).

Participants & motives: institutions (large capital, create trends); banks (liquidity, FX, client flow); central banks (rates, money supply); hedge funds (aggressive, leveraged); mutual funds (mandate-driven accumulation); retail (small, often reactive/emotional); HFT (ms inefficiencies, liquidity); market makers (bid/ask, spread). Not all participants trade purely for profit.

Auction theory: continuous auction. Aggressive buyers → price up; aggressive sellers → price down. Every candle = one completed auction. OHLC: Open=start, High=highest accepted, Low=lowest accepted, Close=final agreement. Long body=conviction; small body=indecision; long upper wick=seller rejection; long lower wick=buyer rejection.

Price ≠ intrinsic value. Price = current agreement; seeks liquidity; revisits unfinished business; trends while participants keep accepting higher/lower prices.

Volume = participation. High/low = strong/weak. Confirms price; move without volume → caution. Spikes often: institutions, news, breakouts, capitulation, climax.

Liquidity = where orders sit. Price seeks it at prior/equal H/L, round numbers, session H/L, swings, stop clusters. Liquidity ≠ automatic reversal — may fuel continuation.

Volatility: high = large/fast candles, more risk+opportunity; low = compression, potential expansion.
Spread: bid–ask gap; wide=poor liquidity, tight=good. Bid=highest buyer; Ask=lowest seller; trade when they meet.
Orders: market (now), limit (price), stop (trigger), stop-limit (hybrid).

Trend needs structure (not one candle): HH+HL up; LH+LL down; sideways=no dominance.
Phases: accumulation → markup → distribution → markdown — always identify current phase.
Supply: selling dominance — bearish impulse, rejection, volume; fresh zones > repeatedly tested.
Demand: buying dominance — bullish impulse, participation, continuation; fresh usually stronger.
Support/resistance = zones (never a single tick); repeated tests weaken them.
Breakout needs strong close + volume + momentum + acceptance beyond range — never wick-only validation.
False breakout: low volume, long rejection wick, immediate reverse, failure to hold.
Retest: healthy breakouts often revisit — confirm with volume, candles, momentum, structure.
Gaps: common/breakaway/runaway/exhaustion — context decides; not every gap fills.
Sessions: Asia (often quieter) · Europe (higher participation) · US (highest liquidity); overlaps often strongest.
TF: Weekly→Daily→4H→1H→15M→5M→1M — HTF=bias, LTF=execution.
Confluence: trend+structure+volume+momentum+S/R+candle+RR+volatility+liquidity — never one factor alone.
Uncertainty: probabilistic; always note alternatives; never guarantee.

Module-1 AI rules: think first; never assume/hallucinate; never invent price/volume/S/R/indicators; if missing → ask; stay objective.

ABSOLUTE LANGUAGE RULES
Forbidden: “will definitely work”, “surely go up”, “cannot fail”, profit guarantees, hype, fear, slang, clickbait, excitement.
Prefer: “Current evidence favors…”, “Probability suggests…”, “Structure indicates…”, “HTF remains…”, “Momentum is improving…”.
Bias words only: bullish / bearish / sideways / NO TRADE — never buy/sell orders.

NO HALLUCINATION / TRANSPARENCY
Never invent: trend, prices, indicator values, S/R, news, volume, economic events, patterns.
Missing info → say so. Poor chart → say so. Hidden indicators → state N/A. Unknown TF → ask. Never assume; never fabricate.
Identical charts should yield nearly identical analysis.

REASONING (for key conclusions — keep tight)
Observation → Evidence → Logic → Risk → Confidence.
Never jump to a conclusion without this chain (compressed into short lines is fine).

CHART ANALYSIS ORDER — MODULE 1 (never reverse; price overrides indicators)
1) Market structure  2) Trend  3) Support/Resistance  4) Supply/Demand  5) Liquidity
6) Volume  7) Price action  8) Indicators  9) Pattern  10) Risk
Indicators never override price.

MULTI-TIMEFRAME
Weekly → Daily → 4H → 1H → 15M → 5M → 1M. HTF priority. LTF cannot override HTF without strong evidence.

STRUCTURE / PA / VOLUME / INDICATORS (apply Module 1 v1.0; only when visible)
Structure: trend, HH/HL/LH/LL, swings, range, consolidation/expansion, BOS, CHoCH, liquidity sweeps, premium/discount, supply/demand zones, S/R zones, channels, volatility, momentum; SMC OB/FVG when asked or clear.
PA: breakouts/fakeouts, retests, pullbacks, continuation/reversal, compression/expansion, accumulation/distribution, measured move, momentum shift, gaps; clear patterns with brief reliability + invalidation.
Volume: spike, dry-up, accum/distrib, confirmation, divergence — price without volume → caution.
Indicators only if visible: EMA/SMA, VWAP, RSI, MACD, ATR, ADX, Bollinger, Supertrend, Ichimoku, VP, OBV, CMF, pivots — always with structure + confluence.

PROBABILITY (evidence-weighted assessments, not exact forecasts)
On setups/full reports: Bullish% · Bearish% · Neutral% · Confidence 0–100 + why.

CONFLICT RESOLUTION
If signals disagree, explain the conflict (e.g. bullish structure but weakening momentum + low volume near resistance → pullback probability up).

RISK FIRST
Discuss risk before reward. Always cover invalidation, stop logic, RR, volatility, weaknesses (low volume, weak momentum, major resistance, event risk if user stated). Never hide setup weaknesses.
Encourage discipline, patience, risk management. Discourage revenge trading, overtrading, gambling, emotional decisions.
Respect user-defined risk limits. Adapt depth to trader type if known: scalper / intraday / swing / positional / investor.

EXPLAIN LIKE A MENTOR
Teach briefly when useful (e.g. explain what an EMA cross implies for momentum — don’t dump jargon alone).

VOICE & LANGUAGE
Professional, clear, educational, objective, structured desk tone. Never say you are an AI/bot.
AUTO LANGUAGE (70+): match user’s latest message language/script. Fixed lock overrides Auto. Hindi/Hinglish: masculine forms.
Beginners simple; experts deeper. Admit uncertainty when data is insufficient.

MEMORY
Full history. Follow-ups continue last setup — never re-ask for chart mid-thread. Reuse symbol/TF/bias/levels. Accept corrections. One clarifying question if needed.

CHART / VISION
Extract visible candles, structure, S/R, indicators, labels, TF, patterns.
- FIRST answer the user’s exact question (OB, FVG, BOS, pattern, etc.). Point to approx price from Y-axis. Blurry → unclear.
- Do NOT dump a full report for a pointed question.
- Full report only for full analysis or chart with no specific question.
No chart + no prior analysis → ask only for a TradingView chart screenshot.

FULL REPORT (compact; skip unsupported as N/A; risk before reward)
Summary · Trend · Structure · Momentum · Volume · Support · Resistance · Liquidity · Indicators · Pattern · Risk (first) · Weaknesses · Bullish/Bearish/Neutral scenarios · Trade idea (Entry · Stop · T1 · T2 · RR · Invalidation) · Probabilities · Confidence · Final note

JOURNAL (if shared): win/loss, avg RR, mistakes, discipline, best/worst setups, psychology, improvements — evidence only.

LENGTH (strict)
- Greetings: 1–2 lines.
- Normal Q&A: under ~80 words.
- Specific chart concept Q: under ~120 words.
- Full report: under ~200 words, one line per field, no essays.
- Follow-up / language switch: do not expand.`;

const CHART_VISION_PROMPT = `CHART MODE — Jarvis / TRAFI AI System v1.0 + Knowledge Module 1.
Read ONLY this screenshot. First principles: WHY price moved (auction / supply–demand / liquidity), not pattern-name dumping.
Order: Structure → Price Action → Volume → Indicators (never reverse). Prefer zones over exact lines. Confluence > single factor.
PRIORITY: answer user’s question first. Point to approx price. Concept Q = 4–8 short lines. No hallucination. Poor quality → say so.
Full analysis → Risk first, then: Trend · Structure · S/R zones · Liquidity · Volume · Indicators · Pattern · Weaknesses · Entry/Stop/Targets · Invalidation · Bullish%/Bearish%/Neutral% · Confidence 0–100 · Summary
Prefer “evidence favors…” language. Never buy/sell. Under ~200 words full / ~120 Q&A.`;

const WEB_HINT = `News-style questions: do not invent headlines or numbers. Prefer asking for a chart if a market read is needed.`;

const NO_CHART_HINT = `No chart attached and no prior analysis in history. Do not invent levels. Reply in 2 short lines asking only for a TradingView/chart screenshot.`;

const CONTINUE_THREAD_HINT = `CONTINUE THREAD: Chat history already has analysis. Do NOT ask for a chart again. Answer the user’s follow-up using the previous analysis (translate/restate/extend as asked). Keep the same levels and bias unless they provide a new chart.`;

/** OpenAI sk-… · OpenRouter sk-or-… · Gemini AIza… (legacy) or AQ.… (auth keys) */
export function detectAiProvider(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return null;
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-')) return 'openai';
  // New Google AI Studio auth keys (2026+) + legacy standard keys
  if (key.startsWith('AQ.') || key.startsWith('AIza') || /^AI[a-zA-Z0-9_-]{20,}$/.test(key)) {
    return 'gemini';
  }
  return null;
}

function buildMessages({ platformContext, history, userContent, hasImage }) {
  const ctx = String(platformContext || '').slice(0, CONTEXT_CAP_CHARS);
  // With a chart: image-only analysis — do not inject live market snapshot.
  const system = hasImage
    ? `${SYSTEM_PROMPT}\n\n${CHART_VISION_PROMPT}`
    : `${SYSTEM_PROMPT}\n\n${ctx}`;
  const msgs = [{ role: 'system', content: system }];
  const trimmed = (history ?? []).slice(-HISTORY_TURNS);
  for (const h of trimmed) {
    if (h.role === 'user' || h.role === 'assistant') {
      msgs.push({ role: h.role, content: String(h.content).slice(0, HISTORY_MSG_CHARS) });
    }
  }
  msgs.push({ role: 'user', content: userContent });
  return msgs;
}

function pickTextModels(requested, needsWeb, langCode, provider) {
  if (provider === 'gemini') {
    const chain = [];
    const mapped = mapRequestedToGemini(requested);
    if (mapped) chain.push(mapped);
    // Auto = cheap Flash family first (not Pro) — saves credits, still multimodal fallback
    chain.push(...GEMINI_TEXT_CHAIN);
    return [...new Set(chain)];
  }
  if (provider === 'openai') {
    return ['gpt-4o-mini', 'gpt-4o'];
  }
  const chain = [];
  const hindi = String(langCode || '').startsWith('hi');
  if (needsWeb) chain.push('perplexity/sonar');
  if (requested && requested !== 'openrouter/auto' && requested !== 'gemini/auto') {
    chain.push(requested);
  }
  chain.push(
    'openai/gpt-4o-mini',
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o',
    'deepseek/deepseek-chat',
  );
  if (hindi) {
    chain.push('qwen/qwen-2.5-72b-instruct', 'google/gemini-2.0-flash-001');
  }
  chain.push('google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.2-3b-instruct:free');
  return [...new Set(chain)];
}

function pickVisionModels(requested, provider) {
  if (provider === 'gemini') {
    const chain = [];
    const mapped = mapRequestedToGemini(requested);
    // Explicit Pro only when user picks it — otherwise cheap Flash family
    if (mapped) chain.push(mapped);
    chain.push(...GEMINI_VISION_CHAIN);
    return [...new Set(chain)];
  }
  if (provider === 'openai') {
    return ['gpt-4o-mini', 'gpt-4o'];
  }
  const chain = [
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o-mini',
    'openai/gpt-4o',
    'anthropic/claude-3.5-haiku',
  ];
  return [...new Set(chain)];
}

function mapRequestedToGemini(requested) {
  const r = String(requested || '').trim();
  if (!r || r === 'gemini/auto' || r === 'openrouter/auto') return null;
  if (r === 'gemini-2.5-flash-lite' || r.endsWith('flash-lite')) return 'gemini-2.5-flash-lite';
  if (r === 'gemini-2.5-pro' || r.endsWith('2.5-pro')) return 'gemini-2.5-pro';
  if (r === 'gemini-2.5-flash' || r.includes('gemini-2.5-flash')) return 'gemini-2.5-flash';
  if (r.includes('gemini-2.0')) return 'gemini-2.0-flash';
  if (r.includes('gemini-1.5-pro')) return 'gemini-1.5-pro';
  if (r.includes('gemini-1.5-flash')) return 'gemini-1.5-flash';
  if (r.startsWith('gemini-')) return r;
  return null;
}

function isShortChat(message) {
  const n = String(message || '')
    .toLowerCase()
    .trim()
    .replace(/[!?.,…]+$/g, '');
  return (
    n.length <= 48 &&
    /^(hi+|hello+|hey+|yo|sup|namaste|namaskar|good\s*(morning|afternoon|evening|night)|gm|gn|kaise\s*ho|thanks|thank\s*you|ok|okay|cool)$/i.test(
      n,
    )
  );
}

/** Prefer quality config; thinkingBudget 0 stops 2.5 hidden reasoning tokens when supported. */
function geminiGenerationConfigs(hasImage, shortChat) {
  const base = {
    temperature: hasImage ? 0.15 : shortChat ? 0.4 : 0.22,
    topP: hasImage ? 0.8 : 0.9,
    maxOutputTokens: hasImage ? 750 : shortChat ? 120 : 320,
  };
  return [
    { ...base, thinkingConfig: { thinkingBudget: 0 } },
    base,
  ];
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function createClient(apiKey) {
  const provider = detectAiProvider(apiKey);
  if (!provider) return { client: null, provider: null, gemini: null };
  if (provider === 'gemini') {
    return {
      client: null,
      gemini: new GoogleGenerativeAI(apiKey),
      provider: 'gemini',
    };
  }
  if (provider === 'openai') {
    return { client: new OpenAI({ apiKey }), gemini: null, provider: 'openai' };
  }
  return {
    client: new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://wolftradeai.in',
        'X-Title': 'Wolf Trade AI Analyse AI',
      },
    }),
    gemini: null,
    provider: 'openrouter',
  };
}

async function tryGeminiOnce(gemini, { modelId, system, geminiHistory, userParts, generationConfig }) {
  const model = gemini.getGenerativeModel({
    model: modelId,
    systemInstruction: system,
    generationConfig,
  });
  const chat = model.startChat({ history: geminiHistory });
  const result = await chat.sendMessage(userParts);
  return String(result?.response?.text?.() ?? '').trim();
}

async function chatWithGemini(gemini, {
  platformContext,
  history,
  userText,
  imageDataUrl,
  hasImage,
  models,
  shortChat = false,
}) {
  const ctx = String(platformContext || '').slice(0, CONTEXT_CAP_CHARS);
  const system = hasImage
    ? `${SYSTEM_PROMPT}\n\n${CHART_VISION_PROMPT}`
    : `${SYSTEM_PROMPT}\n\n${ctx}`;

  const geminiHistory = [];
  for (const h of (history ?? []).slice(-HISTORY_TURNS)) {
    if (h.role !== 'user' && h.role !== 'assistant') continue;
    geminiHistory.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(h.content).slice(0, HISTORY_MSG_CHARS) }],
    });
  }

  const userParts = [{ text: userText }];
  if (hasImage) {
    const parsed = parseDataUrl(imageDataUrl);
    if (!parsed) {
      throw Object.assign(new Error('Invalid image data'), { status: 400 });
    }
    userParts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
  }

  const configs = geminiGenerationConfigs(hasImage, shortChat);
  let lastError = null;

  for (const modelId of models) {
    let modelFailedHard = false;
    for (let i = 0; i < configs.length; i += 1) {
      const generationConfig = configs[i];
      try {
        const reply = await tryGeminiOnce(gemini, {
          modelId,
          system,
          geminiHistory,
          userParts,
          generationConfig,
        });
        if (reply) {
          console.info(`[Analyse AI] ok model=${modelId} image=${hasImage ? 1 : 0}`);
          return { reply, modelUsed: modelId, source: 'gemini' };
        }
      } catch (err) {
        lastError = err;
        const msg = String(err?.message ?? err);
        const isLastConfig = i === configs.length - 1;
        if (isLastConfig) {
          console.warn(`[Analyse AI] Gemini ${modelId} failed:`, msg);
          modelFailedHard = true;
        } else if (/thinkingConfig|thinking_budget|Unknown name/i.test(msg)) {
          console.warn(`[Analyse AI] Gemini ${modelId} retry without thinkingConfig`);
        } else {
          // Model/auth/quota errors — skip remaining configs for this model
          console.warn(`[Analyse AI] Gemini ${modelId} failed:`, msg);
          modelFailedHard = true;
          break;
        }
      }
    }
    if (modelFailedHard) continue;
  }
  throw Object.assign(new Error(lastError?.message ?? 'AI models unavailable'), { status: 502 });
}

export function createMasterAiRouter(apiKey) {
  const { client, provider, gemini } = createClient(apiKey);

  return {
    isConfigured: Boolean(client || gemini),
    provider,

    async chat(body) {
      const message = typeof body?.message === 'string' ? body.message.trim() : '';
      const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
      const platformContextRaw = typeof body?.platformContext === 'string' ? body.platformContext : '';
      const hasImage = Boolean(imageDataUrl);
      const shortChat = !hasImage && isShortChat(message);
      const ownerKnowledge = shortChat
        ? ''
        : buildKnowledgeContext(
            hasImage ? `${message} chart support resistance trend entry stop target` : message,
          );
      const platformContext = ownerKnowledge
        ? `${platformContextRaw}\n\n${ownerKnowledge}`.trim()
        : platformContextRaw;
      const model = typeof body?.model === 'string' ? body.model : 'gemini/auto';
      const lang = typeof body?.lang === 'string' ? body.lang : 'hi-Latn';
      const langName = typeof body?.langName === 'string' ? body.langName.trim() : '';
      const langMode = typeof body?.langMode === 'string' ? body.langMode : 'auto';
      const autoLang = langMode === 'auto';
      const needsWeb = Boolean(body?.needsWeb);
      const history = Array.isArray(body?.history) ? body.history : [];

      if (!message && !imageDataUrl) {
        throw Object.assign(new Error('message or image required'), { status: 400 });
      }
      if (!client && !gemini) {
        throw Object.assign(
          new Error(
            'Add an AI API key (aistudio.google.com), OpenAI key, or OpenRouter key in Profile / server env.',
          ),
          { status: 503 },
        );
      }

      if (hasImage && imageDataUrl.length > 6_500_000) {
        throw Object.assign(new Error('Image too large after encoding. Use a smaller screenshot.'), {
          status: 413,
        });
      }

      const hinglish = lang === 'hi-Latn' || /hinglish/i.test(langName);
      const hindi = !hinglish && (lang === 'hi-IN' || lang.startsWith('hi'));
      const userTextBase =
        message ||
        (hinglish || hindi
          ? 'Is chart ka professional desk analysis do — Bias, Reason, Support, Resistance, Plan, Invalidation, Confidence, Conclusion.'
          : 'Give a professional desk chart analysis — Bias, Reason, Support, Resistance, Plan, Invalidation, Confidence, Conclusion.');

      const historyText = (history ?? [])
        .map((h) => String(h?.content || ''))
        .join('\n');
      const historyHasAnalysis =
        /\b(Market Bias|Support|Resistance|Confidence|bullish|bearish|Invalidation|Target)\b/i.test(
          historyText,
        ) || /सपोर्ट|रेज़िस्टेंस|बायस|बुलिश|बियरिश/i.test(historyText);

      const wantsLanguageSwitch =
        !hasImage &&
        /\b(english|hindi|hinglish|हिंदी|translate|me\s+batao|mein\s+batao|in\s+english|in\s+hindi)\b/i.test(
          String(message || ''),
        );

      const wantsTradeCall =
        !hasImage &&
        /\b(buy\s*kar|sell\s*kar|kharid|bech|entry|sl\b|stoploss|stop\s*loss|target|trade\s*le|position\s*le|long\s*kar|short\s*kar)\b/i.test(
          String(message || ''),
        );

      const wantsChartRead =
        !hasImage &&
        !wantsTradeCall &&
        !historyHasAnalysis &&
        /\b(chart|screenshot|levels?|support|resistance|setup|analyse|analyze|analysis|padh|structure)\b/i.test(
          String(message || ''),
        ) &&
        !/\b(kya\s+hai|what\s+is|explain|samjha|kaise\s+kaam|how\s+does|meaning|definition)\b/i.test(
          String(message || ''),
        );

      const wantsDayReview =
        !hasImage &&
        !historyHasAnalysis &&
        !wantsLanguageSwitch &&
        /\b(aaj|today|abhi|kaise\s+(tha|hai|raha)|kaisa\s+(tha|hai)|how\s+(was|is)|market\s+view|nifty\s+(kaise|kaisa|view|recap)|din\s+(kaisa|kaise)|session\s+(kaisa|kaise))\b/i.test(
          String(message || ''),
        );

      const contextHasLiveTape =
        /\bNIFTY\s+\d/i.test(String(platformContextRaw || '')) &&
        !/\bNIFTY\s+n\/a\b/i.test(String(platformContextRaw || ''));

      const langLine = autoLang
        ? 'AUTO LANGUAGE (70+): detect the user message language yourself and reply in that same language/script. Soft hint only if ambiguous: ' +
          (langName || lang) +
          '.'
        : hinglish
          ? 'Reply in Hinglish (Roman Hindi + English).'
          : hindi
            ? 'Reply in Hindi Devanagari.'
            : lang.startsWith('en')
              ? 'Reply in clear Indian English.'
              : `Reply in ${langName || lang}.`;

      const taskLine = hasImage
        ? 'Task: TRAFI Module 1 v1.0. Answer USER QUESTION FIRST. Order: Structure→Trend→S/R→S/D→Liquidity→Volume→PA→Indicators→Pattern→Risk. Price overrides indicators. Risk before reward. Under ~200 words full / ~120 Q&A. No buy/sell.'
        : shortChat
          ? 'Task: brief respectful greeting as Jarvis — 1–2 lines.'
          : historyHasAnalysis || wantsLanguageSwitch
            ? 'Task: CONTINUE prior analysis SHORTLY in requested language. Same levels. Under ~100 words. Do NOT ask for a chart again.'
            : wantsTradeCall
              ? 'Task: no yes/no trade order. Ask for chart in 2 short lines.'
              : wantsDayReview && !contextHasLiveTape
                ? 'Task: Ask only for a chart screenshot in 2 short lines.'
                : wantsChartRead
                  ? 'Task: answer in 3–5 short lines; if visual read needed, ask for chart.'
                  : 'Task: answer in 3–6 short lines. Under ~80 words. No essays.';

      let textBlock = `[You are Jarvis. ${langLine} Keep replies SHORT. Never invent numbers. bullish/bearish only.]\n[${taskLine}]\n\n${userTextBase}`;
      if (hasImage) {
        textBlock +=
          hinglish || hindi
            ? '\n\nImage carefully padho. Sirf jo clearly dikhe wahi levels. Unclear ho to unclear bolo — guess mat karo.'
            : '\n\nRead the image carefully. Use only clearly visible levels. If unclear, say unclear — do not guess.';
      } else if (historyHasAnalysis || wantsLanguageSwitch) {
        textBlock += `\n\n${CONTINUE_THREAD_HINT}`;
      } else if (!contextHasLiveTape && (wantsDayReview || wantsChartRead)) {
        textBlock += `\n\n${NO_CHART_HINT}`;
      }
      if (needsWeb && !hasImage) textBlock += `\n\n${WEB_HINT}`;

      const models = hasImage
        ? pickVisionModels(model, provider)
        : pickTextModels(model, needsWeb, lang, provider);

      if (provider === 'gemini' && gemini) {
        return chatWithGemini(gemini, {
          platformContext,
          history,
          userText: textBlock,
          imageDataUrl,
          hasImage,
          models,
          shortChat,
        });
      }

      const contentParts = [{ type: 'text', text: textBlock }];
      if (hasImage) {
        contentParts.push({ type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } });
      }

      const userContent = hasImage ? contentParts : textBlock;
      const messages = buildMessages({ platformContext, history, userContent, hasImage });

      let lastError = null;
      for (const modelId of models) {
        try {
          const completion = await client.chat.completions.create({
            model: modelId,
            max_tokens: hasImage ? 750 : shortChat ? 120 : 320,
            temperature: hasImage ? 0.15 : shortChat ? 0.4 : 0.22,
            top_p: 0.9,
            messages,
          });
          const reply = completion.choices[0]?.message?.content?.trim();
          if (reply) {
            return { reply, modelUsed: modelId, source: provider };
          }
        } catch (err) {
          lastError = err;
          console.warn(`[Analyse AI] Model ${modelId} failed:`, err?.message ?? err);
        }
      }

      throw Object.assign(new Error(lastError?.message ?? 'All models failed'), { status: 502 });
    },
  };
}
