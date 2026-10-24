// 定投：每月定期定額、大跌分段加碼、再平衡
import { getState, save } from '../store.js';
import { getMarket, fngLabel } from '../market.js';
import { portfolio } from '../calc.js';
import { dcaPlan, dipPlan } from '../rules.js';
import { todayStr, monthOf, twd, usd, pct, shortDate, esc } from '../util.js';
import { pageHead, chip, numField, textField, readValue, confirmBox, toast, changed } from '../ui.js';
import { meter } from '../chart.js';

/** 最近 6 個月（含本月），新的在右 */
function recentMonths(today) {
  const [y, mo] = today.split('-').map(Number);
  const out = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function lineText(l) {
  return l.mkt === 'us' ? `約 ${usd(l.amountUsd ?? 0)}（${twd(l.amount)}）` : twd(l.amount);
}

export function render(el) {
  const s = getState();
  const m = getMarket();
  const R = s.rules;
  const today = todayStr();
  const month = monthOf(today);
  const p = portfolio(s, m);
  const d = dcaPlan(p, s, m);
  const dip = dipPlan(s, m);
  const done = s.plan.dcaDone[month];
  const satCap = R.satCapPct / 100;
  const excess = p.satR > satCap ? p.sat - satCap * p.total : 0;
  const overSingle = p.exposures.filter(e => e.ratio > R.singleCapPct / 100);

  el.innerHTML = `<div class="view">
    ${pageHead('定投與加碼', '核心桶照規則買：每月固定買、大跌分段加碼，不靠感覺。')}

    <section class="card">
      <div class="card-head"><h2>本月定期定額</h2>${d.fng ? chip(d.mult > 1 ? 'good' : d.mult < 1 ? 'warn' : 'info', `${fngLabel(d.fng.v, R)} ×${d.mult}`) : ''}</div>
      <div class="form-grid">
        ${numField('每月可投入', 'monthly', s.plan.monthly, { suffix: '台幣', attrs: 'data-p="monthly"' })}
        ${textField('台股 ETF', 'twEtf', s.plan.twEtf, { placeholder: '0050', attrs: 'data-p="twEtf"' })}
        ${textField('美股 ETF', 'usEtf', s.plan.usEtf, { placeholder: 'VOO', attrs: 'data-p="usEtf"' })}
      </div>
      ${d.monthly ? `
        <div class="buy-lines">${d.lines.map(l => `<div class="buy-line"><span>買 <b>${esc(l.sym)}</b></span><b>${lineText(l)}</b></div>`).join('') || '<p class="muted">本月不用買。</p>'}</div>
        <ul class="mini-list">
          <li><span>每月可投入</span><b>${twd(d.monthly)}</b></li>
          ${d.toEmergency ? `<li><span>先撥去預備金</span><b>${twd(d.toEmergency)}</b></li>` : ''}
          <li><span>恐懼貪婪倍數</span><b>×${d.mult}</b></li>
          <li><span>本月投入</span><b>${twd(d.invest)}</b></li>
        </ul>
        <p class="small muted">${esc(d.reasons.join('；'))}。${d.extra > 0 ? `多出來的 ${twd(d.extra)} 從投資用現金出。` : d.extra < 0 ? `少投的 ${twd(-d.extra)} 留在現金，等市場恐懼時用。` : ''}台股美股的分配，會讓核心桶往「美股 ${R.coreUsPct}%」靠近。</p>
        <label class="switch-row done-row"><span><b>本月已經買了</b>${done ? `<br><span class="small muted">${shortDate(done)} 完成</span>` : ''}</span><input type="checkbox" data-act="done" ${done ? 'checked' : ''}></label>`
      : '<p class="note">先填「每月可投入」，這裡會算出這個月要買多少。</p>'}
      <div class="months" aria-label="最近 6 個月">${recentMonths(today).map(k => `<span class="${s.plan.dcaDone[k] ? 'on' : ''}">${Number(k.slice(5))}月 ${s.plan.dcaDone[k] ? '✓' : '—'}</span>`).join('')}</div>
    </section>

    <section class="card">
      <div class="card-head"><h2>大跌分段加碼</h2>${dip.ready ? chip('good', `第 ${dip.ready.tier} 段可執行`) : chip('info', '未觸發')}</div>
      <p class="small muted">大盤從一年高點跌 ${R.dipTiers.join('／')}% 時，各動用一段加碼池，只買大盤 ETF。跌越多買越多，但分三次，不會一次用完。</p>
      <div class="form-grid">${numField('加碼池', 'pool', s.plan.pool, { suffix: '台幣', hint: '平常存著、專門等大跌用的錢', attrs: 'data-p="pool"' })}</div>
      ${dip.markets.map(x => `
        <div class="dd-block">
          <div class="row between"><b>${x.name}</b><span class="small">${x.dd == null ? '沒有資料' : `距高點 −${pct(x.dd)}`}</span></div>
          ${meter(x.dd ?? 0, { max: 0.4, status: x.tier ? 'warn' : 'neutral', ticks: R.dipTiers.map(t => ({ at: t / 100, label: `${t}%` })), label: `${x.name}距一年高點 ${pct(x.dd)}` })}
        </div>`).join('')}
      <div class="table-scroll" style="margin-top:22px"><table class="data">
        <thead><tr><th>段數</th><th>觸發條件</th><th>金額</th><th>狀態</th></tr></thead>
        <tbody>${[1, 2, 3].map(i => {
          const used = s.plan.dipUsed[i];
          const status = used ? `已執行 ${shortDate(used)}` : i <= dip.reached ? '已觸發' : '未觸發';
          return `<tr><td>第 ${i} 段</td><td>跌 ${R.dipTiers[i - 1]}%</td><td>${used ? '—' : twd(dip.perTier)}</td><td>${status}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
      ${dip.ready ? `
        <p class="note ok">${esc(dip.ready.market)}距高點 −${pct(dip.ready.dd)}：買 ${dip.ready.lines.map(l => `<b>${esc(l.sym)}</b> ${twd(l.amount)}`).join('、')}。</p>
        <button type="button" class="btn primary" data-act="dip">我已照做第 ${dip.ready.tier} 段（從加碼池扣 ${twd(dip.ready.amount)}）</button>` : ''}
      ${dip.used.length ? `<p class="small muted" style="margin-top:10px">${dip.canReset ? '大盤已經回到高點附近，可以重新開始，並把加碼池補滿。' : '等大盤回到高點附近（5% 以內），再重新開始。'}</p>
        <button type="button" class="btn ghost sm" data-act="reset">重新開始三段加碼</button>` : ''}
    </section>

    <section class="card">
      <h2>再平衡</h2>
      ${!p.total ? '<p class="muted">先到持倉填資料。</p>' : `
        <ul class="mini-list">
          <li><span>衛星桶</span><b>${pct(p.satR, 0)} ／ 上限 ${R.satCapPct}%</b></li>
          <li><span>核心桶美股比例</span><b>${p.core ? pct(p.coreUsR, 0) : '—'} ／ 目標 ${R.coreUsPct}%</b></li>
        </ul>
        ${excess > 0 ? `<p class="note warn">衛星桶超過上限 ${twd(excess)}。不用一次賣：個股或合約獲利出場時，把錢移到核心桶，直到回到 ${R.satCapPct}% 以下。</p>` : ''}
        ${overSingle.map(e => `<p class="note warn">${esc(e.name)} 占投資資產 ${pct(e.ratio, 0)}，超過單一個股上限 ${R.singleCapPct}%（多出約 ${twd(e.value - (p.total * R.singleCapPct) / 100)}）。這一檔不再加碼；有獲利時分批減到上限內。</p>`).join('')}
        ${!excess && !overSingle.length ? '<p class="note ok">✓ 結構健康。台美比例的小差距，交給每月定投慢慢補。</p>' : ''}`}
    </section>
  </div>`;

  const v = el.firstElementChild;
  v.querySelectorAll('[data-p]').forEach(inp => inp.addEventListener('change', () => {
    const k = inp.dataset.p;
    const val = readValue(inp);
    s.plan[k] = k === 'twEtf' || k === 'usEtf' ? String(val || '').toUpperCase() : val;
    save();
    changed();
    render(el);
  }));
  v.querySelector('[data-act="done"]')?.addEventListener('change', e => {
    if (e.target.checked) s.plan.dcaDone[month] = today;
    else delete s.plan.dcaDone[month];
    save();
    changed();
    if (e.target.checked) toast('✓ 本月定投完成。下個月再見，中間不用一直看盤。');
    render(el);
  });
  v.querySelector('[data-act="dip"]')?.addEventListener('click', async () => {
    const r = dip.ready;
    const ok = await confirmBox(`記錄第 ${r.tier} 段已執行，並從加碼池扣掉 ${twd(r.amount)}？`, { ok: '記錄' });
    if (!ok) return;
    s.plan.dipUsed[r.tier] = today;
    s.plan.pool = Math.max(0, Math.round((s.plan.pool || 0) - r.amount));
    save();
    changed();
    render(el);
  });
  v.querySelector('[data-act="reset"]')?.addEventListener('click', async () => {
    const ok = await confirmBox('清除三段加碼的執行紀錄？記得同時把加碼池補到想要的金額。', { ok: '重新開始' });
    if (!ok) return;
    s.plan.dipUsed = {};
    save();
    changed();
    render(el);
  });
}
