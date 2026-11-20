const weekdays = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
const dayMs = 86_400_000;
const hourHeight = 60;
const courseHues = [216, 153, 25, 276, 350, 179, 52, 310, 116, 244, 4, 193];

function shift(date, days) {
  return new Date(Date.parse(date) + days * dayMs).toISOString().slice(0, 10);
}

export function monday(date) {
  return shift(date, -((new Date(date).getUTCDay() + 6) % 7));
}

function minutes(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function weekEntries(start, courses, plan) {
  const tasks = new Map(plan?.tasks.map(task => [task.task_id, task]));
  const names = new Map(courses.map(course => [course.course_key, course.name]));
  return weekdays.map((weekday, index) => {
    const date = shift(start, index);
    const classes = courses.filter(course => course.start_date <= date && date <= course.end_date)
      .flatMap(course => course.sessions.filter(slot => slot.weekday === index + 1).map(slot => ({
        ...slot, kind: 'class', courseKey: course.course_key,
        label: course.settings?.active === false ? `${course.name}（停用）` : course.name,
        detail: [slot.room, course.instructor].filter(Boolean).join(' · '),
      })));
    const studies = (plan?.schedule_blocks ?? []).filter(block => block.date === date && block.status !== 'cancelled')
      .map(block => {
        const task = tasks.get(block.task_id);
        return {
          ...block, kind: 'study', courseKey: task?.course_key, label: task?.title ?? '學習任務',
          detail: [names.get(task?.course_key) ?? task?.course_key, task?.reason].filter(Boolean).join(' · '),
        };
      });
    const entries = [...classes, ...studies]
      .map(entry => ({ ...entry, start: minutes(entry.start_time), end: minutes(entry.end_time) }))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    return { date, weekday, entries };
  });
}

function lanes(entries) {
  const positioned = [];
  let group = [];
  let ends = [];
  const flush = () => positioned.push(...group.map(entry => ({ ...entry, columns: ends.length })));
  for (const entry of entries) {
    if (group.length && ends.every(end => end <= entry.start)) {
      flush();
      group = [];
      ends = [];
    }
    const free = ends.findIndex(end => end <= entry.start);
    const lane = free === -1 ? ends.length : free;
    ends[lane] = entry.end;
    group.push({ ...entry, lane });
  }
  flush();
  return positioned;
}

const grid = globalThis.document?.querySelector('#calendar-grid');
const fromField = grid && document.querySelector('#planner').elements.namedItem('from');
let start = fromField ? monday(fromField.value) : null;
let courses = [];
let plan = null;

function node(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function render() {
  if (!grid || !start) return;
  const days = weekEntries(start, courses, plan);
  const names = new Map(courses.map(course => [course.course_key, course.name]));
  for (const task of plan?.tasks ?? []) {
    if (!names.has(task.course_key)) names.set(task.course_key, task.course_key);
  }
  const keys = [...names.keys()].sort();
  const hues = new Map(keys.map((key, index) => [key, courseHues[index] ?? ((index * 137.508) % 360)]));
  const color = (node, key) => node.style.setProperty('--course-hue', hues.get(key) ?? 215);
  document.querySelector('#course-legend').replaceChildren(...keys.map(key => {
    const item = node('span', names.get(key), 'course-chip');
    color(item, key);
    return item;
  }));
  for (const item of document.querySelectorAll('[data-task-course]')) {
    item.textContent = names.get(item.dataset.taskCourse) ?? item.dataset.taskCourse;
    color(item, item.dataset.taskCourse);
  }
  document.querySelector('#calendar-range').textContent = `${start} 至 ${days[6].date}`;
  const entries = days.flatMap(day => day.entries);
  const firstHour = entries.reduce((hour, entry) => Math.min(hour, Math.floor(entry.start / 60)), 8);
  const lastHour = entries.reduce((hour, entry) => Math.max(hour, Math.ceil(entry.end / 60)), 22);
  const height = (lastHour - firstHour) * hourHeight;
  const calendar = node('div', undefined, 'week-calendar');
  calendar.style.setProperty('--calendar-hour', `${hourHeight}px`);
  calendar.append(node('div', '時間', 'calendar-header'));
  for (const day of days) calendar.append(node('div', `${day.weekday} ${day.date.slice(5).replace('-', '/')}`, 'calendar-header'));
  const times = node('div', undefined, 'calendar-times');
  for (let hour = firstHour; hour < lastHour; hour++) {
    times.append(node('div', `${String(hour).padStart(2, '0')}:00`, 'calendar-hour'));
  }
  calendar.append(times);
  for (const day of days) {
    const column = node('div', undefined, 'calendar-day');
    column.setAttribute('role', 'group');
    column.setAttribute('aria-label', `${day.weekday} ${day.date}`);
    column.style.height = `${height}px`;
    for (const entry of lanes(day.entries)) {
      const card = node('div', undefined, `calendar-event ${entry.kind}-event`);
      color(card, entry.courseKey);
      const time = `${entry.start_time}–${entry.end_time}`;
      card.title = [entry.kind === 'class' ? '上課' : '學習任務', entry.label, time, entry.detail].filter(Boolean).join('\n');
      card.style.top = `${(entry.start / 60 - firstHour) * hourHeight}px`;
      card.style.height = `${(entry.end - entry.start) / 60 * hourHeight}px`;
      card.style.left = `calc(${100 * entry.lane / entry.columns}% + 2px)`;
      card.style.width = `calc(${100 / entry.columns}% - 4px)`;
      card.append(node('strong', entry.label), node('span', time));
      if (entry.kind === 'class' && entry.detail && entry.end - entry.start >= 45) card.append(node('span', entry.detail));
      column.append(card);
    }
    calendar.append(column);
  }
  grid.replaceChildren(calendar);
}

export function setCalendarCourses(value) {
  courses = value;
  render();
}

export function setCalendarPlan(value) {
  plan = value;
  if (value) start = monday(value.schedule.scope.from);
  render();
}

if (grid) {
  const selectStart = () => {
    if (!fromField.value) return;
    start = monday(fromField.value);
    render();
  };
  fromField.addEventListener('change', selectStart);
  document.querySelector('#selected-week').addEventListener('click', selectStart);
  document.querySelector('#previous-week').addEventListener('click', () => { start = shift(start, -7); render(); });
  document.querySelector('#next-week').addEventListener('click', () => { start = shift(start, 7); render(); });
  render();
}
