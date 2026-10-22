// 離線功能：有網路時一律拿最新版本（並順便存一份），沒網路時改用存好的那份
// 新增或改名 js / data 檔案時，記得更新下面的 ASSETS 清單與 CACHE 版本號
const CACHE = 'english-app-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/util.js',
  'js/store.js',
  'js/srs.js',
  'js/content.js',
  'js/planner.js',
  'js/stats.js',
  'js/game.js',
  'js/record.js',
  'js/compare.js',
  'js/speech.js',
  'js/avatar.js',
  'js/ui.js',
  'js/chart.js',
  'js/cards/common.js',
  'js/cards/vocab-card.js',
  'js/cards/grammar-card.js',
  'js/cards/shadow-card.js',
  'js/views/home.js',
  'js/views/toeic.js',
  'js/views/vocab.js',
  'js/views/grammar.js',
  'js/views/interview.js',
  'js/views/shadowing.js',
  'js/views/stories.js',
  'js/views/profile.js',
  'js/views/settings.js',
  'js/views/practice.js',
  'data/vocab.json',
  'data/grammar.json',
  'data/shadowing.json',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(ASSETS.map(a => cache.add(a).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(request).then(res => {
      clearTimeout(timer);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      resolve(res);
    }, err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fromNetwork(req).catch(async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') return caches.match('index.html');
      return Response.error();
    }),
  );
});
