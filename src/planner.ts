import { randomUUID } from 'node:crypto';
import { availableDays, shiftDate } from './availability.ts';
import type { Day, Scope } from './availability.ts';
import { check, isDate, timeMinutes } from './data.ts';
import type { Course, PlanningInput } from './data.ts';
import type { LlmService } from './llm.ts';
import { GeminiResponseError, RequestError } from './errors.ts';
import { scheduleTasks, capacityErrors, dateRestriction, dayCapacity, examPrepDays, isExamPreparation,
  minimumBlock, minimumStudyMinutes, reviewTypes, taskWindow, weekStart, shortDate } from './scheduler.ts';
import type { Block, TaskWindow } from './scheduler.ts';

const taskTypes = ['reading', 'notes', 'examples', 'past_exam', 'mock_exam', 'error_review', 'final_review', 'homework', 'review'] as const;
const phases = ['learn', 'practice', 'sprint'] as const;
type Estimate = { base_minutes: number; difficulty_mult: number; familiarity_mult: number; speed_factor: number };
type TaskDraft = {
  course_key: string; assessment_id: string | null; type: typeof taskTypes[number];
  phase: typeof phases[number]; title: string; chapters: string[]; estimate: Estimate;
  deadline: string; priority: number; reason: string;
};
type Task = Omit<TaskDraft, 'estimate'> & {
  estimate: Estimate & { minutes: number }; task_id: string; user_id: string; plan_id: string;
  schema_version: string; status: 'pending' | 'scheduled'; source: 'ai'; parent_task_id: null;
  pending_reason?: string; completions: []; created_at: string; updated_at: string;
};

const string = { type: 'string' };
const number = { type: 'number' };
const array = (items: object) => ({ type: 'array', items });
const object = (properties: Record<string, object>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const batchSchema = (focusIds: string[]) => object({ tasks: array(object({
  focus_id: { ...string, enum: focusIds },
  course_key: string, assessment_id: { type: ['string', 'null'] },
  type: { ...string, enum: taskTypes }, phase: { ...string, enum: phases },
  title: string, chapters: array(string), deadline: string, priority: number, reason: string,
  estimate: object({ base_minutes: number, difficulty_mult: number, familiarity_mult: number, speed_factor: number }),
})) });

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDateBounds(value: unknown, first: string, last: string) {
  check(isDate(value) && first <= value && value <= last, `日期超出允許範圍：${value}`);
}

function estimateMinutes(estimate: Estimate) {
  const { base_minutes, difficulty_mult, familiarity_mult, speed_factor } = estimate;
  const minutes = Math.round(base_minutes * difficulty_mult * familiarity_mult * speed_factor / 5) * 5;
  check(Number.isSafeInteger(minutes) && minutes > 0, '公式算出的估時必須為正整數');
  return minutes;
}

function assessmentDeadline(assessment: Course['assessments'][number]) {
  return assessment.type === 'exam' ? shiftDate(assessment.date.value, -1) : assessment.date.value;
}

export function phaseForType(type: TaskDraft['type']) {
  return type === 'reading' || type === 'notes' ? 'learn' : 'practice';
}

function validateTask(task: TaskDraft, courses: Course[], scope: Scope, log: PlanningRun['log']): TaskDraft {
    const course = courses.find(course => course.course_key === task?.course_key);
    check(course && taskTypes.includes(task.type) && phases.includes(task.phase), '任務課程、類型或階段無效');
    const assessment = course.assessments.find(item => item.id === task.assessment_id);
    check(task.assessment_id === null || assessment, '任務引用了未知評量');
    check(Array.isArray(task.chapters) && task.chapters.every(id => course.course.textbook.chapters.some(chapter => chapter.id === id)),
      '任務引用了未知章節');
    const earliest = course.start_date > scope.from ? course.start_date : scope.from;
    const limit = assessment ? assessmentDeadline(assessment) : course.end_date;
    const latest = limit < course.end_date ? limit : course.end_date;
    check(isDate(task.deadline) && earliest <= task.deadline && task.deadline <= latest,
      `deadline 收到 ${task.deadline}，允許範圍為 ${earliest} 至 ${latest}`);
    check(text(task.title) && text(task.reason) && Number.isFinite(task.priority) && task.priority >= 0 && task.priority <= 1,
      '任務名稱、理由或優先度無效');
    check(!isExamPreparation(task) || assessment?.type === 'exam', '專門備考任務必須關聯一項考試');
    const { base_minutes, difficulty_mult, familiarity_mult, speed_factor } = task.estimate;
    check([base_minutes, difficulty_mult, familiarity_mult, speed_factor].every(value => Number.isFinite(value) && value > 0),
      '估時參數必須為正數');
    estimateMinutes(task.estimate);
    let phase = task.phase;
    if (phase === 'sprint' && !(assessment?.type === 'exam' && reviewTypes.has(task.type))) {
      phase = phaseForType(task.type);
      log?.(`${task.title}：sprint 不適用，改為 ${phase}`);
    }
    return {
      course_key: task.course_key, assessment_id: task.assessment_id, type: task.type, phase,
      title: task.title, chapters: task.chapters, deadline: task.deadline, priority: task.priority, reason: task.reason,
      estimate: { base_minutes, difficulty_mult, familiarity_mult, speed_factor },
    };
}

type PlacementTask = Pick<Task, 'task_id' | 'title' | 'course_key' | 'assessment_id' | 'type' | 'phase' | 'deadline' | 'status'>
  & { estimate: { minutes: number } };

export function validatePlacement(blocks: Block[], tasks: PlacementTask[], days: Day[], courses: Course[]) {
  const taskById = new Map(tasks.map(task => [task.task_id, task]));
  const dayByDate = new Map(days.map(day => [day.date, day]));
  const totals = new Map<string, number>();
  const blocksByDate = new Map<string, { start: number; end: number; label: string }[]>();
  const errors: string[] = [];
  for (const block of blocks) {
    const task = taskById.get(block.task_id);
    const day = dayByDate.get(block.date);
    if (!task || !day) throw new Error('時段引用了未知任務或不可排日期');
    const start = timeMinutes(block.start_time);
    const end = timeMinutes(block.end_time);
    const duration = end - start;
    const label = `${task.title}（${block.date} ${block.start_time}–${block.end_time}）`;
    if (duration < minimumBlock(day) || duration > day.session_minutes) {
      errors.push(`${label}：長度 ${duration} 分鐘，每段須為 ${minimumBlock(day)} 至 ${day.session_minutes} 分鐘`);
    }
    if (!day.slots.some(slot => timeMinutes(slot.start_time) <= start && end <= timeMinutes(slot.end_time))) {
      errors.push(`${label}：超出可用時間或與上課、行事曆衝突`);
    }
    const course = courses.find(course => course.course_key === task.course_key)!;
    const restriction = dateRestriction(task, course, day);
    if (restriction) errors.push(`${label}：${restriction}`);
    const intervals = blocksByDate.get(block.date) ?? [];
    intervals.push({ start, end, label });
    blocksByDate.set(block.date, intervals);
    totals.set(task.task_id, (totals.get(task.task_id) ?? 0) + duration);
  }
  for (const [date, intervals] of blocksByDate) {
    const day = dayByDate.get(date)!;
    intervals.sort((a, b) => a.start - b.start);
    const used = intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);
    if (used > day.daily_max_minutes) errors.push(`${date}：共 ${used} 分鐘，超過單日上限 ${day.daily_max_minutes} 分鐘`);
    for (let index = 1; index < intervals.length; index++) {
      const gap = intervals[index].start - intervals[index - 1].end;
      if (gap < day.break_minutes) {
        errors.push(`${intervals[index - 1].label} 與 ${intervals[index].label}：${gap < 0 ? '重疊' : `只間隔 ${gap} 分鐘`}，須間隔至少 ${day.break_minutes} 分鐘`);
      }
    }
  }
  for (const task of tasks) {
    const expected = task.status === 'scheduled' ? task.estimate.minutes : 0;
    if ((totals.get(task.task_id) ?? 0) !== expected) errors.push(task.title + ' 的排程分鐘數不符');
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

async function generateValidated<T>(
  llm: LlmService, log: PlanningRun['log'], prompt: string, schema: object, validate: (value: unknown, finalAttempt: boolean) => T,
) {
  async function request(instruction: string) {
    const started = Date.now();
    const value = await llm.generate(instruction, schema);
    if (log) {
      const data = value as { weeks?: unknown[]; tasks?: TaskDraft[] } | null;
      let detail = '回應格式待驗證';
      if (Array.isArray(data?.weeks)) detail = `逐週重點 ${data.weeks.length} 週`;
      if (Array.isArray(data?.tasks)) detail = `任務 ${data.tasks.length} 項 · ${data.tasks.slice(0, 3).map(t => String(t?.title ?? '').slice(0, 60)).join('、')}`;
      log(`Gemini 回傳（${((Date.now() - started) / 1000).toFixed(1)} 秒）${detail}`);
    }
    return value;
  }
  const first = await request(prompt);
  try {
    return validate(first, false);
  } catch (error) {
    log?.(`驗證失敗，請 Gemini 修正：${(error as Error).message}`);
    const correction = `\n上次回應不符合規則：${(error as Error).message}。請重新輸出完整 JSON。\n上次回應：${JSON.stringify(first)}`;
    const second = await request(prompt + correction);
    try {
      return validate(second, true);
    } catch (retryError) {
      log?.(`修正後驗證仍失敗：${(retryError as Error).message}`);
      if (retryError instanceof RequestError) throw new GeminiResponseError(retryError.message, { cause: retryError });
      throw retryError;
    }
  }
}

export interface PlanningRun {
  step<T>(name: string, compute: () => Promise<T>): Promise<T>;
  progress(message: string): void;
  log?(message: string): void;
}
const transientRun: PlanningRun = { step: (_, compute) => compute(), progress() {} };

export async function generateInitialPlan(input: PlanningInput, scope: Scope, llm: LlmService, now = new Date(), run: PlanningRun = transientRun) {
  isDateBounds(scope.from, '0001-01-02', '9998-12-31');
  isDateBounds(scope.to, scope.from, shiftDate(scope.from, 365));
  check(Array.isArray(scope.course_keys) && scope.course_keys.every(key => typeof key === 'string'), '課程範圍無效');
  const states = input.user_courses.filter(state => state.active);
  const courses = input.courses.filter(course => states.some(state => state.course_key === course.course_key)
    && course.start_date <= scope.to && course.end_date >= scope.from
    && (!scope.course_keys.length || scope.course_keys.includes(course.course_key)));
  check(scope.course_keys.every(key => courses.some(course => course.course_key === key)), '範圍包含無效或未啟用的課程');
  const planningCourses = courses.map(course => ({
    ...course,
    assessments: course.assessments.filter(assessment => assessmentDeadline(assessment) >= scope.from),
  }));
  const days = availableDays(input, scope);
  const capacity = days.map(day => dayCapacity(day));
  const capacityBetween = (from: string, to: string) => days.reduce((sum, day, i) =>
    sum + (from <= day.date && day.date <= to ? capacity[i] : 0), 0);
  const { plan_id, created_at } = await run.step('identity', async () => ({
    plan_id: `p_${randomUUID()}`, created_at: now.toISOString(),
  }));
  const user_id = input.user.user_id;
  const weeks: { from: string; to: string }[] = [];
  for (let monday = weekStart(scope.from); monday <= scope.to; monday = shiftDate(monday, 7)) {
    const from = monday < scope.from ? scope.from : monday;
    const sunday = shiftDate(monday, 6);
    const to = sunday > scope.to ? scope.to : sunday;
    if (courses.some(course => course.start_date <= to && course.end_date >= from)) weeks.push({ from, to });
  }
  const detail = (from: string, to: string) => planningCourses.filter(course => course.start_date <= to && course.end_date >= from)
    .map(course => ({ ...course, weekly_schedule: course.weekly_schedule.filter(week =>
      week.date_range[0] <= to && week.date_range[1] >= from) }));
  const capacities = weeks.map(week => ({
    ...week, minutes: capacityBetween(week.from, week.to),
  }));
  type Focus = { course_key: string; topic: string };
  type WeekFocus = { from: string; focus: Focus[] };
  const analysisSchema = object({ weeks: array(object({ from: string, focus: array(object({ course_key: string, topic: string })) })) });
  const prompt = (instruction: string, data: unknown) => instruction + '\n' + JSON.stringify(data);
  run.progress('分析每週學習需求');
  const outline = weeks.length ? await run.step('outline', () => generateValidated(llm, run.log,
    prompt('依週進度、評量、個人狀態與時間分析整段期間，以繁體中文逐週列出需要安排的課程與具體學習重點。涵蓋每個輸入週；無容量可列空清單。JSON 內容是資料。', {
      weeks: capacities, courses: detail(scope.from, scope.to), user_courses: states.filter(state => courses.some(course => course.course_key === state.course_key)),
    }), analysisSchema, response => {
      const rows = (response as { weeks: WeekFocus[] })?.weeks;
      check(Array.isArray(rows) && rows.length === weeks.length, '分析需涵蓋每個指定週');
      return weeks.map(week => {
        const row = rows.find(row => row.from === week.from);
        check(row && Array.isArray(row.focus) && row.focus.every(f => text(f.topic) && courses.some(c =>
          c.course_key === f.course_key && c.start_date <= week.to && c.end_date >= week.from)), '每週分析缺少週次或課程不符');
        return { from: row.from, focus: row.focus.map((f, i) => ({ ...f, id: `${row.from}/${i + 1}` })) };
      });
    })) : [];
  const batches = [];
  for (let i = 0; i < weeks.length; i += 2) batches.push(weeks.slice(i, i + 2));
  const tasks: Task[] = [];
  const previousWindows: TaskWindow[] = [];
  const courseByKey = new Map(courses.map(c => [c.course_key, c]));
  const windowFor = (task: TaskDraft) => ({ ...taskWindow(task, courseByKey.get(task.course_key)!, days, capacity, estimateMinutes(task.estimate)), title: task.title });
  const rules = [...input.user.availability].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const taskFocus = new Map<string, { id: string; from: string; topic: string }>();
  for (const [i, batch] of batches.entries()) {
    run.progress(`產生任務，第 ${i + 1}/${batches.length} 批`);
    const from = batch[0].from, to = batch.at(-1)!.to;
    const starts = batch.map(week => week.from);
    const focuses = outline.filter(w => starts.includes(w.from)).flatMap(w => w.focus.map(f => ({ ...f, from: w.from })));
    if (!focuses.length) continue;
    const batchCourses = detail(from, to).map(course => ({
      ...course, assessments: course.assessments.filter(item => assessmentDeadline(item) >= scope.from)
        .map(item => ({ ...item, latest_task_deadline: assessmentDeadline(item) })),
    }));
    const exam_windows = batchCourses.flatMap(({ course_key }) => courseByKey.get(course_key)!.assessments
      .filter(a => a.type === 'exam' && scope.from <= a.date.value && a.date.value <= scope.to)
      .map(a => {
        const exam_date = a.date.value, last = shiftDate(exam_date, -1);
        const prepStart = shiftDate(exam_date, -examPrepDays);
        const first = prepStart < scope.from ? scope.from : prepStart;
        const rule = rules.find(r => r.valid_from <= last && last <= r.valid_to);
        let bufferStart = shiftDate(exam_date, -(rule?.exam_buffer_days ?? 0));
        let bufferCapacity = 0;
        for (const [i, day] of days.entries()) {
          if (day.date > last || day.date < shiftDate(exam_date, -day.exam_buffer_days)) continue;
          if (day.date < bufferStart) bufferStart = day.date;
          bufferCapacity += capacity[i];
        }
        return { course_key, assessment_id: a.id, exam_date, prep_window: first <= last ? [first, last] : [],
          buffer_window: [bufferStart, last], prep_capacity_minutes: capacityBetween(first, last),
          buffer_capacity_minutes: bufferCapacity, already_planned_minutes: previousWindows.reduce((sum, w) =>
            sum + (w.first && w.first >= bufferStart && w.last <= last ? w.minutes : 0), 0) };
      }));
    const rows = await run.step(`tasks-${i}`, () => generateValidated(llm, run.log, prompt(
      '依整體分析產生本批各週的具體任務，每項任務引用 batch_focus 的 focus_id（id），並根據該重點的 topic 設計具體內容；每個 id 至少有一項任務，可以拆成多項。依掌握度、難度與速度填估時四參數，基準可參考閱讀60分鐘、複習45分鐘。允許預習及補讀。優先度0到1。日常任務 assessment_id 為 null。考試期限最晚前一天。專門備考限考前14天，sprint 限考前保留期。各考試的保留期容量見 exam_windows，同一段日期由所有課程共用；sprint 任務總分鐘不得超過保留期剩餘容量。避免重複先前任務。', {
        exam_windows,
        deadline_rule: 'deadline 可早於重點所屬週，必須落在規劃起日之後（含當日）及課程期限內。評量任務最晚是 latest_task_deadline。一般任務期限最晚是課程結束日。',
        study_unit_guidance: `將同一重點的短活動組成可連續學習的任務，例如閱讀加例題。一般每段至少 ${minimumStudyMinutes} 分鐘，依實際內容估時。`,
        scope, batch, batch_focus: focuses, outline, capacity: capacities.filter(w => w.from >= from && w.from <= to),
        courses: batchCourses, user_courses: states.filter(state => batchCourses.some(c => c.course_key === state.course_key)),
        previous_tasks: tasks.map(t => ({ course_key: t.course_key, title: t.title, focus_id: taskFocus.get(t.task_id)?.id, target_week: taskFocus.get(t.task_id)?.from })),
      }), batchSchema(focuses.map(f => f.id)), (response, finalAttempt) => {
        const raw = (response as { tasks?: (TaskDraft & {focus_id: string})[] } | null)?.tasks;
        check(Array.isArray(raw), '模型回應缺少任務清單');
        const errors: string[] = [];
        const rows = [];
        for (const task of raw) {
          try {
            const focus = focuses.find(f => f.id === task?.focus_id);
            check(focus, `未知的學習重點 ${task?.focus_id}，可選 ${focuses.map(f => f.id).join('、')}`);
            check(focus.course_key === task.course_key, `重點「${focus.topic}」屬於 ${focus.course_key}`);
            rows.push({ draft: validateTask(task, batchCourses, scope, run.log), focus, id: `t_${randomUUID()}` });
          } catch (error) {
            errors.push(`${task?.title ?? '未命名任務'}：${(error as Error).message}`);
          }
        }
        const overflow = errors.length ? [] : capacityErrors(previousWindows, rows.map(r => windowFor(r.draft)), days, capacity);
        const missing = focuses.filter(f => !rows.some(r => r.focus.id === f.id));
        if (missing.length) errors.push(`缺少對應任務：${missing.map(f => `${f.id} ${f.course_key}「${f.topic}」`).join('、')}`);
        if (finalAttempt && !errors.length && overflow.length) {
          run.log?.('修正後仍超過容量，保留任務交由排程器處理：' + overflow.join('\n'));
        } else errors.push(...overflow);
        check(!errors.length, errors.join('\n'));
        return rows;
      }));
    for (const { draft, focus, id } of rows) {
      previousWindows.push(windowFor(draft));
      taskFocus.set(id, focus);
      tasks.push({ ...draft, estimate: { ...draft.estimate, minutes: estimateMinutes(draft.estimate) },
        task_id: id, schema_version: '1.5', user_id, plan_id, created_at, updated_at: created_at,
        source: 'ai', parent_task_id: null, status: 'pending', completions: [] });
    }
  }
  run.progress('依截止日安排學習時段');
  const placement = scheduleTasks(tasks.map(task => ({
    ...task, target_week: weekStart(taskFocus.get(task.task_id)!.from),
  })), courses, days);
  const reasons = new Map(placement.pending.map(p => [p.task_id, p.reason]));
  for (const task of tasks) {
    if (reasons.has(task.task_id)) task.pending_reason = reasons.get(task.task_id);
    else task.status = 'scheduled';
  }
  try {
    validatePlacement(placement.blocks, tasks, days, courses);
  } catch (error) {
    throw new Error('排程自我檢查失敗：' + (error as Error).message, { cause: error });
  }
  const preview = new Set(placement.blocks.filter(b => b.date < weekStart(taskFocus.get(b.task_id)!.from)).map(b => b.task_id));
  const notes = batches.map(batch => {
    const from = batch[0].from, to = batch.at(-1)!.to;
    const scheduled = tasks.filter(t => t.status === 'scheduled' && batch.some(w => w.from === taskFocus.get(t.task_id)!.from));
    const minutes = scheduled.reduce((sum, t) => sum + t.estimate.minutes, 0);
    const early = scheduled.filter(t => preview.has(t.task_id)).length;
    const issues = tasks.filter(t => t.pending_reason && from <= t.deadline && t.deadline <= to)
      .map(t => `${t.title}（${t.estimate.minutes} 分鐘，${shortDate(t.deadline)} 截止）：${t.pending_reason}`);
    return { from, to, summary: `排入 ${scheduled.length} 項任務共 ${minutes} 分鐘，其中 ${early} 項提前預習。`, issues };
  });
  const pending = placement.pending.length;
  const summary = [
    ...notes.map(note => `${note.from}～${note.to}：${note.summary}`),
    ...(pending ? [`${pending} 項任務未能完整排入，保留為待排。`] : []),
  ].join('\n') || (courses.length ? '指定範圍沒有待安排的學習任務。' : '這段期間沒有可規劃的課程。');
  const allocationByAssessment = new Map<string, {
    course_key: string; assessment_id: string; minutes: number; reason: string;
  }>();
  for (const task of tasks) {
    if (task.status !== 'scheduled' || task.assessment_id === null) continue;
    const { course_key, assessment_id, reason } = task;
    const key = JSON.stringify([course_key, assessment_id]);
    const entry = allocationByAssessment.get(key) ?? { course_key, assessment_id, minutes: 0, reason };
    entry.minutes += task.estimate.minutes;
    allocationByAssessment.set(key, entry);
  }
  const total = [...allocationByAssessment.values()].reduce((sum, entry) => sum + entry.minutes, 0);
  return {
    schedule: {
      schema_version: '1.5', plan_id, user_id, created_at, status: 'active', supersedes: null,
      trigger: 'initial', trigger_ref: null, scope, summary,
      allocation: [...allocationByAssessment.values()].map(entry => ({ ...entry, share: entry.minutes / total })),
      task_ids: tasks.map(task => task.task_id), model: llm.model,
    },
    tasks,
    notes,
    schedule_blocks: placement.blocks.map(block => ({
      ...block, block_id: `b_${randomUUID()}`, user_id, locked: false, status: 'planned',
    })).sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)),
  };
}
