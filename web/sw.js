const SHELL_CACHE = 'rvx-shell-v2.1.26';
const METADATA_CACHE = 'rvx-metadata-v2';
const ARTIFACT_CACHE = 'rvx-immutable-v1';

const SHELL_ASSETS = [
  './index.html',
  './style.css',
  './css/base.css',
  './css/morphe.css',
  './css/wizard.css',
  './css/wizard-sources.css',
  './css/wizard-selection.css',
  './css/tui.css',
  './css/responsive.css',
  './css/editorial.css',
  './css/editorial-base.css',
  './css/editorial-overlays.css',
  './css/editorial-curation.css',
  './css/editorial-workbench.css',
  './js/runtime.js',
  './js/state.js',
  './js/artifact-store.js',
  './js/local-engine.js',
  './js/api-registry.js',
  './js/api.js',
  './js/ui-patch-options.js',
  './js/ui-storage-consent.js',
  './js/ui-morphe.js',
  './js/ui-wizard-sources.js',
  './js/ui-wizard.js',
  './js/ui-dashboard.js',
  './js/ui-tui.js',
  './workers/rvx-engine-worker.js',
  './app.js',
  './manifest.json',
  './config/sources.json',
  './config/golden-preset.json',
  './registry/v2/index.json',
  './engine/v1/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const allowed = new Set([SHELL_CACHE, METADATA_CACHE, ARTIFACT_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => !allowed.has(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return (await caches.match(request)) || (await caches.match('./index.html'));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(METADATA_CACHE);
  const cached = await cache.match(request);
  const update = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || update || Response.error();
}

async function cacheFirstImmutable(request) {
  const cache = await caches.open(ARTIFACT_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.includes('/artifacts/')) {
    event.respondWith(cacheFirstImmutable(request));
    return;
  }
  if (url.pathname.includes('/registry/v2/') || url.pathname.endsWith('/engine/v1/manifest.json')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
