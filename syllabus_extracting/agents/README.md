# 課綱擷取交接 checkpoint

更新於 2026-11-28。`syllabus-ana` 已合併至 `feat/syllabus-extracting`（merge commit `2e6c8bc`）。本檔記錄現況；使用方式見 `../README.md`，資料形狀見 `../../doc_template/1_syllabus_analysis_v2.jsonc`。

## 任務範圍

使用者負責整體產品前段的「獲取資訊並分析儲存」。目前模組讀取中央大學公開課綱及課程查詢結果，產生共用分析 JSON；另有簡易的個人課程覆核及本機儲存。正式登入、任務拆解、排程、行事曆整合與 SQLite 均未實作。完整產品構想可參考本目錄的 Excalidraw 圖；圖中的功能不代表現有程式均已提供。

## 程式與資料契約

個人課程原型已新增 `../web.py`、`../review.html` 與 `../personal_course.py`：預設測試帳號 `demo_user`，可輸入其他測試 ID 切換；搜尋結果由使用者選擇序號，沿用或建立分析後覆核，儲存為 `../user_courses/{user_id}/{編碼後的 course_key}.json`，與分析檔同名。介面只透過 API 操作資料；目前無正式登入或遠端 UI 整合。個人課程 2.0 範例見 `../../doc_template/2_course.jsonc`。

- `../extract.py` 是 CLI 與核心流程；`../gui.py` 是 Tkinter 介面，兩者共用 `extract()`。輸出固定為 `../syllabus_analyses/{編碼後的 course_key}.json`，同一課程再次成功擷取會更新同名檔案。輸出路徑不由使用者設定。
- 目前輸出 `schema_version: "2.0"`。相較舊 1.5 範例，`source` 改為 `sources` 清單；課綱與課程查詢結果各有 URL、擷取時間與各自的 raw text hash。hash 由程式計算，不交給模型生成。其他 `doc_template` 範例仍是 1.5，不可假設相容。
- 程式從中文課綱保留課名、教師等原文，並依查詢結果解析 `sessions_raw`。例如 `Mon234/E6-A204` 依[中央大學官方節次表](https://pdc.adm.ncu.edu.tw/Course/course/COUR_U.pdf)轉成週一 `09:00–11:50`；解析失敗則保留原文並給警告，不猜時間。
- Groq 預設 `openai/gpt-oss-20b`，使用嚴格 JSON schema 產出教材、評分、評量與每週進度。若課綱只有「授課週數 16」及主題，模型須排出第 1–16 週的合理讀書規劃，每筆標 `estimated`。課綱明寫某週內容才標 `confirmed`，其餘週次推估補齊；沒有授課週數時不補出完整週表。
- 模型另回傳內部用的 `source_topics`（不寫入分析 JSON），逐字列出課綱主題。未明寫週次時，程式檢查每週有主題、來源主題完整且依序、各主題占用週數差距至多 1；跨週僅加「（1）」「（2）」標號，不杜撰複習或練習。
- 沒有可靠開學日時 `start_date`、`end_date` 為 `null`，每週 `date_range: []`。沒有列出的教材章節不可創造 chapter ID，`chapters: []`，主題文字放 `topics`。日期、評分比例與評量項目也不得編造。`estimated` 表示規劃用猜測，不代表教師公布的週表。
- 程式驗證評分依據、章節引用、週次完整性與唯一性、明載／推估狀態等。模型格式或驗證失敗可再生成 3 次，四次失敗才報錯，且不覆寫既有 JSON；連線與權限錯誤不重試。

## 已有案例與驗證

`../syllabus_analyses/115-1_CE3007-B.json` 可作為案例：`CE3007-B`、教師「王尉任」、`sessions_raw: "Mon234/E6-A204"`，有 16 筆第 1–16 週進度，全部為 `estimated`，日期與章節陣列均為空。此課綱明列 `Teaching Weeks: 16`，未列逐週進度；模型排出的主題須視為推估。

`../test_weekly_schedule.py` 的離線測試涵蓋完整／部分明載週次、缺授課週數、無效章節與日期、四次失敗不覆寫。執行：`python -m unittest discover -s syllabus_extracting -p 'test_*.py' -v`。修改擷取邏輯後仍應以有權限的 Groq key 做實際案例驗證；現有樣本不保證其他課綱格式均適用。

## 接手時注意

- 先讀現行 2.0 範本，別把舊 1.5 範例中的虛構日期、章節、Claude 模型名稱或 SQLite 註解當成目前實作。
- 使用者提供的課綱 URL：`https://cis.ncu.edu.tw/Course/main/query/byKeywords?serialNo=52016&outline=52016&semester=1151`。程式搜尋時以序號 `52016` 為關鍵字，與使用者手動搜尋 `Computer Network` 的 URL 不同；搜尋列必須用課程序號精確比對，避免誤取 A 班。
- 來源 hash 可分別觀察來源變動，但尚未實作快取或變更通知。原始課綱全文與每一筆週次的逐條證據定位也尚未保存。
- Git 目前可能追蹤已產出的 JSON 與 `__pycache__`；修改時檢查 diff，避免意外提交機器產物或敏感資訊。
