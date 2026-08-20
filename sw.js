const APP_VERSION = '1.12.1';
const CACHE_VERSION = 'v60-weather-icons-csp-polish';
const CACHE_PREFIX = 'meteocompare-web-';
const CACHE = `${CACHE_PREFIX}${APP_VERSION}-shell-${CACHE_VERSION}`;
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest', './manifest.fr.webmanifest', './manifest.en.webmanifest', './manifest.es.webmanifest', './manifest.de.webmanifest', './manifest.it.webmanifest',
  './assets/icon.png', './assets/icon-512.png',
  './js/version.js', './js/models.js', './js/consensus.js', './js/storage.js', './js/api-budget.js', './js/api.js', './js/domain.js', './js/i18n.js', './js/errors.js', './js/analytics-config.js', './js/analytics.js', './js/core/app-state.js', './js/core/cache-registry.js', './js/core/feature-registry.js', './js/core/local-analysis-store.js', './js/core/application-kernel.js', './js/ui/weather-icons.js', './js/app.js',
  './js/locales/fr.js', './js/locales/en.js', './js/locales/es.js', './js/locales/de.js', './js/locales/it.js',
  './js/features/bias.js', './js/features/evolution.js', './js/features/diagnostics.js', './js/features/comparison.js', './js/features/marine.js', './js/features/model-health.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  // Weather responses have their own freshness/storage rules in the application.
  if(/(^|\.)open-meteo\.com$/i.test(url.hostname))return;
  if(url.origin!==self.location.origin)return;

  if(request.mode==='navigate'){
    // Network-first avoids keeping an old application shell after a GitHub Pages deploy.
    event.respondWith(
      fetch(request)
        .then(response=>{if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));}return response;})
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  const isCode=['script','style','manifest','worker'].includes(request.destination);
  if(isCode){
    // Code is network-first so a deployment never runs one page load with stale JS/CSS.
    event.respondWith(
      fetch(request).then(response=>{
        if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
        return response;
      }).catch(()=>caches.match(request))
    );
    return;
  }

  // Images and other immutable shell assets can be cache-first.
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
    if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  })));
});
