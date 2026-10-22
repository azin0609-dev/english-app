// 記錄作答：更新複習排程、每日紀錄、經驗值、徽章，並存檔
import { getState, save } from './store.js';
import { todayStr } from './util.js';
import { applyResult } from './srs.js';
import { ensureDay, streak } from './stats.js';
import { xpForAnswer, levelInfo, awardBadges, XP } from './game.js';
import { allItems, findItem } from './content.js';

/**
 * item: 題目；result: { correct } 或 { score }
 * ctx: { fromPlan, combo }
 */
export function recordAnswer(item, result, ctx = {}) {
  const st = getState();
  const today = todayStr();
  const prev = st.progress[item.id];
  const repeatToday = !!prev && prev.lastReview === today;
  const { rec, outcome, early } = applyResult(prev, result, today);
  st.progress[item.id] = rec;

  const day = ensureDay(st, today);
  if (item.type === 'shadowing') {
    day.shadowing.scoreSum += result.score;
    day.shadowing.count += 1;
  } else {
    day[item.type].total += 1;
    if (result.correct) day[item.type].right += 1;
  }

  const before = levelInfo(st.player.xp);
  const xp = xpForAnswer({
    type: item.type,
    outcome,
    correct: !!result.correct,
    repeatToday,
    streakDays: streak(st.daily, today),
  });
  st.player.xp += xp;
  day.xp += xp;

  // 今日任務進度
  let bonus = 0;
  const plan = st.todayPlan;
  if (ctx.fromPlan && plan && plan.date === today) {
    plan.done[item.id] = true;
    // 已刪除的故事句不算在內
    const complete = plan.items.every(x => plan.done[x.id] || !findItem(x.id));
    if (complete && !day.planDone) {
      day.planDone = true;
      bonus = XP.planBonus;
      st.player.xp += bonus;
      day.xp += bonus;
    }
  }

  const badges = awardBadges(st, {
    today,
    items: allItems(),
    event: { perfectShadow: item.type === 'shadowing' && result.score === 100, combo: ctx.combo || 0 },
  });
  save();

  const after = levelInfo(st.player.xp);
  return {
    outcome,
    early,
    rec,
    xp,
    bonus,
    badges,
    levelUp: after.level > before.level ? { ...after, rankUp: after.stage > before.stage } : null,
  };
}

/** 累加練習時間（秒） */
export function addActiveSeconds(sec) {
  if (!sec) return;
  const st = getState();
  ensureDay(st, todayStr()).seconds += sec;
  save();
}

/** 非作答事件（新增故事、匯出備份）後檢查徽章 */
export function checkBadges() {
  const st = getState();
  const badges = awardBadges(st, { today: todayStr(), items: allItems() });
  if (badges.length) save();
  return badges;
}
