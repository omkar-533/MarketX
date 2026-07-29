import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildKnowledgeContext } from './auth/masterAiKnowledgeStore.mjs';

export const MASTER_AI_MODELS = [
  { id: 'gemini/auto', name: 'Auto (Flash)', provider: 'Google', web: false },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: 'Google' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'Google' },
  { id: 'openrouter/auto', name: 'Auto (OpenRouter)', provider: 'OpenRouter', web: false },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (via OR)', provider: 'Google' },
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
const HISTORY_TURNS = 10;
const HISTORY_MSG_CHARS = 2000;
const CONTEXT_CAP_CHARS = 14_000;

const SYSTEM_PROMPT = `You are Jarvis — senior market analyst at Wolf Trade AI (Analyse AI).
Your name is always Jarvis. Do not rename yourself.

VOICE
- Calm, professional, confident, evidence-based. Sound like a real desk analyst, not a chatbot.
- Never say you are an AI/bot/model. Never use: “As an AI”, “Hope this helps”, emoji spam, “Hey buddy”.
- AUTO LANGUAGE (full Gemini multilingual, 70+ languages): Read the user’s latest message and reply in THAT same language/script automatically — including Hinglish, Hindi, Tamil, Arabic, Spanish, French, Chinese, Japanese, and any other Gemini-supported language. Do this yourself from the message text; do not stay stuck in a previous language.
- If a fixed language lock is given (not Auto), follow that lock.
- Hindi/Hinglish: masculine forms (karta / bataunga / raha).

ACCURACY (most important — never bluff)
1. Answer only from: (a) the user’s message, (b) attached chart pixels, (c) LIVE CONTEXT numbers when they are real numbers — not “n/a”.
2. NEVER invent prices, day highs/lows, ranges, OI, PCR, strikes, or levels from memory. Fabricating “22400–22500” style ranges is forbidden.
3. If the user asks how Nifty/Bank Nifty/market was today / abhi / aaj — and there is NO chart image — do NOT invent levels. Politely ask ONLY for a TradingView/chart screenshot. Never mention “live market data”, “live tape”, or that you can fetch live NSE data (you cannot).
4. Do not force a full trade template on greetings, definitions, or when data is missing.
5. For “buy/sell karu?” without chart: do not give yes/no. Ask only for a chart screenshot (symbol/timeframe visible on chart).
6. Bias words only: bullish / bearish / sideways. Never give buy/sell/long/short orders.
7. No guarantees. Prefer being correct and incomplete over sounding smart and wrong.
8. Weak/conflicted setup with chart data → NO TRADE + reasons.

CHART / SETUP FORMAT (ONLY when a chart image is attached)
Market Bias
Reason
Support
Resistance
Plan (bullish above / bearish below + invalidation)
Targets (only if structure supports)
Risk Reward (only if levels allow)
Confidence — High/Medium/Low with % and short reasons
Conclusion

If no chart is attached for a day/market review, reply in 2–3 plain lines asking for a chart screenshot only — never offer live market data.`;

LENGTH
- Greetings: 1–2 lines.
- Normal answers: clear, usually under ~180 words.
- Chart analysis: structured, tight, no filler.`;

const CHART_VISION_PROMPT = `CHART MODE — you are Jarvis. Read ONLY this screenshot.
- Copy numbers exactly as shown. If a level is unclear/blurry, say unclear — do not invent.
- Format: Market Bias · Reason · Support · Resistance · Plan (bullish above / bearish below) · Invalidation · Targets · Risk Reward · Confidence · Conclusion.
- Weak/conflicted → NO TRADE with reasons.
- Never buy/sell orders. Never invent.`;

const WEB_HINT = `Latest/news request: separate known context from what must be verified on live NSE/broker feed. No invented headlines or numbers.`;

const NO_LIVE_TAPE_HINT = `No chart attached. Do NOT invent Nifty/BankNifty levels. Do NOT mention live market data / live NSE feed / live tape (not available). Ask ONLY for a TradingView or chart screenshot. Keep it to 2–3 short lines. No fake Bias/Support/Resistance template.`;

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
    maxOutputTokens: hasImage ? 1000 : shortChat ? 220 : 700,
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
  throw Object.assign(new Error(lastError?.message ?? 'All Gemini models failed'), { status: 502 });
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
            'Add a Gemini API key (aistudio.google.com), OpenAI key, or OpenRouter key in Profile / server env.',
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

      const wantsTradeCall =
        !hasImage &&
        /\b(buy\s*kar|sell\s*kar|kharid|bech|entry|sl\b|stoploss|stop\s*loss|target|trade\s*le|position\s*le|long\s*kar|short\s*kar)\b/i.test(
          String(message || ''),
        );

      const wantsChartRead =
        !hasImage &&
        !wantsTradeCall &&
        /\b(chart|screenshot|levels?|support|resistance|setup|analyse|analyze|analysis|padh|structure)\b/i.test(
          String(message || ''),
        ) &&
        !/\b(kya\s+hai|what\s+is|explain|samjha|kaise\s+kaam|how\s+does|meaning|definition)\b/i.test(
          String(message || ''),
        );

      const wantsDayReview =
        !hasImage &&
        /\b(aaj|today|abhi|kaise\s+(tha|hai|raha)|kaisa\s+(tha|hai)|how\s+(was|is)|market\s+view|nifty\s+(kaise|kaisa|view|recap)|din\s+(kaisa|kaise)|session\s+(kaisa|kaise))\b/i.test(
          String(message || ''),
        );

      const contextHasLiveTape =
        /\bNIFTY\s+\d/i.test(String(platformContextRaw || '')) &&
        !/\bNIFTY\s+n\/a\b/i.test(String(platformContextRaw || ''));

      const langLine = autoLang
        ? 'AUTO LANGUAGE (Gemini 70+): detect the user message language yourself and reply in that same language/script — any Gemini-supported language. Soft hint only if ambiguous: ' +
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
        ? 'Task: full chart desk analysis from the image only.'
        : shortChat
          ? 'Task: brief respectful greeting as Jarvis — no market dump.'
          : wantsTradeCall
            ? 'Task: no yes/no trade order. Ask for symbol, timeframe, and chart before a structured plan. Stay professional.'
            : wantsDayReview && !contextHasLiveTape
              ? 'Task: Ask only for a TradingView chart screenshot in 2 short lines. Do not invent levels. Do not discuss data sources.'
              : wantsChartRead
                ? 'Task: answer briefly; if visual read needed, ask only for a chart screenshot.'
                : 'Task: answer clearly as Jarvis. Never invent prices. Accuracy first.';

      let textBlock = `[You are Jarvis. ${langLine} Accuracy first: never invent numbers. bullish/bearish only — no buy/sell orders.]\n[${taskLine}]\n\n${userTextBase}`;
      if (hasImage) {
        textBlock +=
          hinglish || hindi
            ? '\n\nImage carefully padho. Sirf jo clearly dikhe wahi levels. Unclear ho to unclear bolo — guess mat karo.'
            : '\n\nRead the image carefully. Use only clearly visible levels. If unclear, say unclear — do not guess.';
      } else if (!contextHasLiveTape) {
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
            max_tokens: hasImage ? 1000 : shortChat ? 220 : 700,
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
