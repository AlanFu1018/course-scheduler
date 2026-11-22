import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { check, filePlanningSource, isDate, sqlitePlanningSource } from './data.ts';
import type { PlanningSource } from './data.ts';
import { GeminiLlmService, GeminiUnavailable } from './llm.ts';
import { errorStatus, RequestError } from './errors.ts';
import { generateInitialPlan, planFromDraft } from './planner.ts';
import type { DraftAction, FinalPlan } from './planner.ts';
import { generateAdjustedPlan } from './adjust.ts';
import { localParts } from './availability.ts';
import type { Trigger } from './feedback.ts';
import { checkpointRun, loadDraft } from './checkpoints.ts';
import { planHistory } from './plan-history.ts';
import { planningInputView } from './planning-input-view.ts';
import type { Scope } from './availability.ts';
import { feedbackRoutes } from './feedback-routes.ts';
import type { RouteHandler } from './feedback-routes.ts';

const viewer = (name: string) => new URL(`../viewer/${name}`, import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.css', ['app.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/planning-input.js', ['planning-input.js', 'text/javascript; charset=utf-8']],
  ['/weekly-calendar.js', ['weekly-calendar.js', 'text/javascript; charset=utf-8']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']],
  ['/icon-192.png', ['icon-192.png', 'image/png']],
  ['/icon-512.png', ['icon-512.png', 'image/png']],
]);

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function requestBody(request: IncomingMessage) {
  check(request.headers['content-type']?.split(';')[0] === 'application/json', '請使用 application/json');
  let body = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    body += chunk;
    check(body.length <= 16_384, '請求過大');
  }
  try {
    return JSON.parse(body) as { user_id?: string; scope?: Scope; action?: DraftAction; trigger?: Trigger;
      trigger_ref?: string | null; deadline?: string };
  } catch (error) {
    throw new RequestError('請求不是有效的 JSON', { cause: error });
  }
}

export function createPlanningServer(source: PlanningSource, checkpoints: DatabaseSync, extraRoutes?: RouteHandler,
  now = () => new Date()) {
  const progress = new Map<string, string>();
  const history = planHistory(checkpoints);

  function transaction<T>(work: () => T): T {
    checkpoints.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      checkpoints.exec('COMMIT');
      return result;
    } catch (error) {
      checkpoints.exec('ROLLBACK');
      throw error;
    }
  }

  function saveFinal(plan: FinalPlan, run: ReturnType<typeof checkpointRun>) {
    history.save(plan, run.completedSteps());
    run.finish();
  }

  return createServer(async (request, response) => {
    const host = request.headers.host ?? '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)
      || (request.headers.origin && request.headers.origin !== `http://${host}`)) {
      json(response, 403, { error: '只接受本機同源請求。' });
      return;
    }
    const path = request.url?.split('?')[0] ?? '';
    try {
      const asset = assets.get(path);
      if (request.method === 'GET' && asset) {
        const [name, contentType] = asset;
        const body = await readFile(viewer(name));
        response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
        response.end(body);
        return;
      }
      if (request.method === 'POST' && path === '/api/plans') {
        const body = await requestBody(request);
        check(typeof body?.user_id === 'string' && body.user_id.trim() && body.scope, '需要使用者 ID 和規劃範圍');
        if (!process.env.GEMINI_API_KEY?.trim()) {
          json(response, 503, { error: '請在 .env 設定 GEMINI_API_KEY，並重新啟動本機伺服器。' });
          return;
        }
        const id = body.user_id;
        if (progress.has(id)) {
          json(response, 409, { error: '此帳號已有規劃進行中。' });
          return;
        }
        let stage = '讀取輸入';
        const log = (message: string) => console.info(JSON.stringify({ time: new Date().toISOString(), user: id, stage, message }));
        log(`開始規劃 ${body.scope.from} 至 ${body.scope.to}`);
        progress.set(id, stage);
        try {
          const llm = new GeminiLlmService(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL?.trim() || undefined,
            message => {
              progress.set(id, `${stage} · ${message}`);
              log(message);
            });
          const input = await source.load(id);
          const run = checkpointRun(checkpoints, [5, llm.model, body.scope, input], message => {
            stage = message;
            progress.set(id, stage);
            log('開始');
          }, log);
          const result = await generateInitialPlan(input, body.scope, llm, new Date(), run);
          if ('schedule' in result) {
            transaction(() => saveFinal(result, run));
            log(`規劃完成：${result.tasks.length} 項任務、${result.schedule_blocks.length} 個時段`);
          } else {
            log(result.message);
          }
          json(response, 200, result);
        } catch (error) {
          log(`規劃中斷：${(error as Error).message}`);
          throw error;
        } finally {
          progress.delete(id);
        }
        return;
      }
      const decision = /^\/api\/plans\/drafts\/([^/]+)\/decision$/.exec(path);
      if (request.method === 'POST' && (decision || path === '/api/plans/latest/adjust')) {
        const body = await requestBody(request);
        const id = body?.user_id;
        check(typeof id === 'string' && id.trim(), '需要使用者 ID');
        if (decision) check(body.action === 'reschedule' || body.action === 'accept_pending', '無效的草稿決定');
        const saved = decision ? loadDraft(checkpoints, id, decision[1]) : null;
        if (decision && !saved) {
          json(response, 404, { error: '找不到此使用者的草稿' });
          return;
        }
        if (!decision && !history.read(id)) {
          json(response, 404, { error: '這個使用者還沒有計畫' });
          return;
        }
        if (progress.has(id)) {
          json(response, 409, { error: '此帳號已有規劃進行中。' });
          return;
        }
        progress.set(id, '讀取目前設定並重新排程');
        try {
          const input = await source.load(id);
          const reply = transaction(() => {
            const draft = saved?.draft;
            if (draft && !('previous_plan_id' in draft)) {
              const result = planFromDraft(input, draft, body.action!);
              if ('schedule' in result) saveFinal(result, saved!.run);
              return { status: 200, data: result };
            }
            const previous = history.read(id)!;
            if (draft && draft.previous_plan_id !== previous.schedule.plan_id) {
              return { status: 409, data: { error: '此草稿的原計畫已被取代，請依最新計畫重排' } };
            }
            const trigger = draft?.trigger ?? body.trigger ?? 'user_adjust';
            check(['completion_feedback', 'user_adjust', 'course_update', 'calendar_update', 'missed_tasks'].includes(trigger), '無效的重排原因');
            const trigger_ref = draft ? draft.trigger_ref : body.trigger_ref ?? null;
            check(trigger_ref === null || typeof trigger_ref === 'string', '無效的觸發來源');
            const at = now();
            const result = generateAdjustedPlan(input, previous, { ...draft, now: at, trigger, trigger_ref },
              decision ? body.action : 'reschedule');
            const plan_id = 'schedule' in result ? result.schedule.plan_id : result.draft_id;
            const run = saved?.run ?? checkpointRun(checkpoints, ['adjust', id, plan_id], () => {});
            if ('schedule' in result) saveFinal(result, run);
            else run.saveDraft({ plan_id, user_id: id, created_at: draft?.created_at ?? at.toISOString(),
              previous_plan_id: previous.schedule.plan_id, trigger, trigger_ref });
            return { status: 200, data: result };
          });
          json(response, reply.status, reply.data);
        } finally {
          progress.delete(id);
        }
        return;
      }
      const editTask = /^\/api\/tasks\/([^/]+)\/(skip|extend)$/.exec(path);
      if (request.method === 'POST' && editTask) {
        const body = await requestBody(request);
        const id = body?.user_id;
        check(typeof id === 'string' && id.trim(), '需要使用者 ID');
        const taskId = decodeURIComponent(editTask[1]);
        if (!history.read(id)?.tasks.some(t => t.task_id === taskId)) {
          json(response, 404, { error: '在最新的計畫裡找不到這個任務' });
          return;
        }
        const input = await source.load(id);
        const updated = transaction(() => {
          const plan = history.read(id)!;
          const task = plan.tasks.find(t => t.task_id === taskId);
          if (!task) return null;
          const at = now();
          const local = localParts(input.user.timezone).format(at);
          const today = local.slice(0, 10);
          if (editTask[2] === 'extend') {
            check(task.status === 'missed' && task.deadline < today, '只能延後已過期限的錯過任務');
            const course = input.courses.find(c => c.course_key === task.course_key);
            check(course && isDate(body.deadline) && today <= body.deadline && body.deadline <= course.end_date,
              '新期限須介於今天與課程結束日之間');
            task.deadline = body.deadline;
            task.status = 'pending';
          } else {
            check(task.status !== 'done', '已完成的任務不能跳過');
            task.status = 'skipped';
            for (const b of plan.schedule_blocks) {
              if (b.task_id === taskId && (b.status ?? 'planned') === 'planned' && b.date + 'T' + b.start_time >= local) b.status = 'cancelled';
            }
          }
          task.updated_at = at.toISOString();
          delete task.pending_reason;
          for (const note of plan.notes ?? []) {
            const index = note.issue_task_ids?.indexOf(taskId) ?? -1;
            if (index >= 0) {
              note.issue_task_ids!.splice(index, 1);
              note.issues.splice(index, 1);
            }
          }
          history.update(plan);
          return task;
        });
        json(response, updated ? 200 : 404, updated ?? { error: '在最新的計畫裡找不到這個任務' });
        return;
      }
      if (request.method === 'GET' && path === '/api/planning-progress') {
        const id = new URLSearchParams(request.url?.split('?')[1]).get('user_id') ?? '';
        json(response, 200, { message: progress.get(id) ?? null });
        return;
      }
      if (request.method === 'GET' && (path === '/api/plans' || path.startsWith('/api/plans/'))) {
        const id = new URLSearchParams(request.url?.split('?')[1]).get('user_id')?.trim();
        check(id, '請輸入使用者 ID');
        if (path === '/api/plans') json(response, 200, history.list(id));
        else if (path === '/api/plans/latest') json(response, 200, history.read(id));
        else {
          const route = path.slice('/api/plans/'.length);
          const result = route.endsWith('/stages')
            ? history.stages(id, route.slice(0, -'/stages'.length)) : history.read(id, route);
          json(response, result ? 200 : 404, result ?? { error: '找不到此使用者的計畫' });
        }
        return;
      }
      if (request.method === 'GET' && path === '/api/planning-input') {
        const userId = new URLSearchParams(request.url?.split('?')[1]).get('user_id')?.trim();
        check(userId, '請輸入使用者 ID');
        json(response, 200, planningInputView(await source.load(userId)));
        return;
      }
      if (extraRoutes && await extraRoutes(request, response, path)) return;
      json(response, 404, { error: '找不到頁面' });
    } catch (error) {
      if (error instanceof GeminiUnavailable) response.setHeader('Retry-After', error.retryAfter);
      json(response, errorStatus(error), { error: error instanceof Error ? error.message : '伺服器錯誤' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = process.env.PLANNING_DB_PATH ? new DatabaseSync(process.env.PLANNING_DB_PATH, { readOnly: true }) : null;
  const fixtureDir = new URL('../test/data/', import.meta.url);
  const source = db ? sqlitePlanningSource(db) : filePlanningSource({
    courses: (await readdir(fixtureDir)).filter(name => /^2_course\..+\.json$/.test(name))
      .sort().map(name => new URL(name, fixtureDir)),
    userState: new URL('3_user_state.json', fixtureDir),
  });
  const checkpoints = new DatabaseSync('.planning-checkpoints.sqlite');
  // 動態調整要寫回學習狀況，需要可寫入的連線；沒有 PLANNING_DB_PATH 時只能回報、不能保存
  const writable = process.env.PLANNING_DB_PATH ? new DatabaseSync(process.env.PLANNING_DB_PATH) : null;
  const server = createPlanningServer(source, checkpoints, feedbackRoutes(checkpoints, writable));
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, '127.0.0.1', () => {
    console.log(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
  });
  server.on('close', () => { db?.close(); checkpoints.close(); writable?.close(); });
}
