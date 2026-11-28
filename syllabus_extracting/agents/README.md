# 課綱擷取模組：目前理解

> 依據 `doc_template/` 的設計圖、五份 schema 1.5 JSONC 範例及使用者確認的範圍整理。這是供 agent 快速接手的工作筆記；目前已有第一版原型。

使用者新增了 `syllabus_extracting/agents/無標題-2026-11-22-1439.excalidraw` 原始設計圖。它與 PNG 的主流程相同，並含有較細的流程與技術構想；下列補充不代表全都已定案。

## 整體產品

目標是把課綱轉成個人化讀書計畫：取得並分析課綱 → 標示明載與推估資訊 → 使用者審核、編輯 → 結合個人學習狀況與可讀書時間 → 拆解任務、估時、排程 → 依完成回饋動態調整。設計圖還包含排程原因說明、週視圖及行事曆互通。

五份資料範例的分工：

1. `1_syllabus_analysis.jsonc`：共用、產生後唯讀的 AI 課綱分析。
2. `2_course.jsonc`：使用者審核後複製出的個人課程，可自行修改。
3. `3_user_state.jsonc`：可讀書時段、外部行事曆、單日覆寫與各課學習狀態。
4. `4_schedule.jsonc`：每次排程的版本、範圍、觸發原因與整體說明。
5. `5_tasks.jsonc`：任務內容、執行回饋及實際排入的時段。

## `syllabus_extracting` 的已確認範圍

使用者明確確認：本人負責設計圖前段的「獲取資訊並分析儲存」。第一階段只需取得課綱並提取出 `syllabus_analysis.json`。課綱的具體來源及輸入格式仍待確認。分析內容以 `doc_template/1_syllabus_analysis.jsonc` 為目前參考：課程資訊、評分方式、評量與每週進度，並標示明載或推估及其依據。

交付物是 `syllabus_analysis.json`。人工審核畫面、個人課程、任務拆解和排程不在此階段的交付範圍。本模組應保留可供審核的來源與推估理由，不能把推估值偽裝成課綱明載。設計圖與範例提到共用分析的持久化；是否須同時實作 SQLite 儲存仍待確認。

### 使用者提供的課綱入口

- [中央大學課程查詢首頁](https://cis.ncu.edu.tw/Course/main/query/)
- [115 學年度第 1 學期 `Computer Network` 關鍵字查詢](https://cis.ncu.edu.tw/Course/main/query/byKeywords?year=115&fall_spring=1&selectDept=&keyword=Computer+Network&week=&day=&crs_lang_no=0&query=%E6%9F%A5%E8%A9%A2)
- [序號 52016 的課綱入口](https://cis.ncu.edu.tw/Course/main/query/byKeywords?serialNo=52016&outline=52016&semester=1151)

2026-11-22 實測：瀏覽器能直接開啟上述公開頁面，不需登入。命令列執行環境的 DNS 則回報 `No such host is known`；這是本地執行環境限制，不能據此推論正式部署環境無法連線。仍須在預計執行程式的環境確認 HTTP、robots/使用限制及連線頻率。貼在 Markdown 中的 `\&` 只是跳脫字元，程式請使用一般 `&` 分隔 query 參數。

**已驗證的頁面結構與案例：**

- 搜尋結果頁是 HTML 表格。序號 `52016` 的列提供 `CE3007-B`、課名 `Computer Network / 計算機網路`、教師 `Wang, Wei-Jen`、3 學分與 `Mon234/E6-A204`。同一搜尋也有 `52015` 的 A 班，因此不能僅靠課名辨識課程。
- 該列 `Syllabus` 連結的 `onclick` 為 `open_outline('/Course/main/query/byKeywords?serialNo=52016&outline=52016&semester=1151')`；這正是使用者提供的課綱網址。連結 `href` 本身是 `javascript:void(0);`，只抓 `href` 會漏掉真正路徑。
- 課綱頁標題 `Syllabus`，主要內容是兩列表格，欄名與值可逐列讀取。已看到學期、系所、序號、課號、教師、中英文課名、學分、教學目標與內容、教材、評分、授課週數等。
- 此課綱的評分文字為 `midterm 35%, final exam 35%, HWs+mini-tests 30%`。後一項是合併比例，不能無證據拆成作業與小考各自權重。
- 此課綱只寫 `Teaching Weeks: 16`，目前頁面沒有逐週進度表、考試日期、章節清單或學期起訖日。這些欄位不能因範例 JSONC 有值就照抄或宣稱已確認；需定義缺值表示方式或另外取得校曆／課程資料。

可行的擷取路線是：查詢頁表格找出目標課程與上課時段 → 讀取該列課綱路徑 → 解析課綱表格 → 正規化並輸出 JSON。這是頁面結構驗證，不是完整擷取程式或端到端測試。

### Excalidraw 補充線索

- 原始圖明列「中央公開課程大綱 → 課綱收集與文字清理 → AI 擷取考試時間、週次進度、評分比例 → Pydantic 驗證固定 JSON 格式」，與目前模組範圍相關。Pydantic 是候選驗證工具，尚非已定選型。
- 圖中把「學校資料」列為系統自動帶入，包括學期、開學日、期中／期末考週、國定假日，以及課號、課名、教師、上課時間、教室。實測單門課課綱頁沒有全部這些資料；學校行事曆或查詢結果可能是額外來源，需分別驗證。
- 圖中另有 SQLite 儲存、學生課表與學習狀況、排程演算法、前端、ICS／Outlook 匯出及規劃助理 chatbot；這些屬整體產品設想，不自動擴入本階段的 `syllabus_analysis.json` 交付。

### 已寫在範例中的資料規則

- 共用分析以 `syllabus_url` 與 `raw_text_hash` 判斷能否重用；課綱文字改變時產生新分析，不覆寫舊分析。使用者個人課程也不會被自動改動。
- 共用分析的可推測欄位採 `{ value, status, evidence }`；`status` 為 `confirmed` 或 `estimated`。`user_supplied` 僅用於個人課程。
- 日期用 `YYYY-MM-DD`、時間用 24 小時 `HH:MM`、時間戳含時區；星期採 ISO 1（週一）至 7（週日）。課程 `start_date` 應為週一，並作為週次起點。
- 章節 ID 由 `course.textbook.chapters` 定義；評量範圍與每週進度應引用這些 ID。評分類別權重總和為 100；評量日期與週次須一致。
- 範例提議 SQLite `syllabus_analyses` 表及 JSON 欄位，但尚無實際資料庫或介面程式。

## 目前待釐清

1. 第一版是否只支援上述中央大學網站？其課綱頁面如何取得原文、是否需要登入，以及是否有其他檔案格式，待實際連線檢查。
2. `schema_version: 1.5` 是既定契約還是討論草案？缺少教材章節、評分比例不完整或沒有明確日期時，允許 `null`、空陣列與未解決狀態嗎？目前範例偏完整，尚未涵蓋缺資料情境。
3. JSON 檔已固定輸出至 `syllabus_extracting/syllabus_analyses/{學期}_{課程序號}.json`；是否也要存入 SQLite 仍待確認。
4. AI 分析的模型、呼叫方式與成本限制；哪些欄位應以規則解析，哪些可交給模型？
5. 如何保存原文、證據位置與抓取錯誤，讓使用者能核對推估？`evidence` 目前是文字，沒有頁碼或原文區段定位規格。
6. 共用分析的快取鍵、同一課號不同課綱版本、手動上傳的識別方式與隱私界線。
7. 本模組對外介面、執行環境、語言、測試與部署方式；目前沒有既有程式可沿用。

## 接手提醒

先讀 `doc_template/1_syllabus_analysis.jsonc`；設計圖提供完整產品流程。不要直接把範例數值、Claude 模型名稱或 SQLite 註解當作已確認的實作決策。開始開發前先確認真實課綱樣本與第一版輸入來源。

## 第一版原型（2026-11-22）

`syllabus_extracting/extract.py` 提供命令列擷取，`gui.py` 提供 Tkinter 簡易介面。預設 Groq `openai/gpt-oss-20b`，使用嚴格 JSON schema 回應；`README.md` 有執行方式。程式以規則填入課程識別與來源資訊，Groq 整理教材、評分、評量及週次，再做基本驗證並輸出 JSON。這是原型：已通過語法與本地 HTML parser 檢查，尚未在本機完成對 NCU 或 Groq 的端到端測試，亦未針對真實課綱評估模型準確度。

輸出路徑不由 GUI 或 CLI 指定，固定為 `syllabus_extracting/syllabus_analyses/{semester}_{serial_no}.json`；同一學期與序號再次擷取會更新同名檔案。`sources` 清單記錄課綱頁與課程查詢頁各自的網址、用途、擷取時間與 hash。

此分析檔的輸出 schema 已升至 `2.0`，因為 `source` → `sources` 是不相容的結構變更。`doc_template` 中的 1.5 範例與其他資料類型尚未同步升版；下游讀取前須檢查檔案本身的 `schema_version`。既有 1.5 檔案需重新擷取或明確遷移，不能只憑版本號推定結構。
`doc_template/1_syllabus_analysis_v2.jsonc` 是對應的 2.0 範例；原 1.5 檔保留供比較。

上課節次轉換使用[中央大學官方節次表](https://pdc.adm.ncu.edu.tw/Course/course/COUR_U.pdf)，由程式將 `Mon234/E6-A204` 轉成週一 `09:00–11:50`，相鄰節次合併、不相鄰拆段。搜尋列的 `52016<br>CE3007-B` 必須保留 `<br>` 為空白才能精確比對序號。若找不到時段或格式不明，保留 `sessions_raw`（若有）並輸出 `warnings`，不推測時間。
Groq 回傳格式或資料驗證失敗時，保留同一份已抓取的來源，帶錯誤原因重新生成最多 3 次；共 4 次仍失敗才報錯。API 連線或權限錯誤不重試。
