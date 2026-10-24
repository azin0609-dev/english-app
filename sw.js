// 離線功能：有網路時一律拿最新版本（並順便存一份），沒網路時改用存好的那份
// 新增或改名 js / data 檔案時，記得更新下面的 ASSETS 清單與 CACHE 版本號
const CACHE = 'invest-dashboard-v1';
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
  'js/market.js',
  'js/calc.js',
  'js/rules.js',
  'js/journal.js',
  'js/chart.js',
  'js/ui.js',
  'js/views/home.js',
  'js/views/holdings.js',
  'js/views/structure.js',
  'js/views/market.js',
  'js/views/risk.js',
  'js/views/check.js',
  'js/views/plan.js',
  'js/views/journal.js',
  'js/views/settings.js',
  'data/market.json',
  'data/watchlist.json',
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
