// 總覽：今日待辦、紀律清單、資產與市場摘要
import { getState, hasHoldings } from '../store.js';
import { getMarket, fngOf, fngLabel, findSeries, drawdown, marketAgeDays, IDX } from '../market.js';
import { portfolio } from '../calc.js';
import { discipline, todos } from '../rules.js';
import { todayStr, twd, usd, pct, esc } from '../util.js';
import { todoRow, discRow, pageHead } from '../ui.js';
import { stackBar } from '../chart.js';

let showAll = false;

function welcome() {
  return `
    ${pageHead('歡迎使用投資儀表板', '先把規則和數字填好，之後每天打開看「今日待辦」就好。')}
    <section class="card">
      <h2>三個步驟開始</h2>
      <ol class="steps">
        <li><a href="#/settings"><b>看一遍規則</b></a><br><span class="muted small">槓桿上限、每筆最多虧多少、衛星桶上限……都是範例數字，改成你的。</span></li>
        <li><a href="#/holdings"><b>填持倉</b></a><br><span class="muted small">從券商和交易所 App 抄：現金、預備金、台股、美股、合約。</span></li>
        <li><a href="#/plan"><b>設定每月定投</b></a><br><span class="muted small">每個月固定投入多少，App 會依預備金和恐懼指數告訴你這個月買多少。</span></li>
      </ol>
      <p class="note">所有數字只存在這台裝置的瀏覽器，不會上傳。換裝置要用「設定 → 匯出備份」搬過去。</p>
    </section>`;
}

function marketCard(s, m, today) {
  const f = fngOf(s, m);
  const age = marketAgeDays(m, today);
  const dd = [['台股', IDX.tw], ['美股', IDX.us]].map(([n, k]) => [n, drawdown(findSeries(m, k))]);
  return `
    <section class="card">
      <div class="card-head"><h2>市場溫度</h2><a class="small" href="#/market">詳情 ›</a></div>
      <div class="grid-3 stats">
        <div class="stat"><div class="sv">${f ? f.v : '—'}</div><div class="sl">恐懼貪婪<br>${f ? esc(fngLabel(f.v, s.rules)) : '沒有資料'}</div></div>
        ${dd.map(([n, d]) => `<div class="stat"><div class="sv">${d ? `−${pct(d.dd)}` : '—'}</div><div class="sl">${n}距一年高點</div></div>`).join('')}
      </div>
      <p class="small muted" style="margin-top:8px">${age == null ? '還沒有市場資料' : `資料 ${age === 0 ? '今天' : `${age} 天前`}更新`} · 只當參考，不是買賣訊號</p>
    </section>`;
}

export function render(el) {
  const s = getState();
  const m = getMarket();
  const today = todayStr();
  const p = portfolio(s, m);

  if (!hasHoldings(s) && !p.total) {
    el.innerHTML = welcome() + marketCard(s, m, today);
    return;
  }

  const t = todos(p, s, m, today);
  const d = discipline(p, s, today);
  const urgent = t.filter(x => x.lv === 'bad').length;
  const list = showAll ? t : t.slice(0, 4);
  const cs = p.contracts;

  el.innerHTML = `
    ${pageHead('今日總覽', `${today.replace(/-/g, '/')} · 持倉更新 ${s.updatedAt ? s.updatedAt.replace(/-/g, '/') : '—'}`)}

    <section class="card">
      <div class="card-head"><h2>今日待辦</h2><span class="small muted">${t.length ? `${t.length} 項${urgent ? `，${urgent} 項要先處理` : ''}` : ''}</span></div>
      ${t.length ? `<div class="todos">${list.map(todoRow).join('')}</div>` : '<p class="note ok">✓ 今天沒有要做的事。照規則來，不用一直看盤。</p>'}
      ${t.length > 4 ? `<button type="button" class="btn ghost block" data-act="more">${showAll ? '收起' : `看全部 ${t.length} 項`}</button>` : ''}
    </section>

    <div class="grid-2 wide">
      <section class="card">
        <div class="card-head"><h2>紀律清單</h2><span class="chip ${d.score >= 80 ? 'ok' : d.score >= 50 ? 'warn' : 'bad'}">${d.score} 分</span></div>
        <div class="discs">${d.items.map(discRow).join('')}</div>
      </section>

      <div>
        <section class="card">
          <div class="card-head"><h2>資產</h2><a class="small" href="#/structure">結構 ›</a></div>
          <p class="big-num">${twd(p.total)}</p>
          <p class="small muted">投資資產（不含預備金）· 預備金 ${p.efMonths == null ? '—' : `${p.efMonths.toFixed(1)} 個月`}</p>
          ${stackBar([
            { label: '核心桶', value: p.core, color: 'var(--s1)', text: twd(p.core) },
            { label: '衛星桶', value: p.sat, color: 'var(--s2)', text: twd(p.sat) },
            { label: '現金', value: p.cash, color: 'var(--s3)', text: twd(p.cash) },
          ])}
        </section>
        ${cs.length ? `
        <section class="card">
          <div class="card-head"><h2>合約風險</h2><a class="small" href="#/risk">風控 ›</a></div>
          <p class="big-num">${p.noStop.length ? '沒有上限' : usd(p.riskUsedUsd)}</p>
          <p class="small muted">${p.noStop.length ? `${p.noStop.length} 張合約沒有停損` : `停損全部觸發會再虧（預算 ${usd(p.riskBudgetUsd)}）`}</p>
        </section>` : ''}
        ${marketCard(s, m, today)}
      </div>
    </div>`;

  el.querySelector('[data-act="more"]')?.addEventListener('click', () => {
    showAll = !showAll;
    render(el);
  });
}
