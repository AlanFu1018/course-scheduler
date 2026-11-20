import { setCalendarPlan } from './weekly-calendar.js';

const form = document.querySelector('#planner');
const result = document.querySelector('#result');
const status = document.querySelector('#status');
const userField = form.elements.namedItem('user_id');
const submit = form.querySelector('button[type="submit"]');
const decisionPanel = document.querySelector('#decision');
const decisionButtons = decisionPanel.querySelectorAll('button[data-action]');
let draftId = null;
let accountRevision = 0;
let viewRevision = 0;
try {
  userField.value = sessionStorage.getItem('course-scheduler.current-user') || userField.value;
} catch { /* The default account also works without tab storage. */ }

userField.addEventListener('input', () => {
  accountRevision++;
  viewRevision++;
  result.hidden = true;
  draftId = null;
  setCalendarPlan(null);
  status.textContent = '尚未產生計畫';
});
userField.addEventListener('change', restorePlan);
document.querySelector('#load-input').addEventListener('click', restorePlan);

function renderList(selector, entries, emptyMessage) {
  const list = document.querySelector(selector);
  list.replaceChildren(...(entries.length ? entries : [[emptyMessage, '']]).map(([title, detail, courseKey]) => {
    const item = document.createElement('li');
    const heading = document.createElement('strong');
    heading.textContent = title;
    item.append(heading);
    if (courseKey) {
      const course = document.createElement('span');
      course.className = 'course-chip task-course';
      course.dataset.taskCourse = courseKey;
      item.append(course);
    }
    if (detail) {
      const body = document.createElement('p');
      body.textContent = detail;
      item.append(body);
    }
    return item;
  }));
}

const shortDate = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderSummary(plan) {
  const container = document.querySelector('#summary');
  const notes = plan.notes;
  if (!Array.isArray(notes)) {
    // 舊版計畫沒有分段摘要，直接顯示原文。
    container.replaceChildren(element('p', plan.schedule.summary, 'summary-text'));
    return;
  }
  const items = notes.map(note => {
    const item = element('li', undefined, 'summary-period');
    item.append(element('strong', `${shortDate(note.from)}～${shortDate(note.to)}`), element('p', note.summary));
    if (note.issues.length) {
      const details = element('details', undefined, 'summary-issues');
      details.append(element('summary', `有 ${note.issues.length} 項任務未排入`));
      const list = element('ul');
      list.append(...note.issues.map(issue => element('li', issue)));
      details.append(list);
      item.append(details);
    }
    return item;
  });
  const pending = plan.tasks.filter(task => task.status !== 'scheduled');
  const children = [element('ol', undefined, 'summary-periods')];
  children[0].append(...items);
  if (!items.length) children[0].append(element('li', plan.schedule.summary));
  if (pending.length) {
    const details = element('details', undefined, 'summary-pending');
    details.append(element('summary', `${pending.length} 項任務未能完整排入，保留為待排`));
    const list = element('ul');
    list.append(...pending.map(task => element('li', `${task.title}（截止 ${shortDate(task.deadline)}，${task.estimate.minutes} 分鐘）`)));
    details.append(list);
    children.push(details);
  }
  container.replaceChildren(...children);
}

function copyableRule(rule, title) {
  const details = element('details');
  const json = JSON.stringify(rule, null, 2);
  const copy = element('button', '複製規則');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(json); copy.textContent = '已複製'; }
    catch { copy.textContent = '請選取規則文字複製'; }
  });
  details.append(element('summary', title), element('pre', json), copy);
  return details;
}

function lowerTargets(courses) {
  const list = element('ul');
  list.append(...courses.map(c => element('li', `${c.name}（目標 ${c.target_grade} 分，任務共 ${c.minutes} 分鐘）`)));
  return [element('h4', '降低目標成績'), list, element('p', '調整目標成績後，請重新產生計畫（會重新呼叫 Gemini）。')];
}

function renderDecision(plan) {
  const range = i => `${shortDate(i.from)}～${shortDate(i.to)}`;
  const numbers = i => `需要 ${i.required_minutes} 分鐘，可用 ${i.available_minutes} 分鐘，還差 ${i.missing_minutes} 分鐘`;
  function intervalDetails(i) {
    const rows = [element('p', range(i) + ' · ' + numbers(i)),
      element('p', '涉及課程：' + i.courses.map(c => c.name).join('、'))];
    if (i.reason) {
      const titles = plan.tasks.filter(t => i.task_ids.includes(t.task_id)).map(t => t.title);
      rows.push(element('p', i.reason + '：' + titles.join('、')));
    }
    return rows;
  }
  document.querySelector('#decision-message').textContent = plan.message;
  const sections = document.querySelector('#decision-sections');
  sections.replaceChildren();
  if (plan.overall) {
    const overall = plan.overall;
    const block = element('section');
    block.append(element('h3', '整體時間不足'), element('p', '整個規劃期間 · ' + numbers(overall)));
    for (const i of overall.intervals) block.append(...intervalDetails(i));
    const adjust = overall.suggestions.adjust_regular_time;
    block.append(element('h4', '調整平常的可用時間'),
      element('p', `每週需增加 ${adjust.weekly_extra_minutes} 分鐘的可用時間。`),
      element('p', adjust.raise_daily_max_to === null ? '請擴充每週時段，並確認每日上限足夠。'
        : `沿用現有時段時，將平常規則的每日上限至少提高到 ${adjust.raise_daily_max_to} 分鐘。`),
      element('p', '修改學習設定中原本的時段規則，保留各規則的有效日期。'),
      copyableRule(adjust.availability_rule, '平常時段規則 JSON'), ...lowerTargets(overall.suggestions.lower_target));
    sections.append(block);
  }
  for (const i of plan.short_term) {
    const block = element('section');
    block.append(element('h3', '短期時間不足'), ...intervalDetails(i), element('h4', '加開非常時期時段'));
    const { add_time, extend_exam_buffer, lower_target } = i.suggestions;
    if (add_time) {
      block.append(element('p', add_time.raise_daily_max_to === null
        ? `每日上限設為 ${add_time.availability_rule.daily_max_minutes} 分鐘，並在每個可用日增加 ${add_time.extra_minutes_per_day} 分鐘的時段。`
        : `將每日上限提高至 ${add_time.raise_daily_max_to} 分鐘。`),
      element('p', '請在學習設定中新增這條規則。'), copyableRule(add_time.availability_rule, '非常時期規則 JSON'));
    } else {
      block.append(element('p', '現有日期限制或行事曆無法加開足夠時段。請確認設定或調整規劃範圍。'));
    }
    if (extend_exam_buffer) block.append(element('h4', '提早開始準備'),
      element('p', `將考前保留天數從 ${extend_exam_buffer.current_days} 天延長到 ${extend_exam_buffer.suggested_days} 天。`));
    block.append(...lowerTargets(lower_target));
    sections.append(block);
  }
}

function showPlan(plan) {
  draftId = plan.status === 'needs_decision' ? plan.draft_id : null;
  decisionPanel.hidden = !draftId;
  document.querySelector('#result .summary').hidden = Boolean(draftId);
  if (draftId) renderDecision(plan);
  else renderSummary(plan);
  renderList('#tasks', plan.tasks.map(task => [
    task.title,
    `${task.status === 'scheduled' ? '已排' : '待排'} · ${task.estimate.minutes} 分鐘 · 截止 ${task.deadline}\n${task.pending_reason ?? task.reason}`,
    task.course_key,
  ]), '沒有學習任務');
  setCalendarPlan(plan);
  result.hidden = false;
}

async function restorePlan() {
  const id = userField.value.trim();
  try { sessionStorage.setItem('course-scheduler.current-user', id); } catch { /* Optional tab storage. */ }
  if (!id || submit.disabled || draftId) return;
  const revision = ++viewRevision;
  try {
    const response = await fetch('/api/plans/latest?' + new URLSearchParams({ user_id: id }));
    const plan = await response.json();
    if (revision !== viewRevision || id !== userField.value.trim()) return;
    if (!response.ok) throw new Error(plan.error);
    if (!plan) return;
    form.elements.namedItem('from').value = plan.schedule.scope.from;
    form.elements.namedItem('to').value = plan.schedule.scope.to;
    form.elements.namedItem('from').dispatchEvent(new Event('input'));
    showPlan(plan);
    status.textContent = '已載入上次產生的計畫';
  } catch (error) {
    if (revision === viewRevision) status.textContent = `無法載入上次計畫：${error.message}`;
  }
}

async function generatePlan(user_id, from, to, course_keys) {
  const revision = accountRevision;
  viewRevision++;
  submit.disabled = true;
  result.hidden = true;
  setCalendarPlan(null);
  status.textContent = '正在產生計畫…';
  let polling = false;
  let finished = false;
  const timer = setInterval(async () => {
    if (polling || finished || revision !== accountRevision) return;
    polling = true;
    try {
      const response = await fetch('/api/planning-progress?' + new URLSearchParams({ user_id }));
      const { message } = await response.json();
      if (!finished && revision === accountRevision && message) status.textContent = message;
    } catch { /* The plan request reports its own connection status. */ }
    finally { polling = false; }
  }, 1000);
  try {
    const response = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, scope: { from, to, course_keys } }),
    });
    const plan = await response.json();
    if (revision !== accountRevision) return;
    if (!response.ok) throw new Error(plan.error);
    showPlan(plan);
    status.textContent = draftId ? '時間不足，請選擇下一步' : '已產生計畫';
  } catch (error) {
    if (revision === accountRevision) {
      status.textContent = error.message;
      if (draftId) result.hidden = false;
    }
  } finally {
    finished = true;
    clearInterval(timer);
    submit.disabled = false;
  }
}

async function decide(action) {
  if (!draftId || submit.disabled) return;
  const revision = ++viewRevision;
  submit.disabled = true;
  decisionButtons.forEach(button => { button.disabled = true; });
  status.textContent = '正在依目前設定重新排程…';
  try {
    const response = await fetch(`/api/plans/drafts/${encodeURIComponent(draftId)}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userField.value.trim(), action }),
    });
    const plan = await response.json();
    if (revision !== viewRevision) return;
    if (!response.ok) throw new Error(plan.error);
    showPlan(plan);
    status.textContent = draftId ? '仍有時間不足的區間，請查看更新後的建議' : '已儲存計畫';
  } catch (error) {
    if (revision === viewRevision) status.textContent = error.message;
  } finally {
    submit.disabled = false;
    decisionButtons.forEach(button => { button.disabled = false; });
  }
}
decisionButtons.forEach(button => button.addEventListener('click', () => decide(button.dataset.action)));

form.addEventListener('submit', event => {
  event.preventDefault();
  if (submit.disabled) return;
  const data = new FormData(form);
  const { user_id, from, to } = Object.fromEntries(data);
  const keys = data.getAll('course_key');
  if (!keys.length) {
    status.textContent = '請先載入課程，並至少勾選一門要安排自習的課程。';
    return;
  }
  const allSelected = keys.length === form.querySelectorAll('input[name="course_key"]').length;
  generatePlan(user_id.trim(), from, to, allSelected ? [] : keys);
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Service worker:', error));
}
restorePlan();

