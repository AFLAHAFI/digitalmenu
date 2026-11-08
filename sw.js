// Service worker: makes the app installable and quick to open.
// HTML + config: network first (always fresh, cached copy only when offline).
// CSS / JS / icons: served from cache, refreshed in the background.
// Supabase (database) requests are never cached.
const CACHE = 'dm-v3-1';
const SHELL = ['./', 'index.html', 'menu.html', 'waiter.html', 'kitchen.html', 'counter.html', 'admin.html', 'reports.html',
  'css/style.css', 'js/config.js', 'js/common.js', 'js/store.js', 'js/feed.js', 'js/outbox.js', 'js/menu-ui.js',
  'js/cropper.js', 'js/charts.js', 'js/print.js', 'js/vendor/supabase.js', 'js/vendor/qrcode.js', 'img/icon.svg', 'manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;     // never touch Supabase / fonts
  const fresh = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/config.js') || url.pathname.endsWith('/sw.js');
  if (fresh) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((m) => m || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then((cached) => {
    const net = fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});
