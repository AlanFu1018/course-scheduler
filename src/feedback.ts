// 動態調整：完成回饋 → 更新學習狀況 → 判斷是否需要重新排程
// 對應模組圖下方：#1 完成紀錄與學習回饋、⑤ 學習狀況設定、使用者主觀調整、是否需要重新排程
// 規則依 doc/3_user_state.jsonc（speed、chapter_mastery）與 doc/5_tasks.jsonc（completions、auto_review）
import { isDate } from './data.ts';
import type { UserCourse } from './data.ts';
import { RequestError } from './errors.ts';

export type Completion = {
  block_id: string | null;
  completed_at: string;
  on_time: boolean;
  estimated_minutes: number;
  actual_minutes: number;
  difficulty: number;
  understanding: Record<string, number>;
  need_review: boolean;
  comment: string | null;
};

export type FeedbackTask = {
  task_id: string; user_id: string; course_key: string; assessment_id: string | null;
  type: string; title: string; chapters: string[]; deadline: string;
  estimate: { minutes: number; [key: string]: number };
  status: string; source?: string; parent_task_id?: string | null;
  completions: Completion[]; updated_at?: string; [key: string]: unknown;
};

export type Block = {
  block_id: string; task_id: string; user_id: string; date: string;
  start_time: string; end_time: string; locked?: boolean; status?: string;
};

export type Trigger = 'completion_feedback' | 'user_adjust' | 'course_update' | 'calendar_update' | 'missed_tasks';
export type RescheduleDecision = { needed: boolean; trigger: Trigger; trigger_ref: string | null; reasons: string[] };

// 估時偏差超過這個範圍才算「估錯」，需要重排
export const ESTIMATE_TOLERANCE = { low: 0.75, high: 1.33 };
// 理解程度 ≤ 這個值就標記需要複習
export const REVIEW_LEVEL = 2;
// 移動平均的權重：新樣本占 30%，避免一次異常就大幅改變
const SPEED_ALPHA = 0.3;
// 同一類型樣本數 ≥ 3 才用該類型的速度，否則用整體速度（3_user_state 註解）
const TYPE_SAMPLES = 3;

const DIFFICULTY_MULT = [0.8, 0.9, 1.0, 1.1, 1.2];
const MASTERY_MULT = [1.3, 1.2, 1.0, 0.9, 0.8];
const REVIEW_BASE_MINUTES = 30;

const level = (value: unknown) => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;

// ---------------------------------------------------------------------------
// 1. 完成紀錄
// ---------------------------------------------------------------------------

export function parseCompletion(task: FeedbackTask, body: Record<string, unknown>, now: Date): Completion {
  const actual = body.actual_minutes;
  if (!(Number.isInteger(actual) && (actual as number) > 0 && (actual as number) <= 24 * 60)) {
    throw new RequestError('actual_minutes 必須是 1–1440 的整數');
  }
  if (!level(body.difficulty)) throw new RequestError('difficulty 必須是 1–5 的整數');
  let understanding = body.understanding as Record<string, number> | number | undefined;
  if (typeof understanding === 'number') understanding = { _all: understanding };
  if (!understanding || typeof understanding !== 'object' || !Object.keys(understanding).length) {
    throw new RequestError('understanding 必須是 1–5，或 { 章節: 1–5 }');
  }
  for (const [chapter, value] of Object.entries(understanding)) {
    if (chapter !== '_all' && !task.chapters.includes(chapter)) throw new RequestError(`這個任務不包含章節 ${chapter}`);
    if (!level(value)) throw new RequestError(`${chapter} 的理解程度必須是 1–5 的整數`);
  }
  const completedAt = typeof body.completed_at === 'string' ? body.completed_at : now.toISOString();
  if (!Number.isFinite(Date.parse(completedAt))) throw new RequestError('completed_at 格式錯誤');
  const comment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim().slice(0, 1000) : null;
  return {
    block_id: typeof body.block_id === 'string' ? body.block_id : null,
    completed_at: completedAt,
    // 以台灣日期判斷是否在期限內完成
    on_time: localDate(completedAt) <= task.deadline,
    // 回報當下的預估時間快照：之後重排改掉 estimate，速度仍用這個值計算
    estimated_minutes: task.estimate.minutes,
    actual_minutes: actual as number,
    difficulty: body.difficulty as number,
    understanding,
    need_review: body.need_review === true,
    comment,
  };
}

export function localDate(iso: string, timeZone = 'Asia/Taipei') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso));
}

/** 把回報寫進任務與時段；逐段回報時，所有時段都完成才算任務完成 */
export function applyCompletion(task: FeedbackTask, blocks: Block[], completion: Completion, now: Date) {
  if (['done', 'skipped', 'superseded'].includes(task.status)) {
    throw new RequestError(`這個任務目前是 ${task.status}，不能再回報完成`);
  }
  const mine = blocks.filter(block => block.task_id === task.task_id);
  if (completion.block_id && !mine.some(block => block.block_id === completion.block_id)) {
    throw new RequestError(`時段 ${completion.block_id} 不屬於這個任務`);
  }
  const updatedBlocks = blocks.map(block => {
    if (block.task_id !== task.task_id) return block;
    if (completion.block_id === null || block.block_id === completion.block_id) return { ...block, status: 'done' };
    return block;
  });
  const allDone = updatedBlocks.filter(block => block.task_id === task.task_id).every(block => block.status === 'done');
  const updatedTask: FeedbackTask = {
    ...task,
    status: completion.block_id === null || allDone ? 'done' : task.status,
    completions: [...task.completions, completion],
    updated_at: now.toISOString(),
  };
  return { task: updatedTask, blocks: updatedBlocks };
}

// ---------------------------------------------------------------------------
// 2. 用回報更新學習狀況（3_user_state 的 user_courses）
// ---------------------------------------------------------------------------

type Speed = { factor: number; samples: number };

/**
 * 實際 ÷ 預估 > 1 代表讀得比預估慢。預估已經乘過舊的速度係數，
 * 所以這次觀察到的係數是「舊係數 × 比值」，再用移動平均併入。
 */
export function nextSpeed(speed: Speed, estimated: number, actual: number): Speed {
  const ratio = Math.min(2.5, Math.max(0.4, actual / estimated));
  const observed = speed.factor * ratio;
  const factor = speed.samples === 0 ? observed : speed.factor * (1 - SPEED_ALPHA) + observed * SPEED_ALPHA;
  return { factor: Math.round(Math.min(3, Math.max(0.3, factor)) * 100) / 100, samples: speed.samples + 1 };
}

/** 熟悉度用新舊平均，避免一次回報就大起大落；理解度低或自己勾選就標記需要複習 */
export function updateUserCourse(state: UserCourse & Record<string, unknown>, task: FeedbackTask, completion: Completion,
  now: Date) {
  const next = structuredClone(state) as UserCourse & Record<string, unknown>;
  const stamp = now.toISOString();
  next.speed.default = nextSpeed(next.speed.default, completion.estimated_minutes, completion.actual_minutes);
  const byType = next.speed.by_task_type[task.type] ?? { factor: state.speed.default.factor, samples: 0 };
  next.speed.by_task_type[task.type] = nextSpeed(byType, completion.estimated_minutes, completion.actual_minutes);

  const scores: Record<string, number> = '_all' in completion.understanding
    ? Object.fromEntries(task.chapters.map(chapter => [chapter, completion.understanding._all]))
    : completion.understanding;
  const flagged: string[] = [];
  for (const [chapter, score] of Object.entries(scores)) {
    const old = next.chapter_mastery[chapter] as { level: number; need_review: boolean; updated_at?: string } | undefined;
    const levelNow = old ? Math.round((old.level + score) / 2) : score;
    const needReview = completion.need_review || score <= REVIEW_LEVEL;
    if (needReview) flagged.push(chapter);
    next.chapter_mastery[chapter] = { level: levelNow, need_review: needReview, updated_at: stamp } as never;
  }
  next.updated_at = stamp;
  return { state: next, review_chapters: flagged };
}

/** 依目前的熟悉度與速度估複習時間（公式與 5_tasks 相同，四捨五入到 5 分） */
export function reviewEstimate(state: UserCourse, chapters: string[]) {
  const levels = chapters.map(chapter => state.chapter_mastery[chapter]?.level ?? state.familiarity);
  const worst = Math.min(...levels);
  const typeSpeed = state.speed.by_task_type.review;
  const speed = typeSpeed && typeSpeed.samples >= TYPE_SAMPLES ? typeSpeed.factor : state.speed.default.factor;
  const base = REVIEW_BASE_MINUTES * chapters.length;
  const difficulty = DIFFICULTY_MULT[state.difficulty - 1];
  const familiarity = MASTERY_MULT[worst - 1];
  const minutes = Math.max(15, Math.round(base * difficulty * familiarity * speed / 5) * 5);
  return { base_minutes: base, difficulty_mult: difficulty, familiarity_mult: familiarity, speed_factor: speed, minutes };
}

/** 需要複習的章節 → 自動加一個 auto_review 任務，狀態 pending，等下次排程排進時段 */
export function reviewTask(parent: FeedbackTask, state: UserCourse, chapters: string[], deadline: string,
  taskId: string, now: Date) {
  const scores = chapters.map(chapter => `${chapter} ${state.chapter_mastery[chapter]?.level ?? '?'}/5`).join('、');
  const stamp = now.toISOString();
  return {
    schema_version: '1.5',
    task_id: taskId,
    user_id: parent.user_id,
    plan_id: (parent.plan_id as string | undefined) ?? null,
    course_key: parent.course_key,
    assessment_id: parent.assessment_id,
    type: 'review',
    phase: 'practice',
    title: `${chapters.join('、')} 複習`,
    chapters,
    estimate: reviewEstimate(state, chapters),
    deadline,
    priority: Math.min(1, Number(parent.priority ?? 0.5) + 0.1),
    reason: `「${parent.title}」回報理解程度 ${scores}，加排複習`,
    source: 'auto_review',
    parent_task_id: parent.task_id,
    status: 'pending',
    completions: [],
    created_at: stamp,
    updated_at: stamp,
  };
}

/** 複習的期限：原任務期限還沒到就沿用，過了就給一週，都不超過課程結束日 */
export function reviewDeadline(parent: FeedbackTask, today: string, courseEnd: string) {
  const week = new Date(Date.parse(today + 'T00:00:00Z') + 7 * 86_400_000).toISOString().slice(0, 10);
  const deadline = parent.deadline > today ? parent.deadline : week;
  return deadline > courseEnd ? courseEnd : deadline;
}

// ---------------------------------------------------------------------------
// 3. 錯過的時段
// ---------------------------------------------------------------------------

/** 時段結束時間已過、還是 planned → 標成 missed；任務本身沒完成也沒其他未來時段 → 任務標 missed */
export function markMissed(tasks: FeedbackTask[], blocks: Block[], now: Date, timeZone = 'Asia/Taipei') {
  const nowLocal = localDate(now.toISOString(), timeZone) + ' ' + new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const missedBlocks: string[] = [];
  const updatedBlocks = blocks.map(block => {
    if ((block.status ?? 'planned') === 'planned' && `${block.date} ${block.end_time}` <= nowLocal) {
      missedBlocks.push(block.block_id);
      return { ...block, status: 'missed' };
    }
    return block;
  });
  const missedTasks: string[] = [];
  const updatedTasks = tasks.map(task => {
    if (task.status !== 'scheduled') return task;
    const own = updatedBlocks.filter(block => block.task_id === task.task_id);
    if (own.some(block => block.status === 'missed') && !own.some(block => (block.status ?? 'planned') === 'planned')) {
      missedTasks.push(task.task_id);
      return { ...task, status: 'missed' };
    }
    return task;
  });
  return { tasks: updatedTasks, blocks: updatedBlocks, missed_blocks: missedBlocks, missed_tasks: missedTasks };
}

// ---------------------------------------------------------------------------
// 4. 是否需要重新排程
// ---------------------------------------------------------------------------

export function afterCompletion(task: FeedbackTask, completion: Completion, reviewChapters: string[]): RescheduleDecision {
  const reasons: string[] = [];
  const ratio = completion.actual_minutes / completion.estimated_minutes;
  if (ratio > ESTIMATE_TOLERANCE.high) {
    reasons.push(`實際 ${completion.actual_minutes} 分，比預估 ${completion.estimated_minutes} 分多 ${Math.round((ratio - 1) * 100)}%，之後的估時要加長`);
  } else if (ratio < ESTIMATE_TOLERANCE.low) {
    reasons.push(`實際 ${completion.actual_minutes} 分，比預估 ${completion.estimated_minutes} 分少 ${Math.round((1 - ratio) * 100)}%，可以釋出時間`);
  }
  if (reviewChapters.length) reasons.push(`${reviewChapters.join('、')} 需要複習，加排複習任務`);
  if (!completion.on_time) reasons.push('超過期限才完成，後面的進度可能受影響');
  return { needed: reasons.length > 0, trigger: 'completion_feedback', trigger_ref: task.task_id, reasons };
}

export function afterMissed(missedTasks: string[], missedBlocks: string[]): RescheduleDecision {
  const reasons = missedBlocks.length ? [`有 ${missedBlocks.length} 個時段過了沒有回報，${missedTasks.length} 個任務需要重新安排`] : [];
  return { needed: missedBlocks.length > 0, trigger: 'missed_tasks', trigger_ref: missedTasks[0] ?? null, reasons };
}

/** 使用者主觀調整：只有影響估時或可用時間的欄位才需要重排 */
export function afterUserAdjust(before: Record<string, unknown>, after: Record<string, unknown>, ref: string | null): RescheduleDecision {
  const watched: Record<string, string> = {
    familiarity: '熟悉度', difficulty: '難度', target_grade: '目標成績', active: '是否修這門課',
    availability: '可讀書時間', date_overrides: '單日時間調整', calendar_sources: '匯入的行事曆',
  };
  const reasons = Object.entries(watched)
    .filter(([key]) => key in after && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(([, label]) => `${label}改變`);
  return { needed: reasons.length > 0, trigger: 'user_adjust', trigger_ref: ref, reasons };
}

/** 課程評量日期或範圍改變（2_course 被修改）也要重排 */
export function afterCourseUpdate(courseKey: string, before: { id: string; date: { value: string }; scope: { value: string[] } }[],
  after: typeof before): RescheduleDecision {
  const old = new Map(before.map(a => [a.id, a]));
  const reasons: string[] = [];
  for (const a of after) {
    const prev = old.get(a.id);
    if (!prev) reasons.push(`新增評量 ${a.id}`);
    else if (prev.date.value !== a.date.value) reasons.push(`${a.id} 日期 ${prev.date.value} → ${a.date.value}`);
    else if (JSON.stringify(prev.scope.value) !== JSON.stringify(a.scope.value)) reasons.push(`${a.id} 範圍改變`);
    old.delete(a.id);
  }
  for (const id of old.keys()) reasons.push(`刪除評量 ${id}`);
  return { needed: reasons.length > 0, trigger: 'course_update', trigger_ref: courseKey, reasons };
}

/**
 * 重排時要交給排程的範圍（4_schedule 的重排規則）：
 *   從今天開始；done / skipped / superseded 的任務不動；locked 的時段原樣保留
 */
export function rescheduleScope(tasks: FeedbackTask[], blocks: Block[], today: string, to: string) {
  if (!isDate(today) || !isDate(to)) throw new RequestError('重排日期格式錯誤');
  const keepLocked = blocks.filter(block => block.locked && (block.status ?? 'planned') === 'planned' && block.date >= today);
  const lockedTasks = new Set(keepLocked.map(block => block.task_id));
  const carry = tasks.filter(task => ['pending', 'scheduled', 'missed'].includes(task.status) && !lockedTasks.has(task.task_id));
  return {
    scope: { from: today, to, course_keys: [] as string[] },
    carry_task_ids: carry.map(task => task.task_id),
    locked_block_ids: keepLocked.map(block => block.block_id),
  };
}
