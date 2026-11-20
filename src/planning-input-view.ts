import type { PlanningInput, Slot } from './data.ts';

const clockRange = ({ start_time, end_time }: Slot) => ({ start_time, end_time });
const speedValue = ({ factor, samples }: { factor: number; samples: number }) => ({ factor, samples });

export function planningInputView({ user, courses, user_courses }: PlanningInput) {
  const states = new Map(user_courses.map(state => [state.course_key, state]));
  return {
    user_id: user.user_id,
    timezone: user.timezone,
    availability: user.availability.map(rule => ({
      valid_from: rule.valid_from, valid_to: rule.valid_to,
      weekly_slots: rule.weekly_slots.map(slot => ({ weekday: slot.weekday, ...clockRange(slot) })),
      daily_max_minutes: rule.daily_max_minutes, session_minutes: rule.session_minutes,
      break_minutes: rule.break_minutes, exam_buffer_days: rule.exam_buffer_days,
    })),
    date_overrides: user.date_overrides.map(override => ({ date: override.date, slots: override.slots.map(clockRange) })),
    courses: courses.map(record => {
      const { course_key, start_date, end_date, course } = record;
      const state = states.get(course_key);
      return {
        course_key, start_date, end_date,
        name: course.name || course_key, instructor: course.instructor ?? null,
        sessions: course.sessions.map(slot => ({ weekday: slot.weekday, ...clockRange(slot), room: slot.room ?? null })),
        settings: state ? {
          active: state.active, familiarity: state.familiarity, difficulty: state.difficulty, target_grade: state.target_grade,
          speed: {
            default: state.speed?.default ? speedValue(state.speed.default) : null,
            by_task_type: Object.entries(state.speed?.by_task_type ?? {})
              .map(([type, values]) => ({ type, ...speedValue(values) })),
          },
          chapter_mastery: Object.entries(state.chapter_mastery).map(([id, mastery]) => ({
            id, title: course.textbook.chapters.find(chapter => chapter.id === id)?.title ?? id,
            level: mastery.level, need_review: mastery.need_review,
          })),
        } : null,
      };
    }),
  };
}
