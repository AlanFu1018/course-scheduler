// 動態調整的 HTTP API，掛在 src/server.ts 上
//   POST /api/tasks/{task_id}/completions             回報完成 → 更新速度與掌握度 → 需要時加排複習 → 判斷是否重排
//   POST /api/plans/latest/missed                     檢查過了時間沒回報的時段 → 判斷是否重排
//   PUT  /api/users/{user_id}/courses/{course_key}    使用者主觀調整熟悉度、難度、目標成績 → 判斷是否重排
// reschedule.needed = true 時，前端將 user_id、trigger、trigger_ref 送到 POST /api/plans/latest/adjust。
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { check } from './data.ts';
import type { UserCourse } from './data.ts';
import { errorStatus, RequestError } from './errors.ts';
import { afterCompletion, afterMissed, afterUserAdjust, applyCompletion, localDate, markMissed, parseCompletion,
  rescheduleScope, reviewDeadline, reviewTask, updateUserCourse } from './feedback.ts';
import type { Block, FeedbackTask, RescheduleDecision } from './feedback.ts';

export type RouteHandler = (request: IncomingMessage, response: ServerResponse, path: string) => Promise<boolean>;
type StoredPlan = { schedule: { plan_id: string; user_id: string; scope: { from: string; to: string; course_keys: string[] } };
  tasks: FeedbackTask[]; schedule_blocks: Block[]; [key: string]: unknown };

function send(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  check(request.headers['content-type']?.split(';')[0] === 'application/json', '請使用 application/json');
  let body = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    body += chunk;
    check(body.length <= 16_384, '請求過大');
  }
  try {
    const value = JSON.parse(body);
    check(value && typeof value === 'object' && !Array.isArray(value), '請求內容必須是 JSON 物件');
    return value;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('請求不是有效的 JSON', { cause: error });
  }
}

const id = (value: unknown, label: string) => {
  check(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value), `${label} 格式錯誤`);
  return value;
};

/**
 * @param plans    存計畫的資料庫（.planning-checkpoints.sqlite 的 saved_plans）
 * @param planning 存學習狀況的資料庫（PLANNING_DB_PATH 的 user_courses）；沒有時無法保存學習狀況
 */
export function feedbackRoutes(plans: DatabaseSync, planning: DatabaseSync | null, options: { now?: () => Date } = {}): RouteHandler {
  const now = options.now ?? (() => new Date());

  function latestPlan(userId: string): StoredPlan | null {
    const row = plans.prepare('SELECT data FROM saved_plans WHERE user_id = ? ORDER BY rowid DESC LIMIT 1').get(userId);
    return row ? JSON.parse(String(row.data)) : null;
  }
  function savePlan(plan: StoredPlan) {
    plans.prepare('UPDATE saved_plans SET data = ? WHERE plan_id = ? AND user_id = ?')
      .run(JSON.stringify(plan), plan.schedule.plan_id, plan.schedule.user_id);
  }
  function userCourse(userId: string, courseKey: string) {
    check(planning, '請設定 PLANNING_DB_PATH，才能保存學習狀況');
    const row = planning.prepare('SELECT data FROM user_courses WHERE user_id = ? AND course_key = ?').get(userId, courseKey);
    return row ? JSON.parse(String(row.data)) as UserCourse & Record<string, unknown> : null;
  }
  function saveUserCourse(state: UserCourse) {
    planning!.prepare('UPDATE user_courses SET data = ? WHERE user_id = ? AND course_key = ?')
      .run(JSON.stringify(state), state.user_id, state.course_key);
  }
  function transaction<T>(work: () => T): T {
    const dbs = [plans, planning].filter(Boolean) as DatabaseSync[];
    dbs.forEach(db => db.exec('BEGIN IMMEDIATE'));
    try {
      const result = work();
      dbs.forEach(db => db.exec('COMMIT'));
      return result;
    } catch (error) {
      dbs.forEach(db => { try { db.exec('ROLLBACK'); } catch { /* 已結束 */ } });
      throw error;
    }
  }
  const withScope = (decision: RescheduleDecision, plan: StoredPlan) => ({
    ...decision,
    ...(decision.needed && { endpoint: '/api/plans/latest/adjust',
      ...rescheduleScope(plan.tasks, plan.schedule_blocks, localDate(now().toISOString()), plan.schedule.scope.to,
        plan.schedule.scope.course_keys) }),
  });

  function complete(taskId: string, body: Record<string, unknown>) {
    const userId = id(body.user_id, 'user_id');
    const plan = latestPlan(userId);
    const task = plan?.tasks.find(t => t.task_id === taskId);
    if (!plan || !task) return { status: 404, data: { error: '在最新的計畫裡找不到這個任務' } };
    const at = now();
    const completion = parseCompletion(task, body, at, plan.schedule_blocks);
    const state = userCourse(userId, task.course_key);
    if (!state) return { status: 404, data: { error: '找不到這門課的學習狀況' } };

    return transaction(() => {
      const applied = applyCompletion(task, plan.schedule_blocks, completion, at);
      const updated = updateUserCourse(state, task, completion, at);
      plan.tasks = plan.tasks.map(t => (t.task_id === taskId ? applied.task : t));
      plan.schedule_blocks = applied.blocks;
      let review = null;
      // 同一個原任務只加排一次複習，重複回報不會一直加
      if (updated.review_chapters.length && !plan.tasks.some(t => t.parent_task_id === taskId && t.source === 'auto_review')) {
        const deadline = reviewDeadline(task, localDate(at.toISOString()), plan.schedule.scope.to);
        review = reviewTask(task, updated.state, updated.review_chapters, deadline, `t_${randomUUID()}`, at);
        plan.tasks.push(review as unknown as FeedbackTask);
      }
      savePlan(plan);
      saveUserCourse(updated.state);
      const decision = afterCompletion(task, completion, updated.review_chapters);
      return { status: 200, data: { task: applied.task, review_task: review, user_course: updated.state, reschedule: withScope(decision, plan) } };
    });
  }

  function missed(body: Record<string, unknown>) {
    const userId = id(body.user_id, 'user_id');
    const plan = latestPlan(userId);
    if (!plan) return { status: 404, data: { error: '這個使用者還沒有計畫' } };
    const result = markMissed(plan.tasks, plan.schedule_blocks, now());
    if (result.missed_blocks.length) {
      plan.tasks = result.tasks;
      plan.schedule_blocks = result.blocks;
      savePlan(plan);
    }
    const decision = afterMissed(result.missed_tasks, result.missed_blocks);
    return { status: 200, data: { missed_blocks: result.missed_blocks, missed_tasks: result.missed_tasks, reschedule: withScope(decision, plan) } };
  }

  function adjust(userId: string, courseKey: string, body: Record<string, unknown>) {
    const before = userCourse(userId, courseKey);
    if (!before) return { status: 404, data: { error: '找不到這門課的學習狀況' } };
    const after = { ...before };
    const level = (value: unknown) => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;
    if ('familiarity' in body) { check(level(body.familiarity), '熟悉度必須是 1–5 的整數'); after.familiarity = body.familiarity as number; }
    if ('difficulty' in body) { check(level(body.difficulty), '難度必須是 1–5 的整數'); after.difficulty = body.difficulty as number; }
    if ('target_grade' in body) {
      const grade = body.target_grade;
      check(typeof grade === 'number' && grade >= 0 && grade <= 100, '目標成績必須是 0–100');
      after.target_grade = grade;
    }
    if ('active' in body) { check(typeof body.active === 'boolean', 'active 必須是 true 或 false'); after.active = body.active; }
    after.updated_at = now().toISOString();
    saveUserCourse(after);
    const decision = afterUserAdjust(before, after, courseKey);
    const plan = latestPlan(userId);
    return { status: 200, data: { user_course: after, reschedule: plan ? withScope(decision, plan)
      : { ...decision, ...(decision.needed && { endpoint: '/api/plans/latest/adjust' }) } } };
  }

  return async (request, response, path) => {
    const method = request.method ?? 'GET';
    let result: { status: number; data: unknown } | null = null;
    try {
      const completion = /^\/api\/tasks\/([^/]+)\/completions$/.exec(path);
      const adjustment = /^\/api\/users\/([^/]+)\/courses\/([^/]+)$/.exec(path);
      if (method === 'POST' && completion) {
        result = complete(id(decodeURIComponent(completion[1]), 'task_id'), await readJson(request));
      } else if (method === 'POST' && path === '/api/plans/latest/missed') {
        result = missed(await readJson(request));
      } else if (method === 'PUT' && adjustment) {
        result = adjust(id(decodeURIComponent(adjustment[1]), 'user_id'), id(decodeURIComponent(adjustment[2]), 'course_key'),
          await readJson(request));
      }
    } catch (error) {
      result = { status: errorStatus(error), data: { error: error instanceof Error ? error.message : '伺服器錯誤' } };
    }
    if (!result) return false;
    send(response, result.status, result.data);
    return true;
  };
}
