// 角色養成：經驗值、等級、職稱、能力值、成就徽章
import { streak, totals } from './stats.js';

// 職涯路線：到達等級就晉升
export const RANKS = [
  { level: 1, title: '見習調查員', en: 'Trainee Investigator' },
  { level: 5, title: '安全專員', en: 'Security Specialist' },
  { level: 10, title: '資安調查員', en: 'Security Investigator' },
  { level: 20, title: '企業安全分析師', en: 'Corporate Security Analyst' },
  { level: 30, title: '企業安全主管', en: 'Corporate Security Manager' },
];

export const XP = {
  right: 10,        // 選擇題答對
  wrong: 3,         // 選擇題答錯（有練就有分）
  shadowHigh: 15,   // 跟讀 ≥ 85%
  shadowMid: 10,    // 跟讀 60～84%
  shadowLow: 5,     // 跟讀 < 60%
  planBonus: 50,    // 完成今日任務（每天一次）
  repeatRatio: 0.2, // 同一題同一天第二次以後只拿 20%
  streakDays: 7,    // 連續 7 天以上……
  streakBonus: 1.2, // ……經驗值 ×1.2
};

/** 升到某等級需要的累積經驗值：Lv2=100、Lv3=250、Lv5=700、Lv10=2700…… */
export function xpToReach(level) {
  const n = level - 1;
  return 100 * n + 25 * n * (n - 1);
}

export function levelInfo(xp) {
  let level = 1;
  while (xp >= xpToReach(level + 1)) level++;
  const base = xpToReach(level);
  const nextAt = xpToReach(level + 1);
  let stage = 0;
  RANKS.forEach((r, i) => { if (level >= r.level) stage = i; });
  return {
    level,
    stage,
    rank: RANKS[stage],
    nextRank: RANKS[stage + 1] || null,
    xp,
    cur: xp - base,
    need: nextAt - base,
    pct: Math.floor(((xp - base) / (nextAt - base)) * 100),
  };
}

export function xpForAnswer({ type, outcome, correct, repeatToday, streakDays }) {
  let xp;
  if (type === 'shadowing') {
    xp = outcome === 'up' ? XP.shadowHigh : outcome === 'keep' ? XP.shadowMid : XP.shadowLow;
  } else {
    xp = correct ? XP.right : XP.wrong;
  }
  if (repeatToday) xp = Math.max(1, Math.round(xp * XP.repeatRatio));
  if (streakDays >= XP.streakDays) xp = Math.round(xp * XP.streakBonus);
  return xp;
}

/**
 * 能力值 0～100：該類題目的平均 level ÷ 5。
 * 只能靠真的學會（level 上升）才會變高，刷題刷不上去。
 * 口說只算句庫與「練過的」故事句，新增故事不會讓分數下降。
 */
export function abilities(items, progress) {
  const calc = list => (list.length
    ? Math.round((list.reduce((s, it) => s + (progress[it.id]?.level || 0), 0) / (list.length * 5)) * 100)
    : 0);
  const speaking = items.shadowing.filter(it => it.source !== 'story' || progress[it.id]);
  return { vocab: calc(items.vocab), grammar: calc(items.grammar), speaking: calc(speaking) };
}

export const BADGES = [
  { id: 'first_answer', icon: '🎯', name: '第一步', desc: '完成第一題練習' },
  { id: 'plan_done', icon: '✅', name: '任務達成', desc: '第一次完成今日任務' },
  { id: 'streak_3', icon: '🔥', name: '三日不輟', desc: '連續練習 3 天' },
  { id: 'streak_7', icon: '📅', name: '一週全勤', desc: '連續練習 7 天' },
  { id: 'streak_30', icon: '🏅', name: '月度全勤', desc: '連續練習 30 天' },
  { id: 'shadow_perfect', icon: '🎙️', name: '字字到位', desc: '跟讀拿到 100%' },
  { id: 'combo_10', icon: '⚡', name: '連對十題', desc: '一輪練習中連續答對 10 題' },
  { id: 'vocab_20', icon: '📚', name: '字彙累積', desc: '20 個單字達到 Lv 3' },
  { id: 'security_10', icon: '🛡️', name: '安全術語', desc: '10 個企業安全單字達到 Lv 2' },
  { id: 'story_first', icon: '📝', name: '說故事的人', desc: '建立第一個 STAR 故事' },
  { id: 'backup_first', icon: '💾', name: '有備無患', desc: '第一次匯出備份' },
  { id: 'xp_1000', icon: '⭐', name: '千分達成', desc: '累積 1,000 XP' },
  { id: 'xp_5000', icon: '🌟', name: '五千里程', desc: '累積 5,000 XP' },
  { id: 'answers_500', icon: '💯', name: '五百題', desc: '累積作答 500 題' },
];

/** 回傳目前「符合條件」的徽章 id（不論是否已取得） */
export function qualifiedBadges(state, { today, items, event = {} }) {
  const p = state.progress;
  const t = totals(state.daily);
  const s = streak(state.daily, today);
  const lv = id => p[id]?.level || 0;
  const ok = new Set();
  if (t.answered >= 1) ok.add('first_answer');
  if (Object.values(state.daily).some(d => d.planDone)) ok.add('plan_done');
  if (s >= 3) ok.add('streak_3');
  if (s >= 7) ok.add('streak_7');
  if (s >= 30) ok.add('streak_30');
  if (event.perfectShadow) ok.add('shadow_perfect');
  if ((event.combo || 0) >= 10) ok.add('combo_10');
  if (items) {
    if (items.vocab.filter(it => lv(it.id) >= 3).length >= 20) ok.add('vocab_20');
    if (items.vocab.filter(it => it.category === 'security' && lv(it.id) >= 2).length >= 10) ok.add('security_10');
  }
  if (state.stories.length >= 1) ok.add('story_first');
  if (state.settings.lastExport) ok.add('backup_first');
  if (state.player.xp >= 1000) ok.add('xp_1000');
  if (state.player.xp >= 5000) ok.add('xp_5000');
  if (t.answered >= 500) ok.add('answers_500');
  return ok;
}

/** 頒發新徽章，回傳這次新拿到的 */
export function awardBadges(state, ctx) {
  const earned = [];
  for (const id of qualifiedBadges(state, ctx)) {
    if (!state.player.badges[id]) {
      state.player.badges[id] = ctx.today;
      earned.push(BADGES.find(b => b.id === id));
    }
  }
  return earned.filter(Boolean);
}
