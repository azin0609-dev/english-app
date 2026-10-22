// 文法填空：題目清單與練習
import { getState } from '../store.js';
import { todayStr, esc } from '../util.js';
import { itemsOf } from '../content.js';
import { dueList, pickPractice } from '../planner.js';
import { levelDots } from '../ui.js';
import { startPractice } from './practice.js';
import { statusText } from './vocab.js';

export function render(el) {
  const st = getState();
  const today = todayStr();
  const list = itemsOf('grammar');
  const due = dueList(list, st.progress, today).length;
  const fresh = list.filter(x => !st.progress[x.id]).length;
  el.innerHTML = `
    <div class="page-head">
      <a href="#/toeic" class="small">← 多益</a>
      <h1>✏️ 文法填空</h1>
      <p>${list.length} 題 · 待複習 ${due} · 還沒做 ${fresh}</p>
    </div>
    <div class="card">
      <div class="actions" style="margin-top:0">
        <button type="button" class="btn primary big" data-n="5">▶ 練習 5 題</button>
        <button type="button" class="btn big" data-n="10">練習 10 題</button>
      </div>
      <p class="muted small" style="margin-top:8px">答錯會顯示中文解析，並在這一輪最後再出一次。點清單裡的題目可以單獨練習。</p>
    </div>
    <div class="card">
      <ul class="list">
        ${list.map(it => {
          const rec = st.progress[it.id];
          return `
            <li class="list-item">
              <div class="li-main clickable" data-id="${it.id}" role="button" tabindex="0">
                <div class="li-title">${esc(it.topic)}</div>
                <div class="li-sub en">${esc(it.question)}</div>
              </div>
              <div class="li-side">${levelDots(rec?.level || 0)}${statusText(rec, today)}</div>
            </li>`;
        }).join('')}
      </ul>
    </div>`;

  el.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
    const picked = pickPractice(list, st.progress, today, Number(b.dataset.n), 'grammar');
    startPractice({ title: '文法練習', ids: picked.map(x => x.id), back: '#/grammar' });
  }));
  el.querySelectorAll('[data-id]').forEach(row => {
    const go = () => startPractice({ title: '文法練習', ids: [row.dataset.id], back: '#/grammar' });
    row.addEventListener('click', go);
    row.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
  return null;
}
