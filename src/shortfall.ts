import { availabilityRules, availableDays, shiftDate } from './availability.ts';
import type { Day } from './availability.ts';
import type { Course, PlanningInput } from './data.ts';
import type { PlanDraft } from './planner.ts';
import { dateRestriction, dayCapacity, disjointIntervals, minimumStudyMinutes, overloadedIntervals, shortDate, taskWindow } from './scheduler.ts';

type Task = PlanDraft['tasks'][number];
type Demand = { from: string; to: string; tasks: Task[]; available: number; reason?: string; outsideWindow?: boolean };

const emptyRule = { weekly_slots: [], daily_max_minutes: 60, session_minutes: 30, break_minutes: 5, exam_buffer_days: 0 };
const duration = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
const isLong = (from: string, to: string) => duration(from, to) >= 28;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function taskWindows(tasks: Task[], courses: Map<string, Course>, days: Day[], capacity: number[]) {
  return tasks.map(task => ({ ...taskWindow(task, courses.get(task.course_key)!, days, capacity, task.estimate.minutes), task }));
}

function smallestPassing(low: number, high: number, passes: (value: number) => boolean) {
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (passes(mid)) high = mid;
    else low = mid + 1;
  }
  return low;
}

function addTime(input: PlanningInput, interval: Demand, courses: Map<string, Course>, required: number, getDays: typeof availableDays) {
  const { from, to, tasks } = interval;
  const rules = availabilityRules(input);
  const base = rules.find(r => r.valid_from <= from && from <= r.valid_to) ?? emptyRule;
  const rule = { ...base, valid_from: from, valid_to: to };
  const proposed = { ...input, user: { ...input.user, availability: [...input.user.availability, rule] } };
  const scope = { from, to, course_keys: [] };
  const days = getDays(proposed, scope);
  // A later-starting rule keeps its own cap inside the exceptional period.
  const adjustable = (date: string) => !rules.some(r => from < r.valid_from && r.valid_from <= date && date <= r.valid_to);
  const allowed = (task: Task, day: Day) => !dateRestriction(task, courses.get(task.course_key)!, day);
  if (!days.some(d => adjustable(d.date) && tasks.some(t => allowed(t, d)))) {
    // With no existing free day, distribute new slots over days that can actually be opened.
    const fullWeek = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, start_time: '00:00', end_time: '23:59' }));
    const expanded = { ...input.user, availability: [...input.user.availability, { ...rule, weekly_slots: fullWeek }] };
    const existing = new Set(days.map(d => d.date));
    for (const day of getDays({ ...input, user: expanded }, scope)) {
      if (!existing.has(day.date) && adjustable(day.date)) days.push({ ...day, slots: [] });
    }
    days.sort((a, b) => a.date.localeCompare(b.date));
  }
  const variable = days.map(d => adjustable(d.date));
  const widths = days.map(d => dayCapacity({ ...d, daily_max_minutes: 1440 }));
  const eligible = tasks.map(task => days.flatMap((day, i) => allowed(task, day) ? [i] : []));
  const windows = eligible.map((indices, i) => ({ first: days[indices[0]]?.date ?? '',
    last: days[indices.at(-1)!]?.date ?? '', minutes: tasks[i].estimate.minutes }));
  function fits(cap: number, extra: number) {
    const capacity = days.map((day, i) => {
      if (!variable[i]) return dayCapacity(day);
      const usable = cap < minimumStudyMinutes ? dayCapacity({ ...day, daily_max_minutes: cap }) : widths[i];
      return Math.min(Math.max(0, cap - (day.reserved_minutes ?? 0)), usable + extra);
    });
    return eligible.every((indices, i) => indices.reduce((n, j) => n + capacity[j], 0) >= windows[i].minutes)
      && !overloadedIntervals([], windows, days, capacity).length;
  }
  // Small caps can make slots shorter than the normal minimum session usable.
  let cap = rule.daily_max_minutes;
  let extra = 0;
  while (cap < minimumStudyMinutes && !fits(cap, 0)) cap++;
  if (cap >= minimumStudyMinutes) {
    const high = Math.max(cap, required + Math.max(0, ...days.map(d => d.reserved_minutes ?? 0)));
    if (!fits(high, 0)) {
      if (!fits(high, required)) return null;
      extra = smallestPassing(1, required, n => fits(high, n));
    }
    cap = smallestPassing(cap, high, n => fits(n, extra));
  }
  return { raise_daily_max_to: extra ? null : cap,
    extra_minutes_per_day: extra, availability_rule: { ...rule, daily_max_minutes: cap } };
}

function extendExamBuffer(input: PlanningInput, draft: PlanDraft, interval: Demand, courses: Map<string, Course>, getDays: typeof availableDays) {
  if (!interval.tasks.some(t => t.phase === 'sprint')) return null;
  const rule = availabilityRules(input).find(r => r.valid_from <= interval.from && interval.from <= r.valid_to);
  if (!rule) return null;
  const affected = new Set(interval.tasks);
  for (let n = rule.exam_buffer_days + 1; n <= 21; n++) {
    const availability = input.user.availability.map(r => r === rule ? { ...r, exam_buffer_days: n } : r);
    const days = getDays({ ...input, user: { ...input.user, availability } }, draft.scope);
    const capacity = days.map(dayCapacity);
    const windows = taskWindows(draft.tasks, courses, days, capacity);
    const current = windows.filter(w => affected.has(w.task));
    if (current.some(w => w.minutes > w.capacity)) continue;
    // Moving the start can bring a different exam's tasks into competition.
    // A separate semester-wide shortage can still be handled by the regular-time suggestion.
    const overloads = overloadedIntervals([], windows, days, capacity, 'all');
    const local = disjointIntervals(overloads.filter(w => !isLong(w.first, w.last)));
    if (!local.some(i => current.some(w => i.first <= w.first && w.last <= i.last))
      && !overloadedIntervals([], current, days, capacity).length) {
      return { current_days: rule.exam_buffer_days, suggested_days: n };
    }
  }
  return null;
}

type CapacityCheck = { first: string; last: string; required: number; available: number };
function regularTime(input: PlanningInput, scope: PlanDraft['scope'], days: Day[], checks: CapacityCheck[],
  fitsLongWindows: (capacity: number[]) => boolean) {
  const weekly_extra_minutes = checks.reduce((extra, c) =>
    Math.max(extra, Math.ceil(7 * (c.required - c.available) / duration(c.first, c.last))), 0);
  const rules = availabilityRules(input);
  // A rule nested inside a longer-lived rule is a temporary override. For equal bounds the last edit wins.
  const regular = rules.filter((r, i) => r.valid_from <= scope.to && scope.from <= r.valid_to &&
    !rules.some((other, j) => other.valid_from <= r.valid_from && r.valid_to <= other.valid_to &&
      (other.valid_from < r.valid_from || r.valid_to < other.valid_to || j < i)));
  const adjustable = days.map(d => regular.includes(rules.find(r => r.valid_from <= d.date && d.date <= r.valid_to)!));
  const fits = (cap: number) => fitsLongWindows(days.map((d, i) =>
    adjustable[i] ? dayCapacity({ ...d, daily_max_minutes: Math.max(d.daily_max_minutes, cap) }) : dayCapacity(d)));
  // Below the minimum block length, raising the cap can make a very short slot unusable.
  let cap = Math.min(...regular.map(r => r.daily_max_minutes), minimumStudyMinutes);
  while (cap < minimumStudyMinutes && !fits(cap)) cap++;
  const raise_daily_max_to = cap < minimumStudyMinutes ? cap : fits(1440) ? smallestPassing(cap, 1440, fits) : null;
  const base = regular.find(r => raise_daily_max_to !== null && r.daily_max_minutes < raise_daily_max_to)
    ?? regular[0] ?? { ...emptyRule, valid_from: scope.from, valid_to: scope.to };
  return { weekly_extra_minutes, raise_daily_max_to,
    availability_rule: { ...base, daily_max_minutes: Math.max(base.daily_max_minutes, raise_daily_max_to ?? 0) } };
}

export function assessShortfall(input: PlanningInput, draft: PlanDraft, courses: Course[], days: Day[], getDays = availableDays) {
  const capacity = days.map(dayCapacity);
  const byKey = new Map(courses.map(course => [course.course_key, course]));
  const windows = taskWindows(draft.tasks, byKey, days, capacity);
  const required_minutes = sum(windows.map(w => w.minutes)), available_minutes = sum(capacity);
  const missing_minutes = Math.max(0, required_minutes - available_minutes);
  const scopeDays = duration(draft.scope.from, draft.scope.to);
  const firstDay = days[0]?.date ?? draft.scope.from;
  // A short prefix can repeat the same regular weekly deficit. Later release dates
  // (such as the start of exam preparation) impose an independent local constraint.
  const isLocalPeak = (from: string, to: string, missing: number) =>
    from > firstDay || missing * scopeDays > missing_minutes * duration(from, to);
  const overloads = overloadedIntervals([], windows, days, capacity, 'all');
  const long = overloads.filter(w => isLong(w.first, w.last));
  const short = overloads.filter(w => !isLong(w.first, w.last) && isLocalPeak(w.first, w.last, w.required - w.available));
  const demands: Demand[] = [...disjointIntervals(long), ...disjointIntervals(short)].map(w => ({
    from: w.first, to: w.last, available: w.available,
    tasks: windows.filter(t => t.first >= w.first && t.last <= w.last).map(t => t.task),
  }));
  const rules = availabilityRules(input);
  const reported = (long: boolean) => new Set(demands.filter(d => isLong(d.from, d.to) === long).flatMap(d => d.tasks));
  const reportedLong = reported(true), reportedShort = reported(false);
  for (const window of windows) {
    const { task, first } = window;
    if (first) {
      // A change in exam-buffer rules can leave ineligible dates between the two endpoints.
      const longWindow = isLong(first, window.last);
      if (window.minutes > window.capacity && !(longWindow ? reportedLong : reportedShort).has(task)
        && (longWindow || isLocalPeak(first, window.last, window.minutes - window.capacity))) {
        demands.push({ from: first, to: window.last, tasks: [task], available: window.capacity });
      }
      continue;
    }
    // Locate the academic window even when it contains no free slots.
    const course = byKey.get(task.course_key)!;
    const dates = [];
    for (let date = draft.scope.from; date <= draft.scope.to; date = shiftDate(date, 1)) {
      const rule = rules.find(r => r.valid_from <= date && date <= r.valid_to) ?? emptyRule;
      if (!dateRestriction(task, course, { ...rule, date, slots: [] })) dates.push(date);
    }
    const from = dates[0] ?? draft.scope.from, to = dates.at(-1) ?? (scopeDays > 0 ? draft.scope.to : from);
    const outsideWindow = !dates.length;
    const existing = demands.find(d => d.from === from && d.to === to && d.outsideWindow === outsideWindow);
    if (existing) existing.tasks.push(task);
    else demands.push({ from, to, tasks: [task], available: 0, outsideWindow,
      reason: outsideWindow ? '規劃範圍內沒有符合課程與考試日期限制的日子' : '沒有符合任務限制的可用時段' });
  }
  if (!demands.length && !missing_minutes) return null;
  demands.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const courseDemand = (tasks: Task[]) => {
    const totals = new Map<string, number>();
    for (const task of tasks) totals.set(task.course_key, (totals.get(task.course_key) ?? 0) + task.estimate.minutes);
    return [...totals].sort(([a, n], [b, m]) => m - n || a.localeCompare(b)).map(([course_key, minutes]) => ({
      course_key, name: byKey.get(course_key)!.course.name ?? course_key,
      target_grade: draft.targetGrades[course_key], minutes,
    }));
  };
  const describe = ({ from, to, tasks, available, reason }: Demand) => {
    const required = sum(tasks.map(t => t.estimate.minutes));
    return { from, to, required_minutes: required, available_minutes: available, missing_minutes: required - available,
      courses: courseDemand(tasks), task_ids: tasks.map(t => t.task_id), ...(reason && { reason }) };
  };
  const longDemands = demands.filter(d => isLong(d.from, d.to));
  const intervals = longDemands.map(describe);
  let overall = null;
  if (scopeDays > 0 && (missing_minutes || intervals.length)) {
    const longTasks = windows.filter(w => w.first && isLong(w.first, w.last));
    const checks = [{ first: draft.scope.from, last: draft.scope.to, required: required_minutes, available: available_minutes },
      ...long, ...intervals.map(i => ({ first: i.from, last: i.to, required: i.required_minutes, available: i.available_minutes })),
      ...longTasks.map(w => ({ ...w, required: w.minutes, available: w.capacity }))];
    const fits = (caps: number[]) => {
      if (sum(caps) < required_minutes || longDemands.some(d => d.reason)) return false;
      if (longTasks.some(w => taskWindow(w.task, byKey.get(w.task.course_key)!, days, caps, w.minutes).capacity < w.minutes)) return false;
      return !overloadedIntervals([], windows, days, caps, 'all').some(w => isLong(w.first, w.last));
    };
    const affected = missing_minutes ? draft.tasks : [...new Set(longDemands.flatMap(d => d.tasks))];
    overall = { required_minutes, available_minutes, missing_minutes, intervals, suggestions: {
      adjust_regular_time: regularTime(input, draft.scope, days, checks, fits), lower_target: courseDemand(affected),
    } };
  }
  const short_term = demands.filter(d => !isLong(d.from, d.to)).map(d => {
    const interval = describe(d);
    return { ...interval, suggestions: {
      add_time: d.outsideWindow ? null : addTime(input, d, byKey, interval.required_minutes, getDays),
      extend_exam_buffer: extendExamBuffer(input, draft, d, byKey, getDays), lower_target: interval.courses,
    } };
  });
  const hours = (minutes: number) => Number((minutes / 60).toFixed(1));
  const range = (i: { from: string; to: string }) => `${shortDate(i.from)}～${shortDate(i.to)}`;
  let message = '';
  if (overall) {
    const i = intervals[0];
    message = missing_minutes
      ? `你每週提供的時間不夠：整個規劃期間需要 ${hours(required_minutes)} 小時，可用 ${hours(available_minutes)} 小時。`
      : `你每週提供的時間不夠：${range(i)} 需要 ${hours(i.required_minutes)} 小時，可用 ${hours(i.available_minutes)} 小時。`;
  }
  const first = short_term[0];
  if (first) message += `${overall ? '另外 ' : '平常時間夠用，但 '}${range(first)} 還差 ${first.missing_minutes} 分鐘。`;
  if (scopeDays <= 0) message = `原計畫已於 ${shortDate(draft.scope.to)} 結束，剩下的 ${required_minutes} 分鐘沒有可排日期。`;
  return { overall, short_term, message };
}
