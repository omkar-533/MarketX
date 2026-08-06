import { useCallback } from 'react';
import { Swords } from 'lucide-react';
import MentorArena from './mentor/MentorArena';
import { useAuth } from '../hooks/useAuth';
import { loadStudentProfile } from '../services/mentorStudentProfile';
import { queueMentorHandoff } from '../services/mentorBridge';
import { PAGE_NAMES } from '../constants/brandLabels';

type WolfArenaPageProps = {
  onNavigate?: (tab: string) => void;
};

/**
 * Standalone Wolf Arena (Desk Empire) — no longer nested inside Wolf Mentor.
 */
export default function WolfArenaPage({ onNavigate }: WolfArenaPageProps) {
  const { user } = useAuth();
  const ownerKey = user?.id || user?.email || 'guest';
  const student = loadStudentProfile(ownerKey);
  const studentName = student?.name || user?.name || 'Trader';

  const openMentor = useCallback(
    (view: 'curriculum' | 'lab') => {
      if (view === 'lab') {
        queueMentorHandoff({
          view: 'lab',
          labMissionId: 'mistake_replay',
          labMode: 'challenge',
          mistakeReplay: true,
          reason: 'Wolf Arena → Lab challenge',
        });
      } else {
        queueMentorHandoff({
          view: 'curriculum',
          reason: 'Wolf Arena → Curriculum',
        });
      }
      onNavigate?.('mentor-ai');
    },
    [onNavigate],
  );

  return (
    <div className="wolf-arena">
      <header className="wolf-arena__top">
        <div className="wolf-arena__brand">
          <div className="wolf-arena__mark" aria-hidden>
            <Swords className="h-4 w-4" />
          </div>
          <div>
            <h1 className="wolf-arena__title">{PAGE_NAMES.arena}</h1>
            <p className="wolf-arena__sub">
              Desk Empire · chart replay · virtual PnL · shop & garage
            </p>
          </div>
        </div>
      </header>

      <div className="wolf-arena__stage">
        <MentorArena
          ownerKey={ownerKey}
          detective={null}
          studentName={studentName}
          onOpenCurriculum={() => openMentor('curriculum')}
          onOpenLab={() => openMentor('lab')}
          onRoundTeach={() => undefined}
          onChartMarks={() => undefined}
        />
      </div>
    </div>
  );
}
