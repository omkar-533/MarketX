export type StrategyOutlook = 'bullish' | 'bearish' | 'neutral' | 'volatile';

export interface StrategyLegDisplay {
  action: 'BUY' | 'SELL';
  type: 'CE' | 'PE';
  strike: string;
}

export interface StrategyVisual {
  id: string;
  name: string;
  outlook: StrategyOutlook;
  outlookLabel: string;
  description: string;
  /** Payoff curve points: [spot%, pnl] — 0 = breakeven line */
  payoffPoints: [number, number][];
  legsDisplay: StrategyLegDisplay[];
  atmX?: number;
}

export const STRATEGY_VISUALS: StrategyVisual[] = [
  {
    id: 'long-call',
    name: 'Long Call',
    outlook: 'bullish',
    outlookLabel: 'Bullish',
    description: 'Unlimited upside, limited risk',
    payoffPoints: [[0, -8], [48, -8], [52, -8], [100, 28]],
    atmX: 50,
    legsDisplay: [{ action: 'BUY', type: 'CE', strike: 'ATM' }],
  },
  {
    id: 'long-put',
    name: 'Long Put',
    outlook: 'bearish',
    outlookLabel: 'Bearish',
    description: 'Profit when market falls',
    payoffPoints: [[0, 28], [48, -8], [52, -8], [100, -8]],
    atmX: 50,
    legsDisplay: [{ action: 'BUY', type: 'PE', strike: 'ATM' }],
  },
  {
    id: 'bull-call-spread',
    name: 'Bull Call Spread',
    outlook: 'bullish',
    outlookLabel: 'Bullish',
    description: 'Capped profit, lower cost',
    payoffPoints: [[0, -6], [40, -6], [55, 8], [70, 18], [100, 18]],
    atmX: 50,
    legsDisplay: [
      { action: 'BUY', type: 'CE', strike: 'ATM' },
      { action: 'SELL', type: 'CE', strike: 'OTM+1' },
    ],
  },
  {
    id: 'bear-put-spread',
    name: 'Bear Put Spread',
    outlook: 'bearish',
    outlookLabel: 'Bearish',
    description: 'Bearish with defined risk',
    payoffPoints: [[0, 18], [30, 18], [45, 8], [60, -6], [100, -6]],
    atmX: 50,
    legsDisplay: [
      { action: 'BUY', type: 'PE', strike: 'ATM' },
      { action: 'SELL', type: 'PE', strike: 'OTM-1' },
    ],
  },
  {
    id: 'long-straddle',
    name: 'Long Straddle',
    outlook: 'volatile',
    outlookLabel: 'High Vol',
    description: 'Big move either direction',
    payoffPoints: [[0, 22], [42, -12], [58, -12], [100, 22]],
    atmX: 50,
    legsDisplay: [
      { action: 'BUY', type: 'CE', strike: 'ATM' },
      { action: 'BUY', type: 'PE', strike: 'ATM' },
    ],
  },
  {
    id: 'short-straddle',
    name: 'Short Straddle',
    outlook: 'neutral',
    outlookLabel: 'Neutral',
    description: 'Profit in range-bound market',
    payoffPoints: [[0, -18], [42, 12], [58, 12], [100, -18]],
    atmX: 50,
    legsDisplay: [
      { action: 'SELL', type: 'CE', strike: 'ATM' },
      { action: 'SELL', type: 'PE', strike: 'ATM' },
    ],
  },
  {
    id: 'long-strangle',
    name: 'Long Strangle',
    outlook: 'volatile',
    outlookLabel: 'High Vol',
    description: 'Cheaper than straddle',
    payoffPoints: [[0, 18], [35, -8], [65, -8], [100, 18]],
    atmX: 50,
    legsDisplay: [
      { action: 'BUY', type: 'CE', strike: 'OTM+1' },
      { action: 'BUY', type: 'PE', strike: 'OTM-1' },
    ],
  },
  {
    id: 'iron-condor',
    name: 'Iron Condor',
    outlook: 'neutral',
    outlookLabel: 'Neutral',
    description: 'Range-bound income strategy',
    payoffPoints: [[0, -4], [25, -4], [35, 14], [65, 14], [75, -4], [100, -4]],
    atmX: 50,
    legsDisplay: [
      { action: 'BUY', type: 'PE', strike: 'OTM-2' },
      { action: 'SELL', type: 'PE', strike: 'OTM-1' },
      { action: 'SELL', type: 'CE', strike: 'OTM+1' },
      { action: 'BUY', type: 'CE', strike: 'OTM+2' },
    ],
  },
  {
    id: 'butterfly',
    name: 'Butterfly Spread',
    outlook: 'neutral',
    outlookLabel: 'Neutral',
    description: 'Peak profit at middle strike',
    payoffPoints: [[0, -4], [30, -4], [50, 20], [70, -4], [100, -4]],
    atmX: 50,
    legsDisplay: [
      { action: 'BUY', type: 'CE', strike: 'OTM-1' },
      { action: 'SELL', type: 'CE', strike: 'ATM ×2' },
      { action: 'BUY', type: 'CE', strike: 'OTM+1' },
    ],
  },
  {
    id: 'calendar',
    name: 'Calendar Spread',
    outlook: 'neutral',
    outlookLabel: 'Theta',
    description: 'Sell near, buy far expiry',
    payoffPoints: [[0, 2], [35, 8], [50, 14], [65, 8], [100, 2]],
    atmX: 50,
    legsDisplay: [
      { action: 'SELL', type: 'CE', strike: 'ATM · Near' },
      { action: 'BUY', type: 'CE', strike: 'ATM · Far' },
    ],
  },
  {
    id: 'iron-fly',
    name: 'Iron Fly',
    outlook: 'neutral',
    outlookLabel: 'Neutral',
    description: 'Tighter range than iron condor',
    payoffPoints: [[0, -6], [38, -6], [50, 16], [62, -6], [100, -6]],
    atmX: 50,
    legsDisplay: [
      { action: 'BUY', type: 'PE', strike: 'OTM-1' },
      { action: 'SELL', type: 'PE', strike: 'ATM' },
      { action: 'SELL', type: 'CE', strike: 'ATM' },
      { action: 'BUY', type: 'CE', strike: 'OTM+1' },
    ],
  },
  {
    id: 'ratio-spread',
    name: 'Ratio Spread',
    outlook: 'bullish',
    outlookLabel: 'Bullish',
    description: '1 long, 2 short OTM calls',
    payoffPoints: [[0, -6], [45, -6], [55, 10], [72, 6], [100, -12]],
    atmX: 50,
    legsDisplay: [
      { action: 'BUY', type: 'CE', strike: 'ATM' },
      { action: 'SELL', type: 'CE', strike: 'OTM+1 ×2' },
    ],
  },
];

export function getStrategyVisual(name: string): StrategyVisual | undefined {
  return STRATEGY_VISUALS.find((s) => s.name === name);
}

export const OUTLOOK_COLORS: Record<StrategyOutlook, { bg: string; text: string; border: string }> = {
  bullish: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  bearish: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  neutral: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  volatile: { bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30' },
};
