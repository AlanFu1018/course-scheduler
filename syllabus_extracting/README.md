# 中央大學課綱擷取（第一版）

輸入學期及課程序號，讀取中央大學公開課綱與課程查詢結果，呼叫 Groq 擷取評分、評量及週次資料，固定輸出至 `syllabus_analyses/{學期}_{課程序號}.json`（例如 `syllabus_analyses/1151_52016.json`）。需要 Python 3.10+ 與 Groq 官方 Python 套件。

本模組輸出 `schema_version: "2.0"`。相對於 `doc_template/1_syllabus_analysis.jsonc` 的 1.5 範例，來源從單一 `source` 物件改為 `sources` 清單，屬不相容的結構變更。其他 `doc_template` 檔案尚未同步升版；下游程式應依分析檔自己的 `schema_version` 讀取。

## 使用

先執行 `python -m pip install groq`。再於本目錄執行 `python gui.py` 開啟簡易介面，填入學期（如 `1151`）、序號（如 `52016`）與 Groq API key。API key 只留在程式記憶體，不寫入輸出檔案。也可設定 `GROQ_API_KEY` 環境變數後使用：

```powershell
python extract.py --semester 1151 --serial-no 52016
```

預設模型 `openai/gpt-oss-20b`；可用 GUI 欄位或 `--model` 覆寫。它支援 Groq 的嚴格 JSON schema 模式。若真實課綱的擷取品質不足，再比較 `openai/gpt-oss-120b`，而非先假設較大模型必需。

## 資料限制

- 沒有來源依據的日期、教材章節和每週進度以 `null` 或 `[]` 表示。
- 以中央大學網站的中文課綱為原始資料。若網站先回英文，程式會在同一連線工作階段切換中文後重新擷取；教師姓名直接保留「授課教師」原文，不讓模型翻譯。例如序號 52016 為「王尉任」。
- 課綱頁沒有學期起訖日，因此 `start_date`、`end_date` 先設為 `null`。
- 查詢結果的節次由程式依[中央大學官方節次表](https://pdc.adm.ncu.edu.tw/Course/course/COUR_U.pdf)轉換；例如 `Mon234/E6-A204` 產生週一 `09:00–11:50`。相鄰節次合併並包含課間 10 分鐘；缺節時拆成多段。原文仍保留在 `course.sessions_raw`。
- 查詢列找不到時，或節次格式無法辨識時，`course.sessions` 保持空陣列並在 JSON `warnings` 及 GUI／命令列顯示提醒，不猜測時間。
- `sources` 是來源清單：`role: syllabus` 指向課綱原文，`role: course_schedule` 指向提供 `sessions_raw` 的查詢結果。每筆各有網址、擷取時間與內容 hash。程式以課程序號作為搜尋關鍵字，因此該 URL 與手動輸入 `Computer Network` 的範例網址不同。這與 `doc_template/1_syllabus_analysis.jsonc` 的單一 `source` 範例不同，下游讀取程式需同步調整。
- 這是獨立原型；尚未實測對 Groq 的真實 API 呼叫，也尚未在本機命令列成功連到中央大學網站。本機 DNS 曾回報無法解析該主機；瀏覽器則已成功開啟公開頁面。
- Python 3.13 的嚴格 X.509 模式可能因中央大學網站憑證缺少 Subject Key Identifier 而拒絕連線。程式只對 `cis.ncu.edu.tw` 關閉這項額外的嚴格檢查；CA、網域名稱、有效期限與憑證鏈驗證仍保持啟用。若出現其他憑證錯誤，請檢查網站或本機憑證環境。
