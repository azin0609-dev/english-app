// 語音：朗讀（speechSynthesis）與語音辨識（SpeechRecognition，en-US）
import { getState } from './store.js';

export function ttsSupported() {
  return 'speechSynthesis' in window;
}

export function sttSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// ===== 朗讀 =====

let voicesPromise = null;

function loadVoices() {
  if (!ttsSupported()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  if (!voicesPromise) {
    voicesPromise = new Promise(resolve => {
      const done = () => resolve(speechSynthesis.getVoices());
      speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
  }
  return voicesPromise;
}

export async function englishVoices() {
  const voices = await loadVoices();
  return voices.filter(v => /^en([-_]|$)/i.test(v.lang));
}

// 沒有指定語音時，依序找這些比較自然的美式語音
const PREFERRED = [
  /Google US English/i,
  /Microsoft (Aria|Jenny|Ava|Emma|Guy|Andrew|Brian).*Online/i,
  /Microsoft (Zira|David|Mark)/i,
  /Samantha|Alex/i,
];

export async function pickVoice() {
  const list = await englishVoices();
  const saved = getState().settings.voice;
  if (saved) {
    const v = list.find(x => x.name === saved);
    if (v) return v;
  }
  const us = list.filter(v => /en[-_]US/i.test(v.lang));
  for (const re of PREFERRED) {
    const v = us.find(x => re.test(x.name)) || list.find(x => re.test(x.name));
    if (v) return v;
  }
  return us[0] || list[0] || null;
}

let current = null; // 保留參照，避免 Chrome 提早回收導致朗讀中斷

function speakWith(text, voice, rate) {
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang || 'en-US';
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = () => resolve({ ok: true });
    u.onerror = e => resolve({ ok: false, error: e.error });
    current = u;
    speechSynthesis.speak(u);
  });
}

/** 朗讀英文。rate 不給就用設定裡的速度 */
export async function speak(text, opts = {}) {
  if (!ttsSupported() || !text) return false;
  speechSynthesis.cancel();
  const voice = await pickVoice();
  const rate = opts.rate ?? getState().settings.rate ?? 1;
  const res = await speakWith(text, voice, rate);
  if (!res.ok && res.error !== 'interrupted' && res.error !== 'canceled' && voice && !voice.localService) {
    // 沒網路時線上語音會失敗，改用電腦內建的語音
    const local = (await englishVoices()).find(v => v.localService);
    if (local) return (await speakWith(text, local, rate)).ok;
  }
  return res.ok;
}

export function stopSpeaking() {
  if (ttsSupported()) speechSynthesis.cancel();
  current = null;
}

// ===== 語音辨識 =====

const ERR_MSG = {
  'not-allowed': '麥克風權限被拒絕。請點網址列左邊的圖示，把「麥克風」改成允許，再重新整理頁面。',
  'service-not-allowed': '瀏覽器不允許語音辨識服務，請改用電腦版 Chrome。',
  'audio-capture': '找不到麥克風，請確認麥克風有接好。',
  network: '語音辨識需要網路連線，請確認網路後再試一次。',
  'language-not-supported': '這個瀏覽器不支援英文語音辨識。',
};

export function speechErrorMessage(code) {
  return ERR_MSG[code] || `語音辨識發生錯誤（${code}）。`;
}

/**
 * 開始聽。說完停頓約 3.5 秒會自動結束，也可以呼叫 stop()。
 * 回傳 { promise, stop, abort }；promise 結果是 { transcript, alternatives }
 */
export function listen({ onUpdate, maxMs = 30000, silenceMs = 3500 } = {}) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new Rec();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3;

  const finals = [];
  let interim = '';
  let error = null;
  let silenceTimer = null;
  let maxTimer = null;
  let stopped = false;

  const text = () => [...finals.map(a => a[0]), interim].join(' ').replace(/\s+/g, ' ').trim();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { rec.stop(); } catch { /* 已結束 */ }
  };

  const promise = new Promise((resolve, reject) => {
    rec.onresult = e => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals.push(Array.from(r, a => a.transcript.trim()));
        else interim += r[0].transcript;
      }
      onUpdate?.(text());
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(stop, silenceMs);
    };
    rec.onerror = e => { error = e.error; };
    rec.onend = () => {
      clearTimeout(silenceTimer);
      clearTimeout(maxTimer);
      if (error && error !== 'no-speech' && error !== 'aborted') {
        reject(Object.assign(new Error(speechErrorMessage(error)), { code: error }));
        return;
      }
      const transcript = text();
      const alts = finals.length === 1 ? finals[0].filter(Boolean) : [transcript];
      resolve({ transcript, alternatives: alts.length ? alts : [transcript] });
    };
  });

  maxTimer = setTimeout(stop, maxMs);
  try {
    rec.start();
  } catch (e) {
    error = 'start-failed';
    setTimeout(() => rec.onend(), 0);
  }
  return {
    promise,
    stop,
    abort: () => {
      stopped = true;
      try { rec.abort(); } catch { /* 已結束 */ }
    },
  };
}
