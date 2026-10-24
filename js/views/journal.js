// 交易日誌：下單前寫理由和「什麼情況代表我錯了」，事後記結果，統計哪種來源、哪種情緒最常賠錢
import { getState, save } from '../store.js';
import { SOURCES, MOODS, ACTIONS, OUTCOMES, label, statsBy } from '../journal.js';
import { todayStr, uid, esc, twd, pct, isNum, shortDate } from '../util.js';
import { pageHead, chip, numField, textField, selectField, readValue, modal, confirmBox, toast, changed, upDown } from '../ui.js';

let draft = null;

function emptyDraft() {
  return { date: todayStr(), sym: '', action: 'buy', lev: null, amount: null, source: 'self', mood: 'calm', reason: '', wrongIf: '' };
}

/** 從「下單前」帶資料過來 */
export function prefillJournal(obj) {
  draft = { ...emptyDraft(), ...obj };
}

function statsTable(rows) {
  return `<div class="table-scroll"><table class="data">
    <thead><tr><th></th><th>筆數</th><th>已結算</th><th>勝率</th><th>合計損益</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${r.n}</td><td>${r.closed}</td><td>${pct(r.winRate, 0)}</td><td>${r.closed ? upDown(r.pnl, twd(r.pnl)) : '—'}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function insight(bySource, byMood) {
  const worst = [...bySource, ...byMood].filter(r => r.closed >= 2 && r.pnl < 0).sort((a, b) => a.pnl - b.pnl)[0];
  if (!worst) return '';
  return `<p class="note warn">「${esc(worst.label)}」的 ${worst.closed} 筆，合計 ${twd(worst.pnl)}，勝率 ${pct(worst.winRate, 0)}。下次出現這種狀況，先停下來。</p>`;
}

function entryRow(j) {
  const res = j.result
    ? `<span class="chip">${esc(label(OUTCOMES, j.result.outcome))}</span> ${isNum(j.result.pnl) ? upDown(j.result.pnl, twd(j.result.pnl)) : ''}`
    : `<button type="button" class="btn sm" data-res="${j.id}">記結果</button>`;
  return `<li class="list-item">
    <div class="li-main">
      <div class="li-title">${esc(shortDate(j.date))} · ${esc(j.sym || '—')} · ${esc(label(ACTIONS, j.action))}${isNum(j.lev) && j.lev > 1 ? ` ${j.lev} 倍` : ''}${isNum(j.amount) ? ` · ${twd(j.amount)}` : ''}</div>
      <div class="row" style="margin:4px 0">${chip('info', label(SOURCES, j.source))}${chip(['calm'].includes(j.mood) ? 'good' : 'warn', label(MOODS, j.mood))}</div>
      ${j.reason ? `<div class="li-sub">理由：${esc(j.reason)}</div>` : ''}
      ${j.wrongIf ? `<div class="li-sub">什麼情況代表錯了：${esc(j.wrongIf)}</div>` : ''}
      ${j.result?.note ? `<div class="li-sub">檢討：${esc(j.result.note)}</div>` : ''}
    </div>
    <div class="li-side">${res}<button type="button" class="btn ghost sm" data-jdel="${j.id}">刪除</button></div>
  </li>`;
}

export function render(el) {
  const s = getState();
  if (!draft) draft = emptyDraft();
  const d = draft;
  const bySource = statsBy(s.journal, 'source', SOURCES);
  const byMood = statsBy(s.journal, 'mood', MOODS);
  const closed = s.journal.filter(j => j.result).length;

  el.innerHTML = `<div class="view">
    ${pageHead('交易日誌', `今天第 ${s.opens.n} 次打開 App（上限 ${s.rules.opensPerDay} 次）。越常看盤，越容易衝動。`)}
    <div class="grid-2 wide">
      <section class="card">
        <h2>新增紀錄</h2>
        <p class="small muted">下單前寫。寫不出「什麼情況代表我錯了」，這筆就先不要做。</p>
        <form data-jform class="form-grid">
          <label class="field"><span>日期</span><input type="date" name="date" value="${esc(d.date)}" required></label>
          ${textField('標的', 'sym', d.sym, { placeholder: '例如 NVDA' })}
          ${selectField('動作', 'action', d.action, ACTIONS)}
          ${numField('槓桿', 'lev', d.lev, { suffix: '倍', placeholder: '股票填 1' })}
          ${numField('金額', 'amount', d.amount, { suffix: '台幣', hint: '合約填保證金' })}
          ${selectField('想法從哪來', 'source', d.source, SOURCES)}
          ${selectField('當下情緒', 'mood', d.mood, MOODS)}
          <label class="field span-2"><span>為什麼要做這筆</span><textarea name="reason" rows="2" required>${esc(d.reason)}</textarea></label>
          <label class="field span-2"><span>什麼情況代表我錯了</span><textarea name="wrongIf" rows="2" required placeholder="例如：跌破 60 日線、財報不如預期">${esc(d.wrongIf)}</textarea></label>
          <div class="span-2"><button type="submit" class="btn primary">儲存</button></div>
        </form>
      </section>

      <section class="card">
        <h2>哪種狀況最常讓你賠錢</h2>
        ${closed ? `
          ${insight(bySource, byMood)}
          <h3>依想法來源</h3>${statsTable(bySource)}
          <h3 style="margin-top:14px">依當下情緒</h3>${statsTable(byMood)}`
        : '<p class="muted">記下結果之後，這裡會統計「跟 KOL 進場」「想翻本時進場」的勝率和合計損益。每月最後一天回來看一次。</p>'}
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2>紀錄</h2><span class="small muted">${s.journal.length} 筆</span></div>
      ${s.journal.length ? `<ul class="list">${s.journal.slice(0, 50).map(entryRow).join('')}</ul>` : '<p class="muted">還沒有紀錄。</p>'}
    </section>
  </div>`;

  const v = el.firstElementChild;
  const form = v.querySelector('[data-jform]');
  form.addEventListener('input', e => {
    const t = e.target;
    if (t.name) d[t.name] = t.name === 'sym' ? readValue(t).toUpperCase() : readValue(t);
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!d.reason || !d.wrongIf) {
      toast('理由和「什麼情況代表我錯了」都要寫');
      return;
    }
    s.journal.unshift({ id: uid(), ...d, result: null });
    save();
    changed();
    draft = emptyDraft();
    toast('已儲存。記得照停損執行。');
    render(el);
  });

  v.querySelectorAll('[data-res]').forEach(b => b.addEventListener('click', async () => {
    const j = s.journal.find(x => x.id === b.dataset.res);
    if (!j) return;
    const tmp = { outcome: 'loss', pnl: null, note: '' };
    const pr = modal({
      title: `記結果：${j.sym}`,
      body: `<div class="form-grid">
        ${selectField('結果', 'outcome', tmp.outcome, OUTCOMES)}
        ${numField('損益', 'pnl', null, { suffix: '台幣', hint: '賠錢填負數' })}
        <label class="field span-2"><span>檢討（照規則做了嗎？）</span><textarea name="note" rows="2"></textarea></label>
      </div>`,
      actions: [{ label: '取消', value: false, kind: 'ghost' }, { label: '儲存', value: true, kind: 'primary' }],
      dismissValue: false,
    });
    document.querySelector('.modal-overlay .modal-body').addEventListener('input', e => {
      if (e.target.name) tmp[e.target.name] = readValue(e.target);
    });
    if (!(await pr)) return;
    let pnl = tmp.pnl;
    if (isNum(pnl) && tmp.outcome === 'loss' && pnl > 0) pnl = -pnl;
    j.result = { outcome: tmp.outcome, pnl, note: tmp.note, date: todayStr() };
    save();
    changed();
    render(el);
  }));
  v.querySelectorAll('[data-jdel]').forEach(b => b.addEventListener('click', async () => {
    const ok = await confirmBox('刪除這筆紀錄？', { ok: '刪除', danger: true });
    if (!ok) return;
    s.journal = s.journal.filter(x => x.id !== b.dataset.jdel);
    save();
    changed();
    render(el);
  }));
}
