// 間隔複習規則（所有題目與句子共用）
import { addDays } from './util.js';

// level → 下次複習要隔幾天
export const INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_LEVEL = 5;
export const PASS_SCORE = 85; // 跟讀 ≥ 85% 算答對
export const FAIL_SCORE = 60; // 跟讀 < 60% 算答錯

/**
 * 把一次作答換成結果：
 * 'up'    答對／跟讀 ≥ 85%  → level + 1
 * 'keep'  跟讀 60～84%      → level 不變
 * 'reset' 答錯／跟讀 < 60%  → level 歸 0
 */
export function outcomeOf(result) {
  if (typeof result.score === 'number') {
    if (result.score >= PASS_SCORE) return 'up';
    if (result.score < FAIL_SCORE) return 'reset';
    return 'keep';
  }
  return result.correct ? 'up' : 'reset';
}

/** 沒做過，或下次複習日已到 */
export function isDue(rec, today) {
  return !rec || rec.nextReview <= today;
}

/**
 * 依作答結果更新一筆複習紀錄。
 * 「提前練習」（還沒到複習日就做）：答對不升級、維持原排程；答錯一樣歸 0。
 */
export function applyResult(rec, result, today) {
  const prev = rec || { level: 0, nextReview: today, lastReview: null, attempts: 0, right: 0, wrong: 0 };
  const early = !!rec && rec.nextReview > today;
  const outcome = outcomeOf(result);
  const next = { ...prev, attempts: (prev.attempts || 0) + 1, lastReview: today };
  if (typeof result.score === 'number') next.lastScore = result.score;
  if (outcome === 'up') next.right = (prev.right || 0) + 1;
  if (outcome === 'reset') next.wrong = (prev.wrong || 0) + 1;

  if (outcome === 'reset') {
    next.level = 0;
    next.nextReview = addDays(today, INTERVALS[0]);
  } else if (!early) {
    if (outcome === 'up') next.level = Math.min(MAX_LEVEL, (prev.level || 0) + 1);
    next.nextReview = addDays(today, INTERVALS[next.level]);
  }
  return { rec: next, outcome, early };
}
