/**
 * Cross-module Mentor OS glue — recommendations + handoffs between M1–M6.
 * Keeps the ecosystem one path: Learn → Chart → Coach → Lab → Live → Master.
 */
import { loadCurriculumProgress, getLevel, isLevelUnlocked } from './mentorCurriculum';
import { loadLabProgress } from './tradingLab';
import { loadCoachHabits } from './performanceCoach';
import { loadMasterMemory } from './tradingMaster';
import { loadMentorMemory as loadLiveMemory } from './liveMentor';
import type { LabMode } from './tradingLab';

export type MentordeskView =
  | 'curriculum'
  | 'chart'
  | 'coach'
  | 'lab'
  | 'liveMentor'
  | 'master'
  | 'desk';

export type MentorHandoff = {
  view: MentordeskView;
  levelId?: number;
  labMissionId?: string;
  labMode?: LabMode;
  focusNote?: string;
  mistakeReplay?: boolean;
  reason: string;
};

export type EcosystemModuleStatus = {
  id: MentordeskView;
  module: number;
  label: string;
  score: number;
  detail: string;
};

export type EcosystemSnapshot = {
  modules: EcosystemModuleStatus[];
  overall: number;
  next: MentorHandoff;
  path: MentorHandoff[];
};

const HANDOFF_KEY = 'wolf_mentor_handoff_v1';

export function queueMentorHandoff(handoff: MentorHandoff) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));
}

export function consumeMentorHandoff(): MentorHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(HANDOFF_KEY);
    return JSON.parse(raw) as MentorHandoff;
  } catch {
    return null;
  }
}

export function peekMentorHandoff(): MentorHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MentorHandoff;
  } catch {
    return null;
  }
}

/** Map weakness / focus text → Module 1 level. */
export function mapWeaknessToLevel(weakness: string, highestUnlocked = 1): number {
  const w = String(weakness || '').toLowerCase();
  let target = 3;
  if (/liquid/.test(w)) target = 5;
  else if (/structure|bos|choch|market reading/.test(w)) target = 6;
  else if (/smc|order\s*block|fvg|imbalance/.test(w)) target = 7;
  else if (/ict|fair value|premium|discount/.test(w)) target = 8;
  else if (/price action|timing|early|entry|late/.test(w)) target = 9;
  else if (/risk|size|stop|rr|drawdown/.test(w)) target = 10;
  else if (/psych|fear|greed|fomo|emotion|patience|revenge|discipline/.test(w)) target = 11;
  else if (/live|execution|consistency/.test(w)) target = 12;
  else if (/candle|ohlc/.test(w)) target = 2;
  else if (/support|resistance|level/.test(w)) target = 4;
  // Prefer unlocked lesson; if target locked, open highest unlocked
  if (target > highestUnlocked) return Math.max(1, highestUnlocked);
  return target;
}

export function mapWeaknessToLabMission(weakness: string): string {
  const w = String(weakness || '').toLowerCase();
  if (/risk|drawdown|size|capital/.test(w)) return 'protect';
  if (/rr|reward|target/.test(w)) return 'rr12';
  if (/overtrad|fomo|revenge|patience|timing|early/.test(w)) return 'max2';
  if (/stop|sl|discipline/.test(w)) return 'sl_always';
  if (/liquid|structure|confirm/.test(w)) return 'observe5';
  // Default path from Coach/Master → Lab uses dedicated mistake-replay mission
  return 'mistake_replay';
}

export function mapWeaknessToLabMode(weakness: string): LabMode {
  const w = String(weakness || '').toLowerCase();
  if (/psych|fear|fomo|revenge|overtrad/.test(w)) return 'challenge';
  if (/risk|discipline/.test(w)) return 'professional';
  if (/beginner|basic|candle/.test(w)) return 'beginner';
  return 'intermediate';
}

export function buildPathFromWeakness(
  weakness: string,
  ownerKey = 'guest',
): MentorHandoff[] {
  const curriculum = loadCurriculumProgress(ownerKey);
  const levelId = mapWeaknessToLevel(weakness, curriculum.highestUnlocked);
  const level = getLevel(levelId);
  const missionId = mapWeaknessToLabMission(weakness);
  const labMode = mapWeaknessToLabMode(weakness);
  const title = level?.title || `Level ${levelId}`;

  return [
    {
      view: 'curriculum',
      levelId,
      reason: `Revise Module 1 · ${title} (weakness: ${weakness || 'general'})`,
      focusNote: weakness,
    },
    {
      view: 'chart',
      reason: `Practice reading ${title} Areas of Interest on live/open chart`,
      focusNote: weakness,
    },
    {
      view: 'lab',
      labMissionId: missionId,
      labMode,
      mistakeReplay: true,
      reason: `Lab mistake-replay · mission “${missionId}” · mode ${labMode}`,
      focusNote: `Replay focus: ${weakness}. Slow down, confirm, respect rules.`,
    },
    {
      view: 'coach',
      reason: 'Log / review journal emotions after practice session',
      focusNote: weakness,
    },
    {
      view: 'liveMentor',
      reason: 'Apply the same process rules in Live Mentor plan checklist',
      focusNote: weakness,
    },
    {
      view: 'master',
      reason: 'Update Twin / DNA after the practice loop',
      focusNote: weakness,
    },
  ];
}

export function buildEcosystemSnapshot(args: {
  ownerKey: string;
  weakness?: string;
  curriculumLevel?: number;
  journalTradeCount?: number;
  coachOverall?: number;
  dnaOverall?: number;
}): EcosystemSnapshot {
  const { ownerKey } = args;
  const curriculum = loadCurriculumProgress(ownerKey);
  const lab = loadLabProgress(ownerKey);
  const habits = loadCoachHabits(ownerKey);
  const master = loadMasterMemory(ownerKey);
  const live = loadLiveMemory(ownerKey);

  const knowledge = Math.round((curriculum.highestUnlocked / 12) * 100);
  const habitScore = Math.round(
    (Object.values(habits.checks).filter(Boolean).length / 5) * 100,
  );
  const labScore = clamp(
    lab.bestSessionScore * 0.6 + Math.min(lab.sessions * 8, 40),
  );
  const coachScore = args.coachOverall ?? habitScore;
  const liveScore = live.lastBriefAt ? 72 : 35;
  const masterScore = args.dnaOverall ?? (master.notes.length ? 70 : 40);
  const chartScore = curriculum.highestUnlocked >= 4 ? 65 : 40;

  const modules: EcosystemModuleStatus[] = [
    {
      id: 'curriculum',
      module: 1,
      label: 'Teacher',
      score: knowledge,
      detail: `L${curriculum.highestUnlocked}/12`,
    },
    {
      id: 'chart',
      module: 2,
      label: 'Chart',
      score: chartScore,
      detail: curriculum.highestUnlocked >= 4 ? 'Ready' : 'Unlock L4+',
    },
    {
      id: 'coach',
      module: 3,
      label: 'Coach',
      score: coachScore,
      detail: `${Object.values(habits.checks).filter(Boolean).length}/5 habits`,
    },
    {
      id: 'lab',
      module: 4,
      label: 'Lab',
      score: labScore,
      detail: `${lab.sessions} sessions`,
    },
    {
      id: 'liveMentor',
      module: 5,
      label: 'Live',
      score: liveScore,
      detail: live.lastBriefAt ? 'Brief done' : 'Brief pending',
    },
    {
      id: 'master',
      module: 6,
      label: 'Master',
      score: masterScore,
      detail: master.careerTrack,
    },
  ];

  const overall = clamp(modules.reduce((s, m) => s + m.score, 0) / modules.length);
  const weakness = args.weakness || 'process consistency';
  const path = buildPathFromWeakness(weakness, ownerKey);

  // Next = first incomplete-ish step in the path
  let next = path[0];
  if (knowledge >= 50 && lab.sessions < 1) {
    next = path.find((p) => p.view === 'lab') || next;
  } else if (lab.sessions >= 1 && !live.lastBriefAt) {
    next = path.find((p) => p.view === 'liveMentor') || next;
  } else if (live.lastBriefAt && master.notes.length < 1) {
    next = path.find((p) => p.view === 'master') || next;
  } else if (habitScore < 60) {
    next = path.find((p) => p.view === 'coach') || next;
  }

  // Ensure curriculum level is unlocked preference
  if (next.view === 'curriculum' && next.levelId && !isLevelUnlocked(next.levelId, curriculum)) {
    next = {
      ...next,
      levelId: curriculum.highestUnlocked,
      reason: `Continue Module 1 · Level ${curriculum.highestUnlocked} (target still locked)`,
    };
  }

  return { modules, overall, next, path };
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function handoffLabel(view: MentordeskView): string {
  switch (view) {
    case 'curriculum':
      return 'Curriculum';
    case 'chart':
      return 'Chart Mentor';
    case 'coach':
      return 'Coach';
    case 'lab':
      return 'Lab';
    case 'liveMentor':
      return 'Live Mentor';
    case 'master':
      return 'Master';
    case 'desk':
      return 'Live desk';
    default:
      return view;
  }
}
