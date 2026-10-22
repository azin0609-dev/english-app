// 共用介面元件：提示訊息、對話框、朗讀按鈕、升級動畫
import { esc } from './util.js';
import { getState } from './store.js';
import { levelInfo } from './game.js';
import { avatarSVG } from './avatar.js';

export function toast(html, { kind = '', ms = 2800 } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  root.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** 對話框；回傳被按下按鈕的 value */
export function modal({ title = '', body = '', actions = [{ label: '確定', value: true, kind: 'primary' }], dismissValue = null, className = '' }) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${className}" role="dialog" aria-modal="true">
        ${title ? `<h2>${esc(title)}</h2>` : ''}
        <div class="modal-body">${body}</div>
        <div class="actions">
          ${actions.map((a, i) => `<button type="button" class="btn ${a.kind || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}
        </div>
      </div>`;
    const close = v => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(dismissValue);
      }
    };
    overlay.addEventListener('click', e => {
      if (e.target === overlay) return close(dismissValue);
      const b = e.target.closest('button[data-i]');
      if (b) close(actions[Number(b.dataset.i)].value);
    });
    document.addEventListener('keydown', onKey, true);
    root.appendChild(overlay);
    overlay.querySelector('.actions .btn:last-child')?.focus();
  });
}

export function isModalOpen() {
  return !!document.querySelector('.modal-overlay');
}

export function confirmBox(message, { ok = '確定', cancel = '取消', danger = false, title = '' } = {}) {
  return modal({
    title,
    body: `<p>${message}</p>`,
    actions: [
      { label: cancel, value: false, kind: 'ghost' },
      { label: ok, value: true, kind: danger ? 'danger' : 'primary' },
    ],
    dismissValue: false,
  });
}

/** 🔊 朗讀按鈕（點擊由 app.js 統一處理） */
export function sayBtn(text, label = '朗讀') {
  return `<button type="button" class="icon-btn say" data-say="${esc(text)}" aria-label="${label}" title="${label}">🔊</button>`;
}

/** level 0～5 的小圓點 */
export function levelDots(level = 0) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<i class="${i <= level ? 'on' : ''}"></i>`;
  return `<span class="level-dots" title="熟練度 Lv ${level}" aria-label="熟練度 ${level} / 5">${s}</span>`;
}

/** 功能入口卡片；locked 表示之後的階段才開放 */
export function hubCard({ href = '', icon, title, desc, extra = '', locked = false }) {
  const tag = locked ? 'div' : 'a';
  return `
    <${tag} class="hub-card ${locked ? 'locked' : ''}" ${locked ? 'aria-disabled="true"' : `href="${href}"`}>
      <span class="hi">${icon}</span>
      <span class="hb">
        <span class="ht">${esc(title)}</span><br>
        <span class="hd">${esc(desc)}</span>
        ${extra ? `<br><span class="hd">${extra}</span>` : ''}
      </span>
      <span class="arrow">${locked ? '🔒' : '›'}</span>
    </${tag}>`;
}

export function refreshTopbar() {
  const el = document.getElementById('top-level');
  if (!el) return;
  const info = levelInfo(getState().player.xp);
  el.textContent = `Lv ${info.level} · ${info.rank.title}`;
}

/** 作答後的慶祝：徽章提示、任務完成、升級對話框 */
export async function celebrate({ bonus = 0, badges = [], levelUp = null } = {}) {
  if (bonus) toast(`🎉 今日任務完成！<b>+${bonus} XP</b>`, { kind: 'badge-toast', ms: 3500 });
  for (const b of badges) toast(`${b.icon} 獲得徽章「${esc(b.name)}」`, { kind: 'badge-toast', ms: 3500 });
  refreshTopbar();
  if (levelUp) {
    await modal({
      className: 'levelup',
      body: `
        ${avatarSVG(levelUp.stage, { label: levelUp.rank.title })}
        <p class="big">升級！Lv ${levelUp.level}</p>
        ${levelUp.rankUp
          ? `<p><b>晉升為「${esc(levelUp.rank.title)}」</b><br><span class="muted">${esc(levelUp.rank.en)}</span></p>`
          : `<p class="muted">目前職稱：${esc(levelUp.rank.title)}</p>`}`,
      actions: [{ label: '繼續加油', value: true, kind: 'primary' }],
      dismissValue: true,
    });
  }
}
