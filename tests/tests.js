// 自動檢查：純邏輯測試，不會讀寫你的 localStorage 資料
import { defaultState, normalize, validateImport, exportData } from '../js/store.js';
import { sma, drawdown, trendOf, findSeries, fngLabel, fxOf, githubRawUrl, lastOf } from '../js/market.js';
import { portfolio, contractView, estLiq, baseSym } from '../js/calc.js';
import { discipline, dcaPlan, dipPlan, todos, checkContract, checkStock, coolStatus } from '../js/rules.js';
import { statsBy, pendingResults, SOURCES } from '../js/journal.js';
import { twd, pct, spct, addDays } from '../js/util.js';

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
function near(actual, expected, tol = 1e-6, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label}預期約 ${expected}，實際 ${actual}`);
}
function ok(cond, msg = '條件不成立') {
  if (!cond) throw new Error(msg);
}

const T = '2026-10-24';
const NOW = Date.parse('2026-10-24T12:00:00+08:00');

/** 產生 n 天的價格序列 */
function series(n, f, start = '2025-01-01') {
  const d = [];
  for (let i = 0; i < n; i++) d.push([addDays(start, i), f(i)]);
  return { name: 'x', d };
}
function mkMarket(extra = {}) {
  return { updatedAt: '2026-10-24T00:00:00Z', series: { 'TWD=X': series(5, () => 32), ...extra }, fng: { v: 50, date: T }, tw: {}, errors: [] };
}
/** 範例：台股 0050 50 萬、美股 VOO 1 萬美元、NVDA 股票 2000 美元、現金 10 萬、合約帳戶 1000 美元 */
function mkState() {
  const s = defaultState();
  s.rules.confirmed = true;
  s.opens = { date: T, n: 1 };
  s.updatedAt = T;
  Object.assign(s.accounts, { cashTwd: 100000, cashUsd: 0, emergency: 300000, monthlyExpense: 50000, contractEquity: 1000 });
  s.holdings = [
    { id: 'h1', mkt: 'tw', sym: '0050', value: 500000, cost: 400000, bucket: 'core', sector: '其他' },
    { id: 'h2', mkt: 'us', sym: 'VOO', value: 10000, cost: 9000, bucket: 'core', sector: '其他' },
    { id: 'h3', mkt: 'us', sym: 'NVDA', value: 2000, cost: 2500, bucket: 'sat', sector: 'AI／半導體' },
  ];
  s.plan.monthly = 20000;
  s.plan.dcaDone[T.slice(0, 7)] = T;
  return s;
}
const nvda = (over = {}) => ({ id: 'c1', sym: 'NVDA', name: 'NVDA', side: 'long', qty: 20, entry: 180, mark: 190, lev: 4, liq: null, stop: 170, cross: false, sector: 'AI／半導體', ...over });

// ===== 市場資料 =====
group('市場資料計算', () => {
  test('移動平均', () => eq(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]));
  test('距一年高點：最高 120、現在 96 → 跌 20%', () => {
    const d = drawdown(series(10, i => [100, 110, 120, 115, 100, 98, 97, 96, 96, 96][i]));
    eq([d.high, d.last], [120, 96]);
    near(d.dd, 0.2);
  });
  test('只看最近一年（252 筆）的高點', () => {
    const d = drawdown(series(300, i => (i < 10 ? 500 : 100)));
    eq(d.high, 100);
  });
  test('200 日線：一路上漲 → 在線上；60 日線乖離', () => {
    const t = trendOf(series(250, i => 100 + i));
    eq([t.above200, t.above60], [true, true]);
    near(t.ma60, 319.5);
    near(t.ext60, 349 / 319.5 - 1);
  });
  test('資料不到 200 天 → 200 日線為 null', () => eq(trendOf(series(100, i => i + 1)).ma200, null));
  test('「0050」找得到「0050.TW」、小寫也可以', () => {
    const m = mkMarket({ '0050.TW': series(3, () => 1), NVDA: series(3, () => 2) });
    eq([findSeries(m, '0050').key, findSeries(m, 'nvda').key, findSeries(m, 'XYZ')], ['0050.TW', 'NVDA', null]);
  });
  test('最新收盤與漲跌', () => {
    const l = lastOf(series(3, i => [100, 100, 110][i]));
    eq(l.v, 110);
    near(l.chg, 0.1);
  });
  test('恐懼貪婪分級', () => {
    const R = defaultState().rules;
    eq([10, 30, 50, 60, 80].map(v => fngLabel(v, R)), ['極度恐懼', '恐懼', '中性', '貪婪', '極度貪婪']);
  });
  test('匯率：手動 > 自動 > 預設 32', () => {
    const s = defaultState();
    eq(fxOf(s, mkMarket()).v, 32);
    eq(fxOf(s, { series: {} }).src, '預設');
    s.settings.fx = 31.5;
    eq(fxOf(s, mkMarket()).v, 31.5);
  });
  test('GitHub Pages 網址 → 對應的最新資料網址', () => {
    eq(githubRawUrl({ hostname: 'someone.github.io', pathname: '/invest-dashboard/' }), 'https://raw.githubusercontent.com/someone/invest-dashboard/main/data/market.json');
    eq(githubRawUrl({ hostname: 'localhost', pathname: '/' }), null);
  });
});

// ===== 資產計算 =====
group('資產與合約計算', () => {
  test('估計強平價（含 0.5% 維持保證金）', () => {
    near(estLiq('long', 100, 4), 75.5);
    near(estLiq('short', 100, 4), 124.5);
    eq(estLiq('long', 100, 1), null);
  });
  test('合約：持倉價值、浮動損益、距強平、停損會再虧', () => {
    const c = contractView(nvda(), mkMarket());
    eq([c.notional, c.pnl, c.risk, c.stopBeforeLiq], [3800, 200, 400, true]);
    near(c.liq, 135.9);
    near(c.liqDist, (190 - 135.9) / 190);
  });
  test('合約沒停損 → 再虧金額沒有上限（null）', () => eq(contractView(nvda({ stop: null }), mkMarket()).risk, null));
  test('停損在強平之後 → 用強平價算損失', () => {
    const c = contractView(nvda({ stop: 130 }), mkMarket());
    eq(c.stopBeforeLiq, false);
    near(c.risk, 20 * (190 - 135.9));
  });
  test('現價空白 → 用自動抓的收盤價', () => {
    const c = contractView(nvda({ mark: null }), mkMarket({ NVDA: series(3, () => 200) }));
    eq([c.mark, c.notional], [200, 4000]);
  });
  test('做空：價格上漲是虧損', () => {
    const c = contractView(nvda({ side: 'short', entry: 200, mark: 210, stop: 220 }), mkMarket());
    eq([c.pnl, c.risk], [-200, 200]);
  });
  test('總資產、核心桶、衛星桶、現金（美股換算台幣）', () => {
    const p = portfolio(mkState(), mkMarket());
    eq([p.core, p.sat, p.cash, p.total], [820000, 96000, 100000, 1016000]);
    eq(p.efMonths, 6);
  });
  test('單一個股曝險：股票＋合約持倉價值合併', () => {
    const s = mkState();
    s.contracts = [nvda()];
    const p = portfolio(s, mkMarket());
    const e = p.exposures[0];
    eq([e.sym, e.value, e.parts.length], ['NVDA', 64000 + 3800 * 32, 2]);
  });
  test('代號統一：2330.TW = 2330', () => eq(baseSym(' 2330.tw '), '2330'));
});

// ===== 規則 =====
group('紀律清單與今日待辦', () => {
  test('沒有合約時，不顯示合約相關項目', () => {
    const p = portfolio(mkState(), mkMarket());
    const d = discipline(p, mkState(), T);
    ok(!d.items.some(i => i.key === 'stop'), '不應該有停損項目');
    eq(d.score, 100);
  });
  test('合約沒停損 → 紀律分數扣分、待辦第一項是紅色', () => {
    const s = mkState();
    s.contracts = [nvda({ stop: null })];
    const p = portfolio(s, mkMarket());
    eq(discipline(p, s, T).items.find(i => i.key === 'stop').ok, 0);
    const t = todos(p, s, mkMarket(), T, NOW);
    eq(t[0].lv, 'bad');
    ok(t[0].title.includes('沒有停損'), t[0].title);
  });
  test('待辦依急迫度排序：紅 → 黃 → 綠 → 一般', () => {
    const s = mkState();
    s.rules.confirmed = false;
    s.contracts = [nvda({ lev: 10, stop: null })];
    const order = todos(portfolio(s, mkMarket()), s, mkMarket(), T, NOW).map(x => x.lv);
    eq(order, [...order].sort((a, b) => ['bad', 'warn', 'good', 'info'].indexOf(a) - ['bad', 'warn', 'good', 'info'].indexOf(b)));
  });
  test('衛星桶超過上限 → 黃色待辦', () => {
    const s = mkState();
    s.rules.satCapPct = 5;
    const t = todos(portfolio(s, mkMarket()), s, mkMarket(), T, NOW);
    ok(t.some(x => x.lv === 'warn' && x.title.includes('衛星桶')), '應該提醒衛星桶');
  });
});

group('定期定額與大跌加碼', () => {
  test('一般月份：全部投入，分給比較少的美股', () => {
    const s = mkState();
    const d = dcaPlan(portfolio(s, mkMarket()), s, mkMarket());
    eq([d.invest, d.lines.map(l => l.sym)], [20000, ['VOO']]);
  });
  test('預備金不足 → 先撥一半', () => {
    const s = mkState();
    s.accounts.emergency = 100000;
    const d = dcaPlan(portfolio(s, mkMarket()), s, mkMarket());
    eq([d.toEmergency, d.invest], [10000, 10000]);
  });
  test('極度恐懼 ×1.5、極度貪婪 ×0.5', () => {
    const s = mkState();
    const p = portfolio(s, mkMarket());
    eq(dcaPlan(p, s, { ...mkMarket(), fng: { v: 20 } }).invest, 30000);
    eq(dcaPlan(p, s, { ...mkMarket(), fng: { v: 80 } }).invest, 10000);
  });
  test('手動輸入的恐懼貪婪優先', () => {
    const s = mkState();
    s.plan.fngManual = 10;
    eq(dcaPlan(portfolio(s, mkMarket()), s, mkMarket()).mult, 1.5);
  });
  test('核心桶空的 → 台美各半', () => {
    const s = mkState();
    s.holdings = [];
    const d = dcaPlan(portfolio(s, mkMarket()), s, mkMarket());
    eq(d.lines.map(l => [l.sym, l.amount]), [['0050', 10000], ['VOO', 10000]]);
  });
  const crash = mkMarket({ '^TWII': series(10, i => (i < 5 ? 100 : 78)) });
  test('台股跌 22% → 達第 2 段；先執行第 1 段，金額＝加碼池 ÷ 3', () => {
    const s = mkState();
    s.plan.pool = 90000;
    const d = dipPlan(s, crash);
    eq([d.reached, d.ready.tier, d.ready.amount, d.ready.lines[0].sym], [2, 1, 30000, '0050']);
  });
  test('第 1 段做完 → 接著第 2 段，金額＝剩下的池 ÷ 2', () => {
    const s = mkState();
    s.plan.pool = 60000;
    s.plan.dipUsed = { 1: T };
    eq([dipPlan(s, crash).ready.tier, dipPlan(s, crash).ready.amount], [2, 30000]);
  });
  test('加碼池是 0 → 不觸發', () => {
    const s = mkState();
    eq(dipPlan(s, crash).ready, null);
  });
});

group('下單前檢查（合約）', () => {
  const base = { sym: 'AAPL', side: 'long', entry: 100, stop: 95, target: 110, lev: 4, equity: 1000, source: 'self' };
  const run = (inp, s = mkState(), m = mkMarket()) => checkContract({ ...base, ...inp }, portfolio(s, m), s, m, NOW);
  const failed = r => r.checks.filter(c => !c.ok).map(c => c.label);
  test('部位大小由停損距離決定：帳戶 1000、虧 2%、停損 5% → 最多開 400', () => {
    const r = run({});
    eq([r.sizing.maxLoss, r.sizing.notional, r.sizing.qty, r.sizing.margin], [20, 400, 4, 100]);
    eq(r.ok, true);
  });
  test('槓桿超過上限 → 不通過', () => eq(failed(run({ lev: 10 })), ['槓桿']));
  test('停損在強平之後 → 不通過', () => ok(failed(run({ lev: 20, stop: 90 })).includes('停損在強平價之前')));
  test('停損方向錯（做多停損高於進場價）→ 不通過', () => ok(failed(run({ stop: 105 })).includes('停損方向')));
  test('盈虧比不到 2 → 不通過', () => eq(failed(run({ target: 105 })), ['盈虧比至少 2']));
  test('同一檔虧損中再開多單 → 攤平，禁止', () => {
    const s = mkState();
    s.contracts = [nvda({ mark: 170, stop: 160 })];
    ok(failed(run({ sym: 'NVDA' }, s)).includes('不攤平'));
  });
  test('同一檔賺錢中、停損已保本 → 可以加碼', () => {
    const s = mkState();
    s.contracts = [nvda({ mark: 200, stop: 185 })];
    ok(!failed(run({ sym: 'NVDA' }, s)).includes('不攤平'));
  });
  test('價格在 200 日線下做多 → 逆勢接刀', () => {
    const m = mkMarket({ AAPL: series(250, i => 300 - i) });
    ok(failed(run({ entry: 51, stop: 48, target: 58 }, mkState(), m)).includes('長期趨勢（200 日線）'));
  });
  test('進場價比 60 日線高 15% 以上 → 追高', () => {
    const m = mkMarket({ AAPL: series(250, i => 100 + i * 0.01) });
    ok(failed(run({ entry: 130, stop: 125, target: 145 }, mkState(), m)).includes('不追高'));
  });
  test('沒有價格資料 → 趨勢檢查跳過（不擋）', () => ok(run({}).checks.some(c => c.group === '趨勢' && c.skip)));
  test('因為 KOL 才想進場：沒進清單 → 不通過', () => ok(failed(run({ source: 'kol' })).includes('冷靜期')));
  test('進清單 10 小時 → 還不行；25 小時 → 可以', () => {
    const s = mkState();
    s.wishlist = [{ id: 'w', sym: 'AAPL', source: 'kol', addedAt: new Date(NOW - 10 * 3.6e6).toISOString() }];
    ok(failed(run({ source: 'kol' }, s)).includes('冷靜期'));
    s.wishlist[0].addedAt = new Date(NOW - 25 * 3.6e6).toISOString();
    ok(!failed(run({ source: 'kol' }, s)).includes('冷靜期'));
    eq(Math.floor(coolStatus(s, 'aapl', NOW).hours), 25);
  });
  test('已經有合約沒停損 → 總風險不通過', () => {
    const s = mkState();
    s.contracts = [nvda({ stop: null })];
    ok(failed(run({}, s)).includes('總風險在預算內'));
  });
});

group('下單前檢查（股票）', () => {
  const run = (inp, s = mkState()) => checkStock({ sym: '2330', mkt: 'tw', amount: 50000, bucket: 'sat', source: 'self', ...inp }, portfolio(s, mkMarket()), s, mkMarket(), NOW);
  const failed = r => r.checks.filter(c => !c.ok).map(c => c.label);
  test('現金夠、結構在上限內 → 可以買', () => eq(run({}).ok, true));
  test('現金不夠 → 不要借錢買', () => ok(failed(run({ amount: 200000 })).includes('現金夠用')));
  test('買完單一個股超過上限 → 不通過', () => {
    const s = mkState();
    s.rules.singleCapPct = 3;
    ok(failed(run({}, s)).includes('單一個股曝險'));
  });
  test('核心 ETF 不檢查時機', () => ok(!run({ bucket: 'core' }).checks.some(c => c.group === '趨勢')));
});

group('交易日誌統計', () => {
  const j = [
    { id: 1, source: 'kol', mood: 'fomo', action: 'long', date: '2026-10-01', result: { outcome: 'loss', pnl: -5000 } },
    { id: 2, source: 'kol', mood: 'calm', action: 'long', date: '2026-10-02', result: { outcome: 'win', pnl: 1000 } },
    { id: 3, source: 'self', mood: 'calm', action: 'buy', date: '2026-10-20', result: null },
  ];
  test('依來源：筆數、勝率、合計損益', () => {
    const k = statsBy(j, 'source', SOURCES).find(r => r.key === 'kol');
    eq([k.n, k.closed, k.winRate, k.pnl], [2, 2, 0.5, -4000]);
  });
  test('開倉超過 7 天沒記結果才提醒', () => {
    eq(pendingResults(j, T).length, 0);
    eq(pendingResults(j, '2026-10-28').length, 1);
  });
});

group('格式與備份', () => {
  test('台幣金額：萬、億', () => eq([twd(9999), twd(123456), twd(-250000000)], ['9,999 元', '12.3 萬', '−2.5 億']));
  test('百分比', () => eq([pct(0.1234), spct(0.05), spct(-0.031)], ['12.3%', '+5.0%', '−3.1%']));
  test('舊備份缺欄位時自動補齊', () => {
    const s = normalize({ holdings: [{ id: 'x' }], rules: { maxLev: 3 } });
    eq([s.rules.maxLev, s.rules.perTradePct, Array.isArray(s.journal), s.plan.twEtf], [3, 2, true, '0050']);
  });
  test('不是這個 App 的備份 → 拒絕', () => {
    eq(validateImport({ app: 'english-app', data: {} }).ok, false);
    eq(validateImport(exportData(defaultState())).ok, true);
  });
});

// ===== 顯示結果 =====
const all = groups.flatMap(g => g.tests);
const failedAll = all.filter(t => !t.ok);
document.getElementById('summary').innerHTML = failedAll.length
  ? `<b class="t-bad">❌ ${failedAll.length} 項失敗</b>，${all.length - failedAll.length} 項通過`
  : `<b class="t-ok">✅ 全部 ${all.length} 項通過</b>`;
document.getElementById('out').innerHTML = groups.map(g => `
  <section class="card">
    <h2>${g.name}</h2>
    ${g.tests.map(t => `
      <div class="t-row"><span class="${t.ok ? 't-ok' : 't-bad'}">${t.ok ? '✓' : '✗'}</span> ${t.name}
        ${t.ok ? '' : `<div class="t-msg">${t.msg}</div>`}</div>`).join('')}
  </section>`).join('');
window.testResults = { total: all.length, failed: failedAll.map(t => `${t.name}: ${t.msg}`) };
