const CACHE_NAME = 'rvx-builder-v2.1.23';
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './css/base.css',
  './css/morphe.css',
  './css/wizard.css',
  './css/wizard-sources.css',
  './css/tui.css',
  './css/responsive.css',
  './js/state.js',
  './js/api.js',
  './js/ui-morphe.js',
  './js/ui-wizard.js',
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
            console.log('[SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  // Never cache GitHub API or raw CDN
  if (url.hostname.includes('github.com') || url.hostname.includes('githubusercontent.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // On localhost / 127.0.0.1, ALWAYS fetch fresh from server for live update!
  if (isLocalhost) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Production PWA: Network first with cache fallback
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
