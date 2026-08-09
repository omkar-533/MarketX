import { useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, MapPin, ShieldAlert, Target, OctagonX } from 'lucide-react';
import {
  parseWolfSetupReply,
  wolfBiasLabel,
  wolfStatusTone,
  type WolfSetupAnalysis,
} from '../../utils/parseWolfSetupReply';
import ChatMarkdown from '../ChatMarkdown';

type Props = {
  text: string;
  hindi?: boolean;
  onSpeak?: (text: string) => void;
};

function PlanCard({
  icon,
  label,
  body,
}: {
  icon: ReactNode;
  label: string;
  body: string;
}) {
  if (!body) return null;
  return (
    <div className="wolf-plan__card">
      <div className="wolf-plan__card-icon" aria-hidden>
        {icon}
      </div>
      <div className="wolf-plan__card-label">{label}</div>
      <div className="wolf-plan__card-body">{body}</div>
    </div>
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

function WhyWalkthrough({ analysis, hindi }: { analysis: WolfSetupAnalysis; hindi?: boolean }) {
  const steps = useMemo(() => {
    const out: { title: string; body: string }[] = [];
    if (analysis.keyObservation) {
      out.push({ title: hindi ? 'KEY OBSERVATION' : 'KEY OBSERVATION', body: analysis.keyObservation });
    }
    analysis.why.forEach((w, i) => {
      out.push({ title: `STEP ${i + 1}`, body: w });
    });
    if (analysis.entry) out.push({ title: hindi ? 'ENTRY LOGIC' : 'ENTRY', body: analysis.entry });
    if (analysis.invalidation) {
      out.push({ title: hindi ? 'INVALIDATION' : 'INVALIDATION', body: analysis.invalidation });
    }
    return out.slice(0, 6);
  }, [analysis, hindi]);

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

/** Visual-first setup reply: status → plan cards → Show Me Why. Falls back to markdown. */
export default function WolfSetupAnalysisCard({ text, hindi, onSpeak }: Props) {
  const analysis = useMemo(() => parseWolfSetupReply(text), [text]);
  const [showWhy, setShowWhy] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  if (!analysis) {
    return <ChatMarkdown text={text} />;
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
        />
        <PlanCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="SL"
          body={analysis.stopLoss}
        />
        <PlanCard
          icon={<Target className="h-4 w-4" />}
          label="TARGET"
          body={analysis.target}
        />
        <PlanCard
          icon={<OctagonX className="h-4 w-4" />}
          label="INVALIDATION"
          body={analysis.invalidation}
        />
      </div>

      <div className="wolf-setup__actions">
        <button type="button" className="wolf-setup__btn" onClick={() => setShowWhy((v) => !v)}>
          <Eye className="h-3.5 w-3.5" />
          {showWhy ? (hindi ? 'Hide' : 'Hide walkthrough') : hindi ? 'SHOW ME WHY' : 'SHOW ME WHY'}
        </button>
        {onSpeak ? (
          <button
            type="button"
            className="wolf-setup__btn wolf-setup__btn--ghost"
            onClick={() =>
              onSpeak(
                [
                  statusLine,
                  analysis.setup,
                  analysis.keyObservation,
                  analysis.entry && `Entry: ${analysis.entry}`,
                  analysis.stopLoss && `SL: ${analysis.stopLoss}`,
                  analysis.target && `Target: ${analysis.target}`,
                ]
                  .filter(Boolean)
                  .join('. '),
              )
            }
          >
            {hindi ? 'EXPLAIN' : 'EXPLAIN'}
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
            <WhyWalkthrough analysis={analysis} hindi={hindi} />
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
