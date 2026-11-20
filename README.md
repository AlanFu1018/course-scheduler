# 學習規劃模組

需要 Node.js 24 以上。在專案目錄執行 `npm start`，開啟終端顯示的本機網址。畫面起初沒有排程或任務，首次產生成功後才顯示成果。

要產生新計畫，將 `.env.example` 複製為 `.env`，填入 `GEMINI_API_KEY`，再啟動伺服器。預設模型是 `gemini-3.1-flash-lite`。測試帳號 `u_0001` 的八門課使用 `test/data/我的課表.png` 的上課時段，課號、教學進度、評量與學習狀態是模擬資料。日期預填學期第一週，可自行調整。規劃請求會將課程與相關個人學習參數送至 Gemini，安排時段時會帶入本批可用時間。行事曆的私密訂閱網址與原始事件保留在本機。

## 模組串接

- 本機後端預設讀取 `test/data`。設定 `PLANNING_DB_PATH` 後改從現有 SQLite 資料庫讀取，帳號以畫面輸入的使用者 ID 選取。資料表結構參照 `doc`。
- 其他模組可直接使用 `src/data.ts` 的 `sqlitePlanningSource(db)` 或 `filePlanningSource(paths)`，再把 `load(userId)` 的回傳值交給 `src/planner.ts` 的 `generateInitialPlan(input, scope, llm)`。
- 檢視頁由 `viewer` 提供。規劃 API 是 `POST /api/plans`，接收 `{ user_id, scope: { from, to, course_keys } }`。日期使用 `YYYY-MM-DD`，空的 `course_keys` 代表該使用者在範圍內的所有啟用課程。回傳值包含 `schedule`、`tasks` 和 `schedule_blocks`。
- Gemini 先分析整段期間的每週重點，再以兩個日曆週為一批產生任務。全部任務估時完成後，Gemini 分批決定時段。跨批可以累計分鐘；只有完整排入的任務才會輸出時段。模型回應違規時，程式回報原因並請模型修正一次。
- 介面透過 `GET /api/planning-progress?user_id=…` 顯示批次進度。429 與 503 會參考服務端建議時間並退避重試最多三次。日配額不足或重試次數用盡時會暫停。使用相同帳號、模型、日期與輸入再次產生，即可從本機 `.planning-checkpoints.sqlite` 續跑；成功後清除該次暫存。

`npm test` 使用暫存 SQLite、檔案替身和固定的模型回應，可在沒有金鑰時執行。

完成的計畫和三階段資料存入本機 `.planning-checkpoints.sqlite`，以使用者 ID 和計畫 ID 查詢。頁面重新整理會載入最近一次成功的計畫。以下唯讀端點均需傳入 `?user_id=…`。

- `GET /api/plans` 列出歷次計畫 ID 與建立時間。
- `GET /api/plans/latest` 與 `GET /api/plans/{plan_id}` 讀取完整的最終排程、任務與時段。
- `GET /api/plans/{plan_id}/stages` 讀取逐週分析、各任務批次（含重點對應與核算估時）、各排程批次（含摘要與通過驗證的時段）。最終可執行時段以完整計畫的 `schedule_blocks` 為準。
