import { useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, MapPin, ShieldAlert, Target, OctagonX, Sparkles } from 'lucide-react';
import {
  parseWolfSetupReply,
  wolfBiasLabel,
  wolfStatusTone,
  type WolfSetupAnalysis,
} from '../../utils/parseWolfSetupReply';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import ChatMarkdown from '../ChatMarkdown';
import ScreenshotAnnotOverlay from './ScreenshotAnnotOverlay';

export const WOLF_WHAT_IF_SCENARIOS = [
  { id: 'breaks', label: 'Price breaks level', prompt: 'Price BREAKS the key level on this chart' },
  { id: 'holds', label: 'Price holds level', prompt: 'Price HOLDS / rejects at the key level' },
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

function SetupRadar({ score }: { score: number | null }) {
  if (score == null) return null;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="wolf-radar" aria-label="Setup strength">
      <div className="wolf-radar__head">
        <span>SETUP STRENGTH</span>
        <strong>{clamped}</strong>
      </div>
      <div className="wolf-radar__bar" role="meter" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${clamped}%` }} />
      </div>
      <p className="wolf-radar__note">Setup quality — not win probability.</p>
    </div>
  );
}

function WhyWalkthrough({ analysis }: { analysis: WolfSetupAnalysis }) {
  const steps = useMemo(() => {
    const out: { title: string; body: string }[] = [];
    if (analysis.keyObservation) {
      out.push({ title: 'KEY OBSERVATION', body: analysis.keyObservation });
    }
    analysis.why.forEach((w, i) => {
      out.push({ title: `STEP ${i + 1}`, body: w });
    });
    if (analysis.entry) out.push({ title: 'ENTRY', body: analysis.entry });
    if (analysis.invalidation) {
      out.push({ title: 'INVALIDATION', body: analysis.invalidation });
    }
    return out.slice(0, 6);
  }, [analysis]);

  const [step, setStep] = useState(0);
  if (steps.length === 0) return null;

  const current = steps[Math.min(step, steps.length - 1)];

  return (
    <div className="wolf-why">
      <div className="wolf-why__progress">
        {steps.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`wolf-why__dot ${i === step ? 'is-on' : ''} ${i < step ? 'is-done' : ''}`}
            aria-label={`Step ${i + 1}`}
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
          transition={{ duration: 0.22 }}
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
        {hindi
          ? 'Scenario analysis — prediction nahi.'
          : 'Scenario analysis — not a prediction.'}
      </p>
      <div className="wolf-whatif__grid">
        {WOLF_WHAT_IF_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="wolf-whatif__btn"
            onClick={() =>
              onWhatIf(
                `[WHAT-IF] Scenario: ${s.prompt}. Reply with the SAME locked headings (Market Bias, Setup, Setup Status, Entry Condition, Stop Loss Logic, Target Logic, Invalidation, Evidence Score, Why). Keep under 120 words. End with a short wolfchart if prices are readable. State this is a conditional scenario only.`,
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

/** Visual-first setup reply: annotated shot → status → plan → Why → What-If. */
export default function WolfSetupAnalysisCard({
  text,
  hindi,
  onSpeak,
  imageUrl,
  levels = [],
  shapes = [],
  onWhatIf,
}: Props) {
  const analysis = useMemo(() => parseWolfSetupReply(text), [text]);
  const [showWhy, setShowWhy] = useState(false);
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [hiLabel, setHiLabel] = useState<string | null>(null);

  if (!analysis) {
    return (
      <div className="wolf-setup">
        {imageUrl ? (
          <ScreenshotAnnotOverlay imageUrl={imageUrl} levels={levels} shapes={shapes} />
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

  return (
    <div className={`wolf-setup wolf-setup--${tone}`}>
      {imageUrl ? (
        <ScreenshotAnnotOverlay
          imageUrl={imageUrl}
          levels={levels}
          shapes={shapes}
          highlightLabel={hiLabel}
        />
      ) : null}

      <div className="wolf-setup__status" role="status">
        <span className="wolf-setup__status-dot" aria-hidden />
        <span>{statusLine}</span>
      </div>

      {analysis.setup ? <div className="wolf-setup__name">{analysis.setup}</div> : null}
      {analysis.keyObservation ? (
        <p className="wolf-setup__obs">{analysis.keyObservation}</p>
      ) : null}

      <SetupRadar score={analysis.evidenceScore} />

      <div className="wolf-plan">
        <PlanCard
          icon={<MapPin className="h-4 w-4" />}
          label="ENTRY"
          body={analysis.entry}
          onFocus={() => setHiLabel('ENTRY ZONE')}
        />
        <PlanCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="SL"
          body={analysis.stopLoss}
          onFocus={() => setHiLabel(analysis.stopLoss.slice(0, 24))}
        />
        <PlanCard
          icon={<Target className="h-4 w-4" />}
          label="TARGET"
          body={analysis.target}
          onFocus={() => setHiLabel(null)}
        />
        <PlanCard
          icon={<OctagonX className="h-4 w-4" />}
          label="INVALIDATION"
          body={analysis.invalidation}
          onFocus={() => setHiLabel(null)}
        />
      </div>

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
          <button
            type="button"
            className="wolf-setup__btn wolf-setup__btn--ghost"
            onClick={() =>
              onSpeak(
                [statusLine, analysis.setup, analysis.keyObservation, analysis.entry, analysis.stopLoss, analysis.target]
                  .filter(Boolean)
                  .join('. '),
              )
            }
          >
            EXPLAIN
          </button>
        ) : null}
        <button type="button" className="wolf-setup__btn wolf-setup__btn--ghost" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Hide detail' : 'Full detail'}
        </button>
      </div>

      <AnimatePresence>
        {showWhy ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <WhyWalkthrough analysis={analysis} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showWhatIf && onWhatIf ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <WhatIfPanel hindi={hindi} onWhatIf={onWhatIf} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {showRaw ? (
        <div className="wolf-setup__raw">
          <ChatMarkdown text={text} />
        </div>
      ) : null}
    </div>
  );
}
