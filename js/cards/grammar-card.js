// 文法填空（多益 Part 5 型）：四選一，答錯顯示中文解析
import { esc } from '../util.js';
import { getState } from '../store.js';
import { levelDots, sayBtn } from '../ui.js';
import { reviewNote, bindKeys } from './common.js';

const LETTERS = ['A', 'B', 'C', 'D'];

function sentenceHtml(q, fill = null, cls = '') {
  const [before, after] = q.split('____');
  const blank = fill ? `<span class="blank ${cls}">${esc(fill)}</span>` : '<span class="blank">&nbsp;</span>';
  return `${esc(before)}${blank}${esc(after ?? '')}`;
}

export function mount(el, item, api) {
  const level = getState().progress[item.id]?.level || 0;
  const full = item.question.replace('____', item.options[item.answer]);

  el.innerHTML = `
    <div class="card qcard">
      <div class="q-meta">
        <span class="chip primary">${esc(item.topic)}</span>
        ${levelDots(level)}
      </div>
      <p class="q-ask">選出最適合填入空格的答案</p>
      <p class="q-sentence en">${sentenceHtml(item.question)}</p>
      <div class="options two-col">
        ${item.options.map((o, i) => `
          <button type="button" class="opt" data-i="${i}">
            <span class="key">${LETTERS[i]}</span><span class="en">${esc(o)}</span>
          </button>`).join('')}
      </div>
      <div class="feedback hidden"></div>
      <div class="actions hidden"><button type="button" class="btn primary big next">下一題 →</button></div>
    </div>`;

  let answered = false;
  const buttons = [...el.querySelectorAll('.opt')];
  const fb = el.querySelector('.feedback');
  const actions = el.querySelector('.actions');
  const sentence = el.querySelector('.q-sentence');

  function choose(i) {
    if (answered) return;
    answered = true;
    const correct = i === item.answer;
    buttons.forEach((b, k) => {
      b.disabled = true;
      if (k === item.answer) b.classList.add('correct');
      else if (k === i) b.classList.add('wrong');
    });
    sentence.innerHTML = sentenceHtml(item.question, item.options[item.answer], 'ok') + ' ' + sayBtn(full, '朗讀完整句子');
    const info = api.report({ correct });
    fb.className = `feedback ${correct ? 'ok' : 'bad'}`;
    fb.innerHTML = `
      <div class="fb-title">${correct ? '✅ 答對了！' : `❌ 正確答案是 ${LETTERS[item.answer]}. ${esc(item.options[item.answer])}`}</div>
      <div>${reviewNote(info)}</div>
      ${correct
        ? `<details style="margin-top:8px"><summary>看解析</summary><p style="margin-top:6px">${esc(item.explanation)}</p></details>`
        : `<p style="margin-top:8px">💡 ${esc(item.explanation)}</p>`}`;
    actions.classList.remove('hidden');
    actions.querySelector('.next').focus({ preventScroll: true });
  }

  buttons.forEach((b, i) => b.addEventListener('click', () => choose(i)));
  actions.querySelector('.next').addEventListener('click', () => api.next());
  const unbind = bindKeys(e => {
    const k = e.key.toUpperCase();
    if (!answered && (LETTERS.includes(k) || /^[1-4]$/.test(k))) {
      choose(LETTERS.includes(k) ? LETTERS.indexOf(k) : Number(k) - 1);
    } else if (answered && e.key === 'Enter') {
      e.preventDefault();
      api.next();
    }
  });
  return unbind;
}
