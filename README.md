# 學習規劃模組

需要 Node.js 24 以上。在專案目錄執行 `npm start`，開啟終端顯示的本機網址。畫面起初沒有排程或任務，首次產生成功後才顯示成果。

要產生新計畫，將 `.env.example` 複製為 `.env`，填入 `GEMINI_API_KEY`，再啟動伺服器。預設模型是 `gemini-3.1-flash-lite`。測試帳號 `u_0001` 的八門課使用 `test/data/我的課表.png` 的上課時段，課號、教學進度、評量與學習狀態是模擬資料。日期預填學期第一週，可自行調整。Gemini 依目標成績、掌握度、難度與學習速度估時。可用分鐘數、行事曆的私密訂閱網址與原始事件保留在本機。程式不會要求模型為了配合容量縮短估時。

## 模組串接

- 本機後端預設讀取 `test/data`。設定 `PLANNING_DB_PATH` 後改從現有 SQLite 資料庫讀取，帳號以畫面輸入的使用者 ID 選取。資料表結構參照 `doc`。
- 其他模組可直接使用 `src/data.ts` 的 `sqlitePlanningSource(db)` 或 `filePlanningSource(paths)`，再把 `load(userId)` 的回傳值交給 `src/planner.ts` 的 `generateInitialPlan(input, scope, llm)`。直接呼叫時預設在記憶體執行；要保存草稿與批次進度，可參照 `src/server.ts` 傳入 `checkpointRun`。
- 檢視頁由 `viewer` 提供。規劃 API 是 `POST /api/plans`，接收 `{ user_id, scope: { from, to, course_keys } }`。日期使用 `YYYY-MM-DD`，空的 `course_keys` 代表該使用者在範圍內的所有啟用課程。完成的計畫包含 `schedule`、`tasks` 和 `schedule_blocks`。
- Gemini 先分析整段期間的每週重點，再以兩個日曆週為一批產生任務。任務內容、重點對應或期限違規時，程式請模型修正一次。所有批次完成後，後端才核對各日期區間的總需求與共用容量。通過檢查後，由後端依截止日與優先度安排時段，必要時提前預習。實際排程還須滿足每段長度與休息限制。只有完整排入的任務才會輸出時段。
- 介面透過 `GET /api/planning-progress?user_id=…` 顯示批次進度。429 與 503 會參考服務端建議時間並退避重試最多三次。日配額不足或重試次數用盡時會暫停。使用相同帳號、模型、日期與輸入再次產生，即可從本機 `.planning-checkpoints.sqlite` 續跑；成功後清除該次暫存。

`npm test` 使用暫存 SQLite、檔案替身和固定的模型回應，可在沒有金鑰時執行。

## 時間不足時如何決定

若整段期間的時間不足、有超載區間或任務沒有可排日期，`POST /api/plans` 會在排程前以 HTTP 200 回傳 `status: "needs_decision"`、`draft_id`、`scope`、全部待排的 `tasks`、`overall`、`short_term` 及中文摘要 `message`。兩種缺口可同時出現。草稿及其任務重點儲存在本機 `.planning-checkpoints.sqlite`。使用預設資料來源時，可在 `test/data/3_user_state.json` 編輯學習設定。

- **整體時間不足**　整段規劃期間的需求超過容量，或有至少 28 個日曆天（含首尾）的超載區間時，`overall` 會列出整段期間的分鐘數及長區間的缺口。例如學期總時間夠用時，整段的 `missing_minutes` 為零，仍可在 `intervals` 看到較早期限的缺口。其餘情況下 `overall` 為 `null`。請依 `adjust_regular_time.weekly_extra_minutes` 增加每週可用時間。若 `raise_daily_max_to` 有值，沿用現有時段並將平常規則的每日上限至少提高到該值即可補足整體缺口。可複製建議的 `availability_rule` 修改學習設定中原本的規則。若期間內有多條平常規則，各自保留原有效日期與時段。若只提高上限仍不足，請擴充每週時段並確認每日上限足夠。
- **短期時間不足**　`short_term` 列出少於 28 天的超載區間、各科所需分鐘數及建議，沒有短期缺口時為空陣列。若整段期間也不足，另列起始可排日較晚或每週平均缺口較大的短區間；沒有可排日期的任務也會列出原因。若 `add_time` 有值，請新增該區間的非常時期規則。同日有多條有效規則時，起日較晚者優先；同起日採用最後加入的規則。若其中的 `raise_daily_max_to` 是 `null`，還需依 `extra_minutes_per_day` 擴充規則中的 `weekly_slots`。若日期限制使加開時段不可行，`add_time` 為 `null`。衝刺任務也可能有 `extend_exam_buffer` 建議，可將考前保留期延長至能補足該區間的最少天數（最多 21 天）。儲存時段或保留期設定後，按「我已調整學習設定，重新排程」。
- **接受待排**　按「接受，低優先度任務留在待排」。排程器沿用原估時，在超載區間優先保留高優先度任務，並在待排任務記錄原因。
- **降低目標成績**　在學習設定的資料來源調整相關課程的 `target_grade`，再按「產生計畫」。這會重新呼叫 Gemini，依新目標產生任務。

重新排程及接受待排使用 `POST /api/plans/drafts/{draft_id}/decision`，JSON 請求為 `{ "user_id": "u_0001", "action": "reschedule" }` 或將 `action` 設為 `"accept_pending"`。兩者都重新讀取目前設定、沿用已產生的任務，無須呼叫 Gemini。`reschedule` 若仍有缺口，以相同草稿 ID 回傳更新後的數字。成功排程會沿用原計畫 ID 與建立時間，儲存完整計畫和各階段資料，並刪除草稿。草稿不存在或屬於其他帳號時回傳 HTTP 404。

## 依目前狀況重新排程

有計畫後可按「依目前狀況重新排程」，或呼叫 `POST /api/plans/latest/adjust`，傳入 `{ "user_id": "u_0001" }`。完成回饋或漏做檢查回傳 `reschedule.needed` 時，可將其中的 `trigger` 和 `trigger_ref` 一併送到 `reschedule.endpoint`。尚無計畫時回傳 HTTP 404。

調整流程不呼叫 Gemini。程式從使用者時區的今天排到原計畫結束日，沿用任務 ID、完成紀錄與自動加入的複習任務。它依目前速度、難度與章節掌握度更新估時，扣除已完成的比例與已鎖定時段，並保留已完成時段。完成重排時會儲存新版本，將原計畫標為 `superseded`，可從新版本的 `supersedes` 查回原計畫。

若時間不足，回應會帶有 `needs_decision` 草稿。調整可用時間後，使用同一個草稿決定端點送出 `reschedule`，或用 `accept_pending` 接受待排。程式會重新讀取原計畫的最新回饋與目前設定。原計畫已被其他版本取代時，草稿決定會回傳 HTTP 409。

- `POST /api/tasks/{task_id}/skip` 接收 `{ "user_id": "u_0001" }`，將最新計畫中尚未完成的任務標為跳過，並取消它後續的已排時段。
- `POST /api/tasks/{task_id}/extend` 另需 `deadline`（YYYY-MM-DD），用於已過截止日的錯過任務。新期限須介於今天與課程結束日之間。成功後任務變為待排，按重新排程即可安排。兩個端點均回傳更新後的任務。

重排、跳過及延期均可使用預設測試資料，變更保存在本機 checkpoints 資料庫。完成回報仍需設定 `PLANNING_DB_PATH` 才能保存個人學習狀況。

## 歷次計畫

完成的計畫和三階段資料存入本機 `.planning-checkpoints.sqlite`，以使用者 ID 和計畫 ID 查詢。頁面重新整理會載入最近一次成功的計畫。以下唯讀端點均需傳入 `?user_id=…`。

- `GET /api/plans` 列出歷次計畫 ID 與建立時間。
- `GET /api/plans/latest` 與 `GET /api/plans/{plan_id}` 讀取完整的最終排程、任務與時段。
- `GET /api/plans/{plan_id}/stages` 讀取逐週分析、各任務批次（含重點對應與核算估時）、由計畫 notes 產生的 placement_batches（含日期、摘要與待排原因）。最終可執行時段以完整計畫的 `schedule_blocks` 為準。
