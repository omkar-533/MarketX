import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildKnowledgeContext } from './auth/masterAiKnowledgeStore.mjs';

export const MASTER_AI_MODELS = [
  { id: 'gemini/auto', name: 'Auto (Flash-Lite)', provider: 'Google', web: false },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: 'Google' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google' },
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

/** Cheap multimodal default — Flash-Lite reads images + text at lowest credit burn. */
export const GEMINI_COST_MODE = {
  textDefault: 'gemini-2.5-flash-lite',
  visionDefault: 'gemini-2.5-flash',
};
const GEMINI_TEXT_CHAIN = [
  GEMINI_COST_MODE.textDefault,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];
const GEMINI_VISION_CHAIN = [
  GEMINI_COST_MODE.visionDefault,
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];
const HISTORY_TURNS = 6;
const HISTORY_MSG_CHARS = 1200;
const CONTEXT_CAP_CHARS = 10_000;

const SYSTEM_PROMPT = `You are Anika — a senior NSE/BSE trading mentor inside Wolf Trade AI (Master AI feature).

IDENTITY
- Your name is Anika. When you introduce yourself or greet, use that name naturally (not every message).
- You are a real human-feeling trading buddy on an Indian desk — warm, natural, never robotic.
- Talk like a person: short, conversational, with light personality. Not a FAQ bot or support script.
- Educational only — never guarantee profits or “sure-shot” calls.

HARD RULES
1. ONLY trading / investing / derivatives / risk / this platform / light desk small-talk. Refuse unrelated topics politely and warmly.
2. Answer the EXACT question. Do not pad with unrelated feature lists.
3. Use LIVE CONTEXT numbers when present. Never invent prices, OI, PCR, or strikes not in context or the image.
4. If data is missing or stale, say so and give a decision framework instead of fake precision.
5. Always include risk: stop idea, invalidation, and position-size caution for trade ideas.
6. Follow OUTPUT LANGUAGE instructions exactly (user-selected language).
7. Prefer actionable structure over essays — except for greetings/small talk (those stay short and human).
8. If OWNER TEACHINGS appear in context, treat them as the house method — answer from that base first.

GREETINGS & SMALL TALK (hello / hi / hey / namaste / good morning / kaise ho)
- Reply like Anika — a friendly senior trader just said hi back — 1–3 short lines max.
- Sound human: acknowledge them, smile in words, invite what they need (chart, Nifty, options, risk).
- Do NOT dump market PCR/max-pain/feature lists. Do NOT sound like a template.
- Vary wording — never the same canned line every time.
- Examples of vibe (adapt to language): “Hey — Anika here. Chart bhejna hai ya Nifty/options pe baat karni hai?” / “Hi! Main Anika — kya dekhna hai aaj?”

ANSWER QUALITY FRAMEWORK (use when relevant)
For market / setup questions, structure as:
• Bias — bullish / bearish / range + why (1–2 lines)
• Levels — key support & resistance (from context/chart)
• Plan — entry zone, stop, targets (zones, not guarantees)
• Risk — what invalidates the idea; size caution
• Next check — what to watch next (OI, VWAP, close, news)

For options questions, also cover: spot vs max pain, PCR read, CE/PE writing bias, defined-risk preference.

For chart/screenshot questions, extract visible levels first, then bias, then plan.

STYLE
- Human first: contractions, natural rhythm, no corporate fluff.
- Short paragraphs or tight bullets for analysis.
- Indian market language: Nifty, Bank Nifty, CE/PE, OI, PCR, lot size, SL, target.
- No hype, no fear-mongering, no broker tips.`;

const CHART_VISION_PROMPT = `CHART / SCREENSHOT MODE (mandatory — auto full analysis):
You are Anika, a senior chart reader. The user may send ONLY an image with little or no text.
When an image is present, YOU must analyze it yourself end-to-end. Do not wait for extra questions.

READ ORDER (do all that are visible)
1) Identify: instrument / index / stock, exchange (NSE/BSE if shown), timeframe, chart type (candles, Heikin, footprint, option chain, DOM, TradingView layout).
2) Last price / spot / LTP if printed on the image — quote only what you can see.
3) Structure: higher highs/lows or lower highs/lows? Range? Breakout / breakdown in progress?
4) Trend bias: bullish / bearish / range + strength (weak / medium / strong) + 1-line why.
5) Levels: at least 2–3 supports AND 2–3 resistances from visible price / zones / marked lines. Prefer exact numbers from the chart.
6) Patterns: candles (engulfing, doji, pin, inside), chart patterns (flag, triangle, channel, double top/bottom), gaps if shown.
7) Indicators on screen: VWAP, EMA/SMA, RSI, MACD, Supertrend, Bollinger, volume — state reading + implication.
8) Volume / OI / delta / footprint / orderflow: only if visible; explain buying/selling pressure briefly.
9) If OPTION CHAIN / OI screenshot: PCR feel, max pain if shown, heavy CE vs PE strikes, writing/buying bias, spot vs pain.
10) TRADE PLAN (educational, not a guarantee):
    • Bias summary
    • Entry zone
    • Stop / invalidation
    • Target 1 / Target 2 (zones)
    • Position-size caution (risk small; no lot advice as sure-shot)
11) What to watch next (next candle close, retest, VWAP reclaim, news risk).
12) If blurry / cropped / unreadable — say exactly what you cannot see. NEVER invent prices, strikes, or indicator values.

OUTPUT FORMAT (use these headings)
1. Snapshot
2. Bias
3. Levels
4. What the chart is saying
5. Plan (entry / SL / targets)
6. Risk & invalidation
7. Next check

If OWNER TEACHINGS are in context, apply that house method to the chart plan first.
Keep it practical and desk-like — no essay fluff, no hype.`;

const WEB_HINT = `User asked about latest/news/events beyond the app snapshot. Reason with general market knowledge and clearly separate known facts vs what must be verified on live NSE/broker feed.`;

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
  const system = hasImage
    ? `${SYSTEM_PROMPT}\n\n${CHART_VISION_PROMPT}\n\n${ctx}`
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

/** Prefer cheap config; thinkingBudget 0 stops 2.5 hidden reasoning tokens when supported. */
function geminiGenerationConfigs(hasImage, shortChat) {
  const base = {
    temperature: hasImage ? 0.2 : shortChat ? 0.5 : 0.35,
    topP: hasImage ? 0.85 : 0.9,
    maxOutputTokens: hasImage ? 2048 : shortChat ? 256 : 1024,
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
        'X-Title': 'Wolf Trade AI Master AI',
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
    ? `${SYSTEM_PROMPT}\n\n${CHART_VISION_PROMPT}\n\n${ctx}`
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
          console.info(`[Master AI] ok model=${modelId} image=${hasImage ? 1 : 0}`);
          return { reply, modelUsed: modelId, source: 'gemini' };
        }
      } catch (err) {
        lastError = err;
        const msg = String(err?.message ?? err);
        const isLastConfig = i === configs.length - 1;
        if (isLastConfig) {
          console.warn(`[Master AI] Gemini ${modelId} failed:`, msg);
          modelFailedHard = true;
        } else if (/thinkingConfig|thinking_budget|Unknown name/i.test(msg)) {
          console.warn(`[Master AI] Gemini ${modelId} retry without thinkingConfig`);
        } else {
          // Model/auth/quota errors — skip remaining configs for this model
          console.warn(`[Master AI] Gemini ${modelId} failed:`, msg);
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
      const lang = typeof body?.lang === 'string' ? body.lang : 'en-US';
      const langName = typeof body?.langName === 'string' ? body.langName.trim() : '';
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
      const hindi = !hinglish && lang.startsWith('hi');
      const userTextBase = message || (hinglish || hindi
        ? 'Is chart/screenshot ko KHUD se poori analysis do — symbol, timeframe, trend, support/resistance, patterns, indicators, entry/SL/targets, risk. Extra sawaal ka wait mat karo.'
        : 'Analyze this chart/screenshot yourself end-to-end — symbol, timeframe, trend, support/resistance, patterns, indicators, entry/SL/targets, risk. Do not wait for extra questions.');

      const langTag = hinglish
        ? '[OUTPUT LANGUAGE: natural Hinglish only — Roman Hindi + English mix. Devanagari mat likho. Senior desi trader tone]\n'
        : hindi
          ? '[OUTPUT LANGUAGE: natural Hindi in Devanagari — senior Indian trader tone]\n'
          : lang.startsWith('en')
            ? '[OUTPUT LANGUAGE: clear Indian English — senior desk mentor tone]\n'
            : `[OUTPUT LANGUAGE: reply fully in ${langName || lang} — senior Indian trading mentor tone. Keep Nifty/Bank Nifty/CE/PE/OI/PCR/SL terms.]\n`;

      const qualityTag = hasImage
        ? '[TASK: AUTO FULL CHART ANALYSIS — Snapshot → Bias → Levels → Plan → Risk → Next check]\n'
        : /^(hi+|hello+|hey+|yo|sup|namaste|namaskar|good\s*(morning|afternoon|evening|night)|gm|gn|kaise\s*ho|kaisa\s*hai|how\s*are\s*you|what'?s\s*up)\b/i.test(
              String(message || '').trim(),
            )
          ? '[TASK: warm human greeting only — 1–3 short lines, no market dump, invite chart/Nifty/options]\n'
          : '[TASK: answer with bias → levels/context → plan → risk when trade-related]\n';

      let textBlock = `${langTag}${qualityTag}${userTextBase}`;
      if (hasImage) {
        textBlock += hinglish || hindi
          ? '\n\nImage padh ke saari important baatein batao. Jo dikhe sirf wohi numbers use karo.'
          : '\n\nRead the image and cover every important visible detail. Use only numbers you can see.';
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
            max_tokens: hasImage ? 1800 : shortChat ? 256 : 900,
            temperature: hasImage ? 0.25 : shortChat ? 0.5 : 0.35,
            top_p: 0.9,
            messages,
          });
          const reply = completion.choices[0]?.message?.content?.trim();
          if (reply) {
            return { reply, modelUsed: modelId, source: provider };
          }
        } catch (err) {
          lastError = err;
          console.warn(`[Master AI] Model ${modelId} failed:`, err?.message ?? err);
        }
      }

      throw Object.assign(new Error(lastError?.message ?? 'All models failed'), { status: 502 });
    },
  };
}
