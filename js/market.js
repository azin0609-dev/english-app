// 市場資料：讀 data/market.json（GitHub 每天自動更新兩次），並計算均線、距高點等數字
import { isNum, daysBetween, toDateStr } from './util.js';

export const IDX = {
  tw: '^TWII', // 台股加權指數
  us: '^GSPC', // S&P 500
  nas: '^IXIC', // Nasdaq
  vix: '^VIX',
  tnx: '^TNX', // 美國 10 年期公債殖利率
  fx: 'TWD=X', // 美元兌台幣
};

export const DEFAULT_FX = 32;

let market = emptyMarket();

export function emptyMarket() {
  return { updatedAt: null, series: {}, fng: null, tw: null, errors: [], from: 'none' };
}

/** 放在 GitHub Pages 時，順便讀 GitHub 上最新的那份（網站重新建置前也能拿到新資料） */
export function githubRawUrl(loc = globalThis.location) {
  if (!loc || !String(loc.hostname).endsWith('.github.io')) return null;
  const owner = loc.hostname.split('.')[0];
  const repo = loc.pathname.split('/').filter(Boolean)[0];
  if (!repo) return null;
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/data/market.json`;
}

async function fetchJson(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { cache: 'no-cache', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 兩個來源都讀，用比較新的那份 */
export async function loadMarket() {
  const sources = [['local', 'data/market.json'], ['github', githubRawUrl()]].filter(s => s[1]);
  const results = await Promise.allSettled(sources.map(([, u]) => fetchJson(u, 6000)));
  let best = null;
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value || typeof r.value !== 'object') return;
    if (!best || (r.value.updatedAt || '') > (best.updatedAt || '')) best = { ...r.value, from: sources[i][0] };
  });
  market = best ? { ...emptyMarket(), ...best, series: best.series || {} } : emptyMarket();
  return market;
}

export function getMarket() {
  return market;
}

export function setMarketForTest(m) {
  market = { ...emptyMarket(), ...m };
}

/** 資料距今幾天（沒有資料回傳 null） */
export function marketAgeDays(m, today) {
  if (!m.updatedAt) return null;
  const d = new Date(m.updatedAt);
  if (Number.isNaN(d.getTime())) return null;
  return daysBetween(toDateStr(d), today);
}

/** 用使用者輸入的代號找序列：「0050」→「0050.TW」、「nvda」→「NVDA」 */
export function findSeries(m, sym) {
  const s = String(sym || '').trim().toUpperCase();
  if (!s) return null;
  for (const k of [s, `${s}.TW`, `${s}.TWO`]) {
    const ser = m.series[k];
    if (ser && Array.isArray(ser.d) && ser.d.length) return { key: k, ...ser };
  }
  return null;
}

export function closes(ser) {
  return ser.d.map(r => r[1]);
}

/** 簡單移動平均；資料不足的位置是 null */
export function sma(arr, n) {
  const out = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** 最新收盤與前一天的漲跌 */
export function lastOf(ser) {
  if (!ser || !ser.d.length) return null;
  const n = ser.d.length;
  const [date, v] = ser.d[n - 1];
  const prev = n > 1 ? ser.d[n - 2][1] : null;
  return { date, v, prev, chg: isNum(prev) && prev ? v / prev - 1 : null };
}

/** 價格和 60 日線、200 日線的關係 */
export function trendOf(ser) {
  if (!ser || !ser.d.length) return null;
  const c = closes(ser);
  const price = c[c.length - 1];
  const ma60 = sma(c, 60).at(-1);
  const ma200 = sma(c, 200).at(-1);
  return {
    price,
    date: ser.d.at(-1)[0],
    ma60,
    ma200,
    above60: isNum(ma60) ? price > ma60 : null,
    above200: isNum(ma200) ? price > ma200 : null,
    ext60: isNum(ma60) ? price / ma60 - 1 : null,
  };
}

/** 距最近一年（約 252 個交易日）最高收盤跌了多少 */
export function drawdown(ser, lookback = 252) {
  if (!ser || !ser.d.length) return null;
  const rows = ser.d.slice(-lookback);
  let hi = rows[0];
  for (const r of rows) if (r[1] > hi[1]) hi = r;
  const last = rows[rows.length - 1];
  return { high: hi[1], highDate: hi[0], last: last[1], date: last[0], dd: 1 - last[1] / hi[1] };
}

/** 美元兌台幣：設定裡手動填的優先，其次是自動抓的，最後用預設值 */
export function fxOf(state, m) {
  const manual = state.settings.fx;
  if (isNum(manual) && manual > 0) return { v: manual, src: '手動' };
  const l = lastOf(findSeries(m, IDX.fx));
  if (l && isNum(l.v) && l.v > 0) return { v: l.v, src: '自動', date: l.date };
  return { v: DEFAULT_FX, src: '預設' };
}

/** 股市恐懼與貪婪指數：手動填的優先，其次是 CNN */
export function fngOf(state, m) {
  const manual = state.plan.fngManual;
  if (isNum(manual)) return { v: manual, src: '手動' };
  if (m.fng && isNum(m.fng.v)) return { v: m.fng.v, src: 'CNN', date: m.fng.date };
  return null;
}

export function fngLabel(v, rules) {
  if (!isNum(v)) return '—';
  if (v < rules.fear) return '極度恐懼';
  if (v < 45) return '恐懼';
  if (v <= 55) return '中性';
  if (v < rules.greed) return '貪婪';
  return '極度貪婪';
}

export function seriesName(m, key) {
  const names = {
    [IDX.tw]: '台股加權指數',
    [IDX.us]: 'S&P 500',
    [IDX.nas]: 'Nasdaq',
    [IDX.vix]: 'VIX 波動率',
    [IDX.tnx]: '美國 10 年期殖利率',
    [IDX.fx]: '美元兌台幣',
  };
  return names[key] || m.series[key]?.name || key;
}
