// 設定：規則數字、匯率、資料備份（匯出／匯入／清除）
import { getState, save, defaultRules, exportData, validateImport, importData, clearAll } from '../store.js';
import { getMarket, fxOf } from '../market.js';
import { todayStr, esc, isNum } from '../util.js';
import { pageHead, chip, readValue, confirmBox, toast, changed } from '../ui.js';

const GROUPS = [
  ['合約', [
    ['perTradePct', '每筆合約最多虧', '% 合約帳戶', '停損觸發時，最多虧合約帳戶的幾 %。常見 1～2%'],
    ['maxLev', '槓桿上限', '倍', '超過就不准開'],
    ['contractCapPct', '合約帳戶上限', '% 投資資產', '合約帳戶最多放多少錢'],
    ['riskBudgetPct', '總風險預算', '% 投資資產', '所有合約的停損同時觸發，最多虧多少'],
  ]],
  ['資產結構', [
    ['satCapPct', '衛星桶上限', '%', '個股、主題 ETF、合約帳戶加起來'],
    ['singleCapPct', '單一個股上限', '%', '股票市值＋合約持倉價值'],
    ['efMonths', '預備金目標', '個月生活費', '不夠時，每月定投先撥一半存預備金'],
    ['coreUsPct', '核心桶美股比例', '%', '其餘是台股'],
  ]],
  ['定投', [
    ['fear', '極度恐懼門檻', '指數低於', 'CNN 恐懼貪婪指數'],
    ['greed', '極度貪婪門檻', '指數高於等於', ''],
    ['fearMult', '極度恐懼時定投', '倍', ''],
    ['greedMult', '極度貪婪時定投', '倍', ''],
  ]],
  ['下單前', [
    ['chasePct', '追高門檻', '% 高於 60 日線', '進場價比 60 日線高超過這個就算追高'],
    ['minRR', '最低盈虧比', '', '預期賺的 ÷ 可能賠的'],
    ['coolHours', '冷靜期', '小時', '因為別人推薦才想買，要先等多久'],
    ['opensPerDay', '每天打開上限', '次', '越常看盤越容易衝動'],
  ]],
];

/** ISO 時間 → 台灣當地時間「2026/10/22 08:02」 */
function fmtLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '不明';
  return d.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function ruleInput(R, [k, lab, unit, hint]) {
  return `<label class="field"><span>${esc(lab)}${unit ? ` <small class="muted">${esc(unit)}</small>` : ''}</span>
    <input type="number" inputmode="decimal" step="any" data-rule="${k}" value="${R[k]}">
    ${hint ? `<small class="muted">${esc(hint)}</small>` : ''}</label>`;
}

export function render(el) {
  const s = getState();
  const R = s.rules;
  const fx = fxOf(s, getMarket());
  const lastExport = s.settings.lastExport ? fmtLocal(s.settings.lastExport) : '還沒備份過';

  el.innerHTML = `<div class="view">
    ${pageHead('設定')}

    <section class="card">
      <div class="card-head"><h2>規則</h2>${R.confirmed ? chip('good', '已確認') : chip('warn', '範例數字')}</div>
      <p class="small muted">這些數字決定 App 什麼時候說「可以」、什麼時候說「不行」。改好後按「確認規則」。<b>規則要在冷靜的時候定，不要在想下單的時候改。</b></p>
      ${GROUPS.map(([g, fields]) => `
        <h3 class="group-title">${esc(g)}</h3>
        <div class="form-grid">${fields.map(f => ruleInput(R, f)).join('')}</div>
        ${g === '定投' ? `<h3 class="group-title">大跌分段加碼</h3><div class="form-grid">${[0, 1, 2].map(i => `
          <label class="field"><span>第 ${i + 1} 段 <small class="muted">距一年高點跌 %</small></span>
            <input type="number" inputmode="decimal" step="any" data-tier="${i}" value="${R.dipTiers[i]}"></label>`).join('')}</div>` : ''}`).join('')}
      <div class="actions">
        <button type="button" class="btn ghost" data-act="reset-rules">恢復預設</button>
        <button type="button" class="btn primary" data-act="confirm">確認規則</button>
      </div>
    </section>

    <section class="card">
      <h2>匯率</h2>
      <p>目前用 <b>1 美元 = ${fx.v.toFixed(2)} 台幣</b> <span class="muted small">（${fx.src}${fx.date ? ` · ${fx.date}` : ''}）</span></p>
      <label class="field"><span>手動指定 <small class="muted">空白＝用每天自動抓的</small></span>
        <input type="number" inputmode="decimal" step="any" data-fx value="${isNum(s.settings.fx) ? s.settings.fx : ''}"></label>
    </section>

    <section class="card">
      <h2>💾 資料備份</h2>
      <p class="muted small">持倉、規則、日誌都存在這台裝置的瀏覽器裡。清除瀏覽紀錄或換裝置時會不見，請定期匯出備份檔。手機和電腦的資料是分開的兩份，要靠匯出／匯入搬移。</p>
      <p>上次備份：<b>${lastExport}</b></p>
      <div class="actions">
        <button type="button" class="btn primary" data-act="export">⬇ 匯出備份</button>
        <label class="btn" style="position:relative">⬆ 匯入備份
          <input type="file" accept=".json,application/json" data-act="import" style="position:absolute;inset:0;opacity:0;cursor:pointer">
        </label>
      </div>
      <hr class="sep">
      <button type="button" class="btn danger" data-act="clear">清除全部資料</button>
    </section>

    <section class="card">
      <h2>ℹ️ 關於</h2>
      <p class="small muted">投資儀表板 · 第一版<br>
        這是幫你守紀律的工具，不是投資建議；數字和規則請依自己的狀況決定。<br>
        <a href="tests/tests.html">開啟自動檢查頁</a>（確認計算規則是否正常）</p>
    </section>
  </div>`;

  const v = el.firstElementChild;
  v.querySelectorAll('[data-rule]').forEach(inp => inp.addEventListener('change', () => {
    const val = readValue(inp);
    if (!isNum(val) || val < 0) {
      toast('請填 0 以上的數字');
      inp.value = R[inp.dataset.rule];
      return;
    }
    R[inp.dataset.rule] = val;
    R.confirmed = false;
    save();
    changed();
    v.querySelector('.card-head .chip').outerHTML = chip('warn', '範例數字');
  }));
  v.querySelectorAll('[data-tier]').forEach(inp => inp.addEventListener('change', () => {
    const val = readValue(inp);
    const i = Number(inp.dataset.tier);
    if (!isNum(val) || val <= 0 || val >= 100) {
      toast('請填 1～99 的數字');
      inp.value = R.dipTiers[i];
      return;
    }
    R.dipTiers[i] = val;
    R.dipTiers.sort((a, b) => a - b);
    R.confirmed = false;
    save();
    changed();
    render(el);
  }));
  v.querySelector('[data-act="confirm"]').addEventListener('click', () => {
    R.confirmed = true;
    save();
    changed();
    toast('✓ 規則已確認。之後想改，等冷靜的時候再來。');
    render(el);
  });
  v.querySelector('[data-act="reset-rules"]').addEventListener('click', async () => {
    const ok = await confirmBox('把所有規則改回預設的範例數字？', { ok: '恢復預設' });
    if (!ok) return;
    s.rules = defaultRules();
    save();
    changed();
    render(el);
  });
  v.querySelector('[data-fx]').addEventListener('change', e => {
    const val = readValue(e.target);
    s.settings.fx = isNum(val) && val > 0 ? val : null;
    save();
    changed();
    render(el);
  });

  // 匯出
  v.querySelector('[data-act="export"]').addEventListener('click', () => {
    s.settings.lastExport = new Date().toISOString();
    save();
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invest-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('已匯出備份檔。裡面有你的財務數字，請存在安全的地方，不要放進專案資料夾。', { ms: 4500 });
    render(el);
  });

  // 匯入
  v.querySelector('[data-act="import"]').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let obj;
    try {
      obj = JSON.parse(await file.text());
    } catch {
      toast('⚠️ 這個檔案不是有效的 JSON。');
      return;
    }
    const chk = validateImport(obj);
    if (!chk.ok) {
      toast(`⚠️ ${chk.error}`);
      return;
    }
    const d = chk.data;
    const summary = `
      備份時間：${esc(fmtLocal(obj.exportedAt))}<br>
      股票 ${(d.holdings || []).length} 筆、合約 ${(d.contracts || []).length} 張、日誌 ${(d.journal || []).length} 筆<br><br>
      <b>匯入會覆蓋目前這台裝置上的所有資料。</b>`;
    const ok = await confirmBox(summary, { title: '匯入備份', ok: '覆蓋並匯入', danger: true });
    if (!ok) return;
    importData(obj);
    changed();
    toast('✅ 匯入完成');
    location.hash = '#/';
  });

  // 清除
  v.querySelector('[data-act="clear"]').addEventListener('click', async () => {
    const ok1 = await confirmBox('清除後，持倉、規則、日誌都會刪除。', { title: '清除全部資料', ok: '繼續', danger: true });
    if (!ok1) return;
    const ok2 = await confirmBox('真的要清除嗎？如果還沒匯出備份，資料將無法復原。', { title: '最後確認', ok: '確定清除', danger: true });
    if (!ok2) return;
    clearAll();
    changed();
    toast('已清除全部資料');
    location.hash = '#/';
  });
}
