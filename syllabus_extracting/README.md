# 中央大學課綱擷取（第一版）

輸入學期及課程序號，讀取中央大學公開課綱與課程查詢結果，呼叫 Groq 擷取評分、評量及週次資料，固定輸出至 `syllabus_analyses/{編碼後的 course_key}.json`（例如 `syllabus_analyses/115-1_CE3007-B.json`）。需要 Python 3.10+ 與 Groq 官方 Python 套件。

本模組輸出 `schema_version: "2.0"`。相對於 `doc_template/1_syllabus_analysis.jsonc` 的 1.5 範例，來源從單一 `source` 物件改為 `sources` 清單，屬不相容的結構變更。其他 `doc_template` 檔案尚未同步升版；下游程式應依分析檔自己的 `schema_version` 讀取。

## 使用

個人課程覆核網頁：設定 `GROQ_API_KEY` 後執行 `python web.py`，開啟 `http://127.0.0.1:8765`。預設測試帳號為 `demo_user`，可輸入其他測試使用者 ID 並切換；選定課程後沿用既有分析，或擷取新分析。覆核結果存於 `user_courses/{user_id}/{編碼後的 course_key}.json`，檔名與共用分析一致。這是本機原型，沒有正式登入。網頁只透過 `/api/v1/courses/search`、`/api/v1/analyses`、`/api/v1/user-courses` 與服務溝通，方便未來接入別人的 UI。

先執行 `python -m pip install groq`。再於本目錄執行 `python gui.py` 開啟簡易介面，填入學期（如 `1151`）、序號（如 `52016`）與 Groq API key。API key 只留在程式記憶體，不寫入輸出檔案。也可設定 `GROQ_API_KEY` 環境變數後使用：

```powershell
python extract.py --semester 1151 --serial-no 52016
```

預設模型 `openai/gpt-oss-20b`；可用 GUI 欄位或 `--model` 覆寫。它支援 Groq 的嚴格 JSON schema 模式。若真實課綱的擷取品質不足，再比較 `openai/gpt-oss-120b`，而非先假設較大模型必需。
Groq 回應最多允許 8192 個 completion tokens。若 JSON 截斷、解析失敗、欄位缺漏或未通過資料驗證，程式會帶著錯誤原因自動重新生成，最多重試 3 次（初次加重試共 4 次）；仍失敗才報錯。網站資料只抓一次。API 連線與權限錯誤不屬於格式問題，不會重試。

## 資料限制

- 若課綱只列授課主題與授課週數，Groq 會將主題排成完整的逐週讀書規劃；例如「授課週數 16」產生第 1 至 16 週，每筆 `status: "estimated"`。這是推估進度，不是教師公布的安排。課綱明寫的週次保留 `confirmed`，只推估缺少的週次；未提供授課週數時不補出完整週表。
- 沒有可靠開學日，每週 `date_range` 為 `[]`。沒有明列教材章節時，`chapters` 為 `[]`，授課主題寫在 `topics`；日期、評分比例與評量事項不由模型編造。
- 以中央大學網站的中文課綱為原始資料。若網站先回英文，程式會在同一連線工作階段切換中文後重新擷取；教師姓名直接保留「授課教師」原文，不讓模型翻譯。例如序號 52016 為「王尉任」。
- 課綱頁沒有學期起訖日，因此 `start_date`、`end_date` 先設為 `null`。
- 查詢結果的節次由程式依[中央大學官方節次表](https://pdc.adm.ncu.edu.tw/Course/course/COUR_U.pdf)轉換；例如 `Mon234/E6-A204` 產生週一 `09:00–11:50`。相鄰節次合併並包含課間 10 分鐘；缺節時拆成多段。原文仍保留在 `course.sessions_raw`。
- 查詢列找不到時，或節次格式無法辨識時，`course.sessions` 保持空陣列並在 JSON `warnings` 及 GUI／命令列顯示提醒，不猜測時間。
- `sources` 是來源清單：`role: syllabus` 指向課綱原文，`role: course_schedule` 指向提供 `sessions_raw` 的查詢結果。每筆各有網址、擷取時間與內容 hash。程式以課程序號作為搜尋關鍵字，因此該 URL 與手動輸入 `Computer Network` 的範例網址不同。這與 `doc_template/1_syllabus_analysis.jsonc` 的單一 `source` 範例不同，下游讀取程式需同步調整。
- 先前曾產生 `syllabus_analyses/115-1_CE3007-B.json`，包含來源、上課時段與 16 筆推估進度；這只能證明該案例有成功輸出，其他課程仍需逐一驗證。離線測試可用 `python -m unittest discover -s syllabus_extracting -p 'test_*.py' -v` 執行。
- Python 3.13 的嚴格 X.509 模式可能因中央大學網站憑證缺少 Subject Key Identifier 而拒絕連線。程式只對 `cis.ncu.edu.tw` 關閉這項額外的嚴格檢查；CA、網域名稱、有效期限與憑證鏈驗證仍保持啟用。若出現其他憑證錯誤，請檢查網站或本機憑證環境。
