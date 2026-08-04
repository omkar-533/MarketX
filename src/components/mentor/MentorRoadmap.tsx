import { Check, Lock, Play } from 'lucide-react';
import {
  CURRICULUM_LEVELS,
  type CurriculumProgress,
  isLevelUnlocked,
} from '../../services/mentorCurriculum';

type MentorRoadmapProps = {
  progress: CurriculumProgress;
  studentName: string;
  activeLevelId: number | null;
  onOpenLevel: (levelId: number) => void;
};

export default function MentorRoadmap({
  progress,
  studentName,
  activeLevelId,
  onOpenLevel,
}: MentorRoadmapProps) {
  return (
    <div className="wm-learn wm-learn--roadmap">
      <div className="wm-learn__roadmap-head">
        <div>
          <p className="wm-learn__eyebrow">Personalized learning roadmap</p>
          <h2 className="wm-learn__title">{studentName}, your Module 1 path</h2>
          <p className="wm-learn__lead">
            Levels unlock only after you pass the quiz (4/5). Skip allowed nahi — foundation pehle.
          </p>
        </div>
        <div className="wm-learn__progress-pill">
          Unlocked {progress.highestUnlocked}/12
        </div>
      </div>

      <ol className="wm-learn__levels">
        {CURRICULUM_LEVELS.map((level, idx) => {
          const unlocked = isLevelUnlocked(level.id, progress);
          const lp = progress.levels[level.id];
          const passed = Boolean(lp?.quizPassed);
          const active = activeLevelId === level.id;
          return (
            <li key={level.id} className="wm-learn__level-wrap">
              {idx > 0 ? <div className="wm-learn__level-connector" aria-hidden /> : null}
              <button
                type="button"
                className={`wm-learn__level ${unlocked ? '' : 'wm-learn__level--locked'} ${
                  passed ? 'wm-learn__level--done' : ''
                } ${active ? 'wm-learn__level--active' : ''}`}
                disabled={!unlocked}
                onClick={() => onOpenLevel(level.id)}
              >
                <span className="wm-learn__level-num">
                  {passed ? <Check className="h-3.5 w-3.5" /> : unlocked ? level.id : <Lock className="h-3.5 w-3.5" />}
                </span>
                <span className="wm-learn__level-body">
                  <span className="wm-learn__level-title">
                    Level {level.id} · {level.title}
                  </span>
                  <span className="wm-learn__level-obj">{level.objective}</span>
                </span>
                {unlocked ? (
                  <span className="wm-learn__level-cta">
                    <Play className="h-3.5 w-3.5" />
                    {passed ? 'Revise' : 'Start'}
                  </span>
                ) : (
                  <span className="wm-learn__level-lock">Locked</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
