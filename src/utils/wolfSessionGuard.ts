/**
 * Wolf session boundary — chart + analysis are atomic.
 * NO CHART = NO ANALYSIS.
 */

import type { ChatMessage } from '../services/masterAiChatStore';
import type { ChartLevel, ChartShape } from './chartAnnotations';
import type { WolfEvidenceItem } from './wolfEvidence';

export type WolfSessionChartBlob = {
  sessionId: string;
  imageUrl: string;
  evidence: WolfEvidenceItem[];
  shotMarks?: { levels: ChartLevel[]; shapes: ChartShape[] };
  updatedAt: number;
};

const BLOB_PREFIX = 'wolf_session_chart_v1:';

export function chatHasChartImage(messages: ChatMessage[]): boolean {
  return (messages || []).some((m) => Boolean(m.imageUrl));
}

/** Analysis-looking assistant rows (template / long thesis) without a chart are orphan. */
export function looksLikeWolfAnalysisText(text: string): boolean {
  const t = String(text || '');
  return (
    /Market Bias\s*:/i.test(t) ||
    /Key Observation\s*:/i.test(t) ||
    /Key Levels\s*:/i.test(t) ||
    /WOLF AI\s*[·•]/i.test(t) ||
    /Entry Condition\s*:/i.test(t) ||
    /Setup Status\s*:/i.test(t) ||
    /Evidence Score\s*:/i.test(t) ||
    /Invalidation\s*:/i.test(t) ||
    /Target Logic\s*:/i.test(t) ||
    /\bMarket Bias\b/i.test(t) ||
    /\bWAITING FOR CONFIRMATION\b/i.test(t)
  );
}

export function saveWolfSessionChart(blob: WolfSessionChartBlob): void {
  if (typeof window === 'undefined' || !blob?.sessionId || !blob.imageUrl) return;
  try {
    sessionStorage.setItem(
      BLOB_PREFIX + blob.sessionId,
      JSON.stringify({
        ...blob,
        updatedAt: Date.now(),
      }),
    );
  } catch {
    /* quota */
  }
}

export function loadWolfSessionChart(sessionId: string): WolfSessionChartBlob | null {
  if (typeof window === 'undefined' || !sessionId) return null;
  try {
    const raw = sessionStorage.getItem(BLOB_PREFIX + sessionId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WolfSessionChartBlob;
    if (!parsed?.imageUrl || parsed.sessionId !== sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearWolfSessionChart(sessionId: string): void {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    sessionStorage.removeItem(BLOB_PREFIX + sessionId);
  } catch {
    /* */
  }
}

/**
 * Reattach in-memory/sessionStorage chart to messages after reload.
 * Returns null if this session has analysis text but no recoverable chart.
 */
export function hydrateMessagesWithSessionChart(
  sessionId: string,
  messages: ChatMessage[],
): { messages: ChatMessage[]; blob: WolfSessionChartBlob | null; valid: boolean } {
  const list = messages || [];
  if (chatHasChartImage(list)) {
    const withImg = [...list].reverse().find((m) => m.imageUrl)!;
    return {
      messages: list,
      blob: {
        sessionId,
        imageUrl: withImg.imageUrl!,
        evidence: withImg.evidence || [],
        shotMarks: withImg.shotMarks,
        updatedAt: Date.now(),
      },
      valid: true,
    };
  }

  const blob = loadWolfSessionChart(sessionId);
  if (blob?.imageUrl) {
    // Stamp image onto latest analysis / user rows for this session
    const next = list.map((m) => {
      if (m.role === 'trafi' && looksLikeWolfAnalysisText(m.text) && !m.imageUrl) {
        return {
          ...m,
          imageUrl: blob.imageUrl,
          evidence: m.evidence?.length ? m.evidence : blob.evidence,
          shotMarks: m.shotMarks || blob.shotMarks,
        };
      }
      if (m.role === 'user' && !m.imageUrl && /chart|screenshot|analyze/i.test(m.text)) {
        return { ...m, imageUrl: blob.imageUrl };
      }
      return m;
    });
    // Ensure at least one message carries the image
    if (!chatHasChartImage(next) && next.length) {
      const last = next[next.length - 1];
      next[next.length - 1] = {
        ...last,
        imageUrl: blob.imageUrl,
        evidence: last.evidence?.length ? last.evidence : blob.evidence,
        shotMarks: last.shotMarks || blob.shotMarks,
      };
    }
    return { messages: next, blob, valid: true };
  }

  const hasOrphanAnalysis = list.some(
    (m) => m.role === 'trafi' && m.id !== 'welcome' && looksLikeWolfAnalysisText(m.text),
  );
  if (hasOrphanAnalysis) {
    // Invalid: analysis text without recoverable chart — caller must show clean empty
    return { messages: list, blob: null, valid: false };
  }

  return { messages: list, blob: null, valid: true };
}

export function emptyWolfMessages(welcomeText: string): ChatMessage[] {
  return [
    {
      id: 'welcome',
      role: 'trafi',
      text: welcomeText,
      timestamp: new Date(),
    },
  ];
}
