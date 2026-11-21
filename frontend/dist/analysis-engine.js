(function attachMockAnalysisEngine(global) {
  const VERSION = "mock-1.0.0";
  const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

  function offsetDate(offset) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return date;
  }

  function slotFor(offset, time) {
    const date = offsetDate(offset);
    return {
      day: DAY_KEYS[date.getDay()],
      dateLabel: `${date.getMonth() + 1}/${date.getDate()}（${DAY_LABELS[date.getDay()]}）`,
      time,
    };
  }

  function planningSlots() {
    return [
      slotFor(0, "19:00–19:45"),
      slotFor(0, "20:00–21:00"),
      slotFor(0, "21:10–21:40"),
      slotFor(1, "19:00–19:45"),
      slotFor(2, "10:00–11:00"),
    ];
  }
  const TASK_TEMPLATES = [
    { type: "review", title: "整理本週重點與核心觀念", source: "課綱範圍與熟悉度" },
    { type: "practice", title: "完成章節練習題", source: "課程難度與目標成績" },
    { type: "review", title: "複習易錯觀念並整理筆記", source: "熟悉度與考前預留天數" },
    { type: "practice", title: "進行限時練習與訂正", source: "評量占比與剩餘時間" },
    { type: "preview", title: "預習下一章並列出問題", source: "課程進度與可用空堂" },
  ];

  function numberValue(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function taskDuration(preference, index) {
    const base = numberValue(preference.sessionMinutes, index === 1 || index === 4 ? 60 : 45);
    const difficultyBoost = preference.difficulty === "非常困難" ? 15 : preference.difficulty === "困難" ? 10 : 0;
    const familiarityAdjustment = preference.familiarity === "熟悉" ? -10 : preference.familiarity === "不熟悉" ? 10 : 0;
    return Math.max(25, Math.min(90, base + difficultyBoost + familiarityAdjustment));
  }

  function analyzePlan(input) {
    const courses = input.courses || [];
    const preferences = input.preferences || {};
    const pickedCourses = courses.length ? courses.slice(0, 5) : [{ id: "sample", name: "示範課程", teacher: "", code: "DEMO" }];
    const slots = planningSlots();
    const todayKey = DAY_KEYS[new Date().getDay()];
    const tasks = slots.map((slot, index) => {
      const course = pickedCourses[index % pickedCourses.length];
      const preference = preferences[course.id] || {};
      const duration = taskDuration(preference, index);
      const template = TASK_TEMPLATES[index];
      const priority = preference.difficulty === "非常困難" || preference.familiarity === "不熟悉" ? "high" : index < 2 ? "high" : "normal";
      return {
        id: Date.now() + index,
        day: slot.day,
        dateLabel: slot.dateLabel,
        time: slot.time,
        courseId: course.id,
        course: course.name,
        title: template.title,
        type: template.type,
        source: template.source,
        duration,
        estimatedMinutes: duration,
        actualMinutes: null,
        dueDate: index < 3 ? "下次評量前" : "本週結束前",
        priority,
        rationale: `${course.name}目前設定為「${preference.familiarity || "普通"}」、難度「${preference.difficulty || "普通"}」，安排在不與固定行程衝突的時段。`,
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
        highPriorityCourse: courseInsights[0]?.name || "尚未設定",
      },
      courseInsights,
      warnings: totalMinutes > 420 ? ["本週任務負擔偏高，建議保留至少一個彈性時段。"] : ["目前負擔適中，仍保留週末調整空間。"],
      reasons: ["優先處理較不熟悉或較困難的課程", "避開學校課程與自訂生活行程", "將高優先任務安排在較早的可用時段"],
      tasks,
    };
  }

  global.NCUAnalysisEngine = {
    provider: "mock",
    version: VERSION,
    analyzePlan: async input => analyzePlan(input),
  };
})(window);
