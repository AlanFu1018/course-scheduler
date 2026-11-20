import { setCalendarCourses } from './weekly-calendar.js';

const weekdays = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
const taskTypes = {
  reading: '閱讀', notes: '筆記', examples: '例題', past_exam: '歷屆試題', mock_exam: '模擬考',
  error_review: '錯題檢討', final_review: '考前總複習', homework: '作業', review: '複習',
};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function list(items, empty) {
  if (!items.length) return element('p', empty, 'muted');
  const node = element('ul');
  node.append(...items.map(item => element('li', item)));
  return node;
}

const timeRange = slot => `${slot.start_time}–${slot.end_time}`;
const byWeekAndTime = (a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time);
const formatSpeed = speed => speed ? `${speed.factor} 倍（${speed.samples} 筆）` : '尚未設定';

function learningTime(data) {
  const section = element('section', undefined, 'input-card');
  section.append(element('h3', '可讀時間與排程限制'), element('p', `時區 ${data.timezone}`, 'muted'));
  if (!data.availability.length) section.append(element('p', '尚未設定每週可讀時段'));
  for (const rule of data.availability) {
    section.append(
      element('h4', `${rule.valid_from} 至 ${rule.valid_to}`),
      element('p', `每日上限 ${rule.daily_max_minutes} 分鐘 · 單次 ${rule.session_minutes} 分鐘 · 休息 ${rule.break_minutes} 分鐘 · 考前保留 ${rule.exam_buffer_days} 天`),
      list([...rule.weekly_slots].sort(byWeekAndTime).map(slot => `${weekdays[slot.weekday - 1]}　${timeRange(slot)}`), '沒有每週可讀時段'),
    );
  }
  section.append(element('h4', '日期例外'), list([...data.date_overrides]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(override => `${override.date}　${override.slots.length ? override.slots.map(timeRange).join('、') : '整天不可排'}`), '沒有日期例外'));
  return section;
}

function courseSettings(courses) {
  const section = element('section', undefined, 'input-card');
  section.append(element('h3', '各課學習參數'));
  if (!courses.length) section.append(element('p', '沒有課程', 'muted'));
  for (const course of courses) {
    const { settings } = course;
    const row = element('details', undefined, 'course-settings');
    row.append(element('summary', settings ? `${course.name} · ${settings.active ? '啟用' : '停用'}` : course.name));
    if (settings) {
      row.append(
        element('p', `熟悉度 ${settings.familiarity}/5 · 難度 ${settings.difficulty}/5 · 目標成績 ${settings.target_grade}`),
        element('p', `整體學習速度 ${formatSpeed(settings.speed.default)}`),
        element('h4', '各任務類型速度'),
        list(settings.speed.by_task_type.map(speed => `${taskTypes[speed.type] ?? speed.type}　${formatSpeed(speed)}`), '沒有任務類型速度紀錄'),
        element('h4', '章節掌握度'),
        list(settings.chapter_mastery.map(chapter => `${chapter.title}　${chapter.level}/5${chapter.need_review ? '（需複習）' : ''}`), '尚未記錄章節掌握度'),
      );
    } else {
      row.append(element('p', '尚未設定學習參數'));
    }
    section.append(row);
  }
  return section;
}

const userField = document.querySelector('#planner').elements.namedItem('user_id');
const status = document.querySelector('#input-status');
const content = document.querySelector('#input-content');
let activeRequest;
const form = userField.form;
const options = document.querySelector('#course-options');
let loadedCourses = null;
let excluded = new Set();
const preferenceKey = () => 'course-scheduler.excluded.' + userField.value.trim();

function showCourseOptions() {
  options.replaceChildren();
  const from = form.elements.namedItem('from').value;
  const to = form.elements.namedItem('to').value;
  const courses = loadedCourses?.filter(course => course.settings?.active &&
    (!from || course.end_date >= from) && (!to || course.start_date <= to));
  if (!courses?.length) {
    options.textContent = loadedCourses ? '這段期間沒有可規劃的課程。' : '請先載入使用者資料。';
    return;
  }
  for (const course of courses) {
    const label = element('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.name = 'course_key';
    box.value = course.course_key;
    box.checked = !excluded.has(course.course_key);
    label.append(box, course.name);
    options.append(label);
  }
}

options.addEventListener('change', event => {
  const box = event.target;
  if (box.checked) excluded.delete(box.value);
  else excluded.add(box.value);
  try { localStorage.setItem(preferenceKey(), JSON.stringify([...excluded])); } catch { /* Browser storage is optional. */ }
});
for (const name of ['from', 'to']) form.elements.namedItem(name).addEventListener('input', showCourseOptions);

function clearInputView() {
  activeRequest?.abort();
  activeRequest = undefined;
  content.replaceChildren();
  content.hidden = true;
  setCalendarCourses([]);
  loadedCourses = null;
  showCourseOptions();
}

async function loadInput() {
  clearInputView();
  const userId = userField.value.trim();
  if (!userId) {
    status.textContent = '請輸入使用者 ID';
    return;
  }
  const request = new AbortController();
  activeRequest = request;
  status.textContent = '正在載入課表與學習設定…';
  try {
    const query = new URLSearchParams({ user_id: userId });
    const response = await fetch(`/api/planning-input?${query}`, { signal: request.signal });
    const data = await response.json();
    if (request !== activeRequest || userField.value.trim() !== userId) return;
    if (!response.ok) throw new Error(data.error);
    setCalendarCourses(data.courses);
    loadedCourses = data.courses;
    try { excluded = new Set(JSON.parse(localStorage.getItem(preferenceKey()) ?? '[]')); }
    catch { excluded = new Set(); }
    showCourseOptions();
    content.replaceChildren(learningTime(data), courseSettings(data.courses));
    content.hidden = false;
    status.textContent = `${data.user_id} · ${data.courses.length} 門課`;
  } catch (error) {
    if (request === activeRequest && userField.value.trim() === userId) status.textContent = error.message;
  } finally {
    if (request === activeRequest) activeRequest = undefined;
  }
}

userField.addEventListener('input', () => {
  clearInputView();
  status.textContent = '按「載入資料」查看此使用者的課表與設定。';
});
document.querySelector('#load-input').addEventListener('click', loadInput);
loadInput();

