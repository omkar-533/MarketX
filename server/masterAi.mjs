import OpenAI from 'openai';

export const MASTER_AI_MODELS = [
  { id: 'openrouter/auto', name: 'Auto (best)', provider: 'OpenRouter', web: false },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', provider: 'Google' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'Meta' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct', name: 'Mistral Small', provider: 'Mistral' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', provider: 'Qwen' },
  { id: 'perplexity/sonar', name: 'Sonar (web)', provider: 'Perplexity', web: true },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini Flash (free)', provider: 'Google', free: true },
  { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 (free)', provider: 'Meta', free: true },
];

const SYSTEM_PROMPT = `You are Master AI — a warm, experienced Indian markets mentor on Master TradeX.

STRICT RULES:
1. ONLY discuss trading, investing, derivatives, macro/market news impact, risk, and this platform. Politely refuse anything else.
2. Sound human: conversational, direct, like a senior trader talking to a friend. No robotic bullet spam unless user asks for a list.
3. Answer the EXACT question asked. Do not dump unrelated features.
4. Use the platform context below for app-specific questions. If something is not in the app, use your general markets knowledge openly — you may cite public concepts, RBI/RBI policy themes, sector logic, etc. Never invent live prices not in context.
5. For latest events/regulations/news beyond context, say what you know and what to verify on NSE/broker feed.
6. Educational only — never guarantee profits. Mention risk and position sizing when relevant.
7. Follow the OUTPUT LANGUAGE block in context exactly — Hindi mode = Hinglish/Devanagari mentor; English mode = Indian English only.
8. If the user mixes languages, still follow the active UI language unless they clearly switched mid-chat.
9. Keep answers focused: usually 3–8 short paragraphs or clear bullets for complex setups.`;

const CHART_VISION_PROMPT = `CHART / SCREENSHOT MODE:
The user attached a trading image. Read every visible pixel — candlesticks, levels, indicators, option chain, footprint, DOM, or mobile broker screenshot.
Give a complete technical breakdown immediately: trend, support & resistance (multiple levels), patterns, volume/OI, indicators, and practical trade planning (entry / SL / target as zones, not guarantees).
If text or prices are blurry, say what you can see vs what you cannot — never fabricate numbers.`;

const WEB_HINT = `The user may need information beyond the app snapshot. Use broad trading knowledge and recent market reasoning. If uncertain on a live number, say so clearly.`;

function buildMessages({ platformContext, history, userContent, hasImage }) {
  const system = hasImage
    ? `${SYSTEM_PROMPT}\n\n${CHART_VISION_PROMPT}\n\n${platformContext}`
    : `${SYSTEM_PROMPT}\n\n${platformContext}`;
  const msgs = [{ role: 'system', content: system }];
  const trimmed = (history ?? []).slice(-8);
  for (const h of trimmed) {
    if (h.role === 'user' || h.role === 'assistant') {
      msgs.push({ role: h.role, content: String(h.content).slice(0, 4000) });
    }
  }
  msgs.push({ role: 'user', content: userContent });
  return msgs;
}

function pickTextModels(requested, needsWeb, langCode) {
  const chain = [];
  const hindi = String(langCode || '').startsWith('hi');
  if (needsWeb) chain.push('perplexity/sonar');
  if (hindi) {
    chain.push('qwen/qwen-2.5-72b-instruct', 'google/gemini-2.0-flash-001');
  }
  if (requested && requested !== 'openrouter/auto') chain.push(requested);
  chain.push('openai/gpt-4o-mini', 'google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.2-3b-instruct:free');
  return [...new Set(chain)];
}

/** Vision-capable models only (no Sonar — text-only) */
function pickVisionModels(langCode) {
  const hindi = String(langCode || '').startsWith('hi');
  const chain = [
    'openai/gpt-4o',
    'google/gemini-2.0-flash-001',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3.5-haiku',
  ];
  if (hindi) {
    chain.unshift('google/gemini-2.0-flash-001', 'openai/gpt-4o');
  }
  return [...new Set(chain)];
}

export function createMasterAiRouter(apiKey) {
  const client = apiKey
    ? new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey })
    : null;

  return {
    isConfigured: Boolean(client),

    async chat(body) {
      const message = typeof body?.message === 'string' ? body.message.trim() : '';
      const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl.trim() : '';
      const platformContext = typeof body?.platformContext === 'string' ? body.platformContext : '';
      const model = typeof body?.model === 'string' ? body.model : 'openrouter/auto';
      const lang = typeof body?.lang === 'string' ? body.lang : 'en-US';
      const needsWeb = Boolean(body?.needsWeb);
      const history = Array.isArray(body?.history) ? body.history : [];
      const hasImage = Boolean(imageDataUrl);

      if (!message && !imageDataUrl) {
        throw Object.assign(new Error('message or image required'), { status: 400 });
      }
      if (!client) {
        throw Object.assign(new Error('OPENROUTER_API_KEY is not configured on the server.'), { status: 503 });
      }

      if (hasImage && imageDataUrl.length > 6_500_000) {
        throw Object.assign(new Error('Image too large after encoding. Use a smaller screenshot.'), {
          status: 413,
        });
      }

      const hindi = lang.startsWith('hi');
      const userText = message || (hindi
        ? 'Is chart/screenshot ko turant analyze karo — trend, support, resistance, patterns, aur trade plan.'
        : 'Analyze this chart screenshot now — trend, support, resistance, patterns, and trade plan.');

      const langTag = hindi
        ? '[Hindi/Hinglish reply — natural Indian trader tone]\n'
        : '[Indian English reply — warm mentor tone]\n';

      let textBlock = `${langTag}${userText}`;
      if (needsWeb && !hasImage) textBlock += `\n\n${WEB_HINT}`;

      const contentParts = [{ type: 'text', text: textBlock }];
      if (hasImage) {
        contentParts.push({ type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } });
      }

      const userContent = hasImage ? contentParts : textBlock;
      const messages = buildMessages({ platformContext, history, userContent, hasImage });

      const models = hasImage ? pickVisionModels(lang) : pickTextModels(model, needsWeb, lang);
      let lastError = null;

      for (const modelId of models) {
        try {
          const completion = await client.chat.completions.create({
            model: modelId,
            max_tokens: hasImage ? 2200 : 1200,
            temperature: hasImage ? 0.35 : 0.45,
            messages,
          });
          const reply = completion.choices[0]?.message?.content?.trim();
          if (reply) {
            return { reply, modelUsed: modelId, source: 'openrouter' };
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
