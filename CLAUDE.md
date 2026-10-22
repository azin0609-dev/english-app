# 英語特訓（個人英文學習網頁 App）

只給一個人使用的英文學習 App。使用者不是工程師，主要靠 AI 開發，說明請用白話、繁體中文。

## 專案目標

- 使用者背景與個人目標寫在本機的 `CLAUDE.local.md`（不上傳）
- 目標一：多益提升到 700 分左右
- 目標二：通過外商企業安全（Corporate Security）職缺的英文商務面試
- 兩條軌道（多益／面試）＋首頁「今日任務」＋間隔複習＋角色養成
- 程式碼放在公開的 GitHub 儲存庫：個人可識別資訊不要寫進會上傳的檔案

## 技術規格

- 純前端：HTML + CSS + 原生 JavaScript（ES modules），不用框架、不需要後端
- 資料：localStorage（單一鍵 `eng-app-v1`），可匯出／匯入 JSON 備份
- 語音：Web Speech API，`speechSynthesis` 朗讀、`SpeechRecognition` 辨識（en-US）
- 介面繁體中文、手機版面（RWD）、PWA（可離線、可加到主畫面）
- 所有路徑都用相對路徑，才能放在 GitHub Pages 的子路徑（`https://帳號.github.io/english-app/`）

## 啟動與測試

- 本機：雙擊 `start.bat` → 開啟 `http://localhost:8000`（用 `tools/server.ps1`，Windows 內建 PowerShell，免安裝）
- 不能直接雙擊 `index.html`：瀏覽器不允許 file:// 讀取 `data/*.json` 與載入模組
- 自動檢查：`http://localhost:8000/tests/tests.html`（純邏輯測試，不碰使用者資料）
- 測試日期：網址加 `?today=2026-10-25`（例：`http://localhost:8000/?today=2026-10-25#/`）可模擬其他日期，畫面上方會顯示測試模式提示。注意：會把當天任務重新排在那個日期
- 除錯：開發者工具輸入 `app.state` 可看目前資料

## 檔案結構

```
index.html              App 外框（標題列、底部導覽）
start.bat               雙擊啟動本機伺服器
tools/server.ps1        本機小伺服器（PowerShell HttpListener）
manifest.webmanifest    PWA 設定
sw.js                   離線快取（網路優先，沒網路才用快取）※新增檔案要加進 ASSETS 並改 CACHE 版本
icons/                  App 圖示（svg、192/512 png）
css/style.css           全部樣式（淺色／深色、手機版）
js/
  app.js                進入點、網址路由（#/xxx）、全域朗讀按鈕
  util.js               日期（本地時間 YYYY-MM-DD）、跳脫、切句
  store.js              localStorage 讀寫、資料預設值、匯出匯入驗證
  srs.js                間隔複習規則
  content.js            載入 data/*.json、把故事拆成跟讀句
  planner.js            今日任務排程、自由練習選題
  stats.js              每日紀錄、連續天數、本週時間、正確率趨勢
  game.js               經驗值、等級、職稱、能力值、徽章
  record.js             作答後統一更新（複習＋紀錄＋經驗值＋徽章＋存檔）
  compare.js            跟讀逐字比對（LCS）
  speech.js             朗讀、語音辨識
  avatar.js             角色 SVG（5 個階段）
  chart.js              趨勢折線圖（SVG，含滑鼠提示與表格檢視）
  ui.js                 提示、對話框、朗讀按鈕、升級動畫
  cards/                練習卡片：vocab-card / grammar-card / shadow-card / common
  views/                各畫面：home / toeic / vocab / grammar / interview / shadowing / stories / profile / settings / practice
data/                   題目（唯讀，可自行擴充）
  vocab.json            單字 60（商務 40 + 企業安全 20）
  grammar.json          文法 20（Part 5 型）
  shadowing.json        跟讀句 20（面試用）
tests/                  自動檢查頁（tests.html + tests.js）
```

## 資料模型

### 題目（data/*.json，id 一旦建立就不能改，否則進度對不上）

```js
// vocab.json
{ id: "v001", word, pos, zh, category: "business" | "security", example, exampleZh }
// grammar.json（question 裡用 ____ 表示空格，answer 是正確選項的索引 0~3）
{ id: "g001", topic, question, options: [4 個], answer, explanation }
// shadowing.json（tag 對應 content.js 的 SHADOW_TAG）
{ id: "s001", tag, zh, en }
```

故事句自動產生：`id = st-{故事id}-{英文句子的雜湊}`，改某一句不影響其他句的進度。中英句數相同時一句對一句，不同時顯示整段中文。

### 使用者資料（localStorage `eng-app-v1`）

```js
{
  schemaVersion: 1,
  createdAt: "2026-10-22",
  progress: { [題目id]: { level, nextReview, lastReview, attempts, right, wrong, lastScore? } },
  stories: [{ id, title, situation:{zh,en}, task:{zh,en}, action:{zh,en}, result:{zh,en}, updatedAt }],
  daily: { "YYYY-MM-DD": { seconds, xp, vocab:{right,total}, grammar:{right,total}, shadowing:{scoreSum,count}, planDone } },
  todayPlan: { date, items:[{id,type}], done:{id:true}, quotas, due, weakest, accuracy, estMinutes, round },
  player: { xp, badges: { [徽章id]: 取得日期 } },
  settings: { rate: 1 | 0.8, voice, autoSpeak, selfRate, lastExport }
}
```

匯出格式：`{ app: "english-app", schemaVersion, exportedAt, data: <上面整包> }`。格式改版時在 `store.js` 的 `migrate()` 處理舊資料。

## 規則

### 間隔複習（srs.js）
- 答對／跟讀 ≥ 85%：level +1（最高 5）；答錯／跟讀 < 60%：level 歸 0；跟讀 60～84%：level 不變
- 間隔：level 0→當天、1→1 天、2→3 天、3→7 天、4→14 天、5→30 天（從作答當天算）
- 提前練習（還沒到 nextReview）：答對不升級、排程不變；答錯一樣歸 0
- 選擇題答錯會在同一輪最後再出一次，那次不計分
- 跟讀只有「看中文先說」那一次計分；聽完後的跟讀只標色。自評模式：說得出來 90／卡一部分 70／說不出來 0

### 今日任務（planner.js）
- 基本：單字 10、文法 5、跟讀 3（約 15 分鐘；每題預估 0.5／1／1.5 分鐘）
- 弱點：最近 7 天作答 ≥ 5 題的項目中正確率最低、且 < 85% 的，題數 ×1.5（跟讀用平均分數）
- 到期題多於配額時加量，上限單字 20、文法 10、跟讀 6（全滿約 29 分鐘）
- 挑題：到期（越早越先，同日 level 低的先）→ 新題（單字商務／企業安全輪流；跟讀故事句優先）
- 當天第一次打開時排好並存起來；完成後可「再來一輪」

### 統計（stats.js）
- 連續天數：有作答的天數往回連續計算；今天還沒練從昨天算
- 練習時間：練習畫面中兩次操作之間最多算 60 秒（避免離開座位也計時）
- 本週：週一到今天

### 角色養成（game.js）
- 經驗值：選擇題答對 10／答錯 3；跟讀 ≥85% 15、60～84% 10、其他 5；完成今日任務 +50（每天一次）
- 同一題同一天第二次以後只拿 20%；連續 7 天以上 ×1.2
- 升到 Lv L 需要累積 `100(L-1) + 25(L-1)(L-2)` XP（Lv2=100、Lv5=700、Lv10=2700、Lv20=10450、Lv30=23200）
- 職稱：Lv1 見習調查員 → Lv5 安全專員 → Lv10 資安調查員 → Lv20 企業安全分析師 → Lv30 企業安全主管
- 能力值 = 該類題目平均 level ÷ 5 × 100（口說只算句庫與練過的故事句）
- 徽章 14 個，定義在 `BADGES`，條件在 `qualifiedBadges()`

## 擴充題目

在 `data/` 對應的 JSON 檔最後面加一筆，用新的 id（例如 `v061`、`g021`、`s021`），格式照上面。JSON 最後一筆後面不能有逗號。加完重新整理頁面即可；新題會在今日任務裡當「新題」出現。

## 開發進度

### 第一階段 ✅ 完成（2026-10-22）
- [x] 專案骨架、本機伺服器、PWA（離線、可安裝）
- [x] 資料模型、localStorage、匯出／匯入／清除
- [x] 間隔複習規則
- [x] 原創種子題：單字 60、文法 20、跟讀句 20
- [x] 單字練習（英→中、中→英輪流）＋單字表（分類、朗讀、熟練度）
- [x] 文法填空（答錯顯示中文解析）
- [x] 跟讀練習（語音辨識、逐字標色、正確率；不支援時自評模式）
- [x] 我的故事庫（STAR 中英對照、自動儲存、自動變跟讀句、範例故事）
- [x] 首頁今日任務（依到期數與弱點排程）、連續天數、本週時間、14 天正確率趨勢圖
- [x] 角色養成：經驗值、等級、5 階職稱與角色外觀、能力雷達圖、14 個徽章、升級動畫
- [x] 自動檢查頁（46 項）
- [ ] 上雲端（GitHub Pages）：等使用者註冊 GitHub 帳號、安裝 Git 後進行

### 第二階段（待做）
- [ ] 聽力應答（Part 2 型）：朗讀問句、三選一、速度 0.8x／1.0x
- [ ] 短篇閱讀（Part 7 型）：商務 email／公告＋2～3 題
- [ ] 程度診斷：約 20 題（聽力＋閱讀），記錄起始程度
- [ ] 常見面試題 15 題，可連結故事庫
- [ ] 模擬面試：隨機 3 題、朗讀題目、倒數計時、顯示參考回答與辨識文字
- [ ] 小遊戲：單字 60 秒挑戰、中英配對翻牌、文法快問快答（賺額外經驗值）
- [ ] 能力雷達圖加入聽力、閱讀；今日任務加入新題型

## 已知限制
- 語音辨識：電腦版 Chrome 最穩定；需要網路與麥克風權限；手機需 https（上雲後才能用）
- 辨識結果是「Google 聽成什麼字」，不是發音評分
- 資料只存在該裝置、該網址的瀏覽器；不同裝置／網址要靠匯出匯入搬移
