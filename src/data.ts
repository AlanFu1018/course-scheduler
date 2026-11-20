import { readFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';

export function parsePlanningJson(text: string, jsonc = false): unknown {
  text = text.replace(/^\uFEFF/, '');
  if (jsonc) {
    // Match strings first so comment markers and commas inside them are preserved.
    text = text.replace(/"(?:\\[\s\S]|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
      token => token.startsWith('/') ? token.replace(/[^\r\n]/g, ' ') : token);
    text = text.replace(/"(?:\\[\s\S]|[^"\\])*"|,(?=\s*[}\]])/g,
      token => token === ',' ? '' : token);
  }
  return JSON.parse(text);
}

export async function readPlanningFile(filePath: string | URL): Promise<unknown> {
  try {
    const path = filePath instanceof URL ? filePath.pathname : filePath;
    return parsePlanningJson(await readFile(filePath, 'utf8'), /\.jsonc$/i.test(path));
  } catch (error) {
    throw new Error(`無法讀取 ${filePath}：${(error as Error).message}`, { cause: error });
  }
}

export type Slot = { start_time: string; end_time: string };
type WeeklySlot = Slot & { weekday: number };
type Availability = {
  valid_from: string; valid_to: string; weekly_slots: WeeklySlot[];
  daily_max_minutes: number; session_minutes: number; break_minutes: number; exam_buffer_days: number;
};
export type User = {
  schema_version: string; user_id: string; timezone: string; availability: Availability[];
  date_overrides: { date: string; slots: Slot[] }[];
  calendar_sources: { source_id: string; treat_as: string }[];
};
type Assessment = { id: string; type: string; date: { value: string; week: number }; scope: { value: string[] } };
export type Course = {
  schema_version: string; user_id: string; course_key: string; start_date: string; end_date: string;
  course: { name?: string; instructor?: string | null; sessions: (WeeklySlot & { room?: string | null })[];
    textbook: { chapters: { id: string; title?: string }[] } };
  assessments: Assessment[];
  grading: { weight: { value: number } }[];
  weekly_schedule: { date_range: [string, string]; chapters: string[] }[];
};
type Speed = { factor: number; samples: number };
export type UserCourse = {
  schema_version: string; user_id: string; course_key: string; active: boolean;
  familiarity: number; difficulty: number; target_grade: number;
  speed: { default: Speed; by_task_type: Record<string, Speed> };
  chapter_mastery: Record<string, { level: number; need_review: boolean }>;
};
export type CalendarEvent = {
  user_id: string; source_id: string; start_at: string; end_at: string; all_day: boolean | number;
};
export type PlanningInput = { user: User; courses: Course[]; user_courses: UserCourse[]; calendar_events: CalendarEvent[] };
export interface PlanningSource { load(userId: string): Promise<PlanningInput> }
type FilePath = string | URL;

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
}

export function timeMinutes(value: unknown): number {
  check(typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value), `無效時間：${value}`);
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function validateSlots(slots: Slot[], weekly = false) {
  check(Array.isArray(slots), '缺少時段清單');
  for (const slot of slots) {
    check(timeMinutes(slot.start_time) < timeMinutes(slot.end_time), '時段結束須晚於開始');
    if (weekly) check([1, 2, 3, 4, 5, 6, 7].includes((slot as WeeklySlot).weekday), '無效 weekday');
  }
}

function validate(input: PlanningInput, userId: string): PlanningInput {
  const { user, courses, user_courses, calendar_events } = input;
  check(user?.user_id === userId && user.schema_version === '1.5', `找不到使用者或格式不符：${userId}`);
  check(typeof user.timezone === 'string' && user.timezone.length > 0, '缺少使用者時區');
  new Intl.DateTimeFormat('en', { timeZone: user.timezone });
  check(Array.isArray(user.availability) && Array.isArray(user.date_overrides)
    && Array.isArray(user.calendar_sources), '使用者設定格式不符');
  for (const rule of user.availability) {
    check(isDate(rule.valid_from) && isDate(rule.valid_to) && rule.valid_from <= rule.valid_to, '可用日期範圍錯誤');
    check([rule.daily_max_minutes, rule.session_minutes].every(n => Number.isInteger(n) && n > 0)
      && [rule.break_minutes, rule.exam_buffer_days].every(n => Number.isInteger(n) && n >= 0), '可用時間限制錯誤');
    validateSlots(rule.weekly_slots, true);
  }
  for (const override of user.date_overrides) {
    check(isDate(override.date), '單日覆寫日期錯誤');
    validateSlots(override.slots);
  }
  check(Array.isArray(courses) && Array.isArray(user_courses) && Array.isArray(calendar_events), '規劃輸入清單格式不符');
  const courseKeys = new Set(courses.map(course => course.course_key));
  check(courseKeys.size === courses.length, '課程識別碼重複');
  for (const course of courses) {
    check(course.user_id === userId && course.schema_version === '1.5', '課程使用者或版本不符');
    check(isDate(course.start_date) && isDate(course.end_date) && course.start_date <= course.end_date, '課程日期範圍錯誤');
    validateSlots(course.course.sessions, true);
    check(Array.isArray(course.grading) && course.grading.every(item => Number.isFinite(item.weight.value)
      && item.weight.value >= 0)
      && Math.abs(course.grading.reduce((sum, item) => sum + item.weight.value, 0) - 100) < 1e-8, '課程配分總和必須為 100');
    const chapters = new Set(course.course.textbook.chapters.map(chapter => chapter.id));
    const assessmentIds = new Set<string>();
    for (const assessment of course.assessments) {
      check(typeof assessment.id === 'string' && !assessmentIds.has(assessment.id), '評量識別碼無效或重複');
      assessmentIds.add(assessment.id);
      check(isDate(assessment.date.value) && assessment.date.value >= course.start_date
        && assessment.date.value <= course.end_date && assessment.scope.value.every(chapter => chapters.has(chapter)),
      '評量日期或章節無效');
      const start = new Date(course.start_date + 'T00:00:00Z');
      const offset = (start.getUTCDay() + 6) % 7;
      const elapsedDays = (Date.parse(assessment.date.value) - start.getTime()) / 86400000;
      check(assessment.date.week === Math.floor((elapsedDays + offset) / 7) + 1, '評量週次與日期不一致');
    }
    for (const week of course.weekly_schedule) {
      check(week.date_range.every(isDate) && week.date_range[0] <= week.date_range[1]
        && week.chapters.every(chapter => chapters.has(chapter)), '每週進度的日期或章節無效');
    }
  }
  const stateKeys = new Set<string>();
  for (const state of user_courses) {
    check(state.user_id === userId && state.schema_version === '1.5' && courseKeys.has(state.course_key)
      && !stateKeys.has(state.course_key) && typeof state.active === 'boolean', '個人課程狀態的課程、使用者或版本不符');
    stateKeys.add(state.course_key);
    const chapters = courses.find(course => course.course_key === state.course_key)!.course.textbook.chapters;
    check(Object.keys(state.chapter_mastery).every(id => chapters.some(chapter => chapter.id === id)), '掌握度引用了未知章節');
  }
  for (const event of calendar_events) {
    check(event.user_id === userId && Date.parse(event.start_at) < Date.parse(event.end_at), '行事曆事件的使用者或時間不符');
  }
  return input;
}

export function filePlanningSource(paths: {
  courses: FilePath[]; userState: FilePath; calendarEvents?: FilePath;
}): PlanningSource {
  return {
    async load(userId) {
      const [state, courses, calendar_events] = await Promise.all([
        readPlanningFile(paths.userState) as Promise<{ user: User; user_courses: UserCourse[] }>,
        Promise.all(paths.courses.map(readPlanningFile)) as Promise<Course[]>,
        paths.calendarEvents ? readPlanningFile(paths.calendarEvents) as Promise<CalendarEvent[]> : [],
      ]);
      return validate({ user: state.user, user_courses: state.user_courses, courses, calendar_events }, userId);
    },
  };
}

export function sqlitePlanningSource(db: DatabaseSync): PlanningSource {
  return {
    async load(userId) {
      const userRow = db.prepare('SELECT data FROM users WHERE user_id = ?').get(userId);
      check(userRow, `找不到使用者：${userId}`);
      const courseRows = db.prepare('SELECT data FROM courses WHERE user_id = ? ORDER BY course_key').all(userId);
      const stateRows = db.prepare('SELECT data FROM user_courses WHERE user_id = ? ORDER BY course_key').all(userId);
      const events = db.prepare('SELECT * FROM calendar_events WHERE user_id = ? ORDER BY event_id').all(userId);
      return validate({
        user: parsePlanningJson(String(userRow.data)) as User,
        courses: courseRows.map(row => parsePlanningJson(String(row.data)) as Course),
        user_courses: stateRows.map(row => parsePlanningJson(String(row.data)) as UserCourse),
        calendar_events: events.map(event => ({ ...event, all_day: Boolean(event.all_day) })) as CalendarEvent[],
      }, userId);
    },
  };
}
