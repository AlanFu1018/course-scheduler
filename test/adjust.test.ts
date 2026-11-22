import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { generateAdjustedPlan } from '../src/adjust.ts';
import { availableDays } from '../src/availability.ts';
import type { PlanningInput, UserCourse } from '../src/data.ts';
import { speedFor } from '../src/estimate.ts';
import { afterCompletion, parseCompletion, updateUserCourse } from '../src/feedback.ts';
import { feedbackRoutes } from '../src/feedback-routes.ts';
import { GeminiLlmService } from '../src/llm.ts';
import { planHistory } from '../src/plan-history.ts';
import { validatePlacement } from '../src/planner.ts';
import type { Task, FinalPlan } from '../src/planner.ts';
import { blockMinutes } from '../src/scheduler.ts';
import type { SavedBlock } from '../src/scheduler.ts';
import { createPlanningServer } from '../src/server.ts';

const now = new Date('2026-11-21T16:30:15Z'); // 00:30:15 on Sunday in Taipei
const today = '2026-11-22', yesterday = '2026-11-21', tomorrow = '2026-11-23';
const user_id = 'student', plan_id = 'original';
const options = { now, trigger: 'completion_feedback' as const, trigger_ref: 'reported' };

function input(): PlanningInput {
  const keys = ['math', 'english'];
  return {
    user: { user_id, schema_version: '1.5', timezone: 'Asia/Taipei', date_overrides: [], calendar_sources: [],
      availability: [{ valid_from: yesterday, valid_to: tomorrow, daily_max_minutes: 300, session_minutes: 90,
        break_minutes: 5, exam_buffer_days: 0, weekly_slots: [1, 7].map(weekday => ({ weekday, start_time: '00:00', end_time: '08:00' })) }] },
    calendar_events: [],
    courses: keys.map(course_key => ({ user_id, course_key, schema_version: '1.5', start_date: yesterday, end_date: tomorrow,
      course: { name: course_key, sessions: [], textbook: { chapters: [{ id: 'Ch1' }] } },
      assessments: [], weekly_schedule: [], grading: [] })),
    user_courses: keys.map(course_key => ({ user_id, course_key, schema_version: '1.5', active: true, familiarity: 3,
      difficulty: 3, target_grade: 80, chapter_mastery: {}, speed: { default: { factor: 1, samples: 0 }, by_task_type: {} } })),
  };
}

function task(task_id: string, fields: Partial<Task> = {}): Task {
  return { task_id, user_id, plan_id, title: task_id, course_key: 'math', assessment_id: null, chapters: ['Ch1'],
    type: 'reading', phase: 'learn', schema_version: '1.5', status: 'scheduled', source: 'ai', parent_task_id: null,
    priority: 0.5, reason: 'reading', created_at: yesterday, updated_at: yesterday, deadline: tomorrow, completions: [],
    estimate: { minutes: 60, base_minutes: 60, difficulty_mult: 1, familiarity_mult: 1, speed_factor: 1,
      basis: { difficulty: 3, familiarity_level: 3 } }, ...fields };
}

function block(task_id: string, date: string, start_time: string, end_time: string, status = 'planned', locked = false): SavedBlock {
  return { block_id: [task_id, date, start_time].join('_'), user_id, task_id, date, start_time, end_time, status, locked };
}

function plan(tasks: Task[], schedule_blocks: SavedBlock[] = []): FinalPlan {
  return { tasks, schedule_blocks, notes: [], schedule: { user_id, plan_id, created_at: yesterday, model: 'mock', allocation: [],
    scope: { from: yesterday, to: tomorrow, course_keys: ['math', 'english'] }, status: 'active', schema_version: '1.5',
    summary: '', supersedes: null, trigger: 'initial', trigger_ref: null, task_ids: tasks.map(t => t.task_id) } };
}

async function api(t: TestContext, data: PlanningInput, previous: FinalPlan, writable = false) {
  const llm = t.mock.method(GeminiLlmService.prototype, 'generate', () => { throw new Error('unexpected Gemini call'); });
  const db = new DatabaseSync(':memory:');
  const states = writable ? new DatabaseSync(':memory:') : null;
  if (states) {
    states.exec('CREATE TABLE user_courses(user_id TEXT, course_key TEXT, data TEXT)');
    for (const state of data.user_courses) states.prepare('INSERT INTO user_courses VALUES(?,?,?)')
      .run(user_id, state.course_key, JSON.stringify(state));
  }
  const history = planHistory(db);
  history.save(previous, []);
  const source = { async load() {
    return states ? { ...data, user_courses: states.prepare('SELECT data FROM user_courses').all()
      .map(row => JSON.parse(String(row.data)) as UserCourse) } : data;
  } };
  const server = createPlanningServer(source, db, feedbackRoutes(db, states, { now: () => now }), () => now);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    states?.close();
    db.close();
    assert.equal(llm.mock.callCount(), 0);
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, fields = {}, expected = 200) => {
    const response = await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, ...fields }) });
    const value = await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    return value;
  };
  return { post, history, db };
}

test('block feedback snapshots duration and speed, and blends the same observation into both averages', () => {
  const original = task('split');
  original.estimate.speed_factor = 1.2;
  const b = block('split', today, '01:00', '01:30');
  const completion = parseCompletion(original, { actual_minutes: 30, difficulty: 3, understanding: 3, block_id: b.block_id }, now, [b]);
  assert.equal(completion.estimated_minutes, 30);
  assert.equal(completion.speed_factor, 1.2);
  assert.equal(afterCompletion(original, completion, []).needed, false);
  original.estimate.speed_factor = 2; // Replaying the observation must still use 1.2.
  const state = input().user_courses[0];
  state.speed.default = { factor: 1.5, samples: 5 };
  state.speed.by_task_type.reading = { factor: 0.5, samples: 0 };
  const { state: learned } = updateUserCourse(state, original, completion, now);
  assert.deepEqual(learned.speed.default, { factor: 1.41, samples: 6 });
  assert.deepEqual(learned.speed.by_task_type.reading, { factor: 1.41, samples: 1 });
  state.speed.by_task_type.reading = { factor: 0.8, samples: 2 };
  assert.equal(speedFor(state, 'reading'), 1.5);
  const next = updateUserCourse(state, original, completion, now).state;
  assert.equal(speedFor(next, 'reading'), 0.92);
});

test('the completion endpoint uses the reported block in its speed update and deviation decision', async t => {
  const first = block('split', today, '09:00', '09:30'), second = block('split', today, '09:35', '10:05');
  const { post, history } = await api(t, input(), plan([task('split')], [first, second]), true);
  const result = await post('/api/tasks/split/completions', { block_id: first.block_id, actual_minutes: 30,
    difficulty: 3, understanding: 3 });
  assert.equal(result.reschedule.needed, false);
  assert.deepEqual(result.user_course.speed.default, { factor: 1, samples: 1 });
  const saved = history.read(user_id)!;
  assert.equal(saved.tasks[0].status, 'scheduled');
  assert.equal(saved.tasks[0].completions[0].estimated_minutes, 30);
  assert.equal(saved.tasks[0].completions[0].speed_factor, 1);
  assert.deepEqual(saved.schedule_blocks.map(b => b.status), ['done', 'planned']);
});

test('slow completion creates a review and lengthens only its course in the next saved version', async t => {
  const data = input(), reported = task('reported'), other = task('other', { course_key: 'english' });
  const previous = plan([reported, task('carry'), other], [block('reported', yesterday, '10:00', '11:00')]);
  const { post, history } = await api(t, data, previous, true);
  const feedback = await post('/api/tasks/reported/completions', { actual_minutes: 90, difficulty: 3, understanding: 3, need_review: true });
  assert.deepEqual(feedback.user_course.speed.default, { factor: 1.15, samples: 1 });
  assert.equal(feedback.reschedule.endpoint, '/api/plans/latest/adjust');
  const before = history.read(user_id)!;
  const adjusted: FinalPlan = await post(feedback.reschedule.endpoint, feedback.reschedule);
  assert.equal(adjusted.schedule.supersedes, plan_id);
  assert.notEqual(adjusted.schedule.plan_id, plan_id);
  assert.equal(adjusted.schedule.status, 'active');
  assert.deepEqual(adjusted.schedule.scope, { ...before.schedule.scope, from: today });
  assert.equal(adjusted.schedule.trigger, 'completion_feedback');
  assert.equal(adjusted.schedule.trigger_ref, reported.task_id);
  assert.deepEqual(history.read(user_id, plan_id), { ...before, schedule: { ...before.schedule, status: 'superseded' } });
  assert.ok(adjusted.tasks.every(t => t.plan_id === adjusted.schedule.plan_id));
  assert.deepEqual(adjusted.tasks[0], { ...before.tasks[0], plan_id: adjusted.schedule.plan_id });
  assert.deepEqual(adjusted.schedule_blocks.filter(b => b.task_id === 'reported'), before.schedule_blocks);
  assert.equal(adjusted.tasks[1].estimate.minutes, 70);
  assert.deepEqual(adjusted.tasks[2].estimate, other.estimate);
  const review = adjusted.tasks.find(t => t.task_id === feedback.review_task.task_id)!;
  assert.equal(review.status, 'scheduled');
  assert.equal(review.source, 'auto_review');
  assert.ok(adjusted.schedule_blocks.some(b => b.task_id === review.task_id));
  assert.match(adjusted.schedule.summary, /1 項任務延長、1 項複習加入/);
  await post('/api/tasks/reported/skip', {}, 400);
  await post(`/api/tasks/${review.task_id}/skip`);
  assert.ok(history.read(user_id)!.schedule_blocks.filter(b => b.task_id === review.task_id).every(b => b.status === 'cancelled'));
});

test('partial work uses the undone fraction and credits locked time while preserving the local clock and breaks', () => {
  const data = input();
  data.user_courses[0].speed.default.factor = 1.5;
  const partial = task('partial');
  partial.estimate = { ...partial.estimate, base_minutes: 120, minutes: 120 };
  const done = block('partial', yesterday, '10:00', '11:00', 'done');
  const locked = block('partial', today, '01:00', '01:30', 'planned', true);
  const stale = block('partial', yesterday, '11:05', '11:35', 'missed');
  const full = block('full', today, '03:00', '04:00', 'planned', true);
  const previous = plan([partial, task('full', { course_key: 'english' })], [done, locked, stale, full]);
  const result = generateAdjustedPlan(data, previous, options);
  assert.ok('schedule' in result);
  assert.equal(result.tasks[0].estimate.minutes, 180);
  assert.equal(result.tasks[0].remaining_minutes, 90);
  assert.deepEqual(result.schedule_blocks.filter(b => [done.block_id, locked.block_id, full.block_id].includes(b.block_id)), [done, locked, full]);
  const fresh = result.schedule_blocks.filter(b => ![done.block_id, locked.block_id, full.block_id].includes(b.block_id));
  assert.equal(fresh.reduce((n, b) => n + blockMinutes(b), 0), 60);
  assert.ok(fresh.every(b => b.task_id === 'partial' && (b.date > today || b.date === today && b.start_time >= '00:31')));
  assert.ok(!result.schedule_blocks.some(b => b.block_id === stale.block_id));
  validatePlacement(result.schedule_blocks, result.tasks, availableDays(data, result.schedule.scope), data.courses);
});

test('basis scales the original multipliers and legacy estimates acquire a basis without rescaling', () => {
  const data = input();
  const state = data.user_courses[0];
  state.difficulty = 5;
  state.chapter_mastery.Ch1 = { level: 1, need_review: true };
  const tracked = task('tracked'), legacy = task('legacy');
  tracked.estimate.difficulty_mult = legacy.estimate.difficulty_mult = 1.5;
  delete legacy.estimate.basis;
  const adjusted = generateAdjustedPlan(data, plan([tracked, legacy]), options);
  assert.ok('schedule' in adjusted);
  assert.deepEqual(adjusted.tasks.map(t => t.estimate.minutes), [140, 90]);
  for (const t of adjusted.tasks) assert.deepEqual(t.estimate.basis, { difficulty: 5, familiarity_level: 1 });
  const repeat = generateAdjustedPlan(data, adjusted, options);
  assert.deepEqual(repeat.tasks.map(t => t.estimate), adjusted.tasks.map(t => t.estimate));
});

test('accepted pending minutes survive a second adjustment when only completed blocks were retained', () => {
  const data = input();
  data.user.availability[0].daily_max_minutes = 20;
  const done = block('partial', yesterday, '09:00', '09:30', 'done');
  const previous = plan([task('partial')], [done, block('partial', today, '01:00', '01:30')]);
  previous.schedule.scope.to = today;
  const pending = generateAdjustedPlan(data, previous, options, 'accept_pending');
  assert.ok('schedule' in pending);
  assert.equal(pending.tasks[0].status, 'pending');
  assert.deepEqual(pending.schedule_blocks, [done]);
  data.user.availability[0].daily_max_minutes = 60;
  const final = generateAdjustedPlan(data, pending, options);
  assert.ok('schedule' in final);
  assert.equal(final.tasks[0].status, 'scheduled');
  assert.equal(final.schedule_blocks.filter(b => b.status === 'planned').reduce((n, b) => n + blockMinutes(b), 0), 30);
});

test('adjust detects missed tasks before checking deadlines and counting rescheduled work', () => {
  const previous = plan([task('overdue', { deadline: yesterday }), task('carry')], [
    block('overdue', yesterday, '10:00', '11:00'),
    block('carry', today, '00:00', '00:30', 'planned', true),
  ]);
  const result = generateAdjustedPlan(input(), previous, options);
  assert.ok('schedule' in result);
  const [overdue, carry] = result.tasks;
  assert.equal(overdue.status, 'missed');
  assert.equal(overdue.pending_reason, '已過截止日，請決定補做（延後期限）或跳過');
  assert.ok(!result.schedule_blocks.some(b => b.task_id === overdue.task_id));
  assert.equal(carry.status, 'scheduled');
  assert.match(result.schedule.summary, /1 項錯過的任務重新安排/);
});

test('a finished planning horizon has no future capacity to offer', () => {
  const previous = plan([task('carry')]);
  previous.schedule.scope.to = yesterday;
  const draft = generateAdjustedPlan(input(), previous, options);
  assert.ok('draft_id' in draft);
  assert.equal(draft.scope.from, today);
  assert.equal(draft.scope.to, yesterday);
  assert.equal(draft.overall, null);
  assert.equal(draft.short_term[0].available_minutes, 0);
  assert.equal(draft.short_term[0].suggestions.add_time, null);
  assert.match(draft.message, /原計畫已於 11\/21 結束/);
});

test('a failed version save rolls back supersession and leaves the adjustment draft retryable', async t => {
  const data = input();
  data.user.availability[0].daily_max_minutes = 20;
  const { post, history, db } = await api(t, data, plan([task('carry')]));
  const draft = await post('/api/plans/latest/adjust');
  const path = `/api/plans/drafts/${draft.draft_id}/decision`;
  db.exec("CREATE TRIGGER fail_save BEFORE INSERT ON saved_plans BEGIN SELECT RAISE(ABORT,'save failed'); END");
  await post(path, { action: 'accept_pending' }, 500);
  assert.equal(history.read(user_id)!.schedule.status, 'active');
  assert.equal(history.list(user_id).length, 1);
  db.exec('DROP TRIGGER fail_save');
  const final = await post(path, { action: 'accept_pending' });
  assert.equal(final.schedule.supersedes, plan_id);
  assert.equal(history.list(user_id).length, 2);
});

test('fixture routes reschedule eligible missed work and let the user skip or extend overdue tasks', async t => {
  const data = input();
  const overdue = task('overdue', { status: 'missed', deadline: yesterday });
  const future = task('future', { status: 'missed' });
  const { post, history } = await api(t, data, plan([overdue, { ...overdue, task_id: 'skip' }, future],
    [block('future', yesterday, '10:00', '11:00', 'missed')]));
  await post('/api/plans/latest/adjust', { user_id: 'other' }, 404);
  const adjusted: FinalPlan = await post('/api/plans/latest/adjust');
  assert.deepEqual(adjusted.tasks.map(t => t.status), ['missed', 'missed', 'scheduled']);
  assert.ok(adjusted.schedule_blocks.every(b => b.task_id === 'future'));
  assert.match(adjusted.notes[0].issues[0], /已過截止日，請決定補做（延後期限）或跳過/);
  await post('/api/tasks/overdue/extend', { deadline: yesterday }, 400);
  await post('/api/tasks/overdue/extend', { deadline: '2026-11-24' }, 400);
  await post('/api/tasks/future/extend', { deadline: tomorrow }, 400);
  assert.equal((await post('/api/tasks/skip/skip')).status, 'skipped');
  const extended = await post('/api/tasks/overdue/extend', { deadline: today });
  assert.equal(extended.status, 'pending');
  assert.equal(extended.deadline, today);
  assert.deepEqual(history.read(user_id)!.notes[0].issues, []);
  await post('/api/tasks/overdue/completions', { actual_minutes: 60, difficulty: 3, understanding: 3 }, 400);
  const next: FinalPlan = await post('/api/plans/latest/adjust');
  assert.deepEqual(next.tasks.map(t => t.status), ['scheduled', 'skipped', 'scheduled']);
});

for (const action of ['reschedule', 'accept_pending']) test(`adjustment shortfall forecasts remaining work and supports ${action}`, async t => {
  const data = input();
  data.user_courses[0].speed.default.factor = 1.5;
  data.user.availability[0].daily_max_minutes = 100;
  const locked = block('locked', today, '01:00', '02:00', 'planned', true);
  const previous = plan([task('locked', { course_key: 'english' }), task('work')], [locked]);
  previous.schedule.scope.to = today;
  const { post, history, db } = await api(t, data, previous);
  const draft = await post('/api/plans/latest/adjust', { trigger: 'calendar_update', trigger_ref: 'event' });
  assert.equal(draft.status, 'needs_decision');
  assert.match(draft.message, /照目前速度（比原估慢 50%），剩下的內容需要 1.5 小時/);
  assert.equal(draft.overall.required_minutes, 90);
  assert.equal(draft.overall.available_minutes, 40);
  assert.equal(history.read(user_id)!.schedule.status, 'active');
  assert.equal(JSON.parse(String(db.prepare('SELECT data FROM plan_drafts').get()!.data)).previous_plan_id, plan_id);
  const path = `/api/plans/drafts/${draft.draft_id}/decision`;
  const retry = await post(path, { action: 'reschedule' });
  assert.equal(retry.draft_id, draft.draft_id);
  if (action === 'reschedule') {
    assert.equal(draft.overall.suggestions.adjust_regular_time.raise_daily_max_to, 150);
    data.user.availability[0].daily_max_minutes = 150;
  }
  const final: FinalPlan = await post(path, { action });
  assert.equal(final.schedule.plan_id, draft.draft_id);
  assert.equal(final.schedule.trigger_ref, 'event');
  assert.equal(final.tasks[1].status, action === 'reschedule' ? 'scheduled' : 'pending');
  assert.deepEqual(final.schedule_blocks.find(b => b.block_id === locked.block_id), locked);
  assert.equal(history.read(user_id, plan_id)!.schedule.status, 'superseded');
  await post(path, { action }, 404);
});
