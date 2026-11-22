/* Offline support: when online, always fetch fresh files (and keep a copy); when offline, use the copy. */
const CACHE = 'bullion-guide-v2';
const CORE = ['./', 'index.html', 'assets/styles.css', 'assets/i18n.js', 'assets/calc.js', 'assets/charts.js', 'assets/app.js', 'assets/icon.svg', 'manifest.webmanifest', 'data/site.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(cc => cc.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
