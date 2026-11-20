import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { check, filePlanningSource, sqlitePlanningSource } from './data.ts';
import { GeminiLlmService, GeminiUnavailable } from './llm.ts';
import { generateInitialPlan } from './planner.ts';
import { checkpointRun } from './checkpoints.ts';
import { planHistory } from './plan-history.ts';
import { planningInputView } from './planning-input-view.ts';
import type { Scope } from './availability.ts';

const viewer = (name: string) => new URL(`../viewer/${name}`, import.meta.url);
const db = process.env.PLANNING_DB_PATH ? new DatabaseSync(process.env.PLANNING_DB_PATH, { readOnly: true }) : null;
const fixtureDir = new URL('../test/data/', import.meta.url);
const source = db ? sqlitePlanningSource(db) : filePlanningSource({
  courses: (await readdir(fixtureDir)).filter(name => /^2_course\..+\.json$/.test(name))
    .sort().map(name => new URL(name, fixtureDir)),
  userState: new URL('3_user_state.json', fixtureDir),
});
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
  return JSON.parse(body) as { user_id?: string; scope?: Scope };
}

const server = createServer(async (request, response) => {
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
        const run = checkpointRun(checkpoints, [4, llm.model, body.scope, input], message => {
          stage = message;
          progress.set(id, stage);
          log('開始');
        }, log);
        const result = await generateInitialPlan(input, body.scope, llm, new Date(), run);
        checkpoints.exec('BEGIN IMMEDIATE');
        try {
          history.save(result, run.completedSteps());
          run.finish();
          checkpoints.exec('COMMIT');
        } catch (error) {
          checkpoints.exec('ROLLBACK');
          throw error;
        }
        log(`規劃完成：${result.tasks.length} 項任務、${result.schedule_blocks.length} 個時段、${result.tasks.filter(task => task.status === 'pending').length} 項待排`);
        json(response, 200, result);
      } catch (error) {
        log(`規劃中斷：${(error as Error).message}`);
        throw error;
      } finally {
        progress.delete(id);
      }
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
    json(response, 404, { error: '找不到頁面' });
  } catch (error) {
    if (error instanceof GeminiUnavailable) response.setHeader('Retry-After', error.retryAfter);
    json(response, error instanceof GeminiUnavailable ? error.status : 400, { error: (error as Error).message });
  }
});

const progress = new Map<string, string>();
const checkpoints = new DatabaseSync('.planning-checkpoints.sqlite');
const history = planHistory(checkpoints);
const port = Number(process.env.PORT ?? 3000);
server.listen(port, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
});
server.on('close', () => { db?.close(); checkpoints.close(); });
