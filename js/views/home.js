// 首頁：角色、今日任務、連續天數、本週時間、正確率趨勢
import { getState, save } from '../store.js';
import { todayStr, toDateStr, esc, daysBetween } from '../util.js';
import { allItems, findItem, TYPE_LABEL, TYPE_ICON } from '../content.js';
import { buildPlan, TYPES } from '../planner.js';
import { streak, weekSeconds, trend, totals } from '../stats.js';
import { levelInfo } from '../game.js';
import { avatarSVG } from '../avatar.js';
import { lineChartHtml, bindLineChart, tableHtml } from '../chart.js';
import { confirmBox } from '../ui.js';
import { startPractice } from './practice.js';

const SERIES = [
  { key: 'vocab', label: '單字', color: 'var(--c-vocab)' },
  { key: 'grammar', label: '文法', color: 'var(--c-grammar)' },
  { key: 'shadowing', label: '跟讀', color: 'var(--c-shadow)' },
];

/** 取得今天的任務；當天第一次打開時才排，之後重新整理都不會變 */
export function ensurePlan(force = false) {
  const st = getState();
  const today = todayStr();
  if (force || !st.todayPlan || st.todayPlan.date !== today) {
    const round = force && st.todayPlan?.date === today ? (st.todayPlan.round || 1) + 1 : 1;
    st.todayPlan = { ...buildPlan({ items: allItems(), progress: st.progress, daily: st.daily, today }), round };
    save();
  }
  return st.todayPlan;
}

function planRows(plan) {
  return TYPES.map(t => {
    const list = plan.items.filter(x => x.type === t && findItem(x.id));
    const done = list.filter(x => plan.done[x.id]).length;
    return { type: t, total: list.length, done };
  }).filter(r => r.total > 0);
}

function reasonNotes(plan) {
  const notes = [];
  if (plan.weakest) {
    const a = plan.accuracy[plan.weakest];
    const what = plan.weakest === 'shadowing' ? '平均分數' : '正確率';
    notes.push(`📉 最近 7 天「${TYPE_LABEL[plan.weakest]}」的${what}最低（${a.pct}%），今天多排幾題。`);
  }
  const due = TYPES.filter(t => plan.due[t] > 0).map(t => `${TYPE_LABEL[t]} ${plan.due[t]}`);
  const overflow = TYPES.some(t => plan.due[t] > plan.quotas[t]);
  if (due.length) {
    notes.push(`🔁 今天到期要複習：${due.join('、')} 題，${overflow ? '已排到上限，其餘順延到明天' : '已全部排入'}。`);
  }
  return notes;
}

export function render(el) {
  const st = getState();
  const today = todayStr();
  const plan = ensurePlan();
  const rows = planRows(plan);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const done = rows.reduce((s, r) => s + r.done, 0);
  const remaining = plan.items.filter(x => !plan.done[x.id] && findItem(x.id)).map(x => x.id);
  const info = levelInfo(st.player.xp);
  const tdy = st.daily[today];
  const trendRows = trend(st.daily, today, 14);
  const hasTrend = trendRows.some(r => r.vocab !== null || r.grammar !== null || r.shadowing !== null);
  const anyData = totals(st.daily).answered > 0 || st.stories.length > 0;
  const lastExport = st.settings.lastExport;
  const sinceBackup = lastExport ? daysBetween(toDateStr(new Date(lastExport)), today) : null;

  let button;
  if (total === 0) {
    button = '<p class="muted">今天沒有可練習的題目了。可以到「多益」或「面試」頁自由練習。</p>';
  } else if (remaining.length === 0) {
    button = `
      <div class="note ok">✅ 今日任務完成！${plan.round > 1 ? `（第 ${plan.round} 輪）` : ''}</div>
      <div class="actions"><button type="button" class="btn big" data-act="again">再來一輪</button></div>`;
  } else {
    button = `
      <div class="actions">
        <button type="button" class="btn primary big block" data-act="start">
          ${done === 0 ? '▶ 開始今日任務' : `▶ 繼續（還剩 ${remaining.length} 題）`}
        </button>
      </div>`;
  }

  el.innerHTML = `
    <a class="card mini-hero" href="#/profile">
      ${avatarSVG(info.stage, { label: info.rank.title })}
      <div class="mh-body">
        <div class="mh-title">${esc(info.rank.title)} <span class="muted small">Lv ${info.level}</span></div>
        <div class="bar xp" style="margin:6px 0 2px"><span style="width:${info.pct}%"></span></div>
        <div class="muted small">${info.cur} / ${info.need} XP 升到 Lv ${info.level + 1}</div>
      </div>
    </a>

    <section class="card hero-task">
      <div class="card-head">
        <h2>📋 今日任務${plan.round > 1 ? ` <span class="chip">第 ${plan.round} 輪</span>` : ''}</h2>
        <span class="chip primary">約 ${plan.estMinutes} 分鐘</span>
      </div>
      <div class="task-rows">
        ${rows.map(r => `
          <div class="task-row ${r.done === r.total ? 'done' : ''}">
            <span class="ti">${TYPE_ICON[r.type]}</span>
            <div>
              <div class="tl">${TYPE_LABEL[r.type]}</div>
              <div class="bar ok"><span style="width:${Math.round((r.done / r.total) * 100)}%"></span></div>
            </div>
            <span class="tc">${r.done === r.total ? '✓ ' : ''}${r.done} / ${r.total}</span>
          </div>`).join('')}
      </div>
      ${reasonNotes(plan).map(n => `<p class="note">${n}</p>`).join('')}
      ${button}
    </section>

    ${anyData && (sinceBackup === null || sinceBackup >= 7) ? `
      <a class="note warn" style="display:block;text-decoration:none;margin:0 0 14px" href="#/settings">
        💾 ${sinceBackup === null ? '你還沒備份過資料' : `已經 ${sinceBackup} 天沒有備份`}，建議到「設定」匯出一份備份檔。→
      </a>` : ''}

    <div class="grid-3 stats" style="margin-bottom:14px">
      <div class="stat"><div class="sv">🔥 ${streak(st.daily, today)}</div><div class="sl">連續天數</div></div>
      <div class="stat"><div class="sv">${Math.round(weekSeconds(st.daily, today) / 60)}</div><div class="sl">本週分鐘</div></div>
      <div class="stat"><div class="sv">${tdy?.xp || 0}</div><div class="sl">今日 XP</div></div>
    </div>

    <section class="card">
      <div class="card-head"><h2>📈 最近 14 天正確率</h2></div>
      ${hasTrend ? `
        <div class="chart-legend">
          ${SERIES.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}
        </div>
        ${lineChartHtml(trendRows, SERIES)}
        <p class="muted small" style="margin-top:6px">跟讀為平均分數。點圖上任一天可看數值。</p>
        ${tableHtml(trendRows, SERIES)}`
        : '<p class="muted">開始練習後，這裡會顯示每天單字、文法、跟讀的正確率變化。</p>'}
    </section>`;

  el.querySelector('[data-act="start"]')?.addEventListener('click', () => {
    startPractice({ title: '今日任務', ids: remaining, fromPlan: true, back: '#/' });
  });
  el.querySelector('[data-act="again"]')?.addEventListener('click', async () => {
    const ok = await confirmBox('再排一輪新的練習？（今天到期與答錯的題目、還有新題目會優先排入；完成獎勵每天只有一次）', { ok: '排一輪' });
    if (!ok) return;
    const p = ensurePlan(true);
    if (!p.items.length) {
      render(el);
      return;
    }
    startPractice({ title: `今日任務（第 ${p.round} 輪）`, ids: p.items.map(x => x.id), fromPlan: true, back: '#/' });
  });
  const chart = el.querySelector('.chart-wrap');
  if (chart) bindLineChart(chart, trendRows, SERIES);
  return null;
}
