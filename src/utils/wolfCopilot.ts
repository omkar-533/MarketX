/**
 * Wolf AI Trading Copilot — state + next-action engines.
 * Frontend owns presentation; these helpers turn lock-template analysis into
 * one-screen copilot objects (WATCH THIS, checklist, journey).
 */

import type { WolfEvidenceItem } from './wolfEvidence';
import type { WolfSetupAnalysis, WolfSetupBias, WolfSetupStatus } from './parseWolfSetupReply';
import { buildEvidenceBars } from './wolfVisualStory';

export type WolfTradeState =
  | 'NO_SETUP'
  | 'DEVELOPING'
  | 'WAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'ENTRY_ZONE'
  | 'INVALIDATED'
  | 'AMBIGUOUS'
  | 'INSUFFICIENT_DATA';

/** Product status vocabulary (primary badge). */
export type WolfUiStatus =
  | 'NO_TRADE'
  | 'WATCH'
  | 'WAIT'
  | 'CONFIRMED'
  | 'ENTRY'
  | 'INVALIDATED'
  | 'TARGET';

export type WolfChecklistItem = {
  id: string;
  icon: string;
  label: string;
  /** true=✓ false=✕ null=— */
  ok: boolean | null;
};

export type WolfNextAction = {
  title: string;
  message: string;
  ifConfirmed?: string;
  evidenceHint?: 'liquidity' | 'sweep' | 'structure' | 'bos' | 'entry' | 'invalidation' | 'target' | 'confirmation';
};

export type WolfJourneySnap = {
  at: number;
  state: WolfTradeState;
  uiStatus: WolfUiStatus;
  bias: WolfSetupBias;
  setup: string;
  next: string;
  headline: string;
};

const JOURNEY_KEY = 'wolf_ai_trade_journey_v1';

export function resolveTradeState(analysis: WolfSetupAnalysis): WolfTradeState {
  if (analysis.status === 'NO_TRADE' || analysis.bias === 'NO_TRADE') return 'NO_SETUP';
  if (analysis.status === 'INVALIDATED') return 'INVALIDATED';
  if (analysis.status === 'CONFIRMED') {
    if (/retest|entry\s*zone|pullback/i.test(`${analysis.entry} ${analysis.keyObservation}`)) {
      return 'ENTRY_ZONE';
    }
    return 'CONFIRMED';
  }
  if (analysis.status === 'WAITING') return 'WAITING_CONFIRMATION';
  if (analysis.status === 'DEVELOPING') return 'DEVELOPING';
  if (analysis.bias === 'WAIT') return 'WAITING_CONFIRMATION';
  if (!analysis.setup && !analysis.keyObservation) return 'INSUFFICIENT_DATA';
  return 'AMBIGUOUS';
}

export function resolveUiStatus(analysis: WolfSetupAnalysis): {
  status: WolfUiStatus;
  emoji: string;
  label: string;
  headline: string;
} {
  const state = resolveTradeState(analysis);
  const biasWord =
    analysis.bias === 'LONG' ? 'LONG' : analysis.bias === 'SHORT' ? 'SHORT' : '';

  if (state === 'NO_SETUP') {
    return {
      status: 'NO_TRADE',
      emoji: '⚪',
      label: 'NO TRADE',
      headline: 'NO CLEAN SETUP',
    };
  }
  if (state === 'INVALIDATED') {
    return {
      status: 'INVALIDATED',
      emoji: '🔴',
      label: 'INVALIDATED',
      headline: 'SETUP NO LONGER VALID',
    };
  }
  if (state === 'ENTRY_ZONE') {
    return {
      status: 'ENTRY',
      emoji: '🔵',
      label: 'ENTRY',
      headline: biasWord ? `${biasWord} ENTRY CONDITION` : 'ENTRY CONDITION READY',
    };
  }
  if (state === 'CONFIRMED') {
    return {
      status: 'CONFIRMED',
      emoji: '🟢',
      label: 'CONFIRMED',
      headline: biasWord ? `${biasWord} SETUP CONFIRMED` : 'SETUP CONFIRMED',
    };
  }
  if (state === 'WAITING_CONFIRMATION') {
    return {
      status: 'WAIT',
      emoji: '🟠',
      label: 'WAIT',
      headline: biasWord ? `${biasWord} SETUP — WAITING` : 'WAITING FOR CONFIRMATION',
    };
  }
  if (state === 'DEVELOPING') {
    return {
      status: 'WATCH',
      emoji: '🟡',
      label: 'WATCH',
      headline: biasWord ? `${biasWord} SETUP DEVELOPING` : 'SETUP DEVELOPING',
    };
  }
  return {
    status: 'WATCH',
    emoji: '🟡',
    label: 'WATCH',
    headline: analysis.setup || 'READING THE CHART',
  };
}

function blob(analysis: WolfSetupAnalysis): string {
  return `${analysis.setup} ${analysis.keyObservation} ${analysis.entry} ${analysis.why.join(' ')} ${analysis.status}`.toLowerCase();
}

/** Compact ✓/✕ checklist — evidence over fake percentages. */
export function buildCopilotChecklist(
  analysis: WolfSetupAnalysis,
  evidence: WolfEvidenceItem[] = [],
): WolfChecklistItem[] {
  const bars = buildEvidenceBars(analysis);
  const text = blob(analysis);
  const has = (re: RegExp) => re.test(text) || evidence.some((e) => re.test(`${e.type} ${e.title}`));
  const waiting =
    analysis.status === 'WAITING' ||
    analysis.status === 'DEVELOPING' ||
    analysis.bias === 'WAIT';

  const liqOk = has(/liquid|sweep|bsl|ssl|equal/) || bars.liquidity >= 55;
  const sweepOk = has(/sweep/);
  const structOk = has(/structure|bos|choch|hh|hl|lh|ll|mss/) || bars.structure >= 55;
  const bosOk =
    analysis.status === 'CONFIRMED' ||
    (has(/\bbos\b|break\s*of\s*structure|mss/) && !waiting);
  const confirmOk = analysis.status === 'CONFIRMED' || bars.confirmation >= 60;

  if (analysis.status === 'NO_TRADE' || analysis.bias === 'NO_TRADE') {
    return [
      { id: 'structure', icon: '🧠', label: 'Structure', ok: null },
      { id: 'liquidity', icon: '💧', label: 'Liquidity', ok: null },
      { id: 'trigger', icon: '⚡', label: 'Trigger', ok: null },
    ];
  }

  return [
    { id: 'liquidity', icon: '💧', label: 'Liquidity', ok: liqOk },
    { id: 'sweep', icon: '⚡', label: 'Sweep', ok: sweepOk ? true : has(/liquid/) ? false : null },
    { id: 'structure', icon: '🧠', label: 'Structure', ok: structOk },
    {
      id: 'bos',
      icon: '📌',
      label: 'BOS',
      ok: bosOk ? true : waiting || has(/bos|confirm/) ? false : null,
    },
    {
      id: 'confirm',
      icon: '✓',
      label: 'Confirm',
      ok: confirmOk ? true : waiting ? false : null,
    },
  ];
}

/** Heart of the copilot — always answers what to watch next. */
export function buildNextAction(
  analysis: WolfSetupAnalysis,
  opts?: { nextActionField?: string },
): WolfNextAction {
  const field = String(opts?.nextActionField || '').trim();
  if (field) {
    return {
      title: 'WATCH THIS',
      message: field.replace(/^(watch\s*(this)?[:\-]?\s*)/i, '').trim() || field,
      ifConfirmed: analysis.entry ? `If confirmed → ${analysis.entry}` : undefined,
      evidenceHint: guessHint(field),
    };
  }

  const state = resolveTradeState(analysis);
  const text = blob(analysis);

  if (state === 'NO_SETUP') {
    return {
      title: 'WATCH THIS',
      message: 'Nothing actionable yet — wait for a clean level or sweep.',
      evidenceHint: 'liquidity',
    };
  }
  if (state === 'INVALIDATED') {
    return {
      title: 'WATCH THIS',
      message: analysis.invalidation || 'Idea is dead — scan for a fresh setup.',
      evidenceHint: 'invalidation',
    };
  }
  if (state === 'ENTRY_ZONE') {
    return {
      title: 'WATCH THIS',
      message: analysis.entry || 'Entry condition ready — manage risk at invalidation.',
      ifConfirmed: analysis.target ? `Target → ${analysis.target}` : undefined,
      evidenceHint: 'entry',
    };
  }
  if (state === 'CONFIRMED') {
    return {
      title: 'WATCH THIS',
      message: /retest/i.test(text)
        ? 'Wait for retest of the broken level.'
        : analysis.entry || 'Confirmation in — watch the entry condition.',
      ifConfirmed: analysis.target ? `Toward → ${analysis.target}` : undefined,
      evidenceHint: 'entry',
    };
  }

  // WAIT / DEVELOPING — most common trader path
  if (/\bbos\b|structure confirmation|break of structure/i.test(text)) {
    return {
      title: 'WATCH THIS',
      message:
        analysis.bias === 'SHORT'
          ? 'Bearish BOS below this level.'
          : 'Bullish BOS above this level.',
      ifConfirmed: analysis.entry ? `If confirmed → ${analysis.entry}` : 'If confirmed → entry zone',
      evidenceHint: 'bos',
    };
  }
  if (/retest/i.test(text)) {
    return {
      title: 'WATCH THIS',
      message: 'Wait for retest of the key level.',
      ifConfirmed: analysis.entry ? `If holds → ${analysis.entry}` : undefined,
      evidenceHint: 'entry',
    };
  }
  if (/sweep/i.test(text) && !/bos|confirm/i.test(analysis.status)) {
    return {
      title: 'WATCH THIS',
      message: 'Sweep done — wait for structure confirmation.',
      ifConfirmed: 'If BOS prints → entry condition',
      evidenceHint: 'bos',
    };
  }
  if (/breakout|breakdown/i.test(text)) {
    return {
      title: 'WATCH THIS',
      message: 'Watch acceptance beyond the range — avoid first wick.',
      evidenceHint: 'confirmation',
    };
  }

  return {
    title: 'WATCH THIS',
    message:
      analysis.entry ||
      analysis.keyObservation ||
      'Wait for the next clear candle confirmation.',
    ifConfirmed: analysis.invalidation
      ? `Invalid if → ${analysis.invalidation}`
      : undefined,
    evidenceHint: 'confirmation',
  };
}

function guessHint(msg: string): WolfNextAction['evidenceHint'] {
  const t = msg.toLowerCase();
  if (/bos|structure/.test(t)) return 'bos';
  if (/sweep/.test(t)) return 'sweep';
  if (/liquid/.test(t)) return 'liquidity';
  if (/retest|entry/.test(t)) return 'entry';
  if (/invalid|stop/.test(t)) return 'invalidation';
  if (/target/.test(t)) return 'target';
  return 'confirmation';
}

export function buildTradeProgress(checklist: WolfChecklistItem[]): {
  label: string;
  done: boolean;
  current: boolean;
}[] {
  return checklist.map((c, i) => {
    const firstOpen = checklist.findIndex((x) => x.ok === false || x.ok === null);
    return {
      label: `${c.icon} ${c.label}`,
      done: c.ok === true,
      current: firstOpen === i,
    };
  });
}

export function pushJourneySnap(snap: Omit<WolfJourneySnap, 'at'>): WolfJourneySnap[] {
  if (typeof window === 'undefined') return [];
  let prev: WolfJourneySnap[] = [];
  try {
    prev = JSON.parse(window.sessionStorage.getItem(JOURNEY_KEY) || '[]') as WolfJourneySnap[];
    if (!Array.isArray(prev)) prev = [];
  } catch {
    prev = [];
  }
  const last = prev[prev.length - 1];
  if (last && last.state === snap.state && last.next === snap.next && last.headline === snap.headline) {
    return prev.slice(-8);
  }
  const next = [...prev, { ...snap, at: Date.now() }].slice(-8);
  window.sessionStorage.setItem(JOURNEY_KEY, JSON.stringify(next));
  return next;
}

export function loadJourney(): WolfJourneySnap[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(JOURNEY_KEY) || '[]') as WolfJourneySnap[];
    return Array.isArray(raw) ? raw.slice(-8) : [];
  } catch {
    return [];
  }
}

/** Before → Now delta when a second analysis lands. */
export function journeyDelta(journey: WolfJourneySnap[]): {
  previous: WolfJourneySnap;
  current: WolfJourneySnap;
  changed: boolean;
} | null {
  if (journey.length < 2) return null;
  const previous = journey[journey.length - 2];
  const current = journey[journey.length - 1];
  return {
    previous,
    current,
    changed: previous.state !== current.state || previous.next !== current.next,
  };
}

/** Pick at most 3 primary evidence tabs for the one-screen switcher. */
export function pickPrimaryEvidenceTabs(
  analysis: WolfSetupAnalysis,
  evidence: WolfEvidenceItem[],
  checklist: WolfChecklistItem[],
): {
  id: string;
  icon: string;
  label: string;
  ok: boolean | null;
  evidence?: WolfEvidenceItem;
}[] {
  const byType = (t: string) =>
    evidence.find((e) => e.type === t || new RegExp(t, 'i').test(`${e.type} ${e.title}`));

  const ordered: { id: string; icon: string; label: string; typeHint: string }[] = [];
  const text = blob(analysis);

  if (/liquid|sweep|bsl|ssl/i.test(text) || byType('liquidity') || byType('sweep')) {
    if (byType('sweep') || /sweep/i.test(text)) {
      ordered.push({ id: 'sweep', icon: '⚡', label: 'Sweep', typeHint: 'sweep' });
    }
    ordered.push({ id: 'liquidity', icon: '💧', label: 'Liquidity', typeHint: 'liquidity' });
  }
  if (/bos|structure|choch/i.test(text) || byType('bos') || byType('structure')) {
    ordered.push({ id: 'bos', icon: '🧠', label: 'BOS', typeHint: 'bos' });
  }
  if (/retest|entry/i.test(text) || byType('entry') || byType('confirmation')) {
    ordered.push({ id: 'retest', icon: '📍', label: 'Retest', typeHint: 'entry' });
  }
  if (!ordered.length) {
    for (const c of checklist.slice(0, 3)) {
      ordered.push({ id: c.id, icon: c.icon, label: c.label, typeHint: c.id });
    }
  }

  const uniq: typeof ordered = [];
  for (const o of ordered) {
    if (!uniq.some((u) => u.id === o.id)) uniq.push(o);
  }

  return uniq.slice(0, 3).map((o) => {
    const ev = byType(o.typeHint) || evidence.find((e) => e.id === o.id);
    const check = checklist.find((c) => c.id === o.id || c.label.toLowerCase() === o.label.toLowerCase());
    return {
      id: o.id,
      icon: o.icon,
      label: o.label,
      ok: check?.ok ?? (ev ? true : null),
      evidence: ev,
    };
  });
}

/** Ultra-short status title: "LONG — WAIT" */
export function crispStatusTitle(analysis: WolfSetupAnalysis): { title: string; subtitle: string } {
  const ui = resolveUiStatus(analysis);
  const bias =
    analysis.bias === 'LONG' ? 'LONG' : analysis.bias === 'SHORT' ? 'SHORT' : '';
  let title = ui.label;
  if (bias && (ui.status === 'WAIT' || ui.status === 'WATCH')) title = `${bias} — ${ui.label}`;
  else if (bias && ui.status === 'CONFIRMED') title = `${bias} — CONFIRMED`;
  else if (bias && ui.status === 'ENTRY') title = `${bias} — ENTRY`;
  else if (ui.status === 'NO_TRADE') title = 'NO SETUP';
  else if (ui.status === 'INVALIDATED') title = 'INVALIDATED';

  const next = buildNextAction(analysis, { nextActionField: analysis.nextAction });
  const subtitle =
    analysis.keyObservation?.slice(0, 48) ||
    next.message.slice(0, 48) ||
    analysis.setup.slice(0, 48) ||
    '';
  return { title, subtitle };
}

export function speakNextActionScript(
  analysis: WolfSetupAnalysis,
  next: WolfNextAction,
  hindi?: boolean,
): string {
  const crisp = crispStatusTitle(analysis);
  if (hindi) {
    return [crisp.title, crisp.subtitle, next.message, next.ifConfirmed || '']
      .filter(Boolean)
      .join('. ');
  }
  return [crisp.title, crisp.subtitle, next.message, next.ifConfirmed || '']
    .filter(Boolean)
    .join('. ');
}
