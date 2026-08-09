/**
 * Central Wolf desk action registry.
 * Every rendered control must reference a registered action — no dead/decorative buttons.
 */

export type WolfActionId =
  | 'SHOW_ON_CHART'
  | 'WHY'
  | 'WHAT_IF'
  | 'EXPLAIN_MORE'
  | 'CHALLENGE'
  | 'REPLAY'
  | 'ASK_WOLF'
  | 'FOLLOW_WOLF'
  | 'DRAW'
  | 'CHART_ZOOM_IN'
  | 'CHART_ZOOM_OUT'
  | 'CHART_RESET'
  | 'CHART_FULLSCREEN';

export type WolfActionUiState =
  | 'default'
  | 'hover'
  | 'active'
  | 'loading'
  | 'success'
  | 'error'
  | 'disabled';

export type WolfActionDef = {
  id: WolfActionId;
  label: string;
  shortLabel?: string;
  category: 'wolf' | 'ai' | 'chart' | 'more';
  purpose: string;
};

export const WOLF_ACTIONS: Record<WolfActionId, WolfActionDef> = {
  SHOW_ON_CHART: {
    id: 'SHOW_ON_CHART',
    label: '📍 Show on chart',
    shortLabel: '📍 SHOW ON CHART',
    category: 'ai',
    purpose: 'Focus and highlight what Wolf is referring to on the chart',
  },
  WHY: {
    id: 'WHY',
    label: 'Why?',
    shortLabel: 'WHY?',
    category: 'ai',
    purpose: 'Walk evidence visually, one sentence at a time',
  },
  WHAT_IF: {
    id: 'WHAT_IF',
    label: '🔮 What if this fails?',
    shortLabel: '🔮 WHAT IF THIS FAILS?',
    category: 'ai',
    purpose: 'Compare primary-holds vs primary-fails scenarios on the chart',
  },
  EXPLAIN_MORE: {
    id: 'EXPLAIN_MORE',
    label: '🔎 Explain more',
    shortLabel: '🔎 EXPLAIN MORE',
    category: 'more',
    purpose: 'Open a deeper explanation overlay without growing the main panel',
  },
  CHALLENGE: {
    id: 'CHALLENGE',
    label: '⚔️ Challenge this setup',
    shortLabel: '⚔️ CHALLENGE THIS SETUP',
    category: 'more',
    purpose: 'Surface the strongest evidence against the current thesis',
  },
  REPLAY: {
    id: 'REPLAY',
    label: '▶ Replay the move',
    shortLabel: '▶ REPLAY THE MOVE',
    category: 'more',
    purpose: 'Highlight the liquidity → sweep → reclaim → BOS sequence',
  },
  ASK_WOLF: {
    id: 'ASK_WOLF',
    label: '💬 Ask Wolf',
    shortLabel: '💬 ASK WOLF',
    category: 'more',
    purpose: 'Focus the Ask input (and mic when available)',
  },
  FOLLOW_WOLF: {
    id: 'FOLLOW_WOLF',
    label: '👁 Follow Wolf',
    shortLabel: '👁 FOLLOW WOLF',
    category: 'wolf',
    purpose: 'Let Wolf drive chart pan/zoom while explaining',
  },
  DRAW: {
    id: 'DRAW',
    label: '✏ Draw',
    shortLabel: '✏ DRAW',
    category: 'wolf',
    purpose: 'Open drawing tools over the chart',
  },
  CHART_ZOOM_IN: {
    id: 'CHART_ZOOM_IN',
    label: '+',
    category: 'chart',
    purpose: 'Zoom in',
  },
  CHART_ZOOM_OUT: {
    id: 'CHART_ZOOM_OUT',
    label: '−',
    category: 'chart',
    purpose: 'Zoom out',
  },
  CHART_RESET: {
    id: 'CHART_RESET',
    label: 'RESET',
    category: 'chart',
    purpose: 'Reset chart pan and zoom',
  },
  CHART_FULLSCREEN: {
    id: 'CHART_FULLSCREEN',
    label: 'FULLSCREEN',
    category: 'chart',
    purpose: 'Toggle chart fullscreen',
  },
};

export function wolfActionLabel(
  id: WolfActionId,
  opts?: { following?: boolean; drawing?: boolean; fullscreen?: boolean; loading?: boolean },
): string {
  const def = WOLF_ACTIONS[id];
  if (id === 'FOLLOW_WOLF') {
    if (opts?.following) return '⏸ STOP FOLLOWING';
    return '👁 FOLLOW WOLF';
  }
  // FOLLOWING WOLF is a transient verbal status; button stays STOP FOLLOWING while active.
  if (id === 'DRAW') {
    return opts?.drawing ? '✏ DRAWING…' : def.shortLabel || def.label;
  }
  if (id === 'CHART_FULLSCREEN') {
    return opts?.fullscreen ? 'EXIT FULL' : 'FULLSCREEN';
  }
  if (opts?.loading) {
    if (id === 'SHOW_ON_CHART') return 'FOCUSING…';
    if (id === 'CHALLENGE') return 'CHALLENGING…';
    if (id === 'REPLAY') return 'REPLAYING…';
  }
  return def.shortLabel || def.label;
}

export type DrawTool = 'line' | 'zone' | 'arrow' | 'horizontal' | 'eraser';

export const DRAW_TOOLS: { id: DrawTool; label: string }[] = [
  { id: 'line', label: 'LINE' },
  { id: 'zone', label: 'ZONE' },
  { id: 'arrow', label: 'ARROW' },
  { id: 'horizontal', label: 'HORIZONTAL LEVEL' },
  { id: 'eraser', label: 'ERASER' },
];
