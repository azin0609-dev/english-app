// 自動檢查：純邏輯測試，不會讀寫你的 localStorage 資料
import { applyResult, outcomeOf } from '../js/srs.js';
import { compareSpeech, bestMatch } from '../js/compare.js';
import { buildPlan, findWeakest, recentAccuracy, pickPractice } from '../js/planner.js';
import { streak, weekSeconds, emptyDay } from '../js/stats.js';
import { levelInfo, xpToReach, xpForAnswer } from '../js/game.js';
import { normalize, validateImport, exportData, defaultState } from '../js/store.js';
import { addDays, splitSentencesEn, splitSentencesZh, weekStart } from '../js/util.js';
import { storyItems } from '../js/content.js';

const groups = [];
let current = null;

function group(name, fn) {
  current = { name, tests: [] };
  groups.push(current);
  fn();
}
function test(name, fn) {
  try {
    fn();
    current.tests.push({ name, ok: true });
  } catch (e) {
    current.tests.push({ name, ok: false, msg: e.message });
  }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}預期 ${b}，實際 ${a}`);
}
function ok(cond, msg = '條件不成立') {
  if (!cond) throw new Error(msg);
}

const T = '2026-10-22'; // 星期四

// ===== 間隔複習 =====
group('間隔複習規則', () => {
  test('新題答對 → Lv1，1 天後', () => {
    const { rec } = applyResult(undefined, { correct: true }, T);
    eq([rec.level, rec.nextReview], [1, '2026-10-23']);
  });
  const chain = [[1, 2, '2026-10-25'], [2, 3, '2026-10-29'], [3, 4, '2026-11-05'], [4, 5, '2026-11-21'], [5, 5, '2026-11-21']];
  for (const [from, to, next] of chain) {
    test(`Lv${from} 到期答對 → Lv${to}，下次 ${next}`, () => {
      const { rec } = applyResult({ level: from, nextReview: T }, { correct: true }, T);
      eq([rec.level, rec.nextReview], [to, next]);
    });
  }
  test('答錯 → Lv0，當天再複習', () => {
    const { rec } = applyResult({ level: 3, nextReview: T }, { correct: false }, T);
    eq([rec.level, rec.nextReview], [0, T]);
  });
  test('跟讀 85% 升級、84% 不變、60% 不變、59% 歸零', () => {
    eq([85, 84, 60, 59].map(score => outcomeOf({ score })), ['up', 'keep', 'keep', 'reset']);
  });
  test('跟讀 70%（Lv2 到期）→ Lv2 不變，3 天後', () => {
    const { rec } = applyResult({ level: 2, nextReview: T }, { score: 70 }, T);
    eq([rec.level, rec.nextReview, rec.lastScore], [2, '2026-10-25', 70]);
  });
  test('提前練習答對 → 不升級、排程不變', () => {
    const { rec, early } = applyResult({ level: 2, nextReview: '2026-10-24' }, { correct: true }, T);
    eq([rec.level, rec.nextReview, early], [2, '2026-10-24', true]);
  });
  test('提前練習答錯 → 一樣歸零', () => {
    const { rec } = applyResult({ level: 4, nextReview: '2026-11-01' }, { correct: false }, T);
    eq([rec.level, rec.nextReview], [0, T]);
  });
  test('作答次數與對錯次數會累加', () => {
    let r = applyResult(undefined, { correct: true }, T).rec;
    r = applyResult(r, { correct: false }, '2026-10-23').rec;
    eq([r.attempts, r.right, r.wrong], [2, 1, 1]);
  });
});

// ===== 跟讀比對 =====
group('跟讀比對', () => {
  test('縮寫視為相同：I\'m = I am', () => {
    eq(compareSpeech("I'm a criminal investigator.", 'I am a criminal investigator').score, 100);
  });
  test('數字視為相同：10 = ten', () => {
    eq(compareSpeech('I have ten years of experience.', 'I have 10 years of experience').score, 100);
  });
  test('漏字標紅、正確率 = 說對字數 ÷ 原句字數', () => {
    const r = compareSpeech('I stay calm and focus on the facts.', 'I stay calm focus on facts');
    eq(r.score, 75);
    eq(r.words.filter(w => w.ok === false).map(w => w.text), ['and', 'the']);
  });
  test('多說的字不扣分', () => {
    eq(compareSpeech('Thank you.', 'um thank you very much').score, 100);
  });
  test('大小寫與標點不影響', () => {
    eq(compareSpeech("NVIDIA's technology is changing the world.", "nvidia's technology is changing the world").score, 100);
  });
  test('說錯的字會標紅', () => {
    const r = compareSpeech('We arrested the main suspects.', 'We arrested the man suspect');
    eq(r.words.map(w => w.ok), [true, true, true, false, false]);
  });
  test('沒說話 → 0 分', () => {
    eq(compareSpeech('Hello world.', '').score, 0);
  });
  test('多個辨識候選取最高分', () => {
    eq(bestMatch('I led the team.', ['I lead the team', 'I led the team']).score, 100);
  });
});

// ===== 今日任務 =====
function mockItems() {
  const vocab = [];
  for (let i = 1; i <= 60; i++) vocab.push({ id: `v${i}`, category: i <= 40 ? 'business' : 'security' });
  const grammar = Array.from({ length: 20 }, (_, i) => ({ id: `g${i + 1}` }));
  const shadowing = Array.from({ length: 20 }, (_, i) => ({ id: `s${i + 1}` }));
  return { vocab, grammar, shadowing };
}
function day(v, g, sh) {
  return { ...emptyDay(), vocab: { right: v[0], total: v[1] }, grammar: { right: g[0], total: g[1] }, shadowing: { scoreSum: sh[0], count: sh[1] } };
}

group('今日任務排程', () => {
  const items = mockItems();
  test('第一天（沒有資料）→ 單字 10、文法 5、跟讀 3，約 15 分鐘', () => {
    const p = buildPlan({ items, progress: {}, daily: {}, today: T });
    eq([p.quotas.vocab, p.quotas.grammar, p.quotas.shadowing, p.estMinutes], [10, 5, 3, 15]);
    eq(p.weakest, null);
  });
  test('新單字商務與企業安全輪流出現', () => {
    const p = buildPlan({ items, progress: {}, daily: {}, today: T });
    eq(p.items.filter(x => x.type === 'vocab').slice(0, 4).map(x => x.id), ['v1', 'v41', 'v2', 'v42']);
  });
  test('文法正確率最低（20%）→ 文法加到 8 題', () => {
    const daily = { [T]: day([9, 10], [2, 10], [450, 5]) };
    const p = buildPlan({ items, progress: {}, daily, today: T });
    eq([p.weakest, p.quotas.grammar, p.quotas.vocab], ['grammar', 8, 10]);
  });
  test('全部都 ≥ 85% → 沒有弱點', () => {
    const daily = { [T]: day([9, 10], [9, 10], [450, 5]) };
    eq(findWeakest(recentAccuracy(daily, T)), null);
  });
  test('作答少於 5 題的項目不列入比較', () => {
    const daily = { [T]: day([9, 10], [0, 3], [450, 5]) };
    eq(findWeakest(recentAccuracy(daily, T)), null);
  });
  test('超過 7 天前的紀錄不算', () => {
    const daily = { [addDays(T, -7)]: day([0, 10], [0, 10], [0, 5]) };
    eq(findWeakest(recentAccuracy(daily, T)), null);
  });
  test('跟讀平均分數最低 → 跟讀加到 5 句', () => {
    const daily = { [T]: day([9, 10], [8, 10], [250, 5]) };
    const p = buildPlan({ items, progress: {}, daily, today: T });
    eq([p.weakest, p.quotas.shadowing], ['shadowing', 5]);
  });
  test('到期 12 個單字 → 單字排 12 題，全部是待複習', () => {
    const progress = {};
    for (let i = 1; i <= 12; i++) progress[`v${i}`] = { level: 1, nextReview: T };
    const p = buildPlan({ items, progress, daily: {}, today: T });
    const v = p.items.filter(x => x.type === 'vocab').map(x => x.id);
    eq(v.length, 12);
    ok(v.every(id => progress[id]), '應全部為到期題');
  });
  test('到期 25 個單字 → 上限 20 題，最早到期的優先', () => {
    const progress = {};
    for (let i = 1; i <= 25; i++) progress[`v${i}`] = { level: 2, nextReview: addDays(T, -(i % 5)) };
    progress.v7 = { level: 1, nextReview: addDays(T, -9) };
    const p = buildPlan({ items, progress, daily: {}, today: T });
    const v = p.items.filter(x => x.type === 'vocab');
    eq([v.length, v[0].id, p.due.vocab], [20, 'v7', 25]);
  });
  test('還沒到期的題目不會排進今日任務', () => {
    const progress = { g1: { level: 3, nextReview: addDays(T, 1) } };
    const p = buildPlan({ items, progress, daily: {}, today: T });
    ok(!p.items.some(x => x.id === 'g1'), 'g1 不應出現');
  });
  test('全部加滿也不超過 30 分鐘', () => {
    const progress = {};
    for (const t of ['vocab', 'grammar', 'shadowing']) items[t].forEach(it => { progress[it.id] = { level: 0, nextReview: T }; });
    const p = buildPlan({ items, progress, daily: {}, today: T });
    eq([p.quotas.vocab, p.quotas.grammar, p.quotas.shadowing], [20, 10, 6]);
    ok(p.estMinutes <= 30, `預估 ${p.estMinutes} 分鐘`);
  });
  test('自由練習：到期 → 新題 → 提前複習', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const progress = { a: { level: 2, nextReview: addDays(T, 3) }, c: { level: 0, nextReview: T } };
    eq(pickPractice(list, progress, T, 3, 'grammar').map(x => x.id), ['c', 'b', 'a']);
  });
});

// ===== 統計 =====
group('統計', () => {
  const p = day([1, 1], [0, 0], [0, 0]);
  test('連續 3 天（含今天）', () => {
    eq(streak({ [T]: p, [addDays(T, -1)]: p, [addDays(T, -2)]: p, [addDays(T, -4)]: p }, T), 3);
  });
  test('今天還沒練，從昨天往回算', () => {
    eq(streak({ [addDays(T, -1)]: p, [addDays(T, -2)]: p }, T), 2);
  });
  test('中斷就重算', () => {
    eq(streak({ [addDays(T, -2)]: p }, T), 0);
  });
  test('本週從星期一算起', () => {
    eq(weekStart(T), '2026-10-19');
    const daily = { '2026-10-18': { seconds: 100 }, '2026-10-19': { seconds: 200 }, [T]: { seconds: 300 } };
    eq(weekSeconds(daily, T), 500);
  });
});

// ===== 角色 =====
group('角色經驗值', () => {
  test('升級門檻：Lv2=100、Lv3=250、Lv5=700、Lv10=2700', () => {
    eq([2, 3, 5, 10].map(xpToReach), [100, 250, 700, 2700]);
  });
  test('職稱：Lv5 安全專員、Lv10 資安調查員', () => {
    eq([levelInfo(99).level, levelInfo(100).level, levelInfo(700).rank.title, levelInfo(2700).rank.title],
      [1, 2, '安全專員', '資安調查員']);
  });
  test('經驗值規則', () => {
    eq([
      xpForAnswer({ type: 'vocab', correct: true }),
      xpForAnswer({ type: 'grammar', correct: false }),
      xpForAnswer({ type: 'vocab', correct: true, repeatToday: true }),
      xpForAnswer({ type: 'shadowing', outcome: 'up' }),
      xpForAnswer({ type: 'shadowing', outcome: 'keep' }),
      xpForAnswer({ type: 'vocab', correct: true, streakDays: 7 }),
    ], [10, 3, 2, 15, 10, 12]);
  });
});

// ===== 備份 =====
group('匯出／匯入格式', () => {
  test('不是備份檔會被拒絕', () => {
    eq([validateImport(null).ok, validateImport({ app: 'other', data: {} }).ok, validateImport([1, 2]).ok], [false, false, false]);
  });
  test('匯出再匯入，資料完全一樣', () => {
    const s = normalize({
      progress: { v001: { level: 3, nextReview: '2026-10-29', lastReview: T, attempts: 4, right: 3, wrong: 1 } },
      stories: [{ id: 'x1', title: '測試', situation: { zh: '甲', en: 'A.' }, task: {}, action: {}, result: {}, updatedAt: '2026-10-22T10:00:00Z' }],
      daily: { [T]: day([8, 10], [3, 5], [240, 3]) },
      player: { xp: 1234, badges: { first_answer: T } },
      settings: { rate: 0.8, lastExport: '2026-10-22T10:00:00Z' },
    });
    const file = JSON.parse(JSON.stringify(exportData(s)));
    const v = validateImport(file);
    ok(v.ok, v.error);
    eq(normalize(v.data), s);
  });
  test('舊備份缺欄位時自動補齊', () => {
    const s = normalize({ progress: {} });
    eq([s.settings.rate, s.player.xp, Array.isArray(s.stories)], [defaultState().settings.rate, 0, true]);
  });
});

// ===== 故事句子 =====
group('故事庫句子', () => {
  test('英文切句（Mr. 不會被切開）', () => {
    eq(splitSentencesEn('I analyzed bank transfers. I also met Mr. Chen today!'), ['I analyzed bank transfers.', 'I also met Mr. Chen today!']);
  });
  test('中文切句', () => {
    eq(splitSentencesZh('我分析了金流。我也和銀行合作！'), ['我分析了金流。', '我也和銀行合作！']);
  });
  test('中英句數相同時一句對一句', () => {
    const items = storyItems([{ id: 's1', title: 't', action: { zh: '第一句。第二句。', en: 'One. Two.' } }]);
    eq(items.map(x => [x.en, x.zh]), [['One.', '第一句。'], ['Two.', '第二句。']]);
  });
  test('句子編號固定（改別句不影響這句的進度）', () => {
    const a = storyItems([{ id: 's1', action: { en: 'One. Two.' } }]);
    const b = storyItems([{ id: 's1', action: { en: 'One. Three.' } }]);
    eq(a[0].id, b[0].id);
  });
});

// ===== 顯示結果 =====
const all = groups.flatMap(g => g.tests);
const failed = all.filter(t => !t.ok);
document.getElementById('summary').innerHTML = failed.length
  ? `<b class="t-bad">❌ ${failed.length} 項失敗</b>，${all.length - failed.length} 項通過`
  : `<b class="t-ok">✅ 全部 ${all.length} 項通過</b>`;
document.getElementById('out').innerHTML = groups.map(g => `
  <section class="card">
    <h2>${g.name}</h2>
    ${g.tests.map(t => `
      <div class="t-row"><span class="${t.ok ? 't-ok' : 't-bad'}">${t.ok ? '✓' : '✗'}</span> ${t.name}
        ${t.ok ? '' : `<div class="t-msg">${t.msg}</div>`}</div>`).join('')}
  </section>`).join('');
window.testResults = { total: all.length, failed: failed.map(t => `${t.name}: ${t.msg}`) };
