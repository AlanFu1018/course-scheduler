import type { UserCourse } from './data.ts';

export const DIFFICULTY_MULT = [0.8, 0.9, 1, 1.1, 1.2];
export const MASTERY_MULT = [1.3, 1.2, 1, 0.9, 0.8];
export const TYPE_SAMPLES = 3;

export type Estimate = {
  base_minutes: number; difficulty_mult: number; familiarity_mult: number; speed_factor: number;
  basis?: { difficulty: number; familiarity_level: number };
};

export function estimateBasis(state: UserCourse, chapters: string[]) {
  const levels = chapters.map(id => state.chapter_mastery[id]?.level ?? state.familiarity);
  return { difficulty: state.difficulty, familiarity_level: levels.length ? Math.min(...levels) : state.familiarity };
}

export function speedFor(state: UserCourse, type: string) {
  const speed = state.speed.by_task_type[type];
  return speed && speed.samples >= TYPE_SAMPLES ? speed.factor : state.speed.default.factor;
}

export function roundMinutes(minutes: number) {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

export function estimatedMinutes(e: Estimate) {
  return roundMinutes(e.base_minutes * e.difficulty_mult * e.familiarity_mult * e.speed_factor);
}
