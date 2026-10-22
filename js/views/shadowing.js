// 跟讀練習：面試句庫＋我的故事句
import { getState } from '../store.js';
import { todayStr, esc } from '../util.js';
import { itemsOf, SHADOW_TAG } from '../content.js';
import { dueList, pickPractice } from '../planner.js';
import { sayBtn, levelDots } from '../ui.js';
import { sttSupported } from '../speech.js';
import { startPractice } from './practice.js';
import { statusText } from './vocab.js';

let filter = 'all';

export function render(el) {
  const draw = () => {
    const st = getState();
    const today = todayStr();
    const all = itemsOf('shadowing');
    const list = filter === 'all' ? all : all.filter(x => x.source === filter);
    const due = dueList(list, st.progress, today).length;
    el.innerHTML = `
      <div class="page-head">
        <a href="#/interview" class="small">← 面試</a>
        <h1>🗣️ 跟讀練習</h1>
        <p>${list.length} 句 · 待複習 ${due}</p>
      </div>
      <div class="card">
        <div class="segmented" role="group" aria-label="來源">
          ${[['all', '全部'], ['seed', '面試句庫'], ['story', '我的故事']]
            .map(([k, label]) => `<button type="button" data-filter="${k}" class="${filter === k ? 'on' : ''}">${label}</button>`).join('')}
        </div>
        <div class="actions">
          <button type="button" class="btn primary big" data-act="practice" ${list.length ? '' : 'disabled'}>▶ 練習 3 句</button>
        </div>
        <p class="muted small" style="margin-top:8px">
          流程：看中文 → 用英文說 → 顯示英文並朗讀 → 逐字標色。只有第一次（看中文說）會計分。
          ${sttSupported() ? '' : '<br>⚠️ 這個瀏覽器不支援語音辨識，會改用自評模式。'}
        </p>
      </div>
      ${filter === 'story' && !list.length ? `
        <div class="card"><p>還沒有故事句。到「我的故事庫」寫下你的 STAR 故事，英文會自動拆成句子放到這裡。</p>
          <a class="btn" href="#/stories">前往故事庫</a></div>` : ''}
      <div class="card ${list.length ? '' : 'hidden'}">
        <ul class="list">
          ${list.map(it => {
            const rec = st.progress[it.id];
            const tag = it.source === 'story' ? `📝 ${esc(it.storyTitle)}・${esc(it.part)}` : esc(SHADOW_TAG[it.tag] || '');
            return `
              <li class="list-item">
                <div class="li-main clickable" data-id="${it.id}" role="button" tabindex="0">
                  <div class="li-sub small">${tag}</div>
                  <div class="li-title en">${esc(it.en)}</div>
                  <div class="li-sub">${esc(it.zh)}</div>
                </div>
                <div class="li-side">
                  ${sayBtn(it.en)}
                  ${levelDots(rec?.level || 0)}
                  ${rec?.lastScore !== undefined ? `<span class="muted small">上次 ${rec.lastScore}%</span>` : ''}
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
      const picked = pickPractice(list, st.progress, today, 3, 'shadowing');
      startPractice({ title: '跟讀練習', ids: picked.map(x => x.id), back: '#/shadowing' });
    });
    el.querySelectorAll('[data-id]').forEach(row => {
      const go = () => startPractice({ title: '跟讀練習', ids: [row.dataset.id], back: '#/shadowing' });
      row.addEventListener('click', go);
      row.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });
  };
  draw();
  return null;
}
