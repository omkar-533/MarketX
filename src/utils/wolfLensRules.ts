/**
 * Per-lens analytical priorities shared by client vision prompts.
 * Must stay semantically aligned with server/masterAi/analysisStrategies.mjs MODE_PROMPTS.
 */

import type { WolfAnalysisMode } from '../constants/wolfAnalysisModes';

export const LENS_ANALYSIS_RULES: Record<WolfAnalysisMode, string> = {
  auto: `AUTO: Pick THE market story (max 1–3 factors). Do not dump every concept.`,

  smc: `SMC ONLY vocabulary when visually defensible:
Prioritize: external/internal liquidity → equal H/L → sweep → displacement → BOS/CHoCH → OB/FVG → premium/discount → inducement.
Story shape: sweep → displacement → structure shift → retracement → POI → entry condition.
FORBIDDEN as primary: generic "trend is bullish" without SMC chain.
wolfevidence types MUST be mostly: liquidity|sweep|bos|choch|order_block|fvg|entry|invalidation|target.`,

  price_action: `PRICE ACTION ONLY — DO NOT force SMC (no OB/FVG/EQH/EQL unless user asked SMC).
Prioritize: swing structure, trend, rejection candles, breakouts, retests, S/R reaction, consolidation, momentum, failed breakouts, continuation/reversal patterns.
Allowed conclusion: "Breakout lacks confirmation" even if another lens would call it liquidity.
wolfevidence types MUST be mostly: structure|breakout|support|resistance|confirmation|entry|invalidation|target.`,

  liquidity: `LIQUIDITY LENS — answer WHERE IS LIQUIDITY? WHAT WAS TAKEN? WHAT REMAINS?
Prioritize: equal highs/lows, previous H/L, clustered stops, swing pools, sweep, reclaim, next liquidity objective.
Do NOT turn this into generic trend commentary.
wolfevidence types MUST be mostly: liquidity|sweep|target|structure|invalidation.`,

  support_resistance: `SUPPORT / RESISTANCE LENS.
Prioritize: horizontal levels, repeated reactions, rejection, breakout, retest, role reversal.
Do NOT generate OB/FVG/CHoCH labels for this lens.
wolfevidence types MUST be mostly: support|resistance|breakout|confirmation|entry|invalidation|target.`,

  mbp: `MBP METHODOLOGY (strict order):
1 Context → 2 Liquidity → 3 Structure → 4 Price Action → 5 Confirmation → 6 Entry → 7 Invalidation → 8 Target → 9 R:R if readable.
Each pillar needs: detection rule, confirmation rule, invalidation rule.
Any critical pillar fail → WAIT / NO TRADE. Never soft-pass incomplete MBP setups.
Annotations must tag confirmed vs pending pillars.`,

  market_structure: `MARKET STRUCTURE: HH/HL/LH/LL, BOS, CHOCH — require close+displacement; never call every wick a BOS.`,
  breakout: `BREAKOUT: LEVEL → APPROACH → BREAK → CLOSE → FOLLOW-THROUGH → RETEST. Classify valid|weak|false|pending.`,
  reversal: `REVERSAL: prefer sweep → rejection → displacement → shift → retest. Default WAIT without confirmation.`,
  supply_demand: `SUPPLY/DEMAND: impulse–base–departure; freshness; do not label every base as S/D.`,
  ict: `ICT: MSS/CHOCH, sweeps, displacement, FVG, premium/discount only if range readable.`,
  fibonacci: `FIBONACCI: only with clear swing anchors + confluence. Do not force fibs.`,
  momentum: `MOMENTUM: compression→expansion, displacement quality, continuation vs exhaustion.`,
  trend: `TREND: HH/HL or LH/LL; healthy pullback vs reversal. WAIT in chop.`,
  custom: `CUSTOM: honor user focus under safety rules; still fill locked template + wolfevidence.`,
};

export function lensRulesFor(mode: WolfAnalysisMode | string): string {
  const id = String(mode || 'auto') as WolfAnalysisMode;
  return LENS_ANALYSIS_RULES[id] || LENS_ANALYSIS_RULES.auto;
}
