# NCU AI 智慧讀書規劃器

中央大學學生使用的課表、考試與讀書任務規劃 PWA 原型。

目前原型包含：

- 基本資料與中央大學課程資料串接流程
- 08:00–24:00 互動式課表
- 課程搜尋、整門課自動填入與衝堂處理
- 自訂行程占用空閒時段
- 各科熟悉度、難度、目標成績與讀書節奏設定
- 網頁版／手機版切換
- PWA manifest 與 Service Worker

## 專案結構

- `frontend/`：目前可執行的 PWA 與 Sites 部署設定
- `doc/`：課綱、課程、使用者狀態、排程與任務資料設計
- `design/`：介面背景概念圖

## 本機預覽

```bash
python3 -m http.server 4173 --directory frontend/dist
```

瀏覽器開啟 <http://localhost:4173>。

## 線上原型

<https://ncu-ai-study-planner-prototype.jiluen-jang.chatgpt.site>
