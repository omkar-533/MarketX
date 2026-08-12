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

function normalizeDescription(raw) {
  let t = String(raw || '');
  // Timeframe slang
  t = t.replace(/\b(\d+)\s*(?:mnt|min(?:ute)?s?|mins)\b/gi, '$1m');
  t = t.replace(/\b(\d+)\s*(?:hr|hrs|hour|hours)\b/gi, '$1h');
  t = t.replace(/\bdaily\b/gi, '1D');
  t = t.replace(/\bintraday\b/gi, '5m');
  // EMA / SMA shorthand
  t = t.replace(/\bema[\s_-]*(\d+)\b/gi, '$1 ema');
  t = t.replace(/\bsma[\s_-]*(\d+)\b/gi, '$1 ema');
  t = t.replace(/\bma[\s_-]*(\d+)\b/gi, '$1 ema');
  // Cross / direction slang (EN + Hinglish)
  t = t.replace(/\bcrossover\b/gi, 'cross');
  t = t.replace(/\bcros\b/gi, 'cross');
  t = t.replace(/\bcut\s*(above|below|upar|neeche)\b/gi, 'cross $1');
  t = t.replace(/\bupar\b/gi, 'above');
  t = t.replace(/\bneeche\b/gi, 'below');
  t = t.replace(/\bteji|bull\b/gi, 'bullish');
  t = t.replace(/\bmandi|bear\b/gi, 'bearish');
  t = t.replace(/\bzyada\s*volume|high\s*vol\b/gi, 'volume expansion');
  t = t.replace(/\bkam\s*volume|low\s*vol\b/gi, 'volume contraction');
  t = t.replace(/\btod\s*(diya|dena|na)|break\s*out\b/gi, 'breakout');
  t = t.replace(/\bgir\s*(gaya|na)|break\s*down\b/gi, 'breakdown');
  t = t.replace(/\bgolden\s*crossover\b/gi, 'golden cross');
  t = t.replace(/\bdeath\s*crossover\b/gi, 'death cross');
  return t.replace(/\s+/g, ' ').trim();
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
    '5mnt': '5m',
    '15mnt': '15m',
  };
  return map[s] || null;
}

/**
 * Keyword / rule local parser — used offline and as LLM fallback sanitizer seed.
 */
export function localParseStrategy(description, answers = {}) {
  const t = normalizeDescription(description).toLowerCase();
  const conditions = [];
  const push = (c) => {
    if (!conditions.some((x) => x.type === c.type && x.timeframe === c.timeframe && x.value === c.value && x.operator === c.operator)) {
      conditions.push(c);
    }
  };

  const tfFromContext = (fallback = '5m') => {
    if (/1\s*h|1h|hour/.test(t) && /15/.test(t) && /5/.test(t)) return fallback;
    if (/15\s*(?:m(?:in(?:ute)?s?|nt)?|m)\b|15m/.test(t)) return '15m';
    if (/5\s*(?:m(?:in(?:ute)?s?|nt)?|m)\b|5m/.test(t)) return '5m';
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
  // Also: "200 ema cross above" / "price cross above 200 ema" → price vs EMA
  const singleEmaA = /(\d+)\s*ema\s*(?:cross(?:es|ing)?\s*)?(above|below|over|under)\b/i.exec(t);
  const singleEmaB =
    /(?:cross(?:es|ing)?|price)\s*(above|below|over|under)\s*(?:the\s*)?(\d+)\s*ema/i.exec(t);
  const singleEmaCross = singleEmaA || singleEmaB;
  const emaCmp =
    /(\d+)\s*ema\s*(<|>|<=|>=|below|above|under|over)\s*(\d+)\s*ema/i.exec(t) ||
    /ema\s*(\d+)\s*(<|>|<=|>=|below|above|under|over)\s*ema\s*(\d+)/i.exec(t) ||
    /(\d+)\s*\/\s*(\d+)\s*ema/.exec(t);

  if (singleEmaCross && !emaCmp && !/death\s*cross|golden\s*cross/.test(t)) {
    const period = Number(singleEmaA ? singleEmaA[1] : singleEmaB[2]);
    const rel = String(singleEmaA ? singleEmaA[2] : singleEmaB[1]).toLowerCase();
    const above = rel === 'above' || rel === 'over';
    push({
      type: above ? 'PRICE_ABOVE_EMA' : 'PRICE_BELOW_EMA',
      timeframe: tfFromContext('5m'),
      value: Number.isFinite(period) && period > 0 ? period : 200,
    });
  } else if (emaCmp || /death\s*cross|golden\s*cross|ema\s*cross/.test(t)) {
    let fast = 50;
    let slow = 200;
    // Default bullish when user says "cross above" / golden; only bearish for death/below
    let op =
      /death\s*cross|cross\s*below|below|under/.test(t) && !/cross\s*above|above|over|golden|bull/.test(t)
        ? '<'
        : /cross\s*above|above|over|golden|bull/.test(t)
          ? '>'
          : '<';
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
        op = /bull|golden|>|above|over|cross\s*above/.test(t) ? '>' : '<';
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

  if (/price\s*(above|over)\s*(the\s*)?ema|\babove\s*ema\b/.test(t) && !emaCmp && !singleEmaCross) {
    push({ type: 'PRICE_ABOVE_EMA', timeframe: tfFromContext('15m'), value: 21 });
  }
  if (/price\s*(below|under)\s*(the\s*)?ema|\bbelow\s*ema\b/.test(t) && !emaCmp && !singleEmaCross) {
    push({ type: 'PRICE_BELOW_EMA', timeframe: tfFromContext('15m'), value: 21 });
  }

  // RSI
  const rsiAbove = /rsi\s*(?:is\s*)?(?:>|>=|above|over)\s*(\d{1,3})/i.exec(t) || /rsi\s*(\d{1,3})\s*(?:plus|\+)/i.exec(t);
  const rsiBelow = /rsi\s*(?:is\s*)?(?:<|<=|below|under)\s*(\d{1,3})/i.exec(t);
  if (rsiAbove) {
    push({
      type: 'RSI_ABOVE',
      timeframe: tfFromContext('15m'),
      operator: '>=',
      value: Number(rsiAbove[1]) || 60,
    });
  } else if (rsiBelow) {
    push({
      type: 'RSI_BELOW',
      timeframe: tfFromContext('15m'),
      operator: '<=',
      value: Number(rsiBelow[1]) || 40,
    });
  } else if (/\brsi\b/.test(t) && /oversold|neeche|weak/.test(t)) {
    push({ type: 'RSI_BELOW', timeframe: tfFromContext('15m'), operator: '<=', value: 30 });
  } else if (/\brsi\b/.test(t) && /overbought|upar|strong/.test(t)) {
    push({ type: 'RSI_ABOVE', timeframe: tfFromContext('15m'), operator: '>=', value: 70 });
  }

  // Structure swings
  if (/\bhigher\s*high|\bhh\b/.test(t)) push({ type: 'HH', timeframe: tfFromContext('15m') });
  if (/\bhigher\s*low|\bhl\b/.test(t)) push({ type: 'HL', timeframe: tfFromContext('15m') });
  if (/\blower\s*high|\blh\b/.test(t)) push({ type: 'LH', timeframe: tfFromContext('15m') });
  if (/\blower\s*low|\bll\b/.test(t)) push({ type: 'LL', timeframe: tfFromContext('15m') });

  if (/trend\s*continuation|continuation\s*trade|with\s*trend/.test(t)) {
    push({
      type: 'TREND_CONTINUATION',
      timeframe: tfFromContext('15m'),
      direction: /bear/.test(t) && !/bull/.test(t) ? 'BEARISH' : 'BULLISH',
    });
  }
  if (/\breversal\b|ululta|mean\s*reversion/.test(t)) {
    push({
      type: 'REVERSAL',
      timeframe: tfFromContext('15m'),
      direction: /bear/.test(t) && !/bull/.test(t) ? 'BEARISH' : 'BULLISH',
    });
  }

  if (/volume\s*contraction|dry\s*up|shrinking\s*volume/.test(t)) {
    push({ type: 'VOLUME_CONTRACTION', timeframe: tfFromContext('5m') });
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
  if (conditions.some((c) => c.type === 'PRICE_ABOVE_EMA')) {
    const c = conditions.find((x) => x.type === 'PRICE_ABOVE_EMA');
    return c?.value ? `Price Above EMA ${c.value}` : 'Price Above EMA';
  }
  if (conditions.some((c) => c.type === 'PRICE_BELOW_EMA')) {
    const c = conditions.find((x) => x.type === 'PRICE_BELOW_EMA');
    return c?.value ? `Price Below EMA ${c.value}` : 'Price Below EMA';
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
    'You are WOLF Strategy Lab parser. Convert ANY trader prompt (English, Hinglish, typos, slang) into STRICT strategy JSON.',
    'Understand intent first — fix spelling mentally (mnt=minute, cros=cross, upar=above, neeche=below, teji=bullish, mandi=bearish).',
    'NEVER invent unsupported data (no order flow, smart money, institutional footprints, news, dark pool).',
    'NEVER output code, SQL, or prose. JSON only inside one ```strategy fence.',
    `Allowed condition types ONLY: ${ALLOWED_CONDITION_TYPES.join(', ')}.`,
    `Allowed timeframes ONLY: ${ALLOWED_TFS.join(', ')}.`,
    '',
    'Mapping rules:',
    '- "200 ema cross above / price above 200 ema / 200 ema upar" → PRICE_ABOVE_EMA value=200 (NOT death cross).',
    '- "200 ema cross below / neeche" → PRICE_BELOW_EMA value=200.',
    '- "50 ema above 200 ema / golden cross / 50>200" → EMA_CROSS operator=">" value=50 target="200" direction=BULLISH.',
    '- "50 ema below 200 / death cross" → EMA_CROSS operator="<" value=50 target="200" direction=BEARISH.',
    '- "rsi above 60 / rsi>60" → RSI_ABOVE; "rsi below 40" → RSI_BELOW.',
    '- "volume expansion / zyada volume / high volume" → VOLUME_EXPANSION; "1.5x / 2x volume" → RELATIVE_VOLUME.',
    '- "liquidity sweep prev low" → LIQUIDITY_SWEEP target PREVIOUS_LOW; structure shift/MSS → STRUCTURE_SHIFT; BOS → BOS.',
    '- "breakout / range todna" → BREAKOUT; "breakdown" → BREAKDOWN.',
    '- "1h trend bullish" → HTF_TREND timeframe 1h direction BULLISH.',
    '- "5 mnt / 5 min / 5m" → timeframe 5m. Multi TFs → timeframeMode MULTI + timeframes object.',
    '- Prefer AND unless user clearly says OR.',
    '- Name should match intent (e.g. Price Above EMA 200), never mislabel golden as death.',
    '- If something cannot map to allowed types, omit it; keep other valid conditions. Only empty conditions if nothing maps.',
    '',
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
  ].join('\n');
}

function buildUserPrompt(description, answers) {
  const normalized = normalizeDescription(description);
  return [
    'Trader prompt (raw):',
    description,
    normalized !== description ? `Normalized hint: ${normalized}` : '',
    answers && Object.keys(answers).length
      ? `Clarification answers: ${JSON.stringify(answers)}`
      : '',
    'Map every understandable piece into allowed conditions. Respond with one ```strategy JSON block only.',
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
  const text = normalizeDescription(description);
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
            "I couldn't confidently translate that strategy into WOLF-supported conditions. Try naming timeframe + indicator clearly (e.g. \"200 ema cross above on 5m\").",
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
    // Prefer richer valid LLM result; if weak/empty, fall back to local
    const localSanitized = sanitizeParsedStrategy(local);
    if (
      (!sanitized.ok || !sanitized.strategy?.conditions?.length) &&
      localSanitized.ok &&
      localSanitized.strategy?.conditions?.length
    ) {
      sanitized = localSanitized;
    } else if (
      sanitized.ok &&
      localSanitized.ok &&
      (localSanitized.strategy.conditions?.length || 0) > (sanitized.strategy.conditions?.length || 0)
    ) {
      // Keep LLM name/desc if present, but merge missing local conditions by preferring longer local when LLM under-mapped
      sanitized = localSanitized;
    }
    if (!sanitized.ok) {
      sanitized = localSanitized;
    }
    if (!sanitized.ok) {
      return {
        ok: true,
        status: 200,
        result: {
          ok: false,
          clarity: 'NEEDS_CLARIFICATION',
          message:
            "I couldn't confidently translate that strategy into WOLF-supported conditions. Add timeframe + clear rules (EMA/RSI/sweep/breakout).",
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
          clarity: sanitized.strategy.clarity || 'CLEAR',
          message: 'Strategy built (local fallback).',
          clarifications: [],
          strategy: sanitized.strategy,
          source: 'local-fallback',
          warning: err instanceof Error ? err.message : 'AI unavailable',
        },
      };
    }
    return {
      ok: false,
      status: err?.status || 503,
      error: err instanceof Error ? err.message : 'Strategy parse failed',
    };
  }
}
