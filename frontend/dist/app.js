const STORAGE_KEY = "ncu-study-planner-prototype-v4";
const VIEW_MODE_KEY = "ncu-study-planner-view-mode";
const desktopMedia = window.matchMedia("(min-width: 900px)");
const storedViewPreference = localStorage.getItem(VIEW_MODE_KEY);
let viewPreference = ["desktop", "mobile"].includes(storedViewPreference)
  ? storedViewPreference
  : (desktopMedia.matches ? "desktop" : "mobile");
localStorage.setItem(VIEW_MODE_KEY, viewPreference);

function resolvedViewMode() {
  return viewPreference;
}

function applyViewMode() {
  document.documentElement.dataset.viewMode = resolvedViewMode();
}

applyViewMode();

const COURSE_CATALOG = [
  { id: "calculus-a", subjectId: "calculus", name: "微積分", category: "required", code: "MA1001-A", teacher: "黃老師", meetings: [{ day: "mon", periods: ["1", "2"] }, { day: "wed", periods: ["5"] }] },
  { id: "calculus-b", subjectId: "calculus", name: "微積分", category: "required", code: "MA1001-B", teacher: "周老師", meetings: [{ day: "wed", periods: ["6", "7"] }, { day: "fri", periods: ["5"] }] },
  { id: "calculus-c", subjectId: "calculus", name: "微積分", category: "required", code: "MA1001-C", teacher: "黃老師", meetings: [{ day: "tue", periods: ["3", "4"] }, { day: "thu", periods: ["5"] }] },
  { id: "physics-a", subjectId: "physics", name: "普通物理", category: "required", code: "PH1001-A", teacher: "張老師", meetings: [{ day: "tue", periods: ["1", "2"] }, { day: "thu", periods: ["3"] }] },
  { id: "physics-b", subjectId: "physics", name: "普通物理", category: "required", code: "PH1001-B", teacher: "林老師", meetings: [{ day: "mon", periods: ["6", "7"] }, { day: "wed", periods: ["4"] }] },
  { id: "physics-c", subjectId: "physics", name: "普通物理", category: "required", code: "PH1001-C", teacher: "張老師", meetings: [{ day: "wed", periods: ["1", "2"] }, { day: "fri", periods: ["3"] }] },
  { id: "intro-cs-a", subjectId: "intro-cs", name: "計算機概論", category: "required", code: "CS1001-A", teacher: "林老師", meetings: [{ day: "mon", periods: ["3", "4"] }, { day: "thu", periods: ["2"] }] },
  { id: "intro-cs-b", subjectId: "intro-cs", name: "計算機概論", category: "required", code: "CS1001-B", teacher: "吳老師", meetings: [{ day: "tue", periods: ["6", "7"] }, { day: "fri", periods: ["2"] }] },
  { id: "data-structures-a", subjectId: "data-structures", name: "資料結構", category: "required", code: "CS2001-A", teacher: "王老師", meetings: [{ day: "tue", periods: ["3", "4"] }, { day: "thu", periods: ["3"] }] },
  { id: "data-structures-b", subjectId: "data-structures", name: "資料結構", category: "required", code: "CS2001-B", teacher: "陳老師", meetings: [{ day: "wed", periods: ["6", "7"] }, { day: "fri", periods: ["4"] }] },
  { id: "discrete-math-a", subjectId: "discrete-math", name: "離散數學", category: "required", code: "CS2003-A", teacher: "陳老師", meetings: [{ day: "mon", periods: ["5", "6"] }, { day: "wed", periods: ["3"] }] },
  { id: "discrete-math-b", subjectId: "discrete-math", name: "離散數學", category: "required", code: "CS2003-B", teacher: "李老師", meetings: [{ day: "tue", periods: ["7", "8"] }, { day: "thu", periods: ["4"] }] },
  { id: "ee-circuits-a", subjectId: "ee-circuits", name: "電路學 I", category: "required", code: "EE2001-A", teacher: "陳老師", meetings: [{ day: "mon", periods: ["1", "2"] }, { day: "thu", periods: ["5"] }] },
  { id: "ee-circuits-b", subjectId: "ee-circuits", name: "電路學 I", category: "required", code: "EE2001-B", teacher: "林老師", meetings: [{ day: "tue", periods: ["3", "4"] }, { day: "fri", periods: ["2"] }] },
  { id: "ee-circuits-c", subjectId: "ee-circuits", name: "電路學 I", category: "required", code: "EE2001-C", teacher: "吳老師", meetings: [{ day: "wed", periods: ["6", "7"] }, { day: "fri", periods: ["5"] }] },
  { id: "ee-electronics-a", subjectId: "ee-electronics", name: "電子學 I", category: "required", code: "EE2003-A", teacher: "李老師", meetings: [{ day: "tue", periods: ["1", "2"] }, { day: "thu", periods: ["4"] }] },
  { id: "ee-electronics-b", subjectId: "ee-electronics", name: "電子學 I", category: "required", code: "EE2003-B", teacher: "王老師", meetings: [{ day: "mon", periods: ["6", "7"] }, { day: "wed", periods: ["3"] }] },
  { id: "ee-electronics-c", subjectId: "ee-electronics", name: "電子學 I", category: "required", code: "EE2003-C", teacher: "許老師", meetings: [{ day: "wed", periods: ["1", "2"] }, { day: "fri", periods: ["3"] }] },
  { id: "ee-engineering-math-a", subjectId: "ee-engineering-math", name: "工程數學 I", category: "required", code: "EE2005-A", teacher: "張老師", meetings: [{ day: "mon", periods: ["3", "4"] }, { day: "thu", periods: ["2"] }] },
  { id: "ee-engineering-math-b", subjectId: "ee-engineering-math", name: "工程數學 I", category: "required", code: "EE2005-B", teacher: "劉老師", meetings: [{ day: "tue", periods: ["6", "7"] }, { day: "fri", periods: ["1"] }] },
  { id: "ee-engineering-math-c", subjectId: "ee-engineering-math", name: "工程數學 I", category: "required", code: "EE2005-C", teacher: "周老師", meetings: [{ day: "wed", periods: ["3", "4"] }, { day: "fri", periods: ["6"] }] },
  { id: "ee-electromagnetics-a", subjectId: "ee-electromagnetics", name: "電磁學 I", category: "required", code: "EE3001-A", teacher: "黃老師", meetings: [{ day: "mon", periods: ["5", "6"] }, { day: "wed", periods: ["2"] }] },
  { id: "ee-electromagnetics-b", subjectId: "ee-electromagnetics", name: "電磁學 I", category: "required", code: "EE3001-B", teacher: "鄭老師", meetings: [{ day: "tue", periods: ["8", "9"] }, { day: "thu", periods: ["3"] }] },
  { id: "ee-electromagnetics-c", subjectId: "ee-electromagnetics", name: "電磁學 I", category: "required", code: "EE3001-C", teacher: "蔡老師", meetings: [{ day: "wed", periods: ["5", "6"] }, { day: "fri", periods: ["4"] }] },
  { id: "ee-signals-a", subjectId: "ee-signals", name: "訊號與系統", category: "required", code: "EE3003-A", teacher: "楊老師", meetings: [{ day: "tue", periods: ["5", "6"] }, { day: "thu", periods: ["1"] }] },
  { id: "ee-signals-b", subjectId: "ee-signals", name: "訊號與系統", category: "required", code: "EE3003-B", teacher: "何老師", meetings: [{ day: "mon", periods: ["8", "9"] }, { day: "wed", periods: ["4"] }] },
  { id: "ee-signals-c", subjectId: "ee-signals", name: "訊號與系統", category: "required", code: "EE3003-C", teacher: "郭老師", meetings: [{ day: "thu", periods: ["6", "7"] }, { day: "fri", periods: ["3"] }] },
  { id: "economics", subjectId: "economics", name: "經濟學", category: "general", code: "GE1001", teacher: "張李治華老師", meetings: [{ day: "fri", periods: ["6", "7"] }] },
  { id: "generative-ai", subjectId: "generative-ai", name: "生成式 AI", category: "general", code: "GE2001", teacher: "韓伯維老師", meetings: [{ day: "tue", periods: ["8", "9", "A"] }] },
  { id: "psychology", subjectId: "psychology", name: "心理學概論", category: "general", code: "GE2101", teacher: "葉老師", meetings: [{ day: "mon", periods: ["6", "7"] }] },
  { id: "music-appreciation", subjectId: "music-appreciation", name: "音樂欣賞", category: "general", code: "GE2103", teacher: "蘇老師", meetings: [{ day: "wed", periods: ["8", "9"] }] },
  { id: "technology-society", subjectId: "technology-society", name: "科技與社會", category: "general", code: "GE2201", teacher: "杜老師", meetings: [{ day: "thu", periods: ["5", "6"] }] },
  { id: "sustainability", subjectId: "sustainability", name: "環境永續", category: "general", code: "GE2203", teacher: "賴老師", meetings: [{ day: "tue", periods: ["3", "4"] }] },
  { id: "everyday-law", subjectId: "everyday-law", name: "日常生活法律", category: "general", code: "GE2301", teacher: "范老師", meetings: [{ day: "fri", periods: ["3", "4"] }] },
  { id: "creative-design", subjectId: "creative-design", name: "創意思考與設計", category: "general", code: "GE2303", teacher: "游老師", meetings: [{ day: "mon", periods: ["8", "9"] }] },
  { id: "astronomy", subjectId: "astronomy", name: "天文學導論", category: "general", code: "GE2401", teacher: "孫老師", meetings: [{ day: "thu", periods: ["8", "9"] }] },
  { id: "global-culture", subjectId: "global-culture", name: "全球文化與溝通", category: "general", code: "GE2403", teacher: "羅老師", meetings: [{ day: "wed", periods: ["5", "6"] }] },
];

const FALLBACK_DEMO_SECTION_IDS = [
  "calculus-a",
  "physics-a",
  "intro-cs-a",
  "data-structures-b",
  "discrete-math-a",
  "economics",
  "generative-ai",
];

const DAYS = [
  ["mon", "一"], ["tue", "二"], ["wed", "三"],
  ["thu", "四"], ["fri", "五"], ["sat", "六"],
];

const DAY_SEQUENCE = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = { sun: "日", mon: "一", tue: "二", wed: "三", thu: "四", fri: "五", sat: "六" };

function dateForOffset(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function dateInputValue(date = dateForOffset()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function planRangeDetails(range = state?.planRange) {
  const start = parseDateInput(range?.startDate);
  const end = parseDateInput(range?.endDate);
  if (!start || !end) return { valid: false, days: 0, label: "請選擇完整的開始與結束日期" };
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days < 1) return { valid: false, days: 0, label: "結束日期不能早於開始日期" };
  return {
    valid: true,
    days,
    label: `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}－${end.getFullYear()}/${end.getMonth() + 1}/${end.getDate()}，共 ${days} 天`,
  };
}

function dayKeyForDate(date) {
  return DAY_SEQUENCE[date.getDay()];
}

function currentDayKey() {
  return dayKeyForDate(dateForOffset());
}

function shortDateLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}（${DAY_LABELS[dayKeyForDate(date)]}）`;
}

function fullDateLabel(date = dateForOffset()) {
  return `${date.getMonth() + 1}月${date.getDate()}日・星期${DAY_LABELS[dayKeyForDate(date)]}`;
}

function currentWeekDays() {
  const today = dateForOffset();
  const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + mondayOffset + index);
    return { day: dayKeyForDate(date), label: DAY_LABELS[dayKeyForDate(date)], date, short: `${date.getMonth() + 1}/${date.getDate()}` };
  });
}

function dateLabelForDay(day) {
  const match = currentWeekDays().find(item => item.day === day);
  return match ? shortDateLabel(match.date) : shortDateLabel(dateForOffset());
}

const PERIODS = [
  ["1", "08:00–08:50"], ["2", "09:00–09:50"], ["3", "10:00–10:50"],
  ["4", "11:00–11:50"], ["Z", "12:00–12:50"], ["5", "13:00–13:50"],
  ["6", "14:00–14:50"], ["7", "15:00–15:50"], ["8", "16:00–16:50"],
  ["9", "17:00–17:50"], ["A", "18:00–18:50"], ["B", "19:00–19:50"],
  ["C", "20:00–20:50"], ["D", "21:00–21:50"], ["E", "22:00–22:50"],
  ["F", "23:00–23:50"],
];

function logicalStageForSetupStep(step) {
  if (step === 0) return 1;
  if (step === 1) return 2;
  if (step === 4 || step === 2 || step === 3) return 3;
  if (step === 5) return 4;
  return 1;
}

const defaultState = {
  route: "today",
  setupStep: 0,
  highestSetupStage: 1,
  setupComplete: false,
  usedImportedData: false,
  profile: { nickname: "", school: "", department: "", grade: "" },
  schoolConnected: false,
  timetable: {},
  activeCell: "",
  pendingSectionId: "",
  coursePreferences: {},
  globalStudySettings: {
    sessionMinutes: "45",
    dailyLimitMinutes: "120",
    bufferDays: "7",
  },
  planRange: {
    startDate: dateInputValue(dateForOffset()),
    endDate: dateInputValue(dateForOffset(13)),
  },
  courseSupplements: {},
  supplementCourseId: "",
  supplementUploadError: "",
  lastDemoSignature: "",
  course: {
    name: "資料結構",
    teacher: "王老師",
    classTime: "週二 10:00–12:00",
    syllabus: "第 9 週舉行期中考，占總成績 30%，範圍為第一章至第五章。每兩週安排一次作業。",
  },
  assessment: {
    title: "期中考",
    week: "第 9 週",
    weight: "30%",
    coverage: "第一章至第五章",
    confidence: "課綱明確記載",
  },
  availability: ["週一晚上", "週三晚上", "週六上午"],
  familiarity: "不熟悉",
  dailyLimit: "2 小時",
  tasks: [
    { id: 1, day: "thu", dateLabel: "11/19（四）", time: "19:00–19:45", courseId: "data-structures-b", course: "資料結構", title: "閱讀第一、二章", type: "review", source: "課綱範圍與熟悉度", duration: 45, estimatedMinutes: 45, actualMinutes: null, dueDate: "11/26 期中評量前", priority: "high", rationale: "期中評量占比較高，先建立章節概念。", status: "pending", done: false },
    { id: 2, day: "thu", dateLabel: "11/19（四）", time: "20:00–21:00", courseId: "data-structures-b", course: "資料結構", title: "完成第三章練習題", type: "practice", source: "難度與目標成績", duration: 60, estimatedMinutes: 60, actualMinutes: null, dueDate: "11/26 期中評量前", priority: "high", rationale: "課程難度較高，需要練習題確認理解。", status: "pending", done: false },
    { id: 3, day: "thu", dateLabel: "11/19（四）", time: "21:10–21:40", courseId: "discrete-math-a", course: "離散數學", title: "複習命題邏輯", type: "review", source: "熟悉度與空堂", duration: 30, estimatedMinutes: 30, actualMinutes: null, dueDate: "本週結束前", priority: "normal", rationale: "利用晚間短時段進行記憶型複習。", status: "pending", done: false },
  ],
  replanCount: 0,
  planWeekPage: 0,
  calendarDay: "thu",
  replanReason: "臨時有事",
  reviewRange: "week",
  activeCourseId: "",
  planRevisions: [],
  pendingReplan: null,
  analysis: null,
  analysisStatus: "idle",
  toast: "",
};

function normalizeTask(task, index) {
  const isDone = task.done || task.status === "done";
  return {
    day: currentDayKey(),
    dateLabel: dateLabelForDay(task.day || currentDayKey()),
    courseId: "",
    type: "review",
    source: "課綱與學習設定",
    estimatedMinutes: task.duration || 45,
    actualMinutes: null,
    dueDate: "本週結束前",
    priority: index < 2 ? "high" : "normal",
    rationale: "依課程優先度與可用時段安排。",
    status: task.done ? "done" : "pending",
    ...task,
    dateLabel: dateLabelForDay(task.day || currentDayKey()),
    completionProgress: isDone ? 100 : Number(task.completionProgress) || 0,
  };
}

function migrateLegacyTaskDates(tasks = []) {
  const hasLegacyDates = tasks.some(task => /^11\/(19|20|21)/.test(String(task.dateLabel || "")) || /^11\/(19|20|21)/.test(String(task.date || "")) || /^11\/(19|20|21)/.test(String(task.dateLabel || "").replace("月", "/")));
  const hasLegacyChineseDate = tasks.some(task => /^11\/(19|20|21)|^11月(19|20|21)/.test(String(task.dateLabel || "")));
  if (!hasLegacyDates && !hasLegacyChineseDate) return tasks;
  const offsets = [0, 0, 0, 1, 2];
  return tasks.map((task, index) => {
    const date = dateForOffset(offsets[index] ?? Math.min(index, 2));
    return { ...task, day: dayKeyForDate(date), dateLabel: shortDateLabel(date) };
  });
}

function loadState() {
  try {
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const loaded = { ...structuredClone(defaultState), ...persisted };
    if (!persisted.globalStudySettings) {
      const previousPreference = Object.values(persisted.coursePreferences || {})[0] || {};
      loaded.globalStudySettings = {
        sessionMinutes: String(previousPreference.sessionMinutes || "45"),
        dailyLimitMinutes: String(previousPreference.dailyLimitMinutes || "120"),
        bufferDays: String(previousPreference.bufferDays || "7"),
      };
    }
    loaded.tasks = migrateLegacyTaskDates(loaded.tasks || []).map(normalizeTask);
    loaded.planRevisions ||= [];
    loaded.highestSetupStage = Math.max(loaded.highestSetupStage || 1, loaded.setupComplete ? 4 : logicalStageForSetupStep(loaded.setupStep));
    return loaded;
  } catch {
    return structuredClone(defaultState);
  }
}

let state = loadState();
const app = document.querySelector("#app");

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setState(patch) {
  state = { ...state, ...patch };
  save();
  render();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;",
  })[character]);
}

function viewSwitcher() {
  const mode = resolvedViewMode();
  return `<div class="view-switcher" aria-label="版面模式"><button type="button" class="view-mode-btn ${mode === "desktop" ? "active" : ""}" data-view-mode="desktop" aria-pressed="${mode === "desktop"}">網頁版</button><button type="button" class="view-mode-btn ${mode === "mobile" ? "active" : ""}" data-view-mode="mobile" aria-pressed="${mode === "mobile"}">手機版</button></div>`;
}

function topbar(title, action = "") {
  const settings = state.setupComplete ? `<button type="button" class="topbar-settings" data-action="open-settings" aria-label="開啟設定">設定</button>` : "";
  return `<header class="topbar"><div class="topbar-title"><div class="brand">NCU AI 智慧讀書規劃器</div>${title ? `<div class="small muted">${title}</div>` : ""}</div><div class="topbar-actions">${action}${settings}${viewSwitcher()}</div></header>`;
}

function nav() {
  if (!state.setupComplete) return "";
  const items = [
    ["today", "今日"], ["calendar", "計畫"], ["courses", "課程"], ["progress", "進度"],
  ];
  return `<nav class="nav" aria-label="主要導覽">${items.map(([route, label]) => `<button class="nav-btn ${state.route === route ? "active" : ""}" data-nav="${route}">${label}</button>`).join("")}</nav>`;
}

function setupSidebar() {
  if (state.setupComplete) return "";
  const current = logicalStageForSetupStep(state.setupStep);
  const steps = [
    [1, 0, "基本資料", "學校與年級"],
    [2, 1, "建立課表", "課程與固定行程"],
    [3, 4, "學習狀況", "共用與各科條件"],
    [4, 5, "設定完成", "確認規劃輸入"],
  ];
  return `<aside class="setup-sidebar"><div class="sidebar-brand"><strong>NCU AI</strong><span>智慧讀書規劃器</span></div><div class="sidebar-label">設定流程</div><nav class="setup-steps" aria-label="設定流程">${steps.map(([stage, target, label, description]) => {
    const locked = stage > state.highestSetupStage;
    const active = stage === current;
    return `<button type="button" class="setup-step ${active ? "active" : ""} ${stage < current || (!locked && !active) ? "complete" : ""}" data-action="goto-setup-step" data-setup-target="${target}" data-stage="${stage}" ${locked ? "disabled" : ""} ${active ? `aria-current="step"` : ""}><span class="setup-step-number">${stage}</span><span><strong>${label}</strong><small>${description}</small></span></button>`;
  }).join("")}</nav><div class="sidebar-note">已完成的步驟可以返回修改，尚未完成的步驟會保持鎖定。</div></aside>`;
}

function dashboardSidebar() {
  if (!state.setupComplete) return "";
  const nickname = state.profile.nickname || "中央學生";
  const schoolAndGrade = `${state.profile.school === "ncu" ? "國立中央大學" : "其他學校"}${state.profile.grade ? `・${state.profile.grade}` : ""}`;
  const items = [
    ["today", "今日", "查看今天每個時段"],
    ["calendar", "計畫", "查看規劃期間安排"],
    ["courses", "課程", "評量、任務與補充資料"],
    ["progress", "進度", "完成度與調整建議"],
  ];
  return `<aside class="dashboard-sidebar"><div class="sidebar-brand"><strong>NCU AI</strong><span>智慧讀書規劃器</span></div><div class="dashboard-profile"><span>${escapeHtml(nickname).slice(0, 1)}</span><div><strong>${escapeHtml(nickname)}</strong><small>${escapeHtml(schoolAndGrade)}</small></div></div><div class="sidebar-label">主要功能</div><nav class="dashboard-nav" aria-label="桌面版主要導覽">${items.map(([route, label, description]) => `<button type="button" class="dashboard-nav-item ${state.route === route ? "active" : ""}" data-nav="${route}" ${state.route === route ? `aria-current="page"` : ""}><strong>${label}</strong><small>${description}</small></button>`).join("")}</nav><div class="sidebar-label dashboard-settings-label">設定</div><div class="dashboard-settings"><button type="button" data-action="settings-timetable">課表與行程</button><button type="button" data-action="settings-learning">學習偏好</button></div><div class="dashboard-sidebar-footer"><button type="button" class="restart-planner" data-action="open-reset-planner"><strong>從頭開始</strong><span>清除目前示範資料並重新設定</span></button></div></aside>`;
}

function shell(content, title = "", action = "") {
  const setup = setupSidebar();
  const dashboard = dashboardSidebar();
  const frameClass = setup ? "setup-frame" : dashboard ? "dashboard-frame" : "";
  return `<div class="app-frame ${frameClass}">${setup || dashboard}<div class="shell">${topbar(title, action)}${content}${nav()}</div></div>${state.toast ? `<div class="toast">${state.toast}</div>` : ""}`;
}

function setupProgress(step) {
  return `<div class="stepper" aria-label="設定進度">${[1,2,3,4].map(n => `<span class="step ${n <= step ? "done" : ""}"></span>`).join("")}</div>`;
}

function onboarding() {
  const isNcu = state.profile.school === "ncu";
  return shell(`<section class="content profile-page stack-lg">
    <div class="two-step" aria-label="設定進度"><span class="active">基本資料</span><span>填寫課表</span></div>
    <div class="import-hero">
      <div class="eyebrow">開始使用</div>
      <h1 class="page-title">先認識你一點</h1>
      <p class="muted">選擇學校後，我們會載入該校可使用的課程資料。</p>
    </div>
    <form id="profile-form" class="stack-lg">
      <div class="field"><label for="nickname">怎麼稱呼你</label><input id="nickname" name="nickname" required autocomplete="nickname" placeholder="例如：小宇" value="${state.profile.nickname}" /></div>
      <div class="field"><label for="school">就讀學校</label><select id="school" name="school" required><option value="">請選擇學校</option><option value="ncu" ${isNcu ? "selected" : ""}>國立中央大學</option><option value="other" ${state.profile.school === "other" ? "selected" : ""}>其他學校</option></select></div>
      <div id="school-support" class="school-support ${isNcu ? "supported" : ""}">${isNcu ? `<strong>中央大學資料可用</strong><span>下一頁可搜尋課號、課名或授課老師。</span>` : `<strong>選擇中央大學即可串接</strong><span>原型會先使用模擬課程資料，之後替換為後端 API。</span>`}</div>
      <div class="field"><label for="grade">年級</label><select id="grade" name="grade" required><option value="">請選擇年級</option>${["大一","大二","大三","大四","碩士班","博士班"].map(item => `<option ${state.profile.grade === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
      <div class="privacy-note">只收集建立課表與讀書計畫需要的資訊；目前頁面使用示意資料。</div>
      <button class="btn primary block" type="button" data-action="profile-next">下一步，填寫課表</button>
    </form>
  </section>`, "基本資料");
}

function timetablePage() {
  const count = Object.keys(state.timetable).length;
  const header = `<div class="schedule-row schedule-head"><div class="schedule-corner">時間</div>${DAYS.map(([, label]) => `<div>${label}</div>`).join("")}</div>`;
  const rows = PERIODS.map(([period, time]) => `<div class="schedule-row"><div class="period-label"><strong>${period}</strong><span>${time.replace("–", "–\n")}</span></div>${DAYS.map(([day, dayLabel]) => {
    const key = `${day}-${period}`;
    const item = scheduleItem(state.timetable[key]);
    return `<button type="button" class="schedule-cell ${item ? "filled" : ""} ${item?.custom ? "custom" : ""}" data-action="open-cell" data-cell="${key}" aria-label="星期${dayLabel} ${time}${item ? ` ${item.name}` : " 空堂"}">${item ? `<strong>${item.name}</strong><span>${item.custom ? "自訂行程" : item.teacher}</span>` : `<span class="cell-add">＋</span>`}</button>`;
  }).join("")}</div>`).join("");
  return shell(`<section class="content timetable-page stack-lg">
    <div class="two-step" aria-label="設定進度"><span class="complete">基本資料</span><span class="active">填寫課表</span></div>
    <div class="row-between timetable-heading"><div><div class="eyebrow">115-1 學期</div><h1 class="page-title">建立你的課表</h1></div><span class="status ${count ? "confirmed" : ""}">${count} 格</span></div>
    <p class="muted schedule-help">08:00–24:00 都能安排。點選格子加入課程或其他行程。</p>
    <div class="timetable-workspace"><div class="schedule-wrap" aria-label="每週課表">${header}${rows}</div>
    <aside class="timetable-actions"><div class="desktop-action-summary"><strong>課表設定</strong><span>確認課程與固定行程後，再設定各科讀書條件。</span></div><button class="btn primary block" data-action="timetable-next">確認課表，繼續</button><button class="btn secondary block" data-action="back-profile">返回基本資料</button><div class="demo-generator"><span>開發測試捷徑</span><button class="btn demo block" data-action="generate-demo-timetable">一鍵隨機生成示範課表</button><small>每次隨機加入 5 門必修、2 門通識與 2 個生活行程，並自動避開撞堂。</small></div></aside></div>
  </section>`, "填寫課表");
}

function scheduleItem(value) {
  if (!value) return null;
  if (typeof value === "object" && value.type === "custom") return { name: value.title, custom: true };
  if (typeof value === "object" && value.type === "course") return COURSE_CATALOG.find(item => item.id === value.sectionId) || null;
  return null;
}

function sectionCells(section) {
  return section.meetings.flatMap(meeting => meeting.periods.map(period => `${meeting.day}-${period}`));
}

function formatMeeting(meeting) {
  const day = DAYS.find(([value]) => value === meeting.day)?.[1] || meeting.day;
  const first = PERIODS.find(([value]) => value === meeting.periods[0])?.[1];
  const last = PERIODS.find(([value]) => value === meeting.periods.at(-1))?.[1];
  const start = first?.split("–")[0] || "";
  const end = last?.split("–")[1] || "";
  return `週${day} ${start}–${end}`;
}

function formatSectionTimes(section) {
  return section.meetings.map(formatMeeting).join("、");
}

function removeSection(sectionId) {
  Object.entries(state.timetable).forEach(([cell, item]) => {
    if (item?.type === "course" && item.sectionId === sectionId) delete state.timetable[cell];
  });
}

function applySection(section) {
  removeSection(section.id);
  sectionCells(section).forEach(cell => {
    state.timetable[cell] = { type: "course", sectionId: section.id, subjectId: section.subjectId };
  });
}

function sectionConflicts(section) {
  return sectionCells(section).filter(cell => {
    const item = state.timetable[cell];
    return item && !(item.type === "course" && item.sectionId === section.id);
  });
}

function selectedSections() {
  const selectedIds = new Set(Object.values(state.timetable).filter(item => item?.type === "course").map(item => item.sectionId));
  return COURSE_CATALOG.filter(section => selectedIds.has(section.id));
}

function coursePreference(sectionId) {
  return {
    familiarity: "普通",
    difficulty: "普通",
    targetScore: "85",
    ...(state.coursePreferences?.[sectionId] || {}),
  };
}

function globalStudySettings() {
  return {
    sessionMinutes: "45",
    dailyLimitMinutes: "120",
    bufferDays: "7",
    ...(state.globalStudySettings || {}),
  };
}

function preferenceDropdown(sectionId, field, id, options, selected) {
  const selectedOption = options.find(([value]) => String(value) === String(selected)) || options[0];
  return `<div class="custom-select" data-custom-select>
    <input type="hidden" data-preference="${field}" data-section-id="${sectionId}" value="${selectedOption[0]}" />
    <button id="${id}" class="custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span data-select-label>${selectedOption[1]}</span><span class="custom-select-chevron" aria-hidden="true"></span>
    </button>
    <div class="custom-select-menu" role="listbox" aria-labelledby="${id}" hidden>
      ${options.map(([value, label]) => `<button class="custom-select-option${String(selectedOption[0]) === String(value) ? " selected" : ""}" type="button" role="option" aria-selected="${String(selectedOption[0]) === String(value)}" data-select-value="${value}">${label}</button>`).join("")}
    </div>
  </div>`;
}

function globalPreferenceDropdown(field, id, options, selected) {
  const selectedOption = options.find(([value]) => String(value) === String(selected)) || options[0];
  return `<div class="custom-select" data-custom-select>
    <input type="hidden" data-global-preference="${field}" value="${selectedOption[0]}" />
    <button id="${id}" class="custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span data-select-label>${selectedOption[1]}</span><span class="custom-select-chevron" aria-hidden="true"></span>
    </button>
    <div class="custom-select-menu" role="listbox" aria-labelledby="${id}" hidden>
      ${options.map(([value, label]) => `<button class="custom-select-option${String(selectedOption[0]) === String(value) ? " selected" : ""}" type="button" role="option" aria-selected="${String(selectedOption[0]) === String(value)}" data-select-value="${value}">${label}</button>`).join("")}
    </div>
  </div>`;
}

function supplementCourseDropdown(sections, selectedId) {
  const selected = sections.find(section => section.id === selectedId) || sections[0];
  if (!selected) return "";
  return `<div class="custom-select supplement-course-select" data-custom-select>
    <button id="supplement-course" class="custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span data-select-label>${selected.name}・${selected.teacher}</span><span class="custom-select-chevron" aria-hidden="true"></span>
    </button>
    <div class="custom-select-menu" role="listbox" aria-labelledby="supplement-course" hidden>
      ${sections.map(section => `<button class="custom-select-option${section.id === selected.id ? " selected" : ""}" type="button" role="option" aria-selected="${section.id === selected.id}" data-supplement-course-id="${section.id}"><strong>${section.name}</strong><span>${section.code}・${section.teacher}</span></button>`).join("")}
    </div>
  </div>`;
}

function courseSupplementSection(sections) {
  if (!sections.length) return "";
  const selectedId = sections.some(section => section.id === state.supplementCourseId)
    ? state.supplementCourseId
    : sections[0].id;
  state.supplementCourseId = selectedId;
  const selected = sections.find(section => section.id === selectedId);
  const supplement = { note: "", images: [], ...(state.courseSupplements?.[selectedId] || {}) };
  const savedCount = Number(Boolean(supplement.note.trim())) + supplement.images.length;
  const previews = supplement.images.map((image, index) => `<article class="supplement-image">
    <img src="${image.dataUrl}" alt="${escapeHtml(image.name)}" />
    <div><strong>${escapeHtml(image.name)}</strong><span>已加入 ${selected.name}</span></div>
    <button type="button" class="supplement-remove" data-action="remove-supplement-image" data-image-index="${index}" aria-label="移除 ${escapeHtml(image.name)}">移除</button>
  </article>`).join("");
  return `<section class="course-supplement-card" aria-labelledby="course-supplement-title">
    <div class="supplement-heading">
      <div><div class="row supplement-title-row"><h2 id="course-supplement-title">補充課程詳細資料</h2><span class="optional-badge">選填</span></div><p>可上傳老師公告、課綱或考試通知圖片，也可直接輸入文字。</p></div>
      ${savedCount ? `<span class="supplement-count">已補充 ${savedCount} 筆</span>` : ""}
    </div>
    <div class="field supplement-course-field"><label for="supplement-course">要補充哪一門課？</label>${supplementCourseDropdown(sections, selectedId)}</div>
    <div class="supplement-input-grid">
      <div class="field"><span class="label">上傳圖片</span><label class="supplement-upload" for="supplement-images"><strong>＋ 選擇圖片</strong><span>課綱、老師公告、考試或作業通知</span><small>最多 3 張，每張不超過 900 KB</small></label><input id="supplement-images" class="visually-hidden" type="file" accept="image/*" multiple /></div>
      <div class="field"><label for="supplement-note">文字說明</label><textarea id="supplement-note" data-supplement-note placeholder="例如：期中考改到 11/20，範圍是第一章到第四章。">${escapeHtml(supplement.note)}</textarea></div>
    </div>
    ${state.supplementUploadError ? `<div class="supplement-error" role="alert">${escapeHtml(state.supplementUploadError)}</div>` : ""}
    ${previews ? `<div class="supplement-images">${previews}</div>` : ""}
    <div class="supplement-footer"><span>不補充也可以直接繼續，不會影響後面的設定。</span><button class="btn secondary" type="button" data-action="save-course-supplement">儲存補充資料</button></div>
  </section>`;
}

function coursesAtCell(cell) {
  if (!cell) return COURSE_CATALOG;
  return COURSE_CATALOG.filter(course => sectionCells(course).includes(cell));
}

function courseResults(query = "", cell = state.activeCell) {
  const term = query.trim().toLowerCase();
  return coursesAtCell(cell).filter(course => [course.code, course.name, course.teacher].some(value => value.toLowerCase().includes(term))).map(course => {
    const selected = Object.values(state.timetable).some(item => item?.type === "course" && item.sectionId === course.id);
    return `<button class="course-option ${selected ? "selected" : ""}" data-course-id="${course.id}"><div class="course-option-main"><div class="row course-option-title"><span class="course-category ${course.category}">${course.category === "required" ? "必修" : "通識"}</span><strong>${course.name}</strong>${selected ? `<span class="status confirmed">已加入</span>` : ""}</div><span>${course.code}・${course.teacher}</span><span class="course-times">${formatSectionTimes(course)}</span></div></button>`;
  }).join("") || `<div class="empty-results">${term ? "這個時段找不到符合搜尋條件的課程" : "這個時段目前沒有可選課程"}</div>`;
}

function coursePicker(cell) {
  const [day, period] = cell.split("-");
  const dayLabel = DAYS.find(([value]) => value === day)?.[1];
  const time = PERIODS.find(([value]) => value === period)?.[1];
  const current = state.timetable[cell];
  const currentSection = current?.type === "course" ? COURSE_CATALOG.find(item => item.id === current.sectionId) : null;
  const removeLabel = currentSection ? `移除整門「${currentSection.name}」` : current?.type === "custom" ? "移除此格行程" : "";
  const availableCount = coursesAtCell(cell).length;
  return `<div class="modal-backdrop course-picker-backdrop" role="dialog" aria-modal="true"><section class="modal course-picker"><div class="picker-handle"></div><div class="row-between"><div><div class="eyebrow">星期${dayLabel}・第 ${period} 節</div><h2 class="section-title">${time}</h2></div><button class="btn ghost small-btn" data-action="close-modal">關閉</button></div><div class="picker-note">只顯示這個時段有上課的班別，目前共 ${availableCount} 個選擇。選取後會一次填入該班所有上課時段。</div><form id="custom-activity-form" class="custom-activity"><div><strong>加入其他行程</strong><span>運動、社團、打工、用餐等都會占用此時段</span></div><div class="custom-input-row"><input id="custom-activity" data-custom-activity-input type="text" inputmode="text" enterkeyhint="done" name="title" required autocomplete="off" autocapitalize="sentences" placeholder="例如：彈鋼琴" aria-label="其他行程名稱" /><button class="btn secondary" type="button" data-action="add-custom-activity">加入</button></div></form><div class="picker-divider"><span>或選擇這個時段的學校課程</span></div><div class="search-field"><input id="course-search" type="search" autocomplete="off" placeholder="在此時段搜尋課號、課名或老師" aria-label="搜尋這個時段的課程" /></div><div id="course-results" class="course-results">${courseResults("", cell)}</div>${removeLabel ? `<button class="btn danger block" data-action="remove-course">${removeLabel}</button>` : ""}</section></div>`;
}

function conflictModal(section, conflictCells) {
  const items = conflictCells.map(cell => {
    const [day, period] = cell.split("-");
    const dayLabel = DAYS.find(([value]) => value === day)?.[1];
    const time = PERIODS.find(([value]) => value === period)?.[1];
    const conflict = state.timetable[cell];
    const existingSection = conflict?.type === "course" ? COURSE_CATALOG.find(item => item.id === conflict.sectionId) : null;
    const name = existingSection ? `${existingSection.name}・${existingSection.teacher}` : conflict?.title || "既有行程";
    return `<li><strong>週${dayLabel} ${time}</strong><span>${name}</span></li>`;
  }).join("");
  return `<div class="modal-backdrop" role="dialog" aria-modal="true"><section class="modal stack-lg"><div><div class="eyebrow">時段衝突</div><h2 class="page-title">要取代原有行程嗎？</h2><p class="muted">加入「${section.name}・${section.teacher}」會與以下內容重疊。</p></div><ul class="conflict-list">${items}</ul><div class="conflict-rule">取代後，衝突的學校課程會整門移除；自訂行程只會移除衝突格。</div><div class="button-grid"><button class="btn secondary" data-action="cancel-conflict">取消</button><button class="btn primary" data-action="confirm-section-replace">取代並加入</button></div></section></div>`;
}

function courseForm() {
  return shell(`<section class="content stack-lg">${setupProgress(1)}<div><div class="eyebrow">步驟 1／4</div><h1 class="page-title">加入課程與課綱</h1><p class="muted">第一版先讓學生手動輸入，避免處理校務系統登入。</p></div><form id="course-form" class="stack"><div class="field"><label for="course-name">課程名稱</label><input id="course-name" name="name" required value="${state.course.name}" /></div><div class="field"><label for="teacher">授課教師</label><input id="teacher" name="teacher" value="${state.course.teacher}" /></div><div class="field"><label for="class-time">上課時間</label><input id="class-time" name="classTime" value="${state.course.classTime}" /></div><div class="field"><label for="syllabus">課程大綱文字</label><textarea id="syllabus" name="syllabus" required>${state.course.syllabus}</textarea></div><button class="btn primary block" type="submit">交給AI整理</button><button class="btn secondary block" type="button" data-action="back-onboarding">返回</button></form></section>`, "新增課程");
}

function analyzing() {
  return shell(`<section class="content loading"><div><div class="eyebrow">正在分析課綱</div><h1 class="page-title">整理考試與作業資訊</h1><p class="muted">原型使用模擬結果；正式版會呼叫後端AI擷取API。</p><div class="loading-line"></div></div></section>`, "AI課綱分析");
}

function assessmentReview() {
  return shell(`<section class="content stack-lg">${setupProgress(2)}<div><div class="eyebrow">步驟 2／4</div><h1 class="page-title">確認AI整理結果</h1><p class="muted">學生確認後，資料才會進入排程。</p></div><div class="card stack"><div class="row-between"><strong>${state.assessment.title}</strong><span class="status ai">AI擷取</span></div><div class="field"><label>預計時間</label><input data-assessment="week" value="${state.assessment.week}" /></div><div class="field"><label>成績占比</label><input data-assessment="weight" value="${state.assessment.weight}" /></div><div class="field"><label>考試範圍</label><input data-assessment="coverage" value="${state.assessment.coverage}" /></div><div class="card success small"><strong>來源狀態：</strong>${state.assessment.confidence}</div></div><div class="card soft small"><strong>原始課綱：</strong><br>${state.course.syllabus}</div><button class="btn primary block" data-action="confirm-assessment">確認資料正確</button><button class="btn secondary block" data-action="back-course">返回修改課綱</button></section>`, "確認評量資訊");
}

function coursePreferenceCard(section) {
  const preference = coursePreference(section.id);
  return `<article class="preference-card">
    <div class="preference-card-head"><div><div class="row preference-title"><span class="course-category ${section.category}">${section.category === "required" ? "必修" : "通識"}</span><h2>${section.name}</h2></div><p>${section.code}・${section.teacher}</p></div><span class="status confirmed">已排入課表</span></div>
    <div class="preference-grid">
      <div class="field"><label for="${section.id}-familiarity">熟悉度</label>${preferenceDropdown(section.id, "familiarity", `${section.id}-familiarity`, [["不熟悉","不熟悉"],["普通","普通"],["熟悉","熟悉"]], preference.familiarity)}</div>
      <div class="field"><label for="${section.id}-difficulty">課程難度</label>${preferenceDropdown(section.id, "difficulty", `${section.id}-difficulty`, [["簡單","簡單"],["普通","普通"],["困難","困難"],["非常困難","非常困難"]], preference.difficulty)}</div>
      <div class="field"><label for="${section.id}-target-score">目標成績</label><div class="input-unit"><input id="${section.id}-target-score" data-preference="targetScore" data-section-id="${section.id}" type="number" inputmode="numeric" min="60" max="100" value="${preference.targetScore}" /><span>分</span></div></div>
    </div>
  </article>`;
}

function sharedStudySettingsCard() {
  const settings = globalStudySettings();
  return `<section class="shared-study-settings" aria-labelledby="shared-study-settings-title">
    <div class="shared-study-settings-head"><div><span class="shared-badge">套用全部科目</span><h2 id="shared-study-settings-title">共用讀書設定</h2><p>在這裡調整一次，所有課程與之後新增的課程都會使用相同設定。</p></div></div>
    <div class="shared-study-settings-grid">
      <div class="field"><label for="global-session">單次讀書長度</label>${globalPreferenceDropdown("sessionMinutes", "global-session", [["25","25 分鐘"],["45","45 分鐘"],["60","60 分鐘"],["90","90 分鐘"]], settings.sessionMinutes)}</div>
      <div class="field"><label for="global-daily-limit">單日安排上限</label>${globalPreferenceDropdown("dailyLimitMinutes", "global-daily-limit", [["60","1 小時"],["90","1.5 小時"],["120","2 小時"],["180","3 小時"]], settings.dailyLimitMinutes)}</div>
      <div class="field"><label for="global-buffer">考前預留天數</label><div class="input-unit"><input id="global-buffer" data-global-preference="bufferDays" type="number" inputmode="numeric" min="1" max="30" value="${settings.bufferDays}" /><span>天</span></div></div>
    </div>
  </section>`;
}

function availabilitySetup() {
  const sections = selectedSections();
  return shell(`<section class="content stack-lg study-settings-page">${setupProgress(3)}<div><div class="eyebrow">步驟 3／4・學習狀況設定</div><h1 class="page-title">調整讀書條件</h1><p class="muted">先設定所有科目共用的讀書方式，再調整每門課的個別條件。</p></div><form id="study-settings-form" class="stack-lg">${sharedStudySettingsCard()}<div class="settings-summary"><strong>${sections.length} 門課需要設定</strong><span>各科只需調整熟悉度、課程難度與目標成績；自訂行程不會產生讀書任務。</span></div><div class="preference-cards">${sections.map(coursePreferenceCard).join("")}</div>${courseSupplementSection(sections)}<div class="settings-form-actions"><button class="btn primary" type="button" data-action="save-study-settings">儲存設定，繼續</button><button class="btn secondary" type="button" data-action="back-import">返回課表</button></div></form></section>`, "學習狀況設定");
}

function analysisInput() {
  return {
    courses: selectedSections().map(section => ({
      id: section.id,
      subjectId: section.subjectId,
      name: section.name,
      code: section.code,
      teacher: section.teacher,
      meetings: section.meetings,
    })),
    globalSettings: globalStudySettings(),
    preferences: Object.fromEntries(selectedSections().map(section => [section.id, {
      ...coursePreference(section.id),
      ...globalStudySettings(),
    }])),
    timetable: state.timetable,
    assessment: state.assessment,
    planRange: { ...state.planRange },
  };
}

async function runMockAnalysis() {
  const engine = window.NCUAnalysisEngine;
  if (!engine?.analyzePlan) throw new Error("analysis_engine_unavailable");
  state.analysisStatus = "loading";
  save();
  const analysis = await engine.analyzePlan(analysisInput());
  state.analysis = analysis;
  state.tasks = analysis.tasks.map(normalizeTask);
  state.analysisStatus = "ready";
  save();
  return analysis;
}

async function saveStudySettings(form = document.querySelector("#study-settings-form")) {
  form?.querySelectorAll("[data-preference]").forEach(updateCoursePreference);
  form?.querySelectorAll("[data-global-preference]").forEach(updateGlobalStudySetting);
  try {
    await runMockAnalysis();
    state.setupStep = 5;
    state.highestSetupStage = Math.max(state.highestSetupStage, 4);
    save();
    render();
    window.scrollTo(0, 0);
  } catch {
    state.analysisStatus = "error";
    save();
    showToast("暫時無法產生分析，請稍後再試。");
  }
}

function updatePlanRange(target) {
  const field = target.dataset.planRange;
  if (!field) return false;
  state.planRange = { ...state.planRange, [field]: target.value };
  state.planWeekPage = 0;
  save();
  const details = planRangeDetails();
  const summary = document.querySelector("[data-plan-range-summary]");
  if (summary) {
    summary.textContent = details.label;
    summary.classList.toggle("valid", details.valid);
    summary.classList.toggle("invalid", !details.valid);
  }
  const days = document.querySelector("[data-plan-range-days]");
  if (days) days.textContent = details.valid ? `${details.days} 天` : "待設定";
  return true;
}

async function finishSetup() {
  const details = planRangeDetails();
  if (!details.valid) {
    const target = !state.planRange?.startDate ? "#plan-start-date" : "#plan-end-date";
    document.querySelector(target)?.focus();
    return showToast(details.label);
  }
  try {
    await runMockAnalysis();
    state.setupComplete = true;
    state.route = "today";
    state.planWeekPage = 0;
    save();
    render();
    window.scrollTo(0, 0);
  } catch {
    state.analysisStatus = "error";
    save();
    showToast("暫時無法依日期產生計畫，請稍後再試。");
  }
}

function saveProfileAndContinue(form = document.querySelector("#profile-form")) {
  if (!form) return;
  const missing = [...form.querySelectorAll("[required]")].find(field => !String(field.value || "").trim());
  if (missing) {
    missing.focus();
    return showToast("請先完成所有基本資料。");
  }
  const profile = Object.fromEntries(new FormData(form).entries());
  state.profile = profile;
  state.schoolConnected = profile.school === "ncu";
  state.setupStep = 1;
  state.highestSetupStage = Math.max(state.highestSetupStage, 2);
  save();
  render();
  window.scrollTo(0, 0);
}

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function randomDemoSections() {
  const requiredGroups = Object.values(COURSE_CATALOG.filter(course => course.category === "required").reduce((groups, course) => {
    (groups[course.subjectId] ||= []).push(course);
    return groups;
  }, {}));
  const generalCourses = COURSE_CATALOG.filter(course => course.category === "general");

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const occupied = new Set();
    const selected = [];
    for (const group of shuffled(requiredGroups)) {
      const candidate = shuffled(group).find(section => sectionCells(section).every(cell => !occupied.has(cell)));
      if (!candidate) continue;
      selected.push(candidate);
      sectionCells(candidate).forEach(cell => occupied.add(cell));
      if (selected.length === 5) break;
    }
    if (selected.length !== 5) continue;

    let generalCount = 0;
    for (const course of shuffled(generalCourses)) {
      if (sectionCells(course).some(cell => occupied.has(cell))) continue;
      selected.push(course);
      sectionCells(course).forEach(cell => occupied.add(cell));
      generalCount += 1;
      if (generalCount === 2) break;
    }
    if (generalCount !== 2) continue;

    const signature = selected.map(section => section.id).sort().join("|");
    if (signature === state.lastDemoSignature) continue;
    return { selected, signature };
  }

  const selected = FALLBACK_DEMO_SECTION_IDS.map(id => COURSE_CATALOG.find(course => course.id === id)).filter(Boolean);
  return { selected, signature: selected.map(section => section.id).sort().join("|") };
}

function generateDemoTimetable() {
  const { selected, signature } = randomDemoSections();
  state.timetable = {};
  selected.forEach(applySection);
  const activityCells = shuffled([
    "mon-A", "mon-B", "tue-A", "tue-B", "wed-A", "wed-B", "thu-A", "thu-B", "fri-A", "fri-B",
    "sat-3", "sat-5", "sat-6", "sat-7", "sat-8",
  ]).filter(cell => !state.timetable[cell]).slice(0, 2);
  state.timetable[activityCells[0] || "sat-5"] = { type: "custom", title: "彈鋼琴" };
  state.timetable[activityCells[1] || "sat-7"] = { type: "custom", title: "打籃球" };
  state.lastDemoSignature = signature;
  save();
  showToast("已隨機生成無衝堂課表：5 門必修、2 門通識與 2 個生活行程。");
}

function continueFromTimetable() {
  if (!selectedSections().length) return showToast("請至少加入一門學校課程。");
  state.highestSetupStage = Math.max(state.highestSetupStage, 3);
  setState({ setupStep: 4, usedImportedData: true, highestSetupStage: state.highestSetupStage });
}

function planReady() {
  const count = selectedSections().length;
  const analysis = state.analysis || {};
  const range = planRangeDetails();
  const summary = analysis.summary || { totalTasks: state.tasks.length, totalMinutes: state.tasks.reduce((sum, task) => sum + task.duration, 0), todayTasks: state.tasks.filter(task => task.day === "thu").length };
  const insightRows = (analysis.courseInsights || selectedSections().slice(0, 5).map(section => ({ name: section.name, taskCount: state.tasks.filter(task => task.courseId === section.id).length, minutes: state.tasks.filter(task => task.courseId === section.id).reduce((sum, task) => sum + task.duration, 0) }))).map(insight => `<div class="plan-course-row"><div><strong>${insight.name}</strong><span>${insight.taskCount} 個任務</span></div><strong>${insight.minutes} 分鐘</strong></div>`).join("");
  const reasons = (analysis.reasons || ["優先處理較不熟悉的課程", "避開固定課程與生活行程", "保留週末彈性時段"]).map(reason => `<li>${reason}</li>`).join("");
  return shell(`<section class="content stack-lg plan-preview-page">${setupProgress(4)}
    <div><div class="eyebrow">步驟 4／4・設定完成</div><h1 class="page-title">決定這次要規劃多久</h1><p class="muted">自行選擇計畫的開始與結束日期，不必受限於一週或一學期。</p></div>
    <section class="plan-range-card" aria-labelledby="plan-range-title">
      <div class="plan-range-heading"><div><span class="shared-badge">自訂規劃期間</span><h2 id="plan-range-title">計畫生成區間</h2><p>系統會依這段期間內的課表、評量與空閒時間安排讀書任務。</p></div><div class="plan-range-summary ${range.valid ? "valid" : "invalid"}" data-plan-range-summary>${range.label}</div></div>
      <div class="plan-range-fields">
        <div class="field"><label for="plan-start-date">開始日期</label><input id="plan-start-date" type="date" data-plan-range="startDate" value="${state.planRange.startDate}" /></div>
        <div class="field"><label for="plan-end-date">結束日期</label><input id="plan-end-date" type="date" data-plan-range="endDate" value="${state.planRange.endDate}" /></div>
      </div>
      <div class="plan-range-note">日期之後仍可回到設定修改；重新產生時會保留已完成的回饋紀錄。</div>
    </section>
    <div class="plan-preview-layout">
      <div class="stack">
        <div class="plan-summary-grid"><div class="metric-card"><span>規劃天數</span><strong data-plan-range-days>${range.valid ? `${range.days} 天` : "待設定"}</strong></div><div class="metric-card"><span>已分析課程</span><strong>${count} 門</strong></div><div class="metric-card"><span>已安排空堂</span><strong>${summary.totalTasks} 個</strong></div><div class="metric-card"><span>預計投入</span><strong>${Math.floor(summary.totalMinutes / 60)} 小時 ${summary.totalMinutes % 60} 分</strong></div></div>
        <section class="card stack"><div class="row-between"><h2 class="section-title">各科時間分配</h2><span class="status ai">Mock AI</span></div><div class="plan-course-list">${insightRows}</div></section>
      </div>
      <aside class="card ai-explanation stack"><div><div class="eyebrow">排程依據</div><h2 class="section-title">為什麼這樣安排？</h2></div><ul>${reasons}</ul><div class="analysis-warning">${analysis.warnings?.[0] || "目前負擔適中，仍保留調整空間。"}</div></aside>
    </div>
    <div class="completion-actions"><button class="btn primary" data-action="finish-setup">依此日期生成計畫</button><button class="btn secondary" data-action="back-availability">返回修改條件</button></div>
  </section>`, "設定完成");
}

function periodIdForTask(task) {
  if (task.period && PERIODS.some(([period]) => period === task.period)) return task.period;
  const start = String(task.time || "").split(/[–-]/)[0];
  return PERIODS.find(([, time]) => time.startsWith(start))?.[0] || "";
}

function freeTimeSuggestion(period) {
  if (period === "Z") return { type: "rest", title: "午餐與休息", detail: "暫停讀書，讓下午保持專注" };
  if (period === "A") return { type: "rest", title: "晚餐與休息", detail: "保留用餐和移動時間" };
  if (["E", "F"].includes(period)) return { type: "rest", title: "放鬆與準備休息", detail: "不安排高負荷任務" };
  if (["1", "2"].includes(period)) return { type: "flex", title: "彈性時間", detail: "早餐、通勤或整理今日目標" };
  return { type: "flex", title: "彈性時間", detail: "休息、處理臨時事項或自由運用" };
}

function dailyAgenda(day) {
  const tasksByPeriod = new Map(state.tasks.filter(task => task.day === day).map(task => [periodIdForTask(task), task]));
  return PERIODS.map(([period, time]) => {
    const fixed = state.timetable[`${day}-${period}`];
    if (fixed?.type === "course") {
      const section = COURSE_CATALOG.find(course => course.id === fixed.sectionId);
      return { period, time, type: "course", title: section?.name || "學校課程", detail: section ? `${section.code}・${section.teacher}` : "固定課程" };
    }
    if (fixed?.type === "custom") return { period, time, type: "custom", title: fixed.title, detail: "自訂生活行程" };
    const task = tasksByPeriod.get(period);
    if (task) return { period, time, type: "study", title: task.title, detail: `${task.course}・${task.duration} 分鐘`, task };
    return { period, time, ...freeTimeSuggestion(period) };
  });
}

function agendaRow(item, nextTask) {
  const labels = { course: "課程", custom: "行程", study: "讀書", rest: "休息", flex: "彈性" };
  if (item.type === "study") {
    const task = item.task;
    const done = task.done || task.status === "done";
    return `<button class="agenda-row study ${task.id === nextTask?.id ? "current" : ""} ${done ? "done" : ""}" data-action="open-task-detail" data-id="${task.id}"><span class="agenda-time">${item.time}</span><span class="agenda-kind">${labels[item.type]}</span><span class="agenda-copy"><strong>${item.title}</strong><small>${item.detail}</small></span><span class="agenda-status">${done ? "已完成" : task.status === "in_progress" ? "進行中" : "待執行"}</span></button>`;
  }
  return `<div class="agenda-row ${item.type}"><span class="agenda-time">${item.time}</span><span class="agenda-kind">${labels[item.type]}</span><span class="agenda-copy"><strong>${item.title}</strong><small>${item.detail}</small></span></div>`;
}

function todayPage() {
  const todayKey = currentDayKey();
  const todayTasks = state.tasks.filter(task => task.day === todayKey);
  const complete = todayTasks.filter(task => task.done || task.status === "done").length;
  const completionRate = todayTasks.length ? Math.round(todayTasks.reduce((sum, task) => sum + taskProgressPercent(task), 0) / todayTasks.length) : 100;
  const pending = todayTasks.filter(task => !task.done && task.status !== "done");
  const nextTask = pending[0];
  const totalMinutes = todayTasks.reduce((sum, task) => sum + task.duration, 0);
  const agenda = dailyAgenda(todayKey);
  const heroAction = nextTask?.status === "in_progress"
    ? `<button class="btn primary" data-action="complete-task" data-id="${nextTask.id}">完成任務</button>`
    : `<button class="btn primary" data-action="start-task" data-id="${nextTask?.id}">開始任務</button>`;
  return shell(`<section class="content stack-lg today-dashboard">
    <div class="today-heading"><div><div class="eyebrow">今日</div><h1 class="page-title">${nextTask ? "下一步，先完成這件事" : "今天的任務已完成"}</h1><p class="muted">${state.replanCount ? `本週已調整 ${state.replanCount} 次，新的時段都經過你的確認。` : "完成或回報實際狀況，系統會讓後續安排更準確。"}</p></div><button class="btn ghost small-btn" data-action="replan-all">調整今日計畫</button></div>
    <div class="today-layout">
      <div class="stack-lg">
        ${nextTask ? `<section class="next-task-card"><div class="row-between"><span class="task-priority">${nextTask.status === "in_progress" ? "進行中" : "下一個任務"}</span><span class="small muted">${nextTask.dueDate}</span></div><div><div class="task-time">${nextTask.time}</div><div class="task-course">${nextTask.course}・${nextTask.duration} 分鐘</div><h2>${nextTask.title}</h2><p>${nextTask.rationale}</p></div><div class="next-task-actions"><button class="btn secondary" data-action="task-not-done" data-id="${nextTask.id}">今天做不完</button>${heroAction}<button class="btn ghost" data-action="open-task-detail" data-id="${nextTask.id}">查看詳情</button></div></section>` : `<section class="card success stack"><strong>做得很好，今天可以休息了。</strong><span class="muted">回顧頁會整理實際投入時間與下週建議。</span></section>`}
        <section class="stack"><div class="row-between"><div><h2 class="section-title">今日完整安排</h2><span class="small muted">08:00–24:00，每個時段都有明確用途</span></div><span class="small muted">${complete}／${todayTasks.length} 個讀書任務完成</span></div><div class="daily-agenda">${agenda.map(item => agendaRow(item, nextTask)).join("")}</div></section>
      </div>
      <aside class="today-side stack"><section class="card soft stack"><div class="row-between"><strong>今日完成度</strong><strong>${completionRate}%</strong></div><div class="progress"><span style="width:${completionRate}%"></span></div><div class="row-between small muted"><span>${complete}／${todayTasks.length} 項完全完成</span><span>預計 ${Math.floor(totalMinutes / 60)} 小時 ${totalMinutes % 60} 分</span></div></section>${todaySidebarStudyProgress(todayTasks)}</aside>
    </div>
  </section>`, fullDateLabel(), `<span class="engine-badge">Mock Analysis</span>`);
}

function taskCard(task, highlighted = false) {
  const done = task.done || task.status === "done";
  const statusLabel = done ? "已完成" : task.status === "in_progress" ? "進行中" : task.status === "rescheduled" ? "已改期" : "待完成";
  const priorityLabel = task.priority === "high" ? "高優先" : task.priority === "low" ? "低優先" : "一般";
  return `<article class="task compact ${highlighted ? "highlighted" : ""} ${done ? "done" : ""}"><button class="task-main" data-action="open-task-detail" data-id="${task.id}"><span class="task-time">${task.time}</span><span><strong>${task.title}</strong><small>${task.course}・${task.duration} 分鐘</small></span><span class="task-labels"><span class="task-priority-label ${task.priority}">${priorityLabel}</span><span class="task-state ${task.status}">${statusLabel}</span></span></button>${done ? `<button class="btn ghost small-btn" data-action="undo-task" data-id="${task.id}">復原</button>` : ""}</article>`;
}

function calendarPage() {
  const range = planRangeDetails();
  const startDate = parseDateInput(state.planRange?.startDate);
  const planDays = range.valid && startDate
    ? Array.from({ length: range.days }, (_, index) => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);
        const day = dayKeyForDate(date);
        return { day, label: DAY_LABELS[day], date, short: `${date.getMonth() + 1}/${date.getDate()}` };
      })
    : currentWeekDays();
  const totalWeeks = Math.max(1, Math.ceil(planDays.length / 7));
  const activeWeek = Math.min(Math.max(Number(state.planWeekPage) || 0, 0), totalWeeks - 1);
  const days = planDays.slice(activeWeek * 7, activeWeek * 7 + 7);
  const firstDay = days[0]?.date;
  const lastDay = days.at(-1)?.date;
  const weekRangeLabel = firstDay && lastDay ? `${firstDay.getMonth() + 1}/${firstDay.getDate()}－${lastDay.getMonth() + 1}/${lastDay.getDate()}` : "";
  const today = dateInputValue(dateForOffset());
  const columns = days.map(day => ({ ...day, slots: dailyAgenda(day.day) }));
  const header = columns.map(({ date, label, short }) => {
    const isToday = dateInputValue(date) === today;
    return `<th scope="col" ${isToday ? 'aria-current="date" class="current-day"' : ""}>週${label}<span>${short}${isToday ? "・今日" : ""}</span></th>`;
  }).join("");
  const rows = PERIODS.map(([, time], index) => {
    const cells = columns.map(({ slots }) => {
      const item = slots[index];
      if (item.type === "flex" || item.type === "rest") return "<td></td>";
      if (item.type === "study") {
        const done = taskProgressPercent(item.task) === 100;
        return `<td class="study"><button type="button" data-action="open-task-detail" data-id="${item.task.id}"><strong>${escapeHtml(item.task.course)}</strong><span>${escapeHtml(item.title)}</span>${done ? "<small>已完成</small>" : ""}</button></td>`;
      }
      return `<td class="${item.type}"><strong>${escapeHtml(item.title)}</strong></td>`;
    }).join("");
    const [start, end] = time.split("–");
    return `<tr><th scope="row"><span>${start}–</span><span>${end}</span></th>${cells}</tr>`;
  }).join("");
  const timetable = `<div class="week-table-scroll" role="region" aria-label="週課表，可橫向捲動" tabindex="0"><table class="week-table" aria-label="第 ${activeWeek + 1} 週課表" style="--day-columns:${days.length}"><thead><tr><th scope="col">時間</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const pageButtons = Array.from({ length: totalWeeks }, (_, index) => `<button type="button" class="week-page-number ${index === activeWeek ? "active" : ""}" data-action="go-plan-week" data-week-page="${index}" aria-label="前往第 ${index + 1} 週" aria-current="${index === activeWeek ? "page" : "false"}">${index + 1}</button>`).join("");
  const pagination = `<section class="week-pagination"><div class="week-pagination-copy"><span>週計畫</span><strong>第 ${activeWeek + 1} 週／共 ${totalWeeks} 週</strong><small>${weekRangeLabel}</small></div><div class="week-pagination-actions"><button type="button" class="btn secondary small-btn" data-action="previous-plan-week" ${activeWeek === 0 ? "disabled" : ""}>上一週</button><div class="week-page-numbers" aria-label="週計畫頁數">${pageButtons}</div><button type="button" class="btn primary small-btn" data-action="next-plan-week" ${activeWeek === totalWeeks - 1 ? "disabled" : ""}>下一週</button></div></section>`;
  return shell(`<section class="content stack-lg plan-page"><div class="row-between plan-heading"><div><div class="eyebrow">${range.valid ? range.label : "目前規劃期間"}</div><h1 class="page-title">每週計畫</h1></div><button class="btn primary" data-action="regenerate-plan">依目前課表重新規劃</button></div>${pagination}<div class="week-table-tools"><div class="week-table-legend" aria-label="課表圖例"><span class="course">課程</span><span class="study">讀書</span><span class="custom">行程</span></div><button class="btn secondary small-btn" data-action="show-analysis-reasons">查看排程依據</button></div>${timetable}</section>`, "計畫");
}

function courseAssessment(section, index = 0) {
  const weeks = ["第 9 週", "第 10 週", "第 11 週"];
  const weights = ["30%", "25%", "35%"];
  return { title: index % 2 ? "期中作業" : "期中考", week: weeks[index % weeks.length], weight: weights[index % weights.length] };
}

function coursesPage() {
  const sections = selectedSections();
  const active = sections.find(section => section.id === state.activeCourseId);
  if (active) {
    const preference = coursePreference(active.id);
    const assessment = courseAssessment(active, sections.indexOf(active));
    const tasks = state.tasks.filter(task => task.courseId === active.id);
    const supplement = state.courseSupplements?.[active.id];
    return shell(`<section class="content stack-lg course-detail-page"><button class="back-link" data-action="close-course-detail">返回所有課程</button><div class="course-detail-hero"><div><span class="course-category ${active.category}">${active.category === "required" ? "必修" : "通識"}</span><h1 class="page-title">${active.name}</h1><p>${active.code}・${active.teacher}・${formatSectionTimes(active)}</p></div><span class="status confirmed">已分析</span></div><div class="course-detail-grid"><section class="card stack"><h2 class="section-title">最近評量</h2><div class="assessment-highlight"><strong>${assessment.title}</strong><span>${assessment.week}・占比 ${assessment.weight}</span></div><div class="source-note">來源：Mock 課綱分析，可由後端結果替換。</div></section><section class="card stack"><h2 class="section-title">個人學習條件</h2><div class="detail-pairs"><span>熟悉度<strong>${preference.familiarity}</strong></span><span>難度<strong>${preference.difficulty}</strong></span><span>目標<strong>${preference.targetScore} 分</strong></span><span>單次長度<strong>${globalStudySettings().sessionMinutes} 分鐘（共用）</strong></span></div><button class="btn secondary" data-action="edit-learning-settings">修改條件</button></section><section class="card stack course-task-section"><div class="row-between"><h2 class="section-title">AI 產生的任務</h2><span>${tasks.length} 個</span></div>${tasks.length ? tasks.map(task => taskCard(task)).join("") : `<div class="empty-results">目前沒有這門課的任務</div>`}</section><section class="card stack"><h2 class="section-title">補充資料</h2><p class="muted">${supplement?.note || "尚未提供額外文字或圖片。"}</p><button class="btn secondary" data-action="edit-learning-settings">前往補充資料</button></section></div></section>`, "課程詳情");
  }
  const cards = sections.map((section, index) => {
    const assessment = courseAssessment(section, index);
    const preference = coursePreference(section.id);
    const tasks = state.tasks.filter(task => task.courseId === section.id && !task.done);
    return `<article class="course-overview-card"><div class="row-between"><span class="course-category ${section.category}">${section.category === "required" ? "必修" : "通識"}</span><span class="status ai">已分析</span></div><div><h2>${section.name}</h2><p>${section.code}・${section.teacher}</p></div><div class="course-overview-meta"><span>最近評量<strong>${assessment.title}・${assessment.week}</strong></span><span>熟悉度<strong>${preference.familiarity}</strong></span><span>待完成<strong>${tasks.length} 個任務</strong></span></div><button class="btn secondary block" data-action="open-course-detail" data-section-id="${section.id}">查看課程詳情</button></article>`;
  }).join("") || `<div class="card soft">目前尚未加入課程。</div>`;
  return shell(`<section class="content stack-lg courses-page"><div class="row-between"><div><div class="eyebrow">課程中心</div><h1 class="page-title">本學期課程</h1><p class="muted">集中查看評量、學習條件、任務與補充資料。</p></div><button class="btn primary" data-action="add-another">調整課表</button></div><div class="course-overview-grid">${cards}</div></section>`, "課程");
}

function taskProgressPercent(task) {
  if (task.done || task.status === "done") return 100;
  const value = Number(task.completionProgress) || 0;
  return [0, 25, 50, 75, 100].includes(value) ? value : 0;
}

function todayStudyProgressSection(tasks) {
  const average = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + taskProgressPercent(task), 0) / tasks.length) : 0;
  const items = tasks.map(task => {
    const progress = taskProgressPercent(task);
    const options = [0, 25, 50, 75, 100].map(value => `<button type="button" class="${progress === value ? "active" : ""}" data-action="set-task-progress" data-id="${task.id}" data-progress="${value}" aria-pressed="${progress === value}">${value}%</button>`).join("");
    return `<article class="today-study-item"><div class="today-study-copy"><span class="today-study-time">${escapeHtml(task.time)}</span><div><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.course)}・${task.duration} 分鐘</small></div><span class="today-study-percent">${progress}%</span></div><div class="progress-options" role="group" aria-label="${escapeHtml(task.course)} ${escapeHtml(task.title)}完成度">${options}</div></article>`;
  }).join("");
  return `<section class="card today-study-progress stack"><div class="row-between"><div><h2 class="section-title">今日 AI 讀書計畫</h2><p class="muted">只顯示 AI 安排的讀書任務，點選每項任務目前的完成度。</p></div><strong class="today-study-average">今日完成度 ${average}%</strong></div>${items ? `<div class="today-study-list">${items}</div>` : `<div class="empty-results">今天沒有 AI 安排的讀書任務。</div>`}</section>`;
}

function todaySidebarStudyProgress(tasks) {
  const items = tasks.map(task => {
    const progress = taskProgressPercent(task);
    const options = [0, 25, 50, 75, 100].map(value => `<button type="button" class="${progress === value ? "active" : ""}" data-action="set-task-progress" data-id="${task.id}" data-progress="${value}" aria-pressed="${progress === value}">${value}%</button>`).join("");
    return `<article class="sidebar-study-item"><div class="sidebar-study-heading"><div><span>${escapeHtml(task.time)}・${escapeHtml(task.course)}</span><strong>${escapeHtml(task.title)}</strong></div><strong class="today-study-percent">${progress}%</strong></div><div class="progress-options compact" role="group" aria-label="${escapeHtml(task.course)} ${escapeHtml(task.title)}完成度">${options}</div></article>`;
  }).join("");
  return `<section class="card today-sidebar-progress stack"><div><div class="eyebrow">今日讀書進度</div><p class="small muted">選擇每項 AI 讀書計畫目前的完成度。</p></div>${items ? `<div class="today-sidebar-study-list">${items}</div>` : `<div class="empty-results">今天沒有 AI 安排的讀書任務。</div>`}<button class="btn secondary block" data-nav="calendar">查看完整計畫</button></section>`;
}

function progressPage() {
  const todayTasks = state.tasks.filter(task => task.day === currentDayKey());
  const visibleTasks = state.reviewRange === "day" ? todayTasks : state.tasks;
  const completedTasks = visibleTasks.filter(task => taskProgressPercent(task) === 100);
  const estimated = completedTasks.reduce((sum, task) => sum + (task.estimatedMinutes || task.duration), 0);
  const actual = completedTasks.reduce((sum, task) => sum + (task.actualMinutes || task.duration), 0);
  const completionRate = visibleTasks.length ? Math.round(visibleTasks.reduce((sum, task) => sum + taskProgressPercent(task), 0) / visibleTasks.length) : 0;
  const courseRows = selectedSections().map(section => {
    const tasks = visibleTasks.filter(task => task.courseId === section.id);
    const done = tasks.filter(task => taskProgressPercent(task) === 100).length;
    const rate = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + taskProgressPercent(task), 0) / tasks.length) : 0;
    return `<div class="review-course-row"><div><strong>${section.name}</strong><span>${done}／${tasks.length} 任務完成</span></div><div class="mini-progress"><span style="width:${rate}%"></span></div><strong>${rate}%</strong></div>`;
  }).join("");
  const rangeLabel = state.reviewRange === "day" ? "今日完成度" : "本週完成度";
  return shell(`<section class="content stack-lg review-page"><div class="row-between"><div><div class="eyebrow">學習進度</div><h1 class="page-title">看見實際投入與調整原因</h1></div><div class="range-switch"><button class="${state.reviewRange === "day" ? "active" : ""}" data-review-range="day">今日</button><button class="${state.reviewRange === "week" ? "active" : ""}" data-review-range="week">本週</button></div></div><div class="review-metrics"><div class="metric-card"><span>${rangeLabel}</span><strong>${completionRate}%</strong></div><div class="metric-card"><span>實際投入</span><strong>${actual} 分鐘</strong></div><div class="metric-card"><span>與預估差異</span><strong>${actual - estimated >= 0 ? "+" : ""}${actual - estimated} 分鐘</strong></div><div class="metric-card"><span>重新排程</span><strong>${state.replanCount} 次</strong></div></div><div class="review-layout"><section class="card stack"><h2 class="section-title">各科進度</h2><div class="review-course-list">${courseRows}</div></section><aside class="card review-suggestion stack"><span class="status ai">Mock AI 建議</span><h2>下週縮短單次任務長度</h2><p>若實際時間持續高於預估，建議將高難度課程拆成 25–45 分鐘的小任務。</p><button class="btn primary" data-action="apply-review-suggestion">預覽下週調整</button></aside></div></section>`, "進度");
}

function taskModal(id) {
  const task = state.tasks.find(t => t.id === id);
  const reasons = ["臨時有事", "任務比預期困難", "身體狀況不佳"];
  return `<div class="modal-backdrop" role="dialog" aria-modal="true"><section class="modal stack-lg"><div><div class="eyebrow">回報學習狀況</div><h2 class="page-title">今天為什麼做不完？</h2><p class="muted">${task.title}</p></div><form id="replan-feedback-form" class="stack"><div class="chips">${reasons.map(reason => `<button type="button" class="chip ${state.replanReason === reason ? "active" : ""}" data-reason="${reason}" aria-pressed="${state.replanReason === reason}">${reason === "任務比預期困難" ? "比預期困難" : reason === "身體狀況不佳" ? "狀況不佳" : reason}</button>`).join("")}</div><div class="field"><label for="task-progress">目前完成多少？</label><select id="task-progress" name="progress"><option value="0">尚未開始</option><option value="25">約 25%</option><option value="50">約一半</option><option value="75">約 75%</option></select></div><div class="field"><label for="remaining-time">今天還能讀多久？</label><select id="remaining-time" name="remaining"><option value="0">今天沒時間了</option><option value="25">還有 25 分鐘</option><option value="45">還有 45 分鐘</option></select></div></form><div class="button-grid"><button type="button" class="btn secondary" data-action="close-modal">取消</button><button type="button" class="btn primary" data-action="preview-replan" data-id="${id}">查看重排預覽</button></div></section></div>`;
}

function completionModal(id) {
  const task = state.tasks.find(item => item.id === id);
  return `<div class="modal-backdrop" role="dialog" aria-modal="true"><section class="modal stack-lg"><div><div class="eyebrow">完成任務</div><h2 class="page-title">記錄實際狀況</h2><p class="muted">${task.course}・${task.title}</p></div><form id="completion-form" class="stack"><div class="field"><label for="actual-minutes">實際花費時間</label><input id="actual-minutes" name="actualMinutes" type="number" min="5" max="240" value="${task.duration}" /></div><div class="field"><label for="completion-difficulty">實際感受</label><select id="completion-difficulty" name="difficulty"><option>比預期簡單</option><option selected>符合預期</option><option>比預期困難</option></select></div></form><div class="button-grid"><button class="btn secondary" data-action="close-modal">取消</button><button class="btn primary" data-action="confirm-complete" data-id="${id}">儲存並完成</button></div></section></div>`;
}

function replanPreviewModal(task, reason, progress = "0") {
  const suggestedDate = dateForOffset(1);
  const nextTime = `週${DAY_LABELS[dayKeyForDate(suggestedDate)]} 10:00–11:00`;
  return `<div class="modal-backdrop" role="dialog" aria-modal="true"><section class="modal stack-lg replan-preview"><div><div class="eyebrow">重排預覽</div><h2 class="page-title">確認後才會修改計畫</h2><p class="muted">Mock Analysis Engine 根據你的回報產生以下建議。</p></div><div class="plan-diff"><div><span>原安排</span><strong>${task.dateLabel} ${task.time}</strong></div><div class="diff-line"></div><div><span>建議調整</span><strong>${nextTime}</strong></div></div><div class="card soft small"><strong>原因：</strong>${reason}，目前完成 ${progress}%。未完成部分移到下一個彈性時段，其他固定行程不變。</div><div class="button-grid"><button class="btn secondary" data-action="close-modal">保留原計畫</button><button class="btn primary" data-action="confirm-replan" data-id="${task.id}">確認套用</button></div></section></div>`;
}

function taskDetailModal(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return "";
  const done = task.done || task.status === "done";
  const action = done
    ? `<button class="btn secondary" data-action="undo-task" data-id="${task.id}">標記為未完成</button>`
    : task.status === "in_progress"
      ? `<button class="btn primary" data-action="complete-task" data-id="${task.id}">完成任務</button>`
      : `<button class="btn primary" data-action="start-task" data-id="${task.id}">開始任務</button>`;
  return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-detail-title"><section class="modal stack-lg"><div class="row-between"><div><div class="eyebrow">任務詳情</div><h2 id="task-detail-title" class="page-title">${task.title}</h2></div><button class="btn ghost small-btn" data-action="close-modal">關閉</button></div><div class="task-detail-status"><span class="task-priority-label ${task.priority}">${task.priority === "high" ? "高優先" : task.priority === "low" ? "低優先" : "一般優先"}</span><span class="task-state ${task.status}">${done ? "已完成" : task.status === "in_progress" ? "進行中" : task.status === "rescheduled" ? "已改期" : "待完成"}</span></div><div class="detail-pairs"><span>科目<strong>${task.course}</strong></span><span>安排時間<strong>${task.dateLabel} ${task.time}</strong></span><span>預估時間<strong>${task.duration} 分鐘</strong></span><span>截止時間<strong>${task.dueDate}</strong></span><span>任務來源<strong>${task.source}</strong></span><span>任務類型<strong>${task.type === "practice" ? "練習" : task.type === "preview" ? "預習" : "複習"}</strong></span></div><div class="card primary-soft small"><strong>AI 排程理由</strong><br>${task.rationale}</div><div class="task-detail-actions">${!done ? `<button class="btn secondary" data-action="task-not-done" data-id="${task.id}">今天做不完</button>` : ""}${action}</div></section></div>`;
}

function settingsModal() {
  return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="settings-title"><section class="modal stack-lg settings-modal"><div class="row-between"><div><div class="eyebrow">設定</div><h2 id="settings-title" class="page-title">調整你的規劃資料</h2></div><button class="btn ghost small-btn" data-action="close-modal">關閉</button></div><p class="muted">修改課表或學習偏好後會重新產生計畫，未完成任務的時段可能改變。</p><div class="settings-links"><button type="button" data-action="settings-profile"><span><strong>基本資料</strong><small>學校與年級</small></span><span>修改</span></button><button type="button" data-action="settings-timetable"><span><strong>課表與生活行程</strong><small>課程、打工、運動等固定時間</small></span><span>修改</span></button><button type="button" data-action="settings-learning"><span><strong>學習偏好</strong><small>共用讀書設定與各科熟悉度、難度、目標</small></span><span>修改</span></button></div></section></div>`;
}

function settingsEditConfirmation(target) {
  const timetable = target === "timetable";
  const title = timetable ? "即將修改課表與行程" : "即將修改學習偏好";
  const description = timetable
    ? "課程或固定行程改變後，原本可用的讀書時段也會改變。"
    : "熟悉度、難度、目標或共用讀書設定改變後，各科任務分配也會改變。";
  return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="settings-edit-title"><section class="modal stack-lg settings-edit-confirmation"><div><div class="eyebrow">修改前確認</div><h2 id="settings-edit-title" class="page-title">${title}</h2><p class="muted">${description}</p></div><div class="card warning small"><strong>儲存修改後將重新排程。</strong><br>系統會重新確認規劃日期並產生新的未完成任務安排。</div><div class="button-grid"><button type="button" class="btn secondary" data-action="cancel-settings-edit">取消</button><button type="button" class="btn primary" data-action="confirm-settings-edit" data-settings-target="${target}">確定修改</button></div></section></div>`;
}

function resetPlannerModal() {
  return `<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reset-planner-title"><section class="modal stack-lg reset-planner-modal"><div><div class="eyebrow danger-text">重新開始</div><h2 id="reset-planner-title" class="page-title">確定要從頭設定嗎？</h2><p class="muted">這會清除目前瀏覽器中的基本資料、課表、學習偏好、任務與完成紀錄，並回到第一頁。</p></div><div class="card warning small"><strong>不會影響 GitHub 或後端資料。</strong><br>目前原型只會清除這台裝置的示範資料。</div><div class="button-grid"><button type="button" class="btn secondary" data-action="close-modal">保留目前資料</button><button type="button" class="btn danger" data-action="confirm-reset-planner">清除並從頭開始</button></div></section></div>`;
}

function goToSetupTarget(button) {
  const stage = Number(button.dataset.stage);
  if (button.disabled || stage > state.highestSetupStage) return;
  state.setupStep = Number(button.dataset.setupTarget);
  state.setupComplete = false;
  save();
  render();
  window.scrollTo(0, 0);
}

function handleCourseOption(courseOption) {
  const section = COURSE_CATALOG.find(item => item.id === courseOption.dataset.courseId);
  if (!section) return;
  const alreadySelected = Object.values(state.timetable).some(item => item?.type === "course" && item.sectionId === section.id);
  if (alreadySelected) {
    state.activeCell = "";
    showToast(`「${section.name}・${section.teacher}」已經在課表中。`);
    return;
  }
  const conflicts = sectionConflicts(section);
  if (conflicts.length) {
    state.pendingSectionId = section.id;
    save();
    render();
    return;
  }
  applySection(section);
  state.activeCell = "";
  save();
  showToast(`已加入「${section.name}」，共填入 ${sectionCells(section).length} 個時段。`);
}

function bindInteractiveControls(root = document) {
  root.querySelectorAll("[data-custom-activity-input]:not([data-activity-bound])").forEach(input => {
    input.dataset.activityBound = "true";
    ["pointerdown", "click", "input", "compositionstart", "compositionend"].forEach(type => {
      input.addEventListener(type, event => event.stopPropagation());
    });
    input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      handleFormSubmit(input.closest("form"));
    });
  });
  root.querySelectorAll("[data-action]:not([data-action-bound])").forEach(button => {
    button.dataset.actionBound = "true";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      handleActionButton(button);
    });
  });
  root.querySelectorAll("[data-course-id]:not([data-course-bound])").forEach(button => {
    button.dataset.courseBound = "true";
    button.addEventListener("click", event => {
      event.stopPropagation();
      handleCourseOption(button);
    });
  });
  root.querySelectorAll("form:not([data-submit-bound])").forEach(form => {
    form.dataset.submitBound = "true";
    form.addEventListener("submit", event => {
      event.preventDefault();
      event.stopPropagation();
      handleFormSubmit(form);
    });
  });
}

function render() {
  document.querySelectorAll(".modal-backdrop").forEach(modal => modal.remove());
  let html;
  if (!state.setupComplete) {
    const screens = { 0: onboarding, 1: timetablePage, 2: analyzing, 3: assessmentReview, 4: availabilitySetup, 5: planReady };
    html = (screens[state.setupStep] || onboarding)();
  } else {
    html = ({ today: todayPage, calendar: calendarPage, courses: coursesPage, progress: progressPage }[state.route] || todayPage)();
  }
  app.innerHTML = html;
  bindInteractiveControls(app);
  app.querySelectorAll("[data-nav]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      setState({ route: button.dataset.nav });
    });
  });
  app.querySelectorAll("[data-view-mode]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      viewPreference = button.dataset.viewMode;
      localStorage.setItem(VIEW_MODE_KEY, viewPreference);
      applyViewMode();
      render();
    });
  });
  app.querySelectorAll("[data-calendar-day]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      state.calendarDay = button.dataset.calendarDay;
      save();
      render();
    });
  });
  app.querySelectorAll("[data-review-range]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      state.reviewRange = button.dataset.reviewRange;
      save();
      render();
    });
  });
  if (!state.setupComplete && state.setupStep === 1) {
    if (state.pendingSectionId) {
      const section = COURSE_CATALOG.find(item => item.id === state.pendingSectionId);
      if (section) document.body.insertAdjacentHTML("beforeend", conflictModal(section, sectionConflicts(section)));
    } else if (state.activeCell) {
      document.body.insertAdjacentHTML("beforeend", coursePicker(state.activeCell));
    }
    bindInteractiveControls(document.body);
  }
}

function showToast(message) {
  state.toast = message;
  save();
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = "";
    save();
    document.querySelector(".toast")?.remove();
  }, 2600);
}

function updateCoursePreference(target) {
  const sectionId = target.dataset.sectionId;
  const field = target.dataset.preference;
  if (!sectionId || !field) return false;
  state.coursePreferences ||= {};
  state.coursePreferences[sectionId] = { ...coursePreference(sectionId), [field]: target.value };
  save();
  return true;
}

function updateGlobalStudySetting(target) {
  const field = target.dataset.globalPreference;
  if (!field) return false;
  state.globalStudySettings = { ...globalStudySettings(), [field]: target.value };
  save();
  return true;
}

function currentSupplement() {
  const sectionId = state.supplementCourseId || selectedSections()[0]?.id;
  state.courseSupplements ||= {};
  state.courseSupplements[sectionId] = {
    note: "",
    images: [],
    ...(state.courseSupplements[sectionId] || {}),
  };
  return { sectionId, supplement: state.courseSupplements[sectionId] };
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderAtCurrentScroll() {
  const scrollTop = window.scrollY;
  render();
  window.requestAnimationFrame(() => window.scrollTo(0, scrollTop));
}

function openDynamicModal(html) {
  document.querySelectorAll(".modal-backdrop").forEach(modal => modal.remove());
  document.body.insertAdjacentHTML("beforeend", html);
  bindInteractiveControls(document.body);
}

function handleActionButton(actionButton) {
  const action = actionButton.dataset.action;
  const id = Number(actionButton.dataset.id);
  const actions = {
    "open-settings": () => openDynamicModal(settingsModal()),
    "open-reset-planner": () => openDynamicModal(resetPlannerModal()),
    "confirm-reset-planner": () => {
      localStorage.removeItem(STORAGE_KEY);
      state = structuredClone(defaultState);
      document.querySelector(".modal-backdrop")?.remove();
      render();
      window.scrollTo(0, 0);
    },
    "settings-profile": () => setState({ setupComplete: false, setupStep: 0 }),
    "settings-timetable": () => openDynamicModal(settingsEditConfirmation("timetable")),
    "settings-learning": () => openDynamicModal(settingsEditConfirmation("learning")),
    "cancel-settings-edit": () => openDynamicModal(settingsModal()),
    "confirm-settings-edit": () => {
      const target = actionButton.dataset.settingsTarget;
      if (!['timetable', 'learning'].includes(target)) return;
      setState({ setupComplete: false, setupStep: target === "timetable" ? 1 : 4 });
      window.scrollTo(0, 0);
    },
    "goto-setup-step": () => goToSetupTarget(actionButton),
    "open-cell": () => {
      state.activeCell = actionButton.dataset.cell;
      save();
      render();
    },
    "start-setup": () => setState({ setupStep: 1 }),
    "profile-next": () => saveProfileAndContinue(),
    "add-custom-activity": () => handleFormSubmit(actionButton.closest("form")),
    "save-study-settings": () => saveStudySettings(),
    "accept-imported-data": () => setState({ setupStep: 4, usedImportedData: true }),
    "sync-school-data": () => showToast("已完成同步，目前資料是最新版本。"),
    "back-import": () => setState({ setupStep: 1 }),
    "load-demo": () => setState({ setupComplete: true, setupStep: 5, route: "today" }),
    "back-onboarding": () => setState({ setupStep: 0 }),
    "back-profile": () => { setState({ setupStep: 0 }); window.scrollTo(0, 0); },
    "generate-demo-timetable": () => generateDemoTimetable(),
    "timetable-next": () => continueFromTimetable(),
    "save-course-supplement": () => {
      const { sectionId, supplement } = currentSupplement();
      if (!sectionId) return;
      const note = document.querySelector("[data-supplement-note]")?.value || "";
      state.courseSupplements[sectionId] = { ...supplement, note, updatedAt: new Date().toISOString() };
      state.supplementUploadError = "";
      save();
      showToast(note.trim() || supplement.images.length ? "已儲存這門課的補充資料。" : "這門課目前沒有補充資料。");
    },
    "remove-supplement-image": () => {
      const { sectionId, supplement } = currentSupplement();
      if (!sectionId) return;
      const imageIndex = Number(actionButton.dataset.imageIndex);
      state.courseSupplements[sectionId] = { ...supplement, images: supplement.images.filter((_, index) => index !== imageIndex) };
      state.supplementUploadError = "";
      save();
      renderAtCurrentScroll();
    },
    "remove-course": () => {
      const current = state.timetable[state.activeCell];
      if (current?.type === "course") removeSection(current.sectionId);
      else delete state.timetable[state.activeCell];
      state.activeCell = "";
      document.querySelector(".modal-backdrop")?.remove();
      save();
      render();
    },
    "cancel-conflict": () => {
      state.pendingSectionId = "";
      state.activeCell = "";
      document.querySelector(".modal-backdrop")?.remove();
      save();
    },
    "confirm-section-replace": () => {
      const section = COURSE_CATALOG.find(item => item.id === state.pendingSectionId);
      if (!section) return;
      const conflicts = sectionConflicts(section);
      const oldSections = new Set(conflicts.map(cell => state.timetable[cell]).filter(item => item?.type === "course").map(item => item.sectionId));
      oldSections.forEach(removeSection);
      conflicts.forEach(cell => {
        if (state.timetable[cell]?.type === "custom") delete state.timetable[cell];
      });
      applySection(section);
      state.pendingSectionId = "";
      state.activeCell = "";
      document.querySelector(".modal-backdrop")?.remove();
      save();
      showToast(`已取代衝突行程並加入「${section.name}」。`);
    },
    "back-course": () => setState({ setupStep: 1 }),
    "confirm-assessment": () => setState({ setupStep: 4 }),
    "back-assessment": () => setState({ setupStep: 3 }),
    "back-availability": () => setState({ setupComplete: false, setupStep: 4 }),
    "finish-setup": () => finishSetup(),
    "start-task": () => {
      state.tasks = state.tasks.map(task => task.id === id ? { ...task, status: "in_progress", startedAt: new Date().toISOString() } : task);
      document.querySelector(".modal-backdrop")?.remove();
      showToast("任務已開始；完成後記得回報實際花費時間。");
    },
    "complete-task": () => openDynamicModal(completionModal(id)),
    "confirm-complete": () => {
      const form = document.querySelector("#completion-form");
      const data = new FormData(form);
      const actualMinutes = Number(data.get("actualMinutes")) || state.tasks.find(task => task.id === id)?.duration || 0;
      const difficulty = data.get("difficulty") || "符合預期";
      state.tasks = state.tasks.map(task => task.id === id ? { ...task, done: true, status: "done", completionProgress: 100, actualMinutes, completionDifficulty: difficulty } : task);
      document.querySelector(".modal-backdrop")?.remove();
      showToast("已記錄實際時間，回顧資料已更新。");
    },
    "undo-task": () => { state.tasks = state.tasks.map(task => task.id === id ? { ...task, done: false, status: "pending", completionProgress: 0 } : task); setState({ tasks: state.tasks }); },
    "set-task-progress": () => {
      const progress = Math.max(0, Math.min(100, Number(actionButton.dataset.progress) || 0));
      state.tasks = state.tasks.map(task => task.id === id ? {
        ...task,
        completionProgress: progress,
        done: progress === 100,
        status: progress === 100 ? "done" : progress > 0 ? "in_progress" : "pending",
        actualMinutes: progress === 100 ? (task.actualMinutes || task.duration) : task.actualMinutes,
      } : task);
      save();
      render();
    },
    "task-not-done": () => openDynamicModal(taskModal(id)),
    "preview-replan": () => {
      const task = state.tasks.find(item => item.id === id);
      const form = document.querySelector("#replan-feedback-form");
      const data = new FormData(form);
      const progress = data.get("progress") || "0";
      const remaining = data.get("remaining") || "0";
      state.pendingReplan = { taskId: id, reason: state.replanReason, progress, remaining };
      save();
      openDynamicModal(replanPreviewModal(task, state.replanReason, progress));
    },
    "close-modal": () => { state.activeCell = ""; state.pendingSectionId = ""; state.pendingReplan = null; document.querySelector(".modal-backdrop")?.remove(); save(); },
    "confirm-replan": () => {
      const before = state.tasks.find(task => task.id === id);
      const suggestedDate = dateForOffset(1);
      const suggestedDay = dayKeyForDate(suggestedDate);
      const suggestedLabel = shortDateLabel(suggestedDate);
      state.tasks = state.tasks.map(task => task.id === id ? { ...task, day: suggestedDay, dateLabel: suggestedLabel, time: "10:00–11:00", status: "rescheduled" } : task);
      state.replanCount += 1;
      state.planRevisions.push({ id: Date.now(), taskId: id, reason: state.pendingReplan?.reason || "整體負擔調整", before: `${before?.dateLabel} ${before?.time}`, after: `${suggestedLabel} 10:00–11:00`, applied: true });
      state.pendingReplan = null;
      document.querySelector(".modal-backdrop")?.remove();
      showToast("已套用重排，固定課程與生活行程沒有變動。");
    },
    "replan-all": () => {
      const task = state.tasks.find(item => !item.done && item.status !== "done");
      if (!task) return showToast("目前沒有需要重新安排的任務。");
      state.pendingReplan = { taskId: task.id, reason: "整體負擔調整", progress: "0", remaining: "0" };
      save();
      openDynamicModal(replanPreviewModal(task, "整體負擔調整", "0"));
    },
    "regenerate-plan": async () => {
      try {
        await runMockAnalysis();
        showToast("已依照目前課表重新配置每個可用時段。");
      } catch {
        showToast("暫時無法重新規劃，請稍後再試。");
      }
    },
    "previous-plan-week": () => {
      state.planWeekPage = Math.max(0, (Number(state.planWeekPage) || 0) - 1);
      save();
      render();
      window.scrollTo(0, 0);
    },
    "next-plan-week": () => {
      const weeks = Math.max(1, Math.ceil((planRangeDetails().days || 7) / 7));
      state.planWeekPage = Math.min(weeks - 1, (Number(state.planWeekPage) || 0) + 1);
      save();
      render();
      window.scrollTo(0, 0);
    },
    "go-plan-week": () => {
      const weeks = Math.max(1, Math.ceil((planRangeDetails().days || 7) / 7));
      state.planWeekPage = Math.min(weeks - 1, Math.max(0, Number(actionButton.dataset.weekPage) || 0));
      save();
      render();
      window.scrollTo(0, 0);
    },
    "open-task-detail": () => openDynamicModal(taskDetailModal(id)),
    "show-analysis-reasons": () => openDynamicModal(`<div class="modal-backdrop" role="dialog" aria-modal="true"><section class="modal stack-lg"><div class="row-between"><div><div class="eyebrow">Mock Analysis</div><h2 class="page-title">排程依據</h2></div><button class="btn ghost small-btn" data-action="close-modal">關閉</button></div><ul class="analysis-reason-list">${(state.analysis?.reasons || ["優先處理較不熟悉的課程", "避開固定課程與生活行程", "保留週末彈性時段"]).map(reason => `<li>${reason}</li>`).join("")}</ul></section></div>`),
    "open-course-detail": () => { state.activeCourseId = actionButton.dataset.sectionId; save(); render(); window.scrollTo(0, 0); },
    "close-course-detail": () => setState({ activeCourseId: "" }),
    "edit-learning-settings": () => setState({ setupComplete: false, setupStep: 4 }),
    "apply-review-suggestion": () => {
      const task = state.tasks.find(item => !item.done);
      if (task) openDynamicModal(replanPreviewModal(task, "依回顧建議縮短單次任務", "0"));
    },
    "go-today": () => setState({ route: "today" }),
    "review-assessment": () => setState({ setupComplete: false, setupStep: 3 }),
    "add-another": () => setState({ setupComplete: false, setupStep: 1 }),
    "reset-demo": () => { localStorage.removeItem(STORAGE_KEY); state = structuredClone(defaultState); render(); },
  };
  actions[action]?.();
}

function handleFormSubmit(formElement) {
  if (formElement.id === "custom-activity-form") {
    const title = new FormData(formElement).get("title")?.trim();
    if (!title) return;
    const existing = state.timetable[state.activeCell];
    if (existing?.type === "course") removeSection(existing.sectionId);
    state.timetable[state.activeCell] = { type: "custom", title };
    state.activeCell = "";
    document.querySelector(".modal-backdrop")?.remove();
    save();
    render();
    return;
  }
  if (formElement.id === "study-settings-form") {
    saveStudySettings(formElement);
    return;
  }
  if (formElement.id === "profile-form") {
    saveProfileAndContinue(formElement);
    return;
  }
  if (formElement.id !== "course-form") return;
  const form = new FormData(formElement);
  state.course = Object.fromEntries(form.entries());
  state.setupStep = 2;
  save();
  render();
  window.setTimeout(() => setState({ setupStep: 3 }), 1200);
}

document.addEventListener("submit", (event) => {
  event.preventDefault();
  handleFormSubmit(event.target);
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "supplement-images") {
    const { sectionId, supplement } = currentSupplement();
    if (!sectionId) return;
    const availableSlots = Math.max(0, 3 - supplement.images.length);
    const chosen = [...event.target.files].slice(0, availableSlots);
    const oversized = chosen.filter(file => file.size > 900 * 1024);
    const valid = chosen.filter(file => file.type.startsWith("image/") && file.size <= 900 * 1024);
    state.supplementUploadError = oversized.length
      ? `有 ${oversized.length} 張圖片超過 900 KB，請先壓縮後再上傳。`
      : availableSlots === 0
        ? "每門課最多上傳 3 張圖片。"
        : "";
    try {
      const images = await Promise.all(valid.map(readImageFile));
      state.courseSupplements[sectionId] = { ...supplement, images: [...supplement.images, ...images] };
      save();
      renderAtCurrentScroll();
    } catch {
      state.courseSupplements[sectionId] = supplement;
      state.supplementUploadError = "圖片讀取或儲存失敗，請縮小圖片後重新選擇。";
      try { save(); } catch {}
      renderAtCurrentScroll();
    }
    return;
  }
  if (updatePlanRange(event.target)) return;
  if (updateGlobalStudySetting(event.target)) return;
  if (updateCoursePreference(event.target)) return;
  if (event.target.id === "school") {
    const form = event.target.form;
    state.profile = { ...state.profile, ...Object.fromEntries(new FormData(form).entries()) };
    save();
    const support = document.querySelector("#school-support");
    if (support) {
      const isNcu = event.target.value === "ncu";
      support.classList.toggle("supported", isNcu);
      support.innerHTML = isNcu
        ? `<strong>中央大學資料可用</strong><span>下一頁可搜尋課號、課名或授課老師。</span>`
        : `<strong>選擇中央大學即可串接</strong><span>原型會先使用模擬課程資料，之後替換為後端 API。</span>`;
    }
    return;
  }
  if (event.target.form?.id === "profile-form" && event.target.name) {
    state.profile = { ...state.profile, [event.target.name]: event.target.value };
    save();
    return;
  }
  if (event.target.dataset.assessment) {
    state.assessment[event.target.dataset.assessment] = event.target.value;
    save();
  }
});

document.addEventListener("input", (event) => {
  if (updatePlanRange(event.target)) return;
  if (updateGlobalStudySetting(event.target)) return;
  if (updateCoursePreference(event.target)) return;
  if (event.target.matches("[data-supplement-note]")) {
    const { sectionId, supplement } = currentSupplement();
    if (!sectionId) return;
    state.courseSupplements[sectionId] = { ...supplement, note: event.target.value };
    save();
    return;
  }
  if (event.target.form?.id === "profile-form" && event.target.name) {
    state.profile = { ...state.profile, [event.target.name]: event.target.value };
    save();
    return;
  }
  if (event.target.id !== "course-search") return;
  const results = document.querySelector("#course-results");
  if (results) {
    results.innerHTML = courseResults(event.target.value, state.activeCell);
    bindInteractiveControls(results);
  }
});

document.addEventListener("click", (event) => {
  const reasonButton = event.target.closest("[data-reason]");
  if (reasonButton) {
    state.replanReason = reasonButton.dataset.reason;
    save();
    reasonButton.closest(".chips")?.querySelectorAll("[data-reason]").forEach(button => {
      const selected = button === reasonButton;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    return;
  }
  const calendarDayButton = event.target.closest("[data-calendar-day]");
  if (calendarDayButton) {
    state.calendarDay = calendarDayButton.dataset.calendarDay;
    save();
    render();
    return;
  }
  const supplementCourseOption = event.target.closest("[data-supplement-course-id]");
  if (supplementCourseOption) {
    state.supplementCourseId = supplementCourseOption.dataset.supplementCourseId;
    state.supplementUploadError = "";
    save();
    renderAtCurrentScroll();
    return;
  }
  const customOption = event.target.closest("[data-select-value]");
  if (customOption) {
    const customSelect = customOption.closest("[data-custom-select]");
    const input = customSelect?.querySelector("input[data-preference], input[data-global-preference]");
    if (!customSelect || !input) return;
    input.value = customOption.dataset.selectValue;
    customSelect.querySelector("[data-select-label]").textContent = customOption.textContent.trim();
    customSelect.querySelectorAll("[data-select-value]").forEach(option => {
      const selected = option === customOption;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-selected", String(selected));
    });
    const menu = customSelect.querySelector(".custom-select-menu");
    const trigger = customSelect.querySelector(".custom-select-trigger");
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    updateGlobalStudySetting(input) || updateCoursePreference(input);
    trigger.focus();
    return;
  }
  const customTrigger = event.target.closest(".custom-select-trigger");
  if (customTrigger) {
    const customSelect = customTrigger.closest("[data-custom-select]");
    const menu = customSelect.querySelector(".custom-select-menu");
    const willOpen = menu.hidden;
    document.querySelectorAll(".custom-select-menu:not([hidden])").forEach(openMenu => {
      openMenu.hidden = true;
      openMenu.closest("[data-custom-select]")?.querySelector(".custom-select-trigger")?.setAttribute("aria-expanded", "false");
    });
    menu.hidden = !willOpen;
    customTrigger.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) menu.querySelector(".selected")?.focus();
    return;
  }
  if (!event.target.closest("[data-custom-select]")) {
    document.querySelectorAll(".custom-select-menu:not([hidden])").forEach(menu => {
      menu.hidden = true;
      menu.closest("[data-custom-select]")?.querySelector(".custom-select-trigger")?.setAttribute("aria-expanded", "false");
    });
  }
  const viewModeButton = event.target.closest("[data-view-mode]");
  if (viewModeButton) {
    viewPreference = viewModeButton.dataset.viewMode;
    localStorage.setItem(VIEW_MODE_KEY, viewPreference);
    applyViewMode();
    render();
    return;
  }
  const navButton = event.target.closest("[data-nav]");
  if (navButton) return setState({ route: navButton.dataset.nav });
  const slot = event.target.closest("[data-slot]");
  if (slot) {
    const value = slot.dataset.slot;
    state.availability = state.availability.includes(value) ? state.availability.filter(x => x !== value) : [...state.availability, value];
    return setState({ availability: state.availability });
  }
  const courseOption = event.target.closest("[data-course-id]");
  if (courseOption) {
    handleCourseOption(courseOption);
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  handleActionButton(actionButton);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector(".modal-backdrop")) {
    state.activeCell = "";
    state.pendingSectionId = "";
    document.querySelector(".modal-backdrop")?.remove();
    save();
    event.preventDefault();
    return;
  }
  const customSelect = event.target.closest?.("[data-custom-select]");
  if (!customSelect) return;
  const menu = customSelect.querySelector(".custom-select-menu");
  const trigger = customSelect.querySelector(".custom-select-trigger");
  const options = [...customSelect.querySelectorAll("[data-select-value], [data-supplement-course-id]")];
  if (event.key === "Escape") {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
    event.preventDefault();
    return;
  }
  if (event.target === trigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    (menu.querySelector(".selected") || options[0])?.focus();
    event.preventDefault();
    return;
  }
  if (!event.target.matches?.("[data-select-value], [data-supplement-course-id]") || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
  const currentIndex = options.indexOf(event.target);
  const direction = event.key === "ArrowDown" ? 1 : -1;
  options[(currentIndex + direction + options.length) % options.length]?.focus();
  event.preventDefault();
});

if ("serviceWorker" in navigator) {
  let refreshingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshingForUpdate) return;
    refreshingForUpdate = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=44", { updateViaCache: "none" })
      .then(registration => registration.update())
      .catch(() => {});
  });
}

render();

if (state.setupComplete && selectedSections().length && state.analysis?.version !== window.NCUAnalysisEngine?.version) {
  runMockAnalysis().then(() => render()).catch(() => {});
}
