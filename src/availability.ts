import { isDate, timeMinutes } from './data.ts';
import type { PlanningInput, Slot } from './data.ts';

export type Scope = { from: string; to: string; course_keys: string[] };
export type Day = {
  date: string; slots: Slot[]; daily_max_minutes: number; session_minutes: number;
  break_minutes: number; exam_buffer_days: number;
  reserved_minutes?: number;
};

export function shiftDate(date: string, days: number): string {
  const time = new Date(date + 'T00:00:00Z');
  time.setUTCDate(time.getUTCDate() + days);
  return time.toISOString().slice(0, 10);
}

export function localParts(timezone: string) {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return {
    format(instant: Date | number) {
      const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    },
  };
}

export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function availabilityRules(input: PlanningInput) {
  // An appended exception takes precedence when two rules start on the same date.
  return input.user.availability.toReversed().sort((a, b) => b.valid_from.localeCompare(a.valid_from));
}

export function availableDays(input: PlanningInput, scope: Scope): Day[] {
  const { user } = input;
  const active = new Set(input.user_courses.filter(state => state.active).map(state => state.course_key));
  const sources = new Set(user.calendar_sources.filter(source => source.treat_as === 'busy').map(source => source.source_id));
  const local = localParts(user.timezone);
  const busy = new Map<string, Set<number>>();
  const busyDates = new Set<string>();
  for (const event of input.calendar_events) {
    if (!sources.has(event.source_id)) continue;
    if (event.all_day || (isDate(event.start_at) && isDate(event.end_at))) {
      const localDate = (value: string) => isDate(value) ? value : local.format(Date.parse(value)).slice(0, 10);
      const start = localDate(event.start_at);
      const end = localDate(event.end_at);
      for (let date = start < scope.from ? scope.from : start; date < end && date <= scope.to; date = shiftDate(date, 1)) {
        busyDates.add(date);
      }
      continue;
    }
    const from = Date.parse(event.start_at);
    const to = Date.parse(event.end_at);
    // Work in elapsed minutes first so offsets and changes of offset are respected.
    const first = Math.max(from, Date.parse(scope.from) - 86400000);
    const last = Math.min(to, Date.parse(scope.to) + 2 * 86400000);
    for (let time = Math.floor(first / 60000) * 60000; time < last; time += 60000) {
      const [date, clock] = local.format(time).split('T');
      if (date < scope.from || date > scope.to) continue;
      if (!busy.has(date)) busy.set(date, new Set());
      busy.get(date)!.add(timeMinutes(clock));
    }
  }

  const rules = availabilityRules(input);
  const days: Day[] = [];
  for (let date = scope.from; date <= scope.to; date = shiftDate(date, 1)) {
    if (busyDates.has(date)) continue;
    const rule = rules.find(rule => rule.valid_from <= date && date <= rule.valid_to);
    if (!rule) continue;
    const weekday = new Date(date + 'T00:00:00Z').getUTCDay() || 7;
    const wanted = user.date_overrides.find(entry => entry.date === date)?.slots
      ?? rule.weekly_slots.filter(slot => slot.weekday === weekday);
    if (!wanted.length) continue;
    const free = new Uint8Array(1440);
    for (const slot of wanted) free.fill(1, timeMinutes(slot.start_time), timeMinutes(slot.end_time));
    for (const course of input.courses) {
      if (!active.has(course.course_key) || date < course.start_date || date > course.end_date) continue;
      for (const slot of course.course.sessions) {
        if (slot.weekday === weekday) free.fill(0, timeMinutes(slot.start_time), timeMinutes(slot.end_time));
      }
    }
    for (const minute of busy.get(date) ?? []) free[minute] = 0;
    const slots: Slot[] = [];
    for (let minute = 0; minute < free.length;) {
      const start = minute;
      const present = free[minute];
      while (minute < free.length && free[minute] === present) minute++;
      if (present) slots.push({ start_time: clock(start), end_time: clock(minute) });
    }
    if (!slots.length) continue;
    const { daily_max_minutes, session_minutes, break_minutes, exam_buffer_days } = rule;
    days.push({ date, slots, daily_max_minutes, session_minutes, break_minutes, exam_buffer_days });
  }
  return days;
}
