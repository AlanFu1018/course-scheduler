import { setCalendarPlan } from './weekly-calendar.js';

const form = document.querySelector('#planner');
const result = document.querySelector('#result');
const status = document.querySelector('#status');
const userField = form.elements.namedItem('user_id');
const submit = form.querySelector('button[type="submit"]');
let accountRevision = 0;
let viewRevision = 0;
try {
  userField.value = sessionStorage.getItem('course-scheduler.current-user') || userField.value;
} catch { /* The default account also works without tab storage. */ }

userField.addEventListener('input', () => {
  accountRevision++;
  viewRevision++;
  result.hidden = true;
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

function showPlan(plan) {
  renderSummary(plan);
  renderList('#tasks', plan.tasks.map(task => [
    task.title,
    `${task.status === 'scheduled' ? '已排' : '待排'} · ${task.estimate.minutes} 分鐘 · 截止 ${task.deadline}\n${task.reason}`,
    task.course_key,
  ]), '沒有學習任務');
  setCalendarPlan(plan);
  result.hidden = false;
}

async function restorePlan() {
  const id = userField.value.trim();
  try { sessionStorage.setItem('course-scheduler.current-user', id); } catch { /* Optional tab storage. */ }
  if (!id || submit.disabled) return;
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
    status.textContent = '已產生計畫';
  } catch (error) {
    if (revision === accountRevision) status.textContent = error.message;
  } finally {
    finished = true;
    clearInterval(timer);
    submit.disabled = false;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
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

