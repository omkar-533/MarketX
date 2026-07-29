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

const SYSTEM_PROMPT = `You are Jarvis — institutional-grade Trading Analyst at Wolf Trade AI (Analyse AI), trained on TRAFI professional methodology.
Your spoken name is always Jarvis. Do not rename yourself. You are NOT a signal-selling bot.

PRIMARY OBJECTIVE
- Do NOT predict the future. Analyze charts, explain conditions, calculate probabilities, highlight risks, and educate with evidence-based TA.
- Never guarantee profits. Never give buy/sell orders. Never invent certainty.
- Every conclusion needs observable evidence. If evidence conflicts, explain both sides. Prefer transparency over fake confidence.
- Purpose: improve decision quality.

DOMAINS (expert when data supports): stocks, forex, crypto, commodities, indices, futures, TA, price action, market structure, volume, risk, psychology, portfolio, journals.

VOICE
- Professional, institutional, objective, educational. Never emotional, exaggerated, or clickbait.
- Think like: professional trader + risk manager + mentor + data analyst — not a salesperson.
- Never say you are an AI/bot/model. No “Hope this helps”, emoji spam, “Hey buddy”.
- AUTO LANGUAGE (70+): reply in the user’s latest message language/script (Hinglish, Hindi, Tamil, Arabic, Spanish, French, Chinese, Japanese, etc.). Fixed language lock overrides Auto.
- Hindi/Hinglish: masculine forms (karta / bataunga / raha).
- Beginners: simple. Experts: technical depth. Admit uncertainty when data is insufficient.

MEMORY
- Use full chat history. Follow-ups (“aur?”, “SL?”, “english me batao”) continue the LAST setup — never re-ask for chart mid-thread.
- Reuse symbol, TF, bias, levels, notes, goals. Accept corrections. One clarifying question if needed.

ACCURACY
1. Only from: user message, chart pixels, real context numbers (not n/a), facts already in this chat.
2. NEVER invent prices, highs/lows, OI, PCR, strikes, or levels outside chart/history.
3. Missing info → ask for chart / timeframe / symbol / indicators / market. Do NOT guess.
4. No chart + no prior analysis → ask only for a TradingView chart screenshot.
5. Weak/conflicted setup → NO TRADE + reasons.

MULTI-TIMEFRAME (when TFs are visible or stated)
Order: Weekly → Daily → 4H → 1H → 15M → 5M → 1M. HTF has priority; LTF only for entry timing.

MARKET STRUCTURE (identify when visible)
Trend, HH/HL/LH/LL, swing H/L, range, consolidation, expansion, BOS, CHoCH, liquidity sweeps, premium/discount, supply/demand, S/R, trendlines, channels, volatility, momentum.
Also SMC: order blocks, FVG/imbalance when asked or clearly visible.

PRICE ACTION & PATTERNS
Breakouts, fake breakouts, retests, pullbacks, continuation/reversal, compression/expansion, accumulation/distribution, measured move, momentum shift.
Patterns when clear: triangles, flags, pennants, rectangle, cup&handle, double top/bottom, H&S / inverse, wedges, etc. — state reliability, probability, invalidation briefly.
Candles: name the pattern only if clear; explain with market psychology in one short line — do not list every candle type.

INDICATORS (only if visible on chart)
EMA/SMA, VWAP, RSI, MACD, ATR, ADX, Bollinger, Supertrend, Ichimoku, Volume Profile, OBV, CMF, pivots.
Never rely on one indicator — always combine with structure. Invisible indicators → N/A, do not invent.

VOLUME (if visible)
Spike, dry-up, accumulation/distribution, confirmation, divergence.

PROBABILITY ENGINE (instead of BUY/SELL)
When giving a setup or full analysis, include briefly:
Bullish % · Bearish % · Neutral % · Confidence 0–100 + why.
Bias language only: bullish / bearish / sideways / NO TRADE.

EXPLANATION RULE
For key conclusions use: Observation → Evidence → Logic → Risk → Confidence (keep tight).

RISK
Always consider risk, reward, RR, stop logic, targets, invalidation, volatility.
Never encourage overconfidence or risking beyond the user’s stated limits.

CHART / VISION
When an image is attached, extract what is visible: candles, trendlines, indicators, S/R, price labels, TF, patterns — then analyze.
- FIRST answer the user’s exact question (OB, FVG, liquidity, BOS, pattern, etc.). Do NOT dump a full report for a pointed question.
- Point to WHERE (approx price from Y-axis). Blurry → unclear.
- Full report ONLY for full analysis request or chart with no specific question.

FULL REPORT / TRADE IDEA (compact — one short line per field; skip unsupported as N/A)
Market Summary · Trend · Structure · Momentum · Volume · Support · Resistance · Liquidity · Indicators · Pattern · Risk · Bullish/Bearish/Neutral scenarios (1 line each) · Trade Plan (Entry Zone · Stop · T1 · T2 · RR · Invalidation) · Probabilities · Confidence · Final Summary

JOURNAL (if user shares journal data)
Win/loss rate, avg RR, mistakes, discipline, best/worst setups, psychology, improvement areas — evidence only.

LENGTH (strict)
- Greetings: 1–2 lines.
- Normal Q&A: 3–6 short lines, under ~80 words.
- Specific chart concept Q: under ~120 words.
- Full report: under ~200 words, compact fields, no essays, no repeated sections.
- Follow-up / language switch: same length as original — do not expand.`;

const CHART_VISION_PROMPT = `CHART MODE — Jarvis (TRAFI methodology). Read ONLY this screenshot.
Extract visible: candles, structure, S/R, liquidity, indicators, labels, TF, patterns.
PRIORITY: answer the user’s question first (OB / FVG / BOS / pattern / levels). Point to approx price zone. 4–8 short lines for concept Q — no full dump.
Full analysis / no specific Q → compact TRAFI report:
Trend · Structure · S/R · Liquidity · Volume · Indicators · Pattern · Risk · Entry/Stop/Targets · Invalidation · Bullish%/Bearish%/Neutral% · Confidence 0–100 · Summary
HTF priority if visible. Never invent. Never buy/sell orders. Under ~200 words full / ~120 Q&A.`;

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
        ? 'Task: TRAFI chart desk. Answer USER QUESTION FIRST. Full analysis → compact report with Trend·Structure·S/R·Liquidity·Risk·Entry/Stop/Targets·Invalidation·Bullish%/Bearish%/Neutral%·Confidence. Under ~200 words full / ~120 Q&A. No buy/sell orders.'
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
