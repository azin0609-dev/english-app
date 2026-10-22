// 統計：連續天數、本週練習時間、正確率趨勢
import { addDays, weekStart } from './util.js';

export function emptyDay() {
  return {
    seconds: 0,
    xp: 0,
    vocab: { right: 0, total: 0 },
    grammar: { right: 0, total: 0 },
    shadowing: { scoreSum: 0, count: 0 },
    planDone: false,
  };
}

export function ensureDay(state, date) {
  if (!state.daily[date]) state.daily[date] = emptyDay();
  return state.daily[date];
}

/** 某天作答了幾題 */
export function answeredCount(day) {
  if (!day) return 0;
  return (day.vocab?.total || 0) + (day.grammar?.total || 0) + (day.shadowing?.count || 0);
}

/** 連續練習天數：今天還沒練就從昨天往回算 */
export function streak(daily, today) {
  let d = answeredCount(daily[today]) > 0 ? today : addDays(today, -1);
  let n = 0;
  while (answeredCount(daily[d]) > 0) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** 本週（週一到今天）練習秒數 */
export function weekSeconds(daily, today) {
  const start = weekStart(today);
  let s = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (d > today) break;
    s += daily[d]?.seconds || 0;
  }
  return s;
}

/** 某天各項正確率，沒練習的項目是 null */
export function dayAccuracy(day) {
  const pct = (num, den) => (den ? Math.round(num / den) : null);
  return {
    vocab: pct((day?.vocab?.right || 0) * 100, day?.vocab?.total || 0),
    grammar: pct((day?.grammar?.right || 0) * 100, day?.grammar?.total || 0),
    shadowing: pct(day?.shadowing?.scoreSum || 0, day?.shadowing?.count || 0),
  };
}

/** 最近 N 天的正確率序列 */
export function trend(daily, today, days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    out.push({ date, ...dayAccuracy(daily[date]) });
  }
  return out;
}

export function totals(daily) {
  let answered = 0;
  let days = 0;
  let seconds = 0;
  for (const day of Object.values(daily)) {
    const n = answeredCount(day);
    answered += n;
    if (n > 0) days++;
    seconds += day.seconds || 0;
  }
  return { answered, days, seconds };
}
