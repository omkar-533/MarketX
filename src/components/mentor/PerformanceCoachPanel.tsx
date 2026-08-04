import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Circle,
  ClipboardList,
  Flame,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import ChatMarkdown from '../ChatMarkdown';
import {
  hydrateJournalFromCloud,
  loadLocalTrades,
} from '../../services/journalSyncService';
import {
  COACH_FOLLOWUPS,
  COACH_GOAL_OPTIONS,
  COACH_HABIT_OPTIONS,
  buildCoachBriefingPrompt,
  buildCoachFollowupPrompt,
  buildPerformanceSnapshot,
  loadCoachGoals,
  loadCoachHabits,
  saveCoachGoals,
  saveCoachHabits,
  type CoachGoalId,
  type CoachHabitId,
  type CoachHabits,
  type CoachGoals,
  type PerformanceSnapshot,
} from '../../services/performanceCoach';
import {
  MASTER_AI_MODEL_ID,
  askMasterAi,
  buildMasterMarketContext,
  type MasterAiLangMode,
  type MasterAiLanguage,
} from '../../services/masterAiService';
import type { MentorMode } from '../../services/mentorModes';
import type { MentorStudentProfile } from '../../services/mentorStudentProfile';
import type { User } from '../../hooks/useAuth';
import type { MentorHandoff } from '../../services/mentorBridge';
import MentorPathRail from './MentorPathRail';

type Props = {
  ownerKey: string;
  user: User | null;
  profile: MentorStudentProfile | null;
  lang: MasterAiLanguage;
  langMode: MasterAiLangMode;
  mentorMode: MentorMode;
  onNavigate?: (handoff: MentorHandoff) => void;
};

function ScoreCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="wm-coach__kpi">
      <b>{value}%</b>
      <span>{label}</span>
    </div>
  );
}

export default function PerformanceCoachPanel({
  ownerKey,
  user,
  profile,
  lang,
  langMode,
  mentorMode,
  onNavigate,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState<(PerformanceSnapshot & { skill?: { weakness: string } }) | null>(
    null,
  );
  const [goals, setGoals] = useState<CoachGoals>(() => loadCoachGoals(ownerKey));
  const [habits, setHabits] = useState<CoachHabits>(() => loadCoachHabits(ownerKey));
  const [note, setNote] = useState(
    'Performance Coach journal se trader ko coach karta hai — habits, discipline, psychology. No new Entry / Stop / Target.',
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await hydrateJournalFromCloud(user).catch(() => undefined);
      const trades = loadLocalTrades(user);
      setSnap(buildPerformanceSnapshot(trades, ownerKey, user));
      setGoals(loadCoachGoals(ownerKey));
      setHabits(loadCoachHabits(ownerKey));
    } catch {
      const trades = loadLocalTrades(user);
      setSnap(buildPerformanceSnapshot(trades, ownerKey, user));
    } finally {
      setLoading(false);
    }
  }, [ownerKey, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runCoach = async (message: string) => {
    setBusy(true);
    setNote('Coach tape padh raha hai…');
    try {
      const result = await askMasterAi(
        {
          message: `${message}\n\n[Reply in ${lang.replyIn}. Performance coaching only — historical journal. Never invent Entry/Stop/Target.]`,
          model: MASTER_AI_MODEL_ID,
          lang: lang.code,
          langName: lang.name,
          langMode,
          mentorMode,
          mentorDesk: true,
          mentorCoach: true,
          history: [],
        },
        buildMasterMarketContext(),
      );
      setNote(String(result.reply || '').trim() || 'No coach note — retry.');
    } catch {
      setNote('Coach engine unreachable. AI key Profile mein check karo, phir retry.');
    } finally {
      setBusy(false);
    }
  };

  const askBriefing = () => {
    if (!snap) return;
    void runCoach(buildCoachBriefingPrompt(snap, profile?.name || 'Trader'));
  };

  const askFollowup = (prompt: string) => {
    if (!snap) return;
    void runCoach(buildCoachFollowupPrompt(prompt, snap));
  };

  const toggleGoal = (id: CoachGoalId) => {
    setGoals((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveCoachGoals(next, ownerKey);
      return next;
    });
  };

  const toggleHabit = (id: CoachHabitId) => {
    setHabits((prev) => {
      const next: CoachHabits = {
        ...prev,
        date: new Date().toISOString().slice(0, 10),
        checks: { ...prev.checks, [id]: !prev.checks[id] },
      };
      saveCoachHabits(next, ownerKey);
      return loadCoachHabits(ownerKey);
    });
  };

  const habitDone = COACH_HABIT_OPTIONS.filter((h) => habits.checks[h.id]).length;

  if (loading && !snap) {
    return (
      <div className="wm-coach wm-coach--empty">
        <Loader2 className="wm-desk__spin" size={20} />
        <p>Loading journal for coaching…</p>
      </div>
    );
  }

  const s = snap!;

  return (
    <div className="wm-coach">
      <header className="wm-coach__head">
        <div>
          <p className="wm-learn__eyebrow">Module 3 · Performance Coach</p>
          <h2 className="wm-learn__title">WOLF AI Trading Coach</h2>
          <p className="wm-learn__lead">
            Market nahi — <strong>trader</strong> analyze hota hai. Journal history se review, mistakes,
            psychology, plan. Never new trade orders.
          </p>
        </div>
        <button
          type="button"
          className="wm-desk__chip wm-desk__chip--ghost"
          onClick={() => void refresh()}
          disabled={loading || busy}
        >
          {loading ? <Loader2 className="wm-desk__spin" size={14} /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </header>

      {s.totalTrades === 0 ? (
        <div className="wm-coach__empty-card">
          <ClipboardList size={26} />
          <h3>No journal trades yet</h3>
          <p>
            Trading Journal mein completed trades add karo (entry, exit, SL, target, emotions) — phir
            dashboard + personalised plan yahan unlock hoga.
          </p>
        </div>
      ) : (
        <>
          <section className="wm-coach__dash">
            <div className="wm-coach__overall">
              <Activity size={16} />
              <div>
                <span>Overall progress</span>
                <strong>{s.overallProgress}%</strong>
              </div>
            </div>
            <div className="wm-coach__kpis">
              <ScoreCell label="Win rate" value={s.winRate} />
              <ScoreCell label="Discipline" value={s.disciplineScore} />
              <ScoreCell label="Psychology" value={s.psychologyScore} />
              <ScoreCell label="Risk" value={s.riskScore} />
              <ScoreCell label="Execution" value={s.executionScore} />
            </div>
            <div className="wm-coach__meta">
              <span>{s.totalTrades} trades</span>
              <span>Avg R:R {s.avgRR || '—'}</span>
              <span>Net ₹{Math.round(s.totalPnl).toLocaleString('en-IN')}</span>
              <span>Journal {s.journalQuality}%</span>
            </div>
            {(s.recapHeadline || s.recapSubline) && (
              <p className="wm-coach__recap">
                {s.recapHeadline}
                {s.recapSubline ? ` — ${s.recapSubline}` : ''}
              </p>
            )}
          </section>

          {(s.tips.length > 0 || s.patterns.length > 0) && (
            <section className="wm-coach__insights">
              <h3>Live insights</h3>
              <ul>
                {s.patterns.map((t) => (
                  <li key={t} className="wm-coach__tip wm-coach__tip--pattern">
                    {t}
                  </li>
                ))}
                {s.tips.slice(0, 4).map((t) => (
                  <li key={t.id} className={`wm-coach__tip wm-coach__tip--${t.tone}`}>
                    <strong>{t.title}</strong> — {t.detail}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="wm-coach__plan">
            <h3>
              <Sparkles size={14} /> Improvement focus
            </h3>
            <p>
              Weakness signal: <strong>{s.weakness}</strong>
            </p>
            <ol>
              {s.focusWeek.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
          {onNavigate ? (
            <MentorPathRail
              ownerKey={ownerKey}
              weakness={s.weakness}
              onOpen={onNavigate}
              title="Fix path · Curriculum → Chart → Lab → Live"
            />
          ) : null}
        </>
      )}

      <section className="wm-coach__habits">
        <div className="wm-coach__habits-h">
          <h3>
            <Flame size={14} /> Today’s habits
          </h3>
          <span>
            {habitDone}/{COACH_HABIT_OPTIONS.length}
            {habits.streak > 0 ? ` · streak ${habits.streak}` : ''}
          </span>
        </div>
        <ul className="wm-coach__habit-list">
          {COACH_HABIT_OPTIONS.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className={habits.checks[h.id] ? 'on' : ''}
                onClick={() => toggleHabit(h.id)}
              >
                {habits.checks[h.id] ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="wm-coach__goals">
        <h3>
          <Target size={14} /> Goals
        </h3>
        <ul>
          {COACH_GOAL_OPTIONS.map((g) => (
            <li key={g.id}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(goals[g.id])}
                  onChange={() => toggleGoal(g.id)}
                />
                <span>{g.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="wm-coach__ask">
        <h3>
          <MessageSquareText size={14} /> Ask the coach
        </h3>
        <div className="wm-coach__actions">
          <button
            type="button"
            className="wm-learn__cta wm-coach__brief"
            disabled={busy}
            onClick={askBriefing}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? 'Coaching…' : 'Full performance briefing'}
          </button>
          {COACH_FOLLOWUPS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="wm-desk__chip"
              disabled={busy}
              onClick={() => askFollowup(f.prompt)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section className="wm-coach__note" aria-live="polite">
        <div className="wm-learn__label">Coach note</div>
        <div className={`wm-learn__note wm-coach__md ${busy ? 'wm-learn__note--busy' : ''}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin wm-learn__spin" /> : null}
          <ChatMarkdown text={note} />
        </div>
      </section>
    </div>
  );
}
