const CACHE = 'meteocompare-web-v1.8.0-shell-v2-performance';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './assets/icon.png', './assets/icon-512.png',
  './js/models.js', './js/storage.js', './js/api.js', './js/domain.js', './js/android_strings.js', './js/i18n.js', './js/app.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (/open-meteo\.com$/i.test(url.hostname) || /open-meteo\.com$/i.test(url.hostname.replace(/^www\./,''))) return;
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response && response.ok) {
      const copy=response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(err => event.request.mode === 'navigate' ? caches.match('./index.html') : Promise.reject(err))));
});
