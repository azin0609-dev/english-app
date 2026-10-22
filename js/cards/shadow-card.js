// 跟讀題：看中文先說 → 顯示英文並朗讀 → 逐字標色、算正確率
// 計分只算「看中文先說」那一次；聽完後的跟讀只標色、不計分
import { esc } from '../util.js';
import { getState, save } from '../store.js';
import { speak, stopSpeaking, sttSupported, listen } from '../speech.js';
import { bestMatch } from '../compare.js';
import { SHADOW_TAG } from '../content.js';
import { levelDots } from '../ui.js';
import { reviewNote, bindKeys } from './common.js';

export function wordsHtml(words) {
  return words
    .map(w => (w.ok === null ? esc(w.text) : `<span class="w ${w.ok ? 'ok' : 'bad'}">${esc(w.text)}</span>`))
    .join(' ');
}

export function scoreTone(score) {
  return score >= 85 ? 'ok' : score >= 60 ? 'mid' : 'bad';
}

const CHIP_TONE = { ok: 'ok', mid: 'warn', bad: 'bad' };

export function mount(el, item, api) {
  const st = getState();
  const useStt = sttSupported() && !st.settings.selfRate;
  const level = st.progress[item.id]?.level || 0;
  let destroyed = false;
  let listener = null;
  let first = null;      // 第一次（看中文說）的比對結果
  let selfScore = null;  // 自評模式的分數
  let info;              // 計分後的紀錄（undefined = 還沒計分）
  let revealed = false;
  const attempts = [];   // 聽完後的跟讀紀錄

  const meta = `
    <div class="q-meta">
      ${item.source === 'story'
        ? `<span class="chip primary">📝 ${esc(item.storyTitle)} · ${esc(item.part)}</span>`
        : `<span class="chip primary">${esc(SHADOW_TAG[item.tag] || '面試句')}</span>`}
      ${levelDots(level)}
    </div>`;

  function score(value) {
    if (info !== undefined) return;
    info = api.report({ score: value });
  }

  // ① 看中文
  function promptView(msg = '') {
    el.innerHTML = `
      <div class="card qcard">
        ${meta}
        <p class="q-ask">先看中文，試著用英文說出來</p>
        <div class="q-zh">${esc(item.zh || '（這句沒有中文）')}</div>
        ${item.zhIsWhole ? '<p class="muted small">（這段的中英句數不同，顯示整段中文）</p>' : ''}
        ${msg ? `<div class="note warn">${msg}</div>` : ''}
        <div class="actions">
          ${useStt
            ? '<button type="button" class="btn primary big" data-act="speak">🎤 開始說</button>'
            : '<button type="button" class="btn primary big" data-act="self">我想好了，看英文</button>'}
          <button type="button" class="btn ghost" data-act="skip">我不會，直接看答案</button>
        </div>
        <p class="muted small" style="margin-top:10px">
          ${useStt
            ? '按下後對著麥克風說英文，說完停頓幾秒會自動結束。'
            : (sttSupported() ? '目前設定為自評模式（可在設定頁更改）。' : '這個瀏覽器無法語音辨識，改用自評模式（建議使用電腦版 Chrome）。')}
        </p>
      </div>`;
    el.querySelector('[data-act="speak"]')?.addEventListener('click', () => startListening('first'));
    el.querySelector('[data-act="self"]')?.addEventListener('click', () => selfView());
    el.querySelector('[data-act="skip"]').addEventListener('click', () => {
      score(0);
      revealView();
    });
  }

  // 錄音中
  async function startListening(mode) {
    stopSpeaking();
    const host = el.querySelector('.actions');
    host.innerHTML = `
      <div class="listening" style="flex:1 1 100%"><span class="dot"></span>正在聽……請說英文</div>
      <div class="live-text en" style="flex:1 1 100%"></div>
      <button type="button" class="btn primary" data-act="stop">說完了</button>`;
    const live = host.querySelector('.live-text');
    listener = listen({ onUpdate: t => { live.textContent = t; } });
    host.querySelector('[data-act="stop"]').addEventListener('click', () => listener?.stop());
    let res;
    try {
      res = await listener.promise;
    } catch (e) {
      listener = null;
      if (destroyed) return;
      if (mode === 'first') promptView(esc(e.message));
      else revealView(esc(e.message));
      return;
    }
    listener = null;
    if (destroyed) return;
    if (!res.transcript) {
      const msg = '沒有聽到聲音，請靠近麥克風再試一次。';
      if (mode === 'first') promptView(msg);
      else revealView(msg);
      return;
    }
    const cmp = bestMatch(item.en, res.alternatives);
    if (mode === 'first') {
      first = cmp;
      score(cmp.score);
    } else {
      attempts.unshift(cmp);
    }
    revealView();
  }

  // 自評模式：先顯示英文並朗讀，再自己打分數
  function selfView() {
    el.innerHTML = `
      <div class="card qcard">
        ${meta}
        <div class="q-zh" style="font-size:1rem;color:var(--muted)">${esc(item.zh)}</div>
        <div class="words en" style="margin:8px 0">${esc(item.en)}</div>
        <button type="button" class="btn" data-act="play">🔊 再聽一次</button>
        <p class="q-ask" style="margin-top:14px">和你剛剛說的比起來？</p>
        <div class="options">
          <button type="button" class="opt" data-score="90"><span class="key">😀</span>說得出來（幾乎一樣）</button>
          <button type="button" class="opt" data-score="70"><span class="key">😐</span>卡一部分</button>
          <button type="button" class="opt" data-score="0"><span class="key">😣</span>說不出來</button>
        </div>
      </div>`;
    el.querySelector('[data-act="play"]').addEventListener('click', () => speak(item.en));
    el.querySelectorAll('[data-score]').forEach(b => b.addEventListener('click', () => {
      selfScore = Number(b.dataset.score);
      score(selfScore);
      revealed = true; // 已經朗讀過，不再自動播放
      revealView();
    }));
    speak(item.en);
  }

  // ② 顯示英文、標色、朗讀
  function revealView(msg = '') {
    const rate = getState().settings.rate;
    let result;
    if (first) {
      result = `
        <div class="words en" style="margin:8px 0">${wordsHtml(first.words)}</div>
        <div class="row">
          <span class="score-big ${scoreTone(first.score)}">${first.score}%</span>
          <span class="muted small">說對 ${first.matched} / ${first.total} 個字</span>
        </div>
        <div class="heard"><span class="muted small">辨識到你說：</span><br><span class="en">${esc(first.transcript)}</span></div>`;
    } else {
      result = `
        <div class="words en" style="margin:8px 0">${esc(item.en)}</div>
        <p class="muted small">${selfScore !== null ? `自評：${selfScore} 分` : '這題記為 0 分，之後會再出現讓你複習。'}</p>`;
    }
    el.innerHTML = `
      <div class="card qcard">
        ${meta}
        <div class="q-zh" style="font-size:1rem;color:var(--muted)">${esc(item.zh)}</div>
        ${result}
        <div style="margin-top:8px">${info !== undefined ? reviewNote(info) : ''}</div>
        ${msg ? `<div class="note warn">${msg}</div>` : ''}
        <div class="row" style="margin-top:12px">
          <button type="button" class="btn" data-act="play">🔊 再聽一次</button>
          <div class="segmented" role="group" aria-label="朗讀速度">
            <button type="button" data-rate="0.8" class="${rate === 0.8 ? 'on' : ''}">0.8x</button>
            <button type="button" data-rate="1" class="${rate !== 0.8 ? 'on' : ''}">1.0x</button>
          </div>
        </div>
        <div class="actions">
          ${useStt ? '<button type="button" class="btn" data-act="repeat">🎤 跟讀一次（不計分）</button>' : ''}
          <button type="button" class="btn primary" data-act="next">下一題 →</button>
        </div>
        ${attempts.length ? `
          <div class="attempts">
            <div class="muted small">跟讀紀錄（最新在上）</div>
            ${attempts.map(a => `
              <div class="attempt">
                <div class="words en">${wordsHtml(a.words)}</div>
                <span class="chip ${CHIP_TONE[scoreTone(a.score)]}">${a.score}%</span>
              </div>`).join('')}
          </div>` : ''}
      </div>`;
    el.querySelector('[data-act="play"]').addEventListener('click', () => speak(item.en));
    el.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => {
      const s = getState();
      s.settings.rate = Number(b.dataset.rate);
      save();
      el.querySelectorAll('[data-rate]').forEach(x => x.classList.toggle('on', x === b));
      speak(item.en);
    }));
    el.querySelector('[data-act="repeat"]')?.addEventListener('click', () => startListening('repeat'));
    el.querySelector('[data-act="next"]').addEventListener('click', () => api.next());
    if (!revealed) {
      revealed = true;
      speak(item.en);
    }
  }

  const unbind = bindKeys(e => {
    if (e.key === 'Enter' && info !== undefined && !listener) {
      e.preventDefault();
      api.next();
    }
  });

  promptView();

  return () => {
    destroyed = true;
    listener?.abort();
    stopSpeaking();
    unbind();
  };
}
