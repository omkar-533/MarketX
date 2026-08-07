import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BrainCircuit,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import ChatMarkdown from '../ChatMarkdown';
import { hydrateJournalFromCloud, loadLocalTrades } from '../../services/journalSyncService';
import {
  CAREER_TRACKS,
  COMMUNITY_INSIGHTS,
  PERSONALITY_META,
  buildCareerPrompt,
  buildMasterBriefPrompt,
  buildMasterDnaCard,
  buildPlaybook,
  buildStrategyFramework,
  buildStrategyPrompt,
  buildTwinPrompt,
  goalProgress,
  loadMasterMemory,
  saveMasterMemory,
  twinCompareDecision,
  type CareerTrackId,
  type MasterDnaCard,
  type MasterGoalId,
  type MasterMemory,
  type Playbook,
  type StrategyBuilderInput,
} from '../../services/tradingMaster';
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

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="wm-master__meter">
      <span>
        {label} <b>{value}%</b>
      </span>
      <i style={{ width: `${value}%` }} />
    </div>
  );
}

export default function TradingMasterPanel({
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
  const [dna, setDna] = useState<MasterDnaCard | null>(null);
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [memory, setMemory] = useState<MasterMemory>(() => loadMasterMemory(ownerKey));
  const [decisionNote, setDecisionNote] = useState(
    'Liquidity sweep wait + retest confirmation, RR 1:3, max 1% risk.',
  );
  const [note, setNote] = useState(
    'Trading Master = your Personal Trading Brain. DNA, Twin, playbook, roadmap — process mastery, never trade execution.',
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await hydrateJournalFromCloud(user).catch(() => undefined);
      const trades = loadLocalTrades(user);
      const card = buildMasterDnaCard({ trades, ownerKey, user, profile });
      setDna(card);
      setPlaybook(buildPlaybook(trades, card));
      setMemory(loadMasterMemory(ownerKey));
    } catch {
      const trades = loadLocalTrades(user);
      const card = buildMasterDnaCard({ trades, ownerKey, user, profile });
      setDna(card);
      setPlaybook(buildPlaybook(trades, card));
    } finally {
      setLoading(false);
    }
  }, [ownerKey, user, profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const goals = useMemo(() => {
    if (!dna) return [];
    return goalProgress(memory.goals, loadLocalTrades(user), dna);
  }, [dna, memory.goals, user]);

  const framework = useMemo(() => {
    if (!dna) return null;
    return buildStrategyFramework(memory.strategy, dna);
  }, [dna, memory.strategy]);

  const twin = useMemo(
    () => (dna ? twinCompareDecision({ dna, decisionNote }) : null),
    [dna, decisionNote],
  );

  const persist = (next: MasterMemory) => {
    setMemory(next);
    saveMasterMemory(next, ownerKey);
  };

  const runAi = async (message: string) => {
    setBusy(true);
    setNote('Institutional Mentor synthesizing…');
    try {
      const result = await askMasterAi(
        {
          message: `${message}\n\n[Reply in ${lang.replyIn}. Trading Master — personalization only. Never Buy/Sell/Entry/Stop/Target.]`,
          model: MASTER_AI_MODEL_ID,
          lang: lang.code,
          langName: lang.name,
          langMode,
          mentorMode,
          mentorDesk: true,
          mentorMaster: true,
          history: [],
        },
        buildMasterMarketContext(),
      );
      setNote(String(result.reply || '').trim() || 'No mentor note — retry.');
      const mem = {
        ...memory,
        lastSessionAt: new Date().toISOString(),
        notes: [String(result.reply || '').slice(0, 160), ...memory.notes].slice(0, 12),
      };
      persist(mem);
    } catch {
      setNote('Trading Master unreachable. Check your AI key in Profile.');
    } finally {
      setBusy(false);
    }
  };

  const askBrief = () => {
    if (!dna || !playbook) return;
    void runAi(buildMasterBriefPrompt(dna, playbook, profile?.name || 'Trader'));
  };

  const askStrategy = () => {
    if (!framework) return;
    void runAi(buildStrategyPrompt(framework, memory.strategy, profile?.name || 'Trader'));
  };

  const askTwin = () => {
    if (!dna || !twin) return;
    void runAi(
      buildTwinPrompt({
        dna,
        decisionNote,
        compare: twin,
        studentName: profile?.name || 'Trader',
      }),
    );
  };

  const askCareer = () => {
    if (!dna) return;
    void runAi(buildCareerPrompt(memory.careerTrack, dna, profile?.name || 'Trader'));
  };

  const toggleGoal = (id: MasterGoalId) => {
    persist({
      ...memory,
      goals: { ...memory.goals, [id]: !memory.goals[id] },
    });
  };

  const patchStrategy = (patch: Partial<StrategyBuilderInput>) => {
    persist({ ...memory, strategy: { ...memory.strategy, ...patch } });
  };

  if (loading && !dna) {
    return (
      <div className="wm-master wm-master--empty">
        <Loader2 className="wm-desk__spin" size={20} />
        <p>Building your Trading DNA…</p>
      </div>
    );
  }

  const d = dna!;
  const pb = playbook!;

  return (
    <div className="wm-master">
      <header className="wm-master__head">
        <div>
          <p className="wm-learn__eyebrow">
            <BrainCircuit className="h-3 w-3" />
            Module 6 · Trading Master
          </p>
          <h2 className="wm-learn__title">WOLF AI Institutional Mentor</h2>
          <p className="wm-learn__lead">
            Personal Trading Brain — DNA, Twin, playbook, career roadmap. Optimizes process, never
            executes trades.
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

      <section className="wm-master__dash">
        <div className="wm-master__overall">
          <Target size={16} />
          <div>
            <span>Overall progress</span>
            <strong>{d.overallProgress}%</strong>
          </div>
        </div>
        <div className="wm-master__meters">
          <Meter label="Knowledge" value={d.knowledge} />
          <Meter label="Execution" value={d.execution} />
          <Meter label="Psychology" value={d.emotionalStability} />
          <Meter label="Risk" value={d.riskDiscipline} />
          <Meter label="Discipline" value={d.discipline} />
          <Meter label="Consistency" value={d.consistency} />
        </div>
        <p className="wm-master__focus">
          Current focus: <b>{d.currentFocus}</b>
        </p>
      </section>

      <section className="wm-master__dna">
        <h3>Trading DNA</h3>
        <div className="wm-master__dna-grid">
          <div>
            <span>Experience</span>
            <b>{d.experience}</b>
          </div>
          <div>
            <span>Risk profile</span>
            <b>{d.riskProfile}</b>
          </div>
          <div>
            <span>Best market</span>
            <b>{d.bestMarket}</b>
          </div>
          <div>
            <span>Best time</span>
            <b>{d.bestTime}</b>
          </div>
          <div>
            <span>Worst time</span>
            <b>{d.worstTime}</b>
          </div>
          <div>
            <span>Best strategy</span>
            <b>{d.bestStrategy}</b>
          </div>
          <div>
            <span>Worst strategy</span>
            <b>{d.worstStrategy}</b>
          </div>
          <div>
            <span>Psychology</span>
            <b>{d.psychologyNote}</b>
          </div>
        </div>
        <div className="wm-master__persona">
          <strong>{d.personalityLabel}</strong>
          <p>{PERSONALITY_META[d.personality].coaching}</p>
        </div>
        <p className="wm-master__cert">
          Certification track: <b>{d.certLabel}</b>
        </p>
      </section>

      <section className="wm-master__block">
        <h3>Future weakness forecast</h3>
        <ul className="wm-master__forecast">
          {d.weaknessForecast.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p className="wm-master__muted">Adaptive path: {d.nextLessonHint}</p>
      </section>

      {onNavigate ? (
        <MentorPathRail
          ownerKey={ownerKey}
          weakness={d.weakArea || d.currentFocus}
          onOpen={onNavigate}
          title="Master path · close the loop across modules"
        />
      ) : null}

      <section className="wm-master__block">
        <h3>AI Twin — decision check</h3>
        <p className="wm-master__muted">
          Twin match <b>{twin?.score ?? '—'}%</b> — compares framing to your better habits (no trade
          copy).
        </p>
        <textarea
          rows={2}
          value={decisionNote}
          onChange={(e) => setDecisionNote(e.target.value)}
          placeholder="Describe your current decision process…"
        />
        {twin ? <p className="wm-master__twin-verdict">{twin.verdict}</p> : null}
        <button type="button" className="wm-learn__cta" disabled={busy} onClick={askTwin}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Ask Twin coach
        </button>
      </section>

      <section className="wm-master__block">
        <h3>Personal strategy builder</h3>
        <div className="wm-master__strat-grid">
          <label>
            Capital
            <input
              value={memory.strategy.capital}
              onChange={(e) => patchStrategy({ capital: e.target.value })}
            />
          </label>
          <label>
            Risk %
            <input
              value={memory.strategy.riskPct}
              onChange={(e) => patchStrategy({ riskPct: e.target.value })}
            />
          </label>
          <label>
            Market
            <input
              value={memory.strategy.market}
              onChange={(e) => patchStrategy({ market: e.target.value })}
            />
          </label>
          <label>
            Time
            <select
              value={memory.strategy.timeStyle}
              onChange={(e) =>
                patchStrategy({ timeStyle: e.target.value as StrategyBuilderInput['timeStyle'] })
              }
            >
              <option value="intraday">Intraday</option>
              <option value="swing">Swing</option>
              <option value="positional">Positional</option>
            </select>
          </label>
          <label>
            Style
            <select
              value={memory.strategy.style}
              onChange={(e) =>
                patchStrategy({ style: e.target.value as StrategyBuilderInput['style'] })
              }
            >
              <option value="liquidity">Liquidity</option>
              <option value="structure">Structure</option>
              <option value="breakout">Breakout</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
        </div>
        {framework ? (
          <div className="wm-master__framework">
            <strong>{framework.title}</strong>
            <p>{framework.pillars.join(' · ')}</p>
            <p>{framework.riskLine}</p>
            <p>{framework.rr}</p>
            <p className="wm-master__muted">{framework.why}</p>
          </div>
        ) : null}
        <button type="button" className="wm-desk__chip" disabled={busy} onClick={askStrategy}>
          Explain framework
        </button>
      </section>

      <section className="wm-master__block">
        <h3>Personal playbook</h3>
        <div className="wm-master__play">
          <div>
            <span>Best setups</span>
            <ul>
              {pb.bestSetups.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <span>Worst setups</span>
            <ul>
              {pb.worstSetups.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <span>Mistakes</span>
            <ul>
              {pb.mistakes.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="wm-master__block">
        <h3>Goal engine</h3>
        <ul className="wm-master__goals">
          {goals.map((g) => (
            <li key={g.id} className={g.active ? (g.ok ? 'ok' : 'bad') : 'off'}>
              <label>
                <input
                  type="checkbox"
                  checked={memory.goals[g.id]}
                  onChange={() => toggleGoal(g.id)}
                />
                <span>
                  {g.label}
                  <em>{g.status}</em>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="wm-master__block">
        <h3>Career roadmap</h3>
        <div className="wm-live__chips">
          {CAREER_TRACKS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`wm-learn__chip ${memory.careerTrack === c.id ? 'wm-learn__chip--on' : ''}`}
              onClick={() => persist({ ...memory, careerTrack: c.id as CareerTrackId })}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="wm-master__muted">
          Next gate: {CAREER_TRACKS.find((c) => c.id === memory.careerTrack)?.next}
        </p>
        <button type="button" className="wm-desk__chip" disabled={busy} onClick={askCareer}>
          Build roadmap
        </button>
      </section>

      <section className="wm-master__block">
        <h3>Community intelligence</h3>
        <ul className="wm-master__community">
          {COMMUNITY_INSIGHTS.map((c) => (
            <li key={c.tag}>
              <b>{c.tag}</b> {c.text}
            </li>
          ))}
        </ul>
        <p className="wm-master__muted">Anonymous aggregated notes — your journal stays private.</p>
      </section>

      <div className="wm-master__actions">
        <button type="button" className="wm-learn__cta" disabled={busy} onClick={askBrief}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Full Master briefing
        </button>
      </div>

      <section className="wm-master__note" aria-live="polite">
        <div className="wm-learn__label">Master mentor</div>
        <div className={`wm-learn__note ${busy ? 'wm-learn__note--busy' : ''}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin wm-learn__spin" /> : null}
          <ChatMarkdown text={note} />
        </div>
      </section>
    </div>
  );
}
