// 進入點：載入資料、決定現在要顯示哪個畫面
import { load, getState, isStorageOk, countOpen } from './store.js';
import { loadMarket, getMarket } from './market.js';
import { setFixedToday, getFixedToday, todayStr, esc } from './util.js';
import { portfolio } from './calc.js';
import { discipline } from './rules.js';
import * as home from './views/home.js';
import * as holdings from './views/holdings.js';
import * as structure from './views/structure.js';
import * as marketView from './views/market.js';
import * as risk from './views/risk.js';
import * as check from './views/check.js';
import * as plan from './views/plan.js';
import * as journal from './views/journal.js';
import * as settings from './views/settings.js';

// 網址 #/xxx → 畫面；tab 是導覽要亮起的項目
const ROUTES = [
  { re: /^\/$/, view: home.render, tab: 'home' },
  { re: /^\/holdings$/, view: holdings.render, tab: 'holdings' },
  { re: /^\/structure$/, view: structure.render, tab: 'structure' },
  { re: /^\/market$/, view: marketView.render, tab: 'market' },
  { re: /^\/risk$/, view: risk.render, tab: 'risk' },
  { re: /^\/check$/, view: check.render, tab: 'check' },
  { re: /^\/plan$/, view: plan.render, tab: 'plan' },
  { re: /^\/journal$/, view: journal.render, tab: 'journal' },
  { re: /^\/settings$/, view: settings.render, tab: 'settings' },
];
const IN_MORE = ['structure', 'market', 'risk', 'journal', 'settings'];

const app = document.getElementById('app');
const moreBtn = document.getElementById('more-btn');
const sheet = document.getElementById('more-sheet');
let cleanup = null;

function setMore(open) {
  sheet.hidden = !open;
  moreBtn.setAttribute('aria-expanded', String(open));
}

function route() {
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (e) { console.error(e); }
  }
  cleanup = null;
  setMore(false);
  const path = location.hash.replace(/^#/, '') || '/';
  const found = ROUTES.find(r => r.re.test(path)) || ROUTES[0];
  document.querySelectorAll('[data-tab]').forEach(a => {
    const on = a.dataset.tab === found.tab;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  moreBtn.classList.toggle('active', IN_MORE.includes(found.tab));
  window.scrollTo(0, 0);
  try {
    cleanup = found.view(app);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card"><h2>畫面發生錯誤</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">回總覽</a></div>`;
  }
  refreshTopbar();
}

/** 右上角的紀律分數 */
function refreshTopbar() {
  const el = document.getElementById('top-score');
  const s = getState();
  const p = portfolio(s, getMarket());
  if (!p.total) {
    el.textContent = '';
    return;
  }
  const d = discipline(p, s, todayStr());
  el.textContent = `紀律 ${d.score} 分`;
  el.className = `chip ${d.score >= 80 ? 'ok' : d.score >= 50 ? 'warn' : 'bad'}`;
}

function showBanners() {
  const msgs = [];
  if (getFixedToday()) msgs.push(`🧪 測試模式：今天的日期被設定為 ${esc(getFixedToday())}（拿掉網址中的 ?today= 即可恢復）。`);
  if (!isStorageOk()) msgs.push('⚠️ 瀏覽器無法儲存資料（可能是無痕模式），填的數字不會被保存。');
  document.getElementById('banner-root').innerHTML = msgs.map(m => `<div class="banner"><div>${m}</div></div>`).join('');
}

moreBtn.addEventListener('click', () => setMore(sheet.hidden));
sheet.addEventListener('click', e => {
  if (e.target === sheet) setMore(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !sheet.hidden) setMore(false);
});
// 各畫面改了資料後會發出這個事件，讓右上角分數跟著更新
document.addEventListener('data-changed', refreshTopbar);

async function start() {
  setFixedToday(new URLSearchParams(location.search).get('today'));
  load();
  countOpen();
  showBanners();
  try {
    await loadMarket();
  } catch (e) {
    console.warn('市場資料載入失敗', e);
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('離線功能註冊失敗', err));
  }
}

start();

// 方便除錯：在開發者工具輸入 app.state、app.market 查看目前資料
window.app = {
  get state() { return getState(); },
  get market() { return getMarket(); },
};
