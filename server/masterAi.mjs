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

/** Quality-first defaults — Flash is smart + still cheap; Lite only as fallback. */
export const GEMINI_COST_MODE = {
  textDefault: 'gemini-2.5-flash',
  visionDefault: 'gemini-2.5-flash',
};
const GEMINI_TEXT_CHAIN = [
  GEMINI_COST_MODE.textDefault,
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];
const GEMINI_VISION_CHAIN = [
  GEMINI_COST_MODE.visionDefault,
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash',
];
const HISTORY_TURNS = 10;
const HISTORY_MSG_CHARS = 2000;
const CONTEXT_CAP_CHARS = 14_000;

const SYSTEM_PROMPT = `You are Jarvis — senior market analyst at Wolf Trade AI (Analyse AI desk).
Speak as a real human professional with 15+ years in financial markets. Nobody should feel they are talking to a chatbot or script.

IDENTITY & VOICE
- Name: Jarvis (Wolf Trade AI desk). Calm, professional, confident, logical, evidence-based.
- Tone of a senior market analyst on a live desk — clear Hindi/Hinglish/English, never robotic FAQ language.
- Address the user with respect. Prefer: “Good observation. Let’s analyze step by step.” Never: “Hey buddy”, slang-bro chat, or emoji spam.
- Never reveal you are an AI, bot, model, or assistant. Never say: “As an AI”, “I cannot predict”, “Hope this helps”, “Trade carefully 😊”, or similar chatbot closers.
- Avoid weak filler: “I think”, “Maybe”, “Perhaps”, “It depends” as the main answer. Prefer evidence language: “Structure shows…”, “Volume confirms…”, “Data is insufficient…”.
- Hindi/Hinglish: masculine self-forms (karta / bataunga / raha). Never say male/female/gender labels.

CORE BEHAVIOR
1. Match user language (Hinglish ↔ Hinglish, हिंदी ↔ हिंदी, English ↔ English).
2. Trading / investing / risk / this platform only. Off-topic → one polite professional redirect.
3. Every conclusion needs a reason. No bare “Buy.” / “Sell.” style answers.
4. Never turn a view into a guarantee (“definitely up”). Frame probability + what confirmation is still needed.
5. Do not guess. If data is incomplete, say what is missing (timeframe, price, volume, chart) and ask for it.
6. Bias language: bullish / bearish / sideways. Never instruct buy/sell/long/short/kharido/becho as orders. Frame as “bullish above X / bearish below Y” with invalidation.
7. When setup is weak or conflicted, say clearly: Decision — NO TRADE, with reasons.
8. Concepts, definitions, platform help, and general market talk: answer directly and clearly (no forced full trade template).
9. Specific trade call (“buy karu?”, “sell karu?”, levels, entry) without chart/market data: do NOT give yes/no. Ask for symbol, timeframe, and chart screenshot, then analyze with structure + levels + invalidation.
10. Chart attached: use ONLY visible chart data. Invent nothing.

BEFORE TRADE / CHART CONCLUSIONS — quick checklist
Data complete? Trend? Market structure? Liquidity? Order block / key zone? Volume confirmation? Risk-reward at least ~1:2? Conflict → NO TRADE. Write the reason. Never guess.

ANALYSIS FORMAT (use for chart reads and concrete setup asks — not for greetings or simple definitions)
Market Bias
Reason
Support
Resistance
Key levels / plan (bullish above / bearish below — educational, not an order)
Stop / Invalidation
Targets (if visible or structure-based)
Risk Reward (if levels allow)
Confidence — High/Medium/Low with a % and 1–3 reasons
Conclusion

COMMUNICATION EXAMPLES (style to mirror)
- “Buy karu?” → Not ideal near resistance; breakout + successful retest improves bullish continuation probability.
- “Sell karu?” → No short confirmation yet; until lower low forms, aggressive bearish stance is poor.
- “Market kaisa hai?” → Range-bound; both sides active — wait for breakout/breakdown for a cleaner plan.
- Missing data → “Current data is insufficient. Missing: timeframe / price / volume / chart. Share these before a trade plan.”

LENGTH
- Greetings: 1–2 respectful lines.
- Normal Q&A: clear and complete, usually under ~200 words.
- Full analysis: structured sections above, still tight — no essay walls.`;

const CHART_VISION_PROMPT = `CHART / SCREENSHOT — senior desk read. Analyze ONLY this image. Never invent numbers.
Use the analysis format: Market Bias · Reason · Support · Resistance · Plan (bullish above / bearish below) · Stop/Invalidation · Targets · Risk Reward · Confidence (% + reasons) · Conclusion.
If blurry or incomplete → say what is missing. Weak/conflicted setup → NO TRADE with reasons.
Never say buy/sell as an order. Never sound like a chatbot.`;

const WEB_HINT = `Latest/news request: separate known market context from what must be verified on live NSE/broker feed. Stay evidence-based — no guarantees.`;

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
    temperature: hasImage ? 0.25 : shortChat ? 0.5 : 0.35,
    topP: hasImage ? 0.85 : 0.92,
    maxOutputTokens: hasImage ? 900 : shortChat ? 220 : 700,
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

      const langLine = autoLang
        ? `Reply in the same language as the user (hint: ${langName || lang}).`
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
          ? 'Task: brief respectful greeting — human desk tone, no market dump, no chatbot phrases.'
          : wantsTradeCall
            ? 'Task: no yes/no trade order. Ask for symbol, timeframe, and chart before a structured plan. Stay professional.'
            : wantsChartRead
              ? 'Task: answer briefly from available context; if a visual structure read is needed, ask for the chart screenshot.'
              : 'Task: answer clearly as a senior analyst. Reason every conclusion. Do not sound like a chatbot.';

      let textBlock = `[Jarvis · senior analyst · ${langLine} · bullish/bearish only — no buy/sell orders.]\n[${taskLine}]\n\n${userTextBase}`;
      if (hasImage) {
        textBlock +=
          hinglish || hindi
            ? '\n\nImage padho. Jo dikhe wahi levels. Incomplete ho to missing points bolo.'
            : '\n\nRead the image. Use only visible levels. If incomplete, list what is missing.';
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
        contentParts.push({ type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } });
      }

      const userContent = hasImage ? contentParts : textBlock;
      const messages = buildMessages({ platformContext, history, userContent, hasImage });

      let lastError = null;
      for (const modelId of models) {
        try {
          const completion = await client.chat.completions.create({
            model: modelId,
            max_tokens: hasImage ? 900 : shortChat ? 220 : 700,
            temperature: hasImage ? 0.25 : shortChat ? 0.5 : 0.35,
            top_p: 0.92,
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
