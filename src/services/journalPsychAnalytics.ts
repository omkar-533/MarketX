import type { TradeRecord } from '../types/journal';

export type EmotionBucket = { emotion: string; count: number; pnl: number };
export type PsychGauge = { key: string; label: string; value: number; hint: string };
export type ConfidenceBucket = { label: string; winRate: number; trades: number; avgPnl: number };
export type PsychTrendPoint = { label: string; confidence: number; discipline: number; fearGreed: number; pnl: number };

const EMOTION_ORDER = [
  'Calm',
  'Confident',
  'Focused',
  'Anxious',
  'Fearful',
  'Greedy',
  'Frustrated',
  'Overtrading',
];

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

export function buildPsychologyAnalytics(trades: TradeRecord[]) {
  const scored = trades.filter(
    (t) =>
      typeof t.confidence === 'number' ||
      typeof t.discipline === 'number' ||
      typeof t.fearGreed === 'number' ||
      Boolean(t.beforeEmotion) ||
      Boolean(t.afterEmotion),
  );

  const confidence = avg(scored.map((t) => t.confidence).filter((n): n is number => typeof n === 'number'));
  const discipline = avg(scored.map((t) => t.discipline).filter((n): n is number => typeof n === 'number'));
  const fearGreed = avg(scored.map((t) => t.fearGreed).filter((n): n is number => typeof n === 'number'));

  const gauges: PsychGauge[] = [
    { key: 'confidence', label: 'Confidence', value: confidence || 0, hint: 'Self-belief at entry' },
    { key: 'discipline', label: 'Discipline', value: discipline || 0, hint: 'Rule adherence' },
    { key: 'fearGreed', label: 'Fear / Greed', value: fearGreed || 0, hint: 'Lower is calmer' },
  ];

  const beforeMap = new Map<string, EmotionBucket>();
  const afterMap = new Map<string, EmotionBucket>();
  scored.forEach((t) => {
    if (t.beforeEmotion) {
      const cur = beforeMap.get(t.beforeEmotion) ?? { emotion: t.beforeEmotion, count: 0, pnl: 0 };
      cur.count += 1;
      cur.pnl += t.pnl;
      beforeMap.set(t.beforeEmotion, cur);
    }
    if (t.afterEmotion) {
      const cur = afterMap.get(t.afterEmotion) ?? { emotion: t.afterEmotion, count: 0, pnl: 0 };
      cur.count += 1;
      cur.pnl += t.pnl;
      afterMap.set(t.afterEmotion, cur);
    }
  });

  const sortEmotions = (map: Map<string, EmotionBucket>) =>
    EMOTION_ORDER.map((e) => map.get(e)).filter(Boolean) as EmotionBucket[];

  const beforeEmotions = sortEmotions(beforeMap);
  const afterEmotions = sortEmotions(afterMap);

  const buckets: ConfidenceBucket[] = [
    { label: 'Low', winRate: 0, trades: 0, avgPnl: 0 },
    { label: 'Mid', winRate: 0, trades: 0, avgPnl: 0 },
    { label: 'High', winRate: 0, trades: 0, avgPnl: 0 },
  ];
  const bucketTrades: TradeRecord[][] = [[], [], []];
  scored.forEach((t) => {
    const c = typeof t.confidence === 'number' ? t.confidence : 50;
    const idx = c < 45 ? 0 : c < 70 ? 1 : 2;
    bucketTrades[idx].push(t);
  });
  bucketTrades.forEach((list, i) => {
    buckets[i].trades = list.length;
    if (!list.length) return;
    buckets[i].winRate = Math.round((list.filter((t) => t.pnl > 0).length / list.length) * 100);
    buckets[i].avgPnl = Math.round((list.reduce((s, t) => s + t.pnl, 0) / list.length) * 100) / 100;
  });

  const sorted = [...scored].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const recent = sorted.slice(-8);
  const trend: PsychTrendPoint[] = recent.map((t, i) => ({
    label: recent.length <= 4
      ? new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      : `T${i + 1}`,
    confidence: t.confidence ?? 0,
    discipline: t.discipline ?? 0,
    fearGreed: t.fearGreed ?? 0,
    pnl: t.pnl,
  }));

  const mindScore = Math.round(
    (confidence * 0.35 + discipline * 0.45 + Math.max(0, 100 - fearGreed) * 0.2) || 0,
  );

  return {
    scoredCount: scored.length,
    gauges,
    beforeEmotions,
    afterEmotions,
    buckets,
    trend,
    mindScore,
    confidence: confidence || 0,
    discipline: discipline || 0,
    fearGreed: fearGreed || 0,
  };
}
