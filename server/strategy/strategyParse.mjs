/**
 * Strategy Lab — controlled NL → Strategy JSON (no code execution).
 * LLM may only emit whitelist condition types; server validates hard.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export const ALLOWED_CONDITION_TYPES = [
  'LIQUIDITY_SWEEP',
  'EQUAL_HIGHS',
  'EQUAL_LOWS',
  'STRUCTURE_SHIFT',
  'BOS',
  'HH',
  'HL',
  'LH',
  'LL',
  'BREAKOUT',
  'BREAKDOWN',
  'VOLUME_EXPANSION',
  'VOLUME_CONTRACTION',
  'RELATIVE_VOLUME',
  'HTF_TREND',
  'TREND_CONTINUATION',
  'REVERSAL',
  'EMA_ALIGNMENT',
  'EMA_CROSS',
  'PRICE_ABOVE_EMA',
  'PRICE_BELOW_EMA',
  'RSI_ABOVE',
  'RSI_BELOW',
];

export const ALLOWED_TFS = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'];

const UNSUPPORTED_PATTERNS = [
  {
    re: /\b(smart\s*money|institutional\s*(order\s*)?flow|order\s*flow|footprint|delta\s*volume|dom\b|level\s*2|tape\s*reading|iceberg)\b/i,
    message:
      "That condition isn't currently supported by WOLF's available market data. Try liquidity sweep, structure shift, volume, or HTF trend instead.",
  },
  {
    re: /\b(news\s*catalyst|earnings\s*surprise|insider\s*buying|dark\s*pool)\b/i,
    message:
      "That condition isn't currently supported by WOLF's available market data. Stick to price, volume, structure, and trend conditions WOLF can measure.",
  },
];

export function detectUnsupported(description) {
  for (const p of UNSUPPORTED_PATTERNS) {
    if (p.re.test(description)) return p.message;
  }
  return null;
}

/** Deterministic clarifications — never guess. */
export function detectClarifications(description, answered = {}) {
  const t = String(description || '').toLowerCase();
  const need = [];

  const mentionsLiq = /\b(liquidity|sweep|swept)\b/.test(t);
  const hasTarget =
    /previous\s*low|prev\s*low|eql|equal\s*low|previous\s*high|prev\s*high|eqh|equal\s*high/.test(t) ||
    answered.liquidityTarget;
  if (mentionsLiq && !hasTarget && !/\b(breakout|breakdown|structure|volume|rsi|ema)\b/.test(t)) {
    // bare "liquidity sweep setups" → clarify
    if (!/previous|equal|high|low/.test(t) || /^.{0,40}liquidity/.test(t)) {
      if (!answered.liquidityTarget) {
        need.push({
          id: 'liquidityTarget',
          prompt: 'Which liquidity should I watch?',
          options: [
            { id: 'PREVIOUS_LOW', label: 'Previous Low' },
            { id: 'PREVIOUS_HIGH', label: 'Previous High' },
            { id: 'EQUAL_LOW', label: 'Equal Low' },
            { id: 'EQUAL_HIGH', label: 'Equal High' },
            { id: 'BOTH', label: 'Both (any)' },
          ],
        });
      }
    }
  }

  const mentionsVol = /\b(volume\s*confirmation|volume\s*confirm|with\s*volume)\b/.test(t);
  const hasVolDetail =
    /1\.5|2\s*x|2x|above\s*average|relative|expansion|contraction/.test(t) || answered.volumeMode;
  if (mentionsVol && !hasVolDetail) {
    need.push({
      id: 'volumeMode',
      prompt: 'What volume condition should I use?',
      options: [
        { id: 'ABOVE_AVG', label: 'Above Average' },
        { id: 'RVOL_1_5', label: '1.5× Average' },
        { id: 'RVOL_2', label: '2× Average' },
        { id: 'EXPANSION', label: 'Volume Expansion' },
      ],
    });
  }

  const bareBuy =
    /\bbuy\s+after\s+liquidity\b/.test(t) ||
    (/^\s*(liquidity|sweep)\s*(setups?)?\s*$/i.test(String(description || '').trim()) &&
      !answered.liquidityTarget);
  if (bareBuy && !answered.liquidityTarget && !need.find((n) => n.id === 'liquidityTarget')) {
    need.push({
      id: 'liquidityTarget',
      prompt: 'Which liquidity event should I use?',
      options: [
        { id: 'PREVIOUS_LOW', label: 'Previous Low' },
        { id: 'PREVIOUS_HIGH', label: 'Previous High' },
        { id: 'EQUAL_LOW', label: 'Equal Low' },
        { id: 'EQUAL_HIGH', label: 'Equal High' },
      ],
    });
  }

  return need;
}

function normalizeTf(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  const map = {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '60m': '1h',
    '4h': '4h',
    '1d': '1D',
    d: '1D',
    daily: '1D',
  };
  return map[s] || null;
}

/**
 * Keyword / rule local parser — used offline and as LLM fallback sanitizer seed.
 */
export function localParseStrategy(description, answers = {}) {
  const t = description.toLowerCase();
  const conditions = [];
  const push = (c) => conditions.push(c);

  const tfFromContext = (fallback = '5m') => {
    if (/1\s*h|1h|hour/.test(t) && /15/.test(t) && /5/.test(t)) return fallback;
    if (/15\s*m|15m/.test(t)) return '15m';
    if (/5\s*m|5m/.test(t)) return '5m';
    if (/1\s*h|1h/.test(t)) return '1h';
    if (/1\s*d|daily/.test(t)) return '1D';
    return fallback;
  };

  const liqTarget =
    answers.liquidityTarget ||
    (/previous\s*low|prev\s*low/.test(t)
      ? 'PREVIOUS_LOW'
      : /previous\s*high|prev\s*high/.test(t)
        ? 'PREVIOUS_HIGH'
        : /equal\s*low|eql/.test(t)
          ? 'EQUAL_LOW'
          : /equal\s*high|eqh/.test(t)
            ? 'EQUAL_HIGH'
            : null);

  if (/liquidity|sweep|swept/.test(t)) {
    const liqTf = /15/.test(t) ? '15m' : tfFromContext('15m');
    const dir = /bear/.test(t) && !/bull/.test(t) ? 'BEARISH' : 'BULLISH';
    if (liqTarget === 'EQUAL_HIGH' || liqTarget === 'EQUAL_LOW') {
      push({
        type: liqTarget === 'EQUAL_HIGH' ? 'EQUAL_HIGHS' : 'EQUAL_LOWS',
        timeframe: liqTf,
      });
    } else {
      push({
        type: 'LIQUIDITY_SWEEP',
        timeframe: liqTf,
        direction: dir,
        target: liqTarget || 'PREVIOUS_LOW',
      });
    }
  }

  if (/structure\s*shift|mss|bos|structure\s*turns|structure\s*flip/.test(t)) {
    push({
      type: /bos|break\s*of\s*structure/.test(t) && !/shift/.test(t) ? 'BOS' : 'STRUCTURE_SHIFT',
      timeframe: /5\s*m|5m/.test(t) ? '5m' : tfFromContext('5m'),
      direction: /bear/.test(t) && !/bull/.test(t) ? 'BEARISH' : 'BULLISH',
    });
  }

  const volMode = answers.volumeMode;
  if (
    volMode === 'RVOL_1_5' ||
    volMode === 'RVOL_2' ||
    /1\.5|relative\s*volume|times\s*average|x\s*average|2\s*x|2x/.test(t)
  ) {
    const value = volMode === 'RVOL_2' || /2\s*x|2x/.test(t) ? 2 : 1.5;
    push({
      type: 'RELATIVE_VOLUME',
      timeframe: '5m',
      operator: '>=',
      value,
    });
  } else if (volMode === 'EXPANSION' || /volume\s*expansion|expanding\s*volume/.test(t)) {
    push({ type: 'VOLUME_EXPANSION', timeframe: tfFromContext('5m') });
  } else if (volMode === 'ABOVE_AVG' || /volume\s*above\s*average|above\s*average\s*volume/.test(t)) {
    push({ type: 'VOLUME_EXPANSION', timeframe: tfFromContext('5m') });
  }

  if (/breakout/.test(t)) push({ type: 'BREAKOUT', timeframe: tfFromContext('15m') });
  if (/breakdown/.test(t)) push({ type: 'BREAKDOWN', timeframe: tfFromContext('15m') });

  if (/1\s*h|1h|hour/.test(t) && /trend/.test(t)) {
    push({
      type: 'HTF_TREND',
      timeframe: '1h',
      direction: /bear/.test(t) && !/bull/.test(t) ? 'BEARISH' : 'BULLISH',
    });
  } else if (/htf|higher\s*timeframe/.test(t) && /bull|bear|trend/.test(t)) {
    push({
      type: 'HTF_TREND',
      timeframe: '1h',
      direction: /bear/.test(t) ? 'BEARISH' : 'BULLISH',
    });
  }

  if (/ema\s*align/.test(t)) {
    push({
      type: 'EMA_ALIGNMENT',
      timeframe: tfFromContext('15m'),
      direction: /bear/.test(t) ? 'BEARISH' : 'BULLISH',
    });
  }

  // "50 ema < 200 ema", "ema50 below ema200", "death cross", "golden cross"
  const emaCmp =
    /(\d+)\s*ema\s*(<|>|<=|>=|below|above|under|over)\s*(\d+)\s*ema/i.exec(t) ||
    /ema\s*(\d+)\s*(<|>|<=|>=|below|above|under|over)\s*ema\s*(\d+)/i.exec(t) ||
    /(\d+)\s*\/\s*(\d+)\s*ema/.exec(t);
  if (emaCmp || /death\s*cross|golden\s*cross|ema\s*cross/.test(t)) {
    let fast = 50;
    let slow = 200;
    let op = '<';
    if (emaCmp) {
      if (emaCmp[3] && /\d/.test(emaCmp[1]) && /<|>|below|above/.test(String(emaCmp[2] || ''))) {
        fast = Number(emaCmp[1]);
        slow = Number(emaCmp[3]);
        const rel = String(emaCmp[2]).toLowerCase();
        op = rel === '>' || rel === '>=' || rel === 'above' || rel === 'over' ? '>' : '<';
      } else if (emaCmp[1] && emaCmp[2] && !emaCmp[3]) {
        // 50/200 ema form from third regex — groups are fast/slow only
        fast = Number(emaCmp[1]);
        slow = Number(emaCmp[2]);
        op = /bull|golden|>/.test(t) ? '>' : '<';
      }
    }
    if (/golden\s*cross/.test(t)) {
      op = '>';
      fast = 50;
      slow = 200;
    }
    if (/death\s*cross/.test(t)) {
      op = '<';
      fast = 50;
      slow = 200;
    }
    if (fast > slow) {
      const tmp = fast;
      fast = slow;
      slow = tmp;
      op = op === '>' ? '<' : '>';
    }
    push({
      type: 'EMA_CROSS',
      timeframe: tfFromContext('1D'),
      direction: op === '>' ? 'BULLISH' : 'BEARISH',
      operator: op === '>' ? '>' : '<',
      value: fast,
      target: String(slow),
    });
  }

  if (/price\s*(above|over)\s*(the\s*)?ema|\babove\s*ema\b/.test(t) && !emaCmp) {
    push({ type: 'PRICE_ABOVE_EMA', timeframe: tfFromContext('15m'), value: 21 });
  }
  if (/price\s*(below|under)\s*(the\s*)?ema|\bbelow\s*ema\b/.test(t) && !emaCmp) {
    push({ type: 'PRICE_BELOW_EMA', timeframe: tfFromContext('15m'), value: 21 });
  }

  const logicOp = /\bor\b/.test(t) && !/\band\b/.test(t) ? 'OR' : 'AND';

  const tfsUsed = [...new Set(conditions.map((c) => c.timeframe))];
  const multi = tfsUsed.length > 1;
  const name = suggestName(conditions, description);

  return {
    clarity: conditions.length ? 'CLEAR' : 'NEEDS_CLARIFICATION',
    name,
    description: String(description).slice(0, 280),
    timeframeMode: multi ? 'MULTI' : 'SINGLE',
    timeframe: multi ? conditions.find((c) => c.type !== 'HTF_TREND')?.timeframe || '5m' : tfsUsed[0] || '5m',
    timeframes: multi
      ? {
          context: conditions.find((c) => c.type === 'HTF_TREND')?.timeframe || null,
          structure: conditions.find((c) => c.type === 'LIQUIDITY_SWEEP')?.timeframe || null,
          setup: conditions.find((c) => c.type === 'STRUCTURE_SHIFT' || c.type === 'BREAKOUT')?.timeframe || null,
          confirmation: null,
        }
      : {},
    logicOperator: logicOp,
    conditions,
  };
}

function suggestName(conditions, description) {
  if (/liquidity\s*reversal/i.test(description)) return 'Liquidity Reversal';
  if (conditions.some((c) => c.type === 'LIQUIDITY_SWEEP') && conditions.some((c) => c.type === 'STRUCTURE_SHIFT')) {
    return 'Liquidity Reversal';
  }
  if (conditions.some((c) => c.type === 'BREAKOUT')) return 'Breakout';
  if (conditions.some((c) => c.type === 'BREAKDOWN')) return 'Breakdown';
  if (conditions.some((c) => c.type === 'EMA_CROSS')) {
    const c = conditions.find((x) => x.type === 'EMA_CROSS');
    return c?.operator === '>' ? 'EMA Golden Stack' : 'EMA Death Stack';
  }
  if (conditions.some((c) => c.type === 'HTF_TREND')) return 'Multi-Timeframe Trend';
  return 'Taught Setup';
}

export function extractStrategyJson(text) {
  const raw = String(text || '');
  const fence = /```(?:strategy|json)?\s*([\s\S]*?)```/i.exec(raw);
  const blob = fence ? fence[1] : raw;
  const start = blob.indexOf('{');
  const end = blob.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(blob.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function sanitizeParsedStrategy(parsed) {
  const errors = [];
  const warnings = [];
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['Could not parse strategy JSON.'], warnings, strategy: null };
  }

  const conditionsIn = Array.isArray(parsed.conditions)
    ? parsed.conditions
    : Array.isArray(parsed.logic?.conditions)
      ? parsed.logic.conditions.filter((c) => c && c.type)
      : [];

  const conditions = [];
  for (const c of conditionsIn) {
    const type = String(c.type || '').toUpperCase();
    if (!ALLOWED_CONDITION_TYPES.includes(type)) {
      errors.push(`Unsupported condition: ${type || '?'}`);
      continue;
    }
    let timeframe = normalizeTf(c.timeframe) || '5m';
    if (!ALLOWED_TFS.includes(timeframe)) {
      errors.push(`Unsupported timeframe: ${c.timeframe}`);
      continue;
    }
    const next = { type, timeframe };
    if (c.direction) {
      const d = String(c.direction).toUpperCase();
      if (['BULLISH', 'BEARISH', 'ANY'].includes(d)) next.direction = d;
    }
    if (c.operator && ['>=', '<=', '>', '<', '=='].includes(c.operator)) next.operator = c.operator;
    if (typeof c.value === 'number' && Number.isFinite(c.value)) next.value = c.value;
    if (typeof c.target === 'string') next.target = c.target;
    if (type === 'RELATIVE_VOLUME' && next.value == null) {
      next.operator = '>=';
      next.value = 1.5;
    }
    conditions.push(next);
  }

  const htfBull = conditions.some((c) => c.type === 'HTF_TREND' && c.direction === 'BULLISH');
  const htfBear = conditions.some((c) => c.type === 'HTF_TREND' && c.direction === 'BEARISH');
  if (htfBull && htfBear) errors.push('Conflicting HTF trend conditions (bullish and bearish).');

  if (!conditions.length && !errors.length) errors.push('No supported conditions found.');

  const tfs = [...new Set(conditions.map((c) => c.timeframe))];
  const timeframeMode =
    parsed.timeframeMode === 'MULTI' || tfs.length > 1 ? 'MULTI' : 'SINGLE';
  const timeframe = normalizeTf(parsed.timeframe) || tfs[0] || '5m';

  const strategy = {
    name: String(parsed.name || 'Taught Setup').slice(0, 64),
    description: String(parsed.description || '').slice(0, 280),
    timeframeMode,
    timeframe,
    timeframes: parsed.timeframes && typeof parsed.timeframes === 'object' ? parsed.timeframes : {},
    logicOperator: parsed.logicOperator === 'OR' ? 'OR' : 'AND',
    conditions,
    clarity: errors.length ? 'PARTIALLY_CLEAR' : conditions.length ? 'CLEAR' : 'NEEDS_CLARIFICATION',
  };

  return {
    ok: errors.length === 0 && conditions.length > 0,
    errors,
    warnings,
    strategy,
  };
}

function buildSystemPrompt() {
  return [
    'You convert trading strategy descriptions into STRICT JSON for WOLF Strategy Lab.',
    'NEVER invent unsupported data (no order flow, smart money, institutional footprints).',
    'NEVER output code, SQL, or functions. JSON only inside one ```strategy fence.',
    `Allowed condition types: ${ALLOWED_CONDITION_TYPES.join(', ')}.`,
    `Allowed timeframes: ${ALLOWED_TFS.join(', ')}.`,
    'Schema:',
    '{',
    '  "name": string,',
    '  "description": string,',
    '  "timeframeMode": "SINGLE"|"MULTI",',
    '  "timeframe": "5m",',
    '  "timeframes": { "context"?, "structure"?, "setup"?, "confirmation"? },',
    '  "logicOperator": "AND"|"OR",',
    '  "conditions": [{ "type", "timeframe", "direction"?, "operator"?, "value"?, "target"? }],',
    '  "clarity": "CLEAR"|"PARTIALLY_CLEAR"|"NEEDS_CLARIFICATION",',
    '  "unsupportedReason": string|null',
    '}',
    'If the ask cannot be mapped, return conditions:[] and clarity NEEDS_CLARIFICATION or set unsupportedReason.',
  ].join('\n');
}

function buildUserPrompt(description, answers) {
  return [
    'User strategy description:',
    description,
    answers && Object.keys(answers).length
      ? `Clarification answers: ${JSON.stringify(answers)}`
      : '',
    'Respond with one ```strategy JSON block only.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function isGeminiApiKey(apiKey) {
  const k = String(apiKey || '').trim();
  return k.startsWith('AQ.') || k.startsWith('AIza') || /^AI[a-zA-Z0-9_-]{20,}$/.test(k);
}

function detectProvider(apiKey) {
  const k = String(apiKey || '').trim();
  if (isGeminiApiKey(k)) return 'gemini';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}

async function completeRaw(apiKey, system, user) {
  const provider = detectProvider(apiKey);
  if (!provider) throw Object.assign(new Error('No AI key'), { status: 503 });

  if (provider === 'gemini') {
    const gemini = new GoogleGenerativeAI(apiKey);
    const model = gemini.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: system,
      generationConfig: { temperature: 0.1, maxOutputTokens: 900 },
    });
    const result = await model.generateContent(user);
    return {
      text: String(result?.response?.text?.() ?? '').trim(),
      modelUsed: 'gemini-2.0-flash',
      source: 'gemini',
    };
  }

  const client =
    provider === 'openai'
      ? new OpenAI({ apiKey })
      : new OpenAI({
          baseURL: 'https://openrouter.ai/api/v1',
          apiKey,
          defaultHeaders: {
            'HTTP-Referer': 'https://wolftradeai.in',
            'X-Title': 'Wolf Trade AI - Strategy Lab',
          },
        });
  const completion = await client.chat.completions.create({
    model: provider === 'openai' ? 'gpt-4o-mini' : 'google/gemini-2.0-flash-001',
    temperature: 0.1,
    max_tokens: 900,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return {
    text: String(completion.choices?.[0]?.message?.content || '').trim(),
    modelUsed: completion.model,
    source: provider,
  };
}

/**
 * Full parse pipeline for HTTP handler.
 */
export async function parseStrategyDescription({ apiKey, description, answers = {}, preferLocal = false }) {
  const text = String(description || '').trim();
  if (!text) {
    return { ok: false, status: 400, error: 'description required' };
  }

  const unsupported = detectUnsupported(text);
  if (unsupported) {
    return {
      ok: false,
      status: 200,
      result: {
        ok: false,
        clarity: 'UNSUPPORTED',
        message: unsupported,
        clarifications: [],
        strategy: null,
        source: 'rules',
      },
    };
  }

  const clarifications = detectClarifications(text, answers);
  if (clarifications.length) {
    return {
      ok: true,
      status: 200,
      result: {
        ok: false,
        clarity: 'NEEDS_CLARIFICATION',
        message: 'I need a bit more detail before building this setup.',
        clarifications,
        strategy: null,
        source: 'rules',
      },
    };
  }

  // Local first (deterministic + tests); LLM refines when key available and not preferLocal
  const local = localParseStrategy(text, answers);
  if (preferLocal || !apiKey) {
    const sanitized = sanitizeParsedStrategy(local);
    if (!sanitized.ok) {
      return {
        ok: true,
        status: 200,
        result: {
          ok: false,
          clarity: 'NEEDS_CLARIFICATION',
          message:
            "I couldn't confidently translate that strategy into WOLF-supported conditions.",
          clarifications: [],
          strategy: null,
          errors: sanitized.errors,
          source: 'local',
        },
      };
    }
    return {
      ok: true,
      status: 200,
      result: {
        ok: true,
        clarity: sanitized.strategy.clarity,
        message: 'Strategy built.',
        clarifications: [],
        strategy: sanitized.strategy,
        source: 'local',
      },
    };
  }

  try {
    const { text: reply, modelUsed, source } = await completeRaw(
      apiKey,
      buildSystemPrompt(),
      buildUserPrompt(text, answers),
    );
    const extracted = extractStrategyJson(reply);
    if (extracted?.unsupportedReason) {
      return {
        ok: true,
        status: 200,
        result: {
          ok: false,
          clarity: 'UNSUPPORTED',
          message: String(extracted.unsupportedReason),
          clarifications: [],
          strategy: null,
          source,
          modelUsed,
        },
      };
    }
    let sanitized = sanitizeParsedStrategy(extracted);
    if (!sanitized.ok) {
      // fallback to local map if LLM failed schema
      sanitized = sanitizeParsedStrategy(local);
    }
    if (!sanitized.ok) {
      return {
        ok: true,
        status: 200,
        result: {
          ok: false,
          clarity: 'NEEDS_CLARIFICATION',
          message:
            "I couldn't confidently translate that strategy into WOLF-supported conditions.",
          clarifications: [],
          strategy: null,
          errors: sanitized.errors,
          source,
          modelUsed,
        },
      };
    }
    return {
      ok: true,
      status: 200,
      result: {
        ok: true,
        clarity: sanitized.strategy.clarity || 'CLEAR',
        message: 'Strategy built.',
        clarifications: [],
        strategy: sanitized.strategy,
        source,
        modelUsed,
      },
    };
  } catch (err) {
    const sanitized = sanitizeParsedStrategy(local);
    if (sanitized.ok) {
      return {
        ok: true,
        status: 200,
        result: {
          ok: true,
          clarity: sanitized.strategy.clarity,
          message: 'Strategy built (local parse — AI unavailable).',
          clarifications: [],
          strategy: sanitized.strategy,
          source: 'local',
          warning: err instanceof Error ? err.message : 'AI unavailable',
        },
      };
    }
    throw err;
  }
}
