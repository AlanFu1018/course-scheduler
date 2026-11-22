import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { filePlanningSource, sqlitePlanningSource } from '../src/data.ts';
import type { PlanningInput, UserCourse } from '../src/data.ts';
import { afterCompletion, afterCourseUpdate, afterUserAdjust, applyCompletion, markMissed, nextSpeed, parseCompletion,
  rescheduleScope, reviewDeadline, reviewEstimate, updateUserCourse } from '../src/feedback.ts';
import type { Block, FeedbackTask } from '../src/feedback.ts';
import { feedbackRoutes } from '../src/feedback-routes.ts';
import { planHistory } from '../src/plan-history.ts';
import { planFromDraft } from '../src/planner.ts';
import type { PlanDraft } from '../src/planner.ts';
import { refreshEstimate } from '../src/reschedule.ts';
import { createPlanningServer } from '../src/server.ts';

const userId = 'u_0001';
const ds = 'self_data-structures';
const dataDir = new URL('data/', import.meta.url);
const fixtures = filePlanningSource({
  courses: (await readdir(dataDir)).filter(name => /^2_course\..+\.json$/.test(name)).sort().map(name => new URL(name, dataDir)),
  userState: new URL('3_user_state.json', dataDir),
});

function task(over: Partial<FeedbackTask> & { task_id: string }): FeedbackTask {
  return {
    user_id: userId, course_key: ds, assessment_id: 'final', type: 'reading', title: over.task_id, chapters: ['Ch11'],
    deadline: '2026-12-21', estimate: { base_minutes: 60, difficulty_mult: 1, familiarity_mult: 1, speed_factor: 1, minutes: 60 },
    status: 'scheduled', completions: [], ...over,
  };
}

function state(over: Partial<UserCourse> = {}): UserCourse & Record<string, unknown> {
  return {
    schema_version: '1.5', user_id: userId, course_key: ds, active: true, familiarity: 3, difficulty: 4, target_grade: 85,
    speed: { default: { factor: 1, samples: 0 }, by_task_type: {} }, chapter_mastery: {}, ...over,
  } as UserCourse & Record<string, unknown>;
}

test('reading speed follows actual time with a moving average and stays in bounds', () => {
  assert.deepEqual(nextSpeed({ factor: 1, samples: 0 }, 45, 70), { factor: 1.56, samples: 1 });
  // 0.7 × 1.0 + 0.3 × (1.0 × 70/45) ≈ 1.17
  assert.deepEqual(nextSpeed({ factor: 1, samples: 5 }, 45, 70), { factor: 1.17, samples: 6 });
  assert.equal(nextSpeed({ factor: 1, samples: 0 }, 60, 6000).factor, 2.5, '比值上限 2.5');
  assert.equal(nextSpeed({ factor: 1, samples: 0 }, 60, 1).factor, 0.4, '比值下限 0.4');
  assert.equal(nextSpeed({ factor: 2.9, samples: 0 }, 60, 120).factor, 3, '係數上限 3');
});

test('completion input is validated and records the estimate at report time', () => {
  const t = task({ task_id: 't1', chapters: ['Ch8', 'Ch9'], deadline: '2026-11-24' });
  const now = new Date('2026-11-24T15:30:00Z'); // 台灣時間 11/24 23:30，仍在期限內
  const c = parseCompletion(t, { actual_minutes: 90, difficulty: 4, understanding: { Ch8: 2 }, need_review: false }, now);
  assert.deepEqual([c.estimated_minutes, c.on_time, c.block_id, c.comment], [60, true, null, null]);
  assert.equal(parseCompletion(t, { actual_minutes: 30, difficulty: 3, understanding: 4,
    completed_at: '2026-11-24T16:30:00Z' }, now).on_time, false, '台灣時間已是 11/25');
  assert.deepEqual(parseCompletion(t, { actual_minutes: 30, difficulty: 3, understanding: 4 }, now).understanding, { _all: 4 });
  for (const [body, pattern] of [
    [{ actual_minutes: 0, difficulty: 3, understanding: 3 }, /actual_minutes/],
    [{ actual_minutes: 30, difficulty: 6, understanding: 3 }, /difficulty/],
    [{ actual_minutes: 30, difficulty: 3, understanding: { Ch1: 3 } }, /不包含章節 Ch1/],
    [{ actual_minutes: 30, difficulty: 3, understanding: { Ch8: 0 } }, /Ch8 的理解程度/],
    [{ actual_minutes: 30, difficulty: 3 }, /understanding/],
  ] as const) assert.throws(() => parseCompletion(t, body, now), pattern);
});

test('per-block reports finish the task only after every block is done', () => {
  const t = task({ task_id: 't1' });
  const blocks: Block[] = ['b1', 'b2'].map(id => ({ block_id: id, task_id: 't1', user_id: userId, date: '2026-11-20',
    start_time: id === 'b1' ? '19:00' : '20:00', end_time: id === 'b1' ? '19:50' : '20:50', status: 'planned' }));
  const now = new Date('2026-11-20T13:00:00Z');
  const c = (block_id: string | null) => ({ ...parseCompletion(t, { actual_minutes: 50, difficulty: 3, understanding: 4 }, now), block_id });
  const first = applyCompletion(t, blocks, c('b1'), now);
  assert.equal(first.task.status, 'scheduled');
  assert.deepEqual(first.blocks.map(b => b.status), ['done', 'planned']);
  const second = applyCompletion(first.task, first.blocks, c('b2'), now);
  assert.equal(second.task.status, 'done');
  assert.equal(second.task.completions.length, 2);
  assert.throws(() => applyCompletion(second.task, second.blocks, c(null), now), /done，不能再回報/);
  assert.throws(() => applyCompletion(t, blocks, c('other'), now), /不屬於這個任務/);
});

test('mastery averages old and new scores and low understanding triggers a review task', () => {
  const t = task({ task_id: 't1', type: 'examples', chapters: ['Ch8', 'Ch9', 'Ch10'] });
  const before = state({ chapter_mastery: { Ch8: { level: 4, need_review: false } } });
  const now = new Date('2026-11-20T13:00:00Z');
  const c = parseCompletion(t, { actual_minutes: 120, difficulty: 4, understanding: { Ch8: 1, Ch9: 4, Ch10: 2 } }, now);
  const { state: after, review_chapters } = updateUserCourse(before, t, c, now);
  assert.deepEqual(review_chapters, ['Ch8', 'Ch10']);
  assert.equal(after.chapter_mastery.Ch8.level, 3, '(4 + 1) / 2 = 2.5 → 3');
  assert.equal(after.chapter_mastery.Ch9.need_review, false);
  assert.deepEqual([after.speed.default, after.speed.by_task_type.examples], [{ factor: 2, samples: 1 }, { factor: 2, samples: 1 }]);
  assert.equal(before.speed.default.samples, 0, '不修改傳入的狀態');
  // 30 分 × 2 章 × 難度 4（1.1）× 最低掌握度 2（1.2）× 速度 2 = 158.4 → 160
  assert.deepEqual(reviewEstimate(after, ['Ch8', 'Ch10']),
    { base_minutes: 60, difficulty_mult: 1.1, familiarity_mult: 1.2, speed_factor: 2, minutes: 160 });
  assert.equal(reviewDeadline(t, '2026-11-20', '2026-12-25'), '2026-12-21');
  assert.equal(reviewDeadline({ ...t, deadline: '2026-11-19' }, '2026-11-20', '2026-12-25'), '2026-11-27');
  assert.equal(reviewDeadline({ ...t, deadline: '2026-11-19' }, '2026-12-22', '2026-12-25'), '2026-12-25');
});

test('reschedule decisions only fire on meaningful changes', () => {
  const t = task({ task_id: 't1' });
  const now = new Date('2026-11-20T13:00:00Z');
  const done = (actual: number) => parseCompletion(t, { actual_minutes: actual, difficulty: 3, understanding: 4 }, now);
  assert.equal(afterCompletion(t, done(65), []).needed, false, '差不多準時完成不用重排');
  assert.match(afterCompletion(t, done(90), []).reasons[0], /多 50%/);
  assert.match(afterCompletion(t, done(40), []).reasons[0], /少 33%/);
  assert.match(afterCompletion(t, done(60), ['Ch11']).reasons[0], /Ch11 需要複習/);
  assert.equal(afterUserAdjust({ familiarity: 3, note: 'a' }, { familiarity: 3, note: 'b' }, ds).needed, false);
  assert.deepEqual(afterUserAdjust({ familiarity: 3 }, { familiarity: 2 }, ds).reasons, ['熟悉度改變']);
  const a = (id: string, date: string, scope = ['Ch1']) => ({ id, date: { value: date }, scope: { value: scope } });
  assert.deepEqual(afterCourseUpdate(ds, [a('mid', '2026-11-01'), a('hw', '2026-11-02')],
    [a('mid', '2026-11-08'), a('quiz', '2026-11-03')]).reasons,
  ['mid 日期 2026-11-01 → 2026-11-08', '新增評量 quiz', '刪除評量 hw']);
});

test('missed blocks use local time and scope keeps finished work and locked blocks', () => {
  const tasks = [task({ task_id: 'a' }), task({ task_id: 'b' }), task({ task_id: 'c', status: 'done' })];
  const b = (id: string, taskId: string, date: string, end: string, locked = false, status = 'planned'): Block =>
    ({ block_id: id, task_id: taskId, user_id: userId, date, start_time: '19:00', end_time: end, locked, status });
  const blocks = [b('a1', 'a', '2026-11-20', '19:50'), b('a2', 'a', '2026-11-21', '19:50'),
    b('b1', 'b', '2026-11-20', '21:00'), b('c1', 'c', '2026-11-19', '19:50', false, 'done'), b('b2', 'b', '2026-11-22', '19:50', true)];
  // 台灣 11/20 20:30：a1 已過，b1 還沒結束
  const result = markMissed(tasks, blocks, new Date('2026-11-20T12:30:00Z'));
  assert.deepEqual([result.missed_blocks, result.missed_tasks], [['a1'], []], 'a 還有 11/21 的時段，任務不算錯過');
  const later = markMissed(result.tasks, result.blocks, new Date('2026-11-21T14:00:00Z'));
  assert.deepEqual([later.missed_blocks, later.missed_tasks], [['a2', 'b1'], ['a']]);
  assert.deepEqual(rescheduleScope(later.tasks, later.blocks, '2026-11-21', '2026-12-25'),
    { scope: { from: '2026-11-21', to: '2026-12-25', course_keys: [] }, carry_task_ids: ['a'], locked_block_ids: ['b2'] });
});

test('estimates are recomputed with the latest speed using the planner formula', () => {
  const t = task({ task_id: 't', type: 'past_exam',
    estimate: { base_minutes: 60, difficulty_mult: 1.2, familiarity_mult: 1.1, speed_factor: 1, minutes: 80 } });
  const s = state({ speed: { default: { factor: 1.15, samples: 6 }, by_task_type: { past_exam: { factor: 1.3, samples: 2 } } } });
  assert.deepEqual(refreshEstimate(t, s), { base_minutes: 60, difficulty_mult: 1.2, familiarity_mult: 1.1, speed_factor: 1.15, minutes: 90 });
  s.speed.by_task_type.past_exam.samples = 3;
  assert.equal(refreshEstimate(t, s).speed_factor, 1.3, '樣本 ≥ 3 才用該類型的速度');
});

/** 用 Alan 的 planFromDraft 和 test/data 產生一份真的初始計畫 */
async function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users(user_id TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE courses(user_id TEXT, course_key TEXT, data TEXT);
    CREATE TABLE user_courses(user_id TEXT, course_key TEXT, data TEXT);
    CREATE TABLE calendar_events(event_id TEXT, user_id TEXT, source_id TEXT, start_at TEXT, end_at TEXT,
      all_day INTEGER, uid TEXT, synced_at TEXT);`);
  const input = await fixtures.load(userId);
  db.prepare('INSERT INTO users VALUES (?, ?)').run(userId, JSON.stringify(input.user));
  for (const c of input.courses) db.prepare('INSERT INTO courses VALUES (?, ?, ?)').run(userId, c.course_key, JSON.stringify(c));
  for (const s of input.user_courses) db.prepare('INSERT INTO user_courses VALUES (?, ?, ?)').run(userId, s.course_key, JSON.stringify(s));

  const created = '2026-11-15T12:00:00.000Z';
  const est = (minutes: number) => ({ base_minutes: minutes, difficulty_mult: 1, familiarity_mult: 1, speed_factor: 1, minutes });
  const planTask = (id: string, over: Record<string, unknown>) => ({
    task_id: id, schema_version: '1.5', user_id: userId, plan_id: 'p_initial', course_key: ds, assessment_id: 'final',
    type: 'reading', phase: 'learn', title: id, chapters: ['Ch11'], estimate: est(60), deadline: '2026-12-21',
    priority: 0.6, reason: '測試', source: 'ai', parent_task_id: null, status: 'pending', completions: [],
    created_at: created, updated_at: created, ...over,
  });
  const tasks = [
    planTask('t_hw', { assessment_id: 'hw-2', type: 'homework', phase: 'practice', chapters: ['Ch8', 'Ch9', 'Ch10'],
      deadline: '2026-11-24', estimate: est(60), priority: 0.8 }),
    planTask('t_read', { chapters: ['Ch11'], estimate: est(50) }),
    planTask('t_ex', { type: 'examples', phase: 'practice', chapters: ['Ch12'], estimate: est(50) }),
  ];
  const draft = {
    plan_id: 'p_initial', created_at: created, user_id: userId, model: 'fake-model',
    scope: { from: '2026-11-16', to: '2026-12-25', course_keys: [] },
    targetGrades: { [ds]: input.user_courses.find(s => s.course_key === ds)!.target_grade },
    tasks,
    focuses: { t_hw: { id: 't_hw', from: '2026-11-16', topic: '作業二' }, t_read: { id: 't_read', from: '2026-11-23', topic: 'Ch11' },
      t_ex: { id: 't_ex', from: '2026-11-30', topic: 'Ch12' } },
    batches: [[{ from: '2026-11-16', to: '2026-11-22' }, { from: '2026-11-23', to: '2026-11-29' }],
      [{ from: '2026-11-30', to: '2026-12-06' }, { from: '2026-12-07', to: '2026-12-13' }],
      [{ from: '2026-12-14', to: '2026-12-20' }, { from: '2026-12-21', to: '2026-12-25' }]],
  } as unknown as PlanDraft;
  const initial = planFromDraft(input, draft, 'accept_pending');
  assert.ok('schedule' in initial);
  const plans = new DatabaseSync(':memory:');
  planHistory(plans).save(initial, []);
  return { db, plans, initial, input };
}

test('HTTP flow: report → update speed and mastery → partial reschedule keeps done work and locked blocks', async () => {
  const { db, plans, initial } = await setup();
  assert.deepEqual(initial.tasks.map(t => t.status), ['scheduled', 'scheduled', 'scheduled']);
  let clock = new Date('2026-11-17T14:30:00Z'); // 台灣 11/17（二）22:30
  const routes = feedbackRoutes(plans, db, { now: () => clock, source: sqlitePlanningSource(db) });
  const checkpoints = new DatabaseSync(':memory:');
  const server = createPlanningServer(sqlitePlanningSource(db), checkpoints, routes);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const call = async (method: string, path: string, body: unknown) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() as Record<string, any> };
  };
  const latest = () => JSON.parse(String(plans.prepare('SELECT data FROM saved_plans ORDER BY rowid DESC LIMIT 1').get()!.data));
  try {
    // 1. 作業花了兩倍時間、Ch8 沒讀懂
    const report = await call('POST', '/api/tasks/t_hw/completions', { user_id: userId, actual_minutes: 120, difficulty: 4,
      understanding: { Ch8: 2, Ch9: 4, Ch10: 3 }, comment: '第八章很卡' });
    assert.equal(report.status, 200);
    assert.equal(report.data.task.status, 'done');
    assert.deepEqual(report.data.user_course.speed.default, { factor: 2, samples: 1 });
    assert.deepEqual(report.data.user_course.chapter_mastery.Ch8.need_review, true);
    assert.deepEqual(report.data.review_task.chapters, ['Ch8']);
    assert.equal(report.data.review_task.source, 'auto_review');
    assert.equal(report.data.reschedule.needed, true);
    assert.match(report.data.reschedule.reasons.join(), /多 100%.*Ch8 需要複習/);
    assert.deepEqual(report.data.reschedule.scope.from, '2026-11-17');
    assert.equal((await call('POST', '/api/tasks/t_hw/completions', { user_id: userId, actual_minutes: 10, difficulty: 1,
      understanding: 5 })).status, 400, '完成的任務不能再回報');
    assert.equal((await call('POST', '/api/tasks/t_nope/completions', { user_id: userId, actual_minutes: 10, difficulty: 1,
      understanding: 5 })).status, 404);
    // 學習狀況真的寫進 user_courses，而且排程的讀取檢查仍然通過
    const loaded = await sqlitePlanningSource(db).load(userId);
    assert.equal(loaded.user_courses.find(s => s.course_key === ds)!.speed.default.factor, 2);

    // 2. 使用者把 t_ex 的一個時段鎖住
    const stored = latest();
    const lockedBlock = stored.schedule_blocks.find((b: Block) => b.task_id === 't_ex');
    lockedBlock.locked = true;
    plans.prepare('UPDATE saved_plans SET data = ? WHERE plan_id = ?').run(JSON.stringify(stored), stored.schedule.plan_id);

    // 3. 部分重排
    const resched = await call('POST', '/api/plans/latest/reschedule',
      { user_id: userId, trigger: 'completion_feedback', trigger_ref: 't_hw' });
    assert.equal(resched.status, 201, JSON.stringify(resched.data).slice(0, 500));
    const next = resched.data.plan;
    assert.equal(next.schedule.supersedes, 'p_initial');
    assert.deepEqual([next.schedule.trigger, next.schedule.trigger_ref], ['completion_feedback', 't_hw']);
    const byId = Object.fromEntries(next.tasks.map((t: FeedbackTask) => [t.task_id, t]));
    assert.equal(byId.t_hw.status, 'done', '完成的任務保留');
    assert.equal(byId.t_hw.completions.length, 1);
    assert.equal(byId.t_ex.status, 'scheduled', '鎖定時段的任務不重排');
    assert.equal(byId.t_read.estimate.speed_factor, 2, '用新的速度重算估時');
    assert.equal(byId.t_read.estimate.minutes, 100);
    const review = next.tasks.find((t: FeedbackTask) => t.source === 'auto_review');
    assert.equal(review.status, 'scheduled', '複習任務被排進時段');
    const blocks: Block[] = next.schedule_blocks;
    assert.ok(blocks.some(b => b.block_id === lockedBlock.block_id && b.locked), '鎖定時段原樣保留');
    for (const b of blocks.filter(b => b.block_id !== lockedBlock.block_id && b.date === lockedBlock.date)) {
      assert.ok(b.end_time <= lockedBlock.start_time || b.start_time >= lockedBlock.end_time, '新時段不和鎖定時段重疊');
    }
    assert.ok(blocks.filter(b => !b.locked && (b.status ?? 'planned') === 'planned').every(b => b.date >= '2026-11-17'),
      '新排的時段都在今天以後');
    const minutes = (id: string) => blocks.filter(b => b.task_id === id && (b.status ?? 'planned') === 'planned')
      .reduce((sum, b) => sum + (Date.parse(`2000-01-01T${b.end_time}`) - Date.parse(`2000-01-01T${b.start_time}`)) / 60000, 0);
    assert.equal(minutes('t_read'), 100, '重排後時段總長等於新估時');
    const history = plans.prepare('SELECT data FROM saved_plans ORDER BY rowid').all().map(r => JSON.parse(String(r.data)));
    assert.deepEqual(history.map(p => p.schedule.status), ['superseded', 'active'], '舊版保留並標成 superseded');

    // 4. 過了幾天沒回報 → 錯過 → 需要重排
    clock = new Date('2026-12-02T15:00:00Z');
    const missed = await call('POST', '/api/plans/latest/missed', { user_id: userId });
    assert.equal(missed.status, 200);
    assert.ok(missed.data.missed_blocks.length > 0);
    assert.equal(missed.data.reschedule.trigger, 'missed_tasks');
    assert.equal(missed.data.reschedule.needed, true);
    const again = await call('POST', '/api/plans/latest/reschedule', { user_id: userId, trigger: 'missed_tasks' });
    assert.equal(again.status, 201);
    assert.ok(again.data.plan.schedule_blocks.filter((b: Block) => (b.status ?? 'planned') === 'planned' && !b.locked)
      .every((b: Block) => b.date >= '2026-12-02'));

    // 5. 使用者調整熟悉度
    const adjust = await call('PUT', `/api/users/${userId}/courses/${ds}`, { familiarity: 2 });
    assert.deepEqual([adjust.status, adjust.data.user_course.familiarity, adjust.data.reschedule.reasons], [200, 2, ['熟悉度改變']]);
    assert.equal((await call('PUT', `/api/users/${userId}/courses/${ds}`, { familiarity: 9 })).status, 400);
    assert.equal((await call('POST', '/api/plans/latest/reschedule', { user_id: userId, trigger: 'nope' })).status, 400);
    assert.equal((await call('POST', '/api/plans/latest/reschedule', { user_id: 'u_none' })).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    checkpoints.close();
    plans.close();
    db.close();
  }
});

test('nothing to reschedule once every task is finished', async () => {
  const { db, plans } = await setup();
  const routes = feedbackRoutes(plans, db, { now: () => new Date('2026-11-17T14:30:00Z'), source: sqlitePlanningSource(db) });
  const plan = JSON.parse(String(plans.prepare('SELECT data FROM saved_plans').get()!.data));
  plan.tasks = plan.tasks.map((t: FeedbackTask) => ({ ...t, status: 'done' }));
  plans.prepare('UPDATE saved_plans SET data = ?').run(JSON.stringify(plan));
  const { reschedulePlan } = await import('../src/reschedule.ts');
  const input: PlanningInput = await sqlitePlanningSource(db).load(userId);
  assert.equal(reschedulePlan(plan, input, { now: new Date('2026-11-17T14:30:00Z'), trigger: 'user_request', trigger_ref: null }).status,
    'nothing_to_reschedule');
  assert.equal(typeof routes, 'function');
  plans.close();
  db.close();
});
