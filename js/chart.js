// 圖表：純 SVG／HTML，不用外部套件
// 顏色用 CSS 變數（--s1～--s3 是資料系列、--st-* 是狀態），淺色／深色模式各一組
import { esc, shortDate, fPrice, isNum, clamp } from './util.js';

const charts = new Map();
let nextId = 1;

function niceStep(range, count) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

function compact(v) {
  const a = Math.abs(v);
  if (a >= 1e4) return `${+(v / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  return fPrice(v);
}

/**
 * 折線圖（價格＋均線）。rows: [{ date, [key]: 數值或 null }]；series: [{ key, label, color }]
 * 滑鼠移上去（或用左右鍵）會顯示當天所有線的數值
 */
export function lineChart(rows, series, { height = 230, title = '' } = {}) {
  // 依螢幕寬度決定座標寬度，手機上文字才不會被縮得太小
  const W = Math.round(clamp((globalThis.innerWidth || 640) - 64, 300, 640));
  const H = height;
  const M = { l: 6, r: 52, t: 10, b: 24 };
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const n = rows.length;
  if (!n) return '<p class="muted small">還沒有資料</p>';
  const vals = rows.flatMap(r => series.map(s => r[s.key])).filter(isNum);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const x = i => M.l + (n === 1 ? pw / 2 : (i * pw) / (n - 1));
  const y = v => M.t + ph - ((v - lo) / (hi - lo)) * ph;

  let grid = '';
  for (let v = lo; v <= hi + step / 2; v += step) {
    grid += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="${v === lo ? 'axis' : 'grid'}"/>`;
    grid += `<text x="${W - M.r + 6}" y="${(y(v) + 4).toFixed(1)}" class="tick">${compact(v)}</text>`;
  }
  // x 軸：每個月第一個交易日，最多 6 個標籤
  const monthStarts = rows.map((r, i) => (i && r.date.slice(0, 7) !== rows[i - 1].date.slice(0, 7) ? i : -1)).filter(i => i >= 0);
  const every = Math.max(1, Math.ceil(monthStarts.length / (W < 480 ? 4 : 6)));
  const xl = monthStarts.filter((_, k) => (monthStarts.length - 1 - k) % every === 0)
    .map(i => `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="tick">${Number(rows[i].date.slice(5, 7))}月</text>`).join('');

  let lines = '';
  for (const s of series) {
    let d = '';
    let pen = false;
    rows.forEach((r, i) => {
      const v = r[s.key];
      if (!isNum(v)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    if (d) lines += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  // 第一條線（價格）的尾端：圓點＋數值
  const s0 = series[0];
  let end = '';
  const li = rows.map(r => r[s0.key]).findLastIndex(isNum);
  if (li >= 0) {
    end = `<circle cx="${x(li).toFixed(1)}" cy="${y(rows[li][s0.key]).toFixed(1)}" r="4" style="fill:${s0.color}" class="ring"/>`;
  }

  const id = `ch${nextId++}`;
  charts.set(id, { rows, series, W, H, M, n, x, y });
  const legend = series.length > 1
    ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`
    : '';
  const recent = rows.slice(-15).reverse();
  return `
    ${legend}
    <div class="chart-wrap" data-chart="${id}">
      <svg viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(title)}（可用左右鍵查看每天的數值）">
        ${grid}${xl}${lines}${end}
        <g class="hover" style="display:none"><line class="cross" y1="${M.t}" y2="${M.t + ph}"/>${series.map(s => `<circle r="4" style="fill:${s.color}" class="ring" data-k="${s.key}"/>`).join('')}</g>
        <rect class="hit" x="${M.l}" y="${M.t}" width="${pw}" height="${ph}" fill="transparent"/>
      </svg>
      <div class="chart-tip" hidden></div>
    </div>
    <details class="table-view"><summary>表格檢視（最近 15 天）</summary>
      <table class="data"><thead><tr><th>日期</th>${series.map(s => `<th>${esc(s.label)}</th>`).join('')}</tr></thead>
      <tbody>${recent.map(r => `<tr><td>${esc(r.date)}</td>${series.map(s => `<td>${fPrice(r[s.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </details>`;
}

/** 讓畫面上的折線圖可以互動（每次 render 後呼叫） */
export function bindCharts(root) {
  root.querySelectorAll('[data-chart]').forEach(wrap => {
    const c = charts.get(wrap.dataset.chart);
    if (!c) return;
    const svg = wrap.querySelector('svg');
    const g = svg.querySelector('.hover');
    const tip = wrap.querySelector('.chart-tip');
    let idx = c.n - 1;
    const show = i => {
      idx = clamp(i, 0, c.n - 1);
      const r = c.rows[idx];
      const px = c.x(idx);
      g.style.display = '';
      g.querySelector('.cross').setAttribute('x1', px);
      g.querySelector('.cross').setAttribute('x2', px);
      g.querySelectorAll('circle').forEach(dot => {
        const v = r[dot.dataset.k];
        dot.style.display = isNum(v) ? '' : 'none';
        if (isNum(v)) { dot.setAttribute('cx', px); dot.setAttribute('cy', c.y(v)); }
      });
      tip.replaceChildren();
      const head = document.createElement('div');
      head.className = 'tip-date';
      head.textContent = `${r.date.slice(0, 4)}/${shortDate(r.date)}`;
      tip.appendChild(head);
      for (const s of c.series) {
        const row = document.createElement('div');
        row.className = 'tr';
        const key = document.createElement('i');
        key.style.background = s.color;
        const val = document.createElement('b');
        val.textContent = fPrice(r[s.key]);
        const lab = document.createElement('span');
        lab.textContent = s.label;
        row.append(key, val, lab);
        tip.appendChild(row);
      }
      tip.hidden = false;
      const rect = svg.getBoundingClientRect();
      const left = (px / c.W) * rect.width;
      tip.style.left = `${clamp(left, 70, rect.width - 70)}px`;
      tip.style.top = `${(c.M.t / c.H) * rect.height}px`;
    };
    const hide = () => { g.style.display = 'none'; tip.hidden = true; };
    const fromEvent = e => {
      const rect = svg.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * c.W;
      const pw = c.W - c.M.l - c.M.r;
      show(Math.round(((sx - c.M.l) / pw) * (c.n - 1)));
    };
    svg.addEventListener('pointermove', fromEvent);
    svg.addEventListener('pointerdown', fromEvent);
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('focus', () => show(idx));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
    });
  });
}

/** 小走勢線（指數卡片用） */
export function sparkline(values, { w = 200, h = 36 } = {}) {
  const v = values.filter(isNum);
  if (v.length < 2) return '';
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const pts = v.map((val, i) => [(i / (v.length - 1)) * (w - 6) + 3, h - 3 - ((val - lo) / (hi - lo || 1)) * (h - 6)]);
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <polyline points="${pts.map(p => p.map(q => q.toFixed(1)).join(',')).join(' ')}" fill="none" style="stroke:var(--spark)" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" style="fill:var(--s1)"/></svg>`;
}

/**
 * 百分比堆疊橫條（資產配置）。parts: [{ label, value, color, text }]
 * 片段之間留 2px 空隙；圖例放下面
 */
export function stackBar(parts) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  if (!total) return '<p class="muted small">還沒有資料</p>';
  const segs = parts.filter(p => p.value > 0)
    .map(p => `<span style="flex:${p.value / total};background:${p.color}" title="${esc(p.label)} ${(p.value / total * 100).toFixed(0)}%"></span>`).join('');
  const legend = parts.map(p => `<div><i style="background:${p.color}"></i><span>${esc(p.label)}</span><b>${(p.value / total * 100).toFixed(0)}%</b><span class="muted">${esc(p.text || '')}</span></div>`).join('');
  return `<div class="stack" role="img" aria-label="${esc(parts.map(p => `${p.label} ${(p.value / total * 100).toFixed(0)}%`).join('，'))}">${segs}</div><div class="stack-legend">${legend}</div>`;
}

/**
 * 量表：value / max 的填色條，cap 是上限刻度；status 決定填色（good / warn / serious / bad）
 * ticks: [{ at, label }] 在下方標刻度
 */
export function meter(value, { max = 1, cap = null, status = 'good', ticks = [], label = '' } = {}) {
  const w = v => `${clamp((v / max) * 100, 0, 100)}%`;
  const capMark = isNum(cap) ? `<span class="cap" style="left:${w(cap)}"></span>` : '';
  const tickHtml = ticks.length
    ? `<div class="meter-ticks">${ticks.map(t => `<span style="left:${w(t.at)}">${esc(t.label)}</span>`).join('')}</div>`
    : '';
  return `<div class="meter" role="img" aria-label="${esc(label)}"><span class="fill st-${status}" style="width:${w(isNum(value) ? value : 0)}"></span>${capMark}</div>${tickHtml}`;
}

/**
 * 橫向長條（曝險）：rows: [{ label, value, text, over }]，cap 是上限（同單位）
 * 超過上限的長條用警示色，並在名稱前加 ⚠
 */
export function hbars(rows, { cap = null, capLabel = '' } = {}) {
  if (!rows.length) return '<p class="muted small">還沒有資料</p>';
  const max = Math.max(...rows.map(r => r.value), isNum(cap) ? cap : 0) * 1.08 || 1;
  const w = v => `${clamp((v / max) * 100, 0, 100)}%`;
  return `<div class="hbars">${rows.map(r => `
    <div class="hb-row">
      <div class="hb-label">${r.over ? '⚠ ' : ''}${esc(r.label)}</div>
      <div class="hb-track">
        <span class="hb-bar ${r.over ? 'st-bad' : ''}" style="width:${w(r.value)}"></span>
        ${isNum(cap) ? `<span class="cap" style="left:${w(cap)}"></span>` : ''}
        <span class="hb-val" style="left:${w(r.value)}">${esc(r.text)}</span>
      </div>
    </div>`).join('')}
    ${isNum(cap) ? `<div class="hb-row"><div></div><div class="hb-track cap-legend"><span class="cap-label" style="left:${w(cap)}">${esc(capLabel)}</span></div></div>` : ''}
  </div>`;
}
