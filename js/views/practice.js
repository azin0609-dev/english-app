// 練習流程：一題一題出（單字／文法／跟讀混合），答錯的題目在最後再出一次
import { esc, fmtDuration } from '../util.js';
import { findItem, TYPE_LABEL } from '../content.js';
import { recordAnswer, addActiveSeconds } from '../record.js';
import { celebrate, refreshTopbar } from '../ui.js';
import { stopSpeaking } from '../speech.js';
import * as vocabCard from '../cards/vocab-card.js';
import * as grammarCard from '../cards/grammar-card.js';
import * as shadowCard from '../cards/shadow-card.js';

const CARDS = { vocab: vocabCard, grammar: grammarCard, shadowing: shadowCard };
const IDLE_CAP_MS = 60000; // 兩次操作之間最多算 1 分鐘，避免離開座位也被計時

let pending = null;

/**
 * 開始一組練習。
 * ids: 題目 id；fromPlan: 是否為今日任務；back: 結束後回哪一頁
 */
export function startPractice({ title, ids, fromPlan = false, back = '#/' }) {
  pending = { title, ids, fromPlan, back };
  if (location.hash === '#/practice') window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = '#/practice';
}

export function render(el) {
  if (!pending) {
    location.replace('#/');
    return null;
  }
  const s = {
    ...pending,
    queue: pending.ids.map(id => ({ id, retry: false })),
    pos: 0,
    combo: 0,
    xp: 0,
    badges: [],
    byType: {
      vocab: { right: 0, total: 0 },
      grammar: { right: 0, total: 0 },
      shadowing: { sum: 0, count: 0 },
    },
    seconds: 0,
    retryCount: 0,
  };
  pending = null;

  // 練習時間：計算有在操作的時間
  let last = Date.now();
  let accMs = 0;
  const onActivity = () => {
    const now = Date.now();
    accMs += Math.min(now - last, IDLE_CAP_MS);
    last = now;
  };
  const flushTime = () => {
    onActivity();
    const sec = Math.round(accMs / 1000);
    accMs = 0;
    if (sec > 0) {
      s.seconds += sec;
      addActiveSeconds(sec);
    }
  };
  document.addEventListener('pointerdown', onActivity, true);
  document.addEventListener('keydown', onActivity, true);

  let cardCleanup = null;
  let finished = false;

  function showCard() {
    if (typeof cardCleanup === 'function') cardCleanup();
    cardCleanup = null;
    stopSpeaking();
    if (s.pos >= s.queue.length) return finish();

    const entry = s.queue[s.pos];
    const item = findItem(entry.id);
    if (!item) {
      s.pos++;
      return showCard();
    }
    const total = s.queue.length;
    el.innerHTML = `
      <div class="practice-top">
        <a href="${esc(s.back)}" class="icon-btn" aria-label="離開練習" title="離開（已作答的進度都已儲存）">✕</a>
        <div class="bar"><span style="width:${Math.round((s.pos / total) * 100)}%"></span></div>
        <span class="count">${s.pos + 1} / ${total}</span>
      </div>
      <p class="muted small" style="margin:-4px 0 10px">${esc(s.title)} · ${TYPE_LABEL[item.type]}${entry.retry ? ' · 再練一次（不計分）' : ''}</p>
      <div id="card-slot"></div>`;
    const slot = el.querySelector('#card-slot');
    let reported = false;
    const api = {
      index: s.pos,
      retry: entry.retry,
      /** 卡片作答後呼叫；回傳經驗值等資訊（再練一次的題目回傳 null） */
      report(result) {
        if (reported) return null;
        reported = true;
        onActivity();
        const good = item.type === 'shadowing' ? result.score >= 85 : result.correct;
        if (entry.retry) return null;

        if (item.type === 'shadowing') {
          s.byType.shadowing.sum += result.score;
          s.byType.shadowing.count++;
        } else {
          s.byType[item.type].total++;
          if (result.correct) s.byType[item.type].right++;
        }
        s.combo = good ? s.combo + 1 : 0;
        const info = recordAnswer(item, result, { fromPlan: s.fromPlan, combo: s.combo });
        s.xp += info.xp + info.bonus;
        s.badges.push(...info.badges);
        // 選擇題答錯：這一輪最後再出一次
        if (item.type !== 'shadowing' && !result.correct) {
          s.queue.push({ id: item.id, retry: true });
          s.retryCount++;
        }
        celebrate(info);
        refreshTopbar();
        return info;
      },
      next() {
        flushTime();
        s.pos++;
        showCard();
      },
    };
    cardCleanup = CARDS[item.type].mount(slot, item, api);
  }

  function finish() {
    finished = true;
    flushTime();
    const v = s.byType.vocab;
    const g = s.byType.grammar;
    const sh = s.byType.shadowing;
    const rows = [];
    if (v.total) rows.push(`<li>🔤 單字：答對 <b>${v.right} / ${v.total}</b></li>`);
    if (g.total) rows.push(`<li>✏️ 文法：答對 <b>${g.right} / ${g.total}</b></li>`);
    if (sh.count) rows.push(`<li>🗣️ 跟讀：平均 <b>${Math.round(sh.sum / sh.count)}%</b>（${sh.count} 句）</li>`);
    el.innerHTML = `
      <div class="card center">
        <div style="font-size:3rem;line-height:1.2">🎉</div>
        <h1>練習完成！</h1>
        <p class="muted">${esc(s.title)}</p>
        <ul class="list" style="text-align:left;max-width:320px;margin:10px auto">${rows.join('')}</ul>
        <p><span class="chip xp-chip" style="font-size:1rem">+${s.xp} XP</span>
           <span class="chip">⏱ ${fmtDuration(s.seconds)}</span></p>
        ${s.badges.length ? `<p>新徽章：${s.badges.map(b => `${b.icon} ${esc(b.name)}`).join('、')}</p>` : ''}
        <div class="actions">
          <a class="btn primary big" href="${esc(s.back)}">完成</a>
        </div>
      </div>`;
  }

  showCard();

  return () => {
    if (typeof cardCleanup === 'function') cardCleanup();
    if (!finished) flushTime();
    document.removeEventListener('pointerdown', onActivity, true);
    document.removeEventListener('keydown', onActivity, true);
  };
}
