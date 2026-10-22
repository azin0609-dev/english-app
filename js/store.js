// 資料儲存：所有個人資料放在瀏覽器 localStorage 的同一個鍵底下
import { todayStr } from './util.js';

const KEY = 'eng-app-v1';
export const SCHEMA_VERSION = 1;
export const APP_ID = 'english-app';

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: todayStr(),
    // 每一題的複習狀態，用題目 id 對應：{ level, nextReview, lastReview, attempts, right, wrong, lastScore }
    progress: {},
    // STAR 故事：{ id, title, situation:{zh,en}, task, action, result, updatedAt }
    stories: [],
    // 每天的練習紀錄：{ seconds, xp, vocab:{right,total}, grammar:{right,total}, shadowing:{scoreSum,count}, planDone }
    daily: {},
    // 今天排好的任務：{ date, items:[{id,type}], done:{id:true}, quotas, due, weakest, accuracy, estMinutes, round }
    todayPlan: null,
    // 角色：經驗值與徽章 { xp, badges: { badgeId: 取得日期 } }
    player: { xp: 0, badges: {} },
    settings: { rate: 1, voice: '', autoSpeak: true, selfRate: false, lastExport: null },
  };
}

let state = null;
let storageOk = true;

/** 把讀進來的資料補齊缺少的欄位（也用在匯入） */
export function normalize(data) {
  const d = defaultState();
  if (!data || typeof data !== 'object') return d;
  const s = {
    ...d,
    ...data,
    progress: isObj(data.progress) ? data.progress : {},
    stories: Array.isArray(data.stories) ? data.stories : [],
    daily: isObj(data.daily) ? data.daily : {},
    player: { ...d.player, ...(isObj(data.player) ? data.player : {}) },
    settings: { ...d.settings, ...(isObj(data.settings) ? data.settings : {}) },
  };
  if (!isObj(s.player.badges)) s.player.badges = {};
  return migrate(s);
}

function isObj(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
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

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    storageOk = false;
    console.error('儲存失敗', e);
  }
}

export function isStorageOk() {
  return storageOk;
}

// ===== 匯出／匯入 =====

export function exportData(s = getState()) {
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: s };
}

/** 檢查匯入檔案是不是這個 App 的備份 */
export function validateImport(obj) {
  if (!isObj(obj)) return { ok: false, error: '檔案內容不是有效的 JSON 物件。' };
  if (obj.app !== APP_ID || !isObj(obj.data)) return { ok: false, error: '這不是「英語特訓」的備份檔。' };
  if (typeof obj.schemaVersion === 'number' && obj.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: '這個備份來自較新版本的 App，請先更新 App。' };
  }
  const d = obj.data;
  if (d.progress !== undefined && !isObj(d.progress)) return { ok: false, error: '備份裡的進度資料格式錯誤。' };
  if (d.stories !== undefined && !Array.isArray(d.stories)) return { ok: false, error: '備份裡的故事庫格式錯誤。' };
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
