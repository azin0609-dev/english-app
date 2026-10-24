// 資料儲存：所有個人資料（持倉、規則、日誌）都放在這台裝置瀏覽器的 localStorage，不會上傳
import { todayStr } from './util.js';

const KEY = 'invest-desk-v1';
export const SCHEMA_VERSION = 1;
export const APP_ID = 'invest-dashboard';

/** 規則預設值（範例數字，使用者要到「設定」改成自己的） */
export function defaultRules() {
  return {
    perTradePct: 2, // 每筆合約最多虧合約帳戶的 %
    maxLev: 5, // 槓桿上限（倍）
    contractCapPct: 10, // 合約帳戶最多占投資資產的 %
    riskBudgetPct: 2, // 所有停損同時觸發時，最多虧投資資產的 %
    satCapPct: 40, // 衛星桶（個股＋合約）上限 %
    singleCapPct: 20, // 單一個股曝險（股票市值＋合約持倉價值）上限 %
    efMonths: 6, // 預備金目標：幾個月生活費
    opensPerDay: 3, // 每天打開 App 的次數上限
    coolHours: 24, // 看到別人推薦才想買：冷靜期（小時）
    fear: 25, // 恐懼貪婪指數低於這個 → 極度恐懼
    greed: 75, // 高於等於這個 → 極度貪婪
    fearMult: 1.5, // 極度恐懼時定投倍數
    greedMult: 0.5, // 極度貪婪時定投倍數
    dipTiers: [10, 20, 30], // 大盤距一年高點跌幾 % 觸發第 1／2／3 段加碼
    coreUsPct: 50, // 核心桶裡美股的目標比例 %
    chasePct: 15, // 進場價高於 60 日線幾 % 算追高
    minRR: 2, // 最低盈虧比
    confirmed: false, // 使用者是否已確認過規則數字
  };
}

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: todayStr(),
    // 最後一次更新持倉的日期
    updatedAt: null,
    accounts: {
      cashTwd: 0, // 投資用台幣現金（不含預備金）
      cashUsd: 0, // 券商裡的美元現金
      emergency: 0, // 預備金（台幣）
      monthlyExpense: 0, // 每月生活費（台幣）
      contractEquity: 0, // 合約帳戶權益（美元／USDT）
    },
    // 股票與 ETF：{ id, mkt:'tw'|'us', sym, name, value, cost, bucket:'core'|'sat', sector }
    // value / cost：台股用台幣、美股用美元
    holdings: [],
    // 合約：{ id, sym, name, side:'long'|'short', qty, entry, mark, lev, liq, stop, cross, sector }
    // 價格與金額都用美元
    contracts: [],
    rules: defaultRules(),
    plan: {
      monthly: 0, // 每月可投入（台幣）
      twEtf: '0050',
      usEtf: 'VOO',
      pool: 0, // 大跌加碼池（台幣）
      dcaDone: {}, // { 'YYYY-MM': 完成日期 }
      dipUsed: {}, // { 段數: 執行日期 }
      fngManual: null, // 手動輸入的恐懼貪婪指數（自動抓不到時用）
    },
    // 交易日誌：{ id, date, sym, action, lev, amount, source, mood, reason, wrongIf, result }
    journal: [],
    // 想買清單（冷靜期）：{ id, sym, note, source, addedAt(ISO) }
    wishlist: [],
    opens: { date: '', n: 0 }, // 今天打開幾次
    peeks: {}, // 提前偷看損益：{ 'YYYY-MM': 次數 }
    settings: { fx: null, lastExport: null },
  };
}

let state = null;
let storageOk = true;

function isObj(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

/** 把讀進來的資料補齊缺少的欄位（也用在匯入） */
export function normalize(data) {
  const d = defaultState();
  if (!isObj(data)) return d;
  const s = {
    ...d,
    ...data,
    accounts: { ...d.accounts, ...(isObj(data.accounts) ? data.accounts : {}) },
    holdings: Array.isArray(data.holdings) ? data.holdings : [],
    contracts: Array.isArray(data.contracts) ? data.contracts : [],
    rules: { ...d.rules, ...(isObj(data.rules) ? data.rules : {}) },
    plan: { ...d.plan, ...(isObj(data.plan) ? data.plan : {}) },
    journal: Array.isArray(data.journal) ? data.journal : [],
    wishlist: Array.isArray(data.wishlist) ? data.wishlist : [],
    opens: { ...d.opens, ...(isObj(data.opens) ? data.opens : {}) },
    peeks: isObj(data.peeks) ? data.peeks : {},
    settings: { ...d.settings, ...(isObj(data.settings) ? data.settings : {}) },
  };
  if (!isObj(s.plan.dcaDone)) s.plan.dcaDone = {};
  if (!isObj(s.plan.dipUsed)) s.plan.dipUsed = {};
  if (!Array.isArray(s.rules.dipTiers) || s.rules.dipTiers.length !== 3) s.rules.dipTiers = d.rules.dipTiers;
  return migrate(s);
}

// 日後資料格式改版時，在這裡把舊版轉成新版
function migrate(s) {
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}

export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    storageOk = false;
  }
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = null; }
  }
  state = normalize(data);
  return state;
}

export function getState() {
  if (!state) load();
  return state;
}

/** 測試用：直接換掉目前資料（不存檔） */
export function setStateForTest(s) {
  state = s;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    storageOk = false;
    console.error('儲存失敗', e);
  }
}

/** 改了持倉數字：記下更新日期再存檔 */
export function touch() {
  getState().updatedAt = todayStr();
  save();
}

export function isStorageOk() {
  return storageOk;
}

/** 每次打開 App 算一次 */
export function countOpen(today = todayStr()) {
  const s = getState();
  if (s.opens.date !== today) s.opens = { date: today, n: 0 };
  s.opens.n++;
  save();
  return s.opens.n;
}

export function hasHoldings(s = getState()) {
  return s.holdings.length + s.contracts.length > 0;
}

// ===== 匯出／匯入 =====

export function exportData(s = getState()) {
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: s };
}

/** 檢查匯入檔案是不是這個 App 的備份 */
export function validateImport(obj) {
  if (!isObj(obj)) return { ok: false, error: '檔案內容不是有效的 JSON 物件。' };
  if (obj.app !== APP_ID || !isObj(obj.data)) return { ok: false, error: '這不是「投資儀表板」的備份檔。' };
  if (typeof obj.schemaVersion === 'number' && obj.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: '這個備份來自較新版本的 App，請先更新 App。' };
  }
  const d = obj.data;
  for (const k of ['holdings', 'contracts', 'journal', 'wishlist']) {
    if (d[k] !== undefined && !Array.isArray(d[k])) return { ok: false, error: `備份裡的 ${k} 格式錯誤。` };
  }
  return { ok: true, data: d };
}

export function importData(obj) {
  const v = validateImport(obj);
  if (!v.ok) throw new Error(v.error);
  state = normalize(v.data);
  save();
  return state;
}

export function clearAll() {
  try { localStorage.removeItem(KEY); } catch { /* 忽略 */ }
  state = defaultState();
  save();
}
