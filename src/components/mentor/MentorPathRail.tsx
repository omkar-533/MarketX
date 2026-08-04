import { ArrowRight } from 'lucide-react';
import {
  buildPathFromWeakness,
  handoffLabel,
  type MentorHandoff,
} from '../../services/mentorBridge';

type Props = {
  ownerKey: string;
  weakness: string;
  onOpen: (handoff: MentorHandoff) => void;
  title?: string;
};

export default function MentorPathRail({
  ownerKey,
  weakness,
  onOpen,
  title = 'Recommended path',
}: Props) {
  const path = buildPathFromWeakness(weakness || 'process consistency', ownerKey).slice(0, 4);

  return (
    <section className="wm-path">
      <h3>{title}</h3>
      <p className="wm-path__weak">
        Focus: <strong>{weakness || 'process consistency'}</strong>
      </p>
      <ol className="wm-path__list">
        {path.map((step, i) => (
          <li key={`${step.view}-${i}`}>
            <button type="button" onClick={() => onOpen(step)}>
              <span>
                {i + 1}. {handoffLabel(step.view)}
                {step.levelId ? ` · L${step.levelId}` : ''}
                {step.labMissionId ? ` · ${step.labMissionId}` : ''}
              </span>
              <small>{step.reason}</small>
              <ArrowRight size={14} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
