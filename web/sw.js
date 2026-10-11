const CACHE_NAME = 'rvx-builder-v2.1.11';
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './css/base.css',
  './css/morphe.css',
  './css/tui.css',
  './css/responsive.css',
  './js/state.js',
  './js/api.js',
  './js/ui-morphe.js',
  './js/ui-tui.js',
  './app.js',
  './manifest.json',
  './config/sources.json',
  './config/golden-preset.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('api.github.com') || event.request.url.includes('raw.githubusercontent.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Always prefer fresh network response, fallback to cache if offline
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200 && event.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
