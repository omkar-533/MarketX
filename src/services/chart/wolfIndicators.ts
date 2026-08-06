/**
 * Native Wolf proprietary indicator engines for Terminal charts.
 * CMS invite-link products map onto these so Wolf tab can plot without Unlock.
 */

import type { ChartBar } from '../../types/chart';
import { atr, ema, rsi, sma } from './chartIndicators';

export type WolfNativePreset = {
  id: string;
  label: string;
  /** Match Admin → Indicators titles */
  match: RegExp;
};

/** Built-in plottable Wolf packs (extend as more Pine ports land). */
export const WOLF_NATIVE_PRESETS: WolfNativePreset[] = [
  { id: 'wolf_cfd', label: 'Wolf Confluence Desk', match: /confluence|cfd|wolf\s*cfd/i },
  { id: 'wolf_ribbon', label: 'Wolf Trend Ribbon', match: /ribbon|trend\s*stack|ema\s*stack/i },
  { id: 'wolf_pulse', label: 'Wolf Momentum Pulse', match: /momentum|pulse|rsi\s*pulse/i },
  { id: 'wolf_pressure', label: 'Wolf Volume Pressure', match: /volume\s*pressure|participation|vol\s*flow/i },
  { id: 'wolf_levels', label: 'Wolf Structure Levels', match: /structure|levels|pivot/i },
];

export function isWolfStudyId(id: string): boolean {
  return id.startsWith('wolf_');
}

/** Map a CMS / favourites wolf indicator to a native study id. */
export function wolfStudyIdFor(item: { id: string; title: string }): string {
  const title = String(item.title || '');
  for (const preset of WOLF_NATIVE_PRESETS) {
    if (preset.match.test(title)) return preset.id;
  }
  // Stable per CMS row so toggles persist
  const slug = String(item.id || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return `wolf_${slug || 'pack'}`;
}

export function wolfStudyLabel(id: string): string {
  const known = WOLF_NATIVE_PRESETS.find((p) => p.id === id);
  if (known) return known.label;
  const remembered = readStudyLabels()[id];
  if (remembered) return remembered;
  return id
    .replace(/^wolf_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STUDY_LABELS_KEY = 'wolf.terminal.study.labels';

function readStudyLabels(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STUDY_LABELS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Persist CMS / UI titles so chart legend shows the real Wolf indicator name. */
export function rememberWolfStudyTitle(id: string, title: string): void {
  const clean = String(title || '').trim();
  if (!id || !clean) return;
  try {
    const next = { ...readStudyLabels(), [id]: clean };
    localStorage.setItem(STUDY_LABELS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function wolfStudyBlurb(id: string): string {
  const recipe = resolveWolfRecipe(id);
  switch (recipe) {
    case 'cfd':
      return 'Confluence score + EMA 21 / 55 / 200 stack';
    case 'ribbon':
      return 'Trend ribbon — EMA 20 / 50 / 100 / 200';
    case 'pulse':
      return 'Momentum pulse — RSI with signal line';
    case 'pressure':
      return 'Volume pressure histogram vs average participation';
    case 'levels':
      return 'Swing structure highs & lows';
    default:
      return 'Wolf proprietary pack';
  }
}

export type WolfConfluenceResult = {
  emaFast: number[];
  emaMid: number[];
  emaSlow: number[];
  bullScore: number[];
  bearScore: number[];
  lean: number[]; // 1 bull, -1 bear, 0 balanced
};

/** Port of indicators/wolf-confluence-desk.pine (score context, overlay EMAs). */
export function computeWolfConfluence(bars: ChartBar[]): WolfConfluenceResult {
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume || 0);
  const emaFast = ema(closes, 21);
  const emaMid = ema(closes, 55);
  const emaSlow = ema(closes, 200);
  const rsiVals = rsi(closes, 14);
  const atrVals = atr(bars, 14);
  const atrSma = sma(atrVals, 14);
  const volSma = sma(volumes, 20);

  let lastPh = NaN;
  let lastPl = NaN;
  const bullScore: number[] = [];
  const bearScore: number[] = [];
  const lean: number[] = [];

  for (let i = 0; i < bars.length; i += 1) {
    if (i >= 3 && i + 3 < bars.length) {
      const mid = i - 3;
      let isPh = true;
      let isPl = true;
      for (let j = mid - 3; j <= mid + 3; j += 1) {
        if (j === mid || j < 0 || j >= bars.length) continue;
        if (bars[j].high >= bars[mid].high) isPh = false;
        if (bars[j].low <= bars[mid].low) isPl = false;
      }
      if (isPh) lastPh = bars[mid].high;
      if (isPl) lastPl = bars[mid].low;
    }

    const c = closes[i];
    const bullTrend = emaFast[i] > emaMid[i] && emaMid[i] > emaSlow[i] && c > emaFast[i];
    const bearTrend = emaFast[i] < emaMid[i] && emaMid[i] < emaSlow[i] && c < emaFast[i];
    const bullPull = c > emaMid[i] && c < emaFast[i] && emaFast[i] > emaMid[i];
    const bearPull = c < emaMid[i] && c > emaFast[i] && emaFast[i] < emaMid[i];
    const bullMom =
      rsiVals[i] > 45 && rsiVals[i] < 68 && (i === 0 || rsiVals[i] > rsiVals[i - 1]);
    const bearMom =
      rsiVals[i] < 55 && rsiVals[i] > 32 && (i === 0 || rsiVals[i] < rsiVals[i - 1]);
    const volx = atrVals[i] > atrSma[i] * 1;
    const part = volumes[i] > volSma[i];
    const bullStruct =
      Number.isFinite(lastPl) && c > lastPl && (!Number.isFinite(lastPh) || c >= lastPh * 0.998);
    const bearStruct =
      Number.isFinite(lastPh) && c < lastPh && (!Number.isFinite(lastPl) || c <= lastPl * 1.002);

    const bScore =
      (bullTrend ? 1 : 0) +
      (bullMom ? 1 : 0) +
      (volx ? 1 : 0) +
      (part ? 1 : 0) +
      (bullPull || bullStruct ? 1 : 0);
    const sScore =
      (bearTrend ? 1 : 0) +
      (bearMom ? 1 : 0) +
      (volx ? 1 : 0) +
      (part ? 1 : 0) +
      (bearPull || bearStruct ? 1 : 0);

    bullScore.push(bScore);
    bearScore.push(sScore);
    const bullBias = bScore >= 4 && bScore > sScore;
    const bearBias = sScore >= 4 && sScore > bScore;
    lean.push(bullBias ? 1 : bearBias ? -1 : 0);
  }

  return { emaFast, emaMid, emaSlow, bullScore, bearScore, lean };
}

export function computeWolfRibbon(bars: ChartBar[]) {
  const closes = bars.map((b) => b.close);
  return {
    e20: ema(closes, 20),
    e50: ema(closes, 50),
    e100: ema(closes, 100),
    e200: ema(closes, 200),
  };
}

export function computeWolfPulse(bars: ChartBar[]) {
  const closes = bars.map((b) => b.close);
  const r = rsi(closes, 14);
  const signal = ema(r, 9);
  return { rsi: r, signal };
}

export function computeWolfPressure(bars: ChartBar[]) {
  const vol = bars.map((b) => b.volume || 0);
  const avg = sma(vol, 20);
  const pressure = vol.map((v, i) => {
    const base = avg[i] || 1;
    const dir = i > 0 && bars[i].close >= bars[i - 1].close ? 1 : -1;
    return dir * (v / base);
  });
  return { pressure, avg };
}

export function computeWolfLevels(bars: ChartBar[]) {
  const swingHigh: number[] = [];
  const swingLow: number[] = [];
  let lastH = bars[0]?.high ?? 0;
  let lastL = bars[0]?.low ?? 0;
  for (let i = 0; i < bars.length; i += 1) {
    if (i >= 2 && i + 2 < bars.length) {
      const h = bars[i].high;
      const l = bars[i].low;
      if (h >= bars[i - 1].high && h >= bars[i - 2].high && h >= bars[i + 1].high && h >= bars[i + 2].high) {
        lastH = h;
      }
      if (l <= bars[i - 1].low && l <= bars[i - 2].low && l <= bars[i + 1].low && l <= bars[i + 2].low) {
        lastL = l;
      }
    }
    swingHigh.push(lastH);
    swingLow.push(lastL);
  }
  return { swingHigh, swingLow };
}

/** Resolve recipe for any wolf_* id (known presets or default ribbon). */
export function resolveWolfRecipe(id: string): 'cfd' | 'ribbon' | 'pulse' | 'pressure' | 'levels' {
  if (id === 'wolf_cfd' || id.includes('confluence') || id.includes('cfd')) return 'cfd';
  if (id === 'wolf_pulse' || id.includes('pulse') || id.includes('momentum')) return 'pulse';
  if (id === 'wolf_pressure' || id.includes('pressure') || id.includes('volume')) return 'pressure';
  if (id === 'wolf_levels' || id.includes('structure') || id.includes('level')) return 'levels';
  if (id === 'wolf_ribbon' || id.includes('ribbon')) return 'ribbon';
  // Unknown CMS rows still plot a useful ribbon pack
  return 'ribbon';
}
