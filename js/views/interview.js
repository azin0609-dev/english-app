// 面試軌道入口
import { getState } from '../store.js';
import { hubCard } from '../ui.js';
import { typeSummary } from './toeic.js';

export function render(el) {
  const s = typeSummary('shadowing');
  const stories = getState().stories.length;
  el.innerHTML = `
    <div class="page-head">
      <h1>🎤 面試軌道</h1>
      <p>目標：通過外商企業安全職的英文面試</p>
    </div>
    <div class="hub">
      ${hubCard({ href: '#/shadowing', icon: '🗣️', title: '跟讀練習', desc: '看中文先說，再聽英文、逐字比對', extra: `已練 ${s.learned} / ${s.total} 句 · 待複習 ${s.due}` })}
      ${hubCard({ href: '#/stories', icon: '📝', title: '我的故事庫', desc: 'STAR 格式記錄工作案例，中英對照', extra: `${stories} 個故事` })}
      ${hubCard({ icon: '❓', title: '常見面試題', desc: '15 題外商安全職常見問題・第二階段開放', locked: true })}
      ${hubCard({ icon: '⏱️', title: '模擬面試', desc: '隨機 3 題、倒數計時作答・第二階段開放', locked: true })}
    </div>`;
  return null;
}
