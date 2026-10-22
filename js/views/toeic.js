// 多益軌道入口
import { getState } from '../store.js';
import { todayStr } from '../util.js';
import { itemsOf } from '../content.js';
import { dueList } from '../planner.js';
import { hubCard } from '../ui.js';

export function typeSummary(type) {
  const p = getState().progress;
  const items = itemsOf(type);
  return {
    total: items.length,
    learned: items.filter(it => p[it.id]).length,
    due: dueList(items, p, todayStr()).length,
  };
}

export function render(el) {
  const v = typeSummary('vocab');
  const g = typeSummary('grammar');
  el.innerHTML = `
    <div class="page-head">
      <h1>📘 多益軌道</h1>
      <p>目標：多益 700 分</p>
    </div>
    <div class="hub">
      ${hubCard({ href: '#/vocab', icon: '🔤', title: '單字', desc: '商務常用字＋企業安全專用字', extra: `已學 ${v.learned} / ${v.total} · 待複習 ${v.due}` })}
      ${hubCard({ href: '#/grammar', icon: '✏️', title: '文法填空', desc: 'Part 5 型四選一，附中文解析', extra: `已練 ${g.learned} / ${g.total} · 待複習 ${g.due}` })}
      ${hubCard({ icon: '🎧', title: '聽力應答', desc: 'Part 2 型・第二階段開放', locked: true })}
      ${hubCard({ icon: '📰', title: '短篇閱讀', desc: 'Part 7 型・第二階段開放', locked: true })}
      ${hubCard({ icon: '🧭', title: '程度診斷', desc: '20 題起始測驗・第二階段開放', locked: true })}
    </div>`;
  return null;
}
