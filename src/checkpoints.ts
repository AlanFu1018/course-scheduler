import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { PlanningRun } from './planner.ts';

export function checkpointRun(db: DatabaseSync, inputs: unknown, progress: PlanningRun['progress'], log?: PlanningRun['log']) {
  const key = createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
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
    finish() { db.prepare('DELETE FROM planning_steps WHERE run=?').run(key); },
    completedSteps() {
      return db.prepare("SELECT step,data FROM planning_steps WHERE run=? AND step!='identity' ORDER BY rowid").all(key)
        .map(row => ({ step: String(row.step), data: String(row.data) }));
    },
  };
}
