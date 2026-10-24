// 風控：所有停損同時觸發最多再虧多少、每張合約距強平多遠
import { getState, touch } from '../store.js';
import { getMarket } from '../market.js';
import { portfolio } from '../calc.js';
import { fPrice, usd, twd, pct, isNum } from '../util.js';
import { pageHead, chip, readValue, changed } from '../ui.js';
import { meter } from '../chart.js';

function contractCard(c, R) {
  const warn = [];
  if (!c.hasStop) warn.push(chip('bad', '沒有停損'));
  else if (c.stopBeforeLiq === false) warn.push(chip('bad', '停損在強平之後'));
  if (c.lev > R.maxLev) warn.push(chip('warn', `槓桿超過 ${R.maxLev} 倍`));
  if (c.cross) warn.push(chip('warn', '全倉模式'));
  if (c.liqDist != null && c.liqDist < 0.1) warn.push(chip('bad', '快被強平'));
  const liqStatus = c.liqDist == null ? 'warn' : c.liqDist < 0.1 ? 'bad' : c.liqDist < 0.2 ? 'warn' : 'good';
  return `
    <section class="card">
      <div class="card-head"><h2>${c.name}</h2><span class="chip">${c.side === 'short' ? '空' : '多'} ${c.lev} 倍</span></div>
      ${warn.length ? `<p class="row">${warn.join('')}</p>` : `<p>${chip('good', '停損與槓桿都在規則內')}</p>`}
      <ul class="mini-list">
        <li><span>現價</span><b>${fPrice(c.mark)} <small class="muted">${c.markSrc}</small></b></li>
        <li><span>進場均價</span><b>${fPrice(c.entry)}</b></li>
        <li><span>持倉價值</span><b>${usd(c.notional)}</b></li>
        <li><span>強平價</span><b>${isNum(c.liq) ? fPrice(c.liq) : '不知道'} <small class="muted">${isNum(c.liq) ? (c.liqManual ? '交易所' : '估計') : '請從交易所抄'}</small></b></li>
      </ul>
      <p class="small" style="margin:10px 0 4px">距強平 <b>${c.liqDist == null ? '—' : pct(c.liqDist)}</b></p>
      ${meter(c.liqDist ?? 0, { max: 0.5, status: liqStatus, ticks: [{ at: 0.1, label: '10%' }, { at: 0.2, label: '20%' }], label: `距強平 ${pct(c.liqDist)}` })}
      <div class="form-grid" style="margin-top:22px">
        <label class="field"><span>停損價 <small class="muted">美元</small></span>
          <input type="number" inputmode="decimal" step="any" data-stop="${c.id}" value="${c.hasStop ? c.stop : ''}" placeholder="一定要填">
        </label>
        <div class="field"><span>停損觸發會再虧</span><b class="big-sub">${c.risk == null ? '沒有上限' : usd(c.risk)}</b></div>
      </div>
    </section>`;
}

export function render(el) {
  const s = getState();
  const m = getMarket();
  const R = s.rules;
  const p = portfolio(s, m);
  const cs = p.contracts;

  if (!cs.length) {
    el.innerHTML = `${pageHead('風控')}<section class="card"><p>目前沒有合約部位。🎉</p><p class="small muted">有開合約的話，到 <a href="#/holdings">持倉</a> 新增。</p></section>`;
    return;
  }
  const budget = p.riskBudgetUsd;
  const used = p.riskUsedUsd;
  const over = p.noStop.length || used > budget;
  const capR = p.contractCap ? p.contractEq / p.contractCap : null;

  el.innerHTML = `<div class="view">
    ${pageHead('風控', '虧損中的部位：不加倉、不補保證金、不移遠停損。')}
    <div class="grid-2 wide">
      <section class="card">
        <div class="card-head"><h2>從現在起最多再虧</h2>${over ? chip('bad', '超過預算') : chip('good', '在預算內')}</div>
        <p class="big-num">${p.noStop.length ? '沒有上限' : usd(used)}</p>
        <p class="small muted">${p.noStop.length ? `${p.noStop.length} 張合約沒有停損，最壞情況是保證金全部賠掉` : `所有停損同時觸發 · 預算 ${usd(budget)}（投資資產的 ${R.riskBudgetPct}%）`}</p>
        ${meter(p.noStop.length ? budget : used, { max: Math.max(budget, used) || 1, cap: budget, status: over ? 'bad' : used > budget * 0.8 ? 'warn' : 'good', label: `最多再虧 ${usd(used)}，預算 ${usd(budget)}` })}
      </section>
      <section class="card">
        <div class="card-head"><h2>合約帳戶</h2>${p.contractEq > p.contractCap ? chip('bad', '超過上限') : chip('good', '在上限內')}</div>
        <p class="big-num">${usd(s.accounts.contractEquity)}</p>
        <p class="small muted">${twd(p.contractEq)} · 上限 ${twd(p.contractCap)}（投資資產的 ${R.contractCapPct}%）</p>
        ${meter(capR, { max: Math.max(1, capR || 0), cap: 1, status: capR > 1 ? 'bad' : capR > 0.9 ? 'warn' : 'good', label: `合約帳戶占上限 ${pct(capR, 0)}` })}
      </section>
    </div>
    ${[...cs].sort((a, b) => (a.liqDist ?? 9) - (b.liqDist ?? 9)).map(c => contractCard(c, R)).join('')}
  </div>`;

  const v = el.firstElementChild;
  v.querySelectorAll('[data-stop]').forEach(inp => inp.addEventListener('change', () => {
    const c = s.contracts.find(x => x.id === inp.dataset.stop);
    if (!c) return;
    c.stop = readValue(inp);
    touch();
    changed();
    render(el);
  }));
}
