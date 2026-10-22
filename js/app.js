// 進入點：載入資料、決定現在要顯示哪個畫面
import { load, getState, isStorageOk } from './store.js';
import { loadContent } from './content.js';
import { setFixedToday, getFixedToday, esc } from './util.js';
import { speak, stopSpeaking } from './speech.js';
import { refreshTopbar } from './ui.js';
import * as home from './views/home.js';
import * as toeic from './views/toeic.js';
import * as vocab from './views/vocab.js';
import * as grammar from './views/grammar.js';
import * as interview from './views/interview.js';
import * as shadowing from './views/shadowing.js';
import * as stories from './views/stories.js';
import * as profile from './views/profile.js';
import * as settings from './views/settings.js';
import * as practice from './views/practice.js';

// 網址 #/xxx → 畫面；tab 是底部導覽要亮起的項目
const ROUTES = [
  { re: /^\/$/, view: home.render, tab: 'home' },
  { re: /^\/toeic$/, view: toeic.render, tab: 'toeic' },
  { re: /^\/vocab$/, view: vocab.render, tab: 'toeic' },
  { re: /^\/grammar$/, view: grammar.render, tab: 'toeic' },
  { re: /^\/interview$/, view: interview.render, tab: 'interview' },
  { re: /^\/shadowing$/, view: shadowing.render, tab: 'interview' },
  { re: /^\/stories$/, view: stories.renderList, tab: 'interview' },
  { re: /^\/stories\/new$/, view: el => stories.renderEdit(el, null), tab: 'interview' },
  { re: /^\/stories\/([\w-]+)$/, view: (el, m) => stories.renderEdit(el, m[1]), tab: 'interview' },
  { re: /^\/profile$/, view: profile.render, tab: 'profile' },
  { re: /^\/settings$/, view: settings.render, tab: '' },
  { re: /^\/practice$/, view: practice.render, tab: '' },
];

const app = document.getElementById('app');
let cleanup = null;

function route() {
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (e) { console.error(e); }
  }
  cleanup = null;
  stopSpeaking();

  const path = location.hash.replace(/^#/, '') || '/';
  let match = null;
  let found = ROUTES.find(r => (match = path.match(r.re)));
  if (!found) {
    found = ROUTES[0];
    match = null;
  }
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === found.tab));
  window.scrollTo(0, 0);
  try {
    cleanup = found.view(app, match);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card"><h2>畫面發生錯誤</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">回首頁</a></div>`;
  }
  refreshTopbar();
}

function showBanners() {
  const msgs = [];
  if (getFixedToday()) msgs.push(`🧪 測試模式：今天的日期被設定為 ${esc(getFixedToday())}（拿掉網址中的 ?today= 即可恢復）。`);
  if (!isStorageOk()) msgs.push('⚠️ 瀏覽器無法儲存資料（可能是無痕模式），練習進度不會被保存。');
  document.getElementById('banner-root').innerHTML = msgs.map(m => `<div class="banner"><div>${m}</div></div>`).join('');
}

// 🔊 按鈕：任何有 data-say 的元素被點到就朗讀
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-say]');
  if (btn) {
    e.preventDefault();
    speak(btn.dataset.say);
  }
});

async function start() {
  setFixedToday(new URLSearchParams(location.search).get('today'));
  load();
  showBanners();
  try {
    await loadContent();
  } catch (e) {
    app.innerHTML = `
      <div class="card">
        <h2>題目載入失敗</h2>
        <p>${esc(e.message)}</p>
        <p class="muted">如果你是直接雙擊 index.html 打開的，請改用 start.bat 啟動；瀏覽器不允許直接從檔案讀取題目。</p>
      </div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('離線功能註冊失敗', err));
  }
}

start();

// 方便除錯：在開發者工具輸入 app.state 查看目前資料
window.app = { get state() { return getState(); } };
