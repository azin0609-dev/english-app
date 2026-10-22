// 單字題：四選一，「看英文選中文」和「看中文選英文」輪流出
import { esc, shuffle } from '../util.js';
import { itemsOf, VOCAB_CATEGORY } from '../content.js';
import { getState } from '../store.js';
import { speak } from '../speech.js';
import { levelDots, sayBtn } from '../ui.js';
import { reviewNote, highlight, bindKeys } from './common.js';

export function mount(el, item, api) {
  const st = getState();
  const dir = api.index % 2 === 0 ? 'en2zh' : 'zh2en';
  const pool = itemsOf('vocab').filter(x => x.id !== item.id && x.zh !== item.zh && x.word !== item.word);
  const same = shuffle(pool.filter(x => x.category === item.category));
  const distractors = (same.length >= 3 ? same : shuffle(pool)).slice(0, 3);
  const options = shuffle([item, ...distractors]);
  const label = x => (dir === 'en2zh' ? x.zh : x.word);
  const level = st.progress[item.id]?.level || 0;

  el.innerHTML = `
    <div class="card qcard">
      <div class="q-meta">
        <span class="chip primary">${esc(VOCAB_CATEGORY[item.category] || '')}</span>
        ${levelDots(level)}
      </div>
      ${dir === 'en2zh'
        ? `<p class="q-ask">選出正確的中文意思</p>
           <div class="q-word en">${esc(item.word)} ${sayBtn(item.word)}</div>
           <div class="q-pos">${esc(item.pos)}</div>`
        : `<p class="q-ask">選出正確的英文單字</p>
           <div class="q-word zh">${esc(item.zh)}</div>
           <div class="q-pos">${esc(item.pos)}</div>`}
      <div class="options ${dir === 'zh2en' ? 'two-col' : ''}">
        ${options.map((o, i) => `
          <button type="button" class="opt" data-i="${i}">
            <span class="key">${i + 1}</span><span class="${dir === 'zh2en' ? 'en' : ''}">${esc(label(o))}</span>
          </button>`).join('')}
      </div>
      <div class="feedback hidden"></div>
      <div class="actions hidden"><button type="button" class="btn primary big next">下一題 →</button></div>
    </div>`;

  let answered = false;
  const buttons = [...el.querySelectorAll('.opt')];
  const fb = el.querySelector('.feedback');
  const actions = el.querySelector('.actions');

  function choose(i) {
    if (answered) return;
    answered = true;
    const correct = options[i].id === item.id;
    buttons.forEach((b, k) => {
      b.disabled = true;
      if (options[k].id === item.id) b.classList.add('correct');
      else if (k === i) b.classList.add('wrong');
    });
    const info = api.report({ correct });
    fb.className = `feedback ${correct ? 'ok' : 'bad'}`;
    fb.innerHTML = `
      <div class="fb-title">${correct ? '✅ 答對了！' : `❌ 正確答案是「${esc(label(item))}」`}</div>
      <div>${reviewNote(info)}</div>
      <div style="margin-top:8px"><b class="en">${esc(item.word)}</b> <span class="muted">${esc(item.pos)}</span> ${esc(item.zh)} ${sayBtn(item.word)}</div>
      <div class="example">
        <div class="ex-en">${highlight(item.example, item.word)} ${sayBtn(item.example, '朗讀例句')}</div>
        <div class="ex-zh">${esc(item.exampleZh)}</div>
      </div>`;
    actions.classList.remove('hidden');
    actions.querySelector('.next').focus({ preventScroll: true });
    if (dir === 'zh2en' || !correct) speak(item.word);
  }

  buttons.forEach((b, i) => b.addEventListener('click', () => choose(i)));
  actions.querySelector('.next').addEventListener('click', () => api.next());
  const unbind = bindKeys(e => {
    if (!answered && /^[1-4]$/.test(e.key)) choose(Number(e.key) - 1);
    else if (answered && e.key === 'Enter') {
      e.preventDefault();
      api.next();
    }
  });

  if (dir === 'en2zh' && st.settings.autoSpeak) speak(item.word);
  return unbind;
}
