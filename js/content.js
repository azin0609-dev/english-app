// 題目內容：讀取 data/*.json，再加上故事庫自動產生的跟讀句
import { hashStr, splitSentencesEn, splitSentencesZh } from './util.js';
import { getState } from './store.js';

export const TYPES = ['vocab', 'grammar', 'shadowing'];
export const TYPE_LABEL = { vocab: '單字', grammar: '文法', shadowing: '跟讀' };
export const TYPE_ICON = { vocab: '🔤', grammar: '✏️', shadowing: '🗣️' };
export const VOCAB_CATEGORY = { business: '商務', security: '企業安全' };
export const SHADOW_TAG = {
  intro: '自我介紹',
  experience: '經歷',
  investigation: '調查',
  teamwork: '團隊合作',
  crisis: '危機處理',
  skills: '專長',
  motivation: '動機',
  values: '價值觀',
  growth: '自我成長',
  closing: '結尾',
};
export const STAR_PARTS = [
  ['situation', 'S', '情境', 'Situation'],
  ['task', 'T', '任務', 'Task'],
  ['action', 'A', '行動', 'Action'],
  ['result', 'R', '結果', 'Result'],
];

let seed = null;

export async function loadContent() {
  if (seed) return seed;
  const load = async (name) => {
    const res = await fetch(`data/${name}.json`);
    if (!res.ok) throw new Error(`無法讀取 data/${name}.json（${res.status}）`);
    return res.json();
  };
  const [vocab, grammar, shadowing] = await Promise.all(TYPES.map(load));
  seed = {
    vocab: vocab.map(x => ({ ...x, type: 'vocab' })),
    grammar: grammar.map(x => ({ ...x, type: 'grammar' })),
    shadowing: shadowing.map(x => ({ ...x, type: 'shadowing', source: 'seed' })),
  };
  return seed;
}

/** 把每個故事的英文拆成句子，變成跟讀題目 */
export function storyItems(stories) {
  const out = [];
  const seen = new Set();
  for (const st of stories || []) {
    for (const [key, , label] of STAR_PARTS) {
      const part = st[key] || {};
      const ens = splitSentencesEn(part.en);
      const zhs = splitSentencesZh(part.zh);
      const paired = ens.length === zhs.length;
      ens.forEach((en, i) => {
        const id = `st-${st.id}-${hashStr(en)}`;
        if (seen.has(id)) return;
        seen.add(id);
        out.push({
          id,
          type: 'shadowing',
          source: 'story',
          storyId: st.id,
          storyTitle: st.title || '未命名故事',
          part: label,
          en,
          zh: paired ? zhs[i] : (part.zh || ''),
          zhIsWhole: !paired && !!part.zh,
        });
      });
    }
  }
  return out;
}

export function itemsOf(type) {
  if (!seed) throw new Error('題目尚未載入');
  if (type === 'shadowing') return [...storyItems(getState().stories), ...seed.shadowing];
  return seed[type];
}

export function allItems() {
  return { vocab: itemsOf('vocab'), grammar: itemsOf('grammar'), shadowing: itemsOf('shadowing') };
}

export function findItem(id) {
  for (const t of TYPES) {
    const found = itemsOf(t).find(x => x.id === id);
    if (found) return found;
  }
  return null;
}
