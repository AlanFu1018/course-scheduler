import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { mock, test } from 'node:test';
import { availableDays, shiftDate } from '../src/availability.ts';
import { scheduleTasks } from '../src/scheduler.ts';
import { check, filePlanningSource, parsePlanningJson, readPlanningFile, sqlitePlanningSource, timeMinutes } from '../src/data.ts';
import { errorStatus } from '../src/errors.ts';
import type { PlanningInput } from '../src/data.ts';
import { GeminiLlmService } from '../src/llm.ts';
import { checkpointRun } from '../src/checkpoints.ts';
import { planHistory } from '../src/plan-history.ts';
import { generateInitialPlan, validatePlacement } from '../src/planner.ts';
import { planningInputView } from '../src/planning-input-view.ts';

const fixture = (name: string) => new URL(`data/${name}.json`, import.meta.url);
const courseFiles = (await readdir(new URL('data/', import.meta.url))).filter(name => /^2_course\..+\.json$/.test(name)).sort();
const source = filePlanningSource({
  courses: courseFiles.map(name => new URL(`data/${name}`, import.meta.url)), userState: fixture('3_user_state'),
});
const scope = { from: '2026-11-14', to: '2026-12-25', course_keys: [] };
const userId = 'u_0001';

function addCalendarConflict(input: PlanningInput) {
  input.user.calendar_sources.push({ source_id: 'test-calendar', treat_as: 'busy' });
  input.calendar_events.push({
    user_id: userId, source_id: 'test-calendar', all_day: false,
    start_at: '2026-11-18T19:30:00+08:00', end_at: '2026-11-18T20:30:00+08:00',
  });
}

test('reads JSONC comments without modifying URLs, Unicode, or null values', async () => {
  assert.deepEqual(parsePlanningJson('{"url":"https://example.test", /* note */ "test":null,}', true),
    { url: 'https://example.test', test: null });
  const course = await readPlanningFile(new URL('../doc/2_course.jsonc', import.meta.url)) as {
    course: { name: string }; assessments: { weight: { value: number | null } }[];
  };
  assert.equal(course.course.name, '計算機網路');
  assert.equal(course.assessments[2].weight.value, null);
  await assert.rejects(readPlanningFile(fixture('missing')), /missing\.json/);
  assert.throws(() => parsePlanningJson('{"bad":,}', true), SyntaxError);
});

test('SQLite and fixture sources agree and isolate users', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE users(user_id TEXT PRIMARY KEY, data TEXT);
      CREATE TABLE courses(user_id TEXT, course_key TEXT, data TEXT);
      CREATE TABLE user_courses(user_id TEXT, course_key TEXT, data TEXT);
      CREATE TABLE calendar_events(event_id TEXT, user_id TEXT, source_id TEXT,
        start_at TEXT, end_at TEXT, all_day INTEGER, uid TEXT, synced_at TEXT);
    `);
    const expected = await source.load(userId);
    for (const id of [userId, 'u_0002']) {
      const data = (value: object) => JSON.stringify({ ...value, user_id: id });
      db.prepare('INSERT INTO users VALUES (?, ?)').run(id, data(expected.user));
      for (const course of expected.courses) {
        db.prepare('INSERT INTO courses VALUES (?, ?, ?)').run(id, course.course_key, data(course));
      }
      for (const state of expected.user_courses) {
        db.prepare('INSERT INTO user_courses VALUES (?, ?, ?)').run(id, state.course_key, data(state));
      }
    }
    db.prepare('INSERT INTO calendar_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'ce_01', 'u_0002', 'cal_01', '2026-11-18T19:30:00+08:00', '2026-11-18T20:30:00+08:00',
      0, 'sample@example.test', '2026-11-13T20:00:00+08:00',
    );
    const sqlite = sqlitePlanningSource(db);
    assert.deepEqual(JSON.parse(JSON.stringify(await sqlite.load(userId))), expected);
    const other = await sqlite.load('u_0002');
    assert.equal(other.calendar_events.length, 1);
    assert.equal(planningInputView(other).user_id, 'u_0002');
    assert.equal(planningInputView(other).courses.length, 8);
    assert.ok([other.user, ...other.courses, ...other.user_courses, ...other.calendar_events]
      .every(row => row.user_id === 'u_0002'));
    await assert.rejects(sqlite.load("u_0001' OR 1=1 --"), /找不到/);
    await assert.rejects(source.load('u_0002'), /找不到/);
  } finally {
    db.close();
  }
});

test('planning input view exposes timetable and learning settings without private input fields', async () => {
  const input = await source.load(userId);
  input.user.calendar_sources.push({ source_id: 'private', treat_as: 'busy', url: 'private-subscription' } as typeof input.user.calendar_sources[number]);
  addCalendarConflict(input);
  const state = input.user_courses.find(course => course.course_key === 'self_networks')!;
  state.speed.by_task_type.reading = { factor: 1.2, samples: 3 };
  state.chapter_mastery.Ch1 = { level: 2, need_review: true };
  const result = planningInputView(input);
  const networks = result.courses.find(course => course.course_key === 'self_networks')!;
  assert.equal(networks.name, '計算機網路');
  assert.equal(networks.sessions[0].room, 'E6-A204');
  assert.equal(result.availability[0].daily_max_minutes, 180);
  assert.deepEqual(networks.settings?.speed.by_task_type, [{ type: 'reading', factor: 1.2, samples: 3 }]);
  assert.equal(networks.settings?.chapter_mastery[0].need_review, true);
  assert.doesNotMatch(JSON.stringify(result), /private-subscription|calendar_events|calendar_sources|test-calendar/);
  assert.deepEqual(planningInputView({ ...input, courses: [], user_courses: [] }).courses, []);
});

test('availability applies overrides, class times and calendar conflicts', async () => {
  const input = await source.load(userId);
  addCalendarConflict(input);
  input.user.date_overrides.push(
    { date: '2026-11-14', slots: [] },
    { date: '2026-11-21', slots: [{ start_time: '09:00', end_time: '12:00' }] },
  );
  input.user.availability[0].weekly_slots.push({ weekday: 4, start_time: '09:00', end_time: '12:00' });
  const days = availableDays(input, scope);
  assert.equal(days.some(day => day.date === '2026-11-14'), false);
  assert.deepEqual(days.find(day => day.date === '2026-11-18')?.slots, [
    { start_time: '19:00', end_time: '19:30' }, { start_time: '20:30', end_time: '22:00' },
  ]);
  assert.deepEqual(days.find(day => day.date === '2026-11-19')?.slots, [
    { start_time: '09:50', end_time: '10:00' }, { start_time: '10:50', end_time: '11:00' },
    { start_time: '11:50', end_time: '12:00' }, { start_time: '19:00', end_time: '22:00' },
  ]);
  assert.deepEqual(days.find(day => day.date === '2026-11-21')?.slots, [{ start_time: '09:00', end_time: '12:00' }]);
});

test('the eight timetable courses have complete teaching weeks and block every class', async () => {
  const input = await source.load(userId);
  const expected: Record<string, [number, ...number[]]> = {
    self_networks: [1, 9, 10, 11], self_assembly: [1, 13, 14, 15],
    'self_data-structures': [2, 13, 14, 15], 'self_discrete-math': [3, 13, 14, 15],
    self_fitness: [3, 10, 11], self_japanese: [4, 9, 10, 11],
    self_probability: [4, 14, 15, 16], self_creativity: [4, 17, 18],
  };
  assert.equal(input.courses.length, 8);
  assert.equal(input.user_courses.length, 8);
  assert.deepEqual(input.calendar_events, []);
  input.user.availability[0].weekly_slots = [1, 2, 3, 4].map(weekday => ({
    weekday, start_time: '08:00', end_time: '19:00',
  }));
  const days = availableDays(input, { from: '2026-09-07', to: '2026-09-13', course_keys: ['self_networks'] });
  for (const course of input.courses) {
    const [weekday, ...hours] = expected[course.course_key];
    assert.equal(course.weekly_schedule.length, 16);
    assert.equal(course.weekly_schedule[0].date_range[0], course.start_date);
    assert.equal(course.weekly_schedule.at(-1)?.date_range[1], course.end_date);
    assert.deepEqual(course.course.sessions.map(slot => [slot.weekday, slot.start_time, slot.end_time]),
      hours.map(hour => {
        const hh = String(hour).padStart(2, '0');
        return [weekday, hh + ':00', hh + ':50'];
      }));
    for (const slot of course.course.sessions) {
      assert.ok(days[weekday - 1].slots.every(free => free.end_time <= slot.start_time || free.start_time >= slot.end_time));
    }
  }
});

const draft = {
  course_key: 'self_networks', assessment_id: 'final', title: 'Ch4 閱讀', chapters: ['Ch4'],
  type: 'reading', phase: 'learn', priority: 0.65, reason: '期末考範圍',
  deadline: '2026-12-20', estimate: { base_minutes: 60, difficulty_mult: 1.2, familiarity_mult: 1.2, speed_factor: 1.05 },
};

function evening(date: string) {
  return { date, slots: [{ start_time: '19:00', end_time: '22:00' }],
    daily_max_minutes: 150, session_minutes: 50, break_minutes: 10, exam_buffer_days: 7 };
}

function homework(task_id: string, minutes: number, deadline: string, target_week: string) {
  return { ...draft, type: 'homework', task_id, assessment_id: null, deadline, target_week, estimate: { minutes } };
}

test('130-minute homework fills late evening slots before October 1', async () => {
  const input = await source.load(userId);
  const course = input.courses.find(c => c.course_key === draft.course_key)!;
  const days = Array.from({ length: 5 }, (_, i) => evening(shiftDate('2026-09-26', i)));
  const courses = days.map(d => ({ ...course, course_key: d.date, start_date: d.date }));
  const nightly = days.map(d => ({ ...homework(d.date, 100, d.date, '2026-09-21'), course_key: d.date }));
  const assignment = homework('assignment', 130, '2026-10-01', '2026-09-28');
  const result = scheduleTasks([...nightly, assignment], [course, ...courses], days);
  assert.deepEqual(result.pending, []);
  const blocks = result.blocks.filter(b => b.task_id === assignment.task_id);
  assert.ok(blocks.every(b => '21:00' <= b.start_time && b.end_time <= '22:00' && b.date < assignment.deadline));
  assert.equal(blocks.reduce((sum, b) => sum + timeMinutes(b.end_time) - timeMinutes(b.start_time), 0), 130);
});

test('light demand uses the weekly daily target before using hard capacity', async () => {
  const { courses } = await source.load(userId);
  const days = Array.from({ length: 5 }, (_, i) => evening(shiftDate('2026-09-07', i)));
  const result = scheduleTasks([homework('a', 100, days[4].date, days[0].date)], courses, days);
  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.blocks.map(b => [b.date, b.start_time, b.end_time]), days.map(d => [d.date, '19:00', '19:20']));
});

test('55 minutes fit in two legal sessions with a break on a single day', async () => {
  const { courses } = await source.load(userId);
  const day = evening('2026-09-07');
  const result = scheduleTasks([homework('a', 55, day.date, day.date)], courses, [day]);
  assert.deepEqual(result.pending, []);
  const durations = result.blocks.map(b => timeMinutes(b.end_time) - timeMinutes(b.start_time));
  assert.equal(durations.length, 2);
  assert.ok(durations.every(m => m >= 20 && m <= 50));
  assert.equal(durations[0] + durations[1], 55);
  assert.equal(timeMinutes(result.blocks[1].start_time) - timeMinutes(result.blocks[0].end_time), 10);
});

test('fragmented slots can require rearranging earlier EDF placements', async () => {
  const { courses } = await source.load(userId);
  const days = [39, 34, 29].map((minutes, i) => ({
    ...evening(shiftDate('2026-09-07', i)), slots: [{ start_time: '19:00', end_time: '19:' + minutes }],
  }));
  const tasks = [29, 34, 39].map(n => homework(String(n), n, days[2].date, days[0].date));
  const result = scheduleTasks(tasks, courses, days);
  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.blocks.map(b => [b.task_id, b.date]), days.map((d, i) => [String([39, 34, 29][i]), d.date]));
});

test('repair respects fixed blocks and their daily minutes outside the failed task window', async () => {
  const { courses: [course] } = await source.load(userId);
  const monday = '2026-09-07', tuesday = '2026-09-08', wednesday = '2026-09-09';
  const courses = [course, { ...course, course_key: 'movable', start_date: tuesday },
    { ...course, course_key: 'later', start_date: wednesday }];
  const tasks = [
    { ...homework('fixed', 30, tuesday, tuesday), course_key: course.course_key },
    { ...homework('movable', 20, wednesday, wednesday), course_key: 'movable', priority: 1 },
    { ...homework('failed', 40, wednesday, wednesday), course_key: 'later' },
  ];
  // Only the movable task can shift from Wednesday to Tuesday. Moving the fixed
  // task back to Monday would require following the overlap transitively.
  for (const tuesdayCap of [50, 49]) {
    const days = [
      evening(monday), { ...evening(tuesday), daily_max_minutes: tuesdayCap },
      { ...evening(wednesday), slots: [{ start_time: '19:00', end_time: '20:00' }] },
    ];
    const result = scheduleTasks(tasks, courses, days);
    assert.deepEqual(result.blocks[0], { task_id: 'fixed', date: tuesday, start_time: '19:00', end_time: '19:30' });
    if (tuesdayCap === 50) {
      assert.deepEqual(result.pending, []);
      assert.deepEqual(result.blocks.slice(1), [
        { task_id: 'movable', date: tuesday, start_time: '19:40', end_time: '20:00' },
        { task_id: 'failed', date: wednesday, start_time: '19:00', end_time: '19:40' },
      ]);
    } else {
      assert.deepEqual(result.pending.map(p => p.task_id), ['failed']);
      assert.deepEqual(result.blocks.slice(1), [
        { task_id: 'movable', date: wednesday, start_time: '19:00', end_time: '19:20' },
      ]);
    }
  }
});

for (const k of [6, 10, 11, 12]) {
  test(`schedules a seeded semester with ${k} tasks per week within 3 seconds`, async t => {
    const input = await source.load(userId);
    const days = availableDays(input, { from: '2026-09-07', to: '2026-12-25', course_keys: [] });
    let seed = 1;
    function rnd() {
      seed = seed * 16807 % 2147483647;
      return seed / 2147483647;
    }
    const tasks = [];
    for (let w = '2026-09-07'; w <= '2026-12-14'; w = shiftDate(w, 7)) {
      for (let i = 0; i < k; i++) {
        const id = String(tasks.length);
        tasks.push({
          task_id: id, title: id, course_key: input.courses[tasks.length % input.courses.length].course_key,
          assessment_id: null, type: 'reading' as const, phase: 'learn' as const, priority: rnd(),
          target_week: w, deadline: shiftDate(w, 2 + Math.floor(rnd() * 9)),
          estimate: { minutes: 5 * Math.round((30 + rnd() * 150) / 5) },
        });
      }
    }
    const start = performance.now();
    const { blocks, pending } = scheduleTasks(tasks, input.courses, days);
    const elapsed = performance.now() - start;
    t.diagnostic(`scheduleTasks K=${k} took ${elapsed.toFixed(1)} ms`);
    assert.ok(elapsed < 3000, `scheduleTasks took ${elapsed} ms`);
    const pendingIds = new Set(pending.map(p => p.task_id));
    validatePlacement(blocks, tasks.map(task => ({
      ...task, status: pendingIds.has(task.task_id) ? 'pending' : 'scheduled',
    })), days, input.courses);
  });
}

test('a task that cannot finish across short slots releases all its minutes', async () => {
  const { courses } = await source.load(userId);
  const day = { ...evening('2026-09-07'), slots: [
    { start_time: '19:00', end_time: '19:30' }, { start_time: '19:35', end_time: '20:00' },
  ] };
  const result = scheduleTasks([homework('a', 55, day.date, day.date)], courses, [day]);
  assert.deepEqual(result.blocks, []);
  assert.deepEqual(result.pending, [{ task_id: 'a', reason: '截止前可用空檔不足（還差 5 分鐘）' }]);
});

test('capacity-only retry keeps all tasks and reports the lowest priority task as pending', async () => {
  const { input, courses: [course], scope } = await capacityFixture();
  scope.to = scope.from;
  const log: string[] = [];
  let calls = 0;
  const result = await generateInitialPlan(input, scope, { model: 'mock', async generate(prompt) {
    calls++;
    const data = JSON.parse(prompt.split('\n')[1]);
    if (data.weeks) return { weeks: [{ from: scope.from, focus: [{ course_key: course.course_key, topic: '閱讀' }] }] };
    assert.ok(data.batch_focus);
    return { tasks: [0.1, 0.8, 0.9].map(priority => ({
      ...draft, course_key: course.course_key, assessment_id: null, chapters: [], focus_id: data.batch_focus[0].id,
      deadline: scope.to, title: '閱讀' + priority, priority,
      estimate: { base_minutes: 30, difficulty_mult: 1, familiarity_mult: 1, speed_factor: 1 },
    })) };
  } }, new Date(), { step: (_, fn) => fn(), progress() {}, log: m => log.push(m) });
  assert.equal(calls, 3);
  assert.ok(log.some(m => m.includes('保留任務交由排程器處理')));
  assert.deepEqual(result.tasks.map(t => t.status), ['pending', 'scheduled', 'scheduled']);
  assert.ok(result.schedule_blocks.every(b => b.task_id !== result.tasks[0].task_id));
  assert.match(result.notes[0].issues[0], /^閱讀0\.1（30 分鐘，9\/12 截止）：9\/12～9\/12 共需 90 分鐘，只有 60 分鐘/);
  assert.match(result.schedule.summary, /\n1 項任務未能完整排入，保留為待排。$/);
});

async function capacityFixture() {
  const input = await source.load(userId);
  const courses = input.courses.filter(c => ['self_networks', 'self_fitness'].includes(c.course_key));
  input.courses = courses;
  input.user.date_overrides = [];
  input.calendar_events = [];
  input.user.availability = [{
    valid_from: '2026-09-01', valid_to: '2026-09-30', daily_max_minutes: 60,
    session_minutes: 30, break_minutes: 0, exam_buffer_days: 3,
    weekly_slots: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, start_time: '19:00', end_time: '21:00' })),
  }];
  for (const [i, c] of courses.entries()) {
    c.course.sessions = [];
    c.assessments = [{ id: 'midterm', type: 'exam', date: { value: '2026-09-' + (25 + i), week: 3 }, scope: { value: [] } }];
  }
  return { input, courses, scope: { from: '2026-09-12', to: '2026-09-26', course_keys: courses.map(c => c.course_key) } };
}

test('the first batch normalizes invalid sprint phases and preserves exam-linked review sprints', async () => {
  const { input, courses: [course], scope } = await capacityFixture();
  const make = (title: string, type: string, assessment_id: string | null) => ({
    ...draft, course_key: course.course_key, chapters: [], title, type, assessment_id, phase: 'sprint',
    deadline: '2026-09-24', focus_id: scope.from + '/1',
  });
  const log: string[] = [];
  let batchCalls = 0;
  const result = await generateInitialPlan(input, scope, { model: 'mock', async generate(prompt) {
    const data = JSON.parse(prompt.split('\n')[1]);
    if (data.weeks) return { weeks: data.weeks.map((w: { from: string }) => ({ ...w,
      focus: w.from === scope.from ? [{ course_key: course.course_key, topic: '考前複習' }] : [] })) };
    assert.ok(data.batch_focus);
    batchCalls++;
    assert.doesNotMatch(prompt, /上次回應不符合規則/);
    return { tasks: [make('甲', 'review', null), make('乙', 'homework', 'midterm'),
      make('丙', 'reading', null), make('丁', 'final_review', 'midterm')] };
  } }, new Date(), { step: (_, fn) => fn(), progress() {}, log: message => log.push(message) });
  assert.equal(batchCalls, 1);
  assert.deepEqual(result.tasks.map(task => [task.title, task.phase]), [
    ['甲', 'practice'], ['乙', 'practice'], ['丙', 'learn'], ['丁', 'sprint'],
  ]);
  assert.deepEqual(log.filter(message => message.includes('sprint 不適用')), [
    '甲：sprint 不適用，改為 practice', '乙：sprint 不適用，改為 practice', '丙：sprint 不適用，改為 learn',
  ]);
});

test('a retry with both a missing focus and excess demand still fails validation', async () => {
  const { input, courses: [course], scope } = await capacityFixture();
  scope.to = scope.from;
  let calls = 0;
  await assert.rejects(generateInitialPlan(input, scope, { model: 'mock', async generate(prompt) {
    calls++;
    const data = JSON.parse(prompt.split('\n')[1]);
    if (data.weeks) return { weeks: [{ from: scope.from,
      focus: ['甲', '乙'].map(topic => ({ course_key: course.course_key, topic })) }] };
    return { tasks: [{ ...draft, chapters: [], assessment_id: null, course_key: course.course_key,
      focus_id: data.batch_focus[0].id, deadline: scope.to }] };
  } }), error => errorStatus(error) === 502 && /缺少對應任務/.test(String(error)));
  assert.equal(calls, 3);
});

test('single-task capacity reports short slots and empty eligible windows together', async () => {
  const { input, courses: [course], scope } = await capacityFixture();
  scope.to = scope.from;
  input.user.date_overrides.push({ date: scope.from, slots: [
    { start_time: '19:00', end_time: '19:30' }, { start_time: '20:00', end_time: '20:15' },
  ] });
  const task = { ...draft, course_key: course.course_key, chapters: [], assessment_id: null,
    deadline: scope.from, title: '閱讀', focus_id: scope.from + '/1' };
  let corrected = false;
  await generateInitialPlan(input, scope, { model: 'mock', async generate(prompt) {
    const data = JSON.parse(prompt.split('\n')[1]);
    if (data.weeks) return { weeks: [{ from: scope.from, focus: [{ course_key: course.course_key, topic: '閱讀' }] }] };
    assert.ok(data.batch_focus);
    if (!prompt.includes('上次回應不符合規則')) return { tasks: [task,
      { ...task, title: '模考', assessment_id: 'midterm', type: 'mock_exam', phase: 'sprint' }] };
    assert.match(prompt, /閱讀 需 90 分鐘，但可排日期 2026-09-12～2026-09-12 共只有 30 分鐘/);
    assert.match(prompt, /模考 需 90 分鐘，但沒有任何可排日期/);
    corrected = true;
    return { tasks: [{ ...task, estimate: { ...task.estimate, base_minutes: 20 } }] };
  } });
  assert.ok(corrected);
});

test('overlapping exam buffers share capacity with earlier batches and expose reserved minutes', async () => {
  const { input, courses, scope } = await capacityFixture();
  let corrected = false;
  await generateInitialPlan(input, scope, { model: 'mock', async generate(prompt) {
    const data = JSON.parse(prompt.split('\n')[1]);
    if (data.weeks) return { weeks: data.weeks.map((w: { from: string }, i: number) => ({ ...w,
      focus: i === 1 ? [] : [{ course_key: courses[i === 0 ? 0 : 1].course_key, topic: '模考' }] })) };
    assert.ok(data.batch_focus);
    const later = data.previous_tasks.length > 0;
    assert.match(prompt, /同一段日期由所有課程共用/);
    assert.deepEqual(data.exam_windows[0], { course_key: courses[0].course_key, assessment_id: 'midterm',
      exam_date: '2026-09-25', prep_window: [scope.from, '2026-09-24'], buffer_window: ['2026-09-22', '2026-09-24'],
      prep_capacity_minutes: 13 * 60, buffer_capacity_minutes: 180, already_planned_minutes: later ? 150 : 0 });
    assert.equal(data.exam_windows[1].already_planned_minutes, 0);
    if (prompt.includes('上次回應不符合規則')) {
      assert.match(prompt, /2026-09-22～2026-09-25 共需 300 分鐘，但只有 240 分鐘。本批任務：乙。/);
      corrected = true;
    }
    return { tasks: [{ ...draft, course_key: data.batch_focus[0].course_key, chapters: [], assessment_id: 'midterm',
      type: 'mock_exam', phase: corrected ? 'practice' : 'sprint', deadline: later ? '2026-09-25' : '2026-09-24',
      title: later ? '乙' : '甲', focus_id: data.batch_focus[0].id,
      estimate: { base_minutes: 150, difficulty_mult: 1, familiarity_mult: 1, speed_factor: 1 } }] };
  } });
  assert.ok(corrected);
});

test('all-day events block local dates up to the exclusive end', async () => {
  const input = await source.load(userId);
  const dates = ['2026-09-10', '2026-09-11', '2026-09-12'];
  const slots = [{ start_time: '06:00', end_time: '07:00' }];
  input.user.date_overrides = dates.map(date => ({ date, slots }));
  input.user.calendar_sources.push({ source_id: 'busy', treat_as: 'busy' });
  for (const event of [
    { all_day: false, start_at: dates[0], end_at: dates[2] },
    { all_day: true, start_at: '2026-09-09T23:00:00Z', end_at: '2026-09-11T23:00:00Z' },
  ]) {
    input.calendar_events = [{ ...event, user_id: userId, source_id: 'busy' }];
    const days = availableDays(input, { from: dates[0], to: dates[2], course_keys: [] });
    assert.deepEqual(days.map(d => [d.date, d.slots]), [[dates[2], slots]]);
  }
});

test('a project preparation title is valid for a homework task', async () => {
  const input = await source.load(userId);
  const course = input.courses.find(c => c.course_key === 'self_fitness')!;
  const project = course.assessments.find(a => a.type === 'project')!;
  const scope = { from: '2026-09-07', to: '2026-09-13', course_keys: [course.course_key] };
  const title = '期末專題準備';
  const result = await generateInitialPlan(input, scope, { model: 'mock', async generate(prompt) {
    const data = JSON.parse(prompt.split('\n').at(-1)!);
    if (data.weeks) return { weeks: [{ from: scope.from, focus: [{ course_key: course.course_key, topic: title }] }] };
    if (data.previous_tasks) return { tasks: [{ ...draft, course_key: course.course_key, title, type: 'homework',
      chapters: [], assessment_id: project.id, deadline: scope.to, focus_id: data.batch_focus[0].id }] };
    assert.fail('unexpected model call');
  } });
  assert.equal(result.tasks[0].assessment_id, project.id);
});

test('request, internal and Gemini errors get distinct statuses and transient failures retry three times', async t => {
  assert.throws(() => check(false, 'invalid input'), error => errorStatus(error) === 400);
  assert.equal(errorStatus(new Error('database failure')), 500);
  const waits: number[] = [];
  t.mock.method(globalThis, 'setTimeout', (resume: () => void, delay: number) => {
    waits.push(delay);
    queueMicrotask(resume);
  });
  const service = new GeminiLlmService('test');
  for (const [kind, attempts] of [['500', 4], ['TimeoutError', 4], ['AbortError', 4], ['403', 1], ['incomplete', 1]] as const) {
    waits.length = 0;
    const stub = t.mock.method(globalThis, 'fetch', async () => {
      if (kind.endsWith('Error')) throw new DOMException('timeout', kind);
      if (kind === 'incomplete') return Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] });
      return new Response(null, { status: Number(kind) });
    });
    await assert.rejects(service.generate('test', {}), error => errorStatus(error) === 502);
    assert.equal(stub.mock.callCount(), attempts);
    assert.equal(waits.length, attempts - 1);
    waits.forEach((delay, i) => assert.ok(delay >= 1000 * 2 ** i && delay < 1000 * 2 ** i + 500));
    stub.mock.restore();
  }
});

test('checkpoint resume reuses weekly analysis and respects the later focus week', async () => {
  const input = await source.load(userId);
  const scope = { from: '2026-09-07', to: '2026-09-27', course_keys: ['self_networks'] };
  const db = new DatabaseSync(':memory:');
  const stages: string[] = [];
  let interrupted = false;
  const llm = { model: 'mock', async generate(prompt: string) {
    const data = JSON.parse(prompt.split('\n').at(-1)!);
    if (data.weeks) {
      stages.push('analysis');
      return { weeks: data.weeks.map((w: {from:string}, i:number) => ({from:w.from, focus:i === 2 ? [{ course_key:'self_networks', topic:'Ch1' }] : []})) };
    }
    if (data.previous_tasks) {
      stages.push('tasks');
      if (!interrupted) { interrupted = true; throw new Error('503'); }
      return {tasks: data.batch[0].from === '2026-09-21' ? [{...draft, focus_id:data.batch_focus[0].id, assessment_id:null}] : []};
    }
    assert.fail('unexpected model call');
  }};
  const checkpoint = checkpointRun(db, [scope,input], () => {});
  const run = () => generateInitialPlan(input, scope, llm, new Date(), checkpoint);
  try {
    await assert.rejects(run, /503/);
    const result = await run();
    assert.deepEqual(stages,['analysis','tasks','tasks']);
    assert.equal(result.tasks[0].status,'scheduled');
    assert.equal(result.tasks[0].estimate.minutes,90);
    assert.ok(result.schedule_blocks.length >= 2);
    assert.equal(result.schedule_blocks[0].task_id,result.schedule_blocks[1].task_id);
    assert.ok(!('target_week' in result.tasks[0]));
    assert.ok(result.schedule_blocks.every(b => b.date >= '2026-09-21'));
    assert.equal(result.notes.length, 2);
    const history = planHistory(db);
    history.save(result, checkpoint.completedSteps());
    assert.deepEqual(history.stages(userId, result.schedule.plan_id)?.placement_batches,
      result.notes.map((note, i) => ({ batch: i + 1, ...note })));
  } finally { db.close(); }
});

test('16 teaching weeks produce one outline, eight task batches and deterministic placement', async () => {
  const scope = { from: '2026-09-07', to: '2026-12-25', course_keys: ['self_networks'] };
  const input = await source.load(userId);
  const stages: string[] = [];
  const result = await generateInitialPlan(input, scope, {
    model: 'fixed-test',
    async generate(prompt) {
      const data = JSON.parse(prompt.split('\n').at(-1)!);
      if (data.weeks) {
        stages.push('analysis');
        return { weeks: data.weeks.map((w: { from: string }) => ({
          from: w.from, focus: [{ course_key: 'self_networks', topic: '每週閱讀' }],
        })) };
      }
      if (data.previous_tasks) {
        stages.push('tasks');
        assert.equal(data.courses[0].weekly_schedule.length, 2);
        return { tasks: data.batch.flatMap((w: {from: string; to: string}) => [40, 55, 85, 130].map(minutes => ({
          ...draft, assessment_id: null, title: w.from + ' 閱讀', focus_id: w.from + '/1', deadline: w.to,
          estimate: {base_minutes: minutes, difficulty_mult: 1, familiarity_mult: 1, speed_factor: 1},
        }))) };
      }
      assert.fail('unexpected model call');
    },
  });
  assert.deepEqual(stages, ['analysis', ...Array(8).fill('tasks')]);
  assert.equal(result.tasks.length, 64);
  assert.ok(result.tasks.every(t => t.status === 'scheduled'));
  assert.equal(result.notes.length, 8);
  const available = availableDays(input, scope);
  for (const day of available) {
    const blocks = result.schedule_blocks.filter(b => b.date === day.date);
    let end = -Infinity, total = 0;
    for (const b of blocks) {
      const start = timeMinutes(b.start_time), length = timeMinutes(b.end_time) - start;
      assert.ok(start - end >= day.break_minutes);
      assert.ok(length >= 20 && length <= day.session_minutes);
      assert.ok(day.slots.some(s => s.start_time <= b.start_time && b.end_time <= s.end_time));
      assert.ok(b.date <= result.tasks.find(t => t.task_id === b.task_id)!.deadline);
      end = start + length;
      total += length;
    }
    assert.ok(total <= day.daily_max_minutes);
  }
  assert.ok(new Set(result.schedule_blocks.map(b => b.date)).size >= 16);
  assert.equal(result.schedule_blocks[0].date, scope.from);
});

test('two topics in one course-week need separate references and can both finish early', async () => {
  const scope = { from: '2026-10-21', to: '2026-11-01', course_keys: ['self_networks'] };
  const input = await source.load(userId);
  const focuses = ['可靠傳輸', '壅塞控制'].map(topic => ({ course_key: 'self_networks', topic }));
  const make = (index: number) => ({ ...draft, title: focuses[index].topic, assessment_id: null,
    deadline: '2026-10-23', focus_id: '2026-10-26/' + (index + 1),
    estimate: {base_minutes: 30, difficulty_mult: 1, familiarity_mult: 1, speed_factor: 1} });
  let calls = 0;
  const result = await generateInitialPlan(input, scope, {model:'mock', async generate(prompt) {
    switch (++calls) {
      case 1: return { weeks: [{from:scope.from,focus:[]},{from:'2026-10-26',focus:focuses}] };
      case 2: return { tasks:[make(0),make(0)] };
      case 3:
        assert.match(prompt,/缺少對應任務：2026-10-26\/2 self_networks「壅塞控制」/);
        return {tasks:[make(0),make(1)]};
      default: assert.fail('unexpected model call');
    }
  }});
  assert.equal(calls,3);
  assert.match(result.notes[0].summary, /2 項提前預習/);
  assert.ok(result.schedule_blocks.every(b => b.date === '2026-10-23'));
  assert.equal(result.schedule_blocks.length,2);
  assert.ok(result.tasks.every(t => t.status === 'scheduled' && !('focus_id' in t)));
});

test('daily quota pauses immediately and 503 retries the same request', async () => {
  let calls=0;
  const stub=mock.method(globalThis,'fetch',async () => {
    calls++;
    if(calls===1) return new Response('Service unavailable',{status:503});
    if(calls===2) return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]});
    return new Response('RequestsPerDay',{status:429});
  });
  try {
    const messages:string[]=[];
    const service=new GeminiLlmService('test','mock',msg=>messages.push(msg));
    await service.generate('prompt',{});
    assert.match(messages[0],/503/);
    await assert.rejects(service.generate('prompt',{}),/每日配額不足/);
    assert.equal(calls,3);
  } finally { stub.mock.restore(); }
});

test('429 honors Retry-After and stops after three retries', async () => {
  const waits: number[] = [];
  const timer = mock.method(globalThis, 'setTimeout', (resume: () => void, delay: number) => {
    waits.push(delay);
    queueMicrotask(resume);
  });
  const stub = mock.method(globalThis, 'fetch', async () =>
    new Response('Rate limit', { status: 429, headers: { 'Retry-After': '120' } }));
  try {
    await assert.rejects(new GeminiLlmService('test').generate('prompt', {}), /等待 120 秒/);
    assert.equal(stub.mock.callCount(), 4);
    assert.deepEqual(waits, [120000, 120000, 120000]);
  } finally { stub.mock.restore(); timer.mock.restore(); }
});

test('Gemini adapter sends a structured prompt and reads the returned JSON', async () => {
  const mocked = mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.match(url, /\/gemini-3\.1-flash-lite:generateContent$/);
    assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'test-key');
    const payload = JSON.parse(options.body as string);
    assert.equal(payload.contents[0].parts[0].text, 'test prompt');
    assert.equal(payload.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(payload.generationConfig.responseJsonSchema, { type: 'object' });
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"tasks":[]}' }] } }] });
  });
  try {
    assert.deepEqual(await new GeminiLlmService('test-key').generate('test prompt', { type: 'object' }), { tasks: [] });
  } finally {
    mocked.mock.restore();
  }
});
