// 設定：朗讀、語音辨識、資料備份（匯出／匯入／清除）
import { getState, save, exportData, validateImport, importData, clearAll } from '../store.js';
import { todayStr, esc } from '../util.js';
import { englishVoices, speak, sttSupported, ttsSupported, listen } from '../speech.js';
import { confirmBox, toast, celebrate, refreshTopbar } from '../ui.js';
import { checkBadges } from '../record.js';
import { totals } from '../stats.js';
import { levelInfo } from '../game.js';

const SAMPLE = 'Security is everyone\'s responsibility in this company.';

/** ISO 時間 → 台灣當地時間「2026/10/22 08:02」 */
function fmtLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '不明';
  return d.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function render(el) {
  const st = getState();
  const s = st.settings;
  const lastExport = s.lastExport ? fmtLocal(s.lastExport) : '還沒備份過';

  el.innerHTML = `
    <div class="page-head"><h1>⚙️ 設定</h1></div>

    <section class="card">
      <h2>🔊 朗讀</h2>
      ${ttsSupported() ? '' : '<p class="note warn">這個瀏覽器不支援朗讀。</p>'}
      <div class="switch-row">
        <span>朗讀速度</span>
        <div class="segmented" role="group" aria-label="朗讀速度">
          <button type="button" data-rate="0.8" class="${s.rate === 0.8 ? 'on' : ''}">0.8x</button>
          <button type="button" data-rate="1" class="${s.rate !== 0.8 ? 'on' : ''}">1.0x</button>
        </div>
      </div>
      <label class="field"><span>語音</span>
        <select name="voice"><option value="">自動選擇（建議）</option></select>
      </label>
      <div class="switch-row">
        <label for="autoSpeak">單字題自動朗讀</label>
        <input type="checkbox" id="autoSpeak" ${s.autoSpeak ? 'checked' : ''}>
      </div>
      <button type="button" class="btn" data-act="test-voice">試聽</button>
    </section>

    <section class="card">
      <h2>🎤 語音辨識</h2>
      <p>${sttSupported()
        ? '✅ 這個瀏覽器支援語音辨識。使用時需要網路，第一次會詢問麥克風權限。'
        : '⚠️ 這個瀏覽器不支援語音辨識，跟讀會使用自評模式。建議用電腦版 Chrome。'}</p>
      <div class="switch-row">
        <label for="selfRate">改用自評模式（不用麥克風）</label>
        <input type="checkbox" id="selfRate" ${s.selfRate ? 'checked' : ''}>
      </div>
      ${sttSupported() ? `
        <button type="button" class="btn" data-act="test-mic">測試麥克風</button>
        <div class="heard hidden" data-mic-out></div>` : ''}
    </section>

    <section class="card">
      <h2>💾 資料備份</h2>
      <p class="muted small">你的進度、故事庫、角色都存在這台裝置的瀏覽器裡。清除瀏覽紀錄或換裝置時會不見，請定期匯出備份檔。</p>
      <p>上次備份：<b>${lastExport}</b></p>
      <div class="actions">
        <button type="button" class="btn primary" data-act="export">⬇ 匯出備份</button>
        <label class="btn" style="position:relative">⬆ 匯入備份
          <input type="file" accept=".json,application/json" data-act="import" style="position:absolute;inset:0;opacity:0;cursor:pointer">
        </label>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
      <button type="button" class="btn danger" data-act="clear">清除全部資料</button>
    </section>

    <section class="card">
      <h2>ℹ️ 關於</h2>
      <p class="small muted">英語特訓 · 第一階段<br>
        已作答 ${totals(st.daily).answered} 題 · ${st.stories.length} 個故事 · ${st.player.xp} XP<br>
        <a href="tests/tests.html">開啟自動檢查頁</a>（確認複習規則與比對功能是否正常）</p>
    </section>`;

  // 朗讀
  el.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => {
    s.rate = Number(b.dataset.rate);
    save();
    el.querySelectorAll('[data-rate]').forEach(x => x.classList.toggle('on', x === b));
    speak(SAMPLE);
  }));
  const select = el.querySelector('[name="voice"]');
  englishVoices().then(list => {
    select.innerHTML = '<option value="">自動選擇（建議）</option>' + list
      .map(v => `<option value="${esc(v.name)}" ${v.name === s.voice ? 'selected' : ''}>${esc(v.name)}（${esc(v.lang)}${v.localService ? '，離線可用' : ''}）</option>`)
      .join('');
  });
  select.addEventListener('change', () => {
    s.voice = select.value;
    save();
    speak(SAMPLE);
  });
  el.querySelector('#autoSpeak').addEventListener('change', e => {
    s.autoSpeak = e.target.checked;
    save();
  });
  el.querySelector('[data-act="test-voice"]').addEventListener('click', () => speak(SAMPLE));

  // 語音辨識
  el.querySelector('#selfRate').addEventListener('change', e => {
    s.selfRate = e.target.checked;
    save();
  });
  const micBtn = el.querySelector('[data-act="test-mic"]');
  micBtn?.addEventListener('click', async () => {
    const out = el.querySelector('[data-mic-out]');
    out.classList.remove('hidden');
    out.textContent = '🎤 請說一句英文，例如：Hello, my name is ...';
    micBtn.disabled = true;
    try {
      const l = listen({ onUpdate: t => { out.textContent = `🎤 ${t}`; } });
      const res = await l.promise;
      out.textContent = res.transcript ? `✅ 辨識結果：${res.transcript}` : '沒有聽到聲音，請再試一次。';
    } catch (e) {
      out.textContent = `⚠️ ${e.message}`;
    } finally {
      micBtn.disabled = false;
    }
  });

  // 匯出
  el.querySelector('[data-act="export"]').addEventListener('click', () => {
    s.lastExport = new Date().toISOString();
    const badges = checkBadges();
    save();
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `english-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('已匯出備份檔，請把它存到安全的地方。');
    celebrate({ badges });
    render(el);
  });

  // 匯入
  el.querySelector('[data-act="import"]').addEventListener('change', async e => {
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
    const v = validateImport(obj);
    if (!v.ok) {
      toast(`⚠️ ${v.error}`);
      return;
    }
    const d = v.data;
    const summary = `
      備份時間：${esc(fmtLocal(obj.exportedAt))}<br>
      題目進度 ${Object.keys(d.progress || {}).length} 筆、故事 ${(d.stories || []).length} 個、
      ${(d.player && d.player.xp) || 0} XP<br><br>
      <b>匯入會覆蓋目前這台裝置上的所有資料。</b>`;
    const ok = await confirmBox(summary, { title: '匯入備份', ok: '覆蓋並匯入', danger: true });
    if (!ok) return;
    importData(obj);
    refreshTopbar();
    toast(`✅ 匯入完成：Lv ${levelInfo(getState().player.xp).level}`);
    location.hash = '#/';
  });

  // 清除
  el.querySelector('[data-act="clear"]').addEventListener('click', async () => {
    const ok1 = await confirmBox('清除後，所有進度、故事庫、經驗值與徽章都會刪除。', { title: '清除全部資料', ok: '繼續', danger: true });
    if (!ok1) return;
    const ok2 = await confirmBox('真的要清除嗎？如果還沒匯出備份，資料將無法復原。', { title: '最後確認', ok: '確定清除', danger: true });
    if (!ok2) return;
    clearAll();
    refreshTopbar();
    toast('已清除全部資料');
    location.hash = '#/';
  });
  return null;
}
