import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crosshair,
  HelpCircle,
  Mic2,
  PenLine,
  Play,
  Swords,
} from 'lucide-react';
import { parseWolfSetupReply } from '../../utils/parseWolfSetupReply';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import type { NormalizedBBox, WolfEvidenceItem } from '../../utils/wolfEvidence';
import {
  buildCopilotChecklist,
  buildNextAction,
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
import WolfChartCanvas from './WolfChartCanvas';
import type { WolfAnalysisMode } from '../../constants/wolfAnalysisModes';

export type WolfTrailItem = {
  id: string;
  label: string;
};

type Props = {
  text: string;
  hindi?: boolean;
  onSpeak?: (text: string) => void;
  imageUrl?: string | null;
  levels?: ChartLevel[];
  shapes?: ChartShape[];
  evidence?: WolfEvidenceItem[];
  /** Send follow-up prompt into Wolf chat. */
  onWhatIf?: (prompt: string) => void;
  /** Compact analysis stages — click restores that visual state via parent. */
  trail?: WolfTrailItem[];
  activeTrailId?: string | null;
  onTrailSelect?: (id: string) => void;
  /** Hide nested Ask (MasterAI bottom composer owns Ask Wolf). */
  hideAskDock?: boolean;
  symbolLabel?: string;
  timeframeLabel?: string;
  /** Sole post-upload AnalysisSelector placement — Wolf header only. */
  analysisMode?: WolfAnalysisMode;
  onAnalysisModeChange?: (mode: WolfAnalysisMode) => void;
  analysisModeDisabled?: boolean;
  /** Multi-lens Analysis Lab (replaces single header select when provided). */
  analysisLab?: ReactNode;
};

type Sheet = 'why' | 'whatif' | 'entry' | 'invalid' | 'deeper' | 'miss' | 'radial' | null;

/**
 * Split-brain Wolf desk — LEFT Market · RIGHT Wolf's Read.
 * Same panel structure for every response; only content + chart focus change.
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
  trail = [],
  activeTrailId = null,
  onTrailSelect,
  hideAskDock = true,
  symbolLabel = 'CHART',
  timeframeLabel = '',
  analysisMode,
  onAnalysisModeChange: _onAnalysisModeChange,
  analysisModeDisabled: _analysisModeDisabled,
  analysisLab,
}: Props) {
  const analysis = useMemo(() => parseWolfSetupReply(text), [text]);
  const [phase, setPhase] = useState<'tease' | 'live'>('tease');
  const [activeTab, setActiveTab] = useState<string>('full');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [replayOn, setReplayOn] = useState(false);
  const [guideOn, setGuideOn] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [focusOnly, setFocusOnly] = useState(false);
  const [explainLevel, setExplainLevel] = useState(1);
  const [ask, setAsk] = useState('');
  const [drawMode, setDrawMode] = useState(false);
  const [followCamera, setFollowCamera] = useState(true);
  const [radial, setRadial] = useState<{ x: number; y: number } | null>(null);

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
  const delta = useMemo(() => journeyDelta(loadJourney()), [analysis?.raw]);

  const evidenceLane = useMemo(() => {
    const fromTabs = tabs.slice(0, 3).map((t) => ({
      id: t.id,
      icon: t.icon,
      label: t.label,
      ok: t.ok,
      evidence: t.evidence,
    }));
    if (fromTabs.length) return fromTabs;
    return checklist.slice(0, 3).map((c) => ({
      id: c.id,
      icon: c.icon,
      label: c.label,
      ok: c.ok,
      evidence: undefined as WolfEvidenceItem | undefined,
    }));
  }, [tabs, checklist]);

  const explainLines = useMemo(() => {
    if (!next) return [] as string[];
    if (explainLevel === 1) {
      return [next.message, hindi ? 'Confirmation pending.' : 'Confirmation still pending.'];
    }
    if (explainLevel === 2) {
      return [
        hindi ? 'Price ko ye level todna / hold karna hai.' : 'Price must break or hold this level.',
        next.ifConfirmed || '',
      ];
    }
    if (explainLevel === 3) {
      return [
        hindi ? 'Dekho — camera move. Yahi zone.' : 'Watch — camera moves to this zone.',
        next.message,
      ];
    }
    return [
      hindi
        ? 'Door ke jaisa: pehle sweep, phir break, phir entry.'
        : 'Like a door: sweep first, then break, then entry.',
    ];
  }, [explainLevel, hindi, next]);

  const insight = useMemo(() => {
    if (!analysis || !next) return '';
    return (
      (analysis.keyObservation || '').split(/\s+/).slice(0, 14).join(' ') ||
      explainLines.filter(Boolean)[0] ||
      next.message
    );
  }, [analysis, explainLines, next]);

  const guideSteps = useMemo(() => {
    if (!analysis || !next) return [];
    const fromEvidence = evidenceLane.slice(0, 4).map((n) => ({
      id: n.id,
      label: n.label,
      line: hindi
        ? `YEH ${n.label.toUpperCase()} — isi pe focus.`
        : `THIS IS THE ${n.label.toUpperCase()} WOLF IS WATCHING.`,
      evidence: n.evidence,
    }));
    if (fromEvidence.length >= 2) {
      return [
        ...fromEvidence,
        {
          id: 'entry',
          label: 'Entry',
          line: hindi
            ? `ENTRY: ${analysis.entry || 'Confirmation ke baad.'}`
            : `ENTRY AREA: ${analysis.entry || 'Wait for confirmation.'}`,
          evidence: tabs.find((t) => /entry/i.test(t.id))?.evidence,
        },
        {
          id: 'inv',
          label: 'Invalid',
          line: hindi
            ? `INVALID: ${analysis.invalidation || analysis.stopLoss || 'Yeh tootey to thesis fail.'}`
            : `IF THIS FAILS, THESIS IS INVALID: ${analysis.invalidation || analysis.stopLoss || 'Watch this level.'}`,
          evidence: tabs.find((t) => /invalid|stop/i.test(t.id))?.evidence,
        },
      ].slice(0, 5);
    }
    return [
      {
        id: 'story',
        label: 'Story',
        line: insight,
        evidence: tabs[0]?.evidence,
      },
      {
        id: 'watch',
        label: 'Watch',
        line: next.message,
        evidence: tabs.find((t) => t.ok === false)?.evidence || tabs[0]?.evidence,
      },
      {
        id: 'entry',
        label: 'Entry',
        line: analysis.entry || 'Confirmation first.',
        evidence: undefined as WolfEvidenceItem | undefined,
      },
      {
        id: 'inv',
        label: 'Invalid',
        line: analysis.invalidation || analysis.stopLoss || 'Thesis breaks here.',
        evidence: undefined as WolfEvidenceItem | undefined,
      },
      {
        id: 'tgt',
        label: 'Target',
        line: analysis.target || 'Next liquidity.',
        evidence: undefined as WolfEvidenceItem | undefined,
      },
    ];
  }, [analysis, evidenceLane, hindi, insight, next, tabs]);

  const focusItem = useMemo(() => {
    if (focusId) {
      const fromTab = tabs.find((t) => t.id === focusId)?.evidence;
      if (fromTab) return fromTab;
      return evidence.find((e) => e.id === focusId) || null;
    }
    if (activeTab !== 'full') return tabs.find((t) => t.id === activeTab)?.evidence || null;
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
    setPhase('tease');
    setGuideStep(0);
    setGuideOn(false);
    setFocusOnly(false);
    setExplainLevel(1);
    setSheet(null);
    const t = window.setTimeout(() => setPhase('live'), 700);
    return () => window.clearTimeout(t);
  }, [analysis?.raw]);

  useEffect(() => {
    if (!replayOn || !tabs.length) return;
    setActiveTab(tabs[0].id);
    setFocusId(tabs[0].evidence?.id || null);
    setFollowCamera(true);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      if (i >= tabs.length) {
        window.clearInterval(id);
        setReplayOn(false);
        setActiveTab('full');
        return;
      }
      setActiveTab(tabs[i].id);
      setFocusId(tabs[i].evidence?.id || null);
    }, 2200);
    return () => window.clearInterval(id);
  }, [replayOn, tabs]);

  if (!analysis || !ui || !next || !crisp) {
    return (
      <div className="wolf-split wolf-split--fallback">
        <section className="wolf-split__market">
          {imageUrl ? (
            <WolfChartCanvas>
              <ScreenshotAnnotOverlay imageUrl={imageUrl} levels={levels} shapes={shapes} />
            </WolfChartCanvas>
          ) : (
            <div className="wolf-desk__empty">Upload a chart.</div>
          )}
        </section>
        <aside className="wolf-split__wolf">
          <div className="wolf-split__warn">⚠️ Pinning evidence…</div>
          <ChatMarkdown text={text} />
        </aside>
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

  const speak = () => onSpeak?.(speakNextActionScript(analysis, next, hindi));

  const askWolf = (prompt: string) => {
    onWhatIf?.(prompt);
  };

  const focusEvidence = (id: string, ev?: WolfEvidenceItem) => {
    setFollowCamera(true);
    setPhase('live');
    setFocusOnly(true);
    if (tabs.some((t) => t.id === id)) setActiveTab(id);
    setFocusId(ev?.id || id);
    setSheet(null);
  };

  const showMe = () => {
    setPhase('live');
    setFollowCamera(true);
    const hint = next.evidenceHint;
    const match =
      (hint && tabs.find((t) => t.id === hint || t.label.toLowerCase().includes(String(hint))))
        ?.evidence ||
      tabs.find((t) => t.ok === false)?.evidence ||
      tabs[0]?.evidence;
    if (match) {
      const tab = tabs.find((t) => t.evidence?.id === match.id);
      if (tab) setActiveTab(tab.id);
      setFocusId(match.id);
      setFocusOnly(true);
    } else {
      setActiveTab('full');
      setFocusId(null);
      setFocusOnly(false);
    }
    setSheet(null);
  };

  const goGuideStep = (step: number) => {
    const s = Math.max(0, Math.min(guideSteps.length - 1, step));
    setGuideStep(s);
    setGuideOn(true);
    setFollowCamera(true);
    setFocusOnly(true);
    const item = guideSteps[s];
    if (item?.evidence) {
      focusEvidence(item.id, item.evidence);
    } else if (item) {
      setFocusId(null);
      setActiveTab('full');
    }
  };

  const startGuide = () => {
    setPhase('live');
    goGuideStep(0);
  };

  const isWait =
    analysis.bias === 'WAIT' ||
    analysis.bias === 'NO_TRADE' ||
    ui.status === 'WAIT' ||
    ui.status === 'WATCH' ||
    ui.status === 'NO_TRADE';
  const isLong = analysis.bias === 'LONG' && !isWait;
  const isShort = analysis.bias === 'SHORT' && !isWait;

  const displayEvidence =
    focusOnly && focusItem
      ? evidenceLane.filter((n) => n.evidence?.id === focusItem.id || n.id === focusId).slice(0, 1)
      : evidenceLane;

  const onSelectRegion = (bbox: NormalizedBBox) => {
    setDrawMode(false);
    askWolf(
      `[CHART REGION] Analyze this user-marked area only (normalized bbox ${bbox.x.toFixed(2)},${bbox.y.toFixed(2)} ${bbox.width.toFixed(2)}x${bbox.height.toFixed(2)}). Short locked template + Next Action. Under 90 words.`,
    );
  };

  const directionLabel =
    analysis.bias === 'LONG'
      ? 'LONG'
      : analysis.bias === 'SHORT'
        ? 'SHORT'
        : analysis.bias === 'NO_TRADE'
          ? 'NO TRADE'
          : 'WAIT';

  const currentGuide = guideSteps[guideStep];

  return (
    <div className={`wolf-split wolf-split--${tone} ${phase === 'tease' ? 'is-tease' : ''}`}>
      <header className="wolf-split__bar">
        <div className="wolf-split__brand">
          <span aria-hidden>🐺</span>
          <strong>WOLF AI</strong>
          {!analysisLab && analysisMode ? (
            <span className="wolf-split__mode-pill">{analysisMode.replace(/_/g, ' ').toUpperCase()}</span>
          ) : null}
        </div>
        <div className="wolf-split__meta">
          <span>{symbolLabel}</span>
          {timeframeLabel ? <span>· {timeframeLabel}</span> : null}
          <span className="wolf-split__ready">● Analysis active</span>
        </div>
      </header>

      {analysisLab ? <div className="wolf-split__lab">{analysisLab}</div> : null}

      <div className="wolf-split__body">
        <section className="wolf-split__market" aria-label="The Market">
          <div className={`wolf-split__stage ${phase === 'tease' ? 'is-dim' : ''}`}>
            <WolfChartCanvas
              focusBbox={followCamera ? focusItem?.bbox || null : null}
              drawMode={drawMode}
              onSelectRegion={onSelectRegion}
              onPoint={(x, y) => {
                setRadial({ x, y });
                setSheet('radial');
              }}
            >
              {imageUrl ? (
                <ScreenshotAnnotOverlay
                  imageUrl={imageUrl}
                  levels={levels}
                  shapes={shapes}
                  focusBbox={focusItem?.bbox || null}
                  focusLabel={focusItem?.title || null}
                />
              ) : (
                <div className="wolf-desk__empty">Upload a chart.</div>
              )}
            </WolfChartCanvas>

            <AnimatePresence>
              {phase === 'tease' ? (
                <motion.div
                  className="wolf-split__tease"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <p>{hindi ? 'Ek second… kuch mila.' : 'Wait — I found something.'}</p>
                  <button type="button" onClick={showMe}>
                    SHOW ME
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {guideOn && currentGuide && phase === 'live' ? (
                <motion.div
                  className="wolf-split__guide"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  <div className="wolf-split__guide-k">
                    FOLLOW WOLF · {guideStep + 1}/{guideSteps.length}
                  </div>
                  <p>{currentGuide.line}</p>
                  <div className="wolf-split__guide-nav">
                    <button
                      type="button"
                      disabled={guideStep <= 0}
                      onClick={() => goGuideStep(guideStep - 1)}
                    >
                      BACK
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (guideStep >= guideSteps.length - 1) {
                          setGuideOn(false);
                          setFocusOnly(false);
                          return;
                        }
                        goGuideStep(guideStep + 1);
                      }}
                    >
                      {guideStep >= guideSteps.length - 1 ? 'DONE' : 'NEXT'}
                    </button>
                    <button
                      type="button"
                      className="is-ghost"
                      onClick={() => {
                        setGuideOn(false);
                        setFocusOnly(false);
                      }}
                    >
                      CLOSE
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {sheet === 'radial' && radial ? (
                <motion.div
                  className="wolf-desk__radial wolf-split__radial"
                  style={{ left: `${radial.x * 100}%`, top: `${radial.y * 100}%` }}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSheet(null);
                      askWolf(
                        `[WHAT IS THIS?] User pointed near (${radial.x.toFixed(2)}, ${radial.y.toFixed(2)}) on the screenshot. Identify what matters there in ≤2 lines + suggest Next Action.`,
                      );
                    }}
                  >
                    Ask Wolf
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSheet(null);
                      askWolf(
                        `[LIQUIDITY] Is the pointed area liquidity? Locked template + Next Action. Under 80 words.`,
                      );
                    }}
                  >
                    Liquidity
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSheet('entry');
                    }}
                  >
                    Entry
                  </button>
                  <button type="button" onClick={() => setSheet('whatif')}>
                    What if?
                  </button>
                  <button type="button" className="is-ghost" onClick={() => setSheet(null)}>
                    Close
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="wolf-split__cam">
            <button
              type="button"
              className={guideOn ? 'is-on' : ''}
              onClick={() => (guideOn ? setGuideOn(false) : startGuide())}
              title="Walk the evidence story with Wolf"
            >
              {guideOn ? '◉ FOLLOW WOLF' : '○ FOLLOW WOLF'}
            </button>
            <button
              type="button"
              className={followCamera ? 'is-on' : ''}
              onClick={() => setFollowCamera((v) => !v)}
              title="When on, Wolf can move the camera"
            >
              {followCamera ? '◉ FOLLOW CAMERA' : '○ FOLLOW CAMERA'}
            </button>
            <button
              type="button"
              className={drawMode ? 'is-on' : ''}
              onClick={() => setDrawMode((v) => !v)}
            >
              <PenLine className="h-3.5 w-3.5" />
              DRAW
            </button>
          </div>
        </section>

        <aside className="wolf-split__wolf" aria-label="Wolf's read">
          {trail.length > 1 ? (
            <nav className="wolf-split__trail" aria-label="Analysis trail">
              {trail.map((t, i) => (
                <span key={t.id} className="wolf-split__trail-item">
                  {i > 0 ? <span className="wolf-split__trail-arrow">→</span> : null}
                  <button
                    type="button"
                    className={activeTrailId === t.id ? 'is-on' : ''}
                    onClick={() => onTrailSelect?.(t.id)}
                  >
                    {t.label}
                  </button>
                </span>
              ))}
            </nav>
          ) : null}

          <div className="wolf-split__eyebrow">WOLF&apos;S READ</div>

          <div className="wolf-desk__status wolf-split__status" role="status">
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

          <section className="wolf-split__story" aria-label="Market story">
            <div className="wolf-desk__watch-k">MARKET STORY</div>
            <blockquote className="wolf-split__insight">&ldquo;{insight}&rdquo;</blockquote>
          </section>

          <section className="wolf-split__evidence-block" aria-label="Key evidence">
            <div className="wolf-desk__watch-k">KEY EVIDENCE</div>
            <ul className="wolf-split__evidence">
              {displayEvidence.map((node) => {
                const dimmed =
                  focusOnly &&
                  focusItem &&
                  node.evidence?.id !== focusItem.id &&
                  node.id !== focusId;
                return (
                  <li key={node.id} className={dimmed ? 'is-dim' : ''}>
                    <button
                      type="button"
                      onClick={() => focusEvidence(node.id, node.evidence)}
                      style={dimmed ? { opacity: 0.35 } : undefined}
                    >
                      <span>
                        {node.icon} {node.label}
                      </span>
                      <span
                        className={`wolf-switch__mark ${
                          node.ok === true ? 'is-yes' : node.ok === false ? 'is-no' : 'is-na'
                        }`}
                      >
                        {node.ok === true ? '✓' : node.ok === false ? '✕' : '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {focusOnly ? (
              <button
                type="button"
                className="wolf-split__clear-focus"
                onClick={() => {
                  setFocusOnly(false);
                  setFocusId(null);
                  setActiveTab('full');
                }}
              >
                SHOW ALL
              </button>
            ) : null}
          </section>

          <section className="wolf-split__plan" aria-label="Trade plan">
            <div className="wolf-desk__watch-k">TRADE PLAN</div>
            <dl className="wolf-split__plan-grid">
              <div>
                <dt>Direction</dt>
                <dd>{directionLabel}</dd>
              </div>
              <div>
                <dt>Trigger</dt>
                <dd>{analysis.entry || next.message || '—'}</dd>
              </div>
              <div>
                <dt>Invalidation</dt>
                <dd>{analysis.invalidation || analysis.stopLoss || '—'}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{analysis.target || '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="wolf-desk__watch wolf-split__watch" aria-label="Next action">
            <div className="wolf-desk__watch-k">NEXT ACTION</div>
            <p className="wolf-desk__watch-m">
              {explainLines.filter(Boolean)[0] || next.message}
            </p>
            {explainLevel > 1 || next.ifConfirmed ? (
              <p className="wolf-desk__watch-n">
                {explainLevel > 1
                  ? explainLines.filter(Boolean)[1] || next.ifConfirmed
                  : next.ifConfirmed}
              </p>
            ) : null}
          </section>

          <div className="wolf-split__acts">
            {isWait ? (
              <>
                <button type="button" onClick={() => setSheet((s) => (s === 'why' ? null : 'why'))}>
                  WHY WAIT?
                </button>
                <button type="button" onClick={() => setSheet((s) => (s === 'entry' ? null : 'entry'))}>
                  SHOW ENTRY
                </button>
                <button
                  type="button"
                  onClick={() =>
                    askWolf(
                      '[WHAT CONFIRMS?] What exactly confirms this setup on THIS chart? One clear trigger + Next Action. Under 80 words.',
                    )
                  }
                >
                  WHAT CONFIRMS?
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setSheet((s) => (s === 'why' ? null : 'why'))}>
                  {isLong ? 'WHY LONG?' : isShort ? 'WHY SHORT?' : 'WHY?'}
                </button>
                <button type="button" onClick={() => setSheet((s) => (s === 'entry' ? null : 'entry'))}>
                  SHOW ENTRY
                </button>
                <button
                  type="button"
                  onClick={() => setSheet((s) => (s === 'invalid' ? null : 'invalid'))}
                >
                  WHAT INVALIDATES?
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            className="wolf-split__acts-explain"
            onClick={() => setExplainLevel((n) => Math.min(4, n + 1))}
          >
            <HelpCircle className="h-3 w-3" />
            {hindi ? 'SAMJHA NAHI' : "I DON'T GET IT"}
          </button>

          <div className="wolf-split__primary">
            <button type="button" className="wolf-split__show" onClick={showMe}>
              <Crosshair className="h-3.5 w-3.5" />
              SHOW ME
            </button>
          </div>

          <AnimatePresence>
            {sheet === 'entry' || sheet === 'invalid' || sheet === 'deeper' ? (
              <motion.div
                className="wolf-desk__sheet"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {sheet === 'entry' ? (
                  <>
                    <strong>ENTRY</strong>
                    <p>{analysis.entry || (hindi ? 'Pehle confirmation.' : 'Confirmation first.')}</p>
                    <button type="button" onClick={showMe}>
                      SHOW
                    </button>
                  </>
                ) : null}
                {sheet === 'invalid' ? (
                  <>
                    <strong>INVALIDATION</strong>
                    <p>{analysis.invalidation || analysis.stopLoss || 'Level unclear.'}</p>
                    <button type="button" onClick={showMe}>
                      PINPOINT
                    </button>
                  </>
                ) : null}
                {sheet === 'deeper' ? (
                  <>
                    <strong>GO DEEPER</strong>
                    <p>{(analysis.why || []).slice(0, 2).join(' ') || insight}</p>
                    {analysis.alternative ? (
                      <p className="wolf-split__deeper-note">Alt: {analysis.alternative}</p>
                    ) : null}
                    <p className="wolf-split__deeper-note">
                      {analysis.assumptions || analysis.entry || next.ifConfirmed || ''}
                    </p>
                  </>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {sheet === 'why' ? (
              <motion.div
                className="wolf-desk__why"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {evidenceLane.map((node, i) => (
                  <button
                    key={node.id}
                    type="button"
                    className="wolf-desk__why-node"
                    onClick={() => focusEvidence(node.id, node.evidence)}
                  >
                    <span>
                      {node.icon} {node.label}{' '}
                      {node.ok === true ? '✓' : node.ok === false ? '✕' : '?'}
                    </span>
                    {i < evidenceLane.length - 1 ? (
                      <span className="wolf-desk__why-arrow">↓</span>
                    ) : null}
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
                    askWolf(
                      '[WHAT-IF] Price HOLDS the key level. Locked template + Next Action. Under 80 words. Conditional only.',
                    );
                    setSheet(null);
                  }}
                >
                  LEVEL HOLDS
                </button>
                <button
                  type="button"
                  className="wolf-desk__whatif-big is-break"
                  onClick={() => {
                    askWolf(
                      '[WHAT-IF] Price BREAKS the key level. Locked template + Next Action. Under 80 words. Conditional only.',
                    );
                    setSheet(null);
                  }}
                >
                  LEVEL BREAKS
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {sheet === 'miss' ? (
              <motion.div
                className="wolf-desk__sheet"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <strong>ONE PROBLEM</strong>
                <p>
                  {analysis.invalidation ||
                    (hindi
                      ? 'Opposing liquidity / invalidation — pehle yeh dekh.'
                      : 'Opposing liquidity / invalidation — look here first.')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSheet(null);
                    showMe();
                    askWolf(
                      '[CHALLENGE] Challenge my bias. Show ONE thing I may be missing on THIS chart (opposing liquidity/resistance/weak structure). Short + Next Action. Under 90 words.',
                    );
                  }}
                >
                  SHOW OPPOSING EDGE
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="wolf-split__more">
            <button type="button" onClick={() => setSheet((s) => (s === 'deeper' ? null : 'deeper'))}>
              DEEPER
            </button>
            <button type="button" onClick={() => setSheet((s) => (s === 'miss' ? null : 'miss'))}>
              <Swords className="h-3.5 w-3.5" />
              CHALLENGE
            </button>
            <button type="button" onClick={() => setReplayOn(true)} disabled={replayOn || tabs.length === 0}>
              <Play className="h-3.5 w-3.5" />
              REPLAY
            </button>
            {onSpeak ? (
              <button type="button" onClick={speak}>
                <Mic2 className="h-3.5 w-3.5" />
                TALK
              </button>
            ) : null}
            {onWhatIf ? (
              <button type="button" onClick={() => setSheet((s) => (s === 'whatif' ? null : 'whatif'))}>
                WHAT IF?
              </button>
            ) : null}
          </div>

          {!hideAskDock ? (
            <div className="wolf-dock">
              <form
                className="wolf-dock__ask"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = ask.trim();
                  if (!q) return;
                  askWolf(q);
                  setAsk('');
                }}
              >
                <input
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  placeholder={hindi ? 'Wolf se poochho…' : 'Ask Wolf…'}
                  aria-label="Ask Wolf"
                />
                <button type="submit">→</button>
              </form>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
