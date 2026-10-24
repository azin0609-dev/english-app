// 市場：恐懼貪婪、大盤距高點、各項指數、台股籌碼、走勢圖（只當參考）
import { getState, save } from '../store.js';
import { getMarket, IDX, findSeries, lastOf, trendOf, drawdown, closes, sma, fngOf, fngLabel, seriesName, marketAgeDays } from '../market.js';
import { todayStr, esc, fPrice, pct, spct, isNum, shortDate } from '../util.js';
import { pageHead, chip, upDown, readValue, changed } from '../ui.js';
import { lineChart, bindCharts, sparkline, meter } from '../chart.js';

let sel = IDX.tw;

const NOTES = {
  [IDX.tw]: '台股大盤',
  [IDX.us]: '美股大盤',
  [IDX.nas]: '科技股為主',
  [IDX.vix]: '超過 30 代表市場恐慌',
  [IDX.tnx]: '利率高，股票和債券都有壓力',
  [IDX.fx]: '數字變大＝台幣變弱',
};

function fmtVal(key, v) {
  if (!isNum(v)) return '—';
  if (key === IDX.tnx) return `${v.toFixed(2)}%`;
  if (key === IDX.fx) return v.toFixed(2);
  return fPrice(v);
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '不明';
  return d.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function indexTile(m, key) {
  const ser = findSeries(m, key);
  const l = lastOf(ser);
  if (!l) return `<div class="tile"><div class="tl">${esc(seriesName(m, key))}</div><div class="tv">—</div><div class="small muted">沒有資料</div></div>`;
  const chgText = key === IDX.tnx ? `${(l.v - l.prev).toFixed(2)}` : spct(l.chg);
  return `<div class="tile">
    <div class="tl">${esc(seriesName(m, key))}</div>
    <div class="tv">${fmtVal(key, l.v)}</div>
    <div class="small">${upDown(l.chg, chgText)} <span class="muted">${shortDate(l.date)}</span></div>
    ${sparkline(closes(ser).slice(-60))}
    <div class="small muted">${esc(NOTES[key] || '')}</div>
  </div>`;
}

function ddCard(s, m, key, name) {
  const d = drawdown(findSeries(m, key));
  const tiers = s.rules.dipTiers;
  if (!d) return `<div><b>${name}</b><p class="muted small">沒有資料</p></div>`;
  const tier = tiers.filter(t => d.dd * 100 >= t).length;
  return `<div class="dd-block">
    <div class="row between"><b>${name}</b>${tier ? chip('good', `達第 ${tier} 段`) : chip('info', '未觸發')}</div>
    <p class="small muted">現在 ${fPrice(d.last)} · 一年高點 ${fPrice(d.high)}（${shortDate(d.highDate)}）</p>
    <p><b>距高點 −${pct(d.dd)}</b></p>
    ${meter(d.dd, { max: 0.4, status: tier ? 'warn' : 'neutral', ticks: tiers.map(t => ({ at: t / 100, label: `${t}%` })), label: `${name}距一年高點 ${pct(d.dd)}` })}
  </div>`;
}

function chartBlock(m) {
  const keys = Object.keys(m.series).filter(k => m.series[k].d?.length);
  if (!keys.length) return '';
  if (!keys.includes(sel)) sel = keys[0];
  const ser = findSeries(m, sel);
  const c = closes(ser);
  const m60 = sma(c, 60);
  const m200 = sma(c, 200);
  const from = Math.max(0, ser.d.length - 250);
  const rows = ser.d.slice(from).map((r, i) => ({ date: r[0], price: r[1], ma60: m60[from + i], ma200: m200[from + i] }));
  const t = trendOf(ser);
  const status = t.above200 == null ? chip('info', '資料不到 200 天')
    : t.above200 ? chip('good', '在 200 日線上：長期向上') : chip('bad', '在 200 日線下：長期向下');
  return `
    <section class="card">
      <div class="card-head"><h2>走勢圖</h2><span class="small muted">最近一年 · 日線收盤</span></div>
      <div class="sym-pick" role="group" aria-label="選擇標的">
        ${keys.map(k => `<button type="button" data-sym="${esc(k)}" class="${k === sel ? 'on' : ''}">${esc(seriesName(m, k))}</button>`).join('')}
      </div>
      <p>${status} ${t.ext60 != null ? `<span class="small muted">比 60 日線${t.ext60 >= 0 ? '高' : '低'} ${pct(Math.abs(t.ext60))}</span>` : ''}</p>
      ${lineChart(rows, [
        { key: 'price', label: '收盤', color: 'var(--s1)' },
        { key: 'ma60', label: '60 日線', color: 'var(--s2)' },
        { key: 'ma200', label: '200 日線', color: 'var(--s3)' },
      ], { title: `${seriesName(m, sel)} 最近一年收盤與均線` })}
    </section>`;
}

function watchTable(m) {
  const keys = Object.keys(m.series).filter(k => !Object.values(IDX).includes(k));
  if (!keys.length) return '';
  return `
    <section class="card">
      <div class="card-head"><h2>觀察清單</h2><span class="small muted">data/watchlist.json</span></div>
      <div class="table-scroll"><table class="data">
        <thead><tr><th>標的</th><th>收盤</th><th>漲跌</th><th>200 日線</th><th>距一年高點</th></tr></thead>
        <tbody>${keys.map(k => {
          const ser = findSeries(m, k);
          const l = lastOf(ser);
          const t = trendOf(ser);
          const d = drawdown(ser);
          return `<tr><td>${esc(seriesName(m, k))}<br><span class="muted small">${esc(k)}</span></td><td>${fPrice(l?.v)}</td><td>${upDown(l?.chg, spct(l?.chg))}</td>
            <td>${t?.above200 == null ? '—' : t.above200 ? '線上 ✓' : '線下 ✕'}</td><td>${d ? `−${pct(d.dd)}` : '—'}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>`;
}

export function render(el) {
  const s = getState();
  const m = getMarket();
  const R = s.rules;
  const today = todayStr();
  const age = marketAgeDays(m, today);
  const f = fngOf(s, m);
  const tw = m.tw || {};

  const statusLine = m.updatedAt
    ? `資料更新：${fmtTime(m.updatedAt)}（${age === 0 ? '今天' : `${age} 天前`}）· 每天台灣時間 06:17、22:17 自動更新`
    : '還沒有市場資料';

  el.innerHTML = `<div class="view">
    ${pageHead('市場', statusLine)}
    ${m.errors?.length ? `<p class="note warn small">上次更新有 ${m.errors.length} 項抓不到：${esc(m.errors.slice(0, 3).join('；'))}${m.errors.length > 3 ? '……' : ''}</p>` : ''}
    ${!m.updatedAt ? `<section class="card"><p>市場資料由 GitHub 每天自動抓。第一次可以到 GitHub 儲存庫的 <b>Actions → 更新市場資料 → Run workflow</b> 手動跑一次，幾分鐘後重新整理。</p></section>` : ''}

    <section class="card">
      <h2>這些數字對規則代表什麼</h2>
      <ul class="rule-map">
        <li><b>恐懼貪婪指數</b> → 每月定投倍數（極度恐懼 ×${R.fearMult}、極度貪婪 ×${R.greedMult}）</li>
        <li><b>大盤距一年高點</b> → 大跌分段加碼（跌 ${R.dipTiers.join('／')}% 各動用一段）</li>
        <li><b>60／200 日線</b> → 下單前的「不追高」「不接刀」檢查</li>
        <li><b>其他指標</b> → 只當參考，不直接觸發任何規則</li>
      </ul>
    </section>

    <div class="grid-2 wide">
      <section class="card">
        <div class="card-head"><h2>股市恐懼與貪婪</h2><span class="small muted">${f ? (f.src === '手動' ? '手動輸入' : `CNN · ${esc(shortDate(f.date || today))}`) : ''}</span></div>
        <p class="big-num">${f ? f.v : '—'} <span class="big-sub">${f ? esc(fngLabel(f.v, R)) : '沒有資料'}</span></p>
        ${meter(f ? f.v : 0, { max: 100, status: f && (f.v < R.fear || f.v >= R.greed) ? 'warn' : 'neutral', ticks: [{ at: R.fear, label: `${R.fear} 恐懼` }, { at: 50, label: '50' }, { at: R.greed, label: `${R.greed} 貪婪` }], label: `恐懼貪婪指數 ${f ? f.v : '無資料'}` })}
        ${m.fng && f?.src !== '手動' ? `<p class="small muted" style="margin-top:22px">一週前 ${m.fng.prevWeek ?? '—'} · 一個月前 ${m.fng.prevMonth ?? '—'}</p>` : '<div style="height:16px"></div>'}
        <label class="field inline-field"><span class="small">自動抓不到時手動填（0～100）</span>
          <input type="number" inputmode="numeric" min="0" max="100" data-fng value="${isNum(s.plan.fngManual) ? s.plan.fngManual : ''}" placeholder="空白＝用自動抓的">
        </label>
        <p class="small muted">數值可在 CNN Fear &amp; Greed Index 網頁查到。</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>大盤距一年高點</h2><a class="small" href="#/plan">加碼規則 ›</a></div>
        ${ddCard(s, m, IDX.tw, '台股加權')}
        ${ddCard(s, m, IDX.us, 'S&P 500')}
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2>指數</h2><span class="small muted">參考用</span></div>
      <div class="tiles">${[IDX.tw, IDX.us, IDX.nas, IDX.vix, IDX.tnx, IDX.fx].map(k => indexTile(m, k)).join('')}</div>
    </section>

    <section class="card">
      <div class="card-head"><h2>台股籌碼</h2><span class="small muted">證交所 · 參考用</span></div>
      <div class="grid-2">
        <div class="stat"><div class="sv">${tw.margin ? `${tw.margin.v.toLocaleString('en-US', { maximumFractionDigits: 0 })} 億` : '—'}</div>
          <div class="sl">上市融資餘額${tw.margin ? `（${shortDate(tw.margin.date)}）` : ''}${tw.margin && isNum(tw.margin.prev) ? `<br>${upDown(tw.margin.v - tw.margin.prev, `較前日 ${(tw.margin.v - tw.margin.prev).toFixed(1)} 億`)}` : ''}</div></div>
        <div class="stat"><div class="sv">${tw.foreign ? upDown(tw.foreign.v, `${tw.foreign.v.toFixed(1)} 億`) : '—'}</div>
          <div class="sl">外資買賣超${tw.foreign ? `（${shortDate(tw.foreign.date)}）` : ''}</div></div>
      </div>
      <p class="small muted" style="margin-top:8px">融資餘額越高，代表借錢買股的人越多；大跌時容易出現斷頭賣壓。</p>
    </section>

    ${chartBlock(m)}
    ${watchTable(m)}
  </div>`;

  const v = el.firstElementChild;
  bindCharts(v);
  v.querySelectorAll('[data-sym]').forEach(b => b.addEventListener('click', () => {
    sel = b.dataset.sym;
    render(el);
  }));
  v.querySelector('[data-fng]').addEventListener('change', e => {
    const val = readValue(e.target);
    s.plan.fngManual = isNum(val) ? Math.max(0, Math.min(100, Math.round(val))) : null;
    save();
    changed();
    render(el);
  });
}
