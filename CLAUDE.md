# 投資儀表板（個人投資決策工具）

只給一個人使用的投資紀律工具。使用者不是工程師，主要靠 AI 開發，說明請用白話、繁體中文。

## 專案目標

- 解決「看感覺投資」：追 KOL 發文進場、合約一直攤平到爆倉、股票買了不管、大跌靠感覺加碼
- 做法是「紀律儀表板」，不是「預測儀表板」：規則先寫好，市場數字只當參考，下單前逐項檢查
- 市場範圍：台股、美股（不做加密貨幣）；合約只用來檢查風險，不提供買賣訊號
- 程式碼放在公開的 GitHub 儲存庫：個人財務數字、持倉、可識別資訊都不要寫進會上傳的檔案（只存在使用者瀏覽器的 localStorage）
- 這是守紀律的工具，不是投資建議；畫面用語避免「建議買進／賣出」，改說「照規則」

## 技術規格

- 純前端：HTML + CSS + 原生 JavaScript（ES modules），不用框架、不需要後端
- 個人資料：localStorage（單一鍵 `invest-desk-v1`），可匯出／匯入 JSON 備份
- 市場資料：`data/market.json`，由 GitHub Actions 每天自動抓兩次並提交（`tools/fetch-market.mjs`）
- 網頁同時讀本地的 `data/market.json` 與 GitHub 上最新的那份（raw.githubusercontent.com），用比較新的
- 介面繁體中文、手機版面（RWD）、PWA（可離線、可加到主畫面）；寬螢幕（≥900px）上方導覽，手機底部導覽＋「更多」
- 所有路徑都用相對路徑，才能放在 GitHub Pages 的子路徑
- 漲跌顏色照台灣習慣：漲紅跌綠，並加 ▲▼（不只靠顏色）

## 啟動與測試

- 本機：雙擊 `start.bat` → 開啟 `http://localhost:8001`（和英文 App 的 8000 錯開）
- 不能直接雙擊 `index.html`：瀏覽器不允許 file:// 讀取 `data/*.json` 與載入模組
- 自動檢查：`http://localhost:8001/tests/tests.html`（純邏輯測試，不碰使用者資料）
- 測試日期：網址加 `?today=2026-10-25` 可模擬其他日期（例如測週日開放損益）
- 除錯：開發者工具輸入 `app.state`（個人資料）、`app.market`（市場資料）
- 手動更新市場資料：GitHub 儲存庫 → Actions → 更新市場資料 → Run workflow；有裝 Node.js 也可以在本機跑 `node tools/fetch-market.mjs`

## 檔案結構

```
index.html              App 外框（標題列、上方導覽、底部導覽、「更多」選單）
start.bat               雙擊啟動本機伺服器（port 8001）
tools/server.ps1        本機小伺服器（PowerShell HttpListener）
tools/fetch-market.mjs  抓市場資料（GitHub Actions 用）
.github/workflows/market.yml  每天台灣時間 06:17、22:17（週一到週五）自動更新市場資料
manifest.webmanifest    PWA 設定
sw.js                   離線快取（網路優先）※新增檔案要加進 ASSETS 並改 CACHE 版本
icons/                  App 圖示（svg、192/512 png）
css/style.css           全部樣式（淺色／深色、手機版、圖表）
js/
  app.js                進入點、網址路由（#/xxx）、右上角紀律分數
  util.js               日期（本地時間 YYYY-MM-DD）、數字格式（萬、億、%）、跳脫
  store.js              localStorage 讀寫、資料預設值、規則預設值、匯出匯入驗證
  market.js             讀 market.json、均線、距一年高點、匯率、恐懼貪婪
  calc.js               資產計算：核心桶／衛星桶、預備金、曝險、合約強平與風險
  rules.js              紀律清單、今日待辦、定期定額、大跌分段加碼、下單前檢查、冷靜期
  journal.js            日誌選項（來源、情緒、動作）與統計
  chart.js              SVG 折線圖（含滑鼠提示與表格檢視）、走勢線、堆疊條、量表、橫條
  ui.js                 提示、對話框、狀態標籤、表單欄位
  views/                各畫面：home / holdings / structure / market / risk / check / plan / journal / settings
data/
  market.json           市場資料（自動產生，不要手動改）
  watchlist.json        要自動抓價的個股／ETF（加一筆就會開始抓）
tests/                  自動檢查頁（tests.html + tests.js）
```

## 資料模型

### 使用者資料（localStorage `invest-desk-v1`）

```js
{
  schemaVersion: 1, createdAt, updatedAt,          // updatedAt：最後一次改持倉
  accounts: { cashTwd, cashUsd, emergency, monthlyExpense, contractEquity },  // 合約帳戶權益是美元
  holdings: [{ id, mkt:'tw'|'us', sym, name, value, cost, bucket:'core'|'sat', sector }],  // 台股台幣、美股美元
  contracts: [{ id, sym, name, side:'long'|'short', qty, entry, mark, lev, liq, stop, cross, sector }],  // 美元
  rules: { perTradePct, maxLev, contractCapPct, riskBudgetPct, satCapPct, singleCapPct, efMonths, opensPerDay,
           coolHours, fear, greed, fearMult, greedMult, dipTiers:[10,20,30], coreUsPct, chasePct, minRR, confirmed },
  plan: { monthly, twEtf, usEtf, pool, dcaDone:{'YYYY-MM':日期}, dipUsed:{段數:日期}, fngManual },
  journal: [{ id, date, sym, action, lev, amount, source, mood, reason, wrongIf, result:{outcome, pnl, note, date}|null }],
  wishlist: [{ id, sym, note, source, addedAt(ISO) }],   // 想買清單（冷靜期）
  opens: { date, n }, peeks: {'YYYY-MM': 次數}, settings: { fx, lastExport }
}
```

匯出格式：`{ app: "invest-dashboard", schemaVersion, exportedAt, data: <上面整包> }`。格式改版時在 `store.js` 的 `migrate()` 處理舊資料。

### 市場資料（data/market.json）

```js
{
  updatedAt: ISO 時間,
  series: { "^TWII" | "^GSPC" | "^IXIC" | "^VIX" | "^TNX" | "TWD=X" | 觀察清單代號: { name, ccy, src, d: [["YYYY-MM-DD", 收盤], ...] } },  // 約兩年
  fng: { v, rating, date, prevWeek, prevMonth, hist },   // CNN 股市恐懼與貪婪
  tw: { margin: { date, v(億), prev, hist }, foreign: { date, v(億), hist } },  // 證交所融資餘額、外資買賣超
  errors: [抓不到的項目]
}
```

來源：Yahoo Finance（主要）→ 備援 FRED（美股指數、殖利率、匯率）、證交所（加權指數）、ExchangeRate-API（匯率）。抓不到的沿用舊資料，全部失敗才讓 Actions 顯示紅色。

## 規則

### 資產結構（calc.js）
- 投資資產 = 核心桶（大盤 ETF）＋衛星桶（個股、主題 ETF、合約帳戶權益）＋投資用現金；不含預備金
- 單一個股曝險 = 衛星桶股票市值＋合約持倉價值（數量 × 現價），大盤 ETF 不算
- 合約現價空白時用自動抓的收盤價；強平價空白時用估計值（逐倉：進場 ×(1 − 1/槓桿 + 0.5%)，做空反向），全倉算不出來

### 合約風控（calc.js / rules.js）
- 停損會再虧 = 數量 × (現價 − 停損)；停損在強平之後就用強平價算
- 總風險預算 = 投資資產 × riskBudgetPct；合約帳戶上限 = 投資資產 × contractCapPct
- 距強平 < 10% 紅色、< 20% 黃色

### 下單前檢查（rules.js `checkContract` / `checkStock`）
- 合約部位大小由停損反推：最多虧 = 合約帳戶 × perTradePct；最多能開 = 最多虧 ÷ 停損距離
- 合約檢查：帳戶在上限內、停損方向、槓桿上限、停損在強平前、不攤平（同標的虧損中禁止加；賺錢中要先把停損移到成本以上）、總風險、單一個股曝險、200 日線順勢、不追高（比 60 日線高超過 chasePct）、盈虧比 ≥ minRR、冷靜期
- 股票檢查：預備金、現金夠用（不借錢）、衛星桶上限、單一個股上限、趨勢（核心 ETF 不檢查時機）、冷靜期
- 冷靜期：想法來源是 KOL／新聞／朋友，要先放進想買清單滿 coolHours 小時
- 沒有價格資料的趨勢檢查標成「跳過」，不擋單

### 定期定額與加碼（rules.js）
- 預備金不足 efMonths 個月（或沒填）：每月金額先撥一半存預備金
- 恐懼貪婪 < fear → ×fearMult；≥ greed → ×greedMult；手動輸入的指數優先
- 台美分配：讓核心桶往 coreUsPct 靠近（缺多少補多少）
- 大跌分段加碼：台股加權或 S&P 500 距一年（252 個交易日）高點跌到 dipTiers 各一段；每段金額 = 加碼池 ÷ 剩下段數；照做後從加碼池扣掉；兩個大盤都回到高點 5% 內才建議重新開始

### 紀律
- 紀律清單（首頁、右上角分數）：預備金、停損、強平、槓桿、合約帳戶、總風險、衛星桶、單一個股、本月定投、每天打開次數
- 損益金額平日隱藏，週日開放；提前看會記次數
- 今日待辦依急迫度排序：紅（風險）→ 黃（超過上限）→ 綠（加碼觸發）→ 一般

## 部署（GitHub Pages）

- 儲存庫：https://github.com/azin0609-dev/invest-dashboard （公開；`main` 分支根目錄直接當網站）
- 網站：https://azin0609-dev.github.io/invest-dashboard/
- 第一次要到 Settings → Pages → Branch 選 `main`、資料夾 `/ (root)` → Save
- 更新網站：改完檔案後 `git add -A` → `git commit` → `git push`
- 隱私：commit 用 GitHub 匿名 Email；`CLAUDE.local.md`、`.claude/`、備份檔（invest-backup-*.json）都在 `.gitignore`
- 雲端網址和本機網址（localhost:8001）的資料是分開的兩份，要靠匯出／匯入搬移

## 擴充

- 想自動抓某檔股票的價格：在 `data/watchlist.json` 加一筆 `{ "sym": "代號", "name": "名稱" }`；台股代號加 `.TW`（上櫃加 `.TWO`），美股直接寫代號。下次自動更新後就有均線和距高點
- 注意：watchlist.json 是公開的，不想讓人知道在觀察什麼就不要加

## 開發進度

### 第一版
- [x] 持倉輸入（帳戶、台股、美股、合約）、資產結構（核心／衛星、曝險、損益週日開放）
- [x] 市場頁：恐懼貪婪、大盤距高點、指數、台股籌碼、走勢圖（60／200 日線）、觀察清單
- [x] 風控：停損全觸發最多再虧、距強平
- [x] 下單前檢查（合約／股票）＋想買清單冷靜期
- [x] 定期定額、大跌分段加碼、再平衡提示
- [x] 交易日誌＋依來源／情緒統計勝率與損益
- [x] 設定：規則數字、匯率、備份
- [x] 自動檢查頁、GitHub Actions 每日抓資料

### 之後可以做
- [ ] 每月檢討頁（本月紀律分數變化、日誌統計摘要）
- [ ] 新聞與重要事件行事曆（只當參考）
- [ ] 手機與電腦資料同步

## 已知限制
- 市場資料是每天收盤後的數字，不是即時價格；合約現價、強平價以交易所 App 為準
- Yahoo、CNN 的資料介面不是官方公開 API，可能改版；失敗時看 Actions 的紀錄，市場頁會列出抓不到的項目，恐懼貪婪可以手動填
- 資料只存在該裝置、該網址的瀏覽器；不同裝置要靠匯出匯入搬移
