// 下單前：算出這筆最多能開多大，逐項檢查，全部通過才寫日誌；看別人推薦才想買的，先進想買清單冷靜
import { getState, save } from '../store.js';
import { getMarket, findSeries, lastOf, closes, sma } from '../market.js';
import { portfolio, baseSym } from '../calc.js';
import { checkContract, checkStock, coolStatus } from '../rules.js';
import { SOURCES, EMO_SOURCES, label } from '../journal.js';
import { esc, uid, nowMs, fPrice, usd, twd, pct, isNum } from '../util.js';
import { pageHead, chip, checkList, numField, textField, selectField, readValue, toast, changed } from '../ui.js';
import { lineChart, bindCharts } from '../chart.js';
import { prefillJournal } from './journal.js';

let mode = 'contract';
let cf = null; // 合約表單
let sf = null; // 股票表單
const wf = { sym: '', note: '', source: 'kol' }; // 想買清單表單

function initForms(s) {
  if (!cf) {
    const c0 = s.contracts[0];
    cf = { sym: c0?.sym || '', side: 'long', entry: null, stop: null, target: null, lev: Math.min(3, s.rules.maxLev), equity: null, source: 'self' };
  }
  if (!sf) sf = { sym: '', mkt: 'tw', amount: null, bucket: 'sat', source: 'self' };
}

function priceChart(m, sym) {
  const ser = findSeries(m, sym);
  if (!ser) return '';
  const c = closes(ser);
  const m60 = sma(c, 60);
  const m200 = sma(c, 200);
  const from = Math.max(0, ser.d.length - 250);
  const rows = ser.d.slice(from).map((r, i) => ({ date: r[0], price: r[1], ma60: m60[from + i], ma200: m200[from + i] }));
  return `<div style="margin-top:14px"><h3>${esc(ser.key)} 最近一年</h3>${lineChart(rows, [
    { key: 'price', label: '收盤', color: 'var(--s1)' },
    { key: 'ma60', label: '60 日線', color: 'var(--s2)' },
    { key: 'ma200', label: '200 日線', color: 'var(--s3)' },
  ], { height: 200, title: `${ser.key} 收盤與均線` })}</div>`;
}

function wishCard(s, now) {
  const R = s.rules;
  const rows = s.wishlist.map(w => {
    const c = coolStatus(s, w.sym, now);
    return `<li class="list-item">
      <div class="li-main"><div class="li-title">${esc(w.sym)} ${c.ready ? chip('good', '冷靜期已過') : chip('warn', `還要 ${Math.ceil(c.hoursLeft)} 小時`)}</div>
        <div class="li-sub">${esc(label(SOURCES, w.source))}${w.note ? ` · ${esc(w.note)}` : ''}</div></div>
      <div class="li-side"><button type="button" class="btn ghost sm" data-wdel="${w.id}">刪除</button></div>
    </li>`;
  }).join('');
  return `
    <section class="card">
      <div class="card-head"><h2>想買清單</h2><span class="small muted">冷靜期 ${R.coolHours} 小時</span></div>
      <p class="small muted">看到 KOL、新聞或朋友推薦才想買的，先放這裡。${R.coolHours} 小時後還想買，再來跑檢查。很多「一定要現在買」的念頭，隔天就不見了。</p>
      ${rows ? `<ul class="list">${rows}</ul>` : ''}
      <div class="form-grid" data-wform>
        ${textField('代號', 'sym', wf.sym, { placeholder: '例如 NVDA', attrs: 'data-w="sym"' })}
        ${selectField('從哪裡看到', 'source', wf.source, SOURCES.filter(x => EMO_SOURCES.includes(x[0])), { attrs: 'data-w="source"' })}
        ${textField('為什麼想買', 'note', wf.note, { placeholder: '一句話就好', attrs: 'data-w="note"' })}
      </div>
      <button type="button" class="btn sm" data-act="wadd">＋ 放進想買清單</button>
    </section>`;
}

function contractForm(s, m) {
  const last = lastOf(findSeries(m, cf.sym));
  const eqHint = isNum(s.accounts.contractEquity) && s.accounts.contractEquity > 0 ? `空白時用持倉頁的 ${usd(s.accounts.contractEquity)}` : '';
  return `
    <div class="form-grid">
      ${textField('標的代號', 'sym', cf.sym, { placeholder: '例如 NVDA', attrs: 'data-c="sym"' })}
      <div class="field"><span>方向</span>
        <div class="segmented" role="group" aria-label="方向">
          <button type="button" data-side="long" class="${cf.side === 'long' ? 'on' : ''}">做多</button>
          <button type="button" data-side="short" class="${cf.side === 'short' ? 'on' : ''}">做空</button>
        </div></div>
      ${numField('進場價', 'entry', cf.entry, { suffix: '美元', placeholder: last ? fPrice(last.v) : '', hint: last ? `空白時用收盤價 ${fPrice(last.v)}` : '', attrs: 'data-c="entry"' })}
      ${numField('停損價', 'stop', cf.stop, { suffix: '美元', hint: '跌到這裡就認賠出場', attrs: 'data-c="stop"' })}
      ${numField('目標價', 'target', cf.target, { suffix: '美元', hint: '打算在哪裡獲利出場', attrs: 'data-c="target"' })}
      ${numField('槓桿', 'lev', cf.lev, { suffix: '倍', attrs: 'data-c="lev"' })}
      ${numField('合約帳戶權益', 'equity', cf.equity, { suffix: '美元', hint: eqHint, attrs: 'data-c="equity"' })}
      ${selectField('這個想法從哪來', 'source', cf.source, SOURCES, { attrs: 'data-c="source"' })}
    </div>`;
}

function stockForm() {
  return `
    <div class="form-grid">
      ${textField('標的代號', 'sym', sf.sym, { placeholder: '例如 2330、NVDA', attrs: 'data-k="sym"' })}
      <div class="field"><span>市場</span>
        <div class="segmented" role="group" aria-label="市場">
          <button type="button" data-mkt="tw" class="${sf.mkt === 'tw' ? 'on' : ''}">台股</button>
          <button type="button" data-mkt="us" class="${sf.mkt === 'us' ? 'on' : ''}">美股</button>
        </div></div>
      ${numField('打算買多少', 'amount', sf.amount, { suffix: sf.mkt === 'us' ? '美元' : '台幣', attrs: 'data-k="amount"' })}
      ${selectField('類型', 'bucket', sf.bucket, [['core', '核心（大盤 ETF）'], ['sat', '衛星（個股、主題 ETF）']], { attrs: 'data-k="bucket"' })}
      ${selectField('這個想法從哪來', 'source', sf.source, SOURCES, { attrs: 'data-k="source"' })}
    </div>`;
}

function contractResult(s, m, p) {
  const last = lastOf(findSeries(m, cf.sym));
  const inp = {
    ...cf,
    entry: isNum(cf.entry) ? cf.entry : last ? last.v : null,
    equity: isNum(cf.equity) ? cf.equity : s.accounts.contractEquity,
  };
  const r = checkContract(inp, p, s, m, nowMs());
  const z = r.sizing;
  return { r, inp, html: `
    <div class="card-head"><h2>規則判定</h2>${r.ok ? chip('good', '可以下單') : chip('bad', `不允許 · ${r.fails} 項沒通過`)}</div>
    <div class="tiles">
      <div class="tile"><div class="tl">這筆最多虧</div><div class="tv">${usd(z.maxLoss)}</div><div class="small muted">帳戶的 ${s.rules.perTradePct}%</div></div>
      <div class="tile"><div class="tl">最多能開</div><div class="tv">${usd(z.notional)}</div><div class="small muted">約 ${isNum(z.qty) ? z.qty.toFixed(2) : '—'} 股</div></div>
      <div class="tile"><div class="tl">需要保證金</div><div class="tv">${usd(z.margin)}</div><div class="small muted">${inp.lev || 1} 倍</div></div>
      <div class="tile"><div class="tl">估計強平價</div><div class="tv">${z.liq ? fPrice(z.liq) : '—'}</div><div class="small muted">停損距離 ${pct(z.dist)}</div></div>
    </div>
    <p class="small muted">部位大小是用「停損距離」反推的：停損越遠，能開的越小。槓桿只影響保證金，不影響虧損。</p>
    ${checkList(r.checks)}` };
}

function stockResult(s, m, p) {
  const r = checkStock(sf, p, s, m, nowMs());
  return { r, inp: sf, html: `
    <div class="card-head"><h2>規則判定</h2>${r.ok ? chip('good', '可以買') : chip('bad', `先不要買 · ${r.fails} 項沒通過`)}</div>
    ${checkList(r.checks)}` };
}

export function render(el) {
  const s = getState();
  const m = getMarket();
  initForms(s);
  const now = nowMs();

  el.innerHTML = `<div class="view">
    ${pageHead('下單前檢查', '每一筆都先在這裡跑一次。沒看到「可以下單」，就不下單。')}
    <section class="card">
      <div class="segmented big-seg" role="group" aria-label="類型">
        <button type="button" data-mode="contract" class="${mode === 'contract' ? 'on' : ''}">開合約</button>
        <button type="button" data-mode="stock" class="${mode === 'stock' ? 'on' : ''}">買股票</button>
      </div>
      <div data-form>${mode === 'contract' ? contractForm(s, m) : stockForm()}</div>
    </section>
    <section class="card" data-out></section>
    ${wishCard(s, now)}
  </div>`;

  const v = el.firstElementChild;
  const out = v.querySelector('[data-out]');

  const update = () => {
    const p = portfolio(s, m);
    const { r, inp, html } = mode === 'contract' ? contractResult(s, m, p) : stockResult(s, m, p);
    const coolFail = r.checks.some(c => c.group === '冷靜期' && !c.ok) && !coolStatus(s, inp.sym, nowMs());
    out.innerHTML = `${html}
      <div class="actions">
        ${coolFail && inp.sym ? `<button type="button" class="btn" data-act="towish">放進想買清單（${esc(baseSym(inp.sym))}）</button>` : ''}
        <button type="button" class="btn primary" data-act="journal" ${r.ok ? '' : 'disabled'}>通過，寫進交易日誌</button>
      </div>
      ${priceChart(m, inp.sym)}`;
    bindCharts(out);
    out.querySelector('[data-act="journal"]').addEventListener('click', () => {
      if (mode === 'contract') {
        prefillJournal({ sym: baseSym(inp.sym), action: inp.side === 'short' ? 'short' : 'long', lev: inp.lev, amount: Math.round(r.sizing.margin * p.fx), source: inp.source });
      } else {
        prefillJournal({ sym: baseSym(inp.sym), action: 'buy', lev: 1, amount: Math.round(r.sizing.amount), source: inp.source });
      }
      location.hash = '#/journal';
    });
    out.querySelector('[data-act="towish"]')?.addEventListener('click', () => {
      s.wishlist.push({ id: uid(), sym: baseSym(inp.sym), note: '', source: EMO_SOURCES.includes(inp.source) ? inp.source : 'kol', addedAt: new Date(nowMs()).toISOString() });
      save();
      changed();
      toast(`已放進想買清單，${s.rules.coolHours} 小時後再來`);
      render(el);
    });
  };

  // 表單輸入：只更新結果，不重畫表單（才不會打斷輸入）
  v.querySelector('[data-form]').addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.c) cf[t.dataset.c] = t.dataset.c === 'sym' ? readValue(t).toUpperCase() : readValue(t);
    else if (t.dataset.k) sf[t.dataset.k] = t.dataset.k === 'sym' ? readValue(t).toUpperCase() : readValue(t);
    else return;
    update();
  });
  v.querySelector('[data-form]').addEventListener('change', e => {
    // 換標的時，進場價的提示（收盤價）要跟著換；重畫後游標留在原本要去的欄位
    if (e.target.dataset.c !== 'sym') return;
    setTimeout(() => {
      const next = document.activeElement?.dataset?.c;
      render(el);
      if (next) el.querySelector(`[data-c="${next}"]`)?.focus();
    }, 0);
  });
  v.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; render(el); }));
  v.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => { cf.side = b.dataset.side; render(el); }));
  v.querySelectorAll('[data-mkt]').forEach(b => b.addEventListener('click', () => { sf.mkt = b.dataset.mkt; render(el); }));

  // 想買清單
  v.querySelector('[data-wform]').addEventListener('input', e => {
    const k = e.target.dataset.w;
    if (k) wf[k] = readValue(e.target);
  });
  v.querySelector('[data-act="wadd"]').addEventListener('click', () => {
    const sym = baseSym(wf.sym);
    if (!sym) { toast('先填代號'); return; }
    if (s.wishlist.some(w => baseSym(w.sym) === sym)) { toast('清單裡已經有了'); return; }
    s.wishlist.push({ id: uid(), sym, note: wf.note, source: wf.source, addedAt: new Date(nowMs()).toISOString() });
    wf.sym = '';
    wf.note = '';
    save();
    changed();
    render(el);
  });
  v.querySelectorAll('[data-wdel]').forEach(b => b.addEventListener('click', () => {
    s.wishlist = s.wishlist.filter(w => w.id !== b.dataset.wdel);
    save();
    changed();
    render(el);
  }));

  update();
}
