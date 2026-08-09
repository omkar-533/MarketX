import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair, Eye, Sparkles, Mic2 } from 'lucide-react';
import { parseWolfSetupReply } from '../../utils/parseWolfSetupReply';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import type { WolfEvidenceItem } from '../../utils/wolfEvidence';
import {
  renderEvidenceCrop,
  type RenderedEvidence,
} from '../../utils/chartEvidenceEngine';
import {
  buildCopilotChecklist,
  buildNextAction,
  buildTradeProgress,
  crispStatusTitle,
  journeyDelta,
  loadJourney,
  pickPrimaryEvidenceTabs,
  pushJourneySnap,
  resolveTradeState,
  resolveUiStatus,
  speakNextActionScript,
} from '../../utils/wolfCopilot';
import ChatMarkdown from '../ChatMarkdown';
import ScreenshotAnnotOverlay from './ScreenshotAnnotOverlay';

type Props = {
  text: string;
  hindi?: boolean;
  onSpeak?: (text: string) => void;
  imageUrl?: string | null;
  levels?: ChartLevel[];
  shapes?: ChartShape[];
  evidence?: WolfEvidenceItem[];
  onWhatIf?: (prompt: string) => void;
};

/**
 * Ultra-crisp ONE-screen Wolf AI answer.
 * No Quick / Pro / Copilot / Teach modes — one polished experience only.
 */
export default function WolfSetupAnalysisCard({
  text,
  hindi,
  onSpeak,
  imageUrl,
  levels = [],
  shapes = [],
  evidence = [],
  onWhatIf,
}: Props) {
  const analysis = useMemo(() => parseWolfSetupReply(text), [text]);
  const [activeTab, setActiveTab] = useState<string>('full');
  const [cropMap, setCropMap] = useState<Record<string, RenderedEvidence>>({});
  const [sheet, setSheet] = useState<'entry' | 'invalid' | 'target' | 'why' | 'whatif' | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const checklist = useMemo(
    () => (analysis ? buildCopilotChecklist(analysis, evidence) : []),
    [analysis, evidence],
  );
  const tabs = useMemo(
    () => (analysis ? pickPrimaryEvidenceTabs(analysis, evidence, checklist) : []),
    [analysis, evidence, checklist],
  );
  const next = useMemo(
    () => (analysis ? buildNextAction(analysis, { nextActionField: analysis.nextAction }) : null),
    [analysis],
  );
  const ui = useMemo(() => (analysis ? resolveUiStatus(analysis) : null), [analysis]);
  const crisp = useMemo(() => (analysis ? crispStatusTitle(analysis) : null), [analysis]);
  const progress = useMemo(() => buildTradeProgress(checklist), [checklist]);
  const delta = useMemo(() => journeyDelta(loadJourney()), [analysis?.raw]);

  const focusItem = useMemo(() => {
    if (focusId) {
      const fromTab = tabs.find((t) => t.id === focusId)?.evidence;
      if (fromTab) return fromTab;
      return evidence.find((e) => e.id === focusId) || null;
    }
    if (activeTab !== 'full') {
      return tabs.find((t) => t.id === activeTab)?.evidence || null;
    }
    return null;
  }, [focusId, activeTab, tabs, evidence]);

  useEffect(() => {
    if (!analysis || !next || !ui) return;
    pushJourneySnap({
      state: resolveTradeState(analysis),
      uiStatus: ui.status,
      bias: analysis.bias,
      setup: analysis.setup,
      next: next.message,
      headline: crisp?.title || ui.headline,
    });
  }, [analysis, next, ui, crisp?.title]);

  useEffect(() => {
    let cancelled = false;
    if (!imageUrl || !tabs.length) {
      setCropMap({});
      return;
    }
    void (async () => {
      const map: Record<string, RenderedEvidence> = {};
      for (const tab of tabs) {
        if (!tab.evidence) continue;
        const rendered = await renderEvidenceCrop(imageUrl, tab.evidence);
        if (rendered) map[tab.id] = rendered;
      }
      if (!cancelled) setCropMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUrl, tabs]);

  if (!analysis || !ui || !next || !crisp) {
    return (
      <div className="wolf-desk">
        {imageUrl ? <ScreenshotAnnotOverlay imageUrl={imageUrl} levels={levels} shapes={shapes} /> : null}
        <ChatMarkdown text={text} />
      </div>
    );
  }

  const tone =
    ui.status === 'INVALIDATED' || analysis.bias === 'SHORT'
      ? 'short'
      : ui.status === 'NO_TRADE'
        ? 'none'
        : analysis.bias === 'LONG' && (ui.status === 'CONFIRMED' || ui.status === 'ENTRY')
          ? 'long'
          : 'wait';

  const activeCrop = activeTab !== 'full' ? cropMap[activeTab] : null;
  const activeTabMeta = tabs.find((t) => t.id === activeTab);

  const speak = () => onSpeak?.(speakNextActionScript(analysis, next, hindi));

  const pinpoint = () => {
    const hint = next.evidenceHint;
    const match =
      (hint && tabs.find((t) => t.id === hint || t.label.toLowerCase().includes(hint)))?.evidence ||
      (hint && evidence.find((e) => e.type === hint)) ||
      tabs.find((t) => t.ok === false)?.evidence ||
      tabs[0]?.evidence;
    if (match) {
      const tab = tabs.find((t) => t.evidence?.id === match.id);
      if (tab) setActiveTab(tab.id);
      setFocusId(match.id);
    } else {
      setActiveTab('full');
      setFocusId(null);
    }
  };

  const whyChain = tabs.length
    ? tabs
    : checklist.slice(0, 3).map((c) => ({
        id: c.id,
        icon: c.icon,
        label: c.label,
        ok: c.ok,
        evidence: undefined as WolfEvidenceItem | undefined,
      }));

  return (
    <div className={`wolf-desk wolf-desk--${tone}`}>
      <header className="wolf-desk__top">
        <span className="wolf-desk__brand">🐺 WOLF AI</span>
        <span className="wolf-desk__meta">{analysis.setup ? analysis.setup.slice(0, 22) : 'CHART'}</span>
      </header>

      <div className="wolf-desk__status" role="status">
        <span className="wolf-desk__emoji">{ui.emoji}</span>
        <div>
          <div className="wolf-desk__title">{crisp.title}</div>
          {crisp.subtitle ? <div className="wolf-desk__sub">{crisp.subtitle}</div> : null}
        </div>
      </div>

      {delta?.changed ? (
        <div className="wolf-desk__changed">
          <span>WHAT CHANGED</span>
          <strong>
            {delta.previous.uiStatus} → {delta.current.uiStatus}
          </strong>
          <p>{delta.current.next}</p>
        </div>
      ) : null}

      <div className="wolf-desk__stage">
        <AnimatePresence mode="wait">
          {activeCrop ? (
            <motion.div
              key={activeTab}
              className="wolf-desk__zoom"
              initial={{ opacity: 0.4, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.3, scale: 0.98 }}
              transition={{ duration: 0.28 }}
            >
              <img src={activeCrop.imageUrl} alt="" />
              <div className="wolf-desk__zoom-cap">
                {activeTabMeta?.icon} {activeTabMeta?.label}
                {activeCrop.description ? <p>{activeCrop.description.slice(0, 72)}</p> : null}
              </div>
            </motion.div>
          ) : imageUrl ? (
            <motion.div
              key="full"
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.3 }}
              transition={{ duration: 0.2 }}
            >
              <ScreenshotAnnotOverlay
                imageUrl={imageUrl}
                levels={levels}
                shapes={shapes}
                highlightLabel={null}
                focusBbox={focusItem?.bbox || null}
                focusLabel={focusItem?.title || (activeTab === 'full' ? null : activeTabMeta?.label) || null}
              />
            </motion.div>
          ) : (
            <div className="wolf-desk__empty">Upload a chart to see evidence.</div>
          )}
        </AnimatePresence>
      </div>

      {tabs.length ? (
        <div className="wolf-switch" role="tablist" aria-label="Evidence">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'full'}
            className={`wolf-switch__tab ${activeTab === 'full' ? 'is-on' : ''}`}
            onClick={() => {
              setActiveTab('full');
              setFocusId(null);
            }}
          >
            <span>🖼</span>
            <span>Full</span>
          </button>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`wolf-switch__tab ${activeTab === t.id ? 'is-on' : ''}`}
              onClick={() => {
                setActiveTab(t.id);
                setFocusId(t.evidence?.id || null);
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              <span
                className={`wolf-switch__mark ${
                  t.ok === true ? 'is-yes' : t.ok === false ? 'is-no' : 'is-na'
                }`}
              >
                {t.ok === true ? '✓' : t.ok === false ? '✕' : '—'}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="wolf-desk__prog" aria-hidden>
        {progress.map((s) => (
          <span key={s.label} className={`${s.done ? 'is-done' : ''} ${s.current ? 'is-now' : ''}`}>
            {s.label}
          </span>
        ))}
      </div>

      <div className="wolf-desk__watch">
        <div className="wolf-desk__watch-k">👁 WATCH THIS</div>
        <p className="wolf-desk__watch-m">{next.message}</p>
        {next.ifConfirmed ? <p className="wolf-desk__watch-n">{next.ifConfirmed}</p> : null}
        <button type="button" className="wolf-desk__pin" onClick={pinpoint}>
          <Crosshair className="h-3.5 w-3.5" />
          PINPOINT
        </button>
      </div>

      <div className="wolf-desk__map">
        <button
          type="button"
          className={sheet === 'entry' ? 'is-on' : ''}
          onClick={() => setSheet((s) => (s === 'entry' ? null : 'entry'))}
        >
          📍 ENTRY
        </button>
        <button
          type="button"
          className={sheet === 'invalid' ? 'is-on' : ''}
          onClick={() => setSheet((s) => (s === 'invalid' ? null : 'invalid'))}
        >
          🛑 INVALID
        </button>
        <button
          type="button"
          className={sheet === 'target' ? 'is-on' : ''}
          onClick={() => setSheet((s) => (s === 'target' ? null : 'target'))}
        >
          🎯 TARGET
        </button>
      </div>

      <AnimatePresence>
        {sheet === 'entry' || sheet === 'invalid' || sheet === 'target' ? (
          <motion.div
            className="wolf-desk__sheet"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {sheet === 'entry' ? (
              <>
                <strong>📍 ENTRY</strong>
                <p>{analysis.entry || 'Wait for confirmation first.'}</p>
                <button type="button" onClick={pinpoint}>
                  SHOW
                </button>
              </>
            ) : null}
            {sheet === 'invalid' ? (
              <>
                <strong>🛑 INVALID</strong>
                <p>{analysis.invalidation || analysis.stopLoss || 'Level not readable.'}</p>
                <button
                  type="button"
                  onClick={() => {
                    const ev = evidence.find((e) => e.type === 'invalidation');
                    if (ev) {
                      setFocusId(ev.id);
                      setActiveTab('full');
                    } else pinpoint();
                  }}
                >
                  PINPOINT
                </button>
              </>
            ) : null}
            {sheet === 'target' ? (
              <>
                <strong>🎯 TARGET</strong>
                <p>{analysis.target || 'Next liquidity / structure.'}</p>
                <button
                  type="button"
                  onClick={() => {
                    const ev = evidence.find((e) => e.type === 'target');
                    if (ev) {
                      setFocusId(ev.id);
                      setActiveTab('full');
                    }
                  }}
                >
                  SHOW
                </button>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="wolf-desk__acts">
        <button type="button" onClick={() => setSheet((s) => (s === 'why' ? null : 'why'))}>
          <Eye className="h-3.5 w-3.5" />
          WHY?
        </button>
        {onWhatIf ? (
          <button type="button" onClick={() => setSheet((s) => (s === 'whatif' ? null : 'whatif'))}>
            <Sparkles className="h-3.5 w-3.5" />
            WHAT IF?
          </button>
        ) : null}
        {onSpeak ? (
          <button type="button" className="is-ghost" onClick={speak}>
            <Mic2 className="h-3.5 w-3.5" />
            EXPLAIN
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {sheet === 'why' ? (
          <motion.div
            className="wolf-desk__why"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {whyChain.map((node, i) => (
              <button
                key={node.id}
                type="button"
                className="wolf-desk__why-node"
                onClick={() => {
                  setActiveTab(tabs.some((t) => t.id === node.id) ? node.id : 'full');
                  if (node.evidence) setFocusId(node.evidence.id);
                  setSheet(null);
                }}
              >
                <span>
                  {node.icon} {node.label}{' '}
                  {node.ok === true ? '✓' : node.ok === false ? '✕' : '?'}
                </span>
                {i < whyChain.length - 1 ? <span className="wolf-desk__why-arrow">↓</span> : null}
              </button>
            ))}
            <div className="wolf-desk__why-end">
              {ui.emoji} {crisp.title}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet === 'whatif' && onWhatIf ? (
          <motion.div
            className="wolf-desk__whatif"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <button
              type="button"
              className="wolf-desk__whatif-big is-hold"
              onClick={() => {
                onWhatIf(
                  '[WHAT-IF] Price HOLDS the key level. Reply with locked template including Next Action. Under 80 words. Conditional scenario only.',
                );
                setSheet(null);
              }}
            >
              🟢 HOLDS LEVEL
            </button>
            <button
              type="button"
              className="wolf-desk__whatif-big is-break"
              onClick={() => {
                onWhatIf(
                  '[WHAT-IF] Price BREAKS the key level. Reply with locked template including Next Action. Under 80 words. Conditional scenario only.',
                );
                setSheet(null);
              }}
            >
              🔴 BREAKS LEVEL
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
