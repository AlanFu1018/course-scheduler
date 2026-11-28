# 專案 agent 須知

目前工作分支為 `feat/syllabus-extracting`；`syllabus-ana` 已於合併提交 `2e6c8bc` 併入。進行課綱擷取工作前，先讀 `syllabus_extracting/agents/README.md`、`syllabus_extracting/README.md`，以及 `doc_template/1_syllabus_analysis_v2.jsonc`。

本階段先取得中央大學課綱並產生 `syllabus_extracting/syllabus_analyses/{編碼後的 course_key}.json`。GUI 與 CLI 共用 `syllabus_extracting/extract.py`；另有獨立的個人課程覆核網頁與本機 JSON 儲存。正式登入、排程及遠端 UI 整合尚未完成。

輸出採 schema 2.0。`sources` 為多來源清單；課程識別、來源 hash 與上課節次由程式處理，Groq 整理教材、評分、評量及逐週主題。課綱明寫的週次為 `confirmed`，補齊的週次為 `estimated`；不要把推估進度寫成教師公布的安排，也不要編造日期、教材章節、評分比例或評量。

修改後執行 `python -m unittest discover -s syllabus_extracting -p 'test_*.py' -v`。現有測試是離線模擬，不能取代對 NCU 與 Groq 的實際驗證。不要把 API key 寫入程式、範例或提交。產生的 JSON 與 `syllabus_extracting/__pycache__/` 目前可能受 Git 追蹤；提交前逐項檢查變更。
