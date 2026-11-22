import { randomUUID } from 'node:crypto';
import { availableDays, localParts } from './availability.ts';
import { check, timeMinutes } from './data.ts';
import type { PlanningInput } from './data.ts';
import { DIFFICULTY_MULT, MASTERY_MULT, estimateBasis, estimatedMinutes, roundMinutes, speedFor } from './estimate.ts';
import { markMissed, type Trigger } from './feedback.ts';
import { planFromDraft } from './planner.ts';
import type { DraftAction, FinalPlan, PlanDraft, Task } from './planner.ts';
import { blockMinutes, reserveStudyTime, shortDate } from './scheduler.ts';

type Options = {
  now: Date; trigger: Trigger; trigger_ref: string | null;
  plan_id?: string; created_at?: string;
};

export function generateAdjustedPlan(input: PlanningInput, previous: FinalPlan, options: Options, decision: DraftAction = 'reschedule') {
  const { now, trigger, trigger_ref } = options;
  const [today, time] = localParts(input.user.timezone).format(now).split('T');
  const earliest = timeMinutes(time) + Number(now.getUTCSeconds() !== 0 || now.getUTCMilliseconds() !== 0);
  const scope = { ...previous.schedule.scope, from: today };
  const user_id = input.user.user_id;
  check(previous.schedule.user_id === user_id, '計畫不屬於此使用者');
  const plan_id = options.plan_id ?? `p_${randomUUID()}`;
  const created_at = options.created_at ?? now.toISOString();
  const marked = markMissed(previous.tasks, previous.schedule_blocks, now, input.user.timezone);
  const fixed = marked.blocks.filter(b => b.status === 'done'
    || (b.locked && (b.status ?? 'planned') === 'planned' && b.date >= today));
  const states = new Map(input.user_courses.map(state => [state.course_key, state]));
  const demand: Task[] = [];
  const focuses: PlanDraft['focuses'] = {};
  const targetGrades: Record<string, number> = {};
  let oldDemand = 0, newDemand = 0, longer = 0, speedChanged = false;
  const missed = new Set<string>(), reviews = new Set<string>();
  const tasks = marked.tasks.map(original => {
    const task = { ...original, plan_id };
    if (['done', 'skipped', 'superseded'].includes(task.status)) return task;
    const state = states.get(task.course_key);
    check(state, `找不到課程 ${task.course_key} 的學習狀況`);
    targetGrades[task.course_key] = state.target_grade;
    const old = task.estimate;
    const basis = estimateBasis(state, task.chapters);
    const estimate = { ...old, basis, speed_factor: speedFor(state, task.type) };
    if (old.basis) {
      estimate.difficulty_mult *= DIFFICULTY_MULT[basis.difficulty - 1] / DIFFICULTY_MULT[old.basis.difficulty - 1];
      estimate.familiarity_mult *= MASTERY_MULT[basis.familiarity_level - 1] / MASTERY_MULT[old.basis.familiarity_level - 1];
    }
    estimate.minutes = estimatedMinutes(estimate);
    task.estimate = estimate;
    task.updated_at = now.toISOString();
    const blocks = marked.blocks.filter(b => b.task_id === task.task_id);
    const total = blocks.reduce((n, b) => n + blockMinutes(b), 0);
    const undone = blocks.reduce((n, b) => n + (b.status === 'done' ? 0 : blockMinutes(b)), 0);
    // A previous adjustment may have kept only the done/locked blocks of a
    // pending task. Its unplaced work has no block to count in that snapshot.
    const fraction = original.unplaced_minutes !== undefined
      ? Math.min(1, (original.unplaced_minutes + undone) / old.minutes)
      : total ? undone / total : 1;
    const remaining = (minutes: number) => fraction ? roundMinutes(minutes * fraction) : 0;
    task.remaining_minutes = remaining(estimate.minutes);
    delete task.pending_reason;
    delete task.unplaced_minutes;
    const locked = fixed.filter(b => b.task_id === task.task_id && b.status !== 'done').reduce((n, b) => n + blockMinutes(b), 0);
    const minutes = Math.max(0, task.remaining_minutes - locked);
    if (task.status === 'missed' && task.deadline < today) {
      task.pending_reason = '已過截止日，請決定補做（延後期限）或跳過';
      task.unplaced_minutes = minutes;
      return task;
    }
    if (task.status === 'missed') missed.add(task.task_id);
    if (task.source === 'auto_review' && task.status === 'pending') reviews.add(task.task_id);
    if (estimate.minutes > old.minutes) longer++;
    oldDemand += Math.max(0, remaining(old.minutes) - locked);
    newDemand += minutes;
    speedChanged ||= old.speed_factor !== estimate.speed_factor;
    // Prefer the former study week when it is still ahead.
    const first = blocks.filter(b => b.date >= today && (b.status ?? 'planned') === 'planned').map(b => b.date).sort()[0];
    focuses[task.task_id] = { id: task.task_id, from: first ?? today, topic: task.title };
    task.status = 'pending';
    if (minutes) demand.push({ ...task, estimate: { ...estimate, minutes } });
    return task;
  });
  const draft = { plan_id, user_id, created_at, scope, model: previous.schedule.model, tasks, targetGrades,
    focuses, batches: [[{ from: scope.from, to: scope.to }]] };
  return planFromDraft(input, draft, decision, undefined, {
    previous_plan_id: previous.schedule.plan_id, trigger, trigger_ref, fixed, demand,
    getDays: (input, scope) => reserveStudyTime(availableDays(input, scope), fixed, today, earliest),
    forecast(available) {
      if (!speedChanged) return '';
      const delta = oldDemand ? Math.round(100 * (newDemand - oldDemand) / oldDemand) : 0;
      const comparison = delta ? `（比原估${delta > 0 ? '慢' : '快'} ${Math.abs(delta)}%）` : '';
      const hours = (minutes: number) => Number((minutes / 60).toFixed(1));
      return `\n照目前速度${comparison}，剩下的內容需要 ${hours(newDemand)} 小時，到 ${shortDate(scope.to)} 可用 ${hours(available)} 小時。`;
    },
    changes(tasks) {
      const scheduled = tasks.filter(t => t.status === 'scheduled');
      return `依目前狀況重排：${longer} 項任務延長、${scheduled.filter(t => reviews.has(t.task_id)).length} 項複習加入、` +
        `${scheduled.filter(t => missed.has(t.task_id)).length} 項錯過的任務重新安排。`;
    },
  });
}
