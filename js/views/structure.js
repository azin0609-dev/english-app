// 結構：核心桶／衛星桶、單一個股與產業曝險、損益（平日隱藏，週日才開放）
import { getState, save } from '../store.js';
import { getMarket } from '../market.js';
import { portfolio } from '../calc.js';
import { todayStr, weekday, monthOf, twd, usd, pct } from '../util.js';
import { pageHead, chip, upDown } from '../ui.js';
import { stackBar, meter, hbars } from '../chart.js';

let reveal = false;

export function render(el) {
  const s = getState();
  const m = getMarket();
  const R = s.rules;
  const today = todayStr();
  const p = portfolio(s, m);
  const satCap = R.satCapPct / 100;
  const single = R.singleCapPct / 100;
  const sunday = weekday(today) === 0;
  const showPnl = sunday || reveal;
  const peeks = s.peeks[monthOf(today)] || 0;
  const daysToSunday = (7 - weekday(today)) % 7;

  if (!p.total) {
    el.innerHTML = `${pageHead('資產結構')}<section class="card"><p>還沒有資料。先到 <a href="#/holdings">持倉</a> 填數字。</p></section>`;
    return;
  }

  const coreUsTarget = R.coreUsPct / 100;
  el.innerHTML = `<div class="view">
    ${pageHead('資產結構', '核心桶＝大盤 ETF，長期持有；衛星桶＝個股、主題 ETF、合約，有上限。')}

    <section class="card">
      <div class="card-head"><h2>投資資產</h2><span class="small muted">不含預備金 · 匯率 ${p.fx.toFixed(2)}</span></div>
      <p class="big-num">${twd(p.total)}</p>
      ${stackBar([
        { label: '核心桶', value: p.core, color: 'var(--s1)', text: twd(p.core) },
        { label: '衛星桶', value: p.sat, color: 'var(--s2)', text: twd(p.sat) },
        { label: '現金', value: p.cash, color: 'var(--s3)', text: twd(p.cash) },
      ])}
    </section>

    <div class="grid-2 wide">
      <section class="card">
        <div class="card-head"><h2>衛星桶</h2>${p.satR > satCap ? chip('bad', '超過上限') : chip('good', '在上限內')}</div>
        <p><b>${pct(p.satR, 0)}</b> <span class="muted">／上限 ${R.satCapPct}%</span></p>
        ${meter(p.satR, { max: Math.max(1, p.satR), cap: satCap, status: p.satR > satCap ? 'bad' : p.satR > satCap * 0.9 ? 'warn' : 'good', label: `衛星桶 ${pct(p.satR, 0)}，上限 ${R.satCapPct}%` })}
        <ul class="mini-list">
          <li><span>台股個股</span><b>${twd(p.twSat)}</b></li>
          <li><span>美股個股</span><b>${twd(p.usSat)}</b></li>
          <li><span>合約帳戶</span><b>${twd(p.contractEq)}</b></li>
        </ul>
        ${p.satR > satCap ? '<p class="note warn">新資金只進核心桶。個股、合約獲利出場的錢，分批移到核心桶。</p>' : ''}
      </section>

      <section class="card">
        <div class="card-head"><h2>核心桶台美比例</h2><span class="small muted">美股目標 ${R.coreUsPct}%</span></div>
        ${p.core ? `
          <p><b>美股 ${pct(p.coreUsR, 0)}</b> <span class="muted">· 台股 ${pct(1 - p.coreUsR, 0)}</span></p>
          ${meter(p.coreUsR, { max: 1, cap: coreUsTarget, status: Math.abs(p.coreUsR - coreUsTarget) > 0.1 ? 'warn' : 'good', label: `核心桶美股 ${pct(p.coreUsR, 0)}，目標 ${R.coreUsPct}%` })}
          <ul class="mini-list">
            <li><span>台股大盤 ETF</span><b>${twd(p.twCore)}</b></li>
            <li><span>美股大盤 ETF</span><b>${twd(p.usCore)}</b></li>
          </ul>
          <p class="small muted">差距由每月定投自動補（買比較少的那邊），不用另外賣。</p>`
        : '<p class="muted">還沒有核心桶。每月定投會從這裡開始。</p>'}
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2>單一個股曝險</h2><span class="small muted">股票市值＋合約持倉價值</span></div>
      ${hbars(p.exposures.map(e => ({ label: e.name, value: e.ratio, text: `${pct(e.ratio, 0)} · ${twd(e.value)}`, over: e.ratio > single })), { cap: single, capLabel: `上限 ${R.singleCapPct}%` })}
      <p class="small muted">合約用「持倉價值」算：4 倍槓桿、1 萬保證金，曝險是 4 萬。大盤 ETF 不算在這裡。</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>產業曝險</h2><span class="small muted">占投資資產</span></div>
      ${hbars(p.sectors.map(x => ({ label: x.name, value: x.ratio, text: `${pct(x.ratio, 0)} · ${twd(x.value)}` })))}
    </section>

    <section class="card">
      <div class="card-head"><h2>損益</h2><span class="small muted">每週日開放</span></div>
      ${showPnl ? `
        <div class="grid-3 stats">
          <div class="stat"><div class="sv">${upDown(p.pnl.tw, twd(p.pnl.tw))}</div><div class="sl">台股未實現</div></div>
          <div class="stat"><div class="sv">${upDown(p.pnl.us, usd(p.pnl.us))}</div><div class="sl">美股未實現</div></div>
          <div class="stat"><div class="sv">${upDown(p.pnl.contracts, usd(p.pnl.contracts))}</div><div class="sl">合約浮動</div></div>
        </div>
        <p class="small muted" style="margin-top:10px">看完記得：已經發生的賺賠，不會改變下一步該做什麼。下一步只看紀律清單。${!sunday ? ` 本月提前看了 ${peeks} 次。` : ''}</p>`
      : `
        <div class="lock">
          <p>🔒 <b>損益金額先藏起來</b></p>
          <p class="small muted">還有 ${daysToSunday} 天到週日。平日只看結構和紀律，避免賺賠的數字影響判斷。</p>
          <button type="button" class="btn ghost sm" data-act="peek">我了解，仍要提前看（會記錄次數）</button>
          ${peeks ? `<p class="small muted">本月已提前看 ${peeks} 次</p>` : ''}
        </div>`}
    </section>
  </div>`;

  el.querySelector('[data-act="peek"]')?.addEventListener('click', () => {
    const k = monthOf(today);
    s.peeks[k] = (s.peeks[k] || 0) + 1;
    save();
    reveal = true;
    render(el);
  });
  // 離開這頁就重新藏起來
  return () => { reveal = false; };
}

