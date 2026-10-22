// 單字：分類瀏覽、朗讀、練習
import { getState } from '../store.js';
import { todayStr, esc, shortDate } from '../util.js';
import { itemsOf, VOCAB_CATEGORY } from '../content.js';
import { dueList, pickPractice } from '../planner.js';
import { sayBtn, levelDots } from '../ui.js';
import { startPractice } from './practice.js';

export function statusText(rec, today) {
  if (!rec) return '<span class="chip">新</span>';
  if (rec.nextReview <= today) return '<span class="chip warn">待複習</span>';
  return `<span class="muted small">${shortDate(rec.nextReview)} 複習</span>`;
}

let filter = 'all';

export function render(el) {
  const draw = () => {
    const st = getState();
    const today = todayStr();
    const all = itemsOf('vocab');
    const list = filter === 'all' ? all : all.filter(x => x.category === filter);
    const due = dueList(list, st.progress, today).length;
    const fresh = list.filter(x => !st.progress[x.id]).length;
    el.innerHTML = `
      <div class="page-head">
        <a href="#/toeic" class="small">← 多益</a>
        <h1>🔤 單字</h1>
        <p>${list.length} 個單字 · 待複習 ${due} · 還沒學 ${fresh}</p>
      </div>
      <div class="card">
        <div class="segmented" role="group" aria-label="分類">
          ${[['all', '全部'], ['business', VOCAB_CATEGORY.business], ['security', VOCAB_CATEGORY.security]]
            .map(([k, label]) => `<button type="button" data-filter="${k}" class="${filter === k ? 'on' : ''}">${label}</button>`).join('')}
        </div>
        <div class="actions">
          <button type="button" class="btn primary big" data-act="practice">▶ 練習 10 題</button>
        </div>
        <p class="muted small" style="margin-top:8px">出題順序：到期複習 → 新單字 → 提前複習。點清單裡的單字可以單獨練習。</p>
      </div>
      <div class="card">
        <ul class="list">
          ${list.map(it => {
            const rec = st.progress[it.id];
            return `
              <li class="list-item">
                <div class="li-main clickable" data-id="${it.id}" role="button" tabindex="0">
                  <div class="li-title en">${esc(it.word)} <span class="muted small">${esc(it.pos)}</span></div>
                  <div class="li-sub">${esc(it.zh)}</div>
                  <div class="li-sub en small">${esc(it.example)}</div>
                </div>
                <div class="li-side">
                  ${sayBtn(it.word)}
                  ${levelDots(rec?.level || 0)}
                  ${statusText(rec, today)}
                </div>
              </li>`;
          }).join('')}
        </ul>
      </div>`;

    el.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
      filter = b.dataset.filter;
      draw();
    }));
    el.querySelector('[data-act="practice"]').addEventListener('click', () => {
      const picked = pickPractice(list, st.progress, today, 10, 'vocab');
      startPractice({ title: '單字練習', ids: picked.map(x => x.id), back: '#/vocab' });
    });
    el.querySelectorAll('[data-id]').forEach(row => {
      const go = () => startPractice({ title: '單字練習', ids: [row.dataset.id], back: '#/vocab' });
      row.addEventListener('click', go);
      row.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });
  };
  draw();
  return null;
}
