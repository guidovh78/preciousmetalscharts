// Service worker for the live. price app.
// Network-first for the page (so updates always show when online), cache-first for
// static assets (icon/manifest) for instant loads + offline, and network-only for
// price/history data (always fresh). Bump SHELL to force old caches to clear.
var SHELL = 'pmc-live-shell-v2';
var ASSETS = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== SHELL; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = req.url;
  // Live data: always network, never cached.
  if (url.indexOf('/prices.json') > -1 || url.indexOf('/history/') > -1) return;
  // The page itself: network-first so a new deploy shows immediately; fall back to cache offline.
  var accept = (req.headers.get('accept') || '');
  if (req.mode === 'navigate' || accept.indexOf('text/html') > -1) {
    e.respondWith(
      fetch(req).then(function (r) {
        var copy = r.clone();
        caches.open(SHELL).then(function (c) { c.put('/', copy); });
        return r;
      }).catch(function () { return caches.match('/').then(function (m) { return m || caches.match('/index.html'); }); })
    );
    return;
  }
  // Static shell assets: cache-first.
  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});
