// 交易日誌：選項清單與統計（哪種消息來源、哪種情緒最常讓你賠錢）
import { isNum, daysBetween } from './util.js';

export const SOURCES = [
  ['self', '自己研究'],
  ['kol', 'KOL／社群'],
  ['news', '新聞'],
  ['friend', '朋友推薦'],
  ['rule', '照規則（定投／加碼）'],
  ['other', '其他'],
];
// 這幾種來源要先過冷靜期
export const EMO_SOURCES = ['kol', 'news', 'friend'];

export const MOODS = [
  ['calm', '冷靜'],
  ['excited', '興奮'],
  ['fear', '害怕'],
  ['revenge', '想翻本'],
  ['fomo', '怕錯過'],
];

export const ACTIONS = [
  ['buy', '買進股票'],
  ['sell', '賣出股票'],
  ['long', '開多單'],
  ['short', '開空單'],
  ['add', '加碼'],
  ['close', '平倉'],
];
// 會產生「之後要記結果」的動作
const OPENING = ['buy', 'long', 'short', 'add'];

export const OUTCOMES = [
  ['win', '賺'],
  ['loss', '賠'],
  ['even', '打平'],
];

export function label(list, key) {
  return (list.find(x => x[0] === key) || [null, '—'])[1];
}

/** 依某個欄位（source / mood）分組：筆數、勝率、合計損益 */
export function statsBy(journal, field, list) {
  return list
    .map(([key, lab]) => {
      const js = journal.filter(j => j[field] === key);
      const closed = js.filter(j => j.result);
      const win = closed.filter(j => j.result.outcome === 'win').length;
      const loss = closed.filter(j => j.result.outcome === 'loss').length;
      const pnl = closed.reduce((a, j) => a + (isNum(j.result.pnl) ? j.result.pnl : 0), 0);
      return { key, label: lab, n: js.length, closed: closed.length, win, loss, winRate: closed.length ? win / closed.length : null, pnl };
    })
    .filter(r => r.n > 0);
}

/** 開倉超過 days 天還沒記結果的紀錄 */
export function pendingResults(journal, today, days = 7) {
  return journal.filter(j => !j.result && OPENING.includes(j.action) && j.date && daysBetween(j.date, today) >= days);
}
