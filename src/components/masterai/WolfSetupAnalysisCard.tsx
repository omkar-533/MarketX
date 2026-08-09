import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, MapPin, ShieldAlert, Target, OctagonX, Sparkles, Mic2, Crosshair } from 'lucide-react';
import {
  parseWolfSetupReply,
  wolfBiasLabel,
  wolfStatusTone,
  type WolfSetupAnalysis,
} from '../../utils/parseWolfSetupReply';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import type { WolfEvidenceItem } from '../../utils/wolfEvidence';
import {
  buildBullBearCases,
  buildEvidenceBars,
  buildVisualStory,
  loadWolfExperienceMode,
  saveWolfExperienceMode,
  type WolfExperienceMode,
} from '../../utils/wolfVisualStory';
import {
  buildCopilotChecklist,
  buildNextAction,
  buildTradeProgress,
  journeyDelta,
  loadJourney,
  pushJourneySnap,
  resolveTradeState,
  resolveUiStatus,
  speakNextActionScript,
  type WolfChecklistItem,
  type WolfNextAction,
} from '../../utils/wolfCopilot';
import ChatMarkdown from '../ChatMarkdown';
import ScreenshotAnnotOverlay from './ScreenshotAnnotOverlay';
import VisualStoryEngine from './VisualStoryEngine';
import WolfRadarPanel from './WolfRadarPanel';
import WolfTradeMap from './WolfTradeMap';
import WolfEvidenceGallery from './WolfEvidenceGallery';

export const WOLF_WHAT_IF_SCENARIOS = [
  { id: 'holds', label: '🟢 Price holds', prompt: 'Price HOLDS / rejects at the key level' },
  { id: 'breaks', label: '🔴 Price breaks', prompt: 'Price BREAKS the key level on this chart' },
  { id: 'sweep', label: 'Liquidity swept', prompt: 'Liquidity at the marked pool gets SWEPT' },
  { id: 'fail_bo', label: 'Breakout fails', prompt: 'The breakout FAILS / is a false break' },
  { id: 'retest_ok', label: 'Retest succeeds', prompt: 'A retest of the broken level SUCCEEDS' },
  { id: 'retest_fail', label: 'Retest fails', prompt: 'A retest of the level FAILS' },
] as const;

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

function PlanCard({
  icon,
  label,
  body,
  onFocus,
}: {
  icon: ReactNode;
  label: string;
  body: string;
  onFocus?: () => void;
}) {
  if (!body) return null;
  return (
    <button type="button" className="wolf-plan__card" onClick={onFocus}>
      <div className="wolf-plan__card-icon" aria-hidden>
        {icon}
      </div>
      <div className="wolf-plan__card-label">{label}</div>
      <div className="wolf-plan__card-body">{body}</div>
    </button>
  );
}

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: WolfExperienceMode;
  onChange: (m: WolfExperienceMode) => void;
}) {
  return (
    <div className="wolf-mode" role="tablist" aria-label="Experience mode">
      {(['copilot', 'quick', 'pro', 'teach'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          className={`wolf-mode__btn ${mode === m ? 'is-on' : ''}`}
          onClick={() => onChange(m)}
        >
          {m === 'copilot' ? 'COPILOT' : m.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function ChecklistRow({ items }: { items: WolfChecklistItem[] }) {
  return (
    <div className="wolf-check" role="list" aria-label="Setup checklist">
      {items.map((it) => (
        <div key={it.id} className="wolf-check__item" role="listitem">
          <span className="wolf-check__ico">{it.icon}</span>
          <span className="wolf-check__lab">{it.label}</span>
          <span
            className={`wolf-check__mark ${
              it.ok === true ? 'is-yes' : it.ok === false ? 'is-no' : 'is-na'
            }`}
          >
            {it.ok === true ? '✓' : it.ok === false ? '✕' : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

function WatchThisCard({
  next,
  onPinpoint,
}: {
  next: WolfNextAction;
  onPinpoint?: () => void;
}) {
  return (
    <div className="wolf-watch">
      <div className="wolf-watch__kicker">👁 {next.title}</div>
      <p className="wolf-watch__msg">{next.message}</p>
      {next.ifConfirmed ? <p className="wolf-watch__next">{next.ifConfirmed}</p> : null}
      {onPinpoint ? (
        <button type="button" className="wolf-watch__pin" onClick={onPinpoint}>
          <Crosshair className="h-3.5 w-3.5" />
          PINPOINT
        </button>
      ) : null}
    </div>
  );
}

function JourneyStrip() {
  const journey = loadJourney();
  const delta = journeyDelta(journey);
  if (!delta?.changed) return null;
  return (
    <div className="wolf-journey">
      <div className="wolf-journey__col">
        <span>BEFORE</span>
        <strong>{delta.previous.uiStatus}</strong>
        <p>{delta.previous.next}</p>
      </div>
      <div className="wolf-journey__arrow">↓</div>
      <div className="wolf-journey__col wolf-journey__col--now">
        <span>NOW</span>
        <strong>{delta.current.uiStatus}</strong>
        <p>{delta.current.next}</p>
      </div>
    </div>
  );
}

function ProgressRail({ checklist }: { checklist: WolfChecklistItem[] }) {
  const steps = buildTradeProgress(checklist);
  if (!steps.length) return null;
  return (
    <div className="wolf-prog" aria-label="Trade progress">
      {steps.map((s) => (
        <span
          key={s.label}
          className={`wolf-prog__step ${s.done ? 'is-done' : ''} ${s.current ? 'is-now' : ''}`}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

function BullBearDuel({ analysis }: { analysis: WolfSetupAnalysis }) {
  const { bull, bear, current } = useMemo(() => buildBullBearCases(analysis), [analysis]);
  return (
    <div className="wolf-duel">
      <div className="wolf-duel__grid">
        <div className="wolf-duel__card wolf-duel__card--bull">
          <div className="wolf-duel__lab">{bull.label}</div>
          <ul>
            {bull.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <strong>Evidence {bull.score}</strong>
        </div>
        <div className="wolf-duel__vs">VS</div>
        <div className="wolf-duel__card wolf-duel__card--bear">
          <div className="wolf-duel__lab">{bear.label}</div>
          <ul>
            {bear.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <strong>Evidence {bear.score}</strong>
        </div>
      </div>
      <p className="wolf-duel__current">{current}</p>
    </div>
  );
}

function EvidenceCarousel({ analysis }: { analysis: WolfSetupAnalysis }) {
  const cards = useMemo(() => {
    const out: { icon: string; title: string; body: string }[] = [];
    if (analysis.keyObservation) {
      out.push({ icon: '👁', title: 'OBSERVATION', body: analysis.keyObservation });
    }
    analysis.why.forEach((w, i) => {
      const icon = /liquid/i.test(w) ? '💧' : /sweep/i.test(w) ? '⚡' : /structure|bos|choch/i.test(w) ? '🧠' : '•';
      out.push({ icon, title: `EVIDENCE ${i + 1}`, body: w });
    });
    return out.slice(0, 6);
  }, [analysis]);

  if (!cards.length) return null;
  return (
    <div className="wolf-evidence">
      <div className="wolf-evidence__head">WHY THIS SETUP?</div>
      <div className="wolf-evidence__track">
        {cards.map((c) => (
          <article key={c.title + c.body} className="wolf-evidence__card">
            <span className="wolf-evidence__ico">{c.icon}</span>
            <div className="wolf-evidence__title">{c.title}</div>
            <p>{c.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function WantToSeeBar({
  onAction,
}: {
  onAction: (id: 'entry' | 'liquidity' | 'why' | 'invalidation' | 'target' | 'whatif' | 'explain') => void;
}) {
  const items = [
    { id: 'entry' as const, label: '📍 ENTRY' },
    { id: 'liquidity' as const, label: '💧 LIQUIDITY' },
    { id: 'why' as const, label: '🧠 WHY?' },
    { id: 'invalidation' as const, label: '🛑 INVALIDATION' },
    { id: 'target' as const, label: '🎯 TARGET' },
    { id: 'whatif' as const, label: '🔮 WHAT IF?' },
    { id: 'explain' as const, label: '🎙 EXPLAIN' },
  ];
  return (
    <div className="wolf-see">
      <div className="wolf-see__head">WHAT DO YOU WANT TO SEE?</div>
      <div className="wolf-see__row">
        {items.map((it) => (
          <button key={it.id} type="button" className="wolf-see__btn" onClick={() => onAction(it.id)}>
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WhatIfPanel({
  hindi,
  onWhatIf,
}: {
  hindi?: boolean;
  onWhatIf: (prompt: string) => void;
}) {
  return (
    <div className="wolf-whatif">
      <div className="wolf-whatif__head">
        <Sparkles className="h-3.5 w-3.5" />
        {hindi ? 'WHAT IF?' : 'WHAT IF?'}
      </div>
      <p className="wolf-whatif__sub">
        {hindi ? 'Scenario analysis — prediction nahi.' : 'Scenario analysis — not a prediction.'}
      </p>
      <div className="wolf-whatif__grid">
        {WOLF_WHAT_IF_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="wolf-whatif__btn"
            onClick={() =>
              onWhatIf(
                `[WHAT-IF] Scenario: ${s.prompt}. Reply with the SAME locked headings (Market Bias, Setup, Setup Status, Next Action, Entry Condition, Stop Loss Logic, Target Logic, Invalidation, Evidence Score, Why). Keep under 120 words. End with a short wolfchart if prices are readable. State this is a conditional scenario only.`,
              )
            }
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WhyWalkthrough({ analysis }: { analysis: WolfSetupAnalysis }) {
  const steps = useMemo(() => {
    const out: { title: string; body: string }[] = [];
    if (analysis.keyObservation) out.push({ title: 'KEY OBSERVATION', body: analysis.keyObservation });
    analysis.why.forEach((w, i) => out.push({ title: `STEP ${i + 1}`, body: w }));
    if (analysis.nextAction) out.push({ title: 'NEXT ACTION', body: analysis.nextAction });
    if (analysis.entry) out.push({ title: 'ENTRY', body: analysis.entry });
    if (analysis.invalidation) out.push({ title: 'INVALIDATION', body: analysis.invalidation });
    return out.slice(0, 6);
  }, [analysis]);
  const [step, setStep] = useState(0);
  if (!steps.length) return null;
  const current = steps[Math.min(step, steps.length - 1)];
  return (
    <div className="wolf-why">
      <div className="wolf-why__progress">
        {steps.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`wolf-why__dot ${i === step ? 'is-on' : ''} ${i < step ? 'is-done' : ''}`}
            onClick={() => setStep(i)}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={current.title + step}
          className="wolf-why__panel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
        >
          <div className="wolf-why__title">{current.title}</div>
          <p className="wolf-why__body">{current.body}</p>
        </motion.div>
      </AnimatePresence>
      <div className="wolf-why__nav">
        <button type="button" disabled={step <= 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </button>
        <button
          type="button"
          disabled={step >= steps.length - 1}
          onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** Wolf AI Trading Copilot — chart-first, next-action driven. */
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
  const [mode, setMode] = useState<WolfExperienceMode>(() => loadWolfExperienceMode());
  const [showWhy, setShowWhy] = useState(false);
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [detail, setDetail] = useState<'entry' | 'invalid' | 'target' | null>(null);
  const [hiLabel, setHiLabel] = useState<string | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [moviePlaying, setMoviePlaying] = useState(false);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const evidenceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveWolfExperienceMode(mode);
    if (mode === 'teach') setShowWhy(true);
    if (mode === 'quick' || mode === 'copilot') {
      setShowWhy(false);
      setShowWhatIf(false);
      setShowRaw(false);
    }
  }, [mode]);

  const story = useMemo(
    () => (analysis ? buildVisualStory(analysis, { levels, shapes }) : []),
    [analysis, levels, shapes],
  );
  const bars = useMemo(() => (analysis ? buildEvidenceBars(analysis) : null), [analysis]);
  const checklist = useMemo(
    () => (analysis ? buildCopilotChecklist(analysis, evidence) : []),
    [analysis, evidence],
  );
  const next = useMemo(
    () =>
      analysis
        ? buildNextAction(analysis, { nextActionField: analysis.nextAction })
        : null,
    [analysis],
  );
  const ui = useMemo(() => (analysis ? resolveUiStatus(analysis) : null), [analysis]);
  const activeEvidence = useMemo(
    () => evidence.find((e) => e.id === activeEvidenceId) || null,
    [evidence, activeEvidenceId],
  );

  useEffect(() => {
    if (!analysis || !next || !ui) return;
    pushJourneySnap({
      state: resolveTradeState(analysis),
      uiStatus: ui.status,
      bias: analysis.bias,
      setup: analysis.setup,
      next: next.message,
      headline: ui.headline,
    });
  }, [analysis, next, ui]);

  useEffect(() => {
    const step = story[storyIndex];
    if (step?.highlight) setHiLabel(step.highlight);
  }, [story, storyIndex]);

  const handleShowOnChart = (item: WolfEvidenceItem) => {
    setActiveEvidenceId(item.id);
    setHiLabel(item.title);
    evidenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const pinpointNext = () => {
    if (!next?.evidenceHint || !evidence.length) {
      setHiLabel(next?.message?.slice(0, 28) || 'WATCH');
      evidenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const hint = next.evidenceHint;
    const match =
      evidence.find((e) => e.type === hint) ||
      evidence.find((e) => new RegExp(hint, 'i').test(`${e.type} ${e.title}`));
    if (match) handleShowOnChart(match);
    else {
      setHiLabel(next.message.slice(0, 28));
      evidenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!analysis) {
    return (
      <div className="wolf-setup">
        {imageUrl ? (
          <ScreenshotAnnotOverlay
            imageUrl={imageUrl}
            levels={levels}
            shapes={shapes}
            focusBbox={activeEvidence?.bbox}
            focusLabel={activeEvidence ? `${activeEvidence.title}` : null}
          />
        ) : null}
        {imageUrl && evidence.length ? (
          <div ref={evidenceRef}>
            <WolfEvidenceGallery
              originalUrl={imageUrl}
              evidence={evidence}
              activeId={activeEvidenceId}
              onShowOnChart={handleShowOnChart}
              hindi={hindi}
            />
          </div>
        ) : null}
        <ChatMarkdown text={text} />
      </div>
    );
  }

  const tone = wolfStatusTone(analysis.status, analysis.bias);
  const statusLine =
    analysis.status === 'DEVELOPING' || analysis.status === 'WAITING'
      ? `${wolfBiasLabel(analysis.bias)} DEVELOPING`
      : analysis.status === 'CONFIRMED'
        ? `${wolfBiasLabel(analysis.bias)} CONFIRMED`
        : analysis.status === 'INVALIDATED'
          ? 'SETUP INVALIDATED'
          : analysis.status === 'NO_TRADE' || analysis.bias === 'NO_TRADE'
            ? 'NO TRADE'
            : wolfBiasLabel(analysis.bias);

  const speakBrief = () => {
    if (next) {
      onSpeak?.(speakNextActionScript(analysis, next, hindi));
      return;
    }
    onSpeak?.(
      [statusLine, analysis.setup, analysis.keyObservation, analysis.entry, analysis.stopLoss, analysis.target]
        .filter(Boolean)
        .join('. '),
    );
  };

  const onSee = (id: 'entry' | 'liquidity' | 'why' | 'invalidation' | 'target' | 'whatif' | 'explain') => {
    if (id === 'why') setShowWhy(true);
    if (id === 'whatif') setShowWhatIf(true);
    if (id === 'explain') speakBrief();
    if (id === 'entry') {
      setDetail('entry');
      setHiLabel('ENTRY ZONE');
      const i = story.findIndex((s) => s.type === 'entry');
      if (i >= 0) setStoryIndex(i);
      const ev = evidence.find((e) => e.type === 'entry');
      if (ev) handleShowOnChart(ev);
    }
    if (id === 'liquidity') {
      const i = story.findIndex((s) => s.type === 'liquidity' || s.type === 'sweep');
      if (i >= 0) setStoryIndex(i);
      const ev = evidence.find((e) => e.type === 'liquidity' || e.type === 'sweep');
      if (ev) handleShowOnChart(ev);
    }
    if (id === 'invalidation') {
      setDetail('invalid');
      setHiLabel(null);
      const i = story.findIndex((s) => s.type === 'invalidation');
      if (i >= 0) setStoryIndex(i);
      const ev = evidence.find((e) => e.type === 'invalidation');
      if (ev) handleShowOnChart(ev);
    }
    if (id === 'target') {
      setDetail('target');
      const i = story.findIndex((s) => s.type === 'target');
      if (i >= 0) setStoryIndex(i);
      const ev = evidence.find((e) => e.type === 'target');
      if (ev) handleShowOnChart(ev);
    }
  };

  /** COPILOT — one-screen default */
  if (mode === 'copilot' && ui && next) {
    return (
      <div className={`wolf-setup wolf-setup--copilot wolf-setup--${tone}`}>
        <div className="wolf-copilot__brand">
          <span>🐺 WOLF AI</span>
          <span className="wolf-copilot__tag">SEE · KNOW THE NEXT MOVE</span>
        </div>
        <ModeSwitch mode={mode} onChange={setMode} />

        <div className="wolf-copilot__status" role="status">
          <span className="wolf-copilot__emoji">{ui.emoji}</span>
          <div>
            <div className="wolf-copilot__badge">{ui.label}</div>
            <div className="wolf-copilot__headline">{ui.headline}</div>
          </div>
        </div>

        {analysis.setup ? <div className="wolf-setup__name">{analysis.setup}</div> : null}

        <div ref={evidenceRef} className="wolf-copilot__chart">
          {imageUrl ? (
            <ScreenshotAnnotOverlay
              imageUrl={imageUrl}
              levels={levels}
              shapes={shapes}
              highlightLabel={hiLabel}
              focusBbox={activeEvidence?.bbox}
              focusLabel={activeEvidence ? activeEvidence.title : null}
            />
          ) : null}
        </div>

        <ChecklistRow items={checklist} />
        <ProgressRail checklist={checklist} />

        <WatchThisCard next={next} onPinpoint={imageUrl ? pinpointNext : undefined} />

        <JourneyStrip />

        <div className="wolf-copilot__plan">
          <button type="button" className={`wolf-copilot__chip ${detail === 'entry' ? 'is-on' : ''}`} onClick={() => onSee('entry')}>
            📍 ENTRY
          </button>
          <button
            type="button"
            className={`wolf-copilot__chip ${detail === 'invalid' ? 'is-on' : ''}`}
            onClick={() => onSee('invalidation')}
          >
            🛑 INVALID
          </button>
          <button
            type="button"
            className={`wolf-copilot__chip ${detail === 'target' ? 'is-on' : ''}`}
            onClick={() => onSee('target')}
          >
            🎯 TARGET
          </button>
        </div>

        <AnimatePresence>
          {detail ? (
            <motion.div
              className="wolf-copilot__sheet"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {detail === 'entry' ? (
                <>
                  <strong>📍 ENTRY CONDITION</strong>
                  <p>{analysis.entry || 'Conditional — wait for confirmation.'}</p>
                </>
              ) : null}
              {detail === 'invalid' ? (
                <>
                  <strong>🛑 INVALIDATION</strong>
                  <p>{analysis.invalidation || analysis.stopLoss || 'Level not specified.'}</p>
                </>
              ) : null}
              {detail === 'target' ? (
                <>
                  <strong>🎯 TARGET</strong>
                  <p>{analysis.target || 'Next liquidity / structure.'}</p>
                </>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="wolf-setup__actions wolf-setup__actions--compact">
          <button type="button" className="wolf-setup__btn" onClick={() => setShowWhy((v) => !v)}>
            <Eye className="h-3.5 w-3.5" />
            WHY?
          </button>
          {onWhatIf ? (
            <button type="button" className="wolf-setup__btn" onClick={() => setShowWhatIf((v) => !v)}>
              <Sparkles className="h-3.5 w-3.5" />
              WHAT IF?
            </button>
          ) : null}
          {onSpeak ? (
            <button type="button" className="wolf-setup__btn wolf-setup__btn--ghost" onClick={speakBrief}>
              <Mic2 className="h-3.5 w-3.5" />
              EXPLAIN
            </button>
          ) : null}
          {imageUrl && evidence.length ? (
            <button
              type="button"
              className="wolf-setup__btn wolf-setup__btn--ghost"
              onClick={() => setShowEvidence((v) => !v)}
            >
              EVIDENCE
            </button>
          ) : null}
        </div>

        <AnimatePresence>
          {showWhy ? (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <WhyWalkthrough analysis={analysis} />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence>
          {showWhatIf && onWhatIf ? (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <WhatIfPanel hindi={hindi} onWhatIf={onWhatIf} />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence>
          {showEvidence && imageUrl && evidence.length ? (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <WolfEvidenceGallery
                originalUrl={imageUrl}
                evidence={evidence}
                activeId={activeEvidenceId}
                onShowOnChart={handleShowOnChart}
                hindi={hindi}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  /** QUICK — Wolf Call only */
  if (mode === 'quick') {
    return (
      <div className={`wolf-setup wolf-setup--${tone}`}>
        <ModeSwitch mode={mode} onChange={setMode} />
        {imageUrl ? (
          <ScreenshotAnnotOverlay
            imageUrl={imageUrl}
            levels={levels}
            shapes={shapes}
            highlightLabel={hiLabel}
            focusBbox={activeEvidence?.bbox}
            focusLabel={activeEvidence ? activeEvidence.title : null}
          />
        ) : null}
        <div className="wolf-call">
          <div className="wolf-call__mark">🐺 WOLF CALL</div>
          <div className="wolf-setup__status" role="status">
            <span className="wolf-setup__status-dot" aria-hidden />
            <span>{statusLine}</span>
          </div>
          {analysis.setup ? <div className="wolf-setup__name">{analysis.setup}</div> : null}
          {next ? <p className="wolf-call__watch">👁 {next.message}</p> : null}
          <div className="wolf-call__lines">
            {analysis.entry ? <p>Entry → {analysis.entry}</p> : null}
            {analysis.stopLoss ? <p>SL → {analysis.stopLoss}</p> : null}
            {analysis.target ? <p>Target → {analysis.target}</p> : null}
          </div>
        </div>
        <WantToSeeBar onAction={onSee} />
      </div>
    );
  }

  return (
    <div className={`wolf-setup wolf-setup--${tone}`}>
      <ModeSwitch mode={mode} onChange={setMode} />

      <div ref={evidenceRef}>
        {mode === 'teach' || mode === 'pro' ? (
          <VisualStoryEngine
            steps={story}
            imageUrl={imageUrl}
            levels={levels}
            shapes={shapes}
            index={storyIndex}
            onIndexChange={setStoryIndex}
            playing={moviePlaying}
            onPlayingChange={setMoviePlaying}
            hindi={hindi}
            focusBbox={activeEvidence?.bbox}
            focusLabel={activeEvidence ? `${activeEvidence.title}` : null}
          />
        ) : imageUrl ? (
          <ScreenshotAnnotOverlay
            imageUrl={imageUrl}
            levels={levels}
            shapes={shapes}
            highlightLabel={hiLabel}
            focusBbox={activeEvidence?.bbox}
            focusLabel={activeEvidence ? `${activeEvidence.title}` : null}
          />
        ) : null}
      </div>

      <div className="wolf-setup__status" role="status">
        <span className="wolf-setup__status-dot" aria-hidden />
        <span>{statusLine}</span>
      </div>

      {analysis.setup ? <div className="wolf-setup__name">{analysis.setup}</div> : null}
      {next ? <WatchThisCard next={next} onPinpoint={imageUrl ? pinpointNext : undefined} /> : null}
      {analysis.keyObservation ? <p className="wolf-setup__obs">{analysis.keyObservation}</p> : null}

      {imageUrl && evidence.length ? (
        <WolfEvidenceGallery
          originalUrl={imageUrl}
          evidence={evidence}
          activeId={activeEvidenceId}
          onShowOnChart={handleShowOnChart}
          hindi={hindi}
        />
      ) : null}

      {bars ? <WolfRadarPanel bars={bars} /> : null}

      <EvidenceCarousel analysis={analysis} />

      <WolfTradeMap
        entry={analysis.entry}
        stopLoss={analysis.stopLoss}
        target={analysis.target}
        invalidation={analysis.invalidation}
        onFocus={(kind) => {
          if (kind === 'entry') onSee('entry');
          if (kind === 'target') onSee('target');
          if (kind === 'invalidation' || kind === 'sl') onSee('invalidation');
        }}
      />

      {mode === 'pro' ? (
        <div className="wolf-plan">
          <PlanCard icon={<MapPin className="h-4 w-4" />} label="ENTRY" body={analysis.entry} onFocus={() => onSee('entry')} />
          <PlanCard
            icon={<ShieldAlert className="h-4 w-4" />}
            label="SL"
            body={analysis.stopLoss}
            onFocus={() => onSee('invalidation')}
          />
          <PlanCard icon={<Target className="h-4 w-4" />} label="TARGET" body={analysis.target} onFocus={() => onSee('target')} />
          <PlanCard
            icon={<OctagonX className="h-4 w-4" />}
            label="INVALIDATION"
            body={analysis.invalidation}
            onFocus={() => onSee('invalidation')}
          />
        </div>
      ) : null}

      {(mode === 'pro' || mode === 'teach') &&
      (analysis.bias === 'LONG' || analysis.bias === 'SHORT' || analysis.bias === 'WAIT') ? (
        <BullBearDuel analysis={analysis} />
      ) : null}

      <div className="wolf-setup__actions">
        <button type="button" className="wolf-setup__btn" onClick={() => setShowWhy((v) => !v)}>
          <Eye className="h-3.5 w-3.5" />
          {showWhy ? 'Hide walkthrough' : 'SHOW ME WHY'}
        </button>
        {onWhatIf ? (
          <button type="button" className="wolf-setup__btn" onClick={() => setShowWhatIf((v) => !v)}>
            <Sparkles className="h-3.5 w-3.5" />
            {showWhatIf ? 'Hide What-If' : 'WHAT IF?'}
          </button>
        ) : null}
        {onSpeak ? (
          <button type="button" className="wolf-setup__btn wolf-setup__btn--ghost" onClick={speakBrief}>
            <Mic2 className="h-3.5 w-3.5" />
            PLAY AI
          </button>
        ) : null}
        <button type="button" className="wolf-setup__btn wolf-setup__btn--ghost" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Hide detail' : 'Full detail'}
        </button>
      </div>

      <AnimatePresence>
        {showWhy ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <WhyWalkthrough analysis={analysis} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showWhatIf && onWhatIf ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <WhatIfPanel hindi={hindi} onWhatIf={onWhatIf} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <WantToSeeBar onAction={onSee} />

      {showRaw ? (
        <div className="wolf-setup__raw">
          <ChatMarkdown text={text} />
        </div>
      ) : null}
    </div>
  );
}
