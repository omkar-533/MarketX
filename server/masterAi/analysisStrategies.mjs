/**
 * Wolf AI Analysis Strategy Engine — modular prompts per setup mode.
 * Deterministic scoring lives later; LLM reasons only within selected framework.
 */

export const ANALYSIS_MODE_IDS = [
  'auto',
  'support_resistance',
  'liquidity',
  'market_structure',
  'breakout',
  'reversal',
  'supply_demand',
  'price_action',
  'smc',
  'ict',
  'fibonacci',
  'momentum',
  'trend',
  'mbp',
  'custom',
];

export function normalizeAnalysisMode(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, '_');
  const aliases = {
    sr: 'support_resistance',
    support: 'support_resistance',
    resistance: 'support_resistance',
    'support_resistance': 'support_resistance',
    liq: 'liquidity',
    structure: 'market_structure',
    marketstructure: 'market_structure',
    bo: 'breakout',
    'break_out': 'breakout',
    rev: 'reversal',
    sd: 'supply_demand',
    supplydemand: 'supply_demand',
    pa: 'price_action',
    priceaction: 'price_action',
    fib: 'fibonacci',
    mom: 'momentum',
    trd: 'trend',
  };
  const mapped = aliases[v] || v;
  return ANALYSIS_MODE_IDS.includes(mapped) ? mapped : 'auto';
}

/** Shared hallucination + safety rules for every setup mode. */
export const BASE_SETUP_RULES = `WOLF AI — VISUAL SETUP INTELLIGENCE (not a chatbot, not a signal broker).
Ground analysis in: (1) visual evidence on THIS image (2) selected strategy rules (3) stated assumptions.
NEVER invent prices, candles, volume, timeframe, or live LTP. Use null / "unclear" when not readable.
Distinguish OBSERVED vs INFERRED. Prefer conditional language: potential / if confirmed / waiting.
Allowed outcomes: LONG BIAS | SHORT BIAS | WAIT | NO TRADE. Never "guaranteed" / "sure-shot" / "buy now".
Exact Entry / SL / Target prices ONLY when the price scale is clearly readable; otherwise describe logic (e.g. "below visible swing low") without fabricating numbers.
If chart quality is poor (cropped, blurry, no candles/scale): say Chart quality insufficient + what to re-upload — do NOT hallucinate a full setup.
Educational / informational only — not financial advice.`;

export const RESPONSE_TEMPLATE = `LOCKED RESPONSE TEMPLATE (use these headings exactly — short bullets, visual-first COPILOT):

WOLF AI · <MODE NAME> ANALYSIS

Market Bias: LONG BIAS | SHORT BIAS | WAIT | NO TRADE
Setup: <one-line setup name>
Setup Status: CONFIRMED | WAITING FOR CONFIRMATION | DEVELOPING | INVALIDATED | NO TRADE
Key Observation: <1 line from visible chart>
Potential Direction: LONG | SHORT | NONE
Next Action: <ONE thing to watch now — e.g. "Bullish BOS above this level" / "Wait for retest" / "No trade">
Entry Condition: <conditional — not "buy now">
Stop Loss Logic: <logic, exact price only if readable>
Target Logic: <T1/T2 only if evidence; else qualitative>
Invalidation: <what kills the idea>
Evidence Score: <0–100> / 100 (Setup Quality — NOT win probability)
Why:
1. …
2. …
3. …
Assumptions / Unknown: <explicit>

Hard rules: under ~100 words before fences. No essays. Always fill Next Action with ONE short watch item (≤7 words).
UI order: Status → Chart → Next Action. Max 3 evidence items in wolfevidence. Never end without Next Action.
After the template:
1) Append ONE \`\`\`wolfchart\`\`\` when prices are readable.
2) Append ONE \`\`\`wolfevidence\`\`\` JSON array (or { "evidence": [...] }) with 3–6 findings.
Each evidence item MUST include normalized bbox 0–1:
{"id":"liq_1","type":"liquidity","title":"Liquidity Found","description":"…","bbox":{"x":0.4,"y":0.5,"width":0.2,"height":0.16},"confidence":"high"}
Types: liquidity|sweep|structure|bos|choch|support|resistance|entry|invalidation|target|confirmation.
bbox must cover the visible chart region for that finding (not the full image unless necessary). Never invent prices; if scale unreadable still return visual bboxes for structure/liquidity regions you can see.`;

const MODE_PROMPTS = {
  support_resistance: `STRATEGY: SUPPORT / RESISTANCE ONLY.
Detect swing highs/lows, repeated reactions, rejection, break/retest, role reversal, strong vs weak zones.
Do NOT force SMC/liquidity vocabulary unless clearly visible and necessary for the zone.
Entry is conditional (e.g. long only if resistance breaks + retest). Prefer WAIT if retest/confirmation missing.`,

  liquidity: `STRATEGY: LIQUIDITY ONLY.
Detect PDH/PDL/equal highs/lows, BSL/SSL, sweeps, failed breaks, displacement after sweep, structure shift after sweep.
Flow: liquidity identified → taken? → displacement? → structure confirmation? → potential setup.
If sweep without confirmation → WAIT FOR CONFIRMATION. Never auto-trade every wick.`,

  market_structure: `STRATEGY: MARKET STRUCTURE ONLY.
Detect HH/HL/LH/LL, BOS, CHOCH/MSS, range, expansion/contraction. Bias: bullish | bearish | neutral | transition.
Structure from visible swings only. Entry only after clear structural event; otherwise WAIT.`,

  breakout: `STRATEGY: BREAKOUT / BREAKDOWN.
Detect consolidation, range edges, breakout candle, displacement, retest, false/failed breakout.
Status: Breakout valid | developing | false-break risk | no breakout. Prefer break + retest confirmation.`,

  reversal: `STRATEGY: REVERSAL.
Require exhaustion + rejection and/or liquidity sweep + structure shift. Never treat a single wick as confirmed reversal.
Default to WAIT without confirmation.`,

  supply_demand: `STRATEGY: SUPPLY / DEMAND.
Detect impulse–base–departure, fresh vs tested vs broken zones, proximal/distal only if reliable.
Label Demand/Supply + freshness. Entry conditional on reaction at fresh zone.`,

  price_action: `STRATEGY: PRICE ACTION (in context).
Rejection, engulfing, pin, inside bar, displacement, compression/expansion — always relative to nearby levels/structure.
Do not name candles alone as the trade.`,

  smc: `STRATEGY: SMC.
Market structure, liquidity, BOS/CHOCH, FVG, Order Block, breaker, mitigation. Every concept needs short evidence.
No concept → do not invent OB/FVG.`,

  ict: `STRATEGY: ICT-style.
MSS/CHOCH, liquidity sweeps, displacement, FVG, premium/discount only if range is readable. Evidence required per concept.`,

  fibonacci: `STRATEGY: FIBONACCI.
Only if swing anchors are clearly visible. Prefer confluence with S/R or structure. Do not invent fib ratios without anchors.`,

  momentum: `STRATEGY: MOMENTUM.
Compression → expansion, displacement quality, continuation vs exhaustion. Avoid forcing direction in dead chop.`,

  trend: `STRATEGY: TREND.
Higher highs/lows or lower highs/lows, trendline interactions if visible. Pullback vs break of trend. WAIT in unclear chops.`,

  mbp: `STRATEGY: MBP v1 (proprietary configurable framework).
Evaluate in order: Market Context → Liquidity → Structure → Price Action → Confirmation → Entry → SL → Target → RR → Invalidation.
If any critical pillar fails → WAIT or NO TRADE. Do not soft-pass incomplete MBP setups.`,

  auto: `STRATEGY: AUTO CONFLUENCE.
Mentally score Structure, Liquidity, S/R, Price Action, Trend (each bullish/bearish/neutral from visible evidence).
Aligned → directional bias. Conflict or thin evidence → NO CLEAR SETUP / WAIT / NO TRADE. Never manufacture a trade.`,

  custom: `STRATEGY: CUSTOM — follow the user's written instructions only, still under BASE safety rules and RESPONSE TEMPLATE.
If instructions conflict with hallucination rules, refuse the unsafe part and say why.`,
};

export function getStrategyPrompt(mode) {
  const id = normalizeAnalysisMode(mode);
  const body = MODE_PROMPTS[id] || MODE_PROMPTS.auto;
  const name = id.replace(/_/g, ' ').toUpperCase();
  return `${BASE_SETUP_RULES}

SELECTED MODE: ${name}
${body}

${RESPONSE_TEMPLATE.replace('<MODE NAME>', name)}`;
}

/** Vision system append for screenshot path. */
export function getChartSetupVisionPrompt(mode) {
  return `CHART SCREENSHOT SETUP MODE — Wolf AI Visual Trading Intelligence.
${getStrategyPrompt(mode)}
Read ONLY this screenshot. Extract what you can (symbol, timeframe, trend, swings, levels) — use null when unsure.
Then run ONLY the selected strategy framework and fill the locked RESPONSE TEMPLATE.`;
}

export function analysisModeDisplayName(mode) {
  return normalizeAnalysisMode(mode).replace(/_/g, ' ').toUpperCase();
}
