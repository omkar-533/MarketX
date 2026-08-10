import type { RadarAnalyzeContext, RadarResult } from './radarTypes';

const PENDING_KEY = 'wolf_radar_pending_analyze_v1';
export const RADAR_ANALYZE_EVENT = 'wolf-radar-analyze';
export const RADAR_OPEN_EVENT = 'wolf-radar-open';

export type WolfAiDeskTab = 'analyst' | 'radar' | 'setups' | 'watchlist';

export function resultToAnalyzeContext(result: RadarResult): RadarAnalyzeContext {
  return {
    symbol: result.symbol,
    timeframe: result.timeframe,
    setup: result.setupType,
    score: result.score,
    structure: result.structure,
    liquidity: result.liquidity,
    volume: result.volume,
    momentum: result.momentum,
    htfAlignment: result.htfAlignment,
    keyLevels: result.keyLevels,
    invalidation: result.invalidation,
    explanation: result.explanation,
    status: result.status,
    scanTimestamp: result.detectedAt,
    source: 'WOLF_RADAR',
    dataMode: 'DEMO',
  };
}

export function setPendingRadarAnalyze(result: RadarResult) {
  const ctx = resultToAnalyzeContext(result);
  localStorage.setItem(PENDING_KEY, JSON.stringify(ctx));
  window.dispatchEvent(new CustomEvent(RADAR_ANALYZE_EVENT, { detail: ctx }));
}

export function consumePendingRadarAnalyze(): RadarAnalyzeContext | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw) as RadarAnalyzeContext;
  } catch {
    localStorage.removeItem(PENDING_KEY);
    return null;
  }
}

export function formatRadarContextMessage(ctx: RadarAnalyzeContext): string {
  const levels = ctx.keyLevels.map((l) => `${l.label} ${l.price}`).join(' · ');
  return [
    `WOLF RADAR context loaded for ${ctx.symbol} (${ctx.timeframe}).`,
    `Setup: ${ctx.setup} · Direction lean: ${ctx.structure} · WOLF SCORE ${ctx.score}/100 (setup quality, not profit probability).`,
    `Liquidity: ${ctx.liquidity} · Volume: ${ctx.volume} · Momentum: ${ctx.momentum} · HTF alignment: ${ctx.htfAlignment ? 'YES' : 'NO'}.`,
    `Status: ${ctx.status}.`,
    `Why Wolf is watching: ${ctx.explanation}`,
    levels ? `Key levels: ${levels}.` : '',
    `Invalidation: ${ctx.invalidation}`,
    `Data mode: ${ctx.dataMode} (simulated scan — not live licensed feed).`,
    'Ask me what is missing, what invalidates this, or how to manage risk.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function requestOpenRadar() {
  window.dispatchEvent(new CustomEvent(RADAR_OPEN_EVENT));
}
