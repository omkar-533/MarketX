import { ArrowRight, Route } from 'lucide-react';
import {
  handoffLabel,
  type EcosystemSnapshot,
  type MentordeskView,
  type MentorHandoff,
} from '../../services/mentorBridge';

type Props = {
  snapshot: EcosystemSnapshot;
  activeView: MentordeskView;
  onOpen: (handoff: MentorHandoff) => void;
};

export default function MentorEcosystemBar({ snapshot, activeView, onOpen }: Props) {
  return (
    <div className="wm-eco">
      <div className="wm-eco__top">
        <div className="wm-eco__brand">
          <Route size={14} />
          <span>Mentor OS</span>
          <b>{snapshot.overall}%</b>
        </div>
        <button
          type="button"
          className="wm-eco__next"
          onClick={() => onOpen(snapshot.next)}
          title={snapshot.next.reason}
        >
          Next: {handoffLabel(snapshot.next.view)}
          {snapshot.next.levelId ? ` L${snapshot.next.levelId}` : ''}
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="wm-eco__mods" role="navigation" aria-label="Mentor modules">
        {snapshot.modules.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`wm-eco__mod ${activeView === m.id ? 'on' : ''}`}
            onClick={() =>
              onOpen({
                view: m.id,
                reason: `Open Module ${m.module} · ${m.label}`,
                levelId: m.id === 'curriculum' ? snapshot.next.levelId : undefined,
                labMissionId: m.id === 'lab' ? snapshot.next.labMissionId : undefined,
                labMode: m.id === 'lab' ? snapshot.next.labMode : undefined,
                mistakeReplay: m.id === 'lab' ? snapshot.next.mistakeReplay : undefined,
                focusNote: snapshot.next.focusNote,
              })
            }
          >
            <em>M{m.module}</em>
            <span>{m.label}</span>
            <b>{m.score}%</b>
            <i style={{ width: `${m.score}%` }} />
            <small>{m.detail}</small>
          </button>
        ))}
      </div>
      <p className="wm-eco__reason">{snapshot.next.reason}</p>
    </div>
  );
}
