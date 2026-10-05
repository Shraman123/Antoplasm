// Morrow Lake service worker: makes the game installable and playable offline.
// Pages: network first (so a new deploy shows up), cached copy when offline.
// Hashed build assets: cache first (their names change when their content does).
// Everything else, incl. Google Fonts: serve the cache, refresh it in the background.
const CACHE = 'morrow-lake-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) caches.open(CACHE).then((c) => c.put(req, res));
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { put('/', res.clone()); return res; })
        .catch(() => caches.match('/')),
    );
    return;
  }
  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { put(req, res.clone()); return res; })));
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => { put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }),
  );
});
