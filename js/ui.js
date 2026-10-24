// 共用介面元件：提示訊息、對話框、狀態標籤、輸入欄
import { esc, isNum } from './util.js';

export function toast(html, { kind = '', ms = 2800 } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  root.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** 對話框；回傳被按下按鈕的 value */
export function modal({ title = '', body = '', actions = [{ label: '確定', value: true, kind: 'primary' }], dismissValue = null }) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
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

const LV = {
  bad: ['bad', '✕'],
  warn: ['warn', '!'],
  good: ['ok', '✓'],
  info: ['primary', 'i'],
};

/** 狀態標籤：一定同時有圖示和文字，不只靠顏色 */
export function chip(lv, text) {
  const [cls, icon] = LV[lv] || LV.info;
  return `<span class="chip ${cls}"><span aria-hidden="true">${icon}</span>${esc(text)}</span>`;
}

/** 今日待辦的一列 */
export function todoRow(t) {
  const tag = t.href ? 'a' : 'div';
  return `<${tag} class="todo lv-${t.lv}" ${t.href ? `href="${t.href}"` : ''}>
    <span class="ti" aria-hidden="true">${t.icon}</span>
    <span class="tb"><span class="tt">${esc(t.title)}</span><span class="td">${esc(t.detail)}</span></span>
    ${t.href ? '<span class="arrow" aria-hidden="true">›</span>' : ''}
  </${tag}>`;
}

/** 紀律清單的一列（ok：1 / 0.5 / 0） */
export function discRow(it) {
  const lv = it.ok === 1 ? 'good' : it.ok > 0 ? 'warn' : 'bad';
  const icon = it.ok === 1 ? '✓' : it.ok > 0 ? '?' : '✕';
  const inner = `<span class="dk ${lv}" aria-hidden="true">${icon}</span><span class="dl">${esc(it.label)}</span><span class="dv">${esc(it.detail)}</span>`;
  return it.href ? `<a class="disc" href="${it.href}">${inner}</a>` : `<div class="disc">${inner}</div>`;
}

/** 檢查結果清單（下單前） */
export function checkList(checks) {
  let grp = '';
  return `<ul class="checks">${checks.map(c => {
    const head = c.group !== grp ? `<li class="grp">${esc(c.group)}</li>` : '';
    grp = c.group;
    const cls = c.skip ? 'skip' : c.ok ? 'ok' : 'no';
    const icon = c.skip ? '–' : c.ok ? '✓' : '✕';
    return `${head}<li class="${cls}"><span class="ck" aria-hidden="true">${icon}</span><span><b>${esc(c.label)}</b><br><span class="muted">${esc(c.detail)}</span></span></li>`;
  }).join('')}</ul>`;
}

/** 數字輸入欄 */
export function numField(label, name, value, { suffix = '', step = 'any', hint = '', placeholder = '', attrs = '' } = {}) {
  return `<label class="field"><span>${esc(label)}${suffix ? ` <small class="muted">${esc(suffix)}</small>` : ''}</span>
    <input type="number" inputmode="decimal" step="${step}" name="${esc(name)}" value="${isNum(value) ? value : ''}" placeholder="${esc(placeholder)}" ${attrs}>
    ${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
}

export function textField(label, name, value, { placeholder = '', hint = '', attrs = '' } = {}) {
  return `<label class="field"><span>${esc(label)}</span>
    <input type="text" name="${esc(name)}" value="${esc(value || '')}" placeholder="${esc(placeholder)}" autocomplete="off" ${attrs}>
    ${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
}

export function selectField(label, name, value, options, { attrs = '' } = {}) {
  return `<label class="field"><span>${esc(label)}</span>
    <select name="${esc(name)}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
}

/** 輸入欄的值：數字欄位空白回傳 null */
export function readValue(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'number') return input.value === '' ? null : Number(input.value);
  return input.value.trim();
}

/** 通知其他地方（右上角分數）資料改了 */
export function changed() {
  document.dispatchEvent(new CustomEvent('data-changed'));
}

/** 頁首 */
export function pageHead(title, sub = '') {
  return `<div class="page-head"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;
}

/** 漲跌數字：台灣習慣漲紅跌綠，另外加 ▲▼ */
export function upDown(r, text) {
  if (!isNum(r) || Math.abs(r) < 0.0005) return `<span>${esc(text)}</span>`;
  return `<span class="${r > 0 ? 'up' : 'down'}">${r > 0 ? '▲' : '▼'} ${esc(text)}</span>`;
}
