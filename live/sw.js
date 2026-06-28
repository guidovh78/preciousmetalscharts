// Minimal service worker for the live. price app.
// Caches the app shell for instant loads + offline; price/history data is always
// fetched fresh from the network (never served stale from cache).
var SHELL = 'pmc-live-shell-v1';
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
  var url = e.request.url;
  // Live data: always network, never cache.
  if (url.indexOf('/prices.json') > -1 || url.indexOf('/history/') > -1) return;
  // App shell: cache-first, fall back to network.
  e.respondWith(caches.match(e.request).then(function (hit) { return hit || fetch(e.request); }));
});
