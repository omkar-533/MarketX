import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Crosshair, PenLine } from 'lucide-react';
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
} from '../../utils/wolfCopilot';
import {
  wolfActionLabel,
  DRAW_TOOLS,
  type DrawTool,
  type WolfActionId,
  type WolfActionUiState,
} from '../../utils/wolfActionRegistry';
import ChatMarkdown from '../ChatMarkdown';
import ScreenshotAnnotOverlay from './ScreenshotAnnotOverlay';
import WolfChartCanvas from './WolfChartCanvas';
import type { UserDrawing, WolfChartCanvasHandle } from './WolfChartCanvas';
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
  /** Focus parent Ask Wolf composer. */
  onAskWolf?: () => void;
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

type Sheet = 'whatif' | 'radial' | 'explain' | 'challenge' | 'replay' | null;

type EvidenceLaneNode = {
  id: string;
  icon: string;
  label: string;
  ok: boolean | null;
  evidence?: WolfEvidenceItem;
};

function computePrimaryRisk(
  invalidation: string,
  alternative: string,
  stopLoss: string,
  hindi?: boolean,
): string {
  const inv = invalidation.trim();
  const alt = alternative.trim();
  const stop = stopLoss.trim();
  if (inv.length > 3) return inv;
  if (alt.length > 3) return alt;
  if (stop.length > 3) return stop;
  return hindi
    ? 'Opposing liquidity / structure isi setup ko invalid kar sakti hai.'
    : 'Opposing liquidity or structure may invalidate this setup.';
}

function WolfActButton({
  id,
  state = 'default',
  className = '',
  children,
  ...rest
}: {
  id: WolfActionId;
  state?: WolfActionUiState;
  className?: string;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`wolf-act wolf-act--${state} ${className}`.trim()}
      data-action={id}
      {...rest}
    >
      {children ?? wolfActionLabel(id)}
    </button>
  );
}

/**
 * Split-brain Wolf desk — LEFT Market · RIGHT Wolf's Read.
 * Same panel structure for every response; only content + chart focus change.
 */
export default function WolfSetupAnalysisCard({
  text,
  hindi,
  onSpeak: _onSpeak,
  imageUrl,
  levels = [],
  shapes = [],
  evidence = [],
  onWhatIf,
  onAskWolf,
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
  const canvasRef = useRef<WolfChartCanvasHandle>(null);
  const askInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<'tease' | 'live'>('tease');
  const [activeTab, setActiveTab] = useState<string>('full');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusOnly, setFocusOnly] = useState(false);
  const [followWolf, setFollowWolf] = useState(false);
  const [followState, setFollowState] = useState<
    'idle' | 'following' | 'paused' | 'completed' | 'error'
  >('idle');
  const [tourStep, setTourStep] = useState(0);
  const [drawMode, setDrawMode] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool | null>('line');
  const [drawings, setDrawings] = useState<UserDrawing[]>([]);
  const [whyWalk, setWhyWalk] = useState(false);
  const [whyStep, setWhyStep] = useState(0);
  const [showChartState, setShowChartState] = useState<WolfActionUiState>('default');
  const [actionHint, setActionHint] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  const [radial, setRadial] = useState<{ x: number; y: number } | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);

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

  const evidenceLane = useMemo((): EvidenceLaneNode[] => {
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

  const tourSteps = useMemo(() => {
    const fromLane = evidenceLane
      .filter((n) => n.evidence?.bbox)
      .slice(0, 5)
      .map((n) => ({
        id: n.id,
        label: n.label,
        line: hindi
          ? `YEH ${n.label.toUpperCase()} — isi pe focus.`
          : `THIS IS THE ${n.label.toUpperCase()} WOLF IS WATCHING.`,
        bbox: n.evidence!.bbox,
        evidence: n.evidence,
      }));
    if (fromLane.length >= 1) return fromLane;
    return (evidence || [])
      .filter((e) => e.bbox)
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        label: e.title,
        line: hindi ? `YEH ${e.title}` : `THIS IS THE ${e.title.toUpperCase()} WOLF IS WATCHING.`,
        bbox: e.bbox,
        evidence: e,
      }));
  }, [evidenceLane, evidence, hindi]);

  const primaryRisk = useMemo(
    () =>
      analysis
        ? computePrimaryRisk(
            analysis.invalidation,
            analysis.alternative,
            analysis.stopLoss,
            hindi,
          )
        : '',
    [analysis, hindi],
  );

  const insight = useMemo(() => {
    if (!analysis || !next) return '';
    return (
      (analysis.keyObservation || '').split(/\s+/).slice(0, 14).join(' ') ||
      next.message
    );
  }, [analysis, next]);

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
    setWhyWalk(false);
    setWhyStep(0);
    setFocusOnly(false);
    setSheet(null);
    setMoreOpen(false);
    setActionHint(null);
    setActionError(null);
    setShowChartState('default');
    setReplayPlaying(false);
    setReplayIndex(0);
    const t = window.setTimeout(() => setPhase('live'), 700);
    return () => window.clearTimeout(t);
  }, [analysis?.raw]);

  useEffect(() => {
    if (sheet !== 'replay' || !replayPlaying || !tabs.length) return;
    const id = window.setInterval(() => {
      setReplayIndex((i) => {
        if (i >= tabs.length - 1) {
          setReplayPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 2200);
    return () => window.clearInterval(id);
  }, [sheet, replayPlaying, tabs.length]);

  useEffect(() => {
    if (sheet !== 'replay' || !tabs.length) return;
    const tab = tabs[replayIndex];
    if (!tab) return;
    setFollowWolf(true);
    setFocusOnly(true);
    setActiveTab(tab.id);
    setFocusId(tab.evidence?.id || tab.id);
    setActionHint(
      hindi
        ? `Replay: ${tab.label} — step ${replayIndex + 1}/${tabs.length}.`
        : `Replay: ${tab.label} — step ${replayIndex + 1}/${tabs.length}.`,
    );
  }, [sheet, replayIndex, tabs, hindi]);

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

  const askWolf = (prompt: string) => {
    onWhatIf?.(prompt);
  };

  const focusEvidence = (id: string, ev?: WolfEvidenceItem) => {
    setFollowWolf(true);
    setPhase('live');
    setFocusOnly(true);
    if (tabs.some((t) => t.id === id)) setActiveTab(id);
    setFocusId(ev?.id || id);
    setSheet(null);
  };

  const findShowEvidence = (): { match: WolfEvidenceItem | null; label: string } => {
    const hint = next.evidenceHint;
    const tabMatch =
      (hint && tabs.find((t) => t.id === hint || t.label.toLowerCase().includes(String(hint)))) ||
      tabs.find((t) => t.ok === false) ||
      tabs[0];
    return {
      match: tabMatch?.evidence || null,
      label: tabMatch?.label || hint || 'zone',
    };
  };

  const applyEvidenceFocus = (match: WolfEvidenceItem, label: string) => {
    const tab = tabs.find((t) => t.evidence?.id === match.id);
    if (tab) setActiveTab(tab.id);
    setFocusId(match.id);
    setFocusOnly(true);
    setFollowWolf(true);
    setActionHint(
      hindi
        ? `YEH ${label.toUpperCase()} hai — isi pe nazar.`
        : `THIS is the ${label} I'm watching.`,
    );
    setActionError(null);
    canvasRef.current?.focusNormalized(match.bbox, true);
  };

  const showFullChart = () => {
    setFocusOnly(false);
    setFocusId(null);
    setActiveTab('full');
    setActionError(null);
    setActionHint(null);
    setShowChartState('default');
  };

  const showOnChart = () => {
    setPhase('live');
    setShowChartState('loading');
    setActionError(null);
    setSheet(null);
    setWhyWalk(false);

    window.setTimeout(() => {
      const { match, label } = findShowEvidence();
      if (match) {
        applyEvidenceFocus(match, label);
        setShowChartState('success');
        window.setTimeout(() => setShowChartState('default'), 1600);
      } else {
        showFullChart();
        setActionError(
          hindi ? 'Wolf is region ko locate nahi kar paya.' : "Wolf couldn't locate that region.",
        );
        setShowChartState('error');
      }
    }, 420);
  };

  const whyLineFor = (node: EvidenceLaneNode) =>
    hindi
      ? `${node.icon} ${node.label} — yahi reason hai.`
      : `${node.icon} ${node.label} — this is why Wolf is watching it.`;

  const goWhyStep = (step: number) => {
    const s = Math.max(0, Math.min(evidenceLane.length - 1, step));
    setWhyStep(s);
    setWhyWalk(true);
    setFollowWolf(true);
    setFocusOnly(true);
    setSheet(null);
    const node = evidenceLane[s];
    if (node?.evidence) {
      focusEvidence(node.id, node.evidence);
    } else if (node) {
      setFocusId(node.id);
      setActiveTab('full');
    }
    setActionHint(whyLineFor(node));
  };

  const startWhyWalk = () => {
    if (!evidenceLane.length) return;
    setPhase('live');
    goWhyStep(0);
  };

  const applyTourStep = (step: number) => {
    const s = Math.max(0, Math.min(tourSteps.length - 1, step));
    setTourStep(s);
    const item = tourSteps[s];
    if (!item?.bbox) {
      setFollowState('error');
      setActionError(hindi ? 'Wolf us region pin nahi kar paya.' : "Wolf couldn't locate that region.");
      return;
    }
    setFollowWolf(true);
    setFollowState('following');
    setPhase('live');
    setFocusOnly(true);
    setFocusId(item.evidence?.id || item.id);
    if (tabs.some((t) => t.id === item.id)) setActiveTab(item.id);
    setActionHint(item.line);
    setActionError(null);
    canvasRef.current?.focusNormalized(item.bbox, true);
  };

  const startFollowTour = () => {
    if (!tourSteps.length) {
      setFollowState('error');
      setActionError(
        hindi
          ? 'Follow Wolf ke liye chart marks chahiye.'
          : 'Wolf needs chart marks before a guided tour.',
      );
      return;
    }
    setWhyWalk(false);
    setSheet(null);
    applyTourStep(0);
  };

  const pauseFollowTour = () => {
    setFollowState('paused');
    setFollowWolf(false);
  };

  const resumeFollowTour = () => {
    applyTourStep(tourStep);
  };

  const exitFollowTour = () => {
    setFollowState('idle');
    setFollowWolf(false);
    setTourStep(0);
    setFocusOnly(false);
    setActionHint(null);
    canvasRef.current?.reset();
  };

  const nextFollowTour = () => {
    if (tourStep >= tourSteps.length - 1) {
      setFollowState('completed');
      setFollowWolf(false);
      setActionHint(hindi ? 'Tour complete.' : 'Wolf tour complete.');
      return;
    }
    applyTourStep(tourStep + 1);
  };

  const showRiskOnChart = () => {
    const invTab = tabs.find((t) => /invalid|stop/i.test(t.id));
    const ev = invTab?.evidence || tabs.find((t) => t.ok === false)?.evidence || tabs[0]?.evidence;
    if (ev) {
      applyEvidenceFocus(ev, invTab?.label || 'invalidation');
    } else {
      showFullChart();
      setActionError(
        hindi ? 'Risk region chart pe pin nahi ho payi.' : "Couldn't pin the risk region on chart.",
      );
    }
  };

  const handleChallenge = () => {
    setSheet('challenge');
    setMoreOpen(false);
    askWolf(
      '[CHALLENGE] Challenge my bias. Show ONE thing I may be missing on THIS chart (opposing liquidity/resistance/weak structure). Short + Next Action. Under 90 words.',
    );
  };

  const startReplay = () => {
    if (!tabs.length) return;
    setSheet('replay');
    setMoreOpen(false);
    setReplayIndex(0);
    setReplayPlaying(true);
    setPhase('live');
    setFollowWolf(true);
  };

  const resetReplay = () => {
    setReplayPlaying(false);
    setReplayIndex(0);
    showFullChart();
    setSheet(null);
  };

  const handleAskWolfAction = () => {
    setMoreOpen(false);
    if (onAskWolf) {
      onAskWolf();
      return;
    }
    if (!hideAskDock) {
      askInputRef.current?.focus();
      askInputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    askWolf(
      '[ASK WOLF] User opened Ask Wolf from the setup card. Invite one focused follow-up about THIS chart. Under 40 words.',
    );
  };

  const handleWhatIfChoice = (holds: boolean) => {
    setFollowWolf(true);
    const invTab = tabs.find((t) => /invalid|stop/i.test(t.id));
    if (invTab?.evidence) {
      focusEvidence(invTab.id, invTab.evidence);
    } else {
      const { match, label } = findShowEvidence();
      if (match) applyEvidenceFocus(match, label);
    }
    askWolf(
      holds
        ? '[WHAT-IF] Primary thesis HOLDS — price respects the key level. Locked template + Next Action. Under 80 words. Conditional only.'
        : '[WHAT-IF] Primary thesis FAILS — price breaks invalidation. Locked template + Next Action. Under 80 words. Conditional only.',
    );
    setSheet(null);
    setActionHint(
      holds
        ? hindi
          ? 'Scenario: primary level hold karta hai.'
          : 'Scenario: primary level holds.'
        : hindi
          ? 'Scenario: primary thesis fail hoti hai.'
          : 'Scenario: primary thesis fails.',
    );
  };

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

  const displayEvidence =
    focusOnly && focusItem
      ? evidenceLane.filter((n) => n.evidence?.id === focusItem.id || n.id === focusId).slice(0, 1)
      : evidenceLane;

  const currentWhy = evidenceLane[whyStep];
  const showChartLabel =
    showChartState === 'loading'
      ? 'FOCUSING…'
      : showChartState === 'success'
        ? 'SHOWING'
        : wolfActionLabel('SHOW_ON_CHART');

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
              ref={canvasRef}
              focusBbox={followWolf ? focusItem?.bbox || null : null}
              followWolf={followWolf}
              drawMode={drawMode}
              drawTool={drawTool}
              drawings={drawings}
              onDrawingsChange={setDrawings}
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
                  marks={evidence}
                  focusBbox={focusItem?.bbox || null}
                  focusLabel={focusItem?.title || null}
                  dimUnfocused={Boolean(followWolf || focusOnly || whyWalk)}
                  onMarkClick={(id) => {
                    const item = evidence.find((e) => e.id === id);
                    if (!item) return;
                    setFollowWolf(true);
                    setFocusId(id);
                    setFocusOnly(true);
                    setActionHint(
                      hindi
                        ? `YEH ${item.title} — isi pe nazar.`
                        : `THIS is the ${item.title} I'm watching.`,
                    );
                    canvasRef.current?.focusNormalized(item.bbox, true);
                  }}
                />
              ) : (
                <div className="wolf-desk__empty">Upload a chart.</div>
              )}
            </WolfChartCanvas>

            <AnimatePresence>
              {drawMode ? (
                <motion.div
                  className="wolf-split__drawbar"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  role="toolbar"
                  aria-label="Drawing tools"
                >
                  {DRAW_TOOLS.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      className={drawTool === tool.id ? 'is-on' : ''}
                      onClick={() => setDrawTool(tool.id)}
                    >
                      {tool.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => canvasRef.current?.undoDrawing()}>
                    UNDO
                  </button>
                  <button type="button" onClick={() => canvasRef.current?.clearDrawings()}>
                    CLEAR
                  </button>
                  <button
                    type="button"
                    className="is-done"
                    onClick={() => {
                      setDrawMode(false);
                      canvasRef.current?.clearDraft();
                    }}
                  >
                    DONE
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {phase === 'tease' ? (
                <motion.div
                  className="wolf-split__tease"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <p>{hindi ? 'Ek second… kuch mila.' : 'Wait — I found something.'}</p>
                  <WolfActButton id="SHOW_ON_CHART" onClick={showOnChart}>
                    {wolfActionLabel('SHOW_ON_CHART')}
                  </WolfActButton>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {whyWalk && currentWhy && phase === 'live' ? (
                <motion.div
                  className="wolf-split__guide"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  <div className="wolf-split__guide-k">
                    WHY? · {whyStep + 1}/{evidenceLane.length}
                  </div>
                  <p>{actionHint || whyLineFor(currentWhy)}</p>
                  <div className="wolf-split__guide-nav">
                    <button
                      type="button"
                      disabled={whyStep <= 0}
                      onClick={() => goWhyStep(whyStep - 1)}
                    >
                      BACK
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (whyStep >= evidenceLane.length - 1) {
                          setWhyWalk(false);
                          setActionHint(null);
                          return;
                        }
                        goWhyStep(whyStep + 1);
                      }}
                    >
                      {whyStep >= evidenceLane.length - 1 ? 'DONE' : 'NEXT'}
                    </button>
                    <button
                      type="button"
                      className="is-ghost"
                      onClick={() => {
                        setWhyWalk(false);
                        setActionHint(null);
                      }}
                    >
                      CLOSE
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {(followState === 'following' || followState === 'paused') && tourSteps[tourStep] ? (
                <motion.div
                  className="wolf-split__guide"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  <div className="wolf-split__guide-k">
                    FOLLOW WOLF · {tourStep + 1}/{tourSteps.length}
                    {followState === 'paused' ? ' · PAUSED' : ''}
                  </div>
                  <p>{tourSteps[tourStep]?.line}</p>
                  <div className="wolf-split__guide-nav">
                    <button
                      type="button"
                      disabled={tourStep <= 0}
                      onClick={() => applyTourStep(tourStep - 1)}
                    >
                      ← BACK
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        followState === 'paused' ? resumeFollowTour() : pauseFollowTour()
                      }
                    >
                      {followState === 'paused' ? '▶ RESUME' : '⏸ PAUSE'}
                    </button>
                    <button type="button" onClick={nextFollowTour}>
                      NEXT →
                    </button>
                    <button type="button" className="is-ghost" onClick={exitFollowTour}>
                      EXIT
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
                  <button type="button" className="is-ghost" onClick={() => setSheet(null)}>
                    Close
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="wolf-split__cam">
            <WolfActButton
              id="FOLLOW_WOLF"
              state={
                followState === 'following'
                  ? 'active'
                  : followState === 'error'
                    ? 'error'
                    : followState === 'completed'
                      ? 'success'
                      : 'default'
              }
              className={followState === 'following' || followState === 'paused' ? 'is-on' : ''}
              onClick={() => {
                if (followState === 'idle' || followState === 'completed' || followState === 'error') {
                  startFollowTour();
                  return;
                }
                if (followState === 'following') {
                  pauseFollowTour();
                  return;
                }
                if (followState === 'paused') {
                  resumeFollowTour();
                }
              }}
              title="Guided analysis tour — Wolf moves the chart"
            >
              {wolfActionLabel('FOLLOW_WOLF', { followState, following: followWolf })}
            </WolfActButton>
            <WolfActButton
              id="DRAW"
              state={drawMode ? 'active' : 'default'}
              className={drawMode ? 'is-on' : ''}
              onClick={() => {
                setDrawMode((v) => {
                  const nextDraw = !v;
                  if (nextDraw && !drawTool) setDrawTool('line');
                  return nextDraw;
                });
              }}
            >
              <PenLine className="h-3.5 w-3.5" aria-hidden />
              {wolfActionLabel('DRAW', { drawing: drawMode })}
            </WolfActButton>
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

          <div className="wolf-split__eyebrow">WOLF&apos;S VIEW</div>

          <div className="wolf-desk__status wolf-split__status" role="status">
            <span className="wolf-desk__emoji">{ui.emoji}</span>
            <div>
              <div className="wolf-desk__title">{crisp.title}</div>
              {crisp.subtitle ? <div className="wolf-desk__sub">{crisp.subtitle}</div> : null}
            </div>
          </div>

          {actionHint ? (
            <p className="wolf-split__action-hint" role="status">
              {actionHint}
            </p>
          ) : null}

          {actionError ? (
            <div className="wolf-split__action-error" role="alert">
              <p>{actionError}</p>
              <div className="wolf-split__action-error-acts">
                <WolfActButton id="SHOW_ON_CHART" state="error" onClick={showOnChart}>
                  TRY AGAIN
                </WolfActButton>
                <button type="button" className="wolf-split__clear-focus" onClick={showFullChart}>
                  SHOW FULL CHART
                </button>
              </div>
            </div>
          ) : null}

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
              <button type="button" className="wolf-split__clear-focus" onClick={showFullChart}>
                SHOW ALL
              </button>
            ) : null}
          </section>

          <section className="wolf-desk__watch wolf-split__watch" aria-label="Next action">
            <div className="wolf-desk__watch-k">NEXT ACTION</div>
            <p className="wolf-desk__watch-m">{next.message}</p>
            {next.ifConfirmed ? <p className="wolf-desk__watch-n">{next.ifConfirmed}</p> : null}
          </section>

          <div className="wolf-split__primary">
            <WolfActButton
              id="SHOW_ON_CHART"
              state={showChartState}
              className="wolf-split__show"
              onClick={showOnChart}
              disabled={showChartState === 'loading'}
            >
              <Crosshair className="h-3.5 w-3.5" aria-hidden />
              {showChartLabel}
            </WolfActButton>
          </div>

          <div className="wolf-split__acts">
            <WolfActButton
              id="WHY"
              state={whyWalk ? 'active' : 'default'}
              onClick={startWhyWalk}
              disabled={!evidenceLane.length}
            >
              {wolfActionLabel('WHY')}
            </WolfActButton>
            <WolfActButton
              id="WHAT_IF"
              state={sheet === 'whatif' ? 'active' : 'default'}
              onClick={() => setSheet((s) => (s === 'whatif' ? null : 'whatif'))}
              disabled={!onWhatIf}
            >
              {wolfActionLabel('WHAT_IF')}
            </WolfActButton>
          </div>

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
                  onClick={() => handleWhatIfChoice(true)}
                >
                  PRIMARY HOLDS
                </button>
                <button
                  type="button"
                  className="wolf-desk__whatif-big is-break"
                  onClick={() => handleWhatIfChoice(false)}
                >
                  PRIMARY FAILS
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="wolf-split__more-menu">
            <button
              type="button"
              className={`wolf-split__more-toggle ${moreOpen ? 'is-open' : ''}`}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              More <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
            <AnimatePresence>
              {moreOpen ? (
                <motion.div
                  className="wolf-split__more-drop"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  <WolfActButton
                    id="EXPLAIN_MORE"
                    onClick={() => {
                      setSheet('explain');
                      setMoreOpen(false);
                    }}
                  >
                    {wolfActionLabel('EXPLAIN_MORE')}
                  </WolfActButton>
                  <WolfActButton id="CHALLENGE" onClick={handleChallenge}>
                    {wolfActionLabel('CHALLENGE')}
                  </WolfActButton>
                  <WolfActButton
                    id="REPLAY"
                    state={sheet === 'replay' ? 'active' : 'default'}
                    onClick={startReplay}
                    disabled={!tabs.length}
                  >
                    {wolfActionLabel('REPLAY')}
                  </WolfActButton>
                  <WolfActButton id="ASK_WOLF" onClick={handleAskWolfAction}>
                    {wolfActionLabel('ASK_WOLF')}
                  </WolfActButton>
                </motion.div>
              ) : null}
            </AnimatePresence>
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
                  ref={askInputRef}
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

      <AnimatePresence>
        {sheet === 'explain' ? (
          <motion.div
            className="wolf-split__overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-label="Explain more"
          >
            <div className="wolf-split__overlay-panel">
              <header className="wolf-split__overlay-head">
                <strong>{wolfActionLabel('EXPLAIN_MORE')}</strong>
                <button type="button" className="is-ghost" onClick={() => setSheet(null)}>
                  Close
                </button>
              </header>
              <div className="wolf-split__overlay-body">
                {(analysis.why || []).length ? (
                  <section>
                    <div className="wolf-desk__watch-k">DEEPER WHY</div>
                    <ul className="wolf-split__why-list">
                      {analysis.why.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <p className="wolf-split__insight">{insight}</p>
                )}
                <section className="wolf-split__plan">
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
                {analysis.alternative ? (
                  <p className="wolf-split__deeper-note">
                    <strong>Alternative:</strong> {analysis.alternative}
                  </p>
                ) : null}
                {analysis.assumptions ? (
                  <p className="wolf-split__deeper-note">{analysis.assumptions}</p>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet === 'challenge' ? (
          <motion.div
            className="wolf-split__overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-label="Challenge setup"
          >
            <div className="wolf-split__overlay-panel">
              <header className="wolf-split__overlay-head">
                <strong>{wolfActionLabel('CHALLENGE')}</strong>
                <button type="button" className="is-ghost" onClick={() => setSheet(null)}>
                  Close
                </button>
              </header>
              <div className="wolf-split__overlay-body">
                <p className="wolf-split__risk-k">⚠️ MAIN RISK</p>
                <p className="wolf-split__insight">{primaryRisk}</p>
                <WolfActButton
                  id="SHOW_ON_CHART"
                  className="wolf-split__show"
                  onClick={() => {
                    showRiskOnChart();
                    setSheet(null);
                  }}
                >
                  📍 SHOW RISK ON CHART
                </WolfActButton>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet === 'replay' ? (
          <motion.div
            className="wolf-split__overlay wolf-split__overlay--replay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-label="Replay the move"
          >
            <div className="wolf-split__overlay-panel">
              <header className="wolf-split__overlay-head">
                <strong>{wolfActionLabel('REPLAY')}</strong>
                <button type="button" className="is-ghost" onClick={resetReplay}>
                  Close
                </button>
              </header>
              <div className="wolf-split__overlay-body">
                <p className="wolf-split__replay-k">
                  {tabs[replayIndex]?.icon} {tabs[replayIndex]?.label || '—'} · {replayIndex + 1}/
                  {tabs.length}
                </p>
                <div className="wolf-split__replay-controls">
                  <button
                    type="button"
                    disabled={replayIndex <= 0}
                    onClick={() => setReplayIndex((i) => Math.max(0, i - 1))}
                    aria-label="Previous step"
                  >
                    ⏮
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplayPlaying((p) => !p)}
                    aria-label={replayPlaying ? 'Pause replay' : 'Play replay'}
                  >
                    {replayPlaying ? '⏸' : '▶'}
                  </button>
                  <button
                    type="button"
                    disabled={replayIndex >= tabs.length - 1}
                    onClick={() => setReplayIndex((i) => Math.min(tabs.length - 1, i + 1))}
                    aria-label="Next step"
                  >
                    ⏭
                  </button>
                  <button type="button" onClick={resetReplay}>
                    RESET
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
