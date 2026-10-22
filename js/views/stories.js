// 我的故事庫：STAR 格式（情境／任務／行動／結果），中英對照，自動儲存
import { getState, save } from '../store.js';
import { esc, uid, shortDate, toDateStr } from '../util.js';
import { STAR_PARTS, storyItems } from '../content.js';
import { sayBtn, confirmBox, toast, celebrate } from '../ui.js';
import { checkBadges } from '../record.js';
import { startPractice } from './practice.js';

const EXAMPLE = {
  title: '（範例）假投資網站詐騙調查',
  situation: {
    zh: '我們接到很多民眾報案，他們在假的投資網站上被騙了錢。',
    en: 'We received many reports from people who lost money on a fake investment website.',
  },
  task: {
    zh: '我的任務是找出幕後的集團，並追回被害人的錢。',
    en: 'My task was to identify the group behind it and recover the victims\' money.',
  },
  action: {
    zh: '我分析了金流和通聯紀錄。我也和銀行合作凍結可疑帳戶。',
    en: 'I analyzed bank transfers and phone records. I also worked with banks to freeze suspicious accounts.',
  },
  result: {
    zh: '我們逮捕了主要嫌犯，並追回大部分的被害款項。',
    en: 'We arrested the main suspects and recovered most of the victims\' money.',
  },
};

const PRIVACY_TIP = '🔒 故事只存在你這台裝置的瀏覽器裡，不會上傳。仍建議去掉真實姓名、案號等可識別資訊；匯出的備份檔也請妥善保管。';

export function renderList(el) {
  const st = getState();
  const stories = st.stories.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  el.innerHTML = `
    <div class="page-head">
      <a href="#/interview" class="small">← 面試</a>
      <h1>📝 我的故事庫</h1>
      <p>用 STAR 格式準備面試案例，英文會自動變成跟讀題目</p>
    </div>
    <div class="card">
      <div class="actions" style="margin-top:0">
        <a class="btn primary big" href="#/stories/new">＋ 新增故事</a>
        ${stories.length ? '<a class="btn big" href="#/shadowing">練習故事句</a>' : ''}
      </div>
    </div>
    ${stories.length ? `
      <div class="card"><ul class="list">
        ${stories.map(s => {
          const n = storyItems([s]).length;
          return `
            <li class="list-item">
              <a class="li-main" href="#/stories/${esc(s.id)}" style="color:inherit;text-decoration:none">
                <div class="li-title">${esc(s.title || '未命名故事')}</div>
                <div class="li-sub">${n} 句英文 · 更新於 ${s.updatedAt ? shortDate(toDateStr(new Date(s.updatedAt))) : '—'}</div>
              </a>
              <span class="li-side muted">›</span>
            </li>`;
        }).join('')}
      </ul></div>` : `
      <div class="card">
        <h2>什麼是 STAR？</h2>
        <p>面試官問「請說一個你處理過的案例」時，用四段來回答最清楚：</p>
        <ul>
          <li><b>S 情境 Situation</b>：當時發生了什麼事</li>
          <li><b>T 任務 Task</b>：你負責什麼</li>
          <li><b>A 行動 Action</b>：你做了哪些事（最重要）</li>
          <li><b>R 結果 Result</b>：最後的成果，最好有數字</li>
        </ul>
        <p class="muted small">每一段先寫中文，再寫英文；英文不確定也沒關係，之後可以再修改。</p>
        <button type="button" class="btn" data-act="example">載入範例故事</button>
      </div>`}
    <p class="muted small">${PRIVACY_TIP}</p>`;

  el.querySelector('[data-act="example"]')?.addEventListener('click', () => {
    const story = { id: uid(), ...structuredClone(EXAMPLE), updatedAt: new Date().toISOString() };
    st.stories.push(story);
    save();
    celebrate({ badges: checkBadges() });
    location.hash = `#/stories/${story.id}`;
  });
  return null;
}

export function renderEdit(el, id) {
  const st = getState();
  let story = id ? st.stories.find(s => s.id === id) : null;
  if (id && !story) {
    el.innerHTML = '<div class="card"><p>找不到這個故事，可能已經刪除。</p><a class="btn" href="#/stories">回故事庫</a></div>';
    return null;
  }
  const v = story || { title: '', situation: {}, task: {}, action: {}, result: {} };

  el.innerHTML = `
    <div class="page-head">
      <a href="#/stories" class="small">← 故事庫</a>
      <h1>${story ? '編輯故事' : '新增故事'}</h1>
      <p class="save-status">${story ? '修改會自動儲存' : '開始輸入後會自動儲存'}</p>
    </div>
    <div class="story-form">
    <div class="card">
      <label class="field"><span>故事標題（給自己看的）</span>
        <input type="text" name="title" value="${esc(v.title)}" placeholder="例如：內部資料外洩調查" maxlength="60">
      </label>
    </div>
    ${STAR_PARTS.map(([key, letter, zhLabel, enLabel]) => `
      <div class="star-block">
        <h3><span class="star-letter">${letter}</span>${zhLabel} <span class="muted small">${enLabel}</span></h3>
        <label class="field"><span>中文</span>
          <textarea name="${key}.zh" rows="3">${esc(v[key]?.zh || '')}</textarea>
        </label>
        <label class="field"><span>英文 <span class="say-slot" data-key="${key}">${v[key]?.en ? sayBtn(v[key].en) : ''}</span></span>
          <textarea name="${key}.en" rows="3" class="en">${esc(v[key]?.en || '')}</textarea>
        </label>
      </div>`).join('')}
    </div>
    <p class="muted small">${PRIVACY_TIP}</p>
    <div class="actions">
      <a class="btn primary big" href="#/stories">完成</a>
      <button type="button" class="btn big" data-act="practice">練習這個故事</button>
      <button type="button" class="btn danger" data-act="delete">刪除</button>
    </div>`;

  const status = el.querySelector('.save-status');
  const practiceBtn = el.querySelector('[data-act="practice"]');
  const deleteBtn = el.querySelector('[data-act="delete"]');
  const refreshButtons = () => {
    practiceBtn.disabled = !story || storyItems([story]).length === 0;
    deleteBtn.classList.toggle('hidden', !story);
  };
  refreshButtons();

  let timer = null;
  const collect = () => {
    const data = { title: el.querySelector('[name="title"]').value.trim() };
    for (const [key] of STAR_PARTS) {
      data[key] = {
        zh: el.querySelector(`[name="${key}.zh"]`).value.trim(),
        en: el.querySelector(`[name="${key}.en"]`).value.trim(),
      };
    }
    return data;
  };
  const persist = () => {
    clearTimeout(timer);
    timer = null;
    const data = collect();
    const empty = !data.title && STAR_PARTS.every(([k]) => !data[k].zh && !data[k].en);
    if (!story) {
      if (empty) return;
      story = { id: uid(), ...data, updatedAt: new Date().toISOString() };
      st.stories.push(story);
      save();
      history.replaceState(null, '', `#/stories/${story.id}`);
      celebrate({ badges: checkBadges() });
    } else {
      Object.assign(story, data, { updatedAt: new Date().toISOString() });
      save();
    }
    status.textContent = `已自動儲存（${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}）`;
    for (const [key] of STAR_PARTS) {
      const slot = el.querySelector(`.say-slot[data-key="${key}"]`);
      slot.innerHTML = data[key].en ? sayBtn(data[key].en) : '';
    }
    refreshButtons();
  };
  el.querySelector('.story-form').addEventListener('input', () => {
    status.textContent = '輸入中……';
    clearTimeout(timer);
    timer = setTimeout(persist, 700);
  });

  practiceBtn.addEventListener('click', () => {
    persist();
    const ids = storyItems([story]).map(x => x.id);
    startPractice({ title: `故事：${story.title || '未命名'}`, ids, back: `#/stories/${story.id}` });
  });
  deleteBtn.addEventListener('click', async () => {
    const ok = await confirmBox(`確定要刪除「${esc(story.title || '未命名故事')}」？刪除後無法復原（除非你有匯出備份）。`, { ok: '刪除', danger: true });
    if (!ok) return;
    clearTimeout(timer);
    timer = null;
    st.stories = st.stories.filter(s => s.id !== story.id);
    const prefix = `st-${story.id}-`;
    for (const key of Object.keys(st.progress)) if (key.startsWith(prefix)) delete st.progress[key];
    save();
    story = null;
    toast('已刪除故事');
    location.hash = '#/stories';
  });

  // 離開頁面前把還沒存的內容存起來
  return () => {
    if (timer) persist();
  };
}
