// 跟讀比對：把你說的話和原句逐字對齊，說對的標綠、說錯或漏掉的標紅，算出正確率

const PRONOUN_IS = new Set(['it', 'that', 'there', 'what', 'he', 'she', 'who', 'where', 'here', 'how', 'this']);
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// 0～99 的數字轉成英文字，讓「10」和「ten」算同一個字
function numberWords(n) {
  if (n < 20) return [ONES[n]];
  if (n < 100) return n % 10 ? [TENS[Math.floor(n / 10)], ONES[n % 10]] : [TENS[n / 10]];
  return [String(n)];
}

// 縮寫展開，讓「I'm」和「I am」算一樣
function expand(w) {
  if (w === "can't" || w === 'cannot') return ['can', 'not'];
  if (w === "won't") return ['will', 'not'];
  if (w === "shan't") return ['shall', 'not'];
  if (w === "let's") return ['let', 'us'];
  if (w.endsWith("n't")) return [w.slice(0, -3), 'not'];
  if (w.endsWith("'re")) return [w.slice(0, -3), 'are'];
  if (w.endsWith("'ve")) return [w.slice(0, -3), 'have'];
  if (w.endsWith("'ll")) return [w.slice(0, -3), 'will'];
  if (w.endsWith("'d")) return [w.slice(0, -2), 'would'];
  if (w.endsWith("'m")) return [w.slice(0, -2), 'am'];
  if (w.endsWith("'s") && PRONOUN_IS.has(w.slice(0, -2))) return [w.slice(0, -2), 'is'];
  return [w];
}

/** 一個字（可能帶標點）→ 比對用的小寫 token */
export function wordTokens(raw) {
  const w = String(raw).toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/e-mail/g, 'email')
    .replace(/%/g, ' percent ')
    .replace(/&/g, ' and ')
    .replace(/\$(\d[\d,]*)/g, '$1 dollars');
  const out = [];
  for (let p of w.split(/[\s\-–—/]+/)) {
    p = p.replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
    if (!p) continue;
    if (p === 'okay') p = 'ok';
    if (/^\d+$/.test(p)) out.push(...numberWords(Number(p)));
    else out.push(...expand(p));
  }
  return out;
}

export function normalizeTokens(text) {
  return String(text || '').split(/\s+/).filter(Boolean).flatMap(wordTokens);
}

/**
 * 比對原句與辨識結果（依順序對齊：最長共同子序列）。
 * 回傳 { score, matched, total, words:[{text, ok}], spoken:[{t, ok}] }
 * words 是原句每個字：ok=true 說對、false 說錯或漏掉、null 是純標點
 */
export function compareSpeech(target, spoken) {
  const display = String(target).trim().split(/\s+/).filter(Boolean);
  const tTok = [];
  display.forEach((raw, wi) => wordTokens(raw).forEach(t => tTok.push({ t, wi })));
  const sTok = normalizeTokens(spoken);
  const n = tTok.length;
  const m = sTok.length;

  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = tTok[i].t === sTok[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const tOk = new Array(n).fill(false);
  const sOk = new Array(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (tTok[i].t === sTok[j]) {
      tOk[i] = true;
      sOk[j] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  const matched = tOk.filter(Boolean).length;
  const words = display.map((text, wi) => {
    const idx = [];
    tTok.forEach((x, k) => { if (x.wi === wi) idx.push(k); });
    return { text, ok: idx.length ? idx.every(k => tOk[k]) : null };
  });
  return {
    score: n ? Math.round((matched / n) * 100) : 0,
    matched,
    total: n,
    words,
    spoken: sTok.map((t, k) => ({ t, ok: sOk[k] })),
  };
}

/** 辨識常給好幾個候選答案，取分數最高的 */
export function bestMatch(target, alternatives) {
  let best = null;
  for (const alt of alternatives.length ? alternatives : ['']) {
    const r = { ...compareSpeech(target, alt), transcript: alt };
    if (!best || r.score > best.score) best = r;
  }
  return best;
}
