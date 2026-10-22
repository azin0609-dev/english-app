// 角色面板：職稱、等級、能力雷達圖、晉升路線、成就徽章
import { getState } from '../store.js';
import { esc, todayStr, fmtDuration } from '../util.js';
import { allItems } from '../content.js';
import { levelInfo, abilities, RANKS, BADGES, XP, xpToReach } from '../game.js';
import { streak, totals } from '../stats.js';
import { avatarSVG } from '../avatar.js';

function radarSvg(values) {
  // values: [{ label, value(0~100) }]
  const cx = 150;
  const cy = 140;
  const R = 95;
  const n = values.length;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = r => values.map((_, i) => pt(i, r).map(v => v.toFixed(1)).join(',')).join(' ');
  let grid = '';
  for (const f of [0.25, 0.5, 0.75, 1]) {
    grid += `<polygon points="${poly(R * f)}" fill="none" style="stroke:var(--grid)" stroke-width="1"/>`;
  }
  const axes = values.map((_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" style="stroke:var(--grid)" stroke-width="1"/>`;
  }).join('');
  const shape = values.map((v, i) => pt(i, (R * Math.max(v.value, 2)) / 100).map(c => c.toFixed(1)).join(',')).join(' ');
  const dots = values.map((v, i) => {
    const [x, y] = pt(i, (R * Math.max(v.value, 2)) / 100);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" style="fill:var(--primary);stroke:var(--surface)" stroke-width="2"/>`;
  }).join('');
  const labels = values.map((v, i) => {
    const [x, y] = pt(i, R + 24);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" style="fill:var(--text)" font-size="13" font-weight="600">${esc(v.label)}</text>
      <text x="${x.toFixed(1)}" y="${(y + 15).toFixed(1)}" text-anchor="middle" style="fill:var(--muted)" font-size="12">${v.value}</text>`;
  }).join('');
  return `<svg viewBox="0 0 300 280" role="img" aria-label="能力雷達圖：${values.map(v => `${v.label} ${v.value}`).join('、')}">
    ${grid}${axes}
    <polygon points="${shape}" style="fill:var(--primary);stroke:var(--primary)" fill-opacity=".22" stroke-width="2"/>
    ${dots}${labels}
  </svg>`;
}

export function render(el) {
  const st = getState();
  const info = levelInfo(st.player.xp);
  const ab = abilities(allItems(), st.progress);
  const t = totals(st.daily);
  const earned = st.player.badges;
  const nextRankXp = info.nextRank ? xpToReach(info.nextRank.level) - st.player.xp : 0;

  el.innerHTML = `
    <section class="card hero-card">
      ${avatarSVG(info.stage, { label: info.rank.title })}
      <div class="rank-title">${esc(info.rank.title)}</div>
      <div class="rank-en">${esc(info.rank.en)}</div>
      <p class="lv-big">Lv ${info.level} · 共 ${st.player.xp.toLocaleString()} XP</p>
      <div class="bar xp" style="max-width:360px;margin:0 auto 6px"><span style="width:${info.pct}%"></span></div>
      <p class="muted small">再 ${info.need - info.cur} XP 升到 Lv ${info.level + 1}
        ${info.nextRank ? `· Lv ${info.nextRank.level} 晉升「${esc(info.nextRank.title)}」（還差 ${nextRankXp.toLocaleString()} XP）` : '· 已達最高職稱！'}</p>
    </section>

    <div class="grid-3 stats" style="margin-bottom:14px">
      <div class="stat"><div class="sv">${t.answered}</div><div class="sl">總作答</div></div>
      <div class="stat"><div class="sv">${t.days}</div><div class="sl">練習天數</div></div>
      <div class="stat"><div class="sv">🔥 ${streak(st.daily, todayStr())}</div><div class="sl">連續天數</div></div>
    </div>

    <section class="card radar">
      <div class="card-head"><h2>📊 能力值</h2><span class="muted small">滿分 100</span></div>
      ${radarSvg([
        { label: '字彙', value: ab.vocab },
        { label: '文法', value: ab.grammar },
        { label: '口說', value: ab.speaking },
      ])}
      <p class="muted small">能力值是各類題目的平均熟練度（Lv 0～5）換算成 0～100，只有真的記住、複習間隔拉長才會上升。第二階段會加入聽力與閱讀。</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>🪜 晉升路線</h2></div>
      <div class="ladder">
        ${RANKS.map((r, i) => `
          <div class="ladder-step ${info.stage === i ? 'current' : ''} ${info.level < r.level ? 'locked' : ''}">
            ${avatarSVG(i, { label: r.title })}
            <div>
              <div><b>${esc(r.title)}</b> <span class="muted small">Lv ${r.level}</span></div>
              <div class="muted small">${esc(r.en)}</div>
            </div>
            <span style="margin-left:auto">${info.level >= r.level ? (info.stage === i ? '⭐ 目前' : '✓') : '🔒'}</span>
          </div>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>🏅 成就徽章</h2><span class="muted small">${Object.keys(earned).length} / ${BADGES.length}</span></div>
      <div class="badges">
        ${BADGES.map(b => `
          <div class="badge ${earned[b.id] ? '' : 'locked'}" title="${esc(b.desc)}">
            <div class="bi">${b.icon}</div>
            <div class="bn">${esc(b.name)}</div>
            <div class="bd">${esc(b.desc)}</div>
          </div>`).join('')}
      </div>
    </section>

    <section class="card">
      <details>
        <summary><b>怎麼賺經驗值？</b></summary>
        <ul class="small" style="margin-top:8px">
          <li>單字、文法：答對 +${XP.right}，答錯 +${XP.wrong}（有練就有分）</li>
          <li>跟讀：≥ 85% +${XP.shadowHigh}，60～84% +${XP.shadowMid}，其他 +${XP.shadowLow}</li>
          <li>完成今日任務：+${XP.planBonus}（每天一次）</li>
          <li>連續練習 ${XP.streakDays} 天以上：每題經驗值 ×${XP.streakBonus}</li>
          <li>同一題同一天重複作答，只拿 ${XP.repeatRatio * 100}% 經驗值</li>
        </ul>
        <p class="muted small">累積練習時間：${fmtDuration(t.seconds)}</p>
      </details>
    </section>`;
  return null;
}
