// 持倉：帳戶現金、預備金、台股、美股、合約（從券商和交易所 App 抄數字）
import { getState, touch } from '../store.js';
import { getMarket } from '../market.js';
import { contractView, estLiq, SECTORS } from '../calc.js';
import { esc, uid, f0, fPrice, twd, usd, isNum } from '../util.js';
import { numField, textField, selectField, readValue, pageHead, confirmBox, toast, changed } from '../ui.js';

const open = new Set();

const BUCKETS = [['core', '核心（大盤 ETF）'], ['sat', '衛星（個股、主題 ETF）']];
const SIDES = [['long', '做多'], ['short', '做空']];
const SECTOR_OPTS = SECTORS.map(x => [x, x]);

function holdingSummary(h) {
  const ccy = h.mkt === 'us' ? usd : twd;
  return `${esc(h.sym || '新標的')}${h.name ? ` ${esc(h.name)}` : ''} · ${h.bucket === 'core' ? '核心' : '衛星'} · ${ccy(h.value)}`;
}

function contractSummary(c) {
  return `${esc(c.sym || '新合約')} · ${c.side === 'short' ? '空' : '多'} ${c.lev || '?'} 倍 · 數量 ${isNum(c.qty) ? c.qty : '—'}${c.stop ? '' : ' · ⚠ 沒停損'}`;
}

function holdingRow(h) {
  const ccy = h.mkt === 'us' ? '美元' : '台幣';
  const b = f => `data-list="holdings" data-id="${h.id}" data-f="${f}"`;
  return `
    <details class="row-card" data-row="${h.id}" ${open.has(h.id) ? 'open' : ''}>
      <summary><span data-sum="${h.id}">${holdingSummary(h)}</span></summary>
      <div class="form-grid">
        ${textField('代號', 'sym', h.sym, { placeholder: h.mkt === 'us' ? '例如 VOO、NVDA' : '例如 0050、2330', attrs: b('sym') })}
        ${textField('名稱', 'name', h.name, { placeholder: '自己看得懂就好', attrs: b('name') })}
        ${numField('目前市值', 'value', h.value, { suffix: ccy, attrs: b('value') })}
        ${numField('總成本', 'cost', h.cost, { suffix: ccy, hint: '算損益用，可以不填', attrs: b('cost') })}
        ${selectField('類型', 'bucket', h.bucket, BUCKETS, { attrs: b('bucket') })}
        ${selectField('產業', 'sector', h.sector || '其他', SECTOR_OPTS, { attrs: b('sector') })}
      </div>
      <button type="button" class="btn danger sm" data-del="holdings" data-id="${h.id}">刪除這筆</button>
    </details>`;
}

function contractRow(c, m) {
  const v = contractView(c, m);
  const b = f => `data-list="contracts" data-id="${c.id}" data-f="${f}"`;
  const liqHint = c.cross ? '全倉算不出來，請從交易所抄' : (() => { const e = estLiq(c.side, v.entry, v.lev); return e ? `空白時用估計值 ${fPrice(e)}` : ''; })();
  return `
    <details class="row-card" data-row="${c.id}" ${open.has(c.id) ? 'open' : ''}>
      <summary><span data-sum="${c.id}">${contractSummary(c)}</span></summary>
      <div class="form-grid">
        ${textField('代號', 'sym', c.sym, { placeholder: '例如 NVDA', attrs: b('sym') })}
        ${selectField('方向', 'side', c.side, SIDES, { attrs: b('side') })}
        ${numField('數量', 'qty', c.qty, { suffix: '股／單位', attrs: b('qty') })}
        ${numField('進場均價', 'entry', c.entry, { suffix: '美元', attrs: b('entry') })}
        ${numField('槓桿', 'lev', c.lev, { suffix: '倍', attrs: b('lev') })}
        ${numField('停損價', 'stop', c.stop, { suffix: '美元', hint: '一定要填', attrs: b('stop') })}
        ${numField('現價', 'mark', c.mark, { suffix: '美元', hint: v.markSrc === '手動' ? '' : `空白時用${esc(v.markSrc)} ${fPrice(v.mark)}`, attrs: b('mark') })}
        ${numField('強平價', 'liq', c.liq, { suffix: '美元', hint: liqHint, attrs: b('liq') })}
        ${selectField('產業', 'sector', c.sector || 'AI／半導體', SECTOR_OPTS, { attrs: b('sector') })}
        <label class="field check-field"><input type="checkbox" ${b('cross')} ${c.cross ? 'checked' : ''}><span>全倉模式</span></label>
      </div>
      <button type="button" class="btn danger sm" data-del="contracts" data-id="${c.id}">刪除這筆</button>
    </details>`;
}

export function render(el) {
  const s = getState();
  const m = getMarket();
  const a = s.accounts;
  const ab = k => `data-bind="${k}"`;
  const tw = s.holdings.filter(h => h.mkt !== 'us');
  const us = s.holdings.filter(h => h.mkt === 'us');

  el.innerHTML = `<div class="view">
    ${pageHead('持倉', '從券商、交易所 App 抄最新數字。只存在這台裝置，不會上傳。')}

    <section class="card">
      <h2>帳戶</h2>
      <div class="form-grid">
        ${numField('投資用台幣現金', 'cashTwd', a.cashTwd, { suffix: '台幣', hint: '準備拿來投資的錢，不含預備金', attrs: ab('cashTwd') })}
        ${numField('券商美元現金', 'cashUsd', a.cashUsd, { suffix: '美元', attrs: ab('cashUsd') })}
        ${numField('預備金', 'emergency', a.emergency, { suffix: '台幣', hint: '緊急時才動用的錢', attrs: ab('emergency') })}
        ${numField('每月生活費', 'monthlyExpense', a.monthlyExpense, { suffix: '台幣', attrs: ab('monthlyExpense') })}
        ${numField('合約帳戶權益', 'contractEquity', a.contractEquity, { suffix: '美元', hint: '交易所顯示的帳戶總值（含未實現損益）', attrs: ab('contractEquity') })}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>台股</h2><span class="small muted">${tw.length} 筆 · 台幣</span></div>
      ${tw.map(holdingRow).join('') || '<p class="muted small">還沒有台股。</p>'}
      <button type="button" class="btn sm" data-add="tw">＋ 新增台股</button>
    </section>

    <section class="card">
      <div class="card-head"><h2>美股</h2><span class="small muted">${us.length} 筆 · 美元</span></div>
      ${us.map(holdingRow).join('') || '<p class="muted small">還沒有美股。</p>'}
      <button type="button" class="btn sm" data-add="us">＋ 新增美股</button>
    </section>

    <section class="card">
      <div class="card-head"><h2>合約</h2><span class="small muted">${s.contracts.length} 張 · 美元</span></div>
      ${s.contracts.map(c => contractRow(c, m)).join('') || '<p class="muted small">沒有合約部位。</p>'}
      <button type="button" class="btn sm" data-add="contract">＋ 新增合約</button>
      <p class="small muted" style="margin-top:10px">現價空白時，會用每天自動抓的收盤價（${f0(Object.keys(m.series).length)} 個標的）；交易所的即時價格更準。</p>
    </section></div>`;
  // 事件掛在這次畫出來的外框上，重畫時跟著舊畫面一起消失，不會重複
  const view = el.firstElementChild;

  // 改數字：直接存，只更新摘要列（不重畫整頁，才不會打斷輸入）
  view.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.bind) {
      a[t.dataset.bind] = readValue(t);
    } else if (t.dataset.list) {
      const item = s[t.dataset.list].find(x => x.id === t.dataset.id);
      if (!item) return;
      let val = readValue(t);
      if (t.dataset.f === 'sym' && typeof val === 'string') val = val.toUpperCase();
      item[t.dataset.f] = val;
      const sum = view.querySelector(`[data-sum="${item.id}"]`);
      if (sum) sum.innerHTML = t.dataset.list === 'contracts' ? contractSummary(item) : holdingSummary(item);
    } else {
      return;
    }
    touch();
    changed();
  });

  view.addEventListener('toggle', e => {
    const row = e.target.closest?.('[data-row]');
    if (!row) return;
    if (row.open) open.add(row.dataset.row);
    else open.delete(row.dataset.row);
  }, true);

  view.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => {
    const id = uid();
    const kind = btn.dataset.add;
    if (kind === 'contract') {
      s.contracts.push({ id, sym: '', name: '', side: 'long', qty: null, entry: null, mark: null, lev: null, liq: null, stop: null, cross: false, sector: 'AI／半導體' });
    } else {
      s.holdings.push({ id, mkt: kind, sym: '', name: '', value: null, cost: null, bucket: kind === 'us' ? 'sat' : 'core', sector: '其他' });
    }
    open.add(id);
    touch();
    render(el);
    el.querySelector(`[data-row="${id}"] input`)?.focus();
  }));

  view.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
    const list = s[btn.dataset.del];
    const item = list.find(x => x.id === btn.dataset.id);
    if (!item) return;
    const ok = await confirmBox(`確定刪除「${esc(item.sym || '這筆')}」？`, { ok: '刪除', danger: true });
    if (!ok) return;
    list.splice(list.indexOf(item), 1);
    open.delete(item.id);
    touch();
    changed();
    toast('已刪除');
    render(el);
  }));
}
