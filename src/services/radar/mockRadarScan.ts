/**
 * DEMO SCAN RESULTS — structured opportunities for UI development.
 * Explanations are tied to these fields (not free-form LLM invention).
 */
import type {
  MarketPulseItem,
  RadarResult,
  RadarScanRequest,
  ScoreBreakdown,
} from './radarTypes';

function breakdown(partial: Partial<ScoreBreakdown>): ScoreBreakdown {
  const b: ScoreBreakdown = {
    structure: partial.structure ?? 0,
    liquidity: partial.liquidity ?? 0,
    volume: partial.volume ?? 0,
    momentum: partial.momentum ?? 0,
    htfAlignment: partial.htfAlignment ?? 0,
    volatility: partial.volatility ?? 0,
    setupQuality: partial.setupQuality ?? 0,
  };
  return b;
}

function total(b: ScoreBreakdown) {
  return (
    b.structure +
    b.liquidity +
    b.volume +
    b.momentum +
    b.htfAlignment +
    b.volatility +
    b.setupQuality
  );
}

export function getDemoMarketPulse(): MarketPulseItem[] {
  return [
    { symbol: 'NIFTY', direction: 'bullish', strength: 82, trendState: 'Uptrend' },
    { symbol: 'BANKNIFTY', direction: 'neutral', strength: 54, trendState: 'Range' },
    { symbol: 'FINNIFTY', direction: 'bullish', strength: 76, trendState: 'Recovery' },
  ];
}

export function buildDemoRadarResults(req: RadarScanRequest): RadarResult[] {
  const tf = req.timeframe;
  const now = Date.now();

  const rows: Omit<RadarResult, 'id' | 'score' | 'detectedAt' | 'dataMode' | 'timeframe'>[] = [
    {
      symbol: 'RELIANCE',
      exchange: 'NSE',
      price: 2894.5,
      setupType: 'Liquidity Sweep',
      direction: 'bullish',
      scoreBreakdown: breakdown({
        structure: 20,
        liquidity: 19,
        volume: 14,
        momentum: 14,
        htfAlignment: 15,
        volatility: 4,
        setupQuality: 8,
      }),
      status: 'CONFIRMATION PENDING',
      confirmations: ['Liquidity Sweep', 'Structure Shift', 'Volume Expansion', 'HTF Alignment'],
      structure: 'BULLISH',
      liquidity: 'SWEPT',
      volume: 'EXPANDING',
      momentum: 'STRONG',
      htfAlignment: true,
      keyLevels: [
        { label: 'Sweep low', price: 2878.2 },
        { label: 'Reclaim', price: 2888.0 },
        { label: 'Invalidation', price: 2872.5 },
      ],
      invalidation: 'Close back below swept low 2872.5 on the scan timeframe.',
      explanation:
        'Price swept the previous 5-minute low and reclaimed the structure. Volume expanded during the recovery and the higher timeframe remains aligned.',
    },
    {
      symbol: 'SBIN',
      exchange: 'NSE',
      price: 812.3,
      setupType: 'Breakout',
      direction: 'bullish',
      scoreBreakdown: breakdown({
        structure: 18,
        liquidity: 14,
        volume: 15,
        momentum: 14,
        htfAlignment: 15,
        volatility: 5,
        setupQuality: 10,
      }),
      status: 'WATCH',
      confirmations: ['Breakout', 'Volume Expansion', 'Trend Alignment'],
      structure: 'BULLISH',
      liquidity: 'CLEAR ABOVE',
      volume: 'EXPANDING',
      momentum: 'RISING',
      htfAlignment: true,
      keyLevels: [
        { label: 'Breakout', price: 808.0 },
        { label: 'Invalidation', price: 802.5 },
      ],
      invalidation: 'Failed hold below breakout level 802.5.',
      explanation:
        'SBIN cleared a clean range high with expanding volume. Higher timeframe bias stays supportive — confirmation still needs a hold above the breakout.',
    },
    {
      symbol: 'TATAMOTORS',
      exchange: 'NSE',
      price: 978.4,
      setupType: 'Reversal',
      direction: 'bullish',
      scoreBreakdown: breakdown({
        structure: 16,
        liquidity: 18,
        volume: 12,
        momentum: 12,
        htfAlignment: 12,
        volatility: 4,
        setupQuality: 13,
      }),
      status: 'WATCH',
      confirmations: ['Reversal', 'Liquidity Sweep'],
      structure: 'SHIFTING BULLISH',
      liquidity: 'SWEPT',
      volume: 'NORMAL',
      momentum: 'IMPROVING',
      htfAlignment: false,
      keyLevels: [
        { label: 'Sweep', price: 968.0 },
        { label: 'Invalidation', price: 964.5 },
      ],
      invalidation: 'Loss of the reclaim zone under 964.5.',
      explanation:
        'A liquidity sweep into prior lows produced a reclaim. Momentum is improving, but HTF alignment is not fully confirmed — treat as watch, not chase.',
    },
    {
      symbol: 'HDFCBANK',
      exchange: 'NSE',
      price: 1688.2,
      setupType: 'Structure Shift',
      direction: 'bullish',
      scoreBreakdown: breakdown({
        structure: 19,
        liquidity: 12,
        volume: 13,
        momentum: 13,
        htfAlignment: 14,
        volatility: 4,
        setupQuality: 9,
      }),
      status: 'SETUP DEVELOPING',
      confirmations: ['Structure Shift', 'Volume Expansion'],
      structure: 'BULLISH SHIFT',
      liquidity: 'NEAR EQUAL LOWS',
      volume: 'EXPANDING',
      momentum: 'BUILDING',
      htfAlignment: true,
      keyLevels: [
        { label: 'Shift', price: 1679.0 },
        { label: 'Invalidation', price: 1672.0 },
      ],
      invalidation: 'Break and hold below 1672.0 cancels the shift.',
      explanation:
        'Structure shifted after a higher-low sequence. Volume is expanding into the move; still developing — wait for confirmation, not early entry.',
    },
    {
      symbol: 'INFY',
      exchange: 'NSE',
      price: 1842.6,
      setupType: 'Trend Continuation',
      direction: 'bearish',
      scoreBreakdown: breakdown({
        structure: 17,
        liquidity: 13,
        volume: 12,
        momentum: 14,
        htfAlignment: 15,
        volatility: 3,
        setupQuality: 8,
      }),
      status: 'WATCH',
      confirmations: ['Trend Continuation', 'HTF Alignment'],
      structure: 'BEARISH',
      liquidity: 'BELOW SWING',
      volume: 'MODERATE',
      momentum: 'SOFT',
      htfAlignment: true,
      keyLevels: [
        { label: 'Supply', price: 1856.0 },
        { label: 'Invalidation', price: 1864.0 },
      ],
      invalidation: 'Reclaim and hold above 1864.0 invalidates the continuation bias.',
      explanation:
        'INFY remains under HTF supply with soft momentum. Continuation setup only if price rejects the supply zone again — not a forced short.',
    },
  ];

  return rows
    .map((r, i) => ({
      ...r,
      id: `demo-${r.symbol}-${tf}-${i}`,
      timeframe: tf,
      score: total(r.scoreBreakdown),
      detectedAt: now - i * 40_000,
      dataMode: 'DEMO' as const,
    }))
    .sort((a, b) => b.score - a.score);
}
