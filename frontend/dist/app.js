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
  { id: "economics", subjectId: "economics", name: "經濟學", category: "general", code: "GE1001", teacher: "張李治華老師", meetings: [{ day: "fri", periods: ["6", "7"] }] },
  { id: "generative-ai", subjectId: "generative-ai", name: "生成式 AI", category: "general", code: "GE2001", teacher: "韓伯維老師", meetings: [{ day: "tue", periods: ["8", "9", "A"] }] },
];

const DEMO_SECTION_IDS = [
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
  courseSupplements: {},
  supplementCourseId: "",
  supplementUploadError: "",
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
    { id: 1, time: "19:00–19:45", course: "資料結構", title: "閱讀第一、二章", duration: 45, done: false },
    { id: 2, time: "20:00–21:00", course: "資料結構", title: "完成第三章練習題", duration: 60, done: false },
    { id: 3, time: "21:10–21:40", course: "離散數學", title: "複習命題邏輯", duration: 30, done: false },
  ],
  replanCount: 0,
  calendarDay: "thu",
  replanReason: "臨時有事",
  toast: "",
};

function loadState() {
  try {
    const loaded = { ...structuredClone(defaultState), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
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
  return `<header class="topbar"><div class="topbar-title"><div class="brand">NCU AI 智慧讀書規劃器</div>${title ? `<div class="small muted">${title}</div>` : ""}</div><div class="topbar-actions">${action}${viewSwitcher()}</div></header>`;
}

function nav() {
  if (!state.setupComplete) return "";
  const items = [
    ["today", "今天"], ["calendar", "行事曆"], ["courses", "課程"], ["progress", "進度"],
  ];
  return `<nav class="nav" aria-label="主要導覽">${items.map(([route, label]) => `<button class="nav-btn ${state.route === route ? "active" : ""}" data-nav="${route}">${label}</button>`).join("")}</nav>`;
}

function setupSidebar() {
  if (state.setupComplete) return "";
  const current = logicalStageForSetupStep(state.setupStep);
  const steps = [
    [1, 0, "基本資料", "學校、系所與年級"],
    [2, 1, "建立課表", "課程與固定行程"],
    [3, 4, "學習狀況", "各科讀書條件"],
    [4, 5, "設定完成", "確認規劃輸入"],
  ];
  return `<aside class="setup-sidebar"><div class="sidebar-brand"><strong>NCU AI</strong><span>智慧讀書規劃器</span></div><div class="sidebar-label">設定流程</div><nav class="setup-steps" aria-label="設定流程">${steps.map(([stage, target, label, description]) => {
    const locked = stage > state.highestSetupStage;
    const active = stage === current;
    return `<button type="button" class="setup-step ${active ? "active" : ""} ${stage < current || (!locked && !active) ? "complete" : ""}" data-action="goto-setup-step" data-setup-target="${target}" data-stage="${stage}" ${locked ? "disabled" : ""} ${active ? `aria-current="step"` : ""}><span class="setup-step-number">${stage}</span><span><strong>${label}</strong><small>${description}</small></span></button>`;
  }).join("")}</nav><div class="sidebar-note">已完成的步驟可以返回修改，尚未完成的步驟會保持鎖定。</div></aside>`;
}

function shell(content, title = "", action = "") {
  const sidebar = setupSidebar();
  return `<div class="app-frame ${sidebar ? "setup-frame" : ""}">${sidebar}<div class="shell">${topbar(title, action)}${content}${nav()}</div></div>${state.toast ? `<div class="toast">${state.toast}</div>` : ""}`;
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
      <div class="field"><label for="department">系所</label><input id="department" name="department" required placeholder="例如：資訊工程學系" value="${state.profile.department}" /></div>
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
    <aside class="timetable-actions"><div class="desktop-action-summary"><strong>課表設定</strong><span>確認課程與固定行程後，再設定各科讀書條件。</span></div><button class="btn primary block" data-action="timetable-next">確認課表，繼續</button><button class="btn secondary block" data-action="back-profile">返回基本資料</button><div class="demo-generator"><span>開發測試捷徑</span><button class="btn demo block" data-action="generate-demo-timetable">一鍵生成示範課表</button><small>自動加入 5 門必修、2 門通識、彈鋼琴與打籃球，且不會撞堂。</small></div></aside></div>
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
    sessionMinutes: "45",
    dailyLimitMinutes: "120",
    bufferDays: "7",
    ...(state.coursePreferences?.[sectionId] || {}),
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

function courseResults(query = "") {
  const term = query.trim().toLowerCase();
  return COURSE_CATALOG.filter(course => [course.code, course.name, course.teacher].some(value => value.toLowerCase().includes(term))).map(course => {
    const selected = Object.values(state.timetable).some(item => item?.type === "course" && item.sectionId === course.id);
    return `<button class="course-option ${selected ? "selected" : ""}" data-course-id="${course.id}"><div class="course-option-main"><div class="row course-option-title"><span class="course-category ${course.category}">${course.category === "required" ? "必修" : "通識"}</span><strong>${course.name}</strong>${selected ? `<span class="status confirmed">已加入</span>` : ""}</div><span>${course.code}・${course.teacher}</span><span class="course-times">${formatSectionTimes(course)}</span></div></button>`;
  }).join("") || `<div class="empty-results">找不到符合的課程</div>`;
}

function coursePicker(cell) {
  const [day, period] = cell.split("-");
  const dayLabel = DAYS.find(([value]) => value === day)?.[1];
  const time = PERIODS.find(([value]) => value === period)?.[1];
  const current = state.timetable[cell];
  const currentSection = current?.type === "course" ? COURSE_CATALOG.find(item => item.id === current.sectionId) : null;
  const removeLabel = currentSection ? `移除整門「${currentSection.name}」` : current?.type === "custom" ? "移除此格行程" : "";
  return `<div class="modal-backdrop course-picker-backdrop" role="dialog" aria-modal="true"><section class="modal course-picker"><div class="picker-handle"></div><div class="row-between"><div><div class="eyebrow">星期${dayLabel}・第 ${period} 節</div><h2 class="section-title">${time}</h2></div><button class="btn ghost small-btn" data-action="close-modal">關閉</button></div><div class="picker-note">點選任一班別後，系統會依該班完整時段一次填入課表。</div><form id="custom-activity-form" class="custom-activity"><div><strong>加入其他行程</strong><span>運動、社團、打工、用餐等都會占用此時段</span></div><div class="custom-input-row"><input id="custom-activity" name="title" required autocomplete="off" placeholder="例如：彈鋼琴" /><button class="btn secondary" type="submit">加入</button></div></form><div class="picker-divider"><span>或選擇學校課程</span></div><div class="search-field"><input id="course-search" type="search" autocomplete="off" placeholder="搜尋課號、課名或老師" aria-label="搜尋課程" /></div><div id="course-results" class="course-results">${courseResults()}</div>${removeLabel ? `<button class="btn danger block" data-action="remove-course">${removeLabel}</button>` : ""}</section></div>`;
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
      <div class="field"><label for="${section.id}-session">單次讀書長度</label>${preferenceDropdown(section.id, "sessionMinutes", `${section.id}-session`, [["25","25 分鐘"],["45","45 分鐘"],["60","60 分鐘"],["90","90 分鐘"]], preference.sessionMinutes)}</div>
      <div class="field"><label for="${section.id}-daily-limit">單日安排上限</label>${preferenceDropdown(section.id, "dailyLimitMinutes", `${section.id}-daily-limit`, [["60","1 小時"],["90","1.5 小時"],["120","2 小時"],["180","3 小時"]], preference.dailyLimitMinutes)}</div>
      <div class="field"><label for="${section.id}-buffer">考前預留天數</label><div class="input-unit"><input id="${section.id}-buffer" data-preference="bufferDays" data-section-id="${section.id}" type="number" inputmode="numeric" min="1" max="30" value="${preference.bufferDays}" /><span>天</span></div></div>
    </div>
  </article>`;
}

function availabilitySetup() {
  const sections = selectedSections();
  return shell(`<section class="content stack-lg study-settings-page">${setupProgress(3)}<div><div class="eyebrow">步驟 3／4・學習狀況設定</div><h1 class="page-title">調整每門課的讀書條件</h1><p class="muted">這些設定會成為 AI 安排讀書任務的依據，之後都可以再修改。</p></div><div class="settings-summary"><strong>${sections.length} 門課需要設定</strong><span>自訂行程只用來占用時間，不會產生讀書任務。</span></div><form id="study-settings-form" class="stack-lg"><div class="preference-cards">${sections.map(coursePreferenceCard).join("")}</div>${courseSupplementSection(sections)}<div class="settings-form-actions"><button class="btn primary" type="button" data-action="save-study-settings">儲存設定，繼續</button><button class="btn secondary" type="button" data-action="back-import">返回課表</button></div></form></section>`, "學習狀況設定");
}

function saveStudySettings(form = document.querySelector("#study-settings-form")) {
  form?.querySelectorAll("[data-preference]").forEach(updateCoursePreference);
  state.setupStep = 5;
  state.highestSetupStage = Math.max(state.highestSetupStage, 4);
  save();
  render();
  window.scrollTo(0, 0);
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

function generateDemoTimetable() {
  state.timetable = {};
  DEMO_SECTION_IDS.forEach(sectionId => {
    const section = COURSE_CATALOG.find(item => item.id === sectionId);
    if (section) applySection(section);
  });
  state.timetable["sat-5"] = { type: "custom", title: "彈鋼琴" };
  state.timetable["sat-7"] = { type: "custom", title: "打籃球" };
  save();
  showToast("已生成無衝堂示範課表：5 門必修、2 門通識與 2 個行程。");
}

function continueFromTimetable() {
  if (!selectedSections().length) return showToast("請至少加入一門學校課程。");
  state.highestSetupStage = Math.max(state.highestSetupStage, 3);
  setState({ setupStep: 4, usedImportedData: true, highestSetupStage: state.highestSetupStage });
}

function planReady() {
  const count = selectedSections().length;
  return shell(`<section class="content stack-lg completion-page">${setupProgress(4)}<div><div class="eyebrow">步驟 4／4</div><h1 class="page-title">學習設定已完成</h1><p class="muted">系統已保存各科條件，後續將配合考試資訊與課表空堂安排任務。</p></div><div class="card primary-soft stack"><div class="row-between"><strong>本學期讀書設定</strong><span class="status confirmed">已確認</span></div><div class="row-between small"><span>已設定科目</span><strong>${count} 門</strong></div><div class="row-between small"><span>個人化條件</span><strong>熟悉度、難度、目標成績</strong></div><div class="row-between small"><span>任務節奏</span><strong>單次長度、單日上限、預留天數</strong></div></div><div class="completion-actions"><button class="btn primary" data-action="finish-setup">查看今天計畫</button><button class="btn secondary" data-action="back-availability">修改學習設定</button></div></section>`, "設定完成");
}

function todayPage() {
  const complete = state.tasks.filter(t => t.done).length;
  return shell(`<section class="content stack-lg"><div><div class="eyebrow">今天</div><h1 class="page-title">先完成最重要的三件事</h1><p class="muted">${state.replanCount ? `系統已重新安排 ${state.replanCount} 次。` : "若今天做不完，可以直接要求重新安排。"}</p></div><div class="card soft stack"><div class="row-between"><strong>今日完成度</strong><span>${complete}／${state.tasks.length}</span></div><div class="progress"><span style="width:${Math.round(complete/state.tasks.length*100)}%"></span></div><div class="row-between small muted"><span>預計投入</span><span>2 小時 15 分</span></div></div><div class="stack"><div class="row-between"><h2 class="section-title">今日任務</h2><button class="btn ghost small-btn" data-action="replan-all">重新排程</button></div>${state.tasks.map(taskCard).join("")}</div></section>`, "11月19日・星期四", `<button class="btn ghost small-btn" data-action="reset-demo">重設</button>`);
}

function taskCard(task) {
  return `<article class="task ${task.done ? "done" : ""}"><div><div class="task-time">${task.time}</div><div class="small muted">${task.course}・${task.duration}分鐘</div><h3>${task.title}</h3></div>${task.done ? `<div class="row-between"><span class="status confirmed">已完成</span><button class="btn ghost small-btn" data-action="undo-task" data-id="${task.id}">復原</button></div>` : `<div class="button-grid"><button class="btn secondary small-btn" data-action="task-not-done" data-id="${task.id}">今天做不完</button><button class="btn primary small-btn" data-action="complete-task" data-id="${task.id}">標記完成</button></div>`}</article>`;
}

function calendarPage() {
  const days = [["thu", "星期四"], ["fri", "星期五"], ["sat", "星期六"]];
  const tasks = state.calendarDay === "thu" ? state.tasks : [];
  const timeline = tasks.length
    ? tasks.map(t => `<div class="timeline-row"><div class="timeline-time">${t.time.split("–")[0]}</div><div class="timeline-body"><div class="timeline-block"><strong>${t.course}</strong><div class="small">${t.title}</div></div></div></div>`).join("")
    : `<div class="card soft small"><strong>這天還沒有讀書任務</strong><br>正式版會依課表空堂與截止日期自動安排。</div>`;
  return shell(`<section class="content stack-lg"><div><div class="eyebrow">本週</div><h1 class="page-title">讀書行事曆</h1><p class="muted">先以單日時間軸確認流程，之後再加入完整週曆。</p></div><div class="chips">${days.map(([value, label]) => `<button type="button" class="chip ${state.calendarDay === value ? "active" : ""}" data-calendar-day="${value}" aria-pressed="${state.calendarDay === value}">${label}</button>`).join("")}</div><div class="timeline">${timeline}</div><button type="button" class="btn secondary block" data-action="go-today">回到今日任務</button></section>`, "行事曆");
}

function coursesPage() {
  return shell(`<section class="content stack-lg"><div><div class="eyebrow">課程</div><h1 class="page-title">本學期課程</h1></div><div class="card stack"><div class="row-between"><div><strong>${state.course.name}</strong><div class="small muted">${state.course.teacher}・${state.course.classTime}</div></div><span class="status confirmed">已分析</span></div><div class="row-between small"><span>最近評量</span><strong>${state.assessment.title}・${state.assessment.week}</strong></div><div class="row-between small"><span>熟悉程度</span><strong>${state.familiarity}</strong></div><button class="btn secondary block" data-action="review-assessment">查看課綱分析</button></div><button class="btn primary block" data-action="add-another">新增另一門課</button></section>`, "課程管理");
}

function progressPage() {
  const complete = state.tasks.filter(t => t.done).length;
  return shell(`<section class="content stack-lg"><div><div class="eyebrow">進度</div><h1 class="page-title">學習狀況</h1></div><div class="button-grid"><div class="card soft metric"><span class="small muted">已完成任務</span><strong>${complete}</strong></div><div class="card soft metric"><span class="small muted">重新排程</span><strong>${state.replanCount}</strong></div></div><div class="card stack"><div class="row-between"><strong>${state.course.name}</strong><span>${Math.round(complete/state.tasks.length*100)}%</span></div><div class="progress"><span style="width:${Math.round(complete/state.tasks.length*100)}%"></span></div><div class="small muted">原型階段先以任務完成率表示；正式版可加入實際時間、預估誤差與章節熟悉度。</div></div><div class="card warning small"><strong>下一步建議</strong><br>${complete < state.tasks.length ? "先完成今天尚未完成的任務，再評估是否調整週末時段。" : "今日任務已完成，可以進行短時間回顧或提早休息。"}</div></section>`, "進度與回饋");
}

function taskModal(id) {
  const task = state.tasks.find(t => t.id === id);
  const reasons = ["臨時有事", "任務比預期困難", "身體狀況不佳"];
  return `<div class="modal-backdrop" role="dialog" aria-modal="true"><section class="modal stack-lg"><div><div class="eyebrow">動態重新排程</div><h2 class="page-title">今天為什麼做不完？</h2><p class="muted">${task.title}</p></div><div class="chips">${reasons.map(reason => `<button type="button" class="chip ${state.replanReason === reason ? "active" : ""}" data-reason="${reason}" aria-pressed="${state.replanReason === reason}">${reason === "任務比預期困難" ? "比預期困難" : reason === "身體狀況不佳" ? "狀況不佳" : reason}</button>`).join("")}</div><div class="button-grid"><button type="button" class="btn secondary" data-action="close-modal">取消</button><button type="button" class="btn primary" data-action="confirm-replan" data-id="${id}">移到下一個空堂</button></div></section></div>`;
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
  app.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      handleActionButton(button);
    });
  });
  if (!state.setupComplete && state.setupStep === 1) {
    if (state.pendingSectionId) {
      const section = COURSE_CATALOG.find(item => item.id === state.pendingSectionId);
      if (section) document.body.insertAdjacentHTML("beforeend", conflictModal(section, sectionConflicts(section)));
    } else if (state.activeCell) {
      document.body.insertAdjacentHTML("beforeend", coursePicker(state.activeCell));
    }
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

function handleActionButton(actionButton) {
  const action = actionButton.dataset.action;
  const id = Number(actionButton.dataset.id);
  const actions = {
    "goto-setup-step": () => goToSetupTarget(actionButton),
    "open-cell": () => {
      state.activeCell = actionButton.dataset.cell;
      save();
      render();
      window.setTimeout(() => document.querySelector("#course-search")?.focus(), 80);
    },
    "start-setup": () => setState({ setupStep: 1 }),
    "profile-next": () => saveProfileAndContinue(),
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
    "finish-setup": () => setState({ setupComplete: true, route: "today" }),
    "complete-task": () => { state.tasks = state.tasks.map(t => t.id === id ? { ...t, done: true } : t); showToast("已記錄完成，進度已更新。 "); },
    "undo-task": () => { state.tasks = state.tasks.map(t => t.id === id ? { ...t, done: false } : t); setState({ tasks: state.tasks }); },
    "task-not-done": () => { document.body.insertAdjacentHTML("beforeend", taskModal(id)); },
    "close-modal": () => { state.activeCell = ""; state.pendingSectionId = ""; document.querySelector(".modal-backdrop")?.remove(); save(); },
    "confirm-replan": () => { state.tasks = state.tasks.map(t => t.id === id ? { ...t, time: "週六 10:00–11:00" } : t); state.replanCount += 1; document.querySelector(".modal-backdrop")?.remove(); showToast("已移到週六上午，其他任務沒有變動。 "); },
    "replan-all": () => { state.replanCount += 1; showToast("已重新檢查空堂，目前計畫仍可完成。 "); },
    "go-today": () => setState({ route: "today" }),
    "review-assessment": () => setState({ setupComplete: false, setupStep: 3 }),
    "add-another": () => setState({ setupComplete: false, setupStep: 1 }),
    "reset-demo": () => { localStorage.removeItem(STORAGE_KEY); state = structuredClone(defaultState); render(); },
  };
  actions[action]?.();
}

document.addEventListener("submit", (event) => {
  if (event.target.id === "custom-activity-form") {
    event.preventDefault();
    const title = new FormData(event.target).get("title")?.trim();
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
  if (event.target.id === "study-settings-form") {
    event.preventDefault();
    saveStudySettings(event.target);
    return;
  }
  if (event.target.id === "profile-form") {
    event.preventDefault();
    saveProfileAndContinue(event.target);
    return;
  }
  if (event.target.id !== "course-form") return;
  event.preventDefault();
  const form = new FormData(event.target);
  state.course = Object.fromEntries(form.entries());
  state.setupStep = 2;
  save();
  render();
  window.setTimeout(() => setState({ setupStep: 3 }), 1200);
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
  if (results) results.innerHTML = courseResults(event.target.value);
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
    const input = customSelect?.querySelector("input[data-preference]");
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
    updateCoursePreference(input);
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
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

render();
