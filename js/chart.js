// 折線圖（正確率趨勢）：純 SVG，不用外部套件；滑鼠移上去或手指點一下會顯示當天數值
import { esc, shortDate } from './util.js';

const W = 640;
const H = 230;
const M = { l: 34, r: 64, t: 14, b: 28 };

/**
 * rows: [{ date, vocab, grammar, shadowing }]（null = 當天沒練）
 * series: [{ key, label, color }]
 */
export function lineChartHtml(rows, series) {
  const n = rows.length;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const x = i => M.l + (n === 1 ? pw / 2 : (i * pw) / (n - 1));
  const y = v => M.t + ph - (v / 100) * ph;

  let grid = '';
  for (const v of [0, 25, 50, 75, 100]) {
    grid += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" style="stroke:${v === 0 ? 'var(--axis)' : 'var(--grid)'}" stroke-width="1"/>`;
    if (v % 50 === 0) grid += `<text x="${M.l - 6}" y="${y(v) + 4}" text-anchor="end" style="fill:var(--muted)" font-size="11">${v}%</text>`;
  }
  let xLabels = '';
  rows.forEach((r, i) => {
    if ((n - 1 - i) % 3 === 0) {
      xLabels += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" style="fill:var(--muted)" font-size="11">${shortDate(r.date)}</text>`;
    }
  });

  let lines = '';
  let marks = '';
  const ends = [];
  for (const s of series) {
    let d = '';
    let pen = false;
    let lastIdx = -1;
    rows.forEach((r, i) => {
      const v = r[s.key];
      if (v === null || v === undefined) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
      lastIdx = i;
      marks += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" style="fill:${s.color};stroke:var(--surface)" stroke-width="2"/>`;
    });
    if (d) lines += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (lastIdx >= 0) ends.push({ s, x: x(lastIdx), y: y(rows[lastIdx][s.key]) });
  }
  // 線尾直接標名稱（避免重疊：至少相隔 13px）
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  }
  const labels = ends.map(e => `<text x="${e.x + 8}" y="${e.y + 4}" style="fill:var(--muted)" font-size="11">${esc(e.s.label)}</text>`).join('');

  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="最近 ${n} 天各項正確率折線圖">
        ${grid}${xLabels}
        <line class="cross hidden" x1="0" x2="0" y1="${M.t}" y2="${M.t + ph}" style="stroke:var(--muted)" stroke-width="1" stroke-dasharray="3 3"/>
        ${lines}${marks}${labels}
        <rect class="hit" x="${M.l - 10}" y="0" width="${pw + 20}" height="${H}" fill="transparent"/>
      </svg>
      <div class="chart-tip hidden"></div>
    </div>`;
}

/** 加上滑鼠／手指互動 */
export function bindLineChart(root, rows, series) {
  const svg = root.querySelector('svg');
  const hit = root.querySelector('.hit');
  const cross = root.querySelector('.cross');
  const tip = root.querySelector('.chart-tip');
  if (!svg || !hit) return;
  const n = rows.length;
  const pw = W - M.l - M.r;

  const show = evt => {
    const box = svg.getBoundingClientRect();
    const sx = ((evt.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((sx - M.l) / pw) * (n - 1))));
    const cx = M.l + (n === 1 ? pw / 2 : (i * pw) / (n - 1));
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.classList.remove('hidden');
    const r = rows[i];
    tip.innerHTML = `<b>${shortDate(r.date)}</b>${series.map(s => `
      <div class="tr"><i style="background:${s.color}"></i>${esc(s.label)}：${r[s.key] === null ? '沒練習' : `${r[s.key]}%`}</div>`).join('')}`;
    tip.classList.remove('hidden');
    const px = (cx / W) * box.width;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.max(half, Math.min(box.width - half, px))}px`;
    tip.style.top = `${(M.t / H) * box.height + 4}px`;
  };
  const hide = () => {
    cross.classList.add('hidden');
    tip.classList.add('hidden');
  };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);
}

/** 表格版（給不方便看圖的時候） */
export function tableHtml(rows, series) {
  return `
    <details class="table-view">
      <summary>以表格檢視</summary>
      <table class="data">
        <thead><tr><th>日期</th>${series.map(s => `<th>${esc(s.label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.slice().reverse().map(r => `
            <tr><td>${shortDate(r.date)}</td>${series.map(s => `<td>${r[s.key] === null ? '—' : `${r[s.key]}%`}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </details>`;
}
