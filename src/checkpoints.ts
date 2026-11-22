import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { AdjustmentRef, PlanDraft, PlanningRun } from './planner.ts';

type AdjustDraft = Pick<PlanDraft, 'plan_id' | 'user_id' | 'created_at'> & AdjustmentRef;

function ensureDraftTable(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS plan_drafts (
    draft_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, run TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
  )`);
}

export function loadDraft(db: DatabaseSync, userId: string, draftId: string) {
  ensureDraftTable(db);
  const row = db.prepare('SELECT run,data FROM plan_drafts WHERE user_id=? AND draft_id=?').get(userId, draftId);
  if (!row) return null;
  return { draft: JSON.parse(String(row.data)) as PlanDraft | AdjustDraft, run: keyedRun(db, String(row.run), () => {}) };
}

export function checkpointRun(db: DatabaseSync, inputs: unknown, progress: PlanningRun['progress'], log?: PlanningRun['log']) {
  const key = createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
  ensureDraftTable(db);
  return keyedRun(db, key, progress, log);
}

function keyedRun(db: DatabaseSync, key: string, progress: PlanningRun['progress'], log?: PlanningRun['log']) {
  db.exec('CREATE TABLE IF NOT EXISTS planning_steps (run TEXT, step TEXT, data TEXT NOT NULL, PRIMARY KEY(run, step))');
  return {
    progress,
    log,
    async step<T>(name: string, compute: () => Promise<T>): Promise<T> {
      const saved = db.prepare('SELECT data FROM planning_steps WHERE run=? AND step=?').get(key, name);
      if (saved) {
        log?.(`沿用已保存的進度（${name}）`);
        return JSON.parse(String(saved.data));
      }
      const value = await compute();
      db.prepare('INSERT INTO planning_steps VALUES (?, ?, ?)').run(key, name, JSON.stringify(value));
      return value;
    },
    saveDraft(draft: PlanDraft | AdjustDraft) {
      db.prepare('INSERT INTO plan_drafts VALUES(?,?,?,?,?) ON CONFLICT(draft_id) DO UPDATE SET data=excluded.data')
        .run(draft.plan_id, draft.user_id, key, draft.created_at, JSON.stringify(draft));
    },
    finish() {
      db.prepare('DELETE FROM plan_drafts WHERE run=?').run(key);
      db.prepare('DELETE FROM planning_steps WHERE run=?').run(key);
    },
    completedSteps() {
      return db.prepare("SELECT step,data FROM planning_steps WHERE run=? AND step!='identity' ORDER BY rowid").all(key)
        .map(row => ({ step: String(row.step), data: String(row.data) }));
    },
  };
}
