// 共用小工具：日期、HTML 跳脫、洗牌、句子切割

let fixedToday = null;

/** 測試用：固定「今天」的日期（網址加 ?today=2026-10-25 時會用到） */
export function setFixedToday(dateStr) {
  fixedToday = /^\d{4}-\d{2}-\d{2}$/.test(dateStr || '') ? dateStr : null;
}
export function getFixedToday() {
  return fixedToday;
}

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 今天的本地日期（YYYY-MM-DD），過了午夜才算新的一天 */
export function todayStr() {
  return fixedToday || toDateStr(new Date());
}

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** b 比 a 晚幾天 */
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

/** 這一週的星期一 */
export function weekStart(str) {
  const d = parseDate(str);
  const dow = (d.getDay() + 6) % 7; // 週一 = 0
  d.setDate(d.getDate() - dow);
  return toDateStr(d);
}

/** 「10/22」這種短日期 */
export function shortDate(str) {
  const [, m, d] = str.split('-').map(Number);
  return `${m}/${d}`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 把文字轉成短代碼（用來替故事句子產生固定編號） */
export function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const ABBR = /\b(Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Co|St|vs|etc|No)\.$/i;

/** 英文段落切成句子 */
export function splitSentencesEn(text) {
  const parts = (text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) || [];
  const out = [];
  for (const p of parts) {
    const s = p.trim();
    if (!s) continue;
    if (out.length && ABBR.test(out[out.length - 1])) out[out.length - 1] += ' ' + s;
    else out.push(s);
  }
  return out;
}

/** 中文段落切成句子 */
export function splitSentencesZh(text) {
  return ((text || '').match(/[^。！？!?]+[。！？!?]*/g) || []).map(s => s.trim()).filter(Boolean);
}

/** 秒數 → 「12 分鐘」或「1 小時 5 分」 */
export function fmtDuration(seconds) {
  if (seconds > 0 && seconds < 60) return '不到 1 分鐘';
  const min = Math.round((seconds || 0) / 60);
  if (min < 60) return `${min} 分鐘`;
  return `${Math.floor(min / 60)} 小時 ${min % 60} 分`;
}
