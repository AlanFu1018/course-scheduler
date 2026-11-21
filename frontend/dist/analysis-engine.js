(function attachMockAnalysisEngine(global) {
  const VERSION = "mock-2.0.0";
  const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const JS_DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const DAY_LABELS = { sun: "日", mon: "一", tue: "二", wed: "三", thu: "四", fri: "五", sat: "六" };
  const PERIODS = [
    ["1", "08:00–08:50"], ["2", "09:00–09:50"], ["3", "10:00–10:50"],
    ["4", "11:00–11:50"], ["Z", "12:00–12:50"], ["5", "13:00–13:50"],
    ["6", "14:00–14:50"], ["7", "15:00–15:50"], ["8", "16:00–16:50"],
    ["9", "17:00–17:50"], ["A", "18:00–18:50"], ["B", "19:00–19:50"],
    ["C", "20:00–20:50"], ["D", "21:00–21:50"], ["E", "22:00–22:50"],
    ["F", "23:00–23:50"],
  ];
  const STUDY_SLOT_PREFERENCE = ["3", "5", "7", "B", "9", "D", "1", "6", "C", "8", "4", "2"];
  const TASK_TEMPLATES = [
    { type: "review", title: "整理本週重點與核心觀念", source: "課綱範圍與熟悉度" },
    { type: "practice", title: "完成章節練習題", source: "課程難度與目標成績" },
    { type: "review", title: "複習易錯觀念並整理筆記", source: "熟悉度與考前預留天數" },
    { type: "practice", title: "進行限時練習與訂正", source: "評量占比與剩餘時間" },
    { type: "preview", title: "預習下一章並列出問題", source: "課程進度與可用空堂" },
  ];

  function weekDateForDay(day) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay();
    const date = new Date(today);
    date.setDate(today.getDate() + mondayOffset + DAY_KEYS.indexOf(day));
    return date;
  }

  function dateLabelForDay(day) {
    const date = weekDateForDay(day);
    return `${date.getMonth() + 1}/${date.getDate()}（${DAY_LABELS[day]}）`;
  }

  function courseScore(course, preferences) {
    const preference = preferences[course.id] || {};
    const difficulty = { "非常困難": 4, "困難": 3, "普通": 2, "簡單": 1 }[preference.difficulty] || 2;
    const familiarity = { "不熟悉": 3, "普通": 2, "熟悉": 1 }[preference.familiarity] || 2;
    const target = Number(preference.targetScore) || 85;
    return difficulty * 3 + familiarity * 2 + target / 20;
  }

  function planningSlots(input) {
    const occupied = new Set(Object.keys(input.timetable || {}).filter(cell => input.timetable[cell]));
    return DAY_KEYS.flatMap(day => {
      const target = day === "sat" || day === "sun" ? 4 : 3;
      return STUDY_SLOT_PREFERENCE
        .filter(period => !occupied.has(`${day}-${period}`))
        .slice(0, target)
        .map(period => ({ day, period, time: PERIODS.find(([id]) => id === period)?.[1] || "" }));
    });
  }

  function analyzePlan(input) {
    const courses = input.courses || [];
    const preferences = input.preferences || {};
    const pickedCourses = (courses.length ? courses : [{ id: "sample", name: "示範課程", teacher: "", code: "DEMO" }])
      .slice()
      .sort((a, b) => courseScore(b, preferences) - courseScore(a, preferences));
    const slots = planningSlots(input);
    const todayKey = JS_DAY_KEYS[new Date().getDay()];
    const tasks = slots.map((slot, index) => {
      const course = pickedCourses[index % pickedCourses.length];
      const preference = preferences[course.id] || {};
      const template = TASK_TEMPLATES[index % TASK_TEMPLATES.length];
      const priority = courseScore(course, preferences) >= 13 ? "high" : "normal";
      return {
        id: Date.now() + index,
        day: slot.day,
        period: slot.period,
        dateLabel: dateLabelForDay(slot.day),
        time: slot.time,
        courseId: course.id,
        course: course.name,
        title: template.title,
        type: template.type,
        source: template.source,
        duration: 50,
        estimatedMinutes: 50,
        actualMinutes: null,
        dueDate: index < pickedCourses.length ? "下次評量前" : "本週結束前",
        priority,
        rationale: `這是課表中的可用時段；${course.name}目前熟悉度為「${preference.familiarity || "普通"}」、難度為「${preference.difficulty || "普通"}」，因此安排此項任務。`,
        status: "pending",
        done: false,
      };
    });
    const totalMinutes = tasks.reduce((sum, task) => sum + task.duration, 0);
    const courseInsights = pickedCourses.map(course => {
      const preference = preferences[course.id] || {};
      const courseTasks = tasks.filter(task => task.courseId === course.id);
      return {
        courseId: course.id,
        name: course.name,
        minutes: courseTasks.reduce((sum, task) => sum + task.duration, 0),
        taskCount: courseTasks.length,
        familiarity: preference.familiarity || "普通",
        difficulty: preference.difficulty || "普通",
        targetScore: preference.targetScore || "85",
      };
    });
    return {
      provider: "mock",
      version: VERSION,
      generatedAt: new Date().toISOString(),
      summary: {
        totalTasks: tasks.length,
        totalMinutes,
        todayTasks: tasks.filter(task => task.day === todayKey).length,
        todayMinutes: tasks.filter(task => task.day === todayKey).reduce((sum, task) => sum + task.duration, 0),
        allocatedSlots: tasks.length,
        highPriorityCourse: courseInsights[0]?.name || "尚未設定",
      },
      courseInsights,
      warnings: [`已為 ${tasks.length} 個可用時段安排具體任務；其餘時段會標示固定課程、生活行程、休息或彈性時間。`],
      reasons: ["先鎖定學校課程與自訂生活行程", "再把可用時段分配給較不熟悉或較困難的科目", "每天保留午餐、休息與彈性時間，避免把所有空堂塞滿"],
      tasks,
    };
  }

  global.NCUAnalysisEngine = {
    provider: "mock",
    version: VERSION,
    analyzePlan: async input => analyzePlan(input),
  };
})(window);
