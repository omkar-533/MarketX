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
  {
    id: 'wolf_clusters_vp',
    label: 'Clusters Volume Profile',
    match: /clusters?\s*volume\s*profile|volume\s*profile.*cluster|cluster.*volume\s*profile/i,
  },
  { id: 'wolf_ribbon', label: 'Wolf Trend Ribbon', match: /ribbon|trend\s*stack|ema\s*stack/i },
  { id: 'wolf_pulse', label: 'Wolf Momentum Pulse', match: /momentum|pulse|rsi\s*pulse/i },
  { id: 'wolf_pressure', label: 'Wolf Volume Pressure', match: /volume\s*pressure|participation|vol\s*flow/i },
  { id: 'wolf_levels', label: 'Wolf Structure Levels', match: /structure|levels|pivot/i },
];

export function isWolfStudyId(id: string): boolean {
  return id.startsWith('wolf_');
}

/** Map a CMS / favourites wolf indicator to a native study id. */
export function wolfStudyIdFor(item: {
  id: string;
  title: string;
  hasPine?: boolean;
  pineSource?: string;
}): string {
  const cmsId = String(item.id || '').trim();
  const hasPine =
    item.hasPine === true || Boolean(String(item.pineSource || '').trim());
  // Any CMS row with Pine must run the pasted script (not title-mapped packs).
  if (cmsId && hasPine) return `wolf_cms_${cmsId}`;

  const title = String(item.title || '');
  for (const preset of WOLF_NATIVE_PRESETS) {
    if (preset.match.test(title)) return preset.id;
  }
  if (cmsId) return `wolf_cms_${cmsId}`;
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return `wolf_${slug || 'pack'}`;
}

/** Extract CMS indicator id from a pine-backed study id. */
export function wolfCmsIdFromStudy(studyId: string): string | null {
  const m = /^wolf_cms_(.+)$/i.exec(String(studyId || '').trim());
  return m?.[1] || null;
}

export function isNativeWolfPresetId(id: string): boolean {
  return WOLF_NATIVE_PRESETS.some((p) => p.id === id);
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
    case 'clusters':
      return 'K-means clusters volume profile — POC levels + membership dots';
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

const CLUSTER_PALETTE = [
  '#2196f3',
  '#f44336',
  '#4caf50',
  '#ff9800',
  '#9c27b0',
  '#00bcd4',
  '#ffeb3b',
  '#e91e63',
  '#795548',
  '#607d8b',
];

export type WolfClustersVpCluster = {
  id: number;
  color: string;
  poc: number;
  min: number;
  max: number;
  totalVol: number;
  pocVol: number;
};

export type WolfClustersVpResult = {
  /** Length = bars.length; -1 outside lookback window */
  assignments: number[];
  clusters: WolfClustersVpCluster[];
};

/**
 * Port of indicators/clusters-volume-profile.pine — k-means price clusters + per-cluster POC.
 * Terminal plots POC lines + membership; full VP boxes remain in the Pine Script for TV.
 */
export function computeWolfClustersVp(
  bars: ChartBar[],
  opts?: { lookback?: number; k?: number; iters?: number; rows?: number },
): WolfClustersVpResult {
  const lookback = Math.min(Math.max(opts?.lookback ?? 200, 10), bars.length);
  const k = Math.min(Math.max(opts?.k ?? 5, 2), 10);
  const iterations = Math.min(Math.max(opts?.iters ?? 50, 5), 50);
  const rows = Math.min(Math.max(opts?.rows ?? 20, 2), 80);
  const n = bars.length;
  const assignmentsOut = Array.from({ length: n }, () => -1);
  if (lookback < 10 || n < 10) return { assignments: assignmentsOut, clusters: [] };

  const start = n - lookback;
  const prices: number[] = [];
  const volumes: number[] = [];
  let minP = Infinity;
  let maxP = -Infinity;
  for (let i = 0; i < lookback; i += 1) {
    const bar = bars[start + i];
    const p = (bar.high + bar.low) / 2;
    const v = bar.volume || 0;
    prices.push(p);
    volumes.push(v);
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
  }
  if (!(maxP > minP)) {
    maxP = minP + 1e-6;
  }

  const centroids = Array.from({ length: k }, (_, j) => minP + ((j + 1) * (maxP - minP)) / (k + 1));
  const assignments = Array.from({ length: lookback }, () => 0);

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < lookback; i += 1) {
      let best = 0;
      let bestDist = Infinity;
      const p = prices[i];
      for (let j = 0; j < k; j += 1) {
        const dist = Math.abs(p - centroids[j]);
        if (dist < bestDist) {
          bestDist = dist;
          best = j;
        }
      }
      assignments[i] = best;
    }
    const sumPv = Array.from({ length: k }, () => 0);
    const sumV = Array.from({ length: k }, () => 0);
    for (let i = 0; i < lookback; i += 1) {
      const c = assignments[i];
      sumPv[c] += prices[i] * volumes[i];
      sumV[c] += volumes[i];
    }
    for (let j = 0; j < k; j += 1) {
      if (sumV[j] > 0) centroids[j] = sumPv[j] / sumV[j];
    }
  }

  for (let i = 0; i < lookback; i += 1) {
    assignmentsOut[start + i] = assignments[i];
  }

  const mintick = Math.max((maxP - minP) / 10_000, 1e-8);
  const clusters: WolfClustersVpCluster[] = [];

  for (let cId = 0; cId < k; cId += 1) {
    const cHighs: number[] = [];
    const cLows: number[] = [];
    const cVols: number[] = [];
    let cMin = Infinity;
    let cMax = -Infinity;
    let totalVol = 0;
    for (let i = 0; i < lookback; i += 1) {
      if (assignments[i] !== cId) continue;
      const bar = bars[start + i];
      cHighs.push(bar.high);
      cLows.push(bar.low);
      cVols.push(volumes[i]);
      cMin = Math.min(cMin, bar.low);
      cMax = Math.max(cMax, bar.high);
      totalVol += volumes[i];
    }
    if (!cHighs.length || !(cMax > cMin)) continue;

    const binSize = Math.max((cMax - cMin) / rows, mintick);
    const binVols = Array.from({ length: rows }, () => 0);
    for (let i = 0; i < cHighs.length; i += 1) {
      const bH = cHighs[i];
      const bL = cLows[i];
      const bV = cVols[i];
      const wickRange = Math.max(bH - bL, mintick);
      for (let b = 0; b < rows; b += 1) {
        const binB = cMin + b * binSize;
        const binT = binB + binSize;
        const intersectL = Math.max(bL, binB);
        const intersectH = Math.min(bH, binT);
        if (intersectH > intersectL) {
          binVols[b] += bV * ((intersectH - intersectL) / wickRange);
        }
      }
    }
    let maxBinVol = 0;
    let pocIdx = 0;
    for (let b = 0; b < rows; b += 1) {
      if (binVols[b] > maxBinVol) {
        maxBinVol = binVols[b];
        pocIdx = b;
      }
    }
    const pocBottom = cMin + pocIdx * binSize;
    const poc = pocBottom + binSize / 2;
    clusters.push({
      id: cId,
      color: CLUSTER_PALETTE[cId % CLUSTER_PALETTE.length],
      poc,
      min: cMin,
      max: cMax,
      totalVol,
      pocVol: maxBinVol,
    });
  }

  clusters.sort((a, b) => a.poc - b.poc);
  return { assignments: assignmentsOut, clusters };
}

/** Resolve recipe for any wolf_* id (known presets or default ribbon). */
export function resolveWolfRecipe(
  id: string,
): 'cfd' | 'clusters' | 'ribbon' | 'pulse' | 'pressure' | 'levels' | 'pine' {
  const key = id.toLowerCase();
  // Custom Terminal→Wolf CMS rows run through the Pine engine (exact source, server-side).
  if (key.startsWith('wolf_cms_') || Boolean(wolfCmsIdFromStudy(id))) return 'pine';
  if (id === 'wolf_cfd' || key.includes('confluence') || key.includes('cfd')) return 'cfd';
  if (
    id === 'wolf_clusters_vp' ||
    key.includes('cluster') ||
    key.includes('volume_profile') ||
    key.includes('volume-profile') ||
    /volume.?profile/.test(key)
  ) {
    return 'clusters';
  }
  if (id === 'wolf_pulse' || key.includes('pulse') || key.includes('momentum')) return 'pulse';
  if (id === 'wolf_pressure' || key.includes('pressure') || key.includes('vol_flow') || key.includes('participation')) {
    return 'pressure';
  }
  if (id === 'wolf_levels' || key.includes('structure') || key.includes('level')) return 'levels';
  if (id === 'wolf_ribbon' || key.includes('ribbon')) return 'ribbon';
  // Unknown slug rows still plot a useful ribbon pack
  return 'ribbon';
}
