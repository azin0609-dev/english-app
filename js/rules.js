// 規則：紀律清單、今日待辦、定期定額、大跌分段加碼、下單前檢查
import { isNum, clamp, monthOf, daysBetween, nowMs, twd, usd, pct, fPrice } from './util.js';
import { findSeries, trendOf, drawdown, fngOf, fngLabel, marketAgeDays, IDX } from './market.js';
import { baseSym, estLiq } from './calc.js';
import { SOURCES, EMO_SOURCES, label, pendingResults } from './journal.js';

const n = v => (isNum(v) ? v : 0);
const LV_ORDER = { bad: 0, warn: 1, good: 2, info: 3 };

// ===== 紀律清單（ok：1 通過、0.5 無法確認、0 沒通過） =====
export function discipline(p, s, today) {
  const R = s.rules;
  const cs = p.contracts;
  const items = [];
  items.push({
    key: 'ef', label: `預備金至少 ${R.efMonths} 個月`, href: '#/holdings',
    ok: p.efMonths != null && p.efMonths >= R.efMonths ? 1 : 0,
    detail: p.efMonths == null ? '還沒填生活費' : `${p.efMonths.toFixed(1)} 個月`,
  });
  if (cs.length) {
    const withStop = cs.filter(c => c.hasStop).length;
    items.push({ key: 'stop', label: '每張合約都有停損', href: '#/risk', ok: withStop === cs.length ? 1 : 0, detail: `${withStop} / ${cs.length}` });
    const bad = cs.filter(c => c.stopBeforeLiq === false).length;
    const unknown = cs.filter(c => c.hasStop && c.stopBeforeLiq === null).length;
    items.push({
      key: 'liq', label: '停損都在強平價之前', href: '#/risk',
      ok: bad || withStop < cs.length ? 0 : unknown ? 0.5 : 1,
      detail: bad ? `${bad} 張會先被強平` : unknown ? `${unknown} 張不知道強平價` : withStop < cs.length ? '有單沒停損' : '都在之前',
    });
    const levOk = cs.filter(c => c.lev <= R.maxLev).length;
    items.push({ key: 'lev', label: `槓桿不超過 ${R.maxLev} 倍`, href: '#/risk', ok: levOk === cs.length ? 1 : 0, detail: `${levOk} / ${cs.length}` });
    items.push({
      key: 'cap', label: `合約帳戶不超過投資資產 ${R.contractCapPct}%`, href: '#/risk',
      ok: p.contractEq <= p.contractCap ? 1 : 0,
      detail: p.total ? pct(p.contractEq / p.total) : '—',
    });
    items.push({
      key: 'risk', label: '停損全部觸發的損失在預算內', href: '#/risk',
      ok: p.noStop.length ? 0 : p.riskUsedUsd <= p.riskBudgetUsd ? 1 : 0,
      detail: p.noStop.length ? '有單沒停損，損失沒有上限' : `${usd(p.riskUsedUsd)} ／ ${usd(p.riskBudgetUsd)}`,
    });
  }
  items.push({
    key: 'sat', label: `衛星桶不超過 ${R.satCapPct}%`, href: '#/structure',
    ok: p.satR == null || p.satR <= R.satCapPct / 100 ? 1 : 0, detail: pct(p.satR, 0),
  });
  const top = p.exposures[0];
  items.push({
    key: 'single', label: `單一個股不超過 ${R.singleCapPct}%`, href: '#/structure',
    ok: !top || top.ratio <= R.singleCapPct / 100 ? 1 : 0,
    detail: top ? `${top.name} ${pct(top.ratio, 0)}` : '沒有個股',
  });
  const done = s.plan.dcaDone[monthOf(today)];
  items.push({ key: 'dca', label: '本月定期定額已執行', href: '#/plan', ok: done ? 1 : 0, detail: done ? '已完成' : '還沒做' });
  items.push({
    key: 'opens', label: `今天打開不超過 ${R.opensPerDay} 次`, href: null,
    ok: s.opens.n <= R.opensPerDay ? 1 : 0, detail: `第 ${s.opens.n} 次`,
  });
  const score = Math.round((items.reduce((a, x) => a + x.ok, 0) / items.length) * 100);
  return { items, score };
}

// ===== 定期定額 =====
export function dcaPlan(p, s, m) {
  const R = s.rules;
  const monthly = Math.max(0, n(s.plan.monthly));
  const efShort = p.efMonths == null || p.efMonths < R.efMonths;
  const toEmergency = efShort ? monthly / 2 : 0;
  const base = monthly - toEmergency;
  const f = fngOf(s, m);
  const mult = !f ? 1 : f.v < R.fear ? R.fearMult : f.v >= R.greed ? R.greedMult : 1;
  const invest = base * mult;
  // 分給台股、美股：讓核心桶往目標比例靠近
  const total = p.twCore + p.usCore + invest;
  const toUs = clamp((total * R.coreUsPct) / 100 - p.usCore, 0, invest);
  const toTw = invest - toUs;
  const lines = [
    { sym: s.plan.twEtf || '0050', mkt: 'tw', amount: toTw },
    { sym: s.plan.usEtf || 'VOO', mkt: 'us', amount: toUs, amountUsd: toUs / p.fx },
  ].filter(l => l.amount >= 1);
  const reasons = [];
  if (efShort) reasons.push(p.efMonths == null ? '還沒填預備金：先撥一半存預備金' : `預備金不到 ${R.efMonths} 個月：先撥一半存預備金`);
  reasons.push(f ? `股市${fngLabel(f.v, R)}（${f.v}）→ ×${mult}` : '沒有恐懼貪婪指數 → ×1');
  return { monthly, efShort, toEmergency, base, fng: f, mult, invest, extra: invest - base, lines, reasons };
}

// ===== 大跌分段加碼 =====
export function dipPlan(s, m) {
  const tiers = s.rules.dipTiers;
  const markets = [
    ['tw', '台股加權', IDX.tw, s.plan.twEtf || '0050'],
    ['us', 'S&P 500', IDX.us, s.plan.usEtf || 'VOO'],
  ].map(([key, name, idx, etf]) => {
    const d = drawdown(findSeries(m, idx));
    return { key, name, etf, info: d, dd: d ? d.dd : null, tier: d ? tiers.filter(t => d.dd * 100 >= t).length : 0 };
  });
  const reached = Math.max(0, ...markets.map(x => x.tier));
  const used = [1, 2, 3].filter(i => s.plan.dipUsed[i]);
  const remaining = 3 - used.length;
  const pool = Math.max(0, n(s.plan.pool));
  const perTier = remaining ? pool / remaining : 0;
  const nextTier = [1, 2, 3].find(i => i <= reached && !s.plan.dipUsed[i]) || null;
  let ready = null;
  if (nextTier && pool > 0) {
    const hit = markets.filter(x => x.tier >= nextTier);
    ready = {
      tier: nextTier,
      amount: perTier,
      market: hit.map(x => x.name).join('、'),
      dd: Math.max(...hit.map(x => x.dd)),
      lines: hit.map(x => ({ sym: x.etf, mkt: x.key, amount: perTier / hit.length })),
    };
  }
  const nearHigh = markets.every(x => x.dd != null && x.dd < 0.05);
  return { markets, tiers, reached, used, perTier, pool, ready, canReset: used.length > 0 && nearHigh };
}

// ===== 今日待辦 =====
export function todos(p, s, m, today, now = nowMs()) {
  const R = s.rules;
  const t = [];
  const add = (lv, icon, title, detail, href) => t.push({ lv, icon, title, detail, href });

  if (!R.confirmed) add('info', '⚙️', '規則還是範例數字', '到「設定」看一遍，改成適合你的數字後按「確認規則」', '#/settings');
  if (s.updatedAt && daysBetween(s.updatedAt, today) >= 7) {
    add('info', '✏️', `持倉 ${daysBetween(s.updatedAt, today)} 天沒更新`, '打開券商和交易所 App，把最新數字抄進來', '#/holdings');
  }
  const age = marketAgeDays(m, today);
  if (age == null) add('info', '📡', '還沒有市場資料', 'GitHub 每天會自動抓兩次；抓到之前，均線和距高點的檢查會先跳過', '#/market');
  else if (age >= 4) add('info', '📡', `市場資料 ${age} 天沒更新`, '到 GitHub 的 Actions 看「更新市場資料」有沒有出錯', '#/market');

  for (const c of p.contracts) {
    if (!c.hasStop) {
      add('bad', '🛑', `${c.name} 沒有停損`, `損失沒有上限${c.liqDist != null ? `，目前距強平 ${pct(c.liqDist)}` : ''}。到「風控」補上停損價`, '#/risk');
    } else if (c.stopBeforeLiq === false) {
      add('bad', '🛑', `${c.name} 的停損在強平價之後`, `會先被強平（強平 ${fPrice(c.liq)}）。把停損移到強平價之前`, '#/risk');
    }
    if (c.liqDist != null && c.liqDist < 0.1) add('bad', '⚠️', `${c.name} 距強平只剩 ${pct(c.liqDist)}`, '不補保證金、不加倉；考慮先減倉', '#/risk');
    else if (c.liqDist != null && c.liqDist < 0.2) add('warn', '⚠️', `${c.name} 距強平 ${pct(c.liqDist)}`, '離強平不遠，確認停損有設好', '#/risk');
    if (c.lev > R.maxLev) add('warn', '📉', `${c.name} 槓桿 ${c.lev} 倍，超過上限 ${R.maxLev} 倍`, '不加倉；下次開單照「下單前」算出的大小', '#/risk');
    if (c.cross) add('warn', '🔗', `${c.name} 是全倉模式`, c.liqManual ? '改成逐倉，避免一張單拖垮整個帳戶' : '改成逐倉；全倉算不出強平價，請從交易所抄強平價', '#/risk');
  }
  if (p.contracts.length && p.contractEq > p.contractCap) {
    add('bad', '🧯', '合約帳戶超過上限', `${twd(p.contractEq)}，上限 ${twd(p.contractCap)}。不開新單、不補保證金；出場後把超過的部分轉出`, '#/risk');
  }
  if (p.contracts.length && !p.noStop.length && p.riskUsedUsd > p.riskBudgetUsd) {
    add('bad', '🧯', '停損全觸發的損失超過預算', `會虧 ${usd(p.riskUsedUsd)}，預算 ${usd(p.riskBudgetUsd)}。收緊停損或減倉`, '#/risk');
  }
  if (p.satR != null && p.satR > R.satCapPct / 100) {
    add('warn', '🧺', `衛星桶 ${pct(p.satR, 0)}，超過上限 ${R.satCapPct}%`, '新資金只進核心桶（大盤 ETF），個股和合約不再加碼', '#/structure');
  }
  for (const e of p.exposures.filter(x => x.ratio > R.singleCapPct / 100)) {
    add('warn', '🎯', `${e.name} 曝險 ${pct(e.ratio, 0)}，超過上限 ${R.singleCapPct}%`, `${e.parts.map(x => `${x.kind} ${twd(x.v)}`).join('＋')}。這一檔不再加碼`, '#/structure');
  }
  if (p.efMonths == null) add('info', '🛟', '還沒填預備金和每月生活費', '先確定生活費有著落，才知道能投多少', '#/holdings');
  else if (p.efMonths < R.efMonths) add('warn', '🛟', `預備金 ${p.efMonths.toFixed(1)} 個月，目標 ${R.efMonths} 個月`, `本月定投先撥一半（${twd(n(s.plan.monthly) / 2)}）存預備金`, '#/plan');

  if (!s.plan.dcaDone[monthOf(today)]) {
    if (n(s.plan.monthly) > 0) {
      const d = dcaPlan(p, s, m);
      add('info', '📅', `本月定投 ${d.lines.map(l => `${l.sym} ${twd(l.amount)}`).join('、') || '—'}`, `${d.reasons.join('；')}。做完到「定投」打勾`, '#/plan');
    } else {
      add('info', '📅', '還沒設定每月投入金額', '到「定投」填每個月能固定投入多少', '#/plan');
    }
  }
  const dip = dipPlan(s, m);
  if (dip.ready) add('good', '🪙', `大跌加碼第 ${dip.ready.tier} 段觸發，可動用 ${twd(dip.ready.amount)}`, `${dip.ready.market}距一年高點 −${pct(dip.ready.dd)}`, '#/plan');

  for (const w of s.wishlist) {
    const c = coolOf(s, w, now);
    if (c.ready) add('info', '⏳', `${w.sym} 冷靜期已過`, '還想買的話，先到「下單前」跑一次檢查；不想買了就刪掉', '#/check');
  }
  const pend = pendingResults(s.journal, today);
  if (pend.length) add('info', '📓', `${pend.length} 筆交易還沒記結果`, '記下賺賠，才看得出哪種消息來源最常讓你賠錢', '#/journal');

  return t.sort((a, b) => LV_ORDER[a.lv] - LV_ORDER[b.lv]);
}

// ===== 冷靜期 =====
function coolOf(s, w, now) {
  const hours = (now - Date.parse(w.addedAt)) / 3.6e6;
  return { item: w, hours, hoursLeft: Math.max(0, s.rules.coolHours - hours), ready: hours >= s.rules.coolHours };
}

export function coolStatus(s, sym, now = nowMs()) {
  const w = s.wishlist.find(x => baseSym(x.sym) === baseSym(sym));
  return w ? coolOf(s, w, now) : null;
}

// ===== 下單前檢查 =====
function checker() {
  const checks = [];
  const add = (group, ok, label_, detail, skip = false) => checks.push({ group, ok, label: label_, detail, skip });
  return { checks, add };
}

function trendChecks(add, sym, long, entry, m, R) {
  const t = trendOf(findSeries(m, sym));
  if (!t) {
    add('趨勢', true, '趨勢', `沒有 ${sym || '這個標的'} 的價格資料，先跳過（要自動抓價，把它加進 data/watchlist.json）`, true);
    return;
  }
  if (t.ma200 == null) {
    add('趨勢', true, '長期趨勢（200 日線）', '資料不到 200 天，先跳過', true);
  } else {
    const ok = long ? t.above200 : !t.above200;
    add('趨勢', ok, '長期趨勢（200 日線）',
      `收盤 ${fPrice(t.price)}，200 日線 ${fPrice(t.ma200)}：${t.above200 ? '在線上' : '在線下'}${ok ? '，順勢' : long ? '，逆勢接刀' : '，逆勢放空'}`);
  }
  if (t.ma60 == null) {
    add('趨勢', true, '不追高', '資料不到 60 天，先跳過', true);
  } else {
    const px = entry > 0 ? entry : t.price;
    const ext = px / t.ma60 - 1;
    const chase = long ? ext > R.chasePct / 100 : ext < -R.chasePct / 100;
    add('趨勢', !chase, long ? '不追高' : '不追空',
      `${entry > 0 ? '進場價' : '現價'}比 60 日線 ${fPrice(t.ma60)} ${ext >= 0 ? '高' : '低'} ${pct(Math.abs(ext))}${chase ? `，超過 ${R.chasePct}%` : ''}`);
  }
}

function coolCheck(add, s, inp, now) {
  const src = label(SOURCES, inp.source);
  if (!EMO_SOURCES.includes(inp.source)) {
    add('冷靜期', true, '想法來源', `${src}，不用冷靜期`);
    return;
  }
  const c = coolStatus(s, inp.sym, now);
  if (!c) add('冷靜期', false, '冷靜期', `因為${src}才想進場：先放進想買清單，${s.rules.coolHours} 小時後還想買再來`);
  else if (!c.ready) add('冷靜期', false, '冷靜期', `已放進清單，還要等 ${Math.ceil(c.hoursLeft)} 小時`);
  else add('冷靜期', true, '冷靜期', `放進清單 ${Math.floor(c.hours)} 小時，冷靜期已過`);
}

function finish(checks, sizing) {
  const fails = checks.filter(c => !c.ok).length;
  return { sizing, checks, ok: fails === 0, fails };
}

/**
 * 合約下單前：依停損距離算出最多能開多大，再逐項檢查
 * inp: { sym, side, entry, stop, target, lev, equity(美元), source }
 */
export function checkContract(inp, p, s, m, now = nowMs()) {
  const R = s.rules;
  const L = inp.side !== 'short';
  const dir = L ? 1 : -1;
  const sym = baseSym(inp.sym);
  const entry = n(inp.entry);
  const stop = n(inp.stop);
  const target = n(inp.target);
  const lev = n(inp.lev) || 1;
  const eq = n(inp.equity);
  const dist = entry > 0 && stop > 0 ? ((entry - stop) * dir) / entry : 0;
  const maxLoss = (eq * R.perTradePct) / 100;
  const notional = dist > 0 ? maxLoss / dist : 0;
  const qty = entry > 0 ? notional / entry : 0;
  const margin = notional / lev;
  const liq = estLiq(inp.side, entry, lev);
  const rr = dist > 0 && target > 0 ? (target - entry) / (entry - stop) : null;
  const { checks, add } = checker();

  add('帳戶與風控', eq > 0 && eq * p.fx <= p.contractCap, '合約帳戶在上限內',
    !(eq > 0) ? '先填合約帳戶權益' : !p.total ? '先到「持倉」填資料，才算得出上限'
      : `${usd(eq)}（${twd(eq * p.fx)}），上限 ${twd(p.contractCap)}${eq * p.fx <= p.contractCap ? '' : '：暫停開新單'}`);
  add('帳戶與風控', dist > 0, '停損方向',
    dist > 0 ? `停損距進場 ${pct(dist)}` : !stop ? '先填停損價' : L ? '做多的停損要低於進場價' : '做空的停損要高於進場價');
  add('帳戶與風控', lev <= R.maxLev, '槓桿', `${lev} 倍${lev <= R.maxLev ? '' : `，超過上限 ${R.maxLev} 倍`}`);
  const before = liq == null || (stop - liq) * dir > 0;
  add('帳戶與風控', dist > 0 && before, '停損在強平價之前',
    liq == null ? '1 倍不會被強平' : `估計強平價 ${fPrice(liq)}${before ? '，停損會先觸發' : '：停損在強平之後，會先被強平'}`);

  const same = p.contracts.find(c => baseSym(c.sym) === sym);
  let addOk = true;
  let addDetail = '沒有同標的部位';
  if (same) {
    if (same.side !== (L ? 'long' : 'short')) {
      addOk = false;
      addDetail = `已經有${same.side === 'short' ? '空' : '多'}單，不要同時做多又做空`;
    } else if (same.pnl < 0) {
      addOk = false;
      addDetail = `已持有 ${same.name}，目前虧損 ${usd(same.pnl)}：這是攤平，禁止`;
    } else if (!(same.hasStop && (same.stop - same.entry) * same.dir >= 0)) {
      addOk = false;
      addDetail = '原本那張賺錢中，但停損還沒移到成本價以上：先移停損再加';
    } else {
      addDetail = '原本那張賺錢中、停損已保本，可以加碼';
    }
  }
  add('帳戶與風控', addOk, '不攤平', addDetail);

  const newRisk = p.riskUsedUsd + maxLoss;
  add('帳戶與風控', !p.noStop.length && newRisk <= p.riskBudgetUsd, '總風險在預算內',
    p.noStop.length ? '已經有合約沒停損，先補停損' : `加上這筆，停損全觸發會虧 ${usd(newRisk)}，預算 ${usd(p.riskBudgetUsd)}`);

  const ex = p.exposures.find(e => e.sym === sym);
  const exAfter = (ex ? ex.value : 0) + notional * p.fx;
  const exR = p.total ? exAfter / p.total : null;
  add('帳戶與風控', exR != null && exR <= R.singleCapPct / 100, '單一個股曝險',
    exR == null ? '先到「持倉」填資料' : `加上這筆，${sym || '這檔'} 曝險占投資資產 ${pct(exR, 0)}，上限 ${R.singleCapPct}%`);

  trendChecks(add, sym, L, entry, m, R);
  add('盈虧比', rr != null && rr >= R.minRR, `盈虧比至少 ${R.minRR}`,
    !(target > 0) ? '先填目標價（打算在哪裡獲利出場）' : rr == null ? '先填停損價' : `目標 ${fPrice(target)}，盈虧比 ${rr.toFixed(1)}`);
  coolCheck(add, s, { ...inp, sym }, now);

  return finish(checks, { maxLoss, dist, notional, qty, margin, liq, rr });
}

/**
 * 買股票前
 * inp: { sym, mkt:'tw'|'us', amount（台股台幣、美股美元）, bucket:'core'|'sat', source }
 */
export function checkStock(inp, p, s, m, now = nowMs()) {
  const R = s.rules;
  const sym = baseSym(inp.sym);
  const us = inp.mkt === 'us';
  const amt = n(inp.amount) * (us ? p.fx : 1);
  const { checks, add } = checker();

  add('資金', amt > 0, '金額', amt > 0 ? twd(amt) : '先填金額');
  add('資金', p.efMonths != null && p.efMonths >= R.efMonths, '預備金',
    p.efMonths == null ? '還沒填預備金和生活費' : `${p.efMonths.toFixed(1)} 個月${p.efMonths >= R.efMonths ? '' : `，不到 ${R.efMonths} 個月：先補預備金`}`);
  const cash = us ? n(s.accounts.cashUsd) * p.fx : n(s.accounts.cashTwd);
  add('資金', amt <= cash, '現金夠用', `${us ? '美元' : '台幣'}現金 ${twd(cash)}${amt <= cash ? '' : '，不夠：不要借錢或用融資買'}`);

  if (inp.bucket === 'core') {
    add('結構', true, '核心桶', '大盤 ETF 照定期定額和大跌加碼的規則買，不用看時機');
  } else {
    const base = Math.max(p.total, p.sat + amt);
    const satAfter = base ? (p.sat + amt) / base : null;
    add('結構', satAfter != null && satAfter <= R.satCapPct / 100, '衛星桶上限', `買完衛星桶 ${pct(satAfter, 0)}，上限 ${R.satCapPct}%`);
    const ex = p.exposures.find(e => e.sym === sym);
    const exR = base ? ((ex ? ex.value : 0) + amt) / base : null;
    add('結構', exR != null && exR <= R.singleCapPct / 100, '單一個股曝險', `買完 ${sym || '這檔'} 占投資資產 ${pct(exR, 0)}，上限 ${R.singleCapPct}%`);
    trendChecks(add, sym, true, 0, m, R);
  }
  coolCheck(add, s, { ...inp, sym }, now);
  return finish(checks, { amount: amt });
}
