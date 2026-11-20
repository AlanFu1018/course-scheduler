import { clock, shiftDate } from './availability.ts';
import type { Day } from './availability.ts';
import { timeMinutes } from './data.ts';
import type { Course } from './data.ts';

type DateTask = { deadline: string; assessment_id: string | null; type: string; phase: string };
type SchedulerTask = DateTask & {
  task_id: string; course_key: string; priority: number; target_week: string; estimate: { minutes: number };
};
export type Block = { task_id: string; date: string; start_time: string; end_time: string };

export const reviewTypes = new Set<string>(['past_exam', 'mock_exam', 'error_review', 'final_review', 'review']);
const examPrepTypes = new Set<string>(['past_exam', 'mock_exam', 'final_review']);
export const examPrepDays = 14;
export const minimumStudyMinutes = 20;

export function minimumBlock(day: Day) {
  return Math.min(minimumStudyMinutes, day.session_minutes, day.daily_max_minutes);
}

function usableWidths(day: Day) {
  return day.slots.map(s => timeMinutes(s.end_time) - timeMinutes(s.start_time)).filter(w => w >= minimumBlock(day));
}

export function dayCapacity(day: Day) {
  return Math.min(day.daily_max_minutes, usableWidths(day).reduce((sum, width) => sum + width, 0));
}

export function isExamPreparation(task: DateTask) {
  return examPrepTypes.has(task.type);
}

export function dateRestriction(task: DateTask, course: Course, day: Day): string | null {
  if (day.date < course.start_date) return `課程 ${course.start_date} 才開始`;
  if (day.date > task.deadline) return `超過任務期限 ${task.deadline}`;
  const exam = course.assessments.find(item => item.id === task.assessment_id && item.type === 'exam');
  if (exam && isExamPreparation(task) && day.date < shiftDate(exam.date.value, -examPrepDays)) {
    return `專門備考只能安排在考前 ${examPrepDays} 天內`;
  }
  const inBuffer = exam && day.date >= shiftDate(exam.date.value, -day.exam_buffer_days) && day.date < exam.date.value;
  if (inBuffer && !reviewTypes.has(task.type)) return '考前保留期只允許複習與考題練習';
  if (task.phase === 'sprint' && !inBuffer) return '衝刺任務須排在該考試的考前保留期';
  return null;
}

export type TaskWindow = { first: string; last: string; minutes: number; capacity: number };

export function taskWindow(task: DateTask, course: Course, days: Day[], capacity: number[], minutes: number): TaskWindow {
  let first = '', last = '', total = 0;
  for (const [i, day] of days.entries()) {
    if (dateRestriction(task, course, day)) continue;
    first ||= day.date;
    last = day.date;
    total += capacity[i];
  }
  return { first, last, minutes, capacity: total };
}

export function capacityErrors(previous: TaskWindow[], current: (TaskWindow & {title: string})[], days: Day[], capacity: number[]) {
  const errors: string[] = [];
  for (const w of current) {
    if (!w.first) errors.push(`${w.title} 需 ${w.minutes} 分鐘，但沒有任何可排日期`);
    else if (w.minutes > w.capacity) errors.push(`${w.title} 需 ${w.minutes} 分鐘，但可排日期 ${w.first}～${w.last} 共只有 ${w.capacity} 分鐘`);
  }
  const tightest = overloadedIntervals(previous, current, days, capacity);
  for (const { first, last, required, available } of tightest) {
    const titles = current.filter(w => w.first >= first && w.last <= last).map(w => w.title);
    errors.push(`${first}～${last} 共需 ${required} 分鐘，但只有 ${available} 分鐘。本批任務：${titles.join('、')}。請縮短、合併或提前安排，例如將 sprint 改為 practice 以便提早複習。`);
  }
  return errors;
}

export function weekStart(date: string) {
  return shiftDate(date, -((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7));
}

function overloadedIntervals(previous: TaskWindow[], current: TaskWindow[], days: Day[], capacity: number[]) {
  const all = [...previous, ...current].filter(w => w.first);
  const tightest: { first: string; last: string; required: number; available: number }[] = [];
  for (const first of new Set(all.map(w => w.first))) {
    // For this start, accumulate demand in deadline order as the interval expands.
    const ending = new Map<string, number>();
    for (const w of all) {
      if (w.first >= first) ending.set(w.last, (ending.get(w.last) ?? 0) + w.minutes);
    }
    const currentEnds = new Set(current.filter(w => w.first >= first).map(w => w.last));
    let available = 0, required = 0, involvesCurrent = false;
    for (const [i, day] of days.entries()) {
      if (day.date < first) continue;
      available += capacity[i];
      if (!ending.has(day.date)) continue;
      required += ending.get(day.date)!;
      involvesCurrent ||= currentEnds.has(day.date);
      if (involvesCurrent && required > available) {
        tightest.push({ first, last: day.date, required, available });
        tightest.sort((a, b) => (b.required - b.available) - (a.required - a.available) || a.available - b.available);
        if (tightest.length > 3) tightest.pop();
      }
    }
  }
  return tightest;
}

export function shortDate(date: string) {
  return Number(date.slice(5, 7)) + '/' + Number(date.slice(8));
}

type Interval = { start: number; end: number };
type Calendar = Map<string, Interval[]>;
type Entry = { task: SchedulerTask; window: TaskWindow; eligible: Day[] };

function freeIntervals(day: Day, busy: Interval[]) {
  const gaps: Interval[] = [];
  for (const slot of day.slots) {
    let start = timeMinutes(slot.start_time);
    const end = timeMinutes(slot.end_time);
    for (const block of busy) {
      const before = Math.min(end, block.start - day.break_minutes);
      if (before > start) gaps.push({ start, end: before });
      start = Math.max(start, block.end + day.break_minutes);
      if (start >= end) break;
    }
    if (start < end) gaps.push({ start, end });
  }
  return gaps;
}

type Segment = Interval & { previous: Segment | null };

// For each attainable minute total, keep the earliest finish. A later finish
// cannot open up any additional slots for the next segment of this task.
function dayOptions(day: Day, busy: Interval[], limit: number) {
  const options = new Map<number, Segment | null>([[0, null]]);
  const gaps = freeIntervals(day, busy);
  const min = minimumBlock(day);
  for (let used = 0; used <= limit - min; used++) {
    if (!options.has(used)) continue;
    const previous = options.get(used)!;
    for (const gap of gaps) {
      const start = Math.max(gap.start, previous ? previous.end + day.break_minutes : 0);
      const max = Math.min(gap.end - start, day.session_minutes, limit - used);
      for (let length = min; length <= max; length++) {
        const end = start + length;
        const existing = options.get(used + length);
        if (!existing || end < existing.end) options.set(used + length, { start, end, previous });
      }
    }
  }
  return options;
}

type Path = { date: string; segment: Segment; previous: Path | null };

function pack(task: SchedulerTask, days: Day[], calendar: Calendar, caps: Map<string, number>, extra: number) {
  const total = task.estimate.minutes;
  const paths = new Map<number, Path | null>([[0, null]]);
  for (const day of days) {
    const busy = calendar.get(day.date) ?? [];
    const used = busy.reduce((sum, b) => sum + b.end - b.start, 0);
    const cap = Math.min(day.daily_max_minutes, caps.get(day.date)! + extra);
    const limit = Math.min(total, cap - used);
    if (limit < minimumBlock(day)) continue;
    const options = dayOptions(day, busy, limit);
    // Keep existing paths and prefer using more minutes on earlier visited days.
    for (const [minutes, previous] of [...paths].sort(([a], [b]) => b - a)) {
      for (const [amount, segment] of options) {
        const sum = minutes + amount;
        if (!segment || sum > total || paths.has(sum)) continue;
        const path = { date: day.date, segment, previous };
        paths.set(sum, path);
        if (sum === total) return { path, missing: 0 };
      }
    }
  }
  let best = 0;
  for (const minutes of paths.keys()) best = Math.max(best, minutes);
  return { path: null, missing: total - best };
}

function place(task: SchedulerTask, eligible: Day[], calendar: Calendar, caps: Map<string, number>) {
  const after = eligible.filter(d => d.date >= task.target_week);
  let result = pack(task, after, calendar, caps, 0);
  if (!result.path) {
    result = pack(task, after, calendar, caps, Infinity);
    if (result.path) {
      // Find the smallest increase to the soft caps that permits completion.
      let low = 1, high = Math.max(...after.map(d => d.daily_max_minutes - caps.get(d.date)!));
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const attempt = pack(task, after, calendar, caps, mid);
        if (attempt.path) { high = mid; result = attempt; }
        else low = mid + 1;
      }
    }
  }
  const before = eligible.filter(d => d.date < task.target_week).reverse();
  if (!result.path && before.length) result = pack(task, [...after, ...before], calendar, caps, Infinity);
  const blocks: Block[] = [];
  for (let p: Path | null = result.path; p; p = p.previous) {
    const busy = calendar.get(p.date) ?? [];
    for (let s: Segment | null = p.segment; s; s = s.previous) {
      busy.push({ start: s.start, end: s.end });
      blocks.push({ task_id: task.task_id, date: p.date, start_time: clock(s.start), end_time: clock(s.end) });
    }
    calendar.set(p.date, busy.sort((a, b) => a.start - b.start));
  }
  return { blocks, missing: result.missing };
}

const visitsPerRepair = 1_000;
const visitsPerSchedule = 12_000;

function repair(entry: Entry, scheduled: Entry[], days: Day[], original: Block[], calendar: Calendar,
  budget: { remaining: number }) {
  // All preview searches in this repair draw from the same visit allowance.
  const visitFloor = Math.max(0, budget.remaining - visitsPerRepair);
  const { first, last } = entry.window;
  const entries = scheduled.filter(e => e.eligible.some(d => first <= d.date && d.date <= last));
  entries.push(entry);
  const affectedIds = new Set(entries.map(e => e.task.task_id));
  const dates = new Set(entries.flatMap(e => e.eligible.map(d => d.date)));
  const affectedDays = days.filter(d => dates.has(d.date));
  const fixed = original.filter(b => !affectedIds.has(b.task_id));
  const busy = new Map(affectedDays.map(d => [d.date, [] as Interval[]]));
  for (const b of fixed) {
    busy.get(b.date)?.push({ start: timeMinutes(b.start_time), end: timeMinutes(b.end_time) });
  }
  const slots = affectedDays.map(d => freeIntervals(d, busy.get(d.date)!.sort((a, b) => a.start - b.start)));
  const dailyQuota = affectedDays.map(d => d.daily_max_minutes - busy.get(d.date)!.reduce((sum, b) => sum + b.end - b.start, 0));
  const allowed = entries.map(e => new Set(e.eligible.map(d => d.date)));
  function search(previewDays: number) {
    const release = entries.map(e => shiftDate(e.task.target_week, -previewDays));
    const eligible = affectedDays.map(d => entries.map((_, j) => allowed[j].has(d.date) && d.date >= release[j]));
    const remaining = entries.map(e => e.task.estimate.minutes);
    // Optimistic bounds prune branches that can no longer meet a deadline.
    const future = Array.from({ length: affectedDays.length + 1 }, () => remaining.map(() => 0));
    const futureTotal = new Array<number>(affectedDays.length + 1).fill(0);
    const smallest = entries.map(e => Math.min(...e.eligible.map(minimumBlock)));
    const capacity = (i: number, start: number, quota: number) => {
      const d = affectedDays[i];
      const cycle = d.session_minutes + d.break_minutes;
      const usable = slots[i].reduce((sum, gap) => {
        const width = Math.max(0, gap.end - Math.max(start, gap.start));
        return sum + Math.floor(width / cycle) * d.session_minutes + Math.min(d.session_minutes, width % cycle);
      }, 0);
      return Math.min(quota, usable);
    };
    for (let i = affectedDays.length - 1; i >= 0; i--) {
      const cap = capacity(i, 0, dailyQuota[i]);
      future[i] = future[i + 1].map((n, j) => n + (eligible[i][j] ? cap : 0));
      futureTotal[i] = futureTotal[i + 1] + cap;
    }
    const failed = new Set<string>();
    const blocks: Block[] = [];
    function visit(i: number, earliest: number, used: number): boolean {
      budget.remaining--;
      if (remaining.every(n => !n)) return true;
      if (budget.remaining === visitFloor || i === affectedDays.length) return false;
      const d = affectedDays[i];
      const cap = capacity(i, earliest, dailyQuota[i] - used);
      if (remaining.reduce((sum, n) => sum + n, 0) > cap + futureTotal[i + 1]) return false;
      let neededToday = 0;
      for (let j = 0; j < remaining.length; j++) {
        const needed = Math.max(0, remaining[j] - future[i + 1][j]);
        if (needed && !eligible[i][j]) return false;
        neededToday += needed;
      }
      if (neededToday > cap) return false;
      const key = [i, earliest, used, ...remaining].join('/');
      if (failed.has(key)) return false;
      for (let j = 0; j < entries.length; j++) {
        if (!eligible[i][j]) continue;
        const max = Math.min(remaining[j], cap, d.session_minutes);
        for (let length = max; length >= minimumBlock(d); length--) {
          if (remaining[j] > length && remaining[j] - length < smallest[j]) continue;
          const slot = slots[i].find(g => Math.max(g.start, earliest) + length <= g.end);
          if (!slot) continue;
          const start = Math.max(earliest, slot.start), end = start + length;
          remaining[j] -= length;
          blocks.push({ task_id: entries[j].task.task_id, date: d.date, start_time: clock(start), end_time: clock(end) });
          if (visit(i, end + d.break_minutes, used + length)) return true;
          if (budget.remaining === visitFloor) return false;
          blocks.pop();
          remaining[j] += length;
        }
      }
      if (!neededToday && visit(i + 1, 0, 0)) return true;
      failed.add(key);
      return false;
    }
    return visit(0, 0, 0) ? blocks : null;
  }
  let solution = search(0);
  if (!solution) {
    // Focus weeks belong to this planning horizon. Minimize how far back
    // the repair reaches when preview is necessary.
    let low = 1, high = Math.max(0, ...entries.map(e =>
      (Date.parse(e.task.target_week) - Date.parse(affectedDays[0].date)) / 86400000));
    if (!high || budget.remaining === visitFloor) return null;
    solution = search(high);
    if (!solution) return null;
    while (low < high) {
      if (budget.remaining === visitFloor) return null;
      const mid = Math.floor((low + high) / 2);
      const trial = search(mid);
      if (trial) { high = mid; solution = trial; }
      else if (budget.remaining === visitFloor) return null;
      else low = mid + 1;
    }
  }
  for (const b of solution) {
    busy.get(b.date)!.push({ start: timeMinutes(b.start_time), end: timeMinutes(b.end_time) });
  }
  for (const [date, intervals] of busy) calendar.set(date, intervals.sort((a, b) => a.start - b.start));
  return [...fixed, ...solution];
}

export function scheduleTasks(tasks: SchedulerTask[], courses: Course[], days: Day[]) {
  const capacity = days.map(d => dayCapacity(d));
  const pending: { task_id: string; reason: string }[] = [];
  const active = tasks.flatMap(task => {
    const course = courses.find(c => c.course_key === task.course_key)!;
    const window = taskWindow(task, course, days, capacity, task.estimate.minutes);
    if (!window.first) {
      pending.push({ task_id: task.task_id, reason: '截止前沒有符合課程與考試限制的可排日期' });
      return [];
    }
    return [{ task, window, eligible: days.filter(d => !dateRestriction(task, course, d)) }];
  });
  while (active.length) {
    const [interval] = overloadedIntervals([], active.map(e => e.window), days, capacity);
    if (!interval) break;
    const victim = active.filter(e => interval.first <= e.window.first && e.window.last <= interval.last)
      .sort((a, b) => a.task.priority - b.task.priority || b.task.deadline.localeCompare(a.task.deadline)
        || b.window.minutes - a.window.minutes)[0];
    active.splice(active.indexOf(victim), 1);
    pending.push({ task_id: victim.task.task_id, reason: shortDate(interval.first) + '～' + shortDate(interval.last)
      + ' 共需 ' + interval.required + ' 分鐘，只有 ' + interval.available + ' 分鐘；此任務保留為待排' });
  }
  const demand = new Map<string, number>();
  for (const { target_week, estimate } of tasks) demand.set(target_week, (demand.get(target_week) ?? 0) + estimate.minutes);
  const counts = new Map<string, number>();
  for (const d of days) {
    const week = weekStart(d.date);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  const caps = new Map(days.map(d => {
    const week = weekStart(d.date);
    const average = Math.ceil((demand.get(week) ?? 0) / counts.get(week)!);
    return [d.date, Math.min(d.daily_max_minutes, Math.max(minimumBlock(d), average))];
  }));
  active.sort((a, b) => a.task.deadline.localeCompare(b.task.deadline) || b.task.priority - a.task.priority);
  const calendar: Calendar = new Map();
  const repairBudget = { remaining: visitsPerSchedule };
  let blocks: Block[] = [];
  const scheduled: typeof active = [];
  for (const entry of active) {
    const result = place(entry.task, entry.eligible, calendar, caps);
    if (result.missing) {
      // A task that cannot fit even in an empty calendar cannot benefit from repair.
      const possible = repairBudget.remaining > 0 && pack(entry.task, entry.eligible, new Map(), caps, Infinity).path;
      const replacement = possible && repair(entry, scheduled, days, blocks, calendar, repairBudget);
      if (!replacement) {
        pending.push({ task_id: entry.task.task_id, reason: '截止前可用空檔不足（還差 ' + result.missing + ' 分鐘）' });
        continue;
      }
      blocks = replacement;
    } else blocks.push(...result.blocks);
    scheduled.push(entry);
  }
  blocks.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  return { blocks, pending };
}
