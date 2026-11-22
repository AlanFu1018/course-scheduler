import type { DatabaseSync } from 'node:sqlite';
import type { FinalPlan } from './planner.ts';

export function planHistory(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS saved_plans (
    plan_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS saved_plans_by_user ON saved_plans(user_id);
  CREATE TABLE IF NOT EXISTS saved_plan_steps (
    plan_id TEXT NOT NULL REFERENCES saved_plans(plan_id), step TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY(plan_id, step)
  );`);
  const insert = db.prepare('INSERT INTO saved_plans(plan_id,user_id,created_at,data) VALUES(?,?,?,?)');
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='latest_plans'").get()) {
    db.exec(`INSERT OR IGNORE INTO saved_plans(plan_id,user_id,created_at,data)
      SELECT json_extract(data,'$.schedule.plan_id'),user_id,json_extract(data,'$.schedule.created_at'),data
      FROM latest_plans`);
  }
  return {
    save(result: FinalPlan, steps: { step: string; data: string }[]) {
      const {plan_id, user_id, created_at} = result.schedule;
      if (result.schedule.supersedes) {
        db.prepare("UPDATE saved_plans SET data=json_set(data,'$.schedule.status','superseded') WHERE user_id=? AND plan_id=?")
          .run(user_id, result.schedule.supersedes);
      }
      insert.run(plan_id, user_id, created_at, JSON.stringify(result));
      const saveStep = db.prepare('INSERT INTO saved_plan_steps(plan_id,step,data) VALUES(?,?,?)');
      for (const { step, data } of steps) saveStep.run(plan_id, step, data);
    },
    update(result: FinalPlan) {
      db.prepare('UPDATE saved_plans SET data=? WHERE user_id=? AND plan_id=?')
        .run(JSON.stringify(result), result.schedule.user_id, result.schedule.plan_id);
    },
    read(userId: string, planId?: string): FinalPlan | null {
      const row = planId === undefined
        ? db.prepare('SELECT data FROM saved_plans WHERE user_id=? ORDER BY rowid DESC LIMIT 1').get(userId)
        : db.prepare('SELECT data FROM saved_plans WHERE user_id=? AND plan_id=?').get(userId, planId);
      return row ? JSON.parse(String(row.data)) : null;
    },
    list(userId: string) {
      return db.prepare('SELECT plan_id, created_at FROM saved_plans WHERE user_id=? ORDER BY rowid DESC').all(userId);
    },
    stages(userId: string, planId: string) {
      const result = this.read(userId, planId);
      if (!result) return null;
      const steps = db.prepare('SELECT step,data FROM saved_plan_steps WHERE plan_id=? ORDER BY rowid').all(planId);
      const tasks = new Map(result.tasks.map(task => [task.task_id, task]));
      const task_batches = [];
      const placement_batches = (result.notes ?? []).map((note, i) => ({ batch: i + 1, ...note }));
      let weekly_analysis = null;
      for (const row of steps) {
        const step = String(row.step);
        const value = JSON.parse(String(row.data));
        if (step === 'outline') weekly_analysis = value;
        if (step.startsWith('tasks-')) task_batches.push({
          batch: Number(step.slice(6)) + 1,
          tasks: value.map((record: {id: string; focus: unknown}) => ({
            task_id: record.id, focus: record.focus, task: tasks.get(record.id),
          })),
        });
      }
      return { plan_id: planId, weekly_analysis, task_batches, placement_batches };
    },
  };
}
