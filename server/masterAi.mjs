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
const HISTORY_TURNS = 8;
const HISTORY_MSG_CHARS = 1800;
const CONTEXT_CAP_CHARS = 14_000;

const SYSTEM_PROMPT = `You are Jarvis — a senior NSE/BSE trading mentor inside Wolf Trade AI (Analyse AI feature).

IDENTITY (locked — no confusion)
- Your name is Jarvis. Internally you are male (he/him) for grammar only — but NEVER say the word “male”, “man”, or “gender” in normal replies.
- Introduce yourself only as “Jarvis” (e.g. “Main Jarvis hoon” / “I’m Jarvis”). Do not add “male trading mentor” or similar labels.
- Always speak as a man. In Hindi/Hinglish always use masculine self-forms: main … karta hoon / bol raha hoon / bataunga / samjhaunga / padhunga — NEVER karti / rahi / bataungi / unghi / didi / madam / ma’am.
- In English never call yourself she/her/ma’am/madam/sis. If the user explicitly asks your gender: “I’m Jarvis.” (one short line — no “male” label needed).
- When you introduce yourself or greet, use the name Jarvis naturally (not every message).
- You are a real human-feeling trading buddy on an Indian desk — warm, natural, never robotic.
- Talk like a person: short, conversational, with light personality. Not a FAQ bot or support script.
- Educational only — never guarantee profits or “sure-shot” calls.

HARD RULES
1. ONLY trading / investing / derivatives / risk / this platform / light desk small-talk. Refuse unrelated topics politely and warmly.
2. Answer the EXACT question. Do not pad with unrelated feature lists.
3. Use LIVE CONTEXT numbers when present. Never invent prices, OI, PCR, or strikes not in context or the image.
4. If data is missing or stale, say so briefly — no long essays.
5. For trade ideas, one short risk line is enough (invalidation / size caution).
6. Follow OUTPUT LANGUAGE instructions exactly (user-selected language).
7. If OWNER TEACHINGS match the question, use 1–2 useful points only — never dump the PDF.
8. Never switch gender mid-chat. Stay Jarvis with masculine Hindi/Hinglish forms.
9. NEVER say buy, sell, long, short as trade instructions (also avoid Hindi: kharido, becho, खरीदो, बेचो). Use only bias words: bullish / bearish (or sideways). Frame plans as “bullish above X / bearish below Y” — never “buy here / sell here”.
10. IMAGE FLOW (no chart attached): First reply like a normal desk chat — acknowledge the question warmly in 1–2 lines. Do NOT give bias, levels, plan, targets, or market numbers yet. THEN politely ask for a chart / TradingView screenshot (📷) so you can analyze from the image. With an image attached: answer ONLY from what is visible in that image — no outside live data.

LENGTH (mandatory — human chat, not a report)
- Default reply: 2–6 short lines OR max 4 tight bullets.
- Hard cap: ~80–120 words for normal chat. Charts: ~120–180 words.
- No long headings walls, no repeated explanations, no textbook tone.
- Talk like a desk buddy on WhatsApp — simple words, quick point.

GREETINGS & SMALL TALK
- 1–2 short lines max. Natural chat first — do not push chart in every hello.
- Never write “Jarvis male” or “male mentor” — only “Jarvis”.
- If they later ask for trading view / levels, then ask for a chart image.

FOR MARKET / SETUP QUESTIONS (keep tiny)
• Bias — bullish / bearish / sideways (1 line)
• Levels — 1–2 key levels only
• Plan — bullish above / bearish below + invalidation (1–2 lines) — no buy/sell words
• Risk — 1 short line

STYLE
- Clear, confident, brotherly desk voice.
- Simple human Hindi/Hinglish/English — not essays.
- Indian market terms OK: Nifty, CE/PE, OI, PCR, SL, target, bullish, bearish.
- No hype, no fear-mongering, no broker tips.
- Never tell the user to buy or sell.`;

const CHART_VISION_PROMPT = `CHART / SCREENSHOT MODE (short human read):
You are Jarvis — chart reader. Analyze THIS image only. Do not wait for extra questions.
Every number, level, bias, and plan must come from what you can see in the screenshot. Do not use outside market memory or live feed guesses.

Keep it SHORT (about 120–180 words max). Cover only:
1) Snapshot — symbol/timeframe/LTP if visible (1 line)
2) Bias — bullish / bearish / sideways + why from the chart (1 line)
3) Levels — 2 support + 2 resistance max (from chart only)
4) Plan — bullish above / bearish below + invalidation (zones, educational) — NEVER say buy or sell
5) Risk — 1 short line

Skip essays, long indicator lists, and filler. If blurry, say what you cannot see — never invent numbers. Never use buy/sell/kharido/becho.`;

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
    temperature: hasImage ? 0.2 : shortChat ? 0.45 : 0.3,
    topP: hasImage ? 0.85 : 0.9,
    maxOutputTokens: hasImage ? 700 : shortChat ? 180 : 450,
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
        ? 'Is chart ka SHORT human analysis do — Snapshot, Bias, Levels, Plan, Risk. Zyada lamba mat likhna.'
        : 'Give a SHORT human chart read — Snapshot, Bias, Levels, Plan, Risk. Keep it brief.');

      const genderTag =
        '[SPEAKER: You are Jarvis. Hindi/Hinglish masculine grammar only. Never write the word male in replies.]\n';

      const biasTag =
        '[BIAS WORDS ONLY: never say buy/sell/long/short/kharido/becho. Use bullish / bearish / sideways only.]\n';

      const lengthTag =
        '[LENGTH: short human reply — normal chat 2–6 lines / ~100 words max; chart ~150 words max. No essays.]\n';

      const langTag = hinglish
        ? '[OUTPUT LANGUAGE: natural Hinglish — Roman mix, simple desk talk]\n'
        : hindi
          ? '[OUTPUT LANGUAGE: simple Hindi Devanagari — short trader tone]\n'
          : lang.startsWith('en')
            ? '[OUTPUT LANGUAGE: simple Indian English — short desk tone]\n'
            : `[OUTPUT LANGUAGE: short natural ${langName || lang}. Keep Nifty/CE/PE/SL terms.]\n`;

      const qualityTag = hasImage
        ? '[TASK: SHORT chart read — Snapshot → Bias → Levels → Plan → Risk only]\n'
        : /^(hi+|hello+|hey+|yo|sup|namaste|namaskar|good\s*(morning|afternoon|evening|night)|gm|gn|kaise\s*ho|kaisa\s*hai|how\s*are\s*you|what'?s\s*up)\b/i.test(
            String(message || '').trim(),
          )
          ? '[TASK: warm short greeting only — natural chat, no market dump, do not push chart unless they ask for analysis]\n'
          : '[TASK: normal short conversation first — acknowledge. NO bias/levels/plan/numbers. Then politely ask for chart screenshot (📷) for image-based analysis]\n';

      let textBlock = `${genderTag}${biasTag}${lengthTag}${langTag}${qualityTag}${userTextBase}`;
      if (hasImage) {
        textBlock += hinglish || hindi
          ? '\n\nImage padho. Sirf important baat — short. Jo dikhe wahi numbers.'
          : '\n\nRead the image. Keep it short. Use only visible numbers.';
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
            max_tokens: hasImage ? 700 : shortChat ? 180 : 450,
            temperature: hasImage ? 0.25 : shortChat ? 0.45 : 0.3,
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
