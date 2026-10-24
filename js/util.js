// 共用小工具：日期、數字格式、HTML 跳脫

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

/** 今天的本地日期（YYYY-MM-DD） */
export function todayStr() {
  return fixedToday || toDateStr(new Date());
}

/** 現在的時間（毫秒）；測試模式時用那天的現在時刻 */
export function nowMs() {
  if (!fixedToday) return Date.now();
  const d = new Date();
  const [y, m, day] = fixedToday.split('-').map(Number);
  d.setFullYear(y, m - 1, day);
  return d.getTime();
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

/** 「2026-10」 */
export function monthOf(str) {
  return str.slice(0, 7);
}

/** 星期幾：0 = 週日 */
export function weekday(str) {
  return parseDate(str).getDay();
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

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** 有效數字（空白、文字、NaN 都算沒有） */
export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// ===== 數字格式 =====

/** 1234567 → 「1,234,567」 */
export function f0(n) {
  return isNum(n) ? Math.round(n).toLocaleString('en-US') : '—';
}

/** 價格：大數字不留小數，小數字留 2 位 */
export function fPrice(n) {
  if (!isNum(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
}

/** 台幣金額：滿 1 萬用「萬」 */
export function twd(n) {
  if (!isNum(n)) return '—';
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1e8) return `${sign}${(a / 1e8).toLocaleString('en-US', { maximumFractionDigits: 2 })} 億`;
  if (a >= 1e4) return `${sign}${(a / 1e4).toLocaleString('en-US', { maximumFractionDigits: 1 })} 萬`;
  return `${sign}${Math.round(a).toLocaleString('en-US')} 元`;
}

/** 美元金額 */
export function usd(n) {
  if (!isNum(n)) return '—';
  return `${n < 0 ? '−' : ''}${Math.round(Math.abs(n)).toLocaleString('en-US')} 美元`;
}

/** 0.123 → 「12.3%」 */
export function pct(r, d = 1) {
  return isNum(r) ? `${(r * 100).toFixed(d)}%` : '—';
}

/** 帶正負號的百分比：+1.2% / −3.4% */
export function spct(r, d = 1) {
  if (!isNum(r)) return '—';
  const v = (Math.abs(r) * 100).toFixed(d);
  if (Number(v) === 0) return `${v}%`;
  return r > 0 ? `+${v}%` : `−${v}%`;
}
