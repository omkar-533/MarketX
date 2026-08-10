/**
 * Deterministic LIVE WOLF narration — NO LLM calls.
 * Explains only structured analysis / events already detected by engines.
 */
import type { LiveAnalysisSnapshot, MarketEvent } from './liveTypes';

export type NarrationLine = {
  id: string;
  timestamp: number;
  text: string;
  eventType?: string;
};

const COOLDOWN_MS = 12_000;
const lastSpokenByKey = new Map<string, number>();

export function narrateEvent(evt: MarketEvent, snap?: LiveAnalysisSnapshot | null): NarrationLine | null {
  if (evt.significance === 'LOW') return null;
  if (evt.type === 'PRICE_UPDATE' || evt.type === 'ANALYSIS_UPDATE') return null;

  const key = `${evt.symbol}:${evt.type}`;
  const prev = lastSpokenByKey.get(key) || 0;
  if (Date.now() - prev < COOLDOWN_MS && evt.type !== 'SETUP_INVALIDATED') return null;
  lastSpokenByKey.set(key, Date.now());

  const symbol = evt.symbol;
  const tf = evt.timeframe.toUpperCase();
  let text = '';

  switch (evt.type) {
    case 'LIQUIDITY_SWEEP':
      text = `${symbol}: liquidity sweep on ${tf}. ${evt.message}. Confirmation still depends on reclaim and structure.`;
      break;
    case 'STRUCTURE_SHIFT':
      text = `${symbol}: structure shift on ${tf}. ${evt.message}. Watching for follow-through — not forcing a setup.`;
      break;
    case 'BREAKOUT':
      text = `${symbol}: breakout observed on ${tf}. ${evt.message}.`;
      break;
    case 'BREAKDOWN':
      text = `${symbol}: breakdown observed on ${tf}. ${evt.message}.`;
      break;
    case 'VOLUME_EXPANSION':
      text = `${symbol}: volume is expanding on ${tf}. ${evt.message}.`;
      break;
    case 'SETUP_DETECTED':
      text = `${symbol}: setup detected — ${evt.message}. WOLF SCORE ${snap?.score ?? '—'}/100 (quality, not profit odds).`;
      break;
    case 'SETUP_CONFIRMED':
      text = `${symbol}: setup confirmed on structured rules. Still not a guarantee — manage invalidation.`;
      break;
    case 'SETUP_INVALIDATED':
      text = `${symbol}: setup invalidated. Standing down until conditions rebuild.`;
      break;
    case 'NO_SETUP':
      text = `${symbol}: no high-quality setup. WAIT is the call.`;
      break;
    case 'CANDLE_CLOSE':
      text = `${symbol}: ${tf} candle closed near ${evt.price}.`;
      break;
    case 'HTF_ALIGNMENT_CHANGED':
      text = `${symbol}: higher-timeframe alignment changed. ${evt.message}.`;
      break;
    default:
      text = `${symbol}: ${evt.message}`;
  }

  if (snap?.waiting && evt.type !== 'NO_SETUP') {
    text += ' Overall: still watching.';
  }

  return {
    id: `nar-${evt.id}`,
    timestamp: evt.timestamp,
    text,
    eventType: evt.type,
  };
}

export function narrateSnapshot(snap: LiveAnalysisSnapshot): NarrationLine {
  if (snap.waiting || !snap.setupType) {
    return {
      id: `nar-snap-${snap.symbol}-${snap.analyzedAt}`,
      timestamp: snap.analyzedAt,
      text: `${snap.symbol}: WOLF is watching. No high-quality setup forced. Structure ${snap.structure}, volume ${snap.volume}.`,
    };
  }
  return {
    id: `nar-snap-${snap.symbol}-${snap.analyzedAt}`,
    timestamp: snap.analyzedAt,
    text: `${snap.symbol}: ${snap.setupType} · ${snap.status}. ${snap.explanation} WOLF SCORE ${snap.score ?? '—'}/100.`,
  };
}

/** Browser TTS — same Web Speech API MasterAI uses. */
export function speakNarration(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function resetNarrationCooldown() {
  lastSpokenByKey.clear();
}
