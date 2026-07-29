import { motion } from 'framer-motion';
import { Brain, Goal, Sparkles, Zap } from 'lucide-react';

export type AlertTone = 'good' | 'warning' | 'info';

export type AlertCard = {
  id: string;
  title: string;
  detail: string;
  tone: AlertTone;
};

export type CoachCard = {
  id: string;
  title: string;
  detail: string;
  tone: AlertTone;
};

type Props = {
  alerts: AlertCard[];
  tips: CoachCard[];
  syncStatus?: string;
  onHunterReview?: () => void;
};

const toneIcon = {
  good: Sparkles,
  warning: Goal,
  info: Brain,
} as const;

/** Luxury animated Alerts & Coach footer for Trading Journal. */
export default function JournalAlertsCoach({
  alerts,
  tips,
  syncStatus,
  onHunterReview,
}: Props) {
  const cards = [
    ...alerts.map((a) => ({ ...a, kind: 'alert' as const })),
    ...tips.slice(0, 2).map((t) => ({ ...t, kind: 'coach' as const })),
  ];

  return (
    <section className="tj-alerts">
      <div className="tj-alerts__orb" aria-hidden />
      <div className="tj-alerts__head">
        <div className="min-w-0">
          <p className="tj-chart__eyebrow">Live desk</p>
          <h2 className="tj-alerts__title">
            <Goal className="w-5 h-5 text-[#d4af37]" />
            Alerts & Coach
          </h2>
          <p className="tj-alerts__sub">Auto reminders from your journal — always on, zero wait.</p>
        </div>
        {onHunterReview ? (
          <button type="button" className="tj-btn tj-btn--primary tj-btn--sm" onClick={onHunterReview}>
            <Zap className="w-3.5 h-3.5" />
            Ask Hunter
          </button>
        ) : null}
      </div>

      <div className="tj-alerts__grid">
        {cards.map((card, i) => {
          const Icon = toneIcon[card.tone] ?? Brain;
          return (
            <motion.article
              key={`${card.kind}-${card.id}`}
              className={`tj-alert-card tj-alert-card--${card.tone}`}
              initial={{ opacity: 0, y: 16, rotateX: 8 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: 0.06 + i * 0.07, type: 'spring', stiffness: 340, damping: 26 }}
              whileHover={{ y: -4, scale: 1.015 }}
            >
              <div className="tj-alert-card__glow" aria-hidden />
              <div className="tj-alert-card__icon">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="tj-alert-card__title">{card.title}</p>
                <p className="tj-alert-card__detail">{card.detail}</p>
              </div>
              <span className="tj-alert-card__tag">{card.kind === 'coach' ? 'Coach' : 'Alert'}</span>
            </motion.article>
          );
        })}
      </div>

      {syncStatus ? <p className="tj-alerts__sync">{syncStatus}</p> : null}
    </section>
  );
}
