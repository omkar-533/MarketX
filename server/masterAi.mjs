import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const MASTER_AI_MODELS = [
  { id: 'gemini/auto', name: 'Auto (Gemini)', provider: 'Google', web: false },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google' },
  { id: 'openrouter/auto', name: 'Auto (OpenRouter)', provider: 'OpenRouter', web: false },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (via OR)', provider: 'Google' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'perplexity/sonar', name: 'Sonar (web)', provider: 'Perplexity', web: true },
];

const SYSTEM_PROMPT = `You are Master AI — a senior NSE/BSE trading mentor inside Wolf Trade AI.

IDENTITY
- Think like a desk mentor who has traded F&O for years in India.
- Warm, direct, practical. Prefer clarity over jargon dumps.
- Educational only — never guarantee profits or “sure-shot” calls.

HARD RULES
1. ONLY trading / investing / derivatives / risk / this platform. Refuse other topics politely.
2. Answer the EXACT question. Do not pad with unrelated feature lists.
3. Use LIVE CONTEXT numbers when present. Never invent prices, OI, PCR, or strikes not in context or the image.
4. If data is missing or stale, say so and give a decision framework instead of fake precision.
5. Always include risk: stop idea, invalidation, and position-size caution for trade ideas.
6. Follow OUTPUT LANGUAGE instructions exactly (Hindi/Hinglish vs Indian English).
7. Prefer actionable structure over essays.

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
- Short paragraphs or tight bullets.
- Indian market language: Nifty, Bank Nifty, CE/PE, OI, PCR, lot size, SL, target.
- No hype, no fear-mongering, no broker tips.`;

const CHART_VISION_PROMPT = `CHART / SCREENSHOT MODE (priority):
Read the image carefully before answering.
1) Identify instrument, timeframe, and chart type if visible.
2) Mark trend (bull / bear / range) and strength.
3) List at least 2–3 supports and 2–3 resistances from visible price action.
4) Note patterns, VWAP/MA/RSI/MACD/OI if shown.
5) If option chain: PCR, max pain, heavy CE/PE strikes, bias.
6) Give a practical trade plan (entry zone / SL / targets) + what would invalidate it.
7) If blurry/unreadable — say what you cannot see. Never invent numbers.`;

const WEB_HINT = `User asked about latest/news/events beyond the app snapshot. Reason with general market knowledge and clearly separate known facts vs what must be verified on live NSE/broker feed.`;

/** OpenAI sk-… · OpenRouter sk-or-… · Google AI Studio / Gemini AIza… */
export function detectAiProvider(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return null;
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('sk-')) return 'openai';
  if (key.startsWith('AIza')) return 'gemini';
  // Explicit Gemini keys sometimes arrive without prefix checks in custom setups
  if (/^AI[a-zA-Z0-9_-]{20,}$/.test(key)) return 'gemini';
  return null;
}

function buildMessages({ platformContext, history, userContent, hasImage }) {
  const system = hasImage
    ? `${SYSTEM_PROMPT}\n\n${CHART_VISION_PROMPT}\n\n${platformContext}`
    : `${SYSTEM_PROMPT}\n\n${platformContext}`;
  const msgs = [{ role: 'system', content: system }];
  const trimmed = (history ?? []).slice(-12);
  for (const h of trimmed) {
    if (h.role === 'user' || h.role === 'assistant') {
      msgs.push({ role: h.role, content: String(h.content).slice(0, 5000) });
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
    chain.push('gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro');
    return [...new Set(chain)];
  }
  if (provider === 'openai') {
    return ['gpt-4o', 'gpt-4o-mini'];
  }
  const chain = [];
  const hindi = String(langCode || '').startsWith('hi');
  if (needsWeb) chain.push('perplexity/sonar');
  if (requested && requested !== 'openrouter/auto' && requested !== 'gemini/auto') {
    chain.push(requested);
  }
  chain.push(
    'openai/gpt-4o',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o-mini',
    'deepseek/deepseek-chat',
  );
  if (hindi) {
    chain.push('qwen/qwen-2.5-72b-instruct', 'google/gemini-2.0-flash-001');
  }
  chain.push('google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.2-3b-instruct:free');
  return [...new Set(chain)];
}

function pickVisionModels(langCode, provider) {
  if (provider === 'gemini') {
    return ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
  }
  if (provider === 'openai') {
    return ['gpt-4o', 'gpt-4o-mini'];
  }
  const hindi = String(langCode || '').startsWith('hi');
  const chain = [
    'openai/gpt-4o',
    'anthropic/claude-3.5-sonnet',
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-haiku',
  ];
  if (hindi) {
    chain.unshift('google/gemini-2.0-flash-001', 'openai/gpt-4o');
  }
  return [...new Set(chain)];
}

function mapRequestedToGemini(requested) {
  const r = String(requested || '');
  if (!r || r === 'gemini/auto' || r === 'openrouter/auto') return null;
  if (r.startsWith('gemini-')) return r;
  if (r.includes('gemini-2.5-pro')) return 'gemini-2.5-pro';
  if (r.includes('gemini-2.5-flash')) return 'gemini-2.5-flash';
  if (r.includes('gemini-2.0')) return 'gemini-2.0-flash';
  if (r.includes('gemini-1.5-pro')) return 'gemini-1.5-pro';
  if (r.includes('gemini-1.5-flash')) return 'gemini-1.5-flash';
  return null;
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

async function chatWithGemini(gemini, {
  platformContext,
  history,
  userText,
  imageDataUrl,
  hasImage,
  models,
}) {
  const system = hasImage
    ? `${SYSTEM_PROMPT}\n\n${CHART_VISION_PROMPT}\n\n${platformContext}`
    : `${SYSTEM_PROMPT}\n\n${platformContext}`;

  const geminiHistory = [];
  for (const h of (history ?? []).slice(-12)) {
    if (h.role !== 'user' && h.role !== 'assistant') continue;
    geminiHistory.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(h.content).slice(0, 5000) }],
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

  let lastError = null;
  for (const modelId of models) {
    try {
      const model = gemini.getGenerativeModel({
        model: modelId,
        systemInstruction: system,
      });
      const chat = model.startChat({ history: geminiHistory });
      const result = await chat.sendMessage(userParts);
      const reply = String(result?.response?.text?.() ?? '').trim();
      if (reply) return { reply, modelUsed: modelId, source: 'gemini' };
    } catch (err) {
      lastError = err;
      console.warn(`[Master AI] Gemini ${modelId} failed:`, err?.message ?? err);
    }
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
      const platformContext = typeof body?.platformContext === 'string' ? body.platformContext : '';
      const model = typeof body?.model === 'string' ? body.model : 'gemini/auto';
      const lang = typeof body?.lang === 'string' ? body.lang : 'en-US';
      const needsWeb = Boolean(body?.needsWeb);
      const history = Array.isArray(body?.history) ? body.history : [];
      const hasImage = Boolean(imageDataUrl);

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

      const hindi = lang.startsWith('hi');
      const userTextBase = message || (hindi
        ? 'Is chart/screenshot ko turant analyze karo — trend, support, resistance, patterns, aur trade plan.'
        : 'Analyze this chart screenshot now — trend, support, resistance, patterns, and trade plan.');

      const langTag = hindi
        ? '[OUTPUT LANGUAGE: natural Hinglish or Hindi — senior Indian trader tone]\n'
        : '[OUTPUT LANGUAGE: clear Indian English — senior desk mentor tone]\n';

      const qualityTag = hasImage
        ? '[TASK: full chart read → bias → levels → plan → risk]\n'
        : '[TASK: answer with bias → levels/context → plan → risk when trade-related]\n';

      let textBlock = `${langTag}${qualityTag}${userTextBase}`;
      if (needsWeb && !hasImage) textBlock += `\n\n${WEB_HINT}`;

      const models = hasImage
        ? pickVisionModels(lang, provider)
        : pickTextModels(model, needsWeb, lang, provider);

      if (provider === 'gemini' && gemini) {
        return chatWithGemini(gemini, {
          platformContext,
          history,
          userText: textBlock,
          imageDataUrl,
          hasImage,
          models,
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
            max_tokens: hasImage ? 2800 : 1800,
            temperature: hasImage ? 0.25 : 0.35,
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
