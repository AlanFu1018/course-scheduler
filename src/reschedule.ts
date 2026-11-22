// 部分重排：保留已完成的任務與鎖定的時段，其餘任務用最新的讀書速度重算估時，
// 再交給 planner.ts 的 planFromDraft 放進時段（沿用已拆好的任務，不重新呼叫 Gemini）。
// 規則依 doc/4_schedule.jsonc 檔頭的「重排規則」。
import { randomUUID } from 'node:crypto';
import { shiftDate } from './availability.ts';
import type { PlanningInput, UserCourse } from './data.ts';
import { RequestError } from './errors.ts';
import { localDate } from './feedback.ts';
import type { Block, FeedbackTask, Trigger } from './feedback.ts';
import { planFromDraft } from './planner.ts';
import type { PlanDraft } from './planner.ts';
import { weekStart } from './scheduler.ts';

export type StoredPlan = {
  schedule: { plan_id: string; user_id: string; status?: string; model?: string; summary?: string;
    scope: { from: string; to: string; course_keys: string[] }; [key: string]: unknown };
  tasks: FeedbackTask[];
  schedule_blocks: Block[];
  notes?: unknown[];
  [key: string]: unknown;
};

/** 這個 source_id 的行程代表使用者鎖定的讀書時段，排程時當成「有事」避開 */
export const LOCKED_SOURCE = 'locked-study-blocks';
const TYPE_SAMPLES = 3;
const ACTIVE = new Set(['pending', 'scheduled', 'missed']);

/** 和 planner.ts 相同的估時公式，只把速度換成最新的值 */
export function refreshEstimate(task: FeedbackTask, state: UserCourse) {
  const estimate = task.estimate as Record<string, number>;
  const typeSpeed = state.speed.by_task_type[task.type];
  const speed = typeSpeed && typeSpeed.samples >= TYPE_SAMPLES ? typeSpeed.factor : state.speed.default.factor;
  const { base_minutes, difficulty_mult, familiarity_mult } = estimate;
  if (![base_minutes, difficulty_mult, familiarity_mult].every(value => Number.isFinite(value) && value > 0)) {
    return { ...estimate };
  }
  const minutes = Math.max(5, Math.round(base_minutes * difficulty_mult * familiarity_mult * speed / 5) * 5);
  return { base_minutes, difficulty_mult, familiarity_mult, speed_factor: speed, minutes };
}

function offsetOf(timeZone: string, date: string) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(date + 'T12:00:00Z')).find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-]\d{2}):?(\d{2})?/.exec(name);
  return match ? `${match[1]}:${match[2] ?? '00'}` : '+00:00';
}

/** 兩週一批，給 planner 產生每批的摘要 */
function batchesOf(from: string, to: string) {
  const batches: { from: string; to: string }[][] = [];
  for (let start = weekStart(from); start <= to; start = shiftDate(start, 14)) {
    const weeks = [{ from: start < from ? from : start, to: shiftDate(start, 6) > to ? to : shiftDate(start, 6) }];
    const second = shiftDate(start, 7);
    if (second <= to) weeks.push({ from: second, to: shiftDate(second, 6) > to ? to : shiftDate(second, 6) });
    batches.push(weeks);
  }
  return batches;
}

export type RescheduleOptions = {
  now: Date; trigger: Trigger | 'user_request'; trigger_ref: string | null;
  action?: 'reschedule' | 'accept_pending';
};

/**
 * 回傳三種結果：
 *   { status: 'nothing_to_reschedule' }：沒有需要重排的任務
 *   { status: 'needs_decision', ... }：時間不夠，內容同 POST /api/plans 的時間不足回應，前端讓使用者決定
 *   { status: 'rescheduled', plan }：新版計畫（supersedes 指向舊版）
 */
export function reschedulePlan(plan: StoredPlan, input: PlanningInput, options: RescheduleOptions) {
  const timeZone = input.user.timezone;
  const today = localDate(options.now.toISOString(), timeZone);
  const to = plan.schedule.scope.to;
  if (to < today) throw new RequestError(`這份計畫已在 ${to} 結束，請產生新計畫`);

  const states = new Map(input.user_courses.filter(state => state.active).map(state => [state.course_key, state]));
  const courses = new Set(input.courses.map(course => course.course_key));
  const lockedBlocks = plan.schedule_blocks.filter(block =>
    block.locked && (block.status ?? 'planned') === 'planned' && block.date >= today);
  const lockedTasks = new Set(lockedBlocks.map(block => block.task_id));

  const carry: FeedbackTask[] = [];
  const kept: FeedbackTask[] = [];
  for (const task of plan.tasks) {
    const movable = ACTIVE.has(task.status) && !lockedTasks.has(task.task_id)
      && states.has(task.course_key) && courses.has(task.course_key);
    if (movable && task.deadline >= today) carry.push(task);
    // 期限已過還沒做的任務不再排，標成 missed 留紀錄
    else if (movable) kept.push({ ...task, status: 'missed' });
    else kept.push(task);
  }
  if (!carry.length) return { status: 'nothing_to_reschedule' as const, today };

  const carryIds = new Set(carry.map(task => task.task_id));
  // 歷史時段（今天以前、已完成、已錯過）和鎖定時段保留；要重排的任務在未來的時段會被新的取代
  const keptBlocks = plan.schedule_blocks.flatMap(block => {
    const status = block.status ?? 'planned';
    if (lockedBlocks.includes(block)) return [block];
    if (status === 'done' || status === 'missed' || status === 'cancelled') return [block];
    if (block.date < today) return [{ ...block, status: 'missed' }];
    if (carryIds.has(block.task_id)) return [];
    return [block];
  });

  const planId = `p_${randomUUID()}`;
  const createdAt = options.now.toISOString();
  const scope = { from: today, to, course_keys: [] as string[] };
  const firstFuture = (taskId: string) => plan.schedule_blocks
    .filter(block => block.task_id === taskId && block.date >= today).map(block => block.date).sort()[0];
  const tasks = carry.map(task => {
    const { pending_reason: _drop, ...rest } = task as FeedbackTask & { pending_reason?: string };
    return {
      ...rest, plan_id: planId, status: 'pending', updated_at: createdAt,
      estimate: refreshEstimate(task, states.get(task.course_key)!),
    };
  });
  const draft = {
    plan_id: planId, created_at: createdAt, user_id: plan.schedule.user_id,
    model: plan.schedule.model ?? 'reschedule', scope,
    targetGrades: Object.fromEntries([...new Set(carry.map(task => task.course_key))]
      .map(key => [key, states.get(key)!.target_grade])),
    tasks,
    // 原本預計的週次：還有未來時段就沿用那週，否則從本週開始
    focuses: Object.fromEntries(carry.map(task => [task.task_id,
      { id: task.task_id, from: firstFuture(task.task_id) ?? today, topic: task.title }])),
    batches: batchesOf(today, to),
  } as unknown as PlanDraft;

  // 鎖定的時段當成行事曆上的「有事」，排程就不會排進去
  const busy = lockedBlocks.map((block, i) => {
    const offset = offsetOf(timeZone, block.date);
    return { user_id: plan.schedule.user_id, source_id: LOCKED_SOURCE, event_id: `locked-${i}`, all_day: false,
      start_at: `${block.date}T${block.start_time}:00${offset}`, end_at: `${block.date}T${block.end_time}:00${offset}` };
  });
  const withLocked: PlanningInput = {
    ...input,
    user: { ...input.user, calendar_sources: [...input.user.calendar_sources, { source_id: LOCKED_SOURCE, treat_as: 'busy' }] },
    calendar_events: [...input.calendar_events, ...busy],
  };

  const result = planFromDraft(withLocked, draft, options.action ?? 'reschedule');
  if ('draft_id' in result) return { ...result, today, carry_task_ids: [...carryIds] };

  const allTasks = [...kept, ...(result.tasks as unknown as FeedbackTask[])];
  const allBlocks = [...keptBlocks, ...(result.schedule_blocks as unknown as Block[])]
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  const newPlan: StoredPlan = {
    ...result,
    schedule: {
      ...result.schedule,
      supersedes: plan.schedule.plan_id,
      trigger: options.trigger,
      trigger_ref: options.trigger_ref,
      summary: `重排 ${carry.length} 項任務（保留 ${lockedBlocks.length} 個鎖定時段）。${result.schedule.summary}`,
      task_ids: allTasks.filter(task => ACTIVE.has(task.status) || carryIds.has(task.task_id)).map(task => task.task_id),
    },
    tasks: allTasks,
    schedule_blocks: allBlocks,
  };
  return { status: 'rescheduled' as const, today, plan: newPlan };
}
