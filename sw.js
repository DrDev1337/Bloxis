/* Bloxis – service worker för offline-stöd. */
var CACHE = 'bloxis-v1';
var ASSETS = [
  '.',
  'index.html',
  'css/style.css',
  'js/shapes.js',
  'js/levels.js',
  'js/game.js',
  'js/main.js',
  'manifest.webmanifest',
  'icons/icon.svg'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET') return;
  ev.respondWith(
    caches.match(ev.request).then(function (hit) {
      return hit || fetch(ev.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(ev.request, copy); });
        return res;
      });
    })
  );
});
