# Analysis Engine integration contract

The UI reads the planner through `window.NCUAnalysisEngine` and does not depend on the mock rules directly.

```js
window.NCUAnalysisEngine = {
  provider: "mock" | "fastapi",
  version: "string",
  analyzePlan: async input => analysisResult,
};
```

## Input

```json
{
  "courses": [{ "id": "course-id", "name": "課名", "code": "課號", "teacher": "老師", "meetings": [] }],
  "preferences": {
    "course-id": {
      "familiarity": "普通",
      "difficulty": "困難",
      "targetScore": "85",
      "sessionMinutes": "45",
      "dailyLimitMinutes": "120",
      "bufferDays": "7"
    }
  },
  "timetable": {},
  "assessment": {}
}
```

## Result

The result must contain `summary`, `courseInsights`, `reasons`, `warnings`, and `tasks`. Each task needs an id, day, date label, time, course information, title, duration, source, due date, priority, and scheduling rationale.

## FastAPI replacement

Replace `analysis-engine.js` with an adapter whose `analyzePlan(input)` calls the backend endpoint and returns the same result shape. The pages and interaction handlers do not need to change.

```js
window.NCUAnalysisEngine = {
  provider: "fastapi",
  version: "api-1",
  analyzePlan: async input => {
    const response = await fetch("/api/v1/plans/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("analysis_failed");
    return response.json();
  },
};
```
