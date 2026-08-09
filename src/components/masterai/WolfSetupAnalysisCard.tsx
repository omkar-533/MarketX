import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair, Eye, Mic2, Play, Sparkles, Swords, HelpCircle, PenLine } from 'lucide-react';
import { parseWolfSetupReply } from '../../utils/parseWolfSetupReply';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import type { NormalizedBBox, WolfEvidenceItem } from '../../utils/wolfEvidence';
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
import WolfChartCanvas from './WolfChartCanvas';

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
};

type Sheet = 'why' | 'whatif' | 'entry' | 'invalid' | 'target' | 'miss' | 'radial' | null;

/**
 * Living Wolf analyst desk — chart is the stage.
 * Reveal → explore → ask. No mode switcher.
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
  const [phase, setPhase] = useState<'tease' | 'live'>('tease');
  const [activeTab, setActiveTab] = useState<string>('full');
  const [cropMap, setCropMap] = useState<Record<string, RenderedEvidence>>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [revealStep, setRevealStep] = useState(-1);
  const [replayOn, setReplayOn] = useState(false);
  const [buildStep, setBuildStep] = useState(0);
  const [explainLevel, setExplainLevel] = useState(1);
  const [ask, setAsk] = useState('');
  const [drawMode, setDrawMode] = useState(false);
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
  const progress = useMemo(() => buildTradeProgress(checklist), [checklist]);
  const delta = useMemo(() => journeyDelta(loadJourney()), [analysis?.raw]);

  const askWolf = (prompt: string) => {
    onWhatIf?.(prompt);
  };

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
    setRevealStep(-1);
    setBuildStep(0);
    setExplainLevel(1);
    const t = window.setTimeout(() => setPhase('live'), 900);
    return () => window.clearTimeout(t);
  }, [analysis?.raw]);

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

  // Cinematic / replay auto-walk through evidence
  useEffect(() => {
    if (!replayOn || !tabs.length) return;
    setActiveTab(tabs[0].id);
    setRevealStep(0);
    setFocusId(tabs[0].evidence?.id || null);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      if (i >= tabs.length) {
        window.clearInterval(id);
        setReplayOn(false);
        setActiveTab('full');
        setRevealStep(-1);
        return;
      }
      setRevealStep(i);
      setActiveTab(tabs[i].id);
      setFocusId(tabs[i].evidence?.id || null);
    }, 2200);
    return () => window.clearInterval(id);
  }, [replayOn, tabs]);

  if (!analysis || !ui || !next || !crisp) {
    return (
      <div className="wolf-desk">
        {imageUrl ? (
          <WolfChartCanvas>
            <ScreenshotAnnotOverlay imageUrl={imageUrl} levels={levels} shapes={shapes} />
          </WolfChartCanvas>
        ) : null}
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

  const showMe = () => {
    setPhase('live');
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
    } else {
      setActiveTab('full');
      setFocusId(null);
    }
    setSheet(null);
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

  const buildSteps = [
    { id: 'ctx', label: 'Context', line: crisp.subtitle || analysis.setup || 'Chart context' },
    { id: 'liq', label: 'Liquidity', line: hindi ? 'Yahan liquidity.' : 'Liquidity here.' },
    { id: 'trig', label: 'Trigger', line: next.message },
    { id: 'entry', label: 'Entry', line: analysis.entry || 'Conditional entry' },
    { id: 'inv', label: 'Invalid', line: analysis.invalidation || analysis.stopLoss || 'Break kills thesis' },
    { id: 'tgt', label: 'Target', line: analysis.target || 'Next liquidity' },
  ];

  const explainLines =
    explainLevel === 1
      ? [next.message, hindi ? 'Confirmation pending.' : 'Confirmation still pending.']
      : explainLevel === 2
        ? [
            hindi ? 'Price ko ye level todna / hold karna hai.' : 'Price must break or hold this level.',
            next.ifConfirmed || '',
          ]
        : explainLevel === 3
          ? [hindi ? 'Dekho — camera move. Yahi zone.' : 'Watch — camera moves to this zone.', next.message]
          : [
              hindi
                ? 'Door ke jaisa: pehle sweep, phir break, phir entry.'
                : 'Like a door: sweep first, then break, then entry.',
            ];

  const onSelectRegion = (bbox: NormalizedBBox) => {
    setDrawMode(false);
    askWolf(
      `[CHART REGION] Analyze this user-marked area only (normalized bbox ${bbox.x.toFixed(2)},${bbox.y.toFixed(2)} ${bbox.width.toFixed(2)}x${bbox.height.toFixed(2)}). Short locked template + Next Action. Under 90 words.`,
    );
  };

  return (
    <div className={`wolf-desk wolf-desk--live wolf-desk--${tone}`}>
      <header className="wolf-desk__top">
        <span className="wolf-desk__brand">🐺 WOLF</span>
        <span className="wolf-desk__meta">{analysis.setup ? analysis.setup.slice(0, 18) : 'CHART'}</span>
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

      <AnimatePresence>
        {phase === 'tease' ? (
          <motion.div
            className="wolf-desk__tease"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p>{hindi ? 'Ek second… kuch mila.' : 'Wait — I found something.'}</p>
            <button type="button" onClick={() => setPhase('live')}>
              SHOW ME
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className={`wolf-desk__stage wolf-desk__stage--hero ${phase === 'tease' ? 'is-dim' : ''}`}>
        <WolfChartCanvas
          focusBbox={focusItem?.bbox || null}
          drawMode={drawMode}
          onSelectRegion={onSelectRegion}
          onPoint={(x, y) => {
            setRadial({ x, y });
            setSheet('radial');
          }}
        >
          <AnimatePresence mode="wait">
            {activeCrop ? (
              <motion.div
                key={activeTab}
                className="wolf-desk__zoom"
                initial={{ opacity: 0.35, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0.25 }}
                transition={{ duration: 0.28 }}
              >
                <img src={activeCrop.imageUrl} alt="" draggable={false} />
                <div className="wolf-desk__zoom-cap">
                  {activeTabMeta?.icon} {activeTabMeta?.label}
                  <p>
                    {revealStep >= 0 && activeTabMeta
                      ? hindi
                        ? `Yahan — ${activeTabMeta.label}.`
                        : `Here — ${activeTabMeta.label}.`
                      : activeCrop.description?.slice(0, 64) || ''}
                  </p>
                </div>
              </motion.div>
            ) : imageUrl ? (
              <motion.div key="full" initial={{ opacity: 0.5 }} animate={{ opacity: 1 }}>
                <ScreenshotAnnotOverlay
                  imageUrl={imageUrl}
                  levels={levels}
                  shapes={shapes}
                  focusBbox={focusItem?.bbox || null}
                  focusLabel={focusItem?.title || activeTabMeta?.label || null}
                />
              </motion.div>
            ) : (
              <div className="wolf-desk__empty">Upload a chart.</div>
            )}
          </AnimatePresence>
        </WolfChartCanvas>

        {focusItem && activeTab === 'full' ? (
          <div className="wolf-desk__float" style={{ left: `${(focusItem.bbox.x + focusItem.bbox.width / 2) * 100}%`, top: `${focusItem.bbox.y * 100}%` }}>
            {focusItem.title.slice(0, 18)}
          </div>
        ) : null}
      </div>

      {tabs.length ? (
        <div className="wolf-switch" role="tablist" aria-label="Evidence">
          <button
            type="button"
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
              className={`wolf-switch__tab ${activeTab === t.id ? 'is-on' : ''}`}
              onClick={() => {
                setActiveTab(t.id);
                setFocusId(t.evidence?.id || null);
                setPhase('live');
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              <span className={`wolf-switch__mark ${t.ok === true ? 'is-yes' : t.ok === false ? 'is-no' : 'is-na'}`}>
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
        <p className="wolf-desk__watch-m">{explainLines.filter(Boolean)[0] || next.message}</p>
        {explainLevel > 1 ? (
          <p className="wolf-desk__watch-n">{explainLines.filter(Boolean)[1] || next.ifConfirmed}</p>
        ) : next.ifConfirmed ? (
          <p className="wolf-desk__watch-n">{next.ifConfirmed}</p>
        ) : null}
        <div className="wolf-desk__watch-row">
          <button type="button" className="wolf-desk__pin" onClick={showMe}>
            <Crosshair className="h-3.5 w-3.5" />
            SHOW
          </button>
          <button
            type="button"
            className="wolf-desk__pin is-soft"
            onClick={() => setExplainLevel((n) => Math.min(4, n + 1))}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            {hindi ? 'SAMJHA NAHI' : "I DON'T GET IT"}
          </button>
        </div>
      </div>

      <div className="wolf-desk__map">
        <button type="button" className={sheet === 'entry' ? 'is-on' : ''} onClick={() => setSheet((s) => (s === 'entry' ? null : 'entry'))}>
          📍 ENTRY
        </button>
        <button type="button" className={sheet === 'invalid' ? 'is-on' : ''} onClick={() => setSheet((s) => (s === 'invalid' ? null : 'invalid'))}>
          🛑 INVALID
        </button>
        <button type="button" className={sheet === 'target' ? 'is-on' : ''} onClick={() => setSheet((s) => (s === 'target' ? null : 'target'))}>
          🎯 TARGET
        </button>
      </div>

      <AnimatePresence>
        {sheet === 'entry' || sheet === 'invalid' || sheet === 'target' ? (
          <motion.div className="wolf-desk__sheet" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            {sheet === 'entry' ? (
              <>
                <strong>📍 ENTRY</strong>
                <p>{analysis.entry || (hindi ? 'Pehle confirmation.' : 'Confirmation first.')}</p>
                <button type="button" onClick={showMe}>
                  SHOW
                </button>
              </>
            ) : null}
            {sheet === 'invalid' ? (
              <>
                <strong>🛑 INVALID</strong>
                <p>{analysis.invalidation || analysis.stopLoss || 'Level unclear.'}</p>
                <button type="button" onClick={showMe}>
                  PINPOINT
                </button>
              </>
            ) : null}
            {sheet === 'target' ? (
              <>
                <strong>🎯 TARGET</strong>
                <p>{analysis.target || 'Next liquidity.'}</p>
                <button type="button" onClick={showMe}>
                  SHOW
                </button>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet === 'why' ? (
          <motion.div className="wolf-desk__why" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            {whyChain.map((node, i) => (
              <button
                key={node.id}
                type="button"
                className="wolf-desk__why-node"
                onClick={() => {
                  if (tabs.some((t) => t.id === node.id)) setActiveTab(node.id);
                  if (node.evidence) setFocusId(node.evidence.id);
                  setSheet(null);
                }}
              >
                <span>
                  {node.icon} {node.label} {node.ok === true ? '✓' : node.ok === false ? '✕' : '?'}
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
          <motion.div className="wolf-desk__whatif" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
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
              🟢 HOLDS
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
              🔴 BREAKS
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sheet === 'miss' ? (
          <motion.div className="wolf-desk__sheet" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <strong>⚠️ ONE THING YOU MAY BE MISSING</strong>
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

      <AnimatePresence>
        {sheet === 'radial' && radial ? (
          <motion.div
            className="wolf-desk__radial"
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
              👀 WHAT IS THIS?
            </button>
            <button
              type="button"
              onClick={() => {
                setSheet('why');
              }}
            >
              🧠 WHY?
            </button>
            <button
              type="button"
              onClick={() => {
                setSheet('whatif');
              }}
            >
              🔮 WHAT IF?
            </button>
            <button type="button" className="is-ghost" onClick={() => setSheet(null)}>
              Close
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="wolf-desk__build">
        <button
          type="button"
          onClick={() => {
            const nextStep = Math.min(buildSteps.length - 1, buildStep + 1);
            setBuildStep(nextStep);
            if (nextStep === 1 && tabs[0]) {
              setActiveTab(tabs[0].id);
              setFocusId(tabs[0].evidence?.id || null);
            } else if (nextStep >= 2) showMe();
          }}
        >
          🐺 BUILD {buildStep + 1}/{buildSteps.length}: {buildSteps[buildStep].label}
        </button>
        <p>{buildSteps[buildStep].line}</p>
      </div>

      {/* Ask Wolf dock — max 4 primary actions */}
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
        <div className="wolf-dock__acts">
          <button type="button" onClick={showMe}>
            <Eye className="h-3.5 w-3.5" />
            SHOW
          </button>
          <button type="button" onClick={() => setSheet((s) => (s === 'why' ? null : 'why'))}>
            WHY?
          </button>
          {onWhatIf ? (
            <button type="button" onClick={() => setSheet((s) => (s === 'whatif' ? null : 'whatif'))}>
              <Sparkles className="h-3.5 w-3.5" />
              WHAT IF?
            </button>
          ) : null}
          <button type="button" onClick={() => setSheet((s) => (s === 'miss' ? null : 'miss'))}>
            <Swords className="h-3.5 w-3.5" />
            CHALLENGE
          </button>
        </div>
        <div className="wolf-dock__more">
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
          <button
            type="button"
            className={drawMode ? 'is-on' : ''}
            onClick={() => setDrawMode((v) => !v)}
          >
            <PenLine className="h-3.5 w-3.5" />
            DRAW
          </button>
        </div>
      </div>
    </div>
  );
}
