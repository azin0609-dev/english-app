// 今日任務排程：依待複習數量與弱點，排出 15～30 分鐘的練習組合
import { addDays } from './util.js';

export const TYPES = ['vocab', 'grammar', 'shadowing'];
export const BASE = { vocab: 10, grammar: 5, shadowing: 3 };   // 基本題數（約 15 分鐘）
export const MAX = { vocab: 20, grammar: 10, shadowing: 6 };   // 上限（全部加滿約 29 分鐘）
export const MINUTES = { vocab: 0.5, grammar: 1, shadowing: 1.5 }; // 每題預估分鐘
export const WEAK_BOOST = 1.5;  // 弱點項目題數 ×1.5
export const WEAK_LIMIT = 85;   // 正確率低於這個才算弱點
export const MIN_SAMPLES = 5;   // 最近 7 天至少作答幾題才列入比較

/** 最近 N 天各項正確率（跟讀用平均分數） */
export function recentAccuracy(daily, today, days = 7) {
  const acc = {};
  for (const t of TYPES) {
    let num = 0;
    let den = 0;
    for (let i = 0; i < days; i++) {
      const d = daily[addDays(today, -i)];
      if (!d) continue;
      if (t === 'shadowing') {
        num += d.shadowing?.scoreSum || 0;
        den += d.shadowing?.count || 0;
      } else {
        num += (d[t]?.right || 0) * 100;
        den += d[t]?.total || 0;
      }
    }
    acc[t] = { n: den, pct: den ? Math.round(num / den) : null };
  }
  return acc;
}

/** 正確率最低、而且低於 85% 的項目 */
export function findWeakest(acc) {
  const cands = TYPES.filter(t => acc[t].n >= MIN_SAMPLES);
  if (!cands.length) return null;
  const weakest = cands.reduce((a, b) => (acc[b].pct < acc[a].pct ? b : a));
  return acc[weakest].pct < WEAK_LIMIT ? weakest : null;
}

/** 已到期的題目：越早到期越前面，同一天到期的 level 低的先 */
export function dueList(items, progress, today) {
  return items
    .filter(it => progress[it.id] && progress[it.id].nextReview <= today)
    .sort((a, b) => {
      const pa = progress[a.id];
      const pb = progress[b.id];
      if (pa.nextReview !== pb.nextReview) return pa.nextReview < pb.nextReview ? -1 : 1;
      return (pa.level || 0) - (pb.level || 0);
    });
}

/** 沒做過的新題；單字的商務與企業安全兩類輪流出現 */
export function newList(items, progress, type) {
  const fresh = items.filter(it => !progress[it.id]);
  if (type !== 'vocab') return fresh;
  const groups = {};
  for (const it of fresh) (groups[it.category] ||= []).push(it);
  const keys = Object.keys(groups);
  const out = [];
  for (let i = 0; out.length < fresh.length; i++) {
    for (const k of keys) if (groups[k][i]) out.push(groups[k][i]);
  }
  return out;
}

/** 還沒到期的題目，依下次複習日排序（自由練習時用來補題） */
export function earlyList(items, progress, today) {
  return items
    .filter(it => progress[it.id] && progress[it.id].nextReview > today)
    .sort((a, b) => (progress[a.id].nextReview < progress[b.id].nextReview ? -1 : 1));
}

/**
 * 排出今日任務。
 * items: { vocab:[], grammar:[], shadowing:[] }，progress / daily 來自使用者資料
 */
export function buildPlan({ items, progress, daily, today }) {
  const accuracy = recentAccuracy(daily, today);
  const weakest = findWeakest(accuracy);
  const quotas = {};
  const due = {};
  const picked = [];
  for (const t of TYPES) {
    const dl = dueList(items[t], progress, today);
    due[t] = dl.length;
    let q = BASE[t];
    if (t === weakest) q = Math.ceil(q * WEAK_BOOST);
    if (dl.length > q) q = dl.length;       // 待複習太多就加量……
    q = Math.min(q, MAX[t]);                // ……但不超過上限，剩下的順延
    const chosen = dl.slice(0, q);
    if (chosen.length < q) chosen.push(...newList(items[t], progress, t).slice(0, q - chosen.length));
    quotas[t] = chosen.length;
    picked.push(...chosen.map(it => ({ id: it.id, type: t })));
  }
  const estMinutes = Math.round(TYPES.reduce((s, t) => s + quotas[t] * MINUTES[t], 0));
  return { date: today, items: picked, done: {}, quotas, due, weakest, accuracy, estMinutes };
}

/** 自由練習選題：到期 → 新題 → 提前複習 */
export function pickPractice(items, progress, today, n, type) {
  const list = [
    ...dueList(items, progress, today),
    ...newList(items, progress, type),
    ...earlyList(items, progress, today),
  ];
  return list.slice(0, n);
}
