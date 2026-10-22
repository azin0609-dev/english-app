// 練習卡片共用的小工具
import { todayStr, daysBetween, shortDate, esc } from '../util.js';
import { isModalOpen } from '../ui.js';

/** 作答後顯示：獲得經驗值、熟練度、下次複習日 */
export function reviewNote(info) {
  if (!info) return '<span class="muted small">（再練一次的題目不計分）</span>';
  const { rec, early, xp, outcome } = info;
  const days = daysBetween(todayStr(), rec.nextReview);
  const when = days <= 0 ? '今天稍後再複習' : `下次複習 ${shortDate(rec.nextReview)}（${days} 天後）`;
  const earlyNote = early && outcome !== 'reset' ? ' · 還沒到複習日，提前練習不升級' : '';
  return `<span class="xp-pop">+${xp} XP</span>
    <span class="muted small">熟練度 Lv ${rec.level} · ${when}${earlyNote}</span>`;
}

/** 把例句中的單字標出來 */
export function highlight(sentence, word) {
  const pattern = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc(sentence).replace(new RegExp(`\\b(${pattern}\\w*)`, 'gi'), '<mark>$1</mark>');
}

/** 鍵盤快捷鍵；對話框開著或正在打字時不作用 */
export function bindKeys(handler) {
  const onKey = e => {
    if (isModalOpen()) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    handler(e);
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
