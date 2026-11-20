import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { mock, test } from 'node:test';
import { availableDays } from '../src/availability.ts';
import { check, filePlanningSource, parsePlanningJson, readPlanningFile, sqlitePlanningSource } from '../src/data.ts';
import { errorStatus } from '../src/errors.ts';
import type { PlanningInput } from '../src/data.ts';
import { GeminiLlmService } from '../src/llm.ts';
import type { LlmService } from '../src/llm.ts';
import { checkpointRun } from '../src/checkpoints.ts';
import { generateInitialPlan } from '../src/planner.ts';
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
    return { summary: title, blocks: [] };
  } });
  assert.equal(result.tasks[0].assessment_id, project.id);
});

test('fallback saves complete placements and drops a partially placed task at its deadline', async () => {
  const scope = { from: '2026-09-07', to: '2026-09-13', course_keys: [draft.course_key] };
  const input = await source.load(userId);
  let blocks: unknown;
  let proposal: object;
  const result = await generateInitialPlan(input, scope, { model: 'mock', async generate(prompt) {
    if (proposal) return proposal;
    const data = JSON.parse(prompt.split('\n').at(-1)!);
    if (data.weeks) return { weeks: [{ from: scope.from, focus: ['partial', 'complete'].map(topic => ({
      course_key: draft.course_key, topic,
    })) }] };
    if (data.previous_tasks) return { tasks: data.batch_focus.map((f: {id: string; topic: string}) => ({
      ...draft, title: f.topic, focus_id: f.id, assessment_id: null, deadline: scope.to,
      estimate: { base_minutes: f.topic === 'partial' ? 90 : 30, difficulty_mult: 1, familiarity_mult: 1, speed_factor: 1 },
    })) };
    proposal = { summary: 'placement', blocks: data.tasks.map((t: {task_id: string; title: string}) => ({
      task_id: t.task_id, date: scope.from, start_time: t.title === 'partial' ? '19:00' : '20:00', option: 1, segment: 1,
    })) };
    return proposal;
  } }, new Date(), { progress() {}, async step(name, compute) {
    const value = await compute();
    if (name === 'blocks-0') blocks = (value as { blocks: unknown }).blocks;
    return value;
  } });
  const complete = result.tasks.find(t => t.title === 'complete')!;
  assert.deepEqual(blocks, [{ task_id: complete.task_id, date: scope.from, start_time: '20:00', end_time: '20:30' }]);
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

test('weekly analysis then all task batches, cross-batch placement and checkpoint resume', async () => {
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
      return {tasks: data.batch[0].from === '2026-09-21' ? [{...draft, focus_id:data.batch_focus[0].id, assessment_id:null}] : []};
    }
    const task = data.tasks[0];
    if (data.batch[0].from === '2026-09-07') {
      stages.push('early placement');
      assert.equal(task.remaining_minutes,90);
      return {summary:'提前安排', blocks:[{ task_id:task.task_id,date:'2026-09-18',start_time:'15:00',option:1,segment:1}]};
    }
    stages.push('late placement');
    assert.equal(data.prior_blocks.length,1);
    assert.equal(task.remaining_minutes,40);
    if (!interrupted) { interrupted = true; throw new Error('503'); }
    assert.deepEqual(task.split_options[0].minutes, [40]);
    return {summary:'完成', blocks:[{ task_id:task.task_id,date:'2026-09-21',start_time:'19:00',option:1,segment:1}]};
  }};
  const run = () => generateInitialPlan(input, scope, llm, new Date(), checkpointRun(db, [scope,input], () => {}));
  try {
    await assert.rejects(run, /503/);
    const result = await run();
    assert.deepEqual(stages,['analysis','tasks','early placement','late placement','late placement']);
    assert.equal(result.tasks[0].status,'scheduled');
    assert.equal(result.tasks[0].estimate.minutes,90);
    assert.equal(result.schedule_blocks.length,2);
    assert.equal(result.schedule_blocks[0].task_id,result.schedule_blocks[1].task_id);
    assert.ok(!('target_week' in result.tasks[0]));
  } finally { db.close(); }
});

test('invalid and incomplete model placements stay pending without backend rescheduling', async () => {
  const input = await source.load(userId);
  const scope = { from:'2026-09-07',to:'2026-09-13',course_keys:['self_networks'] };
  let calls=0;
  const result=await generateInitialPlan(input,scope,{model:'mock',async generate(prompt) {
    calls++;
    if(calls===1) return {weeks:[{from:scope.from,focus:[{course_key:'self_networks',topic:'閱讀'}]}]};
    if(calls===2) return {tasks:[{...draft,assessment_id:null,focus_id:scope.from+'/1'}]};
    if(calls===3) {
      const {tasks}=JSON.parse(prompt.split('\n').at(-1)!);
      return {summary:'超長',blocks:[{task_id:tasks[0].task_id,date:scope.from,start_time:'19:00',end_time:'20:30'}]};
    }
    assert.match(prompt,/分段方案編號/);
    return {summary:'無法排入',blocks:[]};
  }});
  assert.equal(calls,4);
  assert.equal(result.tasks[0].status,'pending');
  assert.deepEqual(result.schedule_blocks,[]);
});

test('16 teaching weeks produce one outline, eight task batches then eight placement batches', async () => {
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
        return { tasks: data.batch.map((w: {from: string; to: string}) => ({
          ...draft, assessment_id: null, title: w.from + ' 閱讀', focus_id: w.from + '/1', deadline: w.to,
          estimate: {base_minutes: 40, difficulty_mult: 1, familiarity_mult: 1, speed_factor: 1},
        })) };
      }
      stages.push('placement');
      return { summary: '本週預習', blocks: data.tasks.filter((t: {target_week: string}) =>
        data.batch.some((w: {from: string}) => w.from === t.target_week)).map((t: {task_id: string; target_week: string}) => ({
          task_id: t.task_id, date: t.target_week, start_time: '19:00', option:1, segment:1,
        })) };
    },
  });
  assert.deepEqual(stages, ['analysis', ...Array(8).fill('tasks'), ...Array(8).fill('placement')]);
  assert.equal(result.schedule_blocks.length, 16);
  assert.equal(new Set(result.schedule_blocks.map(b => b.date)).size, 16);
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
      default: {
        const {tasks}=JSON.parse(prompt.split('\n').at(-1)!);
        return {summary:'提前完成', blocks:tasks.map((t: {task_id:string}, i:number) => ({
          task_id:t.task_id, date:scope.from, start_time:i?'20:00':'19:00',option:1,segment:1,
        }))};
      }
    }
  }});
  assert.equal(calls,4);
  assert.equal(result.schedule_blocks.length,2);
  assert.ok(result.tasks.every(t => t.status === 'scheduled' && !('focus_id' in t)));
});

test('rebalances a 55-minute task instead of keeping a five-minute fragment', async () => {
  const scope = { from: '2026-09-07', to: '2026-09-13', course_keys: ['self_networks'] };
  const input = await source.load(userId);
  let calls = 0;
  let id = '';
  const block = (start_time: string, segment: number) => ({ task_id: id, date: scope.from, start_time, option: 2, segment });
  const result = await generateInitialPlan(input, scope, { model: 'mock', async generate(prompt) {
    switch (++calls) {
      case 1: return { weeks: [{ from: scope.from, focus: [{ course_key: 'self_networks', topic: '閱讀' }] }] };
      case 2: return { tasks: [{ ...draft, assessment_id: null, focus_id: scope.from + '/1',
        estimate: { base_minutes: 55, difficulty_mult: 1, familiarity_mult: 1, speed_factor: 1 } }] };
      case 3: {
        const task = JSON.parse(prompt.split('\n').at(-1)!).tasks[0];
        id = task.task_id;
        assert.deepEqual(task.split_options[1].minutes, [30, 25]);
        return { summary: '初排', blocks: [block('19:00',1), block('20:00',1)] };
      }
      default:
        assert.match(prompt, /分段序號無效或重複/);
        return { summary: '重新分段', blocks: [block('19:00',1), block('19:40',2)] };
    }
  } });
  assert.equal(calls, 4);
  assert.equal(result.tasks[0].status, 'scheduled');
  assert.deepEqual(result.schedule_blocks.map(b => b.end_time), ['19:30', '20:05']);
});

test('110-minute task can use three legal segments with model-selected starts', async () => {
  const scope = { from: '2026-09-07', to: '2026-09-13', course_keys: ['self_networks'] };
  const input = await source.load(userId);
  const result = await generateInitialPlan(input, scope, { model: 'mock', async generate(prompt) {
    const data = JSON.parse(prompt.split('\n').at(-1)!);
    if (data.weeks) return { weeks: [{ from: scope.from, focus: [{ course_key: 'self_networks', topic: '閱讀' }] }] };
    if (data.previous_tasks) return { tasks: [{ ...draft, assessment_id: null, focus_id: data.batch_focus[0].id,
      estimate: { base_minutes: 110, difficulty_mult: 1, familiarity_mult: 1, speed_factor: 1 } }] };
    const task = data.tasks[0];
    assert.deepEqual(task.split_options.slice(0, 2).map((o: { minutes: number[] }) => o.minutes),
      [[50, 40, 20], [40, 35, 35]]);
    return { summary: '週一閱讀', blocks: ['19:00', '20:00', '21:00'].map((start_time, i) => ({
      task_id: task.task_id, option: 2, segment: i + 1, date: scope.from, start_time,
    })) };
  } });
  assert.equal(result.tasks[0].status, 'scheduled');
  assert.deepEqual(result.schedule_blocks.map(b => b.end_time), ['19:40', '20:35', '21:35']);
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
