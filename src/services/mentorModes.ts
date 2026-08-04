/** Wolf Mentor personality + session modes. */

export type MentorMode = 'beginner' | 'professional' | 'strict' | 'socratic';

export const MENTOR_MODES: {
  id: MentorMode;
  label: string;
  hint: string;
}[] = [
  { id: 'beginner', label: 'Beginner', hint: 'Plain language · define every term' },
  { id: 'professional', label: 'Professional', hint: 'Institutional process · evidence-first' },
  { id: 'strict', label: 'Strict', hint: 'Challenge weak process' },
  { id: 'socratic', label: 'Socratic', hint: 'Questions before conclusions' },
];

const STORAGE_MENTOR = 'wolf_ai_mentor_mode';
const STORAGE_TRAINING = 'wolf_ai_training_mode';
const STORAGE_ROOM = 'wolf_ai_room_mode';

export function loadMentorMode(): MentorMode {
  if (typeof window === 'undefined') return 'professional';
  const v = window.localStorage.getItem(STORAGE_MENTOR);
  if (v === 'beginner' || v === 'professional' || v === 'strict' || v === 'socratic') return v;
  return 'professional';
}

export function saveMentorMode(mode: MentorMode): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_MENTOR, mode);
}

export function mentorModeLabel(mode: MentorMode): string {
  return MENTOR_MODES.find((m) => m.id === mode)?.label ?? 'Professional';
}

export function loadTrainingMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_TRAINING) === 'true';
}

export function saveTrainingMode(on: boolean): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_TRAINING, on ? 'true' : 'false');
  }
}

export function loadRoomMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_ROOM) === 'true';
}

export function saveRoomMode(on: boolean): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_ROOM, on ? 'true' : 'false');
  }
}
