// 資產計算：總額、核心桶／衛星桶、預備金、單一個股與產業曝險、合約風險
import { isNum } from './util.js';
import { findSeries, lastOf, fxOf } from './market.js';

export const SECTORS = ['AI／半導體', '科技', '金融', '傳產', '消費', '醫療', '能源', '原物料', '其他'];

const n = v => (isNum(v) ? v : 0);

/** 代號統一寫法：「2330.TW」「2330」都當成 2330 */
export function baseSym(sym) {
  return String(sym || '').trim().toUpperCase().replace(/\.(TW|TWO)$/, '');
}

/** 逐倉的估計強平價（含 0.5% 維持保證金）；1 倍以下不會被強平 */
export function estLiq(side, entry, lev) {
  if (!(entry > 0) || !(lev > 1)) return null;
  const mmr = 0.005;
  return side === 'short' ? entry * (1 + 1 / lev - mmr) : entry * (1 - 1 / lev + mmr);
}

/** 一張合約的現況：現價、持倉價值、浮動損益、距強平、停損觸發會再虧多少（美元） */
export function contractView(c, m) {
  const dir = c.side === 'short' ? -1 : 1;
  const auto = lastOf(findSeries(m, c.sym));
  const manualMark = isNum(c.mark) && c.mark > 0;
  const entry = n(c.entry);
  const mark = manualMark ? c.mark : auto ? auto.v : entry || null;
  const markSrc = manualMark ? '手動' : auto ? `收盤 ${auto.date}` : '用進場價';
  const qty = n(c.qty);
  const lev = n(c.lev) || 1;
  const notional = qty * (mark || 0);
  const margin = qty * entry / lev;
  const pnl = qty * ((mark || 0) - entry) * dir;
  const liqManual = isNum(c.liq) && c.liq > 0;
  const liq = liqManual ? c.liq : (c.cross ? null : estLiq(c.side, entry, lev));
  const liqDist = isNum(liq) && mark ? ((mark - liq) * dir) / mark : null;
  const hasStop = isNum(c.stop) && c.stop > 0;
  const stopBeforeLiq = hasStop && isNum(liq) ? (c.stop - liq) * dir > 0 : null;
  let risk = null;
  if (hasStop && mark) {
    const exit = stopBeforeLiq === false ? liq : c.stop;
    risk = Math.max(0, qty * (mark - exit) * dir);
  }
  return {
    ...c, name: c.name || c.sym || '未命名', dir, entry, mark, markSrc, qty, lev,
    notional, margin, pnl, liq, liqManual, liqDist, hasStop, stopBeforeLiq, risk,
  };
}

/** 整體資產：全部換算成台幣（合約風險另外用美元） */
export function portfolio(state, m) {
  const fx = fxOf(state, m).v;
  const a = state.accounts;
  const R = state.rules;
  const rate = h => (h.mkt === 'us' ? fx : 1);
  const H = state.holdings.map(h => ({ ...h, twdValue: n(h.value) * rate(h), twdCost: n(h.cost) * rate(h) }));
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const pick = (mkt, bucket) => sum(H.filter(h => (h.mkt === 'us') === (mkt === 'us') && h.bucket === bucket), h => h.twdValue);
  const twCore = pick('tw', 'core');
  const twSat = pick('tw', 'sat');
  const usCore = pick('us', 'core');
  const usSat = pick('us', 'sat');
  const contracts = state.contracts.map(c => contractView(c, m));
  const contractEq = n(a.contractEquity) * fx;
  const cash = n(a.cashTwd) + n(a.cashUsd) * fx;
  const core = twCore + usCore;
  const sat = twSat + usSat + contractEq;
  const total = core + sat + cash;
  const efMonths = n(a.monthlyExpense) > 0 ? n(a.emergency) / a.monthlyExpense : null;

  // 單一個股曝險：衛星桶的股票市值＋合約持倉價值（大盤 ETF 不算）
  const ex = new Map();
  const addEx = (sym, name, v, kind) => {
    const k = baseSym(sym) || name || '未命名';
    const e = ex.get(k) || { sym: k, name: name || k, value: 0, parts: [] };
    e.value += v;
    e.parts.push({ kind, v });
    ex.set(k, e);
  };
  H.filter(h => h.bucket === 'sat').forEach(h => addEx(h.sym, h.name, h.twdValue, h.mkt === 'us' ? '美股' : '台股'));
  contracts.forEach(c => addEx(c.sym, c.name, c.notional * fx, `合約 ${c.lev} 倍`));
  const exposures = [...ex.values()]
    .map(e => ({ ...e, ratio: total ? e.value / total : null }))
    .sort((x, y) => y.value - x.value);

  // 產業曝險（合約用持倉價值，所以加起來可能超過 100%）
  const sec = new Map();
  const addSec = (k, v) => { if (v) sec.set(k, (sec.get(k) || 0) + v); };
  addSec('台股大盤 ETF', twCore);
  addSec('美股大盤 ETF', usCore);
  H.filter(h => h.bucket === 'sat').forEach(h => addSec(h.sector || '其他', h.twdValue));
  contracts.forEach(c => addSec(c.sector || '其他', c.notional * fx));
  const sectors = [...sec.entries()]
    .map(([name, value]) => ({ name, value, ratio: total ? value / total : null }))
    .sort((x, y) => y.value - x.value);

  const withCost = H.filter(h => n(h.cost) > 0);
  return {
    fx, twCore, twSat, usCore, usSat, contractEq, cash, core, sat, total, efMonths,
    satR: total ? sat / total : null,
    coreUsR: core ? usCore / core : null,
    exposures,
    sectors,
    contracts,
    noStop: contracts.filter(c => !c.hasStop),
    riskUsedUsd: sum(contracts, c => c.risk || 0),
    riskBudgetUsd: (total * R.riskBudgetPct) / 100 / fx,
    contractCap: (total * R.contractCapPct) / 100,
    pnl: {
      tw: sum(withCost.filter(h => h.mkt !== 'us'), h => n(h.value) - n(h.cost)),
      us: sum(withCost.filter(h => h.mkt === 'us'), h => n(h.value) - n(h.cost)),
      contracts: sum(contracts, c => c.pnl),
    },
  };
}
